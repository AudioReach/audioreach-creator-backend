/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SpfModuleDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/spf-module-definition/spf-module-definition-read-model.js';
import type {CustomModuleMetadataReadModel} from '../../../ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
import type {GetAllSpfModuleDefinitionsQuery} from './get-all-spf-module-definitions.query.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';

/**
 * Read model for a module definition summary enriched with resolved
 * customModuleData. Lives here, not as a query-service read model — the
 * LLD is explicit that customModuleData resolution is a handler/controller
 * boundary concern, not sourced from the query service itself (mirrors how
 * changeInfo is handled elsewhere).
 */
export interface SpfModuleDefinitionSummaryWithCustomData extends SpfModuleDefinitionSummaryReadModel {
  readonly customModuleData?: CustomModuleMetadataReadModel | null;
}

/**
 * Handles GetAllSpfModuleDefinitionsQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load all matching module definition summaries
 * Step 3: When includeCustomData, batch-resolve customModuleData for every
 *         isCustomModule row in one query (getCustomModuleMetadataBySystemIds)
 *         instead of one getCustomModuleMetadata call per row. A module
 *         missing from the batched result (no module_manager_data row) is
 *         expected — not every custom module necessarily has metadata
 *         populated — and resolves to customModuleData: null with no issue
 *         raised.
 */
export class GetAllSpfModuleDefinitionsHandler implements QueryHandler<
  GetAllSpfModuleDefinitionsQuery,
  Promise<Result<SpfModuleDefinitionSummaryWithCustomData[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSpfModuleDefinitionsQuery,
  ): Promise<Result<SpfModuleDefinitionSummaryWithCustomData[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.spfModuleDefinitionQueryService.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        query.filters,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Failed to load SPF module definitions for project ${query.projectId}`,
      );
    }
    if (!query.includeCustomData) return result;

    const customModuleSystemIds = result.data
      .filter(row => row.isCustomModule)
      .map(row => row.systemId);

    const metadataBySystemId =
      await this.queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadataBySystemIds(
        customModuleSystemIds,
        fileSystemId,
      );

    const enriched = result.data.map(row => {
      if (!row.isCustomModule) return row;

      const customModuleData = metadataBySystemId.get(row.systemId);
      return {...row, customModuleData: customModuleData ?? null};
    });

    return result.issues?.length
      ? Result.partial(enriched, result.issues)
      : Result.ok(enriched);
  }
}
