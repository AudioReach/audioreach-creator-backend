/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubgraphReadModel} from '../../../ports/persistence/query-services/subgraph/subgraph-read-model.js';
import type {SubgraphsQuery} from './subgraphs.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handles SubgraphsQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load subgraphs for the given systemIds via SubgraphQueryService.findMany() —
 *         resolves SGKV key-value pairs (full detail).
 */
export class SubgraphsQueryHandler implements QueryHandler<
  SubgraphsQuery,
  Promise<Result<SubgraphReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: SubgraphsQuery): Promise<Result<SubgraphReadModel[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.subgraphQueryService.findMany(
      query.systemIds,
      fileSystemId,
    );
  }
}
