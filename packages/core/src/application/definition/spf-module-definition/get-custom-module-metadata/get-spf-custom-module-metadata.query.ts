/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve custom module metadata for a single SPF module
 * definition, identified by its system ID.
 */
export class GetSpfCustomModuleMetadataQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly moduleSystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
