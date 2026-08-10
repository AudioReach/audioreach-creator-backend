/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetKeyDefinitionHandler} from '../../../../../src/application/definition/key-definition/get-key/get-key-definition.handler.js';
import {GetKeyDefinitionQuery} from '../../../../../src/application/definition/key-definition/get-key/get-key-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/key-value/key-value-definition-read-model.js';

describe('GetKeyDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      keyValueDefQueryService: {
        getByKeyDefinition: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the key definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const key: KeyDefinitionReadModel = {
      systemId: 1,
      keyId: 100,
      name: 'MyKey',
      values: [],
    };
    (
      queryServices.keyValueDefQueryService.getByKeyDefinition as jest.Mock
    ).mockResolvedValue(Result.ok(key));

    const handler = new GetKeyDefinitionHandler(queryServices);
    const query = new GetKeyDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.keyValueDefQueryService.getByKeyDefinition,
    ).toHaveBeenCalledWith(1, 42);
    expect(result.data).toMatchObject({
      systemId: '1',
      keyId: 100,
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
      queryServices.keyValueDefQueryService.getByKeyDefinition as jest.Mock
    ).mockResolvedValue(
      Result.fail({
        code: 'ENTITY_NOT_FOUND',
        message: 'KeyDefinition not found for systemId=999',
        severity: IssueSeverity.Error,
      }),
    );

    const handler = new GetKeyDefinitionHandler(queryServices);
    const query = new GetKeyDefinitionQuery(7, 999, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow(
      ResourceNotFoundException,
    );
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
      queryServices.keyValueDefQueryService.getByKeyDefinition,
    ).not.toHaveBeenCalled();
  });
});
