/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllKeyDefinitionsHandler} from '../../../../../src/application/definition/key-definition/get-all/get-all-key-definitions.handler.js';
import {GetAllKeyDefinitionsQuery} from '../../../../../src/application/definition/key-definition/get-all/get-all-key-definitions.query.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/key-value/key-value-definition-read-model.js';

describe('GetAllKeyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {getFileIdByProjectId: jest.fn()},
      keyValueDefQueryService: {getAllKeyDefinitions: jest.fn()},
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then maps key definitions to DTOs', async () => {
    const qs = buildQueryServices();
    (
      qs.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const keys: KeyDefinitionReadModel[] = [
      {
        systemId: 1,
        keyId: 100,
        name: 'MyKey',
        values: [],
        cHeaderAttributes: {enumMember: 'MY_KEY_ENUM', enumName: 'MY_KEY_NAME'},
        isVoice: true,
        isDynamic: false,
        isCalibrationKey: false,
        isGraphKey: false,
      },
    ];
    (
      qs.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(keys));

    const handler = new GetAllKeyDefinitionsHandler(qs);
    const result = await handler.handle(
      new GetAllKeyDefinitionsQuery(7, undefined, 'client-id'),
    );

    expect(qs.projectQueryService.getFileIdByProjectId).toHaveBeenCalledWith(7);
    expect(
      qs.keyValueDefQueryService.getAllKeyDefinitions,
    ).toHaveBeenCalledWith(42, undefined);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: '1',
      keyId: 100,
      name: 'MyKey',
      enumMember: 'MY_KEY_ENUM',
      enumName: 'MY_KEY_NAME',
      isVoice: true,
      isDynamic: false,
    });
  });

  it('maps value definitions to ValueDefinitionDto shape', async () => {
    const qs = buildQueryServices();
    (
      qs.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const keys: KeyDefinitionReadModel[] = [
      {
        systemId: 5,
        keyId: 200,
        name: 'KeyWithValues',
        values: [
          {systemId: 10, valueId: 1, name: 'Val1', enumMember: 'VAL1_ENUM'},
        ],
      },
    ];
    (
      qs.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(keys));

    const result = await new GetAllKeyDefinitionsHandler(qs).handle(
      new GetAllKeyDefinitionsQuery(7, undefined, 'client-id'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].values[0]).toMatchObject({
      systemId: '10',
      valueId: 1,
      name: 'Val1',
      enumMember: 'VAL1_ENUM',
    });
  });

  it('passes the keyId filter through to the query service', async () => {
    const qs = buildQueryServices();
    (
      qs.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      qs.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    await new GetAllKeyDefinitionsHandler(qs).handle(
      new GetAllKeyDefinitionsQuery(7, 123, 'client-id'),
    );

    expect(
      qs.keyValueDefQueryService.getAllKeyDefinitions,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('forwards a partial result — preserves issues array and maps data', async () => {
    const qs = buildQueryServices();
    (
      qs.projectQueryService.getFileIdByProjectId as jest.Mock
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
      qs.keyValueDefQueryService.getAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(partial);

    const result = await new GetAllKeyDefinitionsHandler(qs).handle(
      new GetAllKeyDefinitionsQuery(7, undefined, 'client-id'),
    );

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].systemId).toBe('1');
    expect(result.issues).toHaveLength(1);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const qs = buildQueryServices();
    (
      qs.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    await expect(
      new GetAllKeyDefinitionsHandler(qs).handle(
        new GetAllKeyDefinitionsQuery(7, undefined, 'client-id'),
      ),
    ).rejects.toThrow('Project not found');
    expect(
      qs.keyValueDefQueryService.getAllKeyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
