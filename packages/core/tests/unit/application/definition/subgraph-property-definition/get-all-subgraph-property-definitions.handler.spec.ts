/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllSubgraphPropertyDefinitionsHandler} from '../../../../../src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.js';
import {GetAllSubgraphPropertyDefinitionsQuery} from '../../../../../src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetAllSubgraphPropertyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      subgraphPropertyDefQueryService: {
        getAllSubgraphPropertyDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then lists subgraph property definitions for that file', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const properties: SubgraphPropertyDefinitionSummaryReadModel[] = [
      {
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
        propertyType: PROPERTY_TYPE.Spf,
        isVoice: true,
      },
    ];
    (
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(properties));

    const handler = new GetAllSubgraphPropertyDefinitionsHandler(queryServices);
    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions,
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
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    const handler = new GetAllSubgraphPropertyDefinitionsHandler(queryServices);
    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      7,
      123,
      'client-id',
    );

    await handler.handle(query);

    expect(
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetAllSubgraphPropertyDefinitionsHandler(queryServices);
    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
