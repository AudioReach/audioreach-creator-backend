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
import type {Repository} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {
  ProjectSessionSchema,
  type ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  SessionEntityVersionSchema,
  type SessionEntityVersionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/session-entity-version.schema.js';

/**
 * Integration test: INSERT-IGNORE capture-once semantics on session_entity_versions.
 * REQ-EA-11 / REQ-EA-13 / I3.
 */
describe('baseVersion capture-once — integration', () => {
  let sessionRepo: Repository<ProjectSessionRow>;
  let versionRepo: Repository<SessionEntityVersionRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    sessionRepo = getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    versionRepo = getTestRepository<SessionEntityVersionRow>(
      SessionEntityVersionSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createSessionFixture(): Promise<number> {
    const projectRepo = getTestRepository(ProjectSchema);
    const fileRepo = getTestRepository(ArcDbFileSchema);
    const project = await projectRepo.save({
      systemId: 1,
      name: 'Version Capture Test',
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
    return session.sessionId;
  }

  it('first write inserts one row into session_entity_versions', async () => {
    const sessionId = await createSessionFixture();
    const ds = getTestDataSource();
    await ds.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [sessionId, 42, 7],
    );
    const rows = await versionRepo.find({
      where: {sessionId, targetSystemId: 42},
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].baseVersion).toBe(7);
  });

  it('second write for the same entity is silently ignored — first capture wins', async () => {
    const sessionId = await createSessionFixture();
    const ds = getTestDataSource();
    await ds.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [sessionId, 42, 7],
    );
    await ds.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [sessionId, 42, 99],
    );
    const rows = await versionRepo.find({
      where: {sessionId, targetSystemId: 42},
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].baseVersion).toBe(7);
  });

  it('different entities in the same session each get their own row', async () => {
    const sessionId = await createSessionFixture();
    const ds = getTestDataSource();
    await ds.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [sessionId, 10, 1],
    );
    await ds.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [sessionId, 20, 2],
    );
    const all = await versionRepo.find({where: {sessionId}});
    expect(all).toHaveLength(2);
    const byId = Object.fromEntries(
      all.map(r => [r.targetSystemId, r.baseVersion]),
    );
    expect(byId[10]).toBe(1);
    expect(byId[20]).toBe(2);
  });

  it('cascade-deletes version rows when the session is deleted', async () => {
    const sessionId = await createSessionFixture();
    const ds = getTestDataSource();
    await ds.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES (?, ?, ?)`,
      [sessionId, 10, 3],
    );
    await sessionRepo.delete(sessionId);
    const rows = await versionRepo.find({where: {sessionId}});
    expect(rows).toHaveLength(0);
  });
});
