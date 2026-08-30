/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetSubgraphPropertyQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly subgraphSystemId: number;
  public readonly propertySystemId: number;

  constructor(
    projectId: number,
    subgraphSystemId: number,
    propertySystemId: number,
    clientId: string,
  ) {
    super(clientId);
    this.projectId = projectId;
    this.subgraphSystemId = subgraphSystemId;
    this.propertySystemId = propertySystemId;
  }
}
