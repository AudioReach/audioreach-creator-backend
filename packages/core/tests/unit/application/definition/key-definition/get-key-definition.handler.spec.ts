/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetKeyDefinitionHandler} from '../../../../../src/application/definition/key-definition/get-key/get-key-definition.handler.js';
import {GetKeyDefinitionQuery} from '../../../../../src/application/definition/key-definition/get-key/get-key-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {FAILED_ENTITY_REASON} from '../../../../../src/application/ports/persistence/batch-read.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/key-value/key-value-definition-read-model.js';

describe('GetKeyDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      keyValueDefQueryService: {
        findKeyDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the key definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const key: KeyDefinitionReadModel = {
      systemId: 1,
      naturalId: 100,
      name: 'MyKey',
      values: [],
    };
    (
      queryServices.keyValueDefQueryService.findKeyDefinitions as jest.Mock
    ).mockResolvedValue({items: [key], failed: []});

    const handler = new GetKeyDefinitionHandler(queryServices);
    const query = new GetKeyDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.keyValueDefQueryService.findKeyDefinitions,
    ).toHaveBeenCalledWith(42, [1]);
    expect(result.data).toMatchObject({
      systemId: '1',
      naturalId: 100,
      name: 'MyKey',
      values: [],
    });
  });

  it('throws ResourceNotFoundException when the key definition is not found', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.keyValueDefQueryService.findKeyDefinitions as jest.Mock
    ).mockResolvedValue({
      items: [],
      failed: [{systemId: 0x3e7, reason: FAILED_ENTITY_REASON.NotFound}],
    });

    const handler = new GetKeyDefinitionHandler(queryServices);
    const query = new GetKeyDefinitionQuery(7, 999, 'client-id');

    const error = await handler.handle(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResourceNotFoundException);
    expect(error).toMatchObject({
      issues: [
        {
          code: 'ENTITY_NOT_FOUND',
          message:
            'Key with systemId: 0x000003E7 was not found in this project.',
          impactedEntity: {entityType: 'KeyDefinition', systemId: 0x3e7},
        },
      ],
    });
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetKeyDefinitionHandler(queryServices);
    const query = new GetKeyDefinitionQuery(7, 1, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.keyValueDefQueryService.findKeyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
