/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetAllDriverModuleDefinitionsQuery} from './get-all-driver-module-definitions.query.js';
import {type Result, RESULT_KIND} from '../../../shared/result/result.js';
import {
  mapDriverModuleDefinition,
  type DriverModuleDefinitionDto,
} from '../dto/driver-module-definition-dto.js';

/**
 * Handles GetAllDriverModuleDefinitionsQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load all matching module definition summaries, passing filters
 *         through unchanged — no per-row enrichment step exists for driver
 *         modules (unlike SPF's includeCustomData). The Result (Ok/Partial/
 *         Fail) from the query service is forwarded unchanged; AllExceptionsFilter
 *         handles any Fail that reaches toApiResult.
 */
export class GetAllDriverModuleDefinitionsHandler implements QueryHandler<
  GetAllDriverModuleDefinitionsQuery,
  Promise<Result<DriverModuleDefinitionDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllDriverModuleDefinitionsQuery,
  ): Promise<Result<DriverModuleDefinitionDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.driverModuleDefinitionQueryService.getAllDriverModuleDefinitions(
        fileSystemId,
        {
          moduleDefinitionNaturalId: query.moduleDefinitionId,
          parameterNaturalId: query.parameterId,
        },
      );

    if (result.kind === RESULT_KIND.Fail) return result;

    const mapped = result.data.map(row => mapDriverModuleDefinition(row));
    return result.kind === RESULT_KIND.Partial
      ? {kind: RESULT_KIND.Partial, data: mapped, issues: result.issues}
      : {kind: RESULT_KIND.Ok, data: mapped, issues: result.issues};
  }
}
