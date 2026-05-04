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

/**
 * Registry-specific integration tests.
 *
 * EntityIdService behaviour (sequential IDs, auto-reserve, persistActual
 * reclaim, coalescing) is fully covered by entity-id-service.spec.ts.
 * These tests focus exclusively on what the registry adds:
 *   1. Independent ID sequences per file (Map isolation).
 *   2. Service instance reuse for the same fileId (getOrCreate caching).
 */
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
      systemId: 1,
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file1 = await arcDbFileRepository.save({
      systemId: 100,
      projectSystemId: project.systemId,
      fileName: 'file1.acdb',
      description: 'File 1',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });
    const file2 = await arcDbFileRepository.save({
      systemId: 101,
      projectSystemId: project.systemId,
      fileName: 'file2.acdb',
      description: 'File 2',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });
    // Initialize last_reserved_id = fileId for correct composite ID encoding
    await dataSource.query(
      `UPDATE files SET last_reserved_id = system_id WHERE system_id IN (?, ?)`,
      [file1.systemId, file2.systemId],
    );
    fileId1 = file1.systemId;
    fileId2 = file2.systemId;
    registry = new EntityIdServiceRegistry(dataSource);
  });

  // ---------------------------------------------------------------------------
  it('maintains independent ID sequences for different files', async () => {
    await registry.reserveBlock(fileId1);
    await registry.reserveBlock(fileId2);

    const id1 = await registry.getNextId(fileId1);
    const id2 = await registry.getNextId(fileId2);

    expect(id1).toBe(1 * FILE_ID_MODULUS + fileId1);
    expect(id2).toBe(1 * FILE_ID_MODULUS + fileId2);
    expect(id1).not.toBe(id2);
  });

  it('reuses the same EntityIdService instance for the same fileId', async () => {
    // reserveBlock initialises the service for fileId1
    await registry.reserveBlock(fileId1);

    // Both getNextId calls use the same cached service — second returns seq 2
    const id1 = await registry.getNextId(fileId1);
    const id2 = await registry.getNextId(fileId1);

    expect(id1).toBe(1 * FILE_ID_MODULUS + fileId1);
    expect(id2).toBe(2 * FILE_ID_MODULUS + fileId1);
  });
});
