/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetSubgraphPropertiesQuery} from './get-subgraph-properties.query.js';
import {buildPropertyModels} from '../../shared/build-property-models.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {mapPropertyToDto} from '../../../../shared/dto/property-dto.js';
import {
  mapSubgraphProperties,
  type SubgraphPropertiesDto,
} from '../dto/subgraph-properties-dto.js';

export class GetSubgraphPropertiesHandler implements QueryHandler<
  GetSubgraphPropertiesQuery,
  Promise<Result<SubgraphPropertiesDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphPropertiesQuery,
  ): Promise<Result<SubgraphPropertiesDto>> {
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
        `Subgraph with systemId ${query.subgraphSystemId} not found`,
      );
    }
    const payloads = payloadsResult.data;

    const definitionsResult =
      await this.queryServices.subgraphPropertyDefQueryService.getAllDetailedSubgraphPropertyDefinitionsWithElements(
        fileSystemId,
      );

    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        definitionsResult.issues[0]?.message ??
          'Failed to load subgraph property definitions',
      );
    }

    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    const rawResult = buildPropertyModels(payloads, defMap);

    if (rawResult.kind === RESULT_KIND.Fail) return rawResult;

    const dtos = rawResult.data.map(p => mapPropertyToDto(p));

    if (rawResult.kind === RESULT_KIND.Partial)
      return Result.partial(mapSubgraphProperties(dtos), rawResult.issues);
    return Result.ok(mapSubgraphProperties(dtos), rawResult.issues);
  }
}
