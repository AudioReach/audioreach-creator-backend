/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SpfModuleReadModel} from '../../../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {SpfModuleTuningConfigReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {QuerySpfModulesQuery as SpfModuleQuery} from './query-spf-modules.query.js';
import {Result} from '../../../shared/Result/operation-result.js';

export interface SpfModuleDetailedReadModel {
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
 * Returns Result<SpfModuleDetailedReadModel>:
 *   - errors:   fatal failures (project not found, DB down)
 *   - warnings: partial failures (individual port or tuning config loads)
 */
export class SpfModuleQueryHandler implements QueryHandler<
  SpfModuleQuery,
  Promise<Result<SpfModuleDetailedReadModel>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: SpfModuleQuery,
  ): Promise<Result<SpfModuleDetailedReadModel>> {
    // Step 1 — resolve projectId → fileSystemId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Step 2 — load modules
    const modulesResult =
      await this.queryServices.spfModuleQueryService.findMany(
        query.systemIds,
        fileSystemId,
        true,
      );

    if (modulesResult.isFailure) {
      return Result.fail(
        ...(modulesResult.errors ?? [{message: 'Failed to load modules'}]),
      );
    }

    const modules = modulesResult.data;
    const warnings = [...(modulesResult.warnings ?? [])];

    const needsTuning =
      (query.includeCkvs || query.includeTags) && modules.length > 0;
    if (!needsTuning) {
      return Result.ok({modules}, warnings);
    }

    // Step 3 — load tuning catalogue for all modules in parallel
    // Tuning failures become warnings — modules are still returned
    const tuningResults = await Promise.all(
      modules.map(async m => {
        const tuningResult =
          await this.queryServices.spfModuleQueryService.spfTuningConfigService.getModuleTuningConfig(
            m.systemId,
            fileSystemId,
            query.includeCkvs,
            query.includeTags,
            true,
          );
        if (tuningResult.isFailure) {
          warnings.push({
            message: `Tuning config failed for module ${m.systemId}: ${tuningResult.errors?.[0]?.message}`,
          });
          return null;
        }
        warnings.push(...(tuningResult.warnings ?? []));
        return {moduleSystemId: m.systemId, tuningConfig: tuningResult.data};
      }),
    );

    const tuningConfigMap = new Map(
      tuningResults
        .filter(
          (
            r,
          ): r is {
            moduleSystemId: number;
            tuningConfig: SpfModuleTuningConfigReadModel;
          } => r !== null,
        )
        .map(r => [r.moduleSystemId, r.tuningConfig]),
    );

    return Result.ok({modules, tuningConfigMap}, warnings);
  }
}
