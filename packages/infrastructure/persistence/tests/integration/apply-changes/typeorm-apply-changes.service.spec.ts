/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  SOURCE,
  type ApplyChangesResult,
  type ISessionRepository,
  type PlannedMutation,
  type WriteContext,
} from '@arc/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type {DataSource} from 'typeorm';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {
  createDefaultApplyRuleRegistry,
  createDefaultApplyTargetRegistry,
} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-target-registry.js';
import {mapEditActionRow} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/map-edit-action-row.js';
import {TypeOrmApplyChangesService} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-apply-changes.service.js';
import {TypeOrmOperationExecutor} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-operation-executor.js';
import {
  getTestDataSource,
  getTestRepository,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

const FILE_ID = 100;

describe('TypeOrmApplyChangesService', () => {
  let dataSource: DataSource;
  let sessionId: number;
  let writeContext: WriteContext;

  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);

  beforeEach(async () => {
    await setupEachTest();
    dataSource = getTestDataSource();
    await getTestRepository(ProjectSchema).save({
      systemId: 1,
      name: 'P',
      description: '',
      type: 'Offline',
    });
    await getTestRepository(ArcDbFileSchema).save({
      systemId: FILE_ID,
      projectSystemId: 1,
      fileName: 'f.acdb',
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    const session = await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: FILE_ID,
      userId: 'u',
      clientId: 'c',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    sessionId = session.sessionId;
    writeContext = {
      session: {
        sessionId,
        fileSystemId: FILE_ID,
        mode: SESSION_MODE.Designer,
        projectId: '1',
      },
      groupId: 'apply-test',
    };
  });

  function createService(): TypeOrmApplyChangesService {
    return new TypeOrmApplyChangesService(
      writeContext,
      new EditActionsQueryService(dataSource.manager),
      createDefaultApplyRuleRegistry(),
      new TypeOrmOperationExecutor(
        dataSource.manager,
        createDefaultApplyTargetRegistry(),
      ),
      new TypeOrmSessionRepository(dataSource.manager),
    );
  }

  async function insertAction(input: {
    aggregateId: number;
    targetSystemId: number;
    operation: string;
    fieldPath: string | null;
    newValue: Record<string, unknown>;
    changeStatus?: string;
    validUntil?: string | null;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO edit_actions
        (session_id, aggregate_id, target_system_id, target_table, operation,
         field_path, new_value, source, change_status, group_id, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'apply-test', ?)`,
      [
        sessionId,
        input.aggregateId,
        input.targetSystemId,
        ENTITY_NAMES.UseCaseCategory,
        input.operation,
        input.fieldPath,
        JSON.stringify(input.newValue),
        SOURCE.Manual,
        input.changeStatus ?? CHANGE_STATUS.Staged,
        input.validUntil ?? null,
      ],
    );
  }

  it('maps persistence rows without exposing changeId', () => {
    const row = {
      changeId: 99,
      sessionId,
      aggregateId: 10,
      targetSystemId: 20,
      targetTable: ENTITY_NAMES.UseCaseCategory,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'name',
      newValue: {name: 'Updated'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      createdAt: new Date(),
      validUntil: null,
    } satisfies EditActionRow;

    expect(mapEditActionRow(row)).toEqual({
      aggregateId: 10,
      targetType: ENTITY_NAMES.UseCaseCategory,
      targetSystemId: 20,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'name',
      newValue: {name: 'Updated'},
    });
  });

  it('applies only current staged rows and records physical mutation counts', async () => {
    await dataSource.manager
      .getRepository(ENTITY_NAMES.UseCaseCategory)
      .insert({
        systemId: 700,
        name: 'Before',
      });
    await insertAction({
      aggregateId: 70,
      targetSystemId: 700,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'name',
      newValue: {name: 'After'},
    });
    await insertAction({
      aggregateId: 71,
      targetSystemId: 701,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {name: 'Created'},
    });
    await insertAction({
      aggregateId: 72,
      targetSystemId: 702,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {systemId: 702, name: 'Unstaged'},
      changeStatus: CHANGE_STATUS.Unstaged,
    });
    await insertAction({
      aggregateId: 73,
      targetSystemId: 703,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {systemId: 703, name: 'Stale'},
      validUntil: '2026-01-01 00:00:00',
    });

    const result = await createService().apply();

    expect(result).toMatchObject({
      appliedEntityCount: 2,
      appliedAggregateCount: 2,
    });
    expect(result.commitId).toBeGreaterThan(0);
    await expect(
      dataSource.manager
        .getRepository(ENTITY_NAMES.UseCaseCategory)
        .find({order: {systemId: 'ASC'}}),
    ).resolves.toEqual([
      expect.objectContaining({systemId: 700, name: 'After'}),
      expect.objectContaining({systemId: 701, name: 'Created'}),
    ]);
    const actions = await dataSource.query<
      Array<{
        target_system_id: number;
        change_status: string;
        valid_until: string | null;
      }>
    >(
      `SELECT target_system_id, change_status, valid_until
       FROM edit_actions WHERE session_id = ? ORDER BY target_system_id`,
      [sessionId],
    );
    expect(actions).toEqual([
      expect.objectContaining({
        target_system_id: 702,
        change_status: CHANGE_STATUS.Unstaged,
        valid_until: null,
      }),
      expect.objectContaining({
        target_system_id: 703,
        valid_until: '2026-01-01 00:00:00',
      }),
    ]);
  });

  it('records zero mutations and removes create-delete action history eliminated by reduction', async () => {
    await insertAction({
      aggregateId: 80,
      targetSystemId: 800,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {systemId: 800, name: 'Temporary'},
    });
    await insertAction({
      aggregateId: 80,
      targetSystemId: 800,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: null,
      newValue: {},
    });

    await expect(createService().apply()).resolves.toMatchObject({
      appliedEntityCount: 0,
      appliedAggregateCount: 0,
    });
    const actions = await dataSource.query<Array<{change_id: number}>>(
      'SELECT change_id FROM edit_actions WHERE session_id = ?',
      [sessionId],
    );
    expect(actions).toEqual([]);
    await expect(
      dataSource.query(
        'SELECT change_count FROM session_commits WHERE session_id = ?',
        [sessionId],
      ),
    ).resolves.toEqual([{change_count: 0}]);
  });

  it('removes older history for applied slots but keeps unrelated stale history', async () => {
    await dataSource.manager
      .getRepository(ENTITY_NAMES.UseCaseCategory)
      .insert({systemId: 810, name: 'Before'});
    await insertAction({
      aggregateId: 81,
      targetSystemId: 810,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'name',
      newValue: {name: 'Old'},
      validUntil: '2026-01-01 00:00:00',
    });
    await insertAction({
      aggregateId: 81,
      targetSystemId: 810,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'name',
      newValue: {name: 'Current'},
    });
    await insertAction({
      aggregateId: 82,
      targetSystemId: 811,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'name',
      newValue: {name: 'Unrelated history'},
      validUntil: '2026-01-01 00:00:00',
    });

    await createService().apply();

    const rows = await dataSource.query<
      Array<{target_system_id: number; valid_until: string | null}>
    >(
      'SELECT target_system_id, valid_until FROM edit_actions WHERE session_id = ? ORDER BY target_system_id',
      [sessionId],
    );
    expect(rows).toEqual([
      {target_system_id: 811, valid_until: '2026-01-01 00:00:00'},
    ]);
  });

  it('keeps separately staged parent and child deletes in the execution plan', async () => {
    const rows: EditActionRow[] = [
      {
        changeId: 2,
        sessionId,
        aggregateId: 900,
        targetSystemId: 901,
        targetTable: ENTITY_NAMES.ContainerPropertyData,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
        newValue: {},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        groupId: null,
        linkedEntityGroupId: null,
        createdAt: new Date('2026-01-02'),
        validUntil: null,
      },
      {
        changeId: 1,
        sessionId,
        aggregateId: 900,
        targetSystemId: 900,
        targetTable: ENTITY_NAMES.Container,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
        newValue: {},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        groupId: null,
        linkedEntityGroupId: null,
        createdAt: new Date('2026-01-01'),
        validUntil: null,
      },
    ];
    const executed: PlannedMutation[] = [];
    const editActions = {query: jest.fn(async () => rows)};
    const executor = {
      execute: jest.fn(async (mutation: PlannedMutation) => {
        executed.push(mutation);
      }),
    };
    const sessionRepository = {
      recordCommit: jest.fn(async () => 1),
      deleteAppliedActionHistory: jest.fn(async () => 2),
    };
    const service = new TypeOrmApplyChangesService(
      writeContext,
      editActions as never,
      createDefaultApplyRuleRegistry(),
      executor as never,
      sessionRepository as unknown as ISessionRepository,
    );

    const result: ApplyChangesResult = await service.apply();

    expect(executed.map(mutation => mutation.targetType)).toEqual([
      ENTITY_NAMES.ContainerPropertyData,
      ENTITY_NAMES.Container,
    ]);
    expect(result).toEqual({
      commitId: 1,
      appliedEntityCount: 2,
      appliedAggregateCount: 1,
    });
  });
});
