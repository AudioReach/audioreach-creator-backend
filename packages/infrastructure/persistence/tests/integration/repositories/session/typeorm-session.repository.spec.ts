/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {CHANGE_STATUS, SOURCE, CHANGE_OPERATION} from '@arc/core';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

async function seedProjectAndFile(): Promise<{
  projectSystemId: number;
  fileSystemId: number;
}> {
  const projectRepo = getTestRepository(ProjectSchema);
  const fileRepo = getTestRepository(ArcDbFileSchema);

  const project = await projectRepo.save({
    systemId: 1,
    name: 'TestProject',
    description: '',
    type: 'Offline',
  });

  const file = await fileRepo.save({
    systemId: 100,
    projectSystemId: project.systemId,
    fileName: 'test.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });

  return {projectSystemId: project.systemId, fileSystemId: file.systemId};
}

describe('TypeOrmSessionRepository (integration)', () => {
  let ds: DataSource;
  let queryRunner: QueryRunner;
  let repo: TypeOrmSessionRepository;

  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    repo = new TypeOrmSessionRepository(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.release();
  });

  describe('createSession + findActiveSessionByProjectId round-trip', () => {
    it('creates a session and finds it by projectId', async () => {
      const {fileSystemId} = await seedProjectAndFile();

      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: 'user-1',
      });

      expect(typeof sessionId).toBe('number');
      expect(sessionId).toBeGreaterThan(0);

      const session = await repo.findActiveSessionByProjectId('1');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe(sessionId);
      expect(session!.mode).toBe(SESSION_MODE.Designer);
      expect(session!.fileSystemId).toBe(fileSystemId);
    });
  });

  describe('findActiveSessionByProjectId', () => {
    it('returns null when no active session exists', async () => {
      await seedProjectAndFile();
      const session = await repo.findActiveSessionByProjectId('1');
      expect(session).toBeNull();
    });

    it('returns null for an unknown projectId', async () => {
      const session = await repo.findActiveSessionByProjectId('99999');
      expect(session).toBeNull();
    });
  });

  describe('findFileSystemIdByProjectId', () => {
    it('returns the fileSystemId for a known project', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const result = await repo.findFileSystemIdByProjectId('1');
      expect(result).toBe(fileSystemId);
    });

    it('returns null for an unknown projectId', async () => {
      const result = await repo.findFileSystemIdByProjectId('99999');
      expect(result).toBeNull();
    });
  });

  describe('findActiveSessionByFileSystemId', () => {
    it('returns null when no active session exists', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const session = await repo.findActiveSessionByFileSystemId(fileSystemId);
      expect(session).toBeNull();
    });

    it('returns the active session when one exists', async () => {
      const {fileSystemId, projectSystemId} = await seedProjectAndFile();
      await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Tuning,
        userId: null,
      });
      const session = await repo.findActiveSessionByFileSystemId(fileSystemId);
      expect(session).not.toBeNull();
      expect(session!.fileSystemId).toBe(fileSystemId);
      expect(session!.projectId).toBe(String(projectSystemId));
    });
  });

  describe('wipeUnstagedForSession', () => {
    it('deletes only active UNSTAGED rows; leaves STAGED and superseded rows', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });

      // STAGED active row
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
         VALUES (?, 1, 10, 'SpfModule', ?, 'alias', '{}', ?, ?, NULL)`,
        [
          sessionId,
          CHANGE_OPERATION.Update,
          SOURCE.Manual,
          CHANGE_STATUS.Staged,
        ],
      );
      // UNSTAGED active row
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
         VALUES (?, 1, 11, 'SpfModule', ?, 'alias', '{}', ?, ?, NULL)`,
        [
          sessionId,
          CHANGE_OPERATION.Update,
          SOURCE.Manual,
          CHANGE_STATUS.Unstaged,
        ],
      );
      // Superseded UNSTAGED row (valid_until IS NOT NULL) — must NOT be deleted
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, valid_until)
         VALUES (?, 1, 12, 'SpfModule', ?, 'alias', '{}', ?, ?, NULL, datetime('now'))`,
        [
          sessionId,
          CHANGE_OPERATION.Update,
          SOURCE.Manual,
          CHANGE_STATUS.Unstaged,
        ],
      );

      const affected = await repo.wipeUnstagedForSession(sessionId);
      expect(affected).toBe(1); // only the active UNSTAGED row

      const remaining = await ds.query(
        `SELECT change_id, change_status, valid_until FROM edit_actions WHERE session_id = ?`,
        [sessionId],
      );
      expect(remaining).toHaveLength(2); // STAGED active + superseded UNSTAGED
      const statuses = remaining.map(
        (r: {change_status: string}) => r.change_status,
      );
      expect(statuses).toContain(CHANGE_STATUS.Staged);
    });
  });

  describe('deleteEditActionsBySource', () => {
    it('deletes every source-matched row, including history, without affecting other sessions or sources', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });
      await getTestRepository(ArcDbFileSchema).save({
        systemId: 101,
        projectSystemId: 1,
        fileName: 'other.acdb',
        description: '',
        metadata: '{}',
        isTarget: false,
        lastReservedId: 0,
      });
      const otherSessionId = await repo.createSession({
        fileSystemId: 101,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });
      const insertAction = async (
        targetSystemId: number,
        source: string,
        validUntil: string | null = null,
        targetSessionId = sessionId,
      ) => {
        await ds.query(
          `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, valid_until)
           VALUES (?, 1, ?, 'UseCase', ?, NULL, '{}', ?, ?, NULL, ?)`,
          [
            targetSessionId,
            targetSystemId,
            CHANGE_OPERATION.Update,
            source,
            CHANGE_STATUS.Staged,
            validUntil,
          ],
        );
      };

      await insertAction(10, SOURCE.AutoRouting);
      await insertAction(11, SOURCE.AutoRouting, '2026-01-01 00:00:00');
      await insertAction(12, SOURCE.AutoRouting);
      await insertAction(13, SOURCE.Manual);
      await insertAction(14, SOURCE.DiffTool);
      await insertAction(15, SOURCE.AutoRouting, null, otherSessionId);

      await queryRunner.startTransaction();
      expect(
        await repo.deleteEditActionsBySource(sessionId, SOURCE.AutoRouting),
      ).toBe(3);
      await queryRunner.rollbackTransaction();

      expect(
        await repo.deleteEditActionsBySource(sessionId, SOURCE.AutoRouting),
      ).toBe(3);
      const remaining: Array<{session_id: number; source: string}> =
        await ds.query(
          `SELECT session_id, source FROM edit_actions ORDER BY target_system_id`,
        );
      expect(remaining).toEqual([
        {session_id: sessionId, source: SOURCE.Manual},
        {session_id: sessionId, source: SOURCE.DiffTool},
        {session_id: otherSessionId, source: SOURCE.AutoRouting},
      ]);
    });
  });

  describe('countCommitsForSession', () => {
    it('returns 0 before any commits', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });
      expect(await repo.countCommitsForSession(sessionId)).toBe(0);
    });

    it('returns correct count after commit inserts', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });
      await ds.query(
        `INSERT INTO session_commits (session_id, commit_message, change_count) VALUES (?, 'first', 2)`,
        [sessionId],
      );
      await ds.query(
        `INSERT INTO session_commits (session_id, commit_message, change_count) VALUES (?, 'second', 3)`,
        [sessionId],
      );
      expect(await repo.countCommitsForSession(sessionId)).toBe(2);
    });
  });

  describe('deleteSession', () => {
    it('deletes the session row and cascades to edit_actions', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });

      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
         VALUES (?, 1, 20, 'SpfModule', ?, '$', '{}', ?, ?, NULL)`,
        [
          sessionId,
          CHANGE_OPERATION.Create,
          SOURCE.Manual,
          CHANGE_STATUS.Staged,
        ],
      );

      await repo.deleteSession(sessionId);

      const sessions = await ds.query(
        `SELECT session_id FROM project_sessions WHERE session_id = ?`,
        [sessionId],
      );
      expect(sessions).toHaveLength(0);

      const actions = await ds.query(
        `SELECT change_id FROM edit_actions WHERE session_id = ?`,
        [sessionId],
      );
      expect(actions).toHaveLength(0);
    });
  });

  describe('markSessionEnded', () => {
    it('sets status to ENDED and ended_at to non-null', async () => {
      const {fileSystemId} = await seedProjectAndFile();
      const sessionId = await repo.createSession({
        fileSystemId,
        sessionMode: SESSION_MODE.Designer,
        userId: null,
      });

      await repo.markSessionEnded(sessionId);

      const rows = await ds.query(
        `SELECT status, ended_at FROM project_sessions WHERE session_id = ?`,
        [sessionId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe(SESSION_STATUS.Ended);
      expect(rows[0].ended_at).not.toBeNull();
    });
  });
});
