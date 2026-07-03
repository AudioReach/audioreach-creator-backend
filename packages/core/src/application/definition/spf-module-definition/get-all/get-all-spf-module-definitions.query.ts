/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export interface SpfModuleDefinitionFilters {
  processorNaturalId?: number;
  moduleDefinitionNaturalId?: number;
  parameterNaturalId?: number;
}

/**
 * Query to retrieve all SPF module definitions for a project, optionally
 * filtered by processorId/moduleDefinitionId/parameterId (AND semantics)
 * and optionally enriched with customModuleData.
 *
 * projectId: raw project system ID — resolved to fileSystemId inside the
 *            handler via ProjectQueryService (same pattern as ContainerQuery).
 */
export class GetAllSpfModuleDefinitionsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly filters: SpfModuleDefinitionFilters,
    public readonly includeCustomData: boolean,
    clientId: string,
  ) {
    super(clientId);
  }
}
