/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
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

    const result =
      await this.queryServices.subgraphQueryService.getAllSubgraphs(
        fileSystemId,
        CONFIGURATION_INCLUDES.FullDetails,
        query.systemIds,
      );

    if (result.kind === RESULT_KIND.Fail) return Result.fail(...result.issues);

    const dtos = result.data.map(subgraph => mapSubgraph(subgraph));

    if (result.kind === RESULT_KIND.Partial)
      return Result.partial(dtos, result.issues);
    return Result.ok(dtos, result.issues);
  }
}
