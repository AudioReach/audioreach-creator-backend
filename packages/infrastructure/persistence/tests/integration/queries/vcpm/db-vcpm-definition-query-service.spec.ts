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
import {DataSource} from 'typeorm';
import {DbVcpmDefinitionQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/vcpm-definition/db-vcpm-definition-query-service.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {VcpmModuleDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {VcpmModuleAttributeSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-attribute.schema.js';
import {VcpmModuleParameterDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {VcpmModuleDefinition, PARAM_TYPE, TOOL_POLICY} from '@arc/core';

describe('DbVcpmDefinitionQueryService', () => {
  let dataSource: DataSource;
  let service: DbVcpmDefinitionQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    service = new DbVcpmDefinitionQueryService(dataSource);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    await getTestRepository(ProjectSchema).save({
      systemId: 1,
      name: 'Test project',
      description: '',
      type: 'Offline',
    });
    await getTestRepository(ArcDbFileSchema).save([
      {
        systemId: 100,
        projectSystemId: 1,
        fileName: 'file-100.acdb',
        description: '',
        metadata: '{}',
        isTarget: true,
        lastReservedId: 0,
      },
      {
        systemId: 200,
        projectSystemId: 1,
        fileName: 'file-200.acdb',
        description: '',
        metadata: '{}',
        isTarget: false,
        lastReservedId: 0,
      },
    ]);
  });

  it('returns an empty array when no VCPM definitions exist for the file', async () => {
    const result = await service.getAllVcpmModuleDefinitions(9999);

    expect(result).toEqual([]);
  });

  it('returns definitions with their parameters for the requested file', async () => {
    const definitionRepository = getTestRepository(VcpmModuleDefinitionSchema);
    const parameterRepository = getTestRepository(
      VcpmModuleParameterDefinitionSchema,
    );

    await definitionRepository.save({
      systemId: 1001,
      naturalId: 42,
      name: 'TestVcpm',
      displayName: 'Test VCPM',
      description: 'A VCPM definition',
      groupName: 'Test group',
      fileSystemId: 100,
    });

    await parameterRepository.save([
      {
        systemId: 2001,
        naturalId: 1,
        name: 'Param A',
        description: 'Parameter A',
        maxSize: 4,
        pidType: PARAM_TYPE.None,
        isPersistent: false,
        isReadOnly: false,
        elementsStructure: '[]',
        toolPolicies: JSON.stringify([TOOL_POLICY.Calibration]),
        vcpmModuleDefinitionSystemId: 1001,
      },
      {
        systemId: 2002,
        naturalId: 2,
        name: 'Param B',
        description: 'Parameter B',
        maxSize: 8,
        pidType: PARAM_TYPE.Shared,
        isPersistent: true,
        isReadOnly: true,
        elementsStructure: '[]',
        vcpmModuleDefinitionSystemId: 1001,
      },
    ]);
    await getTestRepository(VcpmModuleAttributeSchema).save({
      systemId: 4001,
      name: 'mode',
      value: 'test',
      vcpmModuleDefinitionSystemId: 1001,
    });

    const result: VcpmModuleDefinition[] =
      await service.getAllVcpmModuleDefinitions(100);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(VcpmModuleDefinition);
    expect(result[0].systemId).toBe(1001);
    expect(result[0].naturalId).toBe(42);
    expect(result[0].displayName).toBe('Test VCPM');
    expect(result[0].description).toBe('A VCPM definition');
    expect(result[0].groupName).toBe('Test group');
    expect([...result[0].attributes.entries()]).toEqual([['mode', 'test']]);
    expect(result[0].parameters).toHaveLength(2);
    expect(result[0].parameters.find(p => p.systemId === 2001)).toMatchObject({
      systemId: 2001,
      naturalId: 1,
      name: 'Param A',
      description: 'Parameter A',
      pidType: PARAM_TYPE.None,
      toolPolicies: [TOOL_POLICY.Calibration],
      elementsStructure: '[]',
    });
    expect(result[0].parameters.find(p => p.systemId === 2002)).toMatchObject({
      systemId: 2002,
      naturalId: 2,
      name: 'Param B',
      pidType: PARAM_TYPE.Shared,
      isPersistent: true,
      elementsStructure: '[]',
    });
  });

  it('does not return definitions belonging to a different file', async () => {
    await getTestRepository(VcpmModuleDefinitionSchema).save({
      systemId: 3001,
      naturalId: 99,
      name: 'OtherFile',
      fileSystemId: 200,
    });

    const result = await service.getAllVcpmModuleDefinitions(100);

    expect(result.every(definition => definition.systemId !== 3001)).toBe(true);
  });
});
