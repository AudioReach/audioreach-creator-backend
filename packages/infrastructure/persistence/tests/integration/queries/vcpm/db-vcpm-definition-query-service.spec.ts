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
import {DbVcpmDefinitionQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/vcpm/db-vcpm-definition-query-service.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {VcpmModuleDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {VcpmModuleParameterDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import type {VcpmModuleDefinitionWithParams} from '@arc/core';

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
  });

  it('returns an empty array when no VCPM definitions exist for the file', async () => {
    const result = await service.getVcpmModuleDefinitionsWithParams(9999);

    expect(result).toEqual([]);
  });

  it('returns definitions with their parameters for the requested file', async () => {
    const definitionRepository = getTestRepository(VcpmModuleDefinitionSchema);
    const parameterRepository = getTestRepository(
      VcpmModuleParameterDefinitionSchema,
    );

    await definitionRepository.save({
      systemId: 1001,
      moduleDefinitionId: 42,
      name: 'TestVcpm',
      fileSystemId: 100,
    });

    await parameterRepository.save([
      {
        systemId: 2001,
        paramId: 1,
        name: 'Param A',
        maxSize: 4,
        pidType: 'uint32',
        isPersistent: false,
        isReadOnly: false,
        elementsStructure: '[]',
        vcpmModuleDefinitionSystemId: 1001,
      },
      {
        systemId: 2002,
        paramId: 2,
        name: 'Param B',
        maxSize: 8,
        pidType: 'int32',
        isPersistent: true,
        isReadOnly: true,
        elementsStructure: '[]',
        vcpmModuleDefinitionSystemId: 1001,
      },
    ]);

    const result: VcpmModuleDefinitionWithParams[] =
      await service.getVcpmModuleDefinitionsWithParams(100);

    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(1001);
    expect(result[0].parameters).toHaveLength(2);
    expect(result[0].parameters.find(p => p.systemId === 2001)).toEqual({
      systemId: 2001,
      isReadOnly: false,
      elementsStructure: '[]',
    });
    expect(result[0].parameters.find(p => p.systemId === 2002)).toEqual({
      systemId: 2002,
      isReadOnly: true,
      elementsStructure: '[]',
    });
  });

  it('does not return definitions belonging to a different file', async () => {
    await getTestRepository(VcpmModuleDefinitionSchema).save({
      systemId: 3001,
      moduleDefinitionId: 99,
      name: 'OtherFile',
      fileSystemId: 200,
    });

    const result = await service.getVcpmModuleDefinitionsWithParams(100);

    expect(result.every(definition => definition.systemId !== 3001)).toBe(true);
  });
});
