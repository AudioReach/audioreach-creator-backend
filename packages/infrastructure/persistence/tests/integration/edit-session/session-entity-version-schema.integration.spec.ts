/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {SessionEntityVersionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/session-entity-version.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';

describe('SessionEntityVersionSchema — integration', () => {
  let nextFileId = 200;

  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextFileId = 200;
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

  it('allows the same numeric target ID in different tables', async () => {
    const ds = getTestDataSource();
    const sessionRepo = ds.getRepository(ProjectSessionSchema);
    const versionRepo = ds.getRepository(SessionEntityVersionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'cli',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    await versionRepo.save({
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.SpfModule,
      targetSystemId: 10,
      baseVersion: 2,
    });
    await expect(
      versionRepo.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.Container,
        targetSystemId: 10,
        baseVersion: 3,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a duplicate complete target key', async () => {
    const ds = getTestDataSource();
    const sessionRepo = ds.getRepository(ProjectSessionSchema);
    const versionRepo = ds.getRepository(SessionEntityVersionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'cli2',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    const row = {
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.SpfModule,
      targetSystemId: 10,
      baseVersion: 2,
    };
    // Use INSERT rather than save so TypeORM cannot treat the duplicate key as
    // an update and silently bypass the capture-once constraint.
    await versionRepo.insert(row);
    await expect(versionRepo.insert(row)).rejects.toThrow();
  });

  it('cascades DELETE when parent session is deleted', async () => {
    const ds = getTestDataSource();
    const sessionRepo = ds.getRepository(ProjectSessionSchema);
    const versionRepo = ds.getRepository(SessionEntityVersionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'cli3',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    await versionRepo.save(
      versionRepo.create({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 999,
        baseVersion: 1,
      }),
    );

    await sessionRepo.delete(session.sessionId);

    const afterDelete = await versionRepo.findOne({
      where: {
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 999,
      },
    });
    expect(afterDelete).toBeNull();
  });
});
