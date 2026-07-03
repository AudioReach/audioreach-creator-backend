/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve a single driver module definition by system ID.
 */
export class GetDriverModuleDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly moduleSystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
