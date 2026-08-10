/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TypeOrmBulkReadQueryService} from '../../../src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {Repository} from 'typeorm';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {KeyDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {ValueDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {UseCaseSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/use-case.js';
import {SubgraphSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {ArcDbFileRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import type {ProjectRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import type {KeyDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import type {ValueDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import type {UseCaseRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/use-case.js';
import type {SubgraphRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph.schema.js';

describe('TypeOrmBulkReadQueryService - readUsecaseData', () => {
  let repository: TypeOrmBulkReadQueryService;
  let fileRepository: Repository<ArcDbFileRow>;
  let projectRepository: Repository<ProjectRow>;
  let keyRepository: Repository<KeyDefinitionRow>;
  let valueRepository: Repository<ValueDefinitionRow>;
  let usecaseRepository: Repository<UseCaseRow>;
  let subgraphRepository: Repository<SubgraphRow>;
  let testProjectId: number;
  let testFileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const dataSource = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(dataSource);
    fileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    keyRepository = getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    valueRepository = getTestRepository<ValueDefinitionRow>(
      ValueDefinitionSchema,
    );
    usecaseRepository = getTestRepository<UseCaseRow>(UseCaseSchema);
    subgraphRepository = getTestRepository<SubgraphRow>(SubgraphSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;

    // Create test project
    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test project for usecase data',
      type: 'Offline',
    });
    testProjectId = project.systemId;

    // Create test file
    const file = await fileRepository.save({
      projectSystemId: testProjectId,
      fileName: JSON.stringify({acdb: 'test.acdb', awsp: 'test.awsp'}),
      description: 'Test file for usecase data',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
      openStatus: 'READY',
      headerVersion: 1,
      acdbVersionMajor: 1,
      acdbVersionMinor: 0,
      acdbVersionRevision: 0,
      acdbVersionCplInfo: 0,
      codecInfos: JSON.stringify([]),
      modifiedDate: Date.now(),
      oemInfo: 'Test OEM',
    });
    testFileSystemId = file.systemId;
  });

  it('should read usecase data with natural IDs', async () => {
    // Create key definitions
    const key1 = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'Key100',
    });
    const key2 = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 200,
      name: 'Key200',
    });

    // Create value definitions
    const value1 = await valueRepository.save({
      systemId: nextId++,
      keySystemId: key1.systemId,
      valueId: 1001,
      name: 'Value1001',
    });
    const value2 = await valueRepository.save({
      systemId: nextId++,
      keySystemId: key1.systemId,
      valueId: 1002,
      name: 'Value1002',
    });

    // Create subgraphs
    const subgraph1 = await subgraphRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      subgraphId: 5000,
      name: 'Subgraph5000',
      isImported: false,
    });

    // Create usecase
    const usecase = await usecaseRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      aliasId: 1,
      alias: 'TestUsecase',
    });

    // Link GKV values
    const dataSource = getTestDataSource();
    await dataSource.query(
      'INSERT INTO usecase_gkv_values (usecase_system_id, value_def_system_id) VALUES (?, ?)',
      [usecase.systemId, value1.systemId],
    );
    await dataSource.query(
      'INSERT INTO usecase_gkv_values (usecase_system_id, value_def_system_id) VALUES (?, ?)',
      [usecase.systemId, value2.systemId],
    );

    // Link subgraphs
    await dataSource.query(
      'INSERT INTO use_case_subgraphs (usecase_system_id, subgraph_system_id) VALUES (?, ?)',
      [usecase.systemId, subgraph1.systemId],
    );

    // Read usecase data
    const result = await repository.readUsecaseData(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(usecase.systemId);
    expect(result[0].keyIds).toEqual([100]); // Both values have same key
    expect(result[0].valueIds).toEqual([1001, 1002]); // Sorted
    expect(result[0].subgraphIds).toEqual([5000]);
    expect(result[0].subgraphPairs).toEqual([]);
  });

  it('should sort usecases by numKeys, keyIds, valueIds', async () => {
    // Create key definitions
    const key1 = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'Key100',
    });
    const key2 = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 200,
      name: 'Key200',
    });

    // Create value definitions
    const value1 = await valueRepository.save({
      systemId: nextId++,
      keySystemId: key1.systemId,
      valueId: 1001,
      name: 'Value1001',
    });
    const value2 = await valueRepository.save({
      systemId: nextId++,
      keySystemId: key2.systemId,
      valueId: 2001,
      name: 'Value2001',
    });

    // Create usecase with 2 keys (should come second)
    const usecase1 = await usecaseRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      aliasId: 1,
      alias: 'Usecase1',
    });

    // Create usecase with 1 key (should come first)
    const usecase2 = await usecaseRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      aliasId: 2,
      alias: 'Usecase2',
    });

    const dataSource = getTestDataSource();

    // Link usecase1 with 2 keys
    await dataSource.query(
      'INSERT INTO usecase_gkv_values (usecase_system_id, value_def_system_id) VALUES (?, ?), (?, ?)',
      [usecase1.systemId, value1.systemId, usecase1.systemId, value2.systemId],
    );

    // Link usecase2 with 1 key
    await dataSource.query(
      'INSERT INTO usecase_gkv_values (usecase_system_id, value_def_system_id) VALUES (?, ?)',
      [usecase2.systemId, value1.systemId],
    );

    const result = await repository.readUsecaseData(testFileSystemId);

    expect(result).toHaveLength(2);
    expect(result[0].systemId).toBe(usecase2.systemId); // 1 key comes first
    expect(result[1].systemId).toBe(usecase1.systemId); // 2 keys comes second
  });

  it('should return empty array when no usecases exist', async () => {
    const result = await repository.readUsecaseData(testFileSystemId);

    expect(result).toEqual([]);
  });

  describe('readTagKeys', () => {
    it('returns empty array when no tag definitions exist', async () => {
      const result = await repository.readTagKeys(testFileSystemId);
      expect(result).toEqual([]);
    });
  });

  describe('readTagData', () => {
    it('returns empty array when no module tag data exists', async () => {
      const result = await repository.readTagData(testFileSystemId);
      expect(result).toEqual([]);
    });
  });

  describe('readTaggedModuleData', () => {
    it('returns empty array when no module tag map entries exist', async () => {
      const result = await repository.readTaggedModuleData(testFileSystemId);
      expect(result).toEqual([]);
    });
  });

  it('should handle usecases with subgraph pairs', async () => {
    // Create key and value
    const key1 = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'Key100',
    });
    const value1 = await valueRepository.save({
      systemId: nextId++,
      keySystemId: key1.systemId,
      valueId: 1001,
      name: 'Value1001',
    });

    // Create subgraphs
    const subgraph1 = await subgraphRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      subgraphId: 5000,
      name: 'Subgraph5000',
      isImported: false,
    });
    const subgraph2 = await subgraphRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      subgraphId: 5001,
      name: 'Subgraph5001',
      isImported: false,
    });

    // Create usecase
    const usecase = await usecaseRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      aliasId: 1,
      alias: 'TestUsecase',
    });

    const dataSource = getTestDataSource();

    // Link GKV value
    await dataSource.query(
      'INSERT INTO usecase_gkv_values (usecase_system_id, value_def_system_id) VALUES (?, ?)',
      [usecase.systemId, value1.systemId],
    );

    // Add subgraph pair
    await dataSource.query(
      'INSERT INTO use_case_subgraph_pairs (usecase_system_id, source_subgraph_system_id, dest_subgraph_system_id) VALUES (?, ?, ?)',
      [usecase.systemId, subgraph1.systemId, subgraph2.systemId],
    );

    const result = await repository.readUsecaseData(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].subgraphPairs).toEqual([
      {sourceSubgraphId: 5000, destSubgraphId: 5001},
    ]);
  });
});
