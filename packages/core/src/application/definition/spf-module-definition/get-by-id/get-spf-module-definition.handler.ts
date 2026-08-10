/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetSpfModuleDefinitionQuery} from './get-spf-module-definition.query.js';
import type {SpfModuleDefinitionSummaryWithCustomData} from '../get-all/get-all-spf-module-definitions.handler.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {
  mapSpfModuleDefinition,
  type SpfModuleDefinitionDto,
} from '../dto/spf-module-definition-dto.js';

/**
 * Handles GetSpfModuleDefinitionQuery.
 *
 * Single-item lookup — throws ResourceNotFoundException on failure rather
 * than returning Result, matching the convention used for other definition
 * get-by-id handlers (contrasted with the Result-passthrough convention
 * used for list endpoints).
 */
export class GetSpfModuleDefinitionHandler implements QueryHandler<
  GetSpfModuleDefinitionQuery,
  Promise<SpfModuleDefinitionDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSpfModuleDefinitionQuery,
  ): Promise<SpfModuleDefinitionDto> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.spfModuleDefinitionQueryService.getSpfModuleDefinitionSummary(
        query.moduleSystemId,
        fileSystemId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `SPF module definition with system ID ${query.moduleSystemId} not found`,
      );
    }

    const row = result.data;
    let enriched: SpfModuleDefinitionSummaryWithCustomData = row;

    if (query.includeCustomData && row.isCustomModule) {
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

      enriched = {...row, customModuleData: metaResult.data};
    }

    return mapSpfModuleDefinition(enriched);
  }
}
