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
import type {SpfModuleDto} from './spf-module-dto.js';
import {mapSpfModule} from './spf-module-dto.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';

export class SpfModuleQueryHandler implements QueryHandler<
  SpfModuleQuery,
  Promise<Result<SpfModuleDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: SpfModuleQuery): Promise<Result<SpfModuleDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const modulesResult =
      await this.queryServices.spfModuleQueryService.getSpfModules(
        query.systemIds,
        fileSystemId,
      );

    if (modulesResult.kind === RESULT_KIND.Fail) {
      return Result.fail(...modulesResult.issues);
    }

    const modules = modulesResult.data;

    if (modules.length === 0 || (!query.includeCkvs && !query.includeTags)) {
      const dtos = modules.map(m => mapSpfModule(m));
      if (modulesResult.kind === RESULT_KIND.Partial) {
        return Result.partial(dtos, modulesResult.issues);
      }
      return Result.ok(dtos, modulesResult.issues);
    }

    const [ckvsByModule, tagsByModule] = await Promise.all([
      query.includeCkvs
        ? this.loadCkvsForModules(modules, fileSystemId)
        : undefined,
      query.includeTags
        ? this.loadTagsForModules(modules, fileSystemId)
        : undefined,
    ]);

    const dtos = modules.map(m =>
      mapSpfModule(
        m,
        ckvsByModule?.get(m.systemId),
        tagsByModule?.get(m.systemId),
      ),
    );

    if (modulesResult.kind === RESULT_KIND.Partial) {
      return Result.partial(dtos, modulesResult.issues);
    }
    return Result.ok(dtos, modulesResult.issues);
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
            CONFIGURATION_INCLUDES.Summary,
          );
        return [m.systemId, result] as [number, Result<TagReadModel[]>];
      }),
    );
    return new Map(entries);
  }
}
