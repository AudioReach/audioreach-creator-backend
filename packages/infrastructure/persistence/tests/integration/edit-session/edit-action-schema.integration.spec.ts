/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';

describe('EditActionSchema — integration', () => {
  let nextFileId = 1;

  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextFileId = 1;
  });

  /** Creates a Project + ArcDbFile so project_sessions FK is satisfied. */
  async function createFile(): Promise<number> {
    const ds = getTestDataSource();
    const fid = nextFileId++;
    const pid = fid + 100;
    await ds.getRepository(ProjectSchema).save({
      systemId: pid,
      name: `proj-${fid}`,
      description: '',
      type: 'Offline',
    });
    await ds.getRepository(ArcDbFileSchema).save({
      systemId: fid,
      projectSystemId: pid,
      fileName: `test-${fid}.acdb`,
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    return fid;
  }

  it('has the reshaped columns and can INSERT + SELECT a row', async () => {
    const ds = getTestDataSource();
    const repo = ds.getRepository(EditActionSchema);
    const sessionRepo = ds.getRepository(ProjectSessionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'test-client',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    const row = repo.create({
      targetSystemId: 42,
      aggregateId: 10,
      sessionId: session.sessionId,
      targetTable: 'SpfModule',
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'alias',
      newValue: 'my-module',
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: 'group-uuid-1',
      linkedEntityGroupId: null,
      validUntil: null,
    });

    const saved = await repo.save(row);

    expect(saved.changeId).toBeGreaterThan(0);
    expect(saved.targetSystemId).toBe(42);
    expect(saved.targetTable).toBe('SpfModule');
    expect(saved.fieldPath).toBe('alias');
    expect(saved.newValue).toBe('my-module');
    expect(saved.source).toBe(SOURCE.Manual);
    expect(saved.linkedEntityGroupId).toBeNull();
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('enforces the uniq_edit_actions_current partial unique index', async () => {
    const ds = getTestDataSource();
    const repo = ds.getRepository(EditActionSchema);
    const sessionRepo = ds.getRepository(ProjectSessionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'test-client-2',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    const base = {
      targetSystemId: 99,
      aggregateId: 5,
      sessionId: session.sessionId,
      targetTable: 'SpfModule' as const,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'alias',
      newValue: 'first',
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: 'g1',
      linkedEntityGroupId: null,
      validUntil: null,
    };

    await repo.save(repo.create(base));

    // Second INSERT with same (session_id, target_system_id, field_path) and validUntil IS NULL
    // must be rejected by the unique index.
    await expect(
      repo.save(repo.create({...base, groupId: 'g2'})),
    ).rejects.toThrow();
  });
});
