/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllKeyDefinitionsHandler} from '../../../../../src/application/definition/key-definition/get-all/get-all-key-definitions.handler.js';
import {GetAllKeyDefinitionsQuery} from '../../../../../src/application/definition/key-definition/get-all/get-all-key-definitions.query.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/key-value/key-value-definition-read-model.js';

describe('GetAllKeyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {getFileIdByProjectId: jest.fn()},
      keyValueDefQueryService: {findAllKeyDefinitions: jest.fn()},
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then maps key definitions to DTOs', async () => {
    const qs = buildQueryServices();
    (
      qs.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const keys: KeyDefinitionReadModel[] = [
      {
        systemId: 1,
        naturalId: 100,
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
      qs.keyValueDefQueryService.findAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(keys);

    const handler = new GetAllKeyDefinitionsHandler(qs);
    const result = await handler.handle(
      new GetAllKeyDefinitionsQuery(7, undefined, 'client-id'),
    );

    expect(qs.projectQueryService.getFileIdByProjectId).toHaveBeenCalledWith(7);
    expect(
      qs.keyValueDefQueryService.findAllKeyDefinitions,
    ).toHaveBeenCalledWith(42, {naturalId: undefined});
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: '1',
      naturalId: 100,
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
        naturalId: 200,
        name: 'KeyWithValues',
        values: [
          {systemId: 10, naturalId: 1, name: 'Val1', enumMember: 'VAL1_ENUM'},
        ],
      },
    ];
    (
      qs.keyValueDefQueryService.findAllKeyDefinitions as jest.Mock
    ).mockResolvedValue(keys);

    const result = await new GetAllKeyDefinitionsHandler(qs).handle(
      new GetAllKeyDefinitionsQuery(7, undefined, 'client-id'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].values[0]).toMatchObject({
      systemId: '10',
      naturalId: 1,
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
      qs.keyValueDefQueryService.findAllKeyDefinitions as jest.Mock
    ).mockResolvedValue([]);

    await new GetAllKeyDefinitionsHandler(qs).handle(
      new GetAllKeyDefinitionsQuery(7, 123, 'client-id'),
    );

    expect(
      qs.keyValueDefQueryService.findAllKeyDefinitions,
    ).toHaveBeenCalledWith(42, {naturalId: 123});
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
      qs.keyValueDefQueryService.findAllKeyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
