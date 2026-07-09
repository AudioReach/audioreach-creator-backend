/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve Subgraph instances for a given set of system IDs.
 *
 * projectId: raw project system ID — resolved to fileSystemId inside the
 *            handler via ProjectQueryService (same pattern as ContainerQuery)
 * systemIds: subgraph instance system IDs (subgraphs.system_id)
 *
 * Returns full-detail read models — sgkvs resolved (see SubgraphQueryService.findMany).
 */
export class SubgraphsQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
