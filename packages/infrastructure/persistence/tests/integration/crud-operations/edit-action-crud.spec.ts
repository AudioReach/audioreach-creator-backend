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
import {Repository} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  EditActionSchema,
  EditActionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
  SESSION_STATUS,
  SESSION_MODE,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

/**
 * Integration tests for EditAction entity (Modification Framework — LLD1 reshaping)
 *
 * LLD1 column changes from the prior schema:
 * - system_id → target_system_id
 * - table_name → target_table
 * - payload (simple-json blob) → field_path + new_value (addressed-slot model)
 * - base_version removed (moved to session_entity_versions side-table)
 * - source added (MANUAL / DIFF_TOOL / AUTO_ROUTING)
 * - cross_entity_group_id added
 *
 * New index set (LLD1 §5.1):
 * - uniq_edit_actions_current on (session_id, target_system_id, field_path) WHERE valid_until IS NULL
 * - idx_edit_actions_agg_active, _table_active, _status_active, _source_active, _xgroup_active
 */
describe('EditAction CRUD Integration Tests', () => {
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
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
      systemId: 1,
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });

    return {fileSystemId: file.systemId};
  }

  async function createSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow> {
    return projectSessionRepository.save({
      fileSystemId,
      userId: 'test-user-123',
      clientId: 'test-client-456',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
  }

  // ---------------------------------------------------------------------------
  describe('Data Insertion — Create operations (accumulator fieldPath)', () => {
    it('should create edit_action for Create operation with accumulator payload', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      // Accumulator mode: fieldPath = null, newValue = full partial-update object
      const savedAction = await editActionRepository.save({
        targetSystemId: 100,
        aggregateId: 10,
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Create,
        fieldPath: null,
        newValue: {alias: 'VolumeControl_Module', instanceId: 1},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      expect(savedAction.changeId).toBeGreaterThan(0);
      expect(savedAction.sessionId).toBe(session.sessionId);
      expect(savedAction.targetSystemId).toBe(100);
      expect(savedAction.aggregateId).toBe(10);
      expect(savedAction.targetTable).toBe(ENTITY_NAMES.SpfModule);
      expect(savedAction.operation).toBe(CHANGE_OPERATION.Create);
      expect(savedAction.changeStatus).toBe(CHANGE_STATUS.Staged);
      expect(savedAction.source).toBe(SOURCE.Manual);
      expect(savedAction.fieldPath).toBeNull();
      expect((savedAction.newValue as {alias: string}).alias).toBe(
        'VolumeControl_Module',
      );
      expect(savedAction.createdAt).toBeInstanceOf(Date);

      const foundAction = await editActionRepository.findOne({
        where: {changeId: savedAction.changeId},
      });
      expect(foundAction).not.toBeNull();
      expect(foundAction?.sessionId).toBe(session.sessionId);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Data Insertion — per-slot field-path operations', () => {
    it('should create edit_action for Update operation with scalar fieldPath', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const savedAction = await editActionRepository.save({
        targetSystemId: 100,
        aggregateId: 0,
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Update,
        fieldPath: 'alias',
        newValue: 'VolumeControl_New',
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      expect(savedAction.operation).toBe(CHANGE_OPERATION.Update);
      expect(savedAction.fieldPath).toBe('alias');
      expect(savedAction.newValue).toBe('VolumeControl_New');
    });

    it('should create edit_action for Delete operation', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const savedAction = await editActionRepository.save({
        targetSystemId: 100,
        aggregateId: 0,
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: '$',
        newValue: null,
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      expect(savedAction.operation).toBe(CHANGE_OPERATION.Delete);
      expect(savedAction.newValue).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Query and ordering', () => {
    it('should maintain action ordering by changeId within a session', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      for (const order of [1, 2, 3]) {
        await editActionRepository.save({
          targetSystemId: 100 + order,
          aggregateId: 0,
          sessionId: session.sessionId,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          fieldPath: null,
          newValue: {order},
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        });
      }

      const orderedActions = await editActionRepository.find({
        where: {sessionId: session.sessionId},
        order: {changeId: 'ASC'},
      });

      expect(orderedActions).toHaveLength(3);
      const values = orderedActions.map(
        a => (a.newValue as {order: number}).order,
      );
      expect(values).toEqual([1, 2, 3]);
    });

    it('should query actions by sessionId and changeStatus', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await editActionRepository.save([
        {
          targetSystemId: 101,
          aggregateId: 0,
          sessionId: session.sessionId,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          fieldPath: null,
          newValue: {s: 1},
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        },
        {
          targetSystemId: 102,
          aggregateId: 0,
          sessionId: session.sessionId,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Update,
          fieldPath: null,
          newValue: {s: 2},
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        },
        {
          targetSystemId: 103,
          aggregateId: 0,
          sessionId: session.sessionId,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Delete,
          fieldPath: '$',
          newValue: null,
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Unstaged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        },
      ]);

      const stagedActions = await editActionRepository.find({
        where: {
          sessionId: session.sessionId,
          changeStatus: CHANGE_STATUS.Staged,
        },
      });

      expect(stagedActions).toHaveLength(2);
      stagedActions.forEach(a =>
        expect(a.changeStatus).toBe(CHANGE_STATUS.Staged),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Foreign key constraints', () => {
    it('should fail when creating action with non-existent session', async () => {
      await expect(
        editActionRepository.save({
          targetSystemId: 100,
          aggregateId: 0,
          sessionId: 99999,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          fieldPath: null,
          newValue: {test: 'orphan'},
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        }),
      ).rejects.toThrow();
    });

    it('should delete actions when session is deleted (cascade)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const savedAction = await editActionRepository.save({
        targetSystemId: 100,
        aggregateId: 0,
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Create,
        fieldPath: null,
        newValue: {test: 'cascade'},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      let action = await editActionRepository.findOne({
        where: {changeId: savedAction.changeId},
      });
      expect(action).not.toBeNull();

      await projectSessionRepository.delete(session.sessionId);

      action = await editActionRepository.findOne({
        where: {changeId: savedAction.changeId},
      });
      expect(action).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Indexes', () => {
    it('should efficiently query by sessionId', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await editActionRepository.save([
        {
          targetSystemId: 101,
          aggregateId: 0,
          sessionId: session.sessionId,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          fieldPath: 'alias',
          newValue: 'a',
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        },
        {
          targetSystemId: 102,
          aggregateId: 0,
          sessionId: session.sessionId,
          targetTable: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Update,
          fieldPath: 'alias',
          newValue: 'b',
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          groupId: null,
          linkedEntityGroupId: null,
          validUntil: null,
        },
      ]);

      const actions = await editActionRepository.find({
        where: {sessionId: session.sessionId},
      });
      expect(actions.length).toBe(2);
    });

    it('should have the LLD1 index set on edit_actions table', async () => {
      const conn = editActionRepository.manager.connection;
      const indexes = await conn.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='edit_actions'`,
      );
      const indexNames = indexes.map((idx: {name: string}) => idx.name);

      // LLD1 §5.1 index set
      expect(indexNames).toContain('uniq_edit_actions_current');
      expect(indexNames).toContain('idx_edit_actions_agg_active');
      expect(indexNames).toContain('idx_edit_actions_table_active');
      expect(indexNames).toContain('idx_edit_actions_status_active');
      expect(indexNames).toContain('idx_edit_actions_source_active');
      expect(indexNames).toContain('idx_edit_actions_xgroup_active');
    });
  });
});
