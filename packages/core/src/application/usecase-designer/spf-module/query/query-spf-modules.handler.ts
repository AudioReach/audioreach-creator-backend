/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SpfModuleReadModel} from '../../../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {
  CkvReadModel,
  TagReadModel,
} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {SpfModulesQuery as SpfModuleQuery} from './query-spf-modules.query.js';
import {Result} from '../../../shared/Result/operation-result.js';

export interface SpfModuleDetailedReadModel {
  modules: SpfModuleReadModel[];
  // Present when includeCkvs/includeTags=true — one entry per requested module,
  // regardless of outcome. Result.ok([]) means the module genuinely has none;
  // Result.fail(...) means loading that module's data errored. Callers must
  // check isSuccess/isFailure per entry rather than inferring from absence.
  ckvsByModule?: Map<number, Result<CkvReadModel[]>>;
  tagsByModule?: Map<number, Result<TagReadModel[]>>;
}

/**
 * Handles SpfModulesQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load SPF modules via SpfModuleQueryService.findMany()
 * Step 3: Load CKVs and tags in parallel across all modules — one call per module per concern
 *
 * Unknown systemIds are silently omitted — partial result.
 * Per-module CKV/tag failures are captured as Result.fail entries in
 * ckvsByModule/tagsByModule — every requested module gets an entry either way.
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
      );

    if (modulesResult.isFailure) {
      return Result.fail(
        ...(modulesResult.errors ?? [{message: 'Failed to load modules'}]),
      );
    }

    const modules = modulesResult.data;

    if (modules.length === 0 || (!query.includeCkvs && !query.includeTags)) {
      return Result.ok({modules});
    }

    // Step 3 — load CKVs and tags in parallel across all modules
    // Independent collections — each loads and fails independently per module
    const [ckvsByModule, tagsByModule] = await Promise.all([
      query.includeCkvs
        ? this.loadCkvsForModules(modules, fileSystemId)
        : undefined,
      query.includeTags
        ? this.loadTagsForModules(modules, fileSystemId)
        : undefined,
    ]);

    return Result.ok({modules, ckvsByModule, tagsByModule});
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async loadCkvsForModules(
    modules: SpfModuleReadModel[],
    fileSystemId: number,
  ): Promise<Map<number, Result<CkvReadModel[]>>> {
    const entries = await Promise.all(
      modules.map(async m => {
        const result =
          await this.queryServices.spfTuningConfigService.getModuleCkvs(
            m.systemId,
            fileSystemId,
            {summary: true},
          );
        return [m.systemId, result] as [number, Result<CkvReadModel[]>];
      }),
    );
    return new Map(entries);
  }

  private async loadTagsForModules(
    modules: SpfModuleReadModel[],
    fileSystemId: number,
  ): Promise<Map<number, Result<TagReadModel[]>>> {
    const entries = await Promise.all(
      modules.map(async m => {
        const result =
          await this.queryServices.spfTuningConfigService.getModuleTags(
            m.systemId,
            fileSystemId,
            {summary: true},
          );
        return [m.systemId, result] as [number, Result<TagReadModel[]>];
      }),
    );
    return new Map(entries);
  }
}
