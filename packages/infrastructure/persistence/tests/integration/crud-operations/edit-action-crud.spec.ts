import {Repository} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {
  EditActionSchema,
  EditActionRow,
  EDIT_OPERATION,
  CHANGE_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit_action.schema.js';
import {
  EditSessionSchema,
  EditSessionRow,
  EDIT_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-session.schema.js';
import {
  ProjectActivitySchema,
  ProjectActivityRow,
  PROJECT_ACTIVITY_TYPE,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-activity.schema.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {generateUuid} from '@arc/core';

/**
 * Integration tests for EditAction entity (Modification Framework)
 * Focus: Data insertion, FK constraints, cascade delete, query operations, and index validation
 */
describe('EditAction CRUD Integration Tests', () => {
  let editActionRepository: Repository<EditActionRow>;
  let editSessionRepository: Repository<EditSessionRow>;
  let projectActivityRepository: Repository<ProjectActivityRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    editSessionRepository =
      getTestRepository<EditSessionRow>(EditSessionSchema);
    projectActivityRepository = getTestRepository<ProjectActivityRow>(
      ProjectActivitySchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  /**
   * Helper function to create required dependencies for edit session
   */
  async function createEditSessionDependencies() {
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

    const activityId = generateUuid();
    await projectActivityRepository.save({
      activityId,
      fileSystemId: file.systemId,
      activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
      endedAt: null,
    });

    return {fileSystemId: file.systemId, modeId: activityId};
  }

  describe('Data Insertion - ADD Operations', () => {
    it('should create edit_action for ADD operation on SpfModule with CKVs (Level_0 and Level_1)', async () => {
      // Arrange - Create dependencies and edit session
      const {fileSystemId, modeId} = await createEditSessionDependencies();

      const sessionId = generateUuid();
      const session: Omit<EditSessionRow, 'createdAt'> = {
        sessionId,
        userId: 'test-user-123',
        clientId: 'test-client-456',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      };
      await editSessionRepository.save(session);

      // Prepare payload for adding Volume Control module with 2 CKVs
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

      const changeId = generateUuid();
      const systemId = generateUuid();
      const action: Omit<EditActionRow, 'createdAt'> = {
        changeId,
        systemId,
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.ADD,
        payload: JSON.stringify(modulePayload),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      };

      // Act
      const savedAction = await editActionRepository.save(action);

      // Assert
      expect(savedAction).toBeDefined();
      expect(savedAction.changeId).toBe(changeId);
      expect(savedAction.sessionId).toBe(sessionId);
      expect(savedAction.tableName).toBe('spf_modules');
      expect(savedAction.operation).toBe(EDIT_OPERATION.ADD);
      expect(savedAction.changeStatus).toBe(CHANGE_STATUS.STAGED);
      expect(savedAction.createdAt).toBeInstanceOf(Date);

      // Verify payload structure
      const parsedPayload = JSON.parse(savedAction.payload);
      expect(parsedPayload.moduleData.alias).toBe('VolumeControl_Module');
      expect(parsedPayload.ckvs).toHaveLength(2);
      expect(parsedPayload.ckvs[0].keyVectorSystemId).toBe(456);
      expect(parsedPayload.ckvs[1].keyVectorSystemId).toBe(457);

      // Verify we can query it back
      const foundAction = await editActionRepository.findOne({
        where: {changeId},
      });
      expect(foundAction).toBeDefined();
      expect(foundAction?.sessionId).toBe(sessionId);
    });
  });

  describe('Data Insertion - UPDATE Operations', () => {
    it('should create edit_action for UPDATE operation on SpfModule', async () => {
      // Arrange
      const {fileSystemId, modeId} = await createEditSessionDependencies();
      const sessionId = generateUuid();
      await editSessionRepository.save({
        sessionId,
        userId: 'test-user',
        clientId: 'test-client',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      });

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

      const action: Omit<EditActionRow, 'createdAt'> = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.UPDATE,
        payload: JSON.stringify(updatePayload),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: 1,
        groupId: null,
        validUntil: null,
      };

      // Act
      const savedAction = await editActionRepository.save(action);

      // Assert
      expect(savedAction.operation).toBe(EDIT_OPERATION.UPDATE);
      expect(savedAction.baseVersion).toBe(1);
      const parsedPayload = JSON.parse(savedAction.payload);
      expect(parsedPayload.changes.alias.after).toBe('VolumeControl_New');
    });
  });

  describe('Data Insertion - DELETE Operations', () => {
    it('should create edit_action for DELETE operation on SpfModule', async () => {
      // Arrange
      const {fileSystemId, modeId} = await createEditSessionDependencies();
      const sessionId = generateUuid();
      await editSessionRepository.save({
        sessionId,
        userId: 'test-user',
        clientId: 'test-client',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      });

      const deletePayload = {
        tableName: 'spf_modules',
        operation: 'DELETE',
        deletedEntity: {
          systemId: 100,
          instanceId: 1,
          alias: 'VolumeControl_ToDelete',
        },
      };

      const action: Omit<EditActionRow, 'createdAt'> = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.DELETE,
        payload: JSON.stringify(deletePayload),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      };

      // Act
      const savedAction = await editActionRepository.save(action);

      // Assert
      expect(savedAction.operation).toBe(EDIT_OPERATION.DELETE);
      const parsedPayload = JSON.parse(savedAction.payload);
      expect(parsedPayload.deletedEntity.alias).toBe('VolumeControl_ToDelete');
    });
  });

  describe('Query and Ordering', () => {
    it('should maintain action ordering by createdAt within a session', async () => {
      // Arrange
      const {fileSystemId, modeId} = await createEditSessionDependencies();
      const sessionId = generateUuid();
      await editSessionRepository.save({
        sessionId,
        userId: 'test-user',
        clientId: 'test-client',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      });

      // Create actions with different timestamps
      const action1: EditActionRow = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.ADD,
        payload: JSON.stringify({order: 1}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        createdAt: new Date(Date.now() - 3000), // 3 seconds ago
        validUntil: null,
      };

      const action2: EditActionRow = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.UPDATE,
        payload: JSON.stringify({order: 2}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        createdAt: new Date(Date.now() - 2000), // 2 seconds ago
        validUntil: null,
      };

      const action3: EditActionRow = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.DELETE,
        payload: JSON.stringify({order: 3}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        createdAt: new Date(Date.now() - 1000), // 1 second ago
        validUntil: null,
      };

      await editActionRepository.save([action1, action2, action3]);

      // Act - Query ordered by createdAt
      const orderedActions = await editActionRepository.find({
        where: {sessionId},
        order: {createdAt: 'ASC'},
      });

      // Assert
      expect(orderedActions).toHaveLength(3);
      const payloads = orderedActions.map(a => JSON.parse(a.payload));
      expect(payloads[0].order).toBe(1);
      expect(payloads[1].order).toBe(2);
      expect(payloads[2].order).toBe(3);
    });

    it('should query actions by sessionId and changeStatus', async () => {
      // Arrange
      const {fileSystemId, modeId} = await createEditSessionDependencies();
      const sessionId = generateUuid();
      await editSessionRepository.save({
        sessionId,
        userId: 'test-user',
        clientId: 'test-client',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      });

      // Create 2 STAGED and 1 UNSTAGED action
      const stagedAction1: Omit<EditActionRow, 'createdAt'> = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.ADD,
        payload: JSON.stringify({status: 'staged1'}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      };

      const stagedAction2: Omit<EditActionRow, 'createdAt'> = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.UPDATE,
        payload: JSON.stringify({status: 'staged2'}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      };

      const unstagedAction: Omit<EditActionRow, 'createdAt'> = {
        changeId: generateUuid(),
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.DELETE,
        payload: JSON.stringify({status: 'unstaged'}),
        changeStatus: CHANGE_STATUS.UNSTAGED,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      };

      await editActionRepository.save([
        stagedAction1,
        stagedAction2,
        unstagedAction,
      ]);

      // Act - Query only STAGED actions
      const stagedActions = await editActionRepository.find({
        where: {
          sessionId,
          changeStatus: CHANGE_STATUS.STAGED,
        },
      });

      // Assert
      expect(stagedActions).toHaveLength(2);
      stagedActions.forEach(action => {
        expect(action.changeStatus).toBe(CHANGE_STATUS.STAGED);
      });
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should fail when creating action with non-existent session (Orphan Check)', async () => {
      // Arrange
      const changeId = generateUuid();
      const systemId = generateUuid();
      const nonExistentSessionId = generateUuid();

      const action: Omit<EditActionRow, 'createdAt'> = {
        changeId,
        systemId,
        sessionId: nonExistentSessionId, // This session does not exist
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.ADD,
        payload: JSON.stringify({test: 'orphan'}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      };

      // Act & Assert
      // TypeORM throws QueryFailedError for FK violations
      await expect(editActionRepository.save(action)).rejects.toThrow();
    });

    it('should delete actions when session is deleted (Cascade Delete)', async () => {
      // Arrange
      const {fileSystemId, modeId} = await createEditSessionDependencies();
      const sessionId = generateUuid();

      // Create session
      await editSessionRepository.save({
        sessionId,
        userId: 'test-user',
        clientId: 'test-client',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      });

      // Create action linked to session
      const changeId = generateUuid();
      await editActionRepository.save({
        changeId,
        systemId: generateUuid(),
        sessionId,
        tableName: 'spf_modules',
        operation: EDIT_OPERATION.ADD,
        payload: JSON.stringify({test: 'cascade'}),
        changeStatus: CHANGE_STATUS.STAGED,
        baseVersion: null,
        groupId: null,
        createdAt: new Date(),
        validUntil: null,
      });

      // Verify action exists
      let action = await editActionRepository.findOne({where: {changeId}});
      expect(action).toBeDefined();

      // Act - Delete session
      await editSessionRepository.delete(sessionId);

      // Assert - Verify action is gone
      action = await editActionRepository.findOne({where: {changeId}});
      expect(action).toBeNull();
    });
  });

  describe('Indexes', () => {
    it('should efficiently query by sessionId using idx_edit_actions_session', async () => {
      // Arrange
      const {fileSystemId, modeId} = await createEditSessionDependencies();
      const sessionId = generateUuid();
      await editSessionRepository.save({
        sessionId,
        userId: 'test-user',
        clientId: 'test-client',
        fileSystemId,
        modeId,
        editStatus: EDIT_STATUS.ACTIVE,
        committedAt: null,
        commitMessage: null,
      });

      // Create multiple actions
      await editActionRepository.save([
        {
          changeId: generateUuid(),
          systemId: generateUuid(),
          sessionId,
          tableName: 'spf_modules',
          operation: EDIT_OPERATION.ADD,
          payload: JSON.stringify({test: 1}),
          changeStatus: CHANGE_STATUS.STAGED,
          baseVersion: null,
          groupId: null,
          createdAt: new Date(),
          validUntil: null,
        },
        {
          changeId: generateUuid(),
          systemId: generateUuid(),
          sessionId,
          tableName: 'spf_modules',
          operation: EDIT_OPERATION.UPDATE,
          payload: JSON.stringify({test: 2}),
          changeStatus: CHANGE_STATUS.STAGED,
          baseVersion: null,
          groupId: null,
          createdAt: new Date(),
          validUntil: null,
        },
      ]);

      // Act - Query by sessionId (should use index)
      const actions = await editActionRepository.find({
        where: {sessionId},
      });

      // Assert
      expect(actions.length).toBe(2);
    });

    it('should have required indexes on edit_actions table', async () => {
      // Query SQLite system tables to verify indexes exist
      const dataSource = editActionRepository.manager.connection;

      const indexes = await dataSource.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='edit_actions'`,
      );

      const indexNames = indexes.map((idx: {name: string}) => idx.name);

      // Assert - Verify expected indexes exist
      expect(indexNames).toContain('idx_edit_actions_session');
      expect(indexNames).toContain('idx_edit_actions_system_id');
      expect(indexNames).toContain('idx_edit_actions_valid');
      expect(indexNames).toContain('idx_edit_actions_status');
    });
  });
});
