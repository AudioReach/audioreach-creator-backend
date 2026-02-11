/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Repository} from 'typeorm';
import {
  ProjectRow,
  ProjectSchema,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileRow,
  ArcDbFileSchema,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {EntityRowForInsert} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-base.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
} from '../helpers/test-database-setup.js';

/**
 * Integration tests for Project entity
 * Focus: Data insertion, basic queries, unique constraints, and relations
 */
describe('Project CRUD Integration Tests', () => {
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
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
    it('should insert project with Offline type', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Offline Project',
        description: 'Test offline project',
        type: 'Offline',
      };

      // Act
      const savedProject = await projectRepository.save(projectData);

      // Assert
      expect(savedProject.systemId).toBeDefined();
      expect(savedProject.name).toBe('Offline Project');
      expect(savedProject.type).toBe('Offline');
      expect(savedProject.version).toBe(1);
      expect(savedProject.creationDate).toBeInstanceOf(Date);
      expect(savedProject.updateDate).toBeInstanceOf(Date);
    });

    it('should insert project with Device type', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Device Project',
        description: 'Test device project',
        type: 'Device',
      };

      // Act
      const savedProject = await projectRepository.save(projectData);

      // Assert
      expect(savedProject.systemId).toBeDefined();
      expect(savedProject.name).toBe('Device Project');
      expect(savedProject.type).toBe('Device');
      expect(savedProject.version).toBe(1);
    });

    it('should auto-generate systemId, creationDate, updateDate, and version', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Auto Fields Test',
        description: 'Testing auto-generated fields',
        type: 'Offline',
      };

      // Act
      const savedProject = await projectRepository.save(projectData);

      // Assert - All auto-managed fields should be set
      expect(savedProject.systemId).toBeGreaterThan(0);
      expect(savedProject.creationDate).toBeInstanceOf(Date);
      expect(savedProject.updateDate).toBeInstanceOf(Date);
      expect(savedProject.version).toBe(1);
    });
  });

  describe('Basic Query', () => {
    it('should query back inserted project by systemId', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Query Test Project',
        description: 'Project for query testing',
        type: 'Offline',
      };
      const savedProject = await projectRepository.save(projectData);

      // Act
      const queriedProject = await projectRepository.findOne({
        where: {systemId: savedProject.systemId},
      });

      // Assert
      expect(queriedProject).toBeDefined();
      expect(queriedProject!.systemId).toBe(savedProject.systemId);
      expect(queriedProject!.name).toBe('Query Test Project');
      expect(queriedProject!.description).toBe('Project for query testing');
      expect(queriedProject!.type).toBe('Offline');
    });

    it('should query back inserted project by name', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Unique Name Project',
        description: 'Testing name query',
        type: 'Device',
      };
      await projectRepository.save(projectData);

      // Act
      const queriedProject = await projectRepository.findOne({
        where: {name: 'Unique Name Project'},
      });

      // Assert
      expect(queriedProject).toBeDefined();
      expect(queriedProject!.name).toBe('Unique Name Project');
    });
  });

  describe('Unique Index on Name', () => {
    it('should enforce unique constraint on project name', async () => {
      // Arrange
      const projectData1: EntityRowForInsert<ProjectRow> = {
        name: 'Duplicate Name',
        description: 'First project',
        type: 'Offline',
      };
      const projectData2: EntityRowForInsert<ProjectRow> = {
        name: 'Duplicate Name',
        description: 'Second project with same name',
        type: 'Device',
      };

      // Act
      await projectRepository.save(projectData1);

      // Assert - Second insert with same name should fail
      await expect(projectRepository.save(projectData2)).rejects.toThrow();
    });

    it('should allow different projects with different names', async () => {
      // Arrange
      const projectData1: EntityRowForInsert<ProjectRow> = {
        name: 'Project One',
        description: 'First project',
        type: 'Offline',
      };
      const projectData2: EntityRowForInsert<ProjectRow> = {
        name: 'Project Two',
        description: 'Second project',
        type: 'Device',
      };

      // Act
      const project1 = await projectRepository.save(projectData1);
      const project2 = await projectRepository.save(projectData2);

      // Assert
      expect(project1.systemId).not.toBe(project2.systemId);
      expect(project1.name).toBe('Project One');
      expect(project2.name).toBe('Project Two');
    });
  });

  describe('Relations with ArcDbFile', () => {
    it('should establish one-to-many relationship with ArcDbFile', async () => {
      // Arrange - Create project
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Project with Files',
        description: 'Testing file relations',
        type: 'Offline',
      };
      const savedProject = await projectRepository.save(projectData);

      // Create ArcDbFile linked to project
      const fileData: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: savedProject.systemId,
        fileName: 'test.acdb',
        description: 'Test ACDB file',
        metadata: '{"version": "1.0"}',
        isTarget: false,
      };
      await arcDbFileRepository.save(fileData);

      // Act - Query project with files relation
      const projectWithFiles = await projectRepository.findOne({
        where: {systemId: savedProject.systemId},
        relations: ['files'],
      });

      // Assert
      expect(projectWithFiles).toBeDefined();
      expect(projectWithFiles!.files).toBeDefined();
      expect(projectWithFiles!.files!.length).toBe(1);
      expect(projectWithFiles!.files![0].fileName).toBe('test.acdb');
      expect(projectWithFiles!.files![0].description).toBe('Test ACDB file');
    });

    it('should support multiple files per project', async () => {
      // Arrange - Create project
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Multi-File Project',
        description: 'Project with multiple files',
        type: 'Device',
      };
      const savedProject = await projectRepository.save(projectData);

      // Create multiple files
      const file1: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: savedProject.systemId,
        fileName: 'file1.acdb',
        description: 'First ACDB file',
        metadata: '{}',
        isTarget: false,
      };
      const file2: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: savedProject.systemId,
        fileName: 'file2.awsp',
        description: 'Workspace file',
        metadata: '{}',
        isTarget: true,
      };
      await arcDbFileRepository.save(file1);
      await arcDbFileRepository.save(file2);

      // Act
      const projectWithFiles = await projectRepository.findOne({
        where: {systemId: savedProject.systemId},
        relations: ['files'],
      });

      // Assert
      expect(projectWithFiles!.files!.length).toBe(2);
      const fileNames = projectWithFiles!.files!.map(f => f.fileName);
      expect(fileNames).toContain('file1.acdb');
      expect(fileNames).toContain('file2.awsp');
    });

    it('should enforce unique constraint on projectSystemId + fileName', async () => {
      // Arrange - Create project
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Unique File Test',
        description: 'Testing unique file constraint',
        type: 'Offline',
      };
      const savedProject = await projectRepository.save(projectData);

      // Create first file
      const file1: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: savedProject.systemId,
        fileName: 'duplicate.acdb',
        description: 'First file',
        metadata: '{}',
        isTarget: false,
      };
      await arcDbFileRepository.save(file1);

      // Try to create second file with same name in same project
      const file2: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: savedProject.systemId,
        fileName: 'duplicate.acdb',
        description: 'Second file with same name',
        metadata: '{}',
        isTarget: false,
      };

      // Assert - Should fail due to unique constraint
      await expect(arcDbFileRepository.save(file2)).rejects.toThrow();
    });

    it('should allow same fileName in different projects', async () => {
      // Arrange - Create two projects
      const project1Data: EntityRowForInsert<ProjectRow> = {
        name: 'Project 1',
        description: 'First project',
        type: 'Offline',
      };
      const project2Data: EntityRowForInsert<ProjectRow> = {
        name: 'Project 2',
        description: 'Second project',
        type: 'Device',
      };
      const project1 = await projectRepository.save(project1Data);
      const project2 = await projectRepository.save(project2Data);

      // Create files with same name in different projects
      const file1: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: project1.systemId,
        fileName: 'common.acdb',
        description: 'File in project 1',
        metadata: '{}',
        isTarget: false,
      };
      const file2: EntityRowForInsert<ArcDbFileRow> = {
        projectSystemId: project2.systemId,
        fileName: 'common.acdb',
        description: 'File in project 2',
        metadata: '{}',
        isTarget: false,
      };

      // Act & Assert - Should succeed
      const savedFile1 = await arcDbFileRepository.save(file1);
      const savedFile2 = await arcDbFileRepository.save(file2);

      expect(savedFile1.systemId).not.toBe(savedFile2.systemId);
      expect(savedFile1.fileName).toBe('common.acdb');
      expect(savedFile2.fileName).toBe('common.acdb');
    });
  });

  describe('Version Field (Optimistic Locking)', () => {
    it('should initialize version to 1 on insert', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Version Test',
        description: 'Testing version field',
        type: 'Offline',
      };

      // Act
      const savedProject = await projectRepository.save(projectData);

      // Assert
      expect(savedProject.version).toBe(1);
    });

    it('should increment version on update', async () => {
      // Arrange
      const projectData: EntityRowForInsert<ProjectRow> = {
        name: 'Version Update Test',
        description: 'Original description',
        type: 'Offline',
      };
      const savedProject = await projectRepository.save(projectData);
      const originalVersion = savedProject.version;

      // Act - Update the project
      savedProject.description = 'Updated description';
      const updatedProject = await projectRepository.save(savedProject);

      // Assert
      expect(updatedProject.version).toBe(originalVersion + 1);
    });
  });
});
