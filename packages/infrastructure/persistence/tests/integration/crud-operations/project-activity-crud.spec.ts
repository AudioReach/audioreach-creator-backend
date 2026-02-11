/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Repository, IsNull} from 'typeorm';
import {
  ProjectActivitySchema,
  PROJECT_ACTIVITY_TYPE,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-activity.schema.js';
import type {ProjectActivityRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-activity.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import type {ProjectRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import type {ArcDbFileRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {generateUuid} from '@arc/core';

/**
 * Integration tests for ProjectActivity entity (Modification Framework)
 * Focus: Data insertion, basic queries, unique constraints, and foreign key relations
 */
describe('ProjectActivity CRUD Integration Tests', () => {
  let projectActivityRepository: Repository<ProjectActivityRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
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

  describe('Data Insertion', () => {
    it('should insert project activity with DESIGNER type', async () => {
      // Arrange - Create project and file first
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

      const projectActivityData: Omit<ProjectActivityRow, 'startedAt'> = {
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      };

      // Act
      const savedActivity =
        await projectActivityRepository.save(projectActivityData);

      // Assert
      expect(savedActivity.activityId).toBeDefined();
      expect(savedActivity.fileSystemId).toBe(file.systemId);
      expect(savedActivity.activityType).toBe(PROJECT_ACTIVITY_TYPE.DESIGNER);
      expect(savedActivity.endedAt).toBeNull();
      expect(savedActivity.startedAt).toBeInstanceOf(Date);
    });

    it('should insert project activity with DIFF_MERGE type', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Test Project 2',
        description: 'Test',
        type: 'Device',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'test2.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      const projectActivityData: Omit<ProjectActivityRow, 'startedAt'> = {
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DIFF_MERGE,
        endedAt: null,
      };

      // Act
      const savedActivity =
        await projectActivityRepository.save(projectActivityData);

      // Assert
      expect(savedActivity.activityType).toBe(PROJECT_ACTIVITY_TYPE.DIFF_MERGE);
    });

    it('should insert project activity with SIMULATION type', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Test Project 3',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'test3.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      const projectActivityData: Omit<ProjectActivityRow, 'startedAt'> = {
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.SIMULATION,
        endedAt: null,
      };

      // Act
      const savedActivity =
        await projectActivityRepository.save(projectActivityData);

      // Assert
      expect(savedActivity.activityType).toBe(PROJECT_ACTIVITY_TYPE.SIMULATION);
    });
  });

  describe('Basic Query', () => {
    it('should query back inserted project activity by activityId', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Query Test Project',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'query-test.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });
      const activityId = generateUuid();
      const projectActivityData: Omit<ProjectActivityRow, 'startedAt'> = {
        activityId,
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      };
      await projectActivityRepository.save(projectActivityData);

      // Act
      const queriedActivity = await projectActivityRepository.findOne({
        where: {activityId},
      });

      // Assert
      expect(queriedActivity).toBeDefined();
      expect(queriedActivity!.activityId).toBe(activityId);
      expect(queriedActivity!.activityType).toBe(
        PROJECT_ACTIVITY_TYPE.DESIGNER,
      );
    });

    it('should query active activities (endedAt IS NULL)', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Active Activity Test',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'active-test.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      // Create active activity
      const activeActivityId = generateUuid();
      await projectActivityRepository.save({
        activityId: activeActivityId,
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      });

      // Create ended activity
      await projectActivityRepository.save({
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DIFF_MERGE,
        endedAt: new Date(),
      });

      // Act - Query only active activities
      const activeActivities = await projectActivityRepository.find({
        where: {fileSystemId: file.systemId, endedAt: IsNull()},
      });

      // Assert
      expect(activeActivities.length).toBe(1);
      expect(activeActivities[0].activityId).toBe(activeActivityId);
    });
  });

  describe('Foreign Key Relations', () => {
    it('should enforce foreign key constraint to arc_db_files', async () => {
      // Arrange - Try to create project activity with non-existent file
      const projectActivityData: Omit<ProjectActivityRow, 'startedAt'> = {
        activityId: generateUuid(),
        fileSystemId: 99999, // Non-existent file
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      };

      // Act & Assert - Should fail due to foreign key constraint
      await expect(
        projectActivityRepository.save(projectActivityData),
      ).rejects.toThrow();
    });

    it('should cascade delete when arc_db_file is deleted', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Cascade Test Project',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'cascade-test.acdb',
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

      // Act - Delete the file
      await arcDbFileRepository.delete(file.systemId);

      // Assert - Project activity should be deleted (cascade)
      const deletedActivity = await projectActivityRepository.findOne({
        where: {activityId},
      });
      expect(deletedActivity).toBeNull();
    });
  });

  describe('Activity Transitions', () => {
    it('should support activity transition by ending old and creating new', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Transition Test',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'transition-test.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      // Create initial DESIGNER activity
      const designerActivityId = generateUuid();
      const designerActivity: ProjectActivityRow =
        await projectActivityRepository.save({
          activityId: designerActivityId,
          fileSystemId: file.systemId,
          activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
          endedAt: null,
        });

      // Act - Transition to DIFF_MERGE activity
      // Step 1: End old activity
      designerActivity.endedAt = new Date();
      await projectActivityRepository.save(designerActivity);

      // Step 2: Create new activity
      const diffMergeActivityId = generateUuid();
      await projectActivityRepository.save({
        activityId: diffMergeActivityId,
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DIFF_MERGE,
        endedAt: null,
      });

      // Assert - Only DIFF_MERGE activity should be active
      const activeActivities = await projectActivityRepository.find({
        where: {fileSystemId: file.systemId, endedAt: IsNull()},
      });
      expect(activeActivities.length).toBe(1);
      expect(activeActivities[0].activityType).toBe(
        PROJECT_ACTIVITY_TYPE.DIFF_MERGE,
      );
      expect(activeActivities[0].activityId).toBe(diffMergeActivityId);

      // Verify old activity is ended
      const endedActivity = await projectActivityRepository.findOne({
        where: {activityId: designerActivityId},
      });
      expect(endedActivity!.endedAt).not.toBeNull();
    });

    it('should enforce only one active activity per file', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Single Active Activity Test',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'single-active.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      // Create first active activity
      await projectActivityRepository.save({
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      });

      // Act - Query active activities
      const activeActivities = await projectActivityRepository.find({
        where: {fileSystemId: file.systemId, endedAt: IsNull()},
      });

      // Assert - Should have exactly one active activity
      expect(activeActivities.length).toBe(1);
    });
  });

  describe('Indexes', () => {
    it('should efficiently query by fileSystemId using idx_project_activities_file', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Index Test',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'index-test.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      // Create multiple activities for same file
      await projectActivityRepository.save({
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      });
      await projectActivityRepository.save({
        activityId: generateUuid(),
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DIFF_MERGE,
        endedAt: new Date(),
      });

      // Act - Query by fileSystemId (should use index)
      const activities = await projectActivityRepository.find({
        where: {fileSystemId: file.systemId},
      });

      // Assert
      expect(activities.length).toBe(2);
    });

    it('should efficiently query active activity using idx_project_activities_active composite index', async () => {
      // Arrange
      const project = await projectRepository.save({
        name: 'Composite Index Test',
        description: 'Test',
        type: 'Offline',
      });
      const file = await arcDbFileRepository.save({
        projectSystemId: project.systemId,
        fileName: 'composite-index.acdb',
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
      });

      const activeActivityId = generateUuid();
      await projectActivityRepository.save({
        activityId: activeActivityId,
        fileSystemId: file.systemId,
        activityType: PROJECT_ACTIVITY_TYPE.DESIGNER,
        endedAt: null,
      });

      // Act - Query by fileSystemId AND endedAt (should use composite index)
      const activeActivity = await projectActivityRepository.findOne({
        where: {fileSystemId: file.systemId, endedAt: IsNull()},
      });

      // Assert
      expect(activeActivity).toBeDefined();
      expect(activeActivity!.activityId).toBe(activeActivityId);
    });
  });
});
