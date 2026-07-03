/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetDriverModuleDefinitionHandler} from '../../../../../src/application/definition/driver-module-definition/get-by-id/get-driver-module-definition.handler.js';
import {GetDriverModuleDefinitionQuery} from '../../../../../src/application/definition/driver-module-definition/get-by-id/get-driver-module-definition.query.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {DriverModuleDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/driver-module-definition/driver-module-definition-read-model.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/index.js';

const createReadModel = (
  overrides?: Partial<DriverModuleDefinitionSummaryReadModel>,
): DriverModuleDefinitionSummaryReadModel => ({
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
      getDriverModuleDefinition: jest
        .fn()
        .mockResolvedValue(Result.ok(createReadModel())),
    },
    ...overrides,
  }) as unknown as QueryServices;

describe('GetDriverModuleDefinitionHandler', () => {
  it('resolves fileSystemId from projectId before querying', async () => {
    const queryServices = createQueryServices();
    const handler = new GetDriverModuleDefinitionHandler(queryServices);
    const query = new GetDriverModuleDefinitionQuery(7, 123, 'client-1');

    await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.driverModuleDefinitionQueryService
        .getDriverModuleDefinition,
    ).toHaveBeenCalledWith(123, 42);
  });

  it('returns the read model on success', async () => {
    const readModel = createReadModel({systemId: 123});
    const queryServices = createQueryServices({
      driverModuleDefinitionQueryService: {
        getDriverModuleDefinition: jest
          .fn()
          .mockResolvedValue(Result.ok(readModel)),
      } as any,
    });
    const handler = new GetDriverModuleDefinitionHandler(queryServices);
    const query = new GetDriverModuleDefinitionQuery(7, 123, 'client-1');

    const result = await handler.handle(query);

    expect(result).toEqual(readModel);
  });

  it('throws ResourceNotFoundException when the query service returns fail', async () => {
    const queryServices = createQueryServices({
      driverModuleDefinitionQueryService: {
        getDriverModuleDefinition: jest.fn().mockResolvedValue(
          Result.fail<DriverModuleDefinitionSummaryReadModel>({
            code: 'ERR_4004',
            message: 'DriverModuleDefinition not found for systemId=123',
            severity: 'ERROR' as any,
          }),
        ),
      } as any,
    });
    const handler = new GetDriverModuleDefinitionHandler(queryServices);
    const query = new GetDriverModuleDefinitionQuery(7, 123, 'client-1');

    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
