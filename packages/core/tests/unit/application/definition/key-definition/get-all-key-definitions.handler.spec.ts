/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllKeyDefinitionsHandler} from '../../../../../src/application/definition/key-definition/get-all/get-all-key-definitions.handler.js';
import {GetAllKeyDefinitionsQuery} from '../../../../../src/application/definition/key-definition/get-all/get-all-key-definitions.query.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/key-value/key-value-definition-read-model.js';
import {RESULT_KIND} from '../../../../../dist/index.js';

describe('GetAllKeyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      keyValueDefQueryService: {
        getAllKeyDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then lists key definitions for that file', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const keys: KeyDefinitionReadModel[] = [
      {
        systemId: 1,
        keyId: 100,
        name: 'MyKey',
        values: [],
      },
    ];
    (
      queryServices.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(keys));

    const handler = new GetAllKeyDefinitionsHandler(queryServices);
    const query = new GetAllKeyDefinitionsQuery(7, undefined, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.keyValueDefQueryService.getAllKeyDefinitions,
    ).toHaveBeenCalledWith(42, undefined);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toBe(keys);
  });

  it('passes the keyId filter through to the query service', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    const handler = new GetAllKeyDefinitionsHandler(queryServices);
    const query = new GetAllKeyDefinitionsQuery(7, 123, 'client-id');

    await handler.handle(query);

    expect(
      queryServices.keyValueDefQueryService.getAllKeyDefinitions,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('forwards a partial result unchanged — does not collapse it into a failure', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const keys: KeyDefinitionReadModel[] = [
      {systemId: 1, keyId: 100, name: 'GoodKey', values: []},
    ];
    const partial = Result.partial(keys, [
      {
        code: 'INTERNAL_ERROR',
        message: 'Key 2: failed to resolve values',
        severity: IssueSeverity.Error,
      },
    ]);
    (
      queryServices.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(partial);

    const handler = new GetAllKeyDefinitionsHandler(queryServices);
    const query = new GetAllKeyDefinitionsQuery(7, undefined, 'client-id');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data).toBe(keys);
    expect(result.issues).toHaveLength(1);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetAllKeyDefinitionsHandler(queryServices);
    const query = new GetAllKeyDefinitionsQuery(7, undefined, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.keyValueDefQueryService.getAllKeyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
