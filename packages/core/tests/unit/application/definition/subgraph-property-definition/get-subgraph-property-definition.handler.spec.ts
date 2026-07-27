/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetSubgraphPropertyDefinitionHandler} from '../../../../../src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.js';
import {GetSubgraphPropertyDefinitionQuery} from '../../../../../src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetSubgraphPropertyDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      subgraphPropertyDefQueryService: {
        getSubgraphPropertyDefinition: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the subgraph property definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const property: SubgraphPropertyDefinitionReadModel = {
      systemId: 1,
      propertyId: 100,
      name: 'MyProperty',
      propertyType: PROPERTY_TYPE.Spf,
      isVoice: true,
      maxSize: 4,
    };
    (
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition as jest.Mock
    ).mockResolvedValue(Result.ok(property));

    const handler = new GetSubgraphPropertyDefinitionHandler(queryServices);
    const query = new GetSubgraphPropertyDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition,
    ).toHaveBeenCalledWith(1, 42);
    expect(result).toBe(property);
  });

  it('throws ResourceNotFoundException when the property definition is not found', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition as jest.Mock
    ).mockResolvedValue(
      Result.fail({
        code: 'ENTITY_NOT_FOUND',
        message: 'SubgraphPropertyDefinition not found for systemId=999',
        severity: IssueSeverity.Error,
      }),
    );

    const handler = new GetSubgraphPropertyDefinitionHandler(queryServices);
    const query = new GetSubgraphPropertyDefinitionQuery(7, 999, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetSubgraphPropertyDefinitionHandler(queryServices);
    const query = new GetSubgraphPropertyDefinitionQuery(7, 1, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition,
    ).not.toHaveBeenCalled();
  });
});
