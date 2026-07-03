/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllSpfModuleDefinitionsHandler} from '../../../../../src/application/definition/spf-module-definition/get-all/get-all-spf-module-definitions.handler.js';
import {GetAllSpfModuleDefinitionsQuery} from '../../../../../src/application/definition/spf-module-definition/get-all/get-all-spf-module-definitions.query.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SpfModuleDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/spf-module-definition/spf-module-definition-read-model.js';
import type {CustomModuleMetadataReadModel} from '../../../../../src/application/ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';

const createReadModel = (
  overrides?: Partial<SpfModuleDefinitionSummaryReadModel>,
): SpfModuleDefinitionSummaryReadModel => ({
  systemId: 1,
  moduleId: 100,
  name: 'SpfModule',
  parameterDefinitions: [],
  processorInfo: {systemId: 1, processorId: 1, name: 'Processor'},
  builtIn: false,
  moduleInfo: {
    pidFramework: 0,
    containerTypeInfo: [],
    inputDataPortInfo: null,
    outputDataPortInfo: null,
    staticCtrlPorts: [],
    dynamicIntents: [],
  },
  isLoadedAtBootup: false,
  isCustomModule: false,
  ...overrides,
});

const createCustomModuleMetadata = (): CustomModuleMetadataReadModel => ({
  type: {name: 'Type', value: '1'},
  interface: {
    type: {name: 'InterfaceType', value: '1'},
    version: {name: 'InterfaceVersion', value: '1'},
  },
  fileName: 'file.so',
  endPointFunctionTag: 'tag',
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
    spfModuleDefinitionQueryService: {
      getAllSpfModuleDefinitionSummaries: jest
        .fn()
        .mockResolvedValue(Result.ok([createReadModel()])),
      getCustomModuleMetadataBySystemIds: jest
        .fn()
        .mockResolvedValue(new Map()),
    },
    ...overrides,
  }) as unknown as QueryServices;

describe('GetAllSpfModuleDefinitionsHandler', () => {
  it('resolves fileSystemId from projectId before querying', async () => {
    const queryServices = createQueryServices();
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, false, 'client-1');

    await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
  });

  it('passes filters through to the query service', async () => {
    const queryServices = createQueryServices();
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const filters = {
      processorNaturalId: 11,
      moduleDefinitionNaturalId: 22,
      parameterNaturalId: 33,
    };
    const query = new GetAllSpfModuleDefinitionsQuery(
      7,
      filters,
      false,
      'client-1',
    );

    await handler.handle(query);

    expect(
      queryServices.spfModuleDefinitionQueryService
        .getAllSpfModuleDefinitionSummaries,
    ).toHaveBeenCalledWith(42, filters);
  });

  it('does not resolve customModuleData when includeCustomData is false', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getAllSpfModuleDefinitionSummaries: jest
          .fn()
          .mockResolvedValue(
            Result.ok([createReadModel({isCustomModule: true})]),
          ),
        getCustomModuleMetadataBySystemIds: jest.fn(),
      } as any,
    });
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, false, 'client-1');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(
      queryServices.spfModuleDefinitionQueryService
        .getCustomModuleMetadataBySystemIds,
    ).not.toHaveBeenCalled();
  });

  it('calls getCustomModuleMetadataBySystemIds once with only the custom-module systemIds, not per row', async () => {
    const readModels = [
      createReadModel({systemId: 1, isCustomModule: false}),
      createReadModel({systemId: 2, isCustomModule: true}),
      createReadModel({systemId: 3, isCustomModule: true}),
    ];
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getAllSpfModuleDefinitionSummaries: jest
          .fn()
          .mockResolvedValue(Result.ok(readModels)),
        getCustomModuleMetadataBySystemIds: jest
          .fn()
          .mockResolvedValue(new Map()),
      } as any,
    });
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, true, 'client-1');

    await handler.handle(query);

    expect(
      queryServices.spfModuleDefinitionQueryService
        .getCustomModuleMetadataBySystemIds,
    ).toHaveBeenCalledTimes(1);
    expect(
      queryServices.spfModuleDefinitionQueryService
        .getCustomModuleMetadataBySystemIds,
    ).toHaveBeenCalledWith([2, 3], 42);
  });

  it('does not call getCustomModuleMetadataBySystemIds when no row is a custom module, even when includeCustomData is true', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getAllSpfModuleDefinitionSummaries: jest
          .fn()
          .mockResolvedValue(
            Result.ok([createReadModel({isCustomModule: false})]),
          ),
        getCustomModuleMetadataBySystemIds: jest
          .fn()
          .mockResolvedValue(new Map()),
      } as any,
    });
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, true, 'client-1');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(
      queryServices.spfModuleDefinitionQueryService
        .getCustomModuleMetadataBySystemIds,
    ).toHaveBeenCalledWith([], 42);
  });

  it('resolves and attaches customModuleData for rows where isCustomModule and includeCustomData are both true', async () => {
    const readModel = createReadModel({systemId: 9, isCustomModule: true});
    const customModuleData = createCustomModuleMetadata();
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getAllSpfModuleDefinitionSummaries: jest
          .fn()
          .mockResolvedValue(Result.ok([readModel])),
        getCustomModuleMetadataBySystemIds: jest
          .fn()
          .mockResolvedValue(new Map([[9, customModuleData]])),
      } as any,
    });
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, true, 'client-1');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].customModuleData).toEqual(customModuleData);
  });

  it('resolves customModuleData to null with no issue when a custom module is missing from the batched metadata result', async () => {
    const readModel = createReadModel({systemId: 9, isCustomModule: true});
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getAllSpfModuleDefinitionSummaries: jest
          .fn()
          .mockResolvedValue(Result.ok([readModel])),
        getCustomModuleMetadataBySystemIds: jest
          .fn()
          .mockResolvedValue(new Map()),
      } as any,
    });
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, true, 'client-1');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].customModuleData).toBeNull();
  });

  it('throws ResourceNotFoundException when the query service returns a fail Result', async () => {
    const failResult = Result.fail<SpfModuleDefinitionSummaryReadModel[]>({
      code: 'ERR_9001',
      message: 'boom',
      severity: 'ERROR' as any,
    });
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getAllSpfModuleDefinitionSummaries: jest
          .fn()
          .mockResolvedValue(failResult),
        getCustomModuleMetadataBySystemIds: jest.fn(),
      } as any,
    });
    const handler = new GetAllSpfModuleDefinitionsHandler(queryServices);
    const query = new GetAllSpfModuleDefinitionsQuery(7, {}, false, 'client-1');

    await expect(handler.handle(query)).rejects.toThrow('boom');
    expect(
      queryServices.spfModuleDefinitionQueryService
        .getCustomModuleMetadataBySystemIds,
    ).not.toHaveBeenCalled();
  });
});
