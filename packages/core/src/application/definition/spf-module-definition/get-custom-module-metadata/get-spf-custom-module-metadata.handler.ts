/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {CustomModuleMetadataReadModel} from '../../../ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
import type {GetSpfCustomModuleMetadataQuery} from './get-spf-custom-module-metadata.query.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

/**
 * Handles GetSpfCustomModuleMetadataQuery.
 *
 * Per LLD §4.3:
 * 1. Resolve fileSystemId (404 if project missing).
 * 2. Look up the module definition summary — 404 if not found,
 *    400 (InvalidOperationException) if isCustomModule is false.
 * 3. Load custom module metadata — 404 if no module_manager_data row exists.
 */
export class GetSpfCustomModuleMetadataHandler implements QueryHandler<
  GetSpfCustomModuleMetadataQuery,
  Promise<CustomModuleMetadataReadModel>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSpfCustomModuleMetadataQuery,
  ): Promise<CustomModuleMetadataReadModel> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const summaryResult =
      await this.queryServices.spfModuleDefinitionQueryService.getSpfModuleDefinitionSummary(
        query.moduleSystemId,
        fileSystemId,
      );

    if (summaryResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        summaryResult.issues[0]?.message ??
          `SPF module definition with system ID ${query.moduleSystemId} not found`,
      );
    }

    if (!summaryResult.data.isCustomModule) {
      throw new InvalidOperationException(
        `SPF module definition with system ID ${query.moduleSystemId} is not a custom module`,
      );
    }

    const metaResult =
      await this.queryServices.spfModuleDefinitionQueryService.getCustomModuleMetadata(
        query.moduleSystemId,
        fileSystemId,
      );

    if (metaResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        metaResult.issues[0]?.message ??
          `No custom module metadata found for module definition ${query.moduleSystemId}`,
      );
    }

    return metaResult.data;
  }
}
