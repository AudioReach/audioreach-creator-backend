/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
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

  it('round-trips a current row', async () => {
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
      sessionId: session.sessionId,
      aggregateId: 10,
      targetSystemId: 42,
      targetTable: ENTITY_NAMES.SpfModule,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'alias',
      newValue: {alias: 'new-alias'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    const saved = await repo.save(row);

    expect(saved.changeId).toBeGreaterThan(0);
    expect(saved).toEqual(
      expect.objectContaining({
        targetSystemId: 42,
        targetTable: ENTITY_NAMES.SpfModule,
        fieldPath: 'alias',
        newValue: {alias: 'new-alias'},
        source: SOURCE.Manual,
        linkedEntityGroupId: null,
      }),
    );
  });

  it('rejects a duplicate non-null field storage slot', async () => {
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
      sessionId: session.sessionId,
      aggregateId: 5,
      targetSystemId: 99,
      targetTable: ENTITY_NAMES.SpfModule,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'alias',
      newValue: {alias: 'first'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    };

    await repo.save(repo.create(base));

    await expect(repo.save(repo.create(base))).rejects.toThrow();
  });

  it('rejects a second null accumulator for the same target', async () => {
    const ds = getTestDataSource();
    const repo = ds.getRepository(EditActionSchema);
    const sessionRepo = ds.getRepository(ProjectSessionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'test-client-null-slot',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    const base = {
      sessionId: session.sessionId,
      aggregateId: 100,
      targetSystemId: 100,
      targetTable: ENTITY_NAMES.SpfModule,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue: {alias: 'first'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    };

    await repo.save(repo.create(base));
    await expect(repo.save(repo.create(base))).rejects.toThrow();
  });

  it('allows the same targetSystemId in different target tables', async () => {
    const ds = getTestDataSource();
    const repo = ds.getRepository(EditActionSchema);
    const sessionRepo = ds.getRepository(ProjectSessionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'test-client-3',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    const base = {
      sessionId: session.sessionId,
      aggregateId: 100,
      targetSystemId: 100,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: null,
      newValue: {},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    };

    await repo.save(
      repo.create({...base, targetTable: ENTITY_NAMES.SpfModule}),
    );
    await expect(
      repo.save(repo.create({...base, targetTable: ENTITY_NAMES.Container})),
    ).resolves.toBeDefined();
  });
});
