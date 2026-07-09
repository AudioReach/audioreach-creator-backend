/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubgraphReadModel} from '../../../ports/persistence/query-services/subgraph/subgraph-read-model.js';
import type {GetAllSubgraphsQuery} from './get-all-subgraphs.query.js';
import type {Result} from '../../../shared/result/result.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';

/**
 * Handles GetAllSubgraphsQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load all subgraphs for the file via SubgraphQueryService.findAll() —
 *         hardcodes FullDetails so SGKVs are resolved for every subgraph in
 *         the listing. GetAllSubgraphsQuery carries no includes param — this
 *         usecase always wants full detail; there is no summary-only caller today.
 *
 * findAll has no systemIds filter and returns the complete per-file
 * subgraph set — the handler just resolves fileSystemId and passes its
 * Result straight through.
 */
export class GetAllSubgraphsHandler implements QueryHandler<
  GetAllSubgraphsQuery,
  Promise<Result<SubgraphReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubgraphsQuery,
  ): Promise<Result<SubgraphReadModel[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.subgraphQueryService.findAll(
      fileSystemId,
      CONFIGURATION_INCLUDES.FullDetails,
    );
  }
}
