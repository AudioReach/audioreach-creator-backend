/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {GetAllSubgraphPropertyDefinitionsQuery} from './get-all-subgraph-property-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handler for GetAllSubgraphPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists subgraph property definitions for that file.
 * Forwards the Result straight through — the controller decides the HTTP status.
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

    return this.queryServices.subgraphPropertyDefQueryService.getAllSubgraphPropertyDefinitions(
      fileId,
      query.propertyDefinitionId,
    );
  }
}
