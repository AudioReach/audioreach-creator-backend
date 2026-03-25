/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource, Repository} from 'typeorm';
import {EntityIdServiceRegistry} from '../../../src/id-generation/entity-id-service.registry.js';
import {FILE_ID_MODULUS} from '../../../src/id-generation/composite-id.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

describe('EntityIdServiceRegistry', () => {
  let dataSource: DataSource;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let fileId1: number;
  let fileId2: number;
  let registry: EntityIdServiceRegistry;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();

    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file1 = await arcDbFileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'file1.acdb',
      description: 'File 1',
      metadata: '{}',
      isTarget: false,
    });
    const file2 = await arcDbFileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'file2.acdb',
      description: 'File 2',
      metadata: '{}',
      isTarget: false,
    });
    // Initialize last_entity_id = fileId for correct composite ID encoding
    await dataSource.query(
      `UPDATE files SET last_entity_id = system_id WHERE system_id IN (?, ?)`,
      [file1.systemId, file2.systemId],
    );
    fileId1 = file1.systemId;
    fileId2 = file2.systemId;
    registry = new EntityIdServiceRegistry(dataSource);
  });

  // ---------------------------------------------------------------------------
  describe('getNextId', () => {
    it('throws before reserveBlock is called for that file', () => {
      expect(() => registry.getNextId(fileId1)).toThrow('not initialized');
    });
  });

  // ---------------------------------------------------------------------------
  describe('reserveBlock + getNextId', () => {
    it('returns correct composite IDs for a file', async () => {
      await registry.reserveBlock(fileId1);

      expect(registry.getNextId(fileId1)).toBe(1 * FILE_ID_MODULUS + fileId1);
      expect(registry.getNextId(fileId1)).toBe(2 * FILE_ID_MODULUS + fileId1);
    });

    it('maintains independent ID sequences for different files', async () => {
      await registry.reserveBlock(fileId1);
      await registry.reserveBlock(fileId2);

      const id1 = registry.getNextId(fileId1);
      const id2 = registry.getNextId(fileId2);

      expect(id1).toBe(1 * FILE_ID_MODULUS + fileId1);
      expect(id2).toBe(1 * FILE_ID_MODULUS + fileId2);
      expect(id1).not.toBe(id2);
    });

    it('reuses the same EntityIdService instance for the same fileId', async () => {
      // reserveBlock initializes the service for fileId1
      await registry.reserveBlock(fileId1);

      // Both getNextId calls use the same service — second returns seq 2, not seq 1
      const id1 = registry.getNextId(fileId1);
      const id2 = registry.getNextId(fileId1);

      expect(id1).toBe(1 * FILE_ID_MODULUS + fileId1);
      expect(id2).toBe(2 * FILE_ID_MODULUS + fileId1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('persistActual', () => {
    it('reclaims unused IDs for the specified file only', async () => {
      await registry.reserveBlock(fileId1, 10);
      registry.getNextId(fileId1); // seq 1
      registry.getNextId(fileId1); // seq 2

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await registry.persistActual(fileId1, queryRunner);
      } finally {
        await queryRunner.release();
      }

      const rows = (await dataSource.query(
        `SELECT last_entity_id FROM files WHERE system_id = ?`,
        [fileId1],
      )) as Array<{last_entity_id: number}>;
      expect(rows[0].last_entity_id).toBe(2 * FILE_ID_MODULUS + fileId1);
    });
  });
});
