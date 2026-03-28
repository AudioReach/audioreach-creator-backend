/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Repository} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
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
 * Integration tests for EditAction entity (Modification Framework v2)
 * Focus: Data insertion, FK constraints, cascade delete, query operations, and index validation
 *
 * v2 changes from v1:
 * - changeId: auto-generated integer (was UUID string primary key)
 * - systemId: integer (was UUID string)
 * - sessionId: integer FK → project_sessions (was UUID string FK → edit_sessions)
 * - aggregateId: new integer column (default 0)
 * - EDIT_OPERATION / CHANGE_STATUS keys are now PascalCase
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

  /**
   * Create a project + file and return the auto-generated fileSystemId.
   */
  async function createFileDependency(): Promise<{fileSystemId: number}> {
    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });

    const file = await arcDbFileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
    });

    return {fileSystemId: file.systemId};
  }

  /**
   * Create a ProjectSession and return the saved row (with auto-generated sessionId).
   */
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
  describe('Data Insertion - Add Operations', () => {
    it('should create edit_action for Add operation on SpfModule with CKVs (Level_0 and Level_1)', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const modulePayload = {
        tableName: 'spf_modules',
        operation: 'ADD',
        moduleData: {
          systemId: 100,
          instanceId: 1,
          alias: 'VolumeControl_Module',
          subgraphSystemId: 10,
          containerSystemId: 20,
          definitionSystemId: 30,
          fileSystemId: 1,
        },
        ckvs: [
          {
            systemId: 200,
            spfModuleSystemId: 100,
            keyVectorSystemId: 456, // Level_0
            uiPersistence: 'base64_encoded_data_level0',
          },
          {
            systemId: 201,
            spfModuleSystemId: 100,
            keyVectorSystemId: 457, // Level_1
            uiPersistence: 'base64_encoded_data_level1',
          },
        ],
      };

      const action: Omit<EditActionRow, 'changeId' | 'createdAt' | 'session'> =
        {
          systemId: 100,
          aggregateId: 10,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          payload: JSON.stringify(modulePayload),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        };

      // Act
      const savedAction = await editActionRepository.save(action);

      // Assert
      expect(savedAction).toBeDefined();
      expect(typeof savedAction.changeId).toBe('number');
      expect(savedAction.sessionId).toBe(session.sessionId);
      expect(savedAction.systemId).toBe(100);
      expect(savedAction.aggregateId).toBe(10);
      expect(savedAction.tableName).toBe(ENTITY_NAMES.SpfModule);
      expect(savedAction.operation).toBe(CHANGE_OPERATION.Create);
      expect(savedAction.changeStatus).toBe(CHANGE_STATUS.Staged);
      expect(savedAction.createdAt).toBeInstanceOf(Date);

      // Verify payload structure
      const parsedPayload = JSON.parse(savedAction.payload as string);
      expect(parsedPayload.moduleData.alias).toBe('VolumeControl_Module');
      expect(parsedPayload.ckvs).toHaveLength(2);
      expect(parsedPayload.ckvs[0].keyVectorSystemId).toBe(456);
      expect(parsedPayload.ckvs[1].keyVectorSystemId).toBe(457);

      // Verify we can query it back
      const foundAction = await editActionRepository.findOne({
        where: {changeId: savedAction.changeId},
      });
      expect(foundAction).toBeDefined();
      expect(foundAction?.sessionId).toBe(session.sessionId);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Data Insertion - Update Operations', () => {
    it('should create edit_action for Update operation on SpfModule', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const updatePayload = {
        tableName: 'spf_modules',
        operation: 'UPDATE',
        systemId: 100,
        changes: {
          alias: {
            before: 'VolumeControl_Old',
            after: 'VolumeControl_New',
          },
        },
      };

      const action: Omit<EditActionRow, 'changeId' | 'createdAt' | 'session'> =
        {
          systemId: 100,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Update,
          payload: JSON.stringify(updatePayload),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: 1,
          groupId: null,
          validUntil: null,
        };

      // Act
      const savedAction = await editActionRepository.save(action);

      // Assert
      expect(savedAction.operation).toBe(CHANGE_OPERATION.Update);
      expect(savedAction.baseVersion).toBe(1);
      const parsedPayload = JSON.parse(savedAction.payload as string);
      expect(parsedPayload.changes.alias.after).toBe('VolumeControl_New');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Data Insertion - Delete Operations', () => {
    it('should create edit_action for Delete operation on SpfModule', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const deletePayload = {
        tableName: 'spf_modules',
        operation: 'DELETE',
        deletedEntity: {
          systemId: 100,
          instanceId: 1,
          alias: 'VolumeControl_ToDelete',
        },
      };

      const action: Omit<EditActionRow, 'changeId' | 'createdAt' | 'session'> =
        {
          systemId: 100,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Delete,
          payload: JSON.stringify(deletePayload),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        };

      // Act
      const savedAction = await editActionRepository.save(action);

      // Assert
      expect(savedAction.operation).toBe(CHANGE_OPERATION.Delete);
      const parsedPayload = JSON.parse(savedAction.payload as string);
      expect(parsedPayload.deletedEntity.alias).toBe('VolumeControl_ToDelete');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Query and Ordering', () => {
    it('should maintain action ordering by changeId (insertion order) within a session', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      // Insert three actions in sequence — changeId auto-increment guarantees insertion order
      await editActionRepository.save({
        systemId: 101,
        aggregateId: 0,
        sessionId: session.sessionId,
        tableName: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Create,
        payload: JSON.stringify({order: 1}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      });
      await editActionRepository.save({
        systemId: 102,
        aggregateId: 0,
        sessionId: session.sessionId,
        tableName: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Update,
        payload: JSON.stringify({order: 2}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      });
      await editActionRepository.save({
        systemId: 103,
        aggregateId: 0,
        sessionId: session.sessionId,
        tableName: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Delete,
        payload: JSON.stringify({order: 3}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      });

      // Act — order by changeId ASC (auto-increment reflects insertion order)
      const orderedActions = await editActionRepository.find({
        where: {sessionId: session.sessionId},
        order: {changeId: 'ASC'},
      });

      // Assert
      expect(orderedActions).toHaveLength(3);
      const payloads = orderedActions.map(a => JSON.parse(a.payload as string));
      expect(payloads[0].order).toBe(1);
      expect(payloads[1].order).toBe(2);
      expect(payloads[2].order).toBe(3);
    });

    it('should query actions by sessionId and changeStatus', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await editActionRepository.save([
        {
          systemId: 101,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          payload: JSON.stringify({status: 'staged1'}),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        },
        {
          systemId: 102,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Update,
          payload: JSON.stringify({status: 'staged2'}),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        },
        {
          systemId: 103,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Delete,
          payload: JSON.stringify({status: 'unstaged'}),
          changeStatus: CHANGE_STATUS.Unstaged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        },
      ]);

      // Act — query only Staged actions
      const stagedActions = await editActionRepository.find({
        where: {
          sessionId: session.sessionId,
          changeStatus: CHANGE_STATUS.Staged,
        },
      });

      // Assert
      expect(stagedActions).toHaveLength(2);
      stagedActions.forEach(action => {
        expect(action.changeStatus).toBe(CHANGE_STATUS.Staged);
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Foreign Key Constraints', () => {
    it('should fail when creating action with non-existent session (Orphan Check)', async () => {
      // Arrange — integer session ID that does not exist
      const action: Omit<EditActionRow, 'changeId' | 'createdAt' | 'session'> =
        {
          systemId: 100,
          aggregateId: 0,
          sessionId: 99999, // This session does not exist
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          payload: JSON.stringify({test: 'orphan'}),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        };

      // Act & Assert
      await expect(editActionRepository.save(action)).rejects.toThrow();
    });

    it('should delete actions when session is deleted (Cascade Delete)', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const savedAction = await editActionRepository.save({
        systemId: 100,
        aggregateId: 0,
        sessionId: session.sessionId,
        tableName: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Create,
        payload: JSON.stringify({test: 'cascade'}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      });

      // Verify action exists
      let action = await editActionRepository.findOne({
        where: {changeId: savedAction.changeId},
      });
      expect(action).toBeDefined();

      // Act — delete the session (should cascade to edit_actions)
      await projectSessionRepository.delete(session.sessionId);

      // Assert — action is gone
      action = await editActionRepository.findOne({
        where: {changeId: savedAction.changeId},
      });
      expect(action).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Indexes', () => {
    it('should efficiently query by sessionId using idx_edit_actions_session', async () => {
      // Arrange
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await editActionRepository.save([
        {
          systemId: 101,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Create,
          payload: JSON.stringify({test: 1}),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        },
        {
          systemId: 102,
          aggregateId: 0,
          sessionId: session.sessionId,
          tableName: ENTITY_NAMES.SpfModule,
          operation: CHANGE_OPERATION.Update,
          payload: JSON.stringify({test: 2}),
          changeStatus: CHANGE_STATUS.Staged,
          baseVersion: null,
          groupId: null,
          validUntil: null,
        },
      ]);

      // Act — query by sessionId (should use idx_edit_actions_session)
      const actions = await editActionRepository.find({
        where: {sessionId: session.sessionId},
      });

      // Assert
      expect(actions.length).toBe(2);
    });

    it('should have required indexes on edit_actions table', async () => {
      const dataSource = editActionRepository.manager.connection;

      const indexes = await dataSource.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='edit_actions'`,
      );

      const indexNames = indexes.map((idx: {name: string}) => idx.name);

      // Assert — verify all v2 indexes exist
      expect(indexNames).toContain('idx_edit_actions_session');
      expect(indexNames).toContain('idx_edit_actions_entity_active');
      expect(indexNames).toContain('idx_edit_actions_table_active');
      expect(indexNames).toContain('idx_edit_actions_agg_active');
      expect(indexNames).toContain('idx_edit_actions_status_active');
      expect(indexNames).toContain('uniq_edit_actions_current');
    });
  });
});
