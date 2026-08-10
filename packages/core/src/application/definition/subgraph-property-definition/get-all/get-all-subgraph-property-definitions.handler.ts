/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {GetAllSubgraphPropertyDefinitionsQuery} from './get-all-subgraph-property-definitions.query.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {
  mapSubgraphPropertyDefinitionSummary,
  type SubgraphPropertyDefinitionSummaryDto,
} from '../dto/subgraph-property-definition-dto.js';

/**
 * Handler for GetAllSubgraphPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists subgraph property definitions for that file.
 * A Fail result is converted to ResourceNotFoundException — handlers must throw a
 * DomainException on failure, never let Result.fail() reach toApiResult.
 */
export class GetAllSubgraphPropertyDefinitionsHandler implements QueryHandler<
  GetAllSubgraphPropertyDefinitionsQuery,
  Promise<Result<SubgraphPropertyDefinitionSummaryDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubgraphPropertyDefinitionsQuery,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryDto[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.subgraphPropertyDefQueryService.getAllSubgraphPropertyDefinitionsSummary(
        fileId,
        query.propertyDefinitionId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Failed to load subgraph property definitions for project ${query.projectId}`,
      );
    }

    const mapped = result.data.map(m =>
      mapSubgraphPropertyDefinitionSummary(m),
    );
    return result.issues?.length
      ? Result.partial(mapped, result.issues)
      : Result.ok(mapped);
  }
}
