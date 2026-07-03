/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve all driver module definitions for a project, optionally
 * filtered by moduleDefinitionId/parameterId (AND semantics).
 *
 * projectId: raw project system ID — resolved to fileSystemId inside the
 *            handler via ProjectQueryService (same pattern as
 *            GetAllSpfModuleDefinitionsQuery).
 */
export class GetAllDriverModuleDefinitionsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly moduleDefinitionId: number | undefined,
    public readonly parameterId: number | undefined,
    clientId: string,
  ) {
    super(clientId);
  }
}
