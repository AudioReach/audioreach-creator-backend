/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SpfModuleReadModel} from '../../../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {SpfModuleTuningConfigReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {QuerySpfModulesQuery} from './query-spf-modules.query.js';

export interface QuerySpfModulesResult {
  modules: SpfModuleReadModel[];
  tuningConfigMap?: Map<number, SpfModuleTuningConfigReadModel>; // present only when includeCkvs or includeTags=true
}

/**
 * Handles QuerySpfModulesQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load SPF modules via SpfModuleQueryService.findMany()
 * Step 3: If includeCkvs or includeTags, load tuning catalogue in parallel
 *         via SpfTuningConfigService for each module
 *
 * Unknown systemIds are silently omitted (partial result).
 */
export class QuerySpfModulesHandler implements QueryHandler<
  QuerySpfModulesQuery,
  Promise<QuerySpfModulesResult>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QuerySpfModulesQuery): Promise<QuerySpfModulesResult> {
    // Step 1 — resolve projectId → fileSystemId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Step 2 — load modules
    const modules = await this.queryServices.spfModuleQueryService.findMany(
      query.systemIds,
      fileSystemId,
      true,
    );

    const needsTuning =
      (query.includeCkvs || query.includeTags) && modules.length > 0;
    if (!needsTuning) {
      return {modules};
    }

    // Step 3 — load tuning catalogue for all modules in parallel
    const tuningResults = await Promise.all(
      modules.map(async m => ({
        moduleSystemId: m.systemId,
        tuningConfig:
          await this.queryServices.spfModuleQueryService.spfTuningConfigService.getModuleTuningConfig(
            m.systemId,
            fileSystemId,
            query.includeCkvs,
            query.includeTags,
            true,
          ),
      })),
    );

    return {
      modules,
      tuningConfigMap: new Map(
        tuningResults.map(r => [r.moduleSystemId, r.tuningConfig]),
      ),
    };
  }
}
