/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve all property values for a specific subgraph instance,
 * with session overlay applied and binary payloads parsed to `ElementData[]`.
 *
 * Dispatched by `SubgraphController.getSubgraphProperties` and handled by
 * `GetSubgraphPropertiesHandler`.
 */
export class GetSubgraphPropertiesQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly subgraphSystemId: number;

  constructor(projectId: number, subgraphSystemId: number, clientId: string) {
    super(clientId);
    this.projectId = projectId;
    this.subgraphSystemId = subgraphSystemId;
  }
}
