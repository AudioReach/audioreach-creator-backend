/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve a single SPF module definition by system ID,
 * optionally enriched with customModuleData.
 */
export class GetSpfModuleDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly moduleSystemId: number,
    public readonly includeCustomData: boolean,
    clientId: string,
  ) {
    super(clientId);
  }
}
