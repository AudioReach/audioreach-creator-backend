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

  it('can INSERT and SELECT a row by composite PK', async () => {
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

    await versionRepo.save(
      versionRepo.create({
        sessionId: session.sessionId,
        targetSystemId: 777,
        baseVersion: 5,
      }),
    );

    const found = await versionRepo.findOne({
      where: {sessionId: session.sessionId, targetSystemId: 777},
    });

    expect(found).not.toBeNull();
    expect(found!.baseVersion).toBe(5);
  });

  it('rejects a duplicate (sessionId, targetSystemId) pair — composite PK enforces capture-once', async () => {
    const ds = getTestDataSource();
    const sessionRepo = ds.getRepository(ProjectSessionSchema);

    const fileId = await createFile();
    const session = await sessionRepo.save({
      fileSystemId: fileId,
      clientId: 'cli2',
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
    });

    // First INSERT via raw SQL — must succeed
    await ds.query(
      `INSERT INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [session.sessionId, 888, 3],
    );

    // Second raw SQL INSERT with same PK — must be rejected by the composite PK constraint
    await expect(
      ds.query(
        `INSERT INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
        [session.sessionId, 888, 4],
      ),
    ).rejects.toThrow();
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
        targetSystemId: 999,
        baseVersion: 1,
      }),
    );

    await sessionRepo.delete(session.sessionId);

    const afterDelete = await versionRepo.findOne({
      where: {sessionId: session.sessionId, targetSystemId: 999},
    });
    expect(afterDelete).toBeNull();
  });
});
