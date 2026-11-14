/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {Result} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
import type {Result as ResultType} from '../../../shared/result/result.js';
import type {SubgraphDto} from '../dto/subgraph-dto.js';
import {mapSubgraph} from '../dto/subgraph-dto.js';
import type {GetAllSubgraphsQuery} from './get-all-subgraphs.query.js';

export class GetAllSubgraphsHandler implements QueryHandler<
  GetAllSubgraphsQuery,
  Promise<ResultType<SubgraphDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubgraphsQuery,
  ): Promise<ResultType<SubgraphDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const {subgraphQueryService} = this.queryServices;
    const includes = CONFIGURATION_INCLUDES.FullDetails;
    const batch =
      query.systemIds === undefined
        ? await subgraphQueryService.findAllSubgraphs(fileSystemId, includes)
        : await subgraphQueryService.findSubgraphs(
            fileSystemId,
            query.systemIds,
            includes,
          );

    const dtos = batch.items.map(subgraph => mapSubgraph(subgraph));
    if (batch.failed.length === 0) return Result.ok(dtos);
    return Result.partial(dtos, failedToIssues(batch));
  }
}
