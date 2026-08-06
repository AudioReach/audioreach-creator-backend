/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {GetAllSubgraphPropertyDefinitionsQuery} from './get-all-subgraph-property-definitions.query.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';

/**
 * Handler for GetAllSubgraphPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists subgraph property definitions for that file.
 * A Fail result is converted to ResourceNotFoundException — handlers must throw a
 * DomainException on failure, never let Result.fail() reach toApiResult.
 */
export class GetAllSubgraphPropertyDefinitionsHandler implements QueryHandler<
  GetAllSubgraphPropertyDefinitionsQuery,
  Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubgraphPropertyDefinitionsQuery,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>> {
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

    return result;
  }
}
