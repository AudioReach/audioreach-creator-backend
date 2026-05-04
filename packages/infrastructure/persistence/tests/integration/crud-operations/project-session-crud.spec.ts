/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Integration tests for ProjectSession and SessionCommit entities.
 */

import {Repository} from 'typeorm';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  SessionCommitSchema,
  SessionCommitRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/session-commit.schema.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import type {SessionMode} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';

describe('ProjectSession CRUD Integration Tests', () => {
  let sessionRepository: Repository<ProjectSessionRow>;
  let commitRepository: Repository<SessionCommitRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    sessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    commitRepository = getTestRepository<SessionCommitRow>(SessionCommitSchema);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createFileDependency(): Promise<{fileSystemId: number}> {
    const project = await projectRepository.save({
      systemId: 1,
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file = await arcDbFileRepository.save({
      systemId: 100,
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    return {fileSystemId: file.systemId};
  }

  function baseSession(
    fileSystemId: number,
    mode: SessionMode = SESSION_MODE.Designer,
  ): Omit<ProjectSessionRow, 'sessionId' | 'startedAt'> {
    return {
      fileSystemId,
      userId: 'user-1',
      clientId: 'client-abc',
      sessionMode: mode,
      status: SESSION_STATUS.Active,
      endedAt: null,
    };
  }

  // ---------------------------------------------------------------------------
  describe('Data Insertion', () => {
    it('inserts a Designer session and auto-generates an integer sessionId', async () => {
      const {fileSystemId} = await createFileDependency();

      const saved = await sessionRepository.save(baseSession(fileSystemId));

      expect(typeof saved.sessionId).toBe('number');
      expect(saved.sessionId).toBeGreaterThan(0);
      expect(saved.sessionMode).toBe(SESSION_MODE.Designer);
      expect(saved.status).toBe(SESSION_STATUS.Active);
      expect(saved.startedAt).toBeInstanceOf(Date);
      expect(saved.endedAt).toBeNull();
    });

    it('inserts a DiffMerge session', async () => {
      const {fileSystemId} = await createFileDependency();
      const saved = await sessionRepository.save(
        baseSession(fileSystemId, SESSION_MODE.DiffMerge),
      );
      expect(saved.sessionMode).toBe(SESSION_MODE.DiffMerge);
    });

    it('inserts a Tuning session', async () => {
      const {fileSystemId} = await createFileDependency();
      const saved = await sessionRepository.save(
        baseSession(fileSystemId, SESSION_MODE.Tuning),
      );
      expect(saved.sessionMode).toBe(SESSION_MODE.Tuning);
    });

    it('inserts a DiscoveryWizard session', async () => {
      const {fileSystemId} = await createFileDependency();
      const saved = await sessionRepository.save(
        baseSession(fileSystemId, SESSION_MODE.DiscoveryWizard),
      );
      expect(saved.sessionMode).toBe(SESSION_MODE.DiscoveryWizard);
    });

    it('allows userId to be null', async () => {
      const {fileSystemId} = await createFileDependency();
      const saved = await sessionRepository.save({
        ...baseSession(fileSystemId),
        userId: null,
      });
      expect(saved.userId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Status Management', () => {
    it('queries active sessions by status = ACTIVE', async () => {
      const {fileSystemId} = await createFileDependency();

      await sessionRepository.save(baseSession(fileSystemId)); // active

      // add a 2nd session that is already ended
      await sessionRepository.save({
        ...baseSession(fileSystemId),
        status: SESSION_STATUS.Ended,
        endedAt: new Date(),
      }); // ended

      const active = await sessionRepository.find({
        where: {fileSystemId, status: SESSION_STATUS.Active},
      });
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe(SESSION_STATUS.Active);
    });

    it('ends a session by updating status to ENDED and setting endedAt', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await sessionRepository.save(baseSession(fileSystemId));

      session.status = SESSION_STATUS.Ended;
      session.endedAt = new Date();
      const updated = await sessionRepository.save(session);

      expect(updated.status).toBe(SESSION_STATUS.Ended);
      expect(updated.endedAt).toBeInstanceOf(Date);
    });

    it('rejects a second active session for the same file', async () => {
      // uq_project_sessions_one_active_per_file partial unique index
      // enforces at most one ACTIVE row per file_system_id
      const {fileSystemId} = await createFileDependency();
      await sessionRepository.save(
        baseSession(fileSystemId, SESSION_MODE.Designer),
      );
      await expect(
        sessionRepository.save(baseSession(fileSystemId, SESSION_MODE.Tuning)),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Foreign Key Constraints', () => {
    it('rejects a session with a non-existent fileSystemId', async () => {
      await expect(
        sessionRepository.save({
          ...baseSession(99999),
        }),
      ).rejects.toThrow();
    });

    it('cascade-deletes sessions when the file is deleted', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await sessionRepository.save(baseSession(fileSystemId));

      await arcDbFileRepository.delete(fileSystemId);

      const found = await sessionRepository.findOne({
        where: {sessionId: session.sessionId},
      });
      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('SessionCommit', () => {
    it('inserts a commit linked to a session', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await sessionRepository.save(baseSession(fileSystemId));

      const commit = await commitRepository.save({
        sessionId: session.sessionId,
        commitMessage: 'Initial commit',
        changeCount: 5,
      });

      expect(typeof commit.commitId).toBe('number');
      expect(commit.commitId).toBeGreaterThan(0);
      expect(commit.sessionId).toBe(session.sessionId);
      expect(commit.changeCount).toBe(5);
      expect(commit.committedAt).toBeInstanceOf(Date);
    });

    it('cascade-deletes commits when the session is deleted', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await sessionRepository.save(baseSession(fileSystemId));
      const commit = await commitRepository.save({
        sessionId: session.sessionId,
        commitMessage: 'To be deleted',
        changeCount: 1,
      });

      await sessionRepository.delete(session.sessionId);

      const found = await commitRepository.findOne({
        where: {commitId: commit.commitId},
      });
      expect(found).toBeNull();
    });

    it('rejects a commit with a non-existent sessionId', async () => {
      await expect(
        commitRepository.save({
          sessionId: 99999,
          commitMessage: 'Orphan',
          changeCount: 0,
        }),
      ).rejects.toThrow();
    });

    it('stores multiple commits for the same session in insertion order', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await sessionRepository.save(baseSession(fileSystemId));

      await commitRepository.save({
        sessionId: session.sessionId,
        commitMessage: 'first',
        changeCount: 1,
      });
      await commitRepository.save({
        sessionId: session.sessionId,
        commitMessage: 'second',
        changeCount: 2,
      });
      await commitRepository.save({
        sessionId: session.sessionId,
        commitMessage: 'third',
        changeCount: 3,
      });

      const commits = await commitRepository.find({
        where: {sessionId: session.sessionId},
        order: {commitId: 'ASC'},
      });
      expect(commits).toHaveLength(3);
      expect(commits.map(c => c.commitMessage)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Indexes', () => {
    it('has idx_project_sessions_file on project_sessions', async () => {
      const ds = getTestDataSource();
      const indexes = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='project_sessions'`,
      );
      const names = indexes.map((i: {name: string}) => i.name);
      expect(names).toContain('idx_project_sessions_file');
    });

    it('has idx_project_sessions_status on project_sessions', async () => {
      const ds = getTestDataSource();
      const indexes = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='project_sessions'`,
      );
      const names = indexes.map((i: {name: string}) => i.name);
      expect(names).toContain('idx_project_sessions_status');
    });

    it('has idx_session_commits_session on session_commits', async () => {
      const ds = getTestDataSource();
      const indexes = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='session_commits'`,
      );
      const names = indexes.map((i: {name: string}) => i.name);
      expect(names).toContain('idx_session_commits_session');
    });
  });
});
