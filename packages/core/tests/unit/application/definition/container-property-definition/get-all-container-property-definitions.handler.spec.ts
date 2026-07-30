/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllContainerPropertyDefinitionsHandler} from '../../../../../src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.handler.js';
import {GetAllContainerPropertyDefinitionsQuery} from '../../../../../src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.query.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {PropertyDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/property-definition/property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetAllContainerPropertyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      containerPropertyDefQueryService: {
        getAllContainerPropertyDefinitionsSummary: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then lists container property definitions for that file', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const properties: PropertyDefinitionSummaryReadModel[] = [
      {
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
        propertyType: PROPERTY_TYPE.Spf,
      },
    ];
    (
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitionsSummary as jest.Mock
    ).mockResolvedValue(Result.ok(properties));

    const handler = new GetAllContainerPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllContainerPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitionsSummary,
    ).toHaveBeenCalledWith(42, undefined);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toBe(properties);
  });

  it('passes the propertyDefinitionId filter through to the query service', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitionsSummary as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    const handler = new GetAllContainerPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllContainerPropertyDefinitionsQuery(
      7,
      123,
      'client-id',
    );

    await handler.handle(query);

    expect(
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitionsSummary,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetAllContainerPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllContainerPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitionsSummary,
    ).not.toHaveBeenCalled();
  });
});
