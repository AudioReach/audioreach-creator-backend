/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllDriverModuleDefinitionsHandler} from '../../../../../src/application/definition/driver-module-definition/get-all/get-all-driver-module-definitions.handler.js';
import {GetAllDriverModuleDefinitionsQuery} from '../../../../../src/application/definition/driver-module-definition/get-all/get-all-driver-module-definitions.query.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {BaseModuleDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/shared/module-definition-summary-read-model.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';

const createReadModel = (
  overrides?: Partial<BaseModuleDefinitionSummaryReadModel>,
): BaseModuleDefinitionSummaryReadModel => ({
  systemId: 1,
  moduleId: 100,
  name: 'DriverModule',
  parameterDefinitions: [],
  ...overrides,
});

const createQueryServices = (
  overrides?: Partial<QueryServices>,
): QueryServices =>
  ({
    projectQueryService: {
      getFileIdByProjectId: jest
        .fn<(projectId: number) => Promise<number>>()
        .mockResolvedValue(42),
    },
    driverModuleDefinitionQueryService: {
      getAllDriverModuleDefinitions: jest
        .fn()
        .mockResolvedValue(Result.ok([createReadModel()])),
    },
    ...overrides,
  }) as unknown as QueryServices;

describe('GetAllDriverModuleDefinitionsHandler', () => {
  it('resolves fileSystemId from projectId before querying', async () => {
    const queryServices = createQueryServices();
    const handler = new GetAllDriverModuleDefinitionsHandler(queryServices);
    const query = new GetAllDriverModuleDefinitionsQuery(
      7,
      undefined,
      undefined,
      'client-1',
    );

    await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
  });

  it('passes moduleDefinitionId/parameterId filters through to the query service', async () => {
    const queryServices = createQueryServices();
    const handler = new GetAllDriverModuleDefinitionsHandler(queryServices);
    const query = new GetAllDriverModuleDefinitionsQuery(7, 55, 66, 'client-1');

    await handler.handle(query);

    expect(
      queryServices.driverModuleDefinitionQueryService
        .getAllDriverModuleDefinitions,
    ).toHaveBeenCalledWith(42, {
      moduleDefinitionNaturalId: 55,
      parameterNaturalId: 66,
    });
  });

  it('returns the Result from the query service unchanged on success', async () => {
    const readModel = createReadModel({systemId: 9});
    const queryServices = createQueryServices({
      driverModuleDefinitionQueryService: {
        getAllDriverModuleDefinitions: jest
          .fn()
          .mockResolvedValue(Result.ok([readModel])),
      } as any,
    });
    const handler = new GetAllDriverModuleDefinitionsHandler(queryServices);
    const query = new GetAllDriverModuleDefinitionsQuery(
      7,
      undefined,
      undefined,
      'client-1',
    );

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([readModel]);
  });

  it('propagates a fail Result from the query service unchanged', async () => {
    const failResult = Result.fail<BaseModuleDefinitionSummaryReadModel[]>({
      code: 'ERR_9001',
      message: 'boom',
      severity: 'ERROR' as any,
    });
    const queryServices = createQueryServices({
      driverModuleDefinitionQueryService: {
        getAllDriverModuleDefinitions: jest.fn().mockResolvedValue(failResult),
      } as any,
    });
    const handler = new GetAllDriverModuleDefinitionsHandler(queryServices);
    const query = new GetAllDriverModuleDefinitionsQuery(
      7,
      undefined,
      undefined,
      'client-1',
    );

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });
});
