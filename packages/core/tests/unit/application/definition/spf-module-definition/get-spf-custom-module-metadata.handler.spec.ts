/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetSpfCustomModuleMetadataHandler} from '../../../../../src/application/definition/spf-module-definition/get-custom-module-metadata/get-spf-custom-module-metadata.handler.js';
import {GetSpfCustomModuleMetadataQuery} from '../../../../../src/application/definition/spf-module-definition/get-custom-module-metadata/get-spf-custom-module-metadata.query.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SpfModuleDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/spf-module-definition/spf-module-definition-read-model.js';
import type {CustomModuleMetadataReadModel} from '../../../../../src/application/ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../../src/shared/exceptions/index.js';

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
  isCustomModule: true,
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

describe('GetSpfCustomModuleMetadataHandler', () => {
  it('resolves fileSystemId from projectId before querying', async () => {
    const queryServices = createQueryServices();
    const handler = new GetSpfCustomModuleMetadataHandler(queryServices);
    const query = new GetSpfCustomModuleMetadataQuery(7, 123, 'client-1');

    await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.spfModuleDefinitionQueryService
        .getSpfModuleDefinitionSummary,
    ).toHaveBeenCalledWith(123, 42);
  });

  it('returns the custom module metadata on success', async () => {
    const customModuleData = createCustomModuleMetadata();
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(Result.ok(createReadModel({systemId: 123}))),
        getCustomModuleMetadata: jest
          .fn()
          .mockResolvedValue(Result.ok(customModuleData)),
      } as any,
    });
    const handler = new GetSpfCustomModuleMetadataHandler(queryServices);
    const query = new GetSpfCustomModuleMetadataQuery(7, 123, 'client-1');

    const result = await handler.handle(query);

    expect(result).toEqual(customModuleData);
    expect(
      queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata,
    ).toHaveBeenCalledWith(123, 42);
  });

  it('throws ResourceNotFoundException when the module definition does not exist', async () => {
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
    const handler = new GetSpfCustomModuleMetadataHandler(queryServices);
    const query = new GetSpfCustomModuleMetadataQuery(7, 123, 'client-1');

    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(
      queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata,
    ).not.toHaveBeenCalled();
  });

  it('throws InvalidOperationException (400) when the module is not a custom module', async () => {
    const queryServices = createQueryServices({
      spfModuleDefinitionQueryService: {
        getSpfModuleDefinitionSummary: jest
          .fn()
          .mockResolvedValue(
            Result.ok(createReadModel({systemId: 123, isCustomModule: false})),
          ),
        getCustomModuleMetadata: jest.fn(),
      } as any,
    });
    const handler = new GetSpfCustomModuleMetadataHandler(queryServices);
    const query = new GetSpfCustomModuleMetadataQuery(7, 123, 'client-1');

    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      InvalidOperationException,
    );
    expect(
      queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata,
    ).not.toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when no module_manager_data row exists for a custom module', async () => {
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
            message:
              'No custom module metadata found for module definition systemId=123',
            severity: 'ERROR' as any,
          }),
        ),
      } as any,
    });
    const handler = new GetSpfCustomModuleMetadataHandler(queryServices);
    const query = new GetSpfCustomModuleMetadataQuery(7, 123, 'client-1');

    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
