/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {BaseModuleDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/shared/module-definition-summary-read-model.js';
import type {GetAllDriverModuleDefinitionsQuery} from './get-all-driver-module-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handles GetAllDriverModuleDefinitionsQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load all matching module definition summaries, passing filters
 *         through unchanged — no per-row enrichment step exists for driver
 *         modules (unlike SPF's includeCustomData).
 */
export class GetAllDriverModuleDefinitionsHandler implements QueryHandler<
  GetAllDriverModuleDefinitionsQuery,
  Promise<Result<BaseModuleDefinitionSummaryReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllDriverModuleDefinitionsQuery,
  ): Promise<Result<BaseModuleDefinitionSummaryReadModel[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.driverModuleDefinitionQueryService.getAllDriverModuleDefinitions(
      fileSystemId,
      {
        moduleDefinitionNaturalId: query.moduleDefinitionId,
        parameterNaturalId: query.parameterId,
      },
    );
  }
}
