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
import {TagDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import {TagKeyDefLinkSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';
import type {ArcDbFileRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import type {ProjectRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import type {KeyDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import type {ValueDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import type {TagDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import type {TagKeyDefLinkRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';

describe('TypeOrmBulkReadRepository - readKeyDefinitions', () => {
  let repository: TypeOrmBulkReadQueryService;
  let projectRepository: Repository<ProjectRow>;
  let fileRepository: Repository<ArcDbFileRow>;
  let keyRepository: Repository<KeyDefinitionRow>;
  let valueRepository: Repository<ValueDefinitionRow>;
  let testFileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const dataSource = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(dataSource);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    keyRepository = getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    valueRepository = getTestRepository<ValueDefinitionRow>(
      ValueDefinitionSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;

    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file = await fileRepository.save({
      projectSystemId: project.systemId,
      fileName: JSON.stringify({acdb: 'test.acdb', awsp: 'test.awsp'}),
      description: 'Test file',
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

  it('should return empty array when no keys exist', async () => {
    const result = await repository.readKeyDefinitions(testFileSystemId);
    expect(result).toEqual([]);
  });

  it('should return key with nested values', async () => {
    const key = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'Key100',
      isCalibrationKey: true,
      isGraphKey: false,
    });
    await valueRepository.save({
      systemId: nextId++,
      keySystemId: key.systemId,
      valueId: 1001,
      name: 'Value1001',
      enumMember: 'ENUM_1001',
    });
    await valueRepository.save({
      systemId: nextId++,
      keySystemId: key.systemId,
      valueId: 1002,
      name: 'Value1002',
    });

    const result = await repository.readKeyDefinitions(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].keyId).toBe(100);
    expect(result[0].name).toBe('Key100');
    expect(result[0].isCalibrationKey).toBe(true);
    expect(result[0].values).toHaveLength(2);
    expect(result[0].values[0].valueId).toBe(1001);
    expect(result[0].values[0].enumMember).toBe('ENUM_1001');
    expect(result[0].values[1].valueId).toBe(1002);
  });

  it('should return all optional fields', async () => {
    await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 200,
      name: 'Key200',
      description: 'A key',
      isVoice: true,
      isDynamic: false,
      isCalibrationKey: true,
      isGraphKey: false,
      enumName: 'KEY_ENUM_NAME',
      enumMember: 'KEY_ENUM_VALUE',
      calKeyEnumMember: 'CAL_ENUM',
      graphKeyEnumMember: 'GRAPH_ENUM',
    });

    const result = await repository.readKeyDefinitions(testFileSystemId);

    expect(result[0].enumName).toBe('KEY_ENUM_NAME');
    expect(result[0].enumMember).toBe('KEY_ENUM_VALUE');
    expect(result[0].calKeyEnumMember).toBe('CAL_ENUM');
    expect(result[0].graphKeyEnumMember).toBe('GRAPH_ENUM');
    expect(result[0].description).toBe('A key');
    expect(result[0].isVoice).toBe(true);
  });

  it('should scope results to fileSystemId', async () => {
    const project2 = await projectRepository.save({
      name: 'Project 2',
      description: 'Other',
      type: 'Offline',
    });
    const file2 = await fileRepository.save({
      projectSystemId: project2.systemId,
      fileName: JSON.stringify({acdb: 'other.acdb', awsp: 'other.awsp'}),
      description: 'Other',
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
      oemInfo: 'OEM',
    });
    await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'OwnKey',
      isCalibrationKey: true,
    });
    await keyRepository.save({
      systemId: nextId++,
      fileSystemId: file2.systemId,
      keyId: 200,
      name: 'OtherKey',
      isCalibrationKey: true,
    });

    const result = await repository.readKeyDefinitions(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OwnKey');
  });

  it('should order keys by keyId ascending', async () => {
    await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 300,
      name: 'Key300',
      isCalibrationKey: true,
    });
    await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'Key100',
      isCalibrationKey: true,
    });
    await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 200,
      name: 'Key200',
      isCalibrationKey: true,
    });

    const result = await repository.readKeyDefinitions(testFileSystemId);

    expect(result.map(k => k.keyId)).toEqual([100, 200, 300]);
  });
});

describe('TypeOrmBulkReadRepository - readTagDefinitions', () => {
  let repository: TypeOrmBulkReadQueryService;
  let projectRepository: Repository<ProjectRow>;
  let fileRepository: Repository<ArcDbFileRow>;
  let keyRepository: Repository<KeyDefinitionRow>;
  let tagRepository: Repository<TagDefinitionRow>;
  let tagKeyLinkRepository: Repository<TagKeyDefLinkRow>;
  let testFileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const dataSource = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(dataSource);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    keyRepository = getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    tagRepository = getTestRepository<TagDefinitionRow>(TagDefinitionSchema);
    tagKeyLinkRepository =
      getTestRepository<TagKeyDefLinkRow>(TagKeyDefLinkSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;

    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file = await fileRepository.save({
      projectSystemId: project.systemId,
      fileName: JSON.stringify({acdb: 'test.acdb', awsp: 'test.awsp'}),
      description: 'Test file',
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

  it('should return empty array when no tags exist', async () => {
    const result = await repository.readTagDefinitions(testFileSystemId);
    expect(result).toEqual([]);
  });

  it('should return tag with nested supportedKeys', async () => {
    const key = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      keyId: 100,
      name: 'KeyA',
      isCalibrationKey: true,
    });
    const tag = await tagRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      tagId: 500,
      name: 'TagX',
      isVoice: false,
    });
    await tagKeyLinkRepository.save({
      systemId: nextId++,
      tagDefinitionSystemId: tag.systemId,
      keyReferenceSystemId: key.systemId,
      tagEnumValue: 'TAG_ENUM_VAL',
    });

    const result = await repository.readTagDefinitions(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].tagId).toBe(500);
    expect(result[0].name).toBe('TagX');
    expect(result[0].isVoice).toBe(false);
    expect(result[0].supportedKeys).toHaveLength(1);
    expect(result[0].supportedKeys[0].keyId).toBe(100);
    expect(result[0].supportedKeys[0].keyName).toBe('KeyA');
    expect(result[0].supportedKeys[0].enumValue).toBe('TAG_ENUM_VAL');
  });

  it('should return all optional tag fields', async () => {
    await tagRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      tagId: 600,
      name: 'TagY',
      description: 'A tag',
      isVoice: true,
      cHeaderEnumName: 'TAG_ENUM_NAME',
      cHeaderEnumValue: 'TAG_ENUM_VALUE',
    });

    const result = await repository.readTagDefinitions(testFileSystemId);

    expect(result[0].description).toBe('A tag');
    expect(result[0].isVoice).toBe(true);
    expect(result[0].enumName).toBe('TAG_ENUM_NAME');
    expect(result[0].enumMember).toBe('TAG_ENUM_VALUE');
  });

  it('should handle tag with no supportedKeys', async () => {
    await tagRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      tagId: 700,
      name: 'TagNoKeys',
      isVoice: false,
    });

    const result = await repository.readTagDefinitions(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].supportedKeys).toEqual([]);
  });

  it('should scope results to fileSystemId', async () => {
    const project2 = await projectRepository.save({
      name: 'Project 2',
      description: 'Other',
      type: 'Offline',
    });
    const file2 = await fileRepository.save({
      projectSystemId: project2.systemId,
      fileName: JSON.stringify({acdb: 'other.acdb', awsp: 'other.awsp'}),
      description: 'Other',
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
      oemInfo: 'OEM',
    });
    await tagRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      tagId: 500,
      name: 'OwnTag',
      isVoice: false,
    });
    await tagRepository.save({
      systemId: nextId++,
      fileSystemId: file2.systemId,
      tagId: 600,
      name: 'OtherTag',
      isVoice: false,
    });

    const result = await repository.readTagDefinitions(testFileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OwnTag');
  });
});
