/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve Container instances for a project.
 *
 * projectId: raw project system ID — resolved to fileSystemId inside the
 *            handler via ProjectQueryService (same pattern as SpfModulesQuery)
 *
 * When systemIds is omitted, all containers are returned. When supplied, the
 * result is filtered to those container system IDs.
 */
export class ContainerQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
    public readonly systemIds?: number[],
  ) {
    super(clientId);
  }
}
