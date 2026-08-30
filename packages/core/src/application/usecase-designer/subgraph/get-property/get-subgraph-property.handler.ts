/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {parseParameterData} from '../../shared/parse-elements.js';
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetSubgraphPropertyQuery} from './get-subgraph-property.query.js';
import type {PropertyDataDto} from '../../shared/property-read-model.js';

export class GetSubgraphPropertyHandler implements QueryHandler<
  GetSubgraphPropertyQuery,
  Promise<Result<PropertyDataDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphPropertyQuery,
  ): Promise<Result<PropertyDataDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const payloadsResult =
      await this.queryServices.subgraphQueryService.findPropertyPayloads(
        query.subgraphSystemId,
        fileSystemId,
      );
    if (payloadsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        payloadsResult.issues[0]?.message ??
          'Failed to load subgraph properties',
      );
    }
    if (payloadsResult.data === null) {
      throw new ResourceNotFoundException(
        `Subgraph ${query.subgraphSystemId} not found`,
      );
    }

    const payload = payloadsResult.data.find(
      p => p.propertySystemId === query.propertySystemId,
    );
    if (!payload) {
      throw new ResourceNotFoundException(
        `Property ${query.propertySystemId} not found on subgraph ${query.subgraphSystemId}`,
      );
    }

    const defResult =
      await this.queryServices.subgraphPropertyDefQueryService.getSubgraphPropertyDefinitionWithElements(
        query.propertySystemId,
        fileSystemId,
      );
    if (defResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        `Property definition ${query.propertySystemId} not found`,
      );
    }

    const elements =
      payload.payload !== null
        ? parseParameterData(payload.payload, defResult.data.elementsStructure)
        : [];

    return Result.ok({
      systemId: payload.systemId,
      propertyId: defResult.data.propertyId,
      propertyName: defResult.data.name,
      elements,
    });
  }
}
