/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve all Subgraph instances for a project.
 *
 * projectId: raw project system ID — resolved to fileSystemId inside the
 *            handler via ProjectQueryService (same pattern as ContainerQuery)
 *
 * No systemIds — SubgraphQueryService.findAll returns every subgraph for
 * the resolved fileSystemId; there is no id-scoped lookup on this path.
 * No includes field — GetAllSubgraphsHandler always requests FullDetails
 * (sgkvs resolved for every subgraph); there is no summary-only caller today.
 */
export class GetAllSubgraphsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
