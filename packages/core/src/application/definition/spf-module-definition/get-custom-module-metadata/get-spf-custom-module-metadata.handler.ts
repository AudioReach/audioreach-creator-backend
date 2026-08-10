/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetSpfCustomModuleMetadataQuery} from './get-spf-custom-module-metadata.query.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {
  mapCustomModuleMetadata,
  type CustomModuleMetadataDto,
} from './custom-module-metadata-dto.js';

/**
 * Handles GetSpfCustomModuleMetadataQuery.
 *
 * Per LLD §4.3:
 * 1. Resolve fileSystemId (404 if project missing).
 * 2. Look up the module definition summary — 404 if not found,
 *    400 (InvalidOperationException) if isCustomModule is false.
 * 3. Load custom module metadata — returns null if no module_manager_data
 *    row exists (a valid, expected state, not an error); the controller
 *    decides how to surface that.
 */
export class GetSpfCustomModuleMetadataHandler implements QueryHandler<
  GetSpfCustomModuleMetadataQuery,
  Promise<CustomModuleMetadataDto | null>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSpfCustomModuleMetadataQuery,
  ): Promise<CustomModuleMetadataDto | null> {
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
      throw new Error(
        metaResult.issues[0]?.message ??
          `Failed to load custom module metadata for module definition ${query.moduleSystemId}`,
      );
    }

    return metaResult.data ? mapCustomModuleMetadata(metaResult.data) : null;
  }
}
