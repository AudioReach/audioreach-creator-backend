/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve subgraphs for a project.
 *
 * When systemIds is omitted, all subgraphs are returned. When supplied, the
 * result is filtered to those subgraph system IDs.
 */
export class GetAllSubgraphsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
    public readonly systemIds?: number[],
  ) {
    super(clientId);
  }
}
