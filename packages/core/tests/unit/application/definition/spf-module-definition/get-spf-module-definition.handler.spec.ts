/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetSpfModuleDefinitionHandler} from '../../../../../src/application/definition/spf-module-definition/get-by-id/get-spf-module-definition.handler.js';
import {GetSpfModuleDefinitionQuery} from '../../../../../src/application/definition/spf-module-definition/get-by-id/get-spf-module-definition.query.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SpfModuleDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/spf-module-definition/spf-module-definition-read-model.js';
import type {CustomModuleMetadataReadModel} from '../../../../../src/application/ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/index.js';

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
      getSpfModuleDefinitionSummary: jest
        .fn()
        .mockResolvedValue(Result.ok(createReadModel())),
      getCustomModuleMetadata: jest
        .fn()
        .mockResolvedValue(Result.ok(createCustomModuleMetadata())),
    },
    ...overrides,
  }) as unknown as QueryServices;

describe('GetSpfModuleDefinitionHandler', () => {
  it('resolves fileSystemId from projectId before querying', async () => {
    const queryServices = createQueryServices();
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, false, 'client-1');

    await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.spfModuleDefinitionQueryService
        .getSpfModuleDefinitionSummary,
    ).toHaveBeenCalledWith(123, 42);
  });

  it('returns the read model on success', async () => {
    const readModel = createReadModel({systemId: 123});
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(Result.ok(readModel)),
        getCustomModuleMetadata: jest.fn(),
      } as any,
    });
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, false, 'client-1');

    const result = await handler.handle(query);

    expect(result).toEqual(readModel);
  });

  it('throws ResourceNotFoundException when the query service returns fail', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest.fn().mockResolvedValue(
          Result.fail({
            code: 'ERR_4004',
            message: 'SpfModuleDefinition not found for systemId=123',
            severity: 'ERROR' as any,
          }),
        ),
        getCustomModuleMetadata: jest.fn(),
      } as any,
    });
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, false, 'client-1');

    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('does not resolve customModuleData when includeCustomData is false', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(
            Result.ok(createReadModel({isCustomModule: true})),
          ),
        getCustomModuleMetadata: jest.fn(),
      } as any,
    });
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, false, 'client-1');

    const result = await handler.handle(query);

    expect(result.customModuleData).toBeUndefined();
    expect(
      queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata,
    ).not.toHaveBeenCalled();
  });

  it('does not resolve customModuleData when isCustomModule is false, even if includeCustomData is true', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(
            Result.ok(createReadModel({isCustomModule: false})),
          ),
        getCustomModuleMetadata: jest.fn(),
      } as any,
    });
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, true, 'client-1');

    const result = await handler.handle(query);

    expect(result.customModuleData).toBeUndefined();
    expect(
      queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata,
    ).not.toHaveBeenCalled();
  });

  it('resolves and attaches customModuleData when isCustomModule and includeCustomData are both true', async () => {
    const customModuleData = createCustomModuleMetadata();
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(
            Result.ok(createReadModel({systemId: 123, isCustomModule: true})),
          ),
        getCustomModuleMetadata: jest
          .fn()
          .mockResolvedValue(Result.ok(customModuleData)),
      } as any,
    });
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, true, 'client-1');

    const result = await handler.handle(query);

    expect(
      queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata,
    ).toHaveBeenCalledWith(123, 42);
    expect(result.customModuleData).toEqual(customModuleData);
  });

  it('sets customModuleData to null (not undefined, not throwing) when the metadata lookup fails', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(
            Result.ok(createReadModel({systemId: 123, isCustomModule: true})),
          ),
        getCustomModuleMetadata: jest.fn().mockResolvedValue(
          Result.fail({
            code: 'ERR_4004',
            message: 'No custom module metadata found',
            severity: 'ERROR' as any,
          }),
        ),
      } as any,
    });
    const handler = new GetSpfModuleDefinitionHandler(queryServices);
    const query = new GetSpfModuleDefinitionQuery(7, 123, true, 'client-1');

    const result = await handler.handle(query);

    expect(result.customModuleData).toBeNull();
  });
});
