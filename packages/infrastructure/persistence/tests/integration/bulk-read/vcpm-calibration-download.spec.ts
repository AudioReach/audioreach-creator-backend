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
import {SubgraphSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph.schema.js';
import {
  VcpmInstanceSchema,
  VcpmCkvSchema,
  VcpmCkvValuesSchema,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import {VcpmModuleDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {VcpmModuleParameterDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import type {ArcDbFileRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import type {ProjectRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import type {KeyDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import type {ValueDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import type {SubgraphRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {
  VcpmInstanceRow,
  VcpmCkvRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmModuleDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import type {VcpmModuleParameterDefinitionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import {SPF_VCPM_MODULE_ID} from '@arc/core';

describe('TypeOrmBulkReadQueryService.readVcpmCalibrationData', () => {
  let service: TypeOrmBulkReadQueryService;
  let fileRepository: Repository<ArcDbFileRow>;
  let projectRepository: Repository<ProjectRow>;
  let keyRepository: Repository<KeyDefinitionRow>;
  let valueRepository: Repository<ValueDefinitionRow>;
  let subgraphRepository: Repository<SubgraphRow>;
  let vcpmModuleDefRepository: Repository<VcpmModuleDefinitionRow>;
  let vcpmModuleParamRepository: Repository<VcpmModuleParameterDefinitionRow>;
  let vcpmInstanceRepository: Repository<VcpmInstanceRow>;
  let vcpmCkvRepository: Repository<VcpmCkvRow>;
  let testFileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const dataSource = getTestDataSource();
    service = new TypeOrmBulkReadQueryService(dataSource);
    fileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    keyRepository = getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    valueRepository = getTestRepository<ValueDefinitionRow>(
      ValueDefinitionSchema,
    );
    subgraphRepository = getTestRepository<SubgraphRow>(SubgraphSchema);
    vcpmModuleDefRepository = getTestRepository<VcpmModuleDefinitionRow>(
      VcpmModuleDefinitionSchema,
    );
    vcpmModuleParamRepository =
      getTestRepository<VcpmModuleParameterDefinitionRow>(
        VcpmModuleParameterDefinitionSchema,
      );
    vcpmInstanceRepository =
      getTestRepository<VcpmInstanceRow>(VcpmInstanceSchema);
    vcpmCkvRepository = getTestRepository<VcpmCkvRow>(VcpmCkvSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;

    const project = await projectRepository.save({
      name: 'Test Project VCPM',
      description: 'Test project for VCPM calibration download',
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

  it('returns empty array when no vcpm_instances exist for the file', async () => {
    const result = await service.readVcpmCalibrationData(testFileSystemId);
    expect(result).toEqual([]);
  });

  it('returns CalibrationDataDownloadModel for a single vcpm ckv entry', async () => {
    const dataSource = getTestDataSource();

    // Create key and value definitions
    const key = await keyRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      naturalId: 1,
      name: 'VoiceKey1',
      isDynamic: true,
    });
    const value = await valueRepository.save({
      systemId: nextId++,
      keySystemId: key.systemId,
      naturalId: 10,
      name: 'Value10',
    });

    // Create subgraph
    const subgraph = await subgraphRepository.save({
      systemId: nextId++,
      fileSystemId: testFileSystemId,
      naturalId: 100,
      name: 'VoiceSubgraph',
      isImported: false,
    });

    // Create VCPM module definition
    const vcpmModuleDef = await vcpmModuleDefRepository.save({
      systemId: nextId++,
      naturalId: SPF_VCPM_MODULE_ID,
      name: 'VCPM',
      fileSystemId: testFileSystemId,
    });

    // Create VCPM module parameter definition
    const vcpmParam = await vcpmModuleParamRepository.save({
      systemId: nextId++,
      naturalId: 0x08001163,
      name: 'VoiceCalTbl',
      maxSize: 1024,
      pidType: 'SharedPersistent',
      isPersistent: true,
      isReadOnly: false,
      vcpmModuleDefinitionSystemId: vcpmModuleDef.systemId,
      elementsStructure: '{}',
    });

    // Create VCPM instance
    const vcpmInstance = await vcpmInstanceRepository.save({
      systemId: nextId++,
      subgraphSystemId: subgraph.systemId,
      vcpmDefinitionId: vcpmModuleDef.systemId,
    });

    // Create VCPM CKV
    const vcpmCkv = await vcpmCkvRepository.save({
      systemId: nextId++,
      vcpmInstanceSystemId: vcpmInstance.systemId,
    });

    // Link CKV to value definition
    await dataSource.query(
      'INSERT INTO vcpm_ckv_values (vcpm_ckv_system_id, value_def_system_id) VALUES (?, ?)',
      [vcpmCkv.systemId, value.systemId],
    );

    // Create VCPM parameter payload via raw SQL (VcpmParameterPayloadSchema is a factory function)
    await dataSource.query(
      `INSERT INTO vcpm_parameter_payload (system_id, vcpm_ckv_system_id, vcpm_parameter_system_id, payload)
       VALUES (?, ?, ?, ?)`,
      [
        nextId++,
        vcpmCkv.systemId,
        vcpmParam.systemId,
        Buffer.from([0xde, 0xad]),
      ],
    );

    const result = await service.readVcpmCalibrationData(testFileSystemId);

    expect(result).toHaveLength(1);
    const sg = result[0];
    expect(sg.naturalId).toBe(100);
    expect(sg.masterKeys).toEqual([{keyNaturalId: 1, isDynamic: true}]);
    expect(sg.keyValueCombinations).toHaveLength(1);
    const kvCombo = sg.keyValueCombinations[0];
    expect(kvCombo.keyIds).toEqual([1]);
    expect(kvCombo.valueIds).toEqual([10]);
    expect(kvCombo.modules).toHaveLength(1);
    const mod = kvCombo.modules[0];
    expect(mod.naturalId).toBe(SPF_VCPM_MODULE_ID);
    expect(mod.parameters).toHaveLength(1);
    expect(mod.parameters[0].naturalId).toBe(0x08001163);
    // SQLite may return payload as Buffer or Uint8Array depending on transformer config
    expect(
      Buffer.from(mod.parameters[0].payload).equals(Buffer.from([0xde, 0xad])),
    ).toBe(true);
    expect(mod.parameters[0].pidType).toBe('');
  });
});
