/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {SOURCE, CHANGE_STATUS, CHANGE_OPERATION} from '@arc/core';
import {
  ProjectSessionSchema,
  type ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/overlay-merge.js';
import {FieldPathReducer} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/field-path-reducer.js';
import {PENDING_CHANGE_STATUS} from '@arc/core';

/**
 * Integration test: full staging + query + overlay cycle.
 *
 * Exercises all three layers with real in-memory SQLite:
 *   1. Insert a committed row directly via raw SQL fixture.
 *   2. Insert a pending-change row directly (bypassing PendingChangeWriter to keep
 *      the test focused on the query + overlay layers, not the write path).
 *   3. Query rows back via EditActionsQueryService.getByAggregateId.
 *   4. Apply them through OverlayMergeImpl.applyToSingle.
 */
describe('Staging + overlay cycle — integration', () => {
  let queryService: EditActionsQueryService;
  let overlayMerge: OverlayMergeImpl;

  beforeAll(async () => {
    await setupIntegrationTest();
    const ds = getTestDataSource();
    queryService = new EditActionsQueryService(ds.manager);
    overlayMerge = new OverlayMergeImpl(new FieldPathReducer());
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createSessionFixture(): Promise<{sessionId: number}> {
    const projectRepo = getTestRepository(ProjectSchema);
    const fileRepo = getTestRepository(ArcDbFileSchema);
    const sessionRepo =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);

    const project = await projectRepo.save({
      systemId: 1,
      name: 'Overlay Test Project',
      description: '',
      type: 'Offline',
    });
    const file = await fileRepo.save({
      systemId: 1,
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    const session = await sessionRepo.save({
      fileSystemId: file.systemId,
      userId: 'u1',
      clientId: 'c1',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    return {sessionId: session.sessionId};
  }

  it('UPDATE delta: pending row is queryable and overlay merges the change', async () => {
    const {sessionId} = await createSessionFixture();
    const moduleSystemId = 10;
    const aggregateId = 10;
    const ds = getTestDataSource();

    // 1. Insert a committed KeyDefinition row as the base (simpler schema than SpfModule)
    // We use key_definitions since it has a simple schema with a name column
    await ds.query(
      `INSERT INTO arc_keys (system_id, file_system_id, key_id, name) VALUES (?, ?, ?, ?)`,
      [moduleSystemId, 1, 100, 'OriginalName'],
    );
    const committedRow = {
      systemId: moduleSystemId,
      name: 'OriginalName',
      fileSystemId: 1,
      keyId: 100,
    };

    // 2. Insert a pending UPDATE row directly into edit_actions
    await ds.query(
      `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, linked_entity_group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        aggregateId,
        moduleSystemId,
        ENTITY_NAMES.KeyDefinition,
        CHANGE_OPERATION.Update,
        null,
        JSON.stringify({name: 'RenamedKey'}),
        SOURCE.Manual,
        CHANGE_STATUS.Staged,
        'grp-test',
        null,
      ],
    );

    // 3. Fetch active pending rows via getByAggregateId
    const pendingRows = await queryService.getByAggregateId(
      sessionId,
      aggregateId,
    );
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].targetSystemId).toBe(moduleSystemId);

    // 4. Run overlay merge
    const result = overlayMerge.applyToSingle(committedRow, pendingRows);

    // 5. Assert merged result
    expect(result).not.toBeNull();
    expect((result!.effective as any).name).toBe('RenamedKey');
    expect(result!.diffEntries).toHaveLength(1);
    expect(result!.diffEntries[0].fieldName).toBe('name');
    expect(result!.diffEntries[0].oldValue).toBe('OriginalName');
    expect(result!.pendingChangeStatus).toBe(PENDING_CHANGE_STATUS.Staged);
    expect(result!.operation).toBe(CHANGE_OPERATION.Update);
  });

  it('DELETE delta: overlay returns null for a staged DELETE', async () => {
    const {sessionId} = await createSessionFixture();
    const targetSystemId = 20;
    const aggregateId = 20;
    const ds = getTestDataSource();

    await ds.query(
      `INSERT INTO arc_keys (system_id, file_system_id, key_id, name) VALUES (?, ?, ?, ?)`,
      [targetSystemId, 1, 200, 'ToBeDeleted'],
    );
    const committedRow = {systemId: targetSystemId, name: 'ToBeDeleted'};

    await ds.query(
      `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, linked_entity_group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        aggregateId,
        targetSystemId,
        ENTITY_NAMES.KeyDefinition,
        CHANGE_OPERATION.Delete,
        null,
        '{}',
        SOURCE.Manual,
        CHANGE_STATUS.Staged,
        'grp-delete',
        null,
      ],
    );

    const pendingRows = await queryService.getByAggregateId(
      sessionId,
      aggregateId,
    );
    expect(pendingRows).toHaveLength(1);

    const result = overlayMerge.applyToSingle(committedRow, pendingRows);
    expect(result).toBeNull();
  });
});
