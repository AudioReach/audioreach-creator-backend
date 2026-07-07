/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve all Container instances for a project.
 *
 * projectId: raw project system ID — resolved to fileSystemId inside the
 *            handler via ProjectQueryService (same pattern as SpfModulesQuery)
 *
 * No systemIds — ContainerQueryService.findAll returns every container for
 * the resolved fileSystemId; there is no id-scoped lookup on this path.
 */
export class ContainerQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
