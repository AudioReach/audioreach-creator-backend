/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/components-read-model.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {
  GetComponentsQuery,
  COMPONENT_SCOPE_TYPE,
} from './get-components.query.js';
import type {ComponentCollectionDto} from '../dto/component-collection-dto.js';
import {mapComponentCollection} from '../dto/component-collection-dto.js';

export class GetComponentsHandler implements QueryHandler<
  GetComponentsQuery,
  Promise<Result<ComponentCollectionDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetComponentsQuery,
  ): Promise<Result<ComponentCollectionDto>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    if (query.scope.type === COMPONENT_SCOPE_TYPE.Usecase) {
      const invalidResult = await this.findInvalidUsecaseId(
        query.scope.systemIds,
        fileId,
      );
      if (invalidResult.kind === RESULT_KIND.Fail)
        throw new Error(
          invalidResult.issues[0]?.message ?? 'Failed to validate usecase IDs',
        );
      if (invalidResult.data !== undefined)
        throw new Error(`UseCase ${invalidResult.data} not found`);
    }

    const svc = this.queryServices;

    switch (query.scope.type) {
      case COMPONENT_SCOPE_TYPE.Usecase:
        return this.loadAndMapComponents(
          svc.spfModuleQueryService.findByUsecaseIds(
            query.scope.systemIds,
            fileId,
          ),
          svc.dataLinkQueryService.findByUsecaseIds(
            query.scope.systemIds,
            fileId,
          ),
          svc.controlLinkQueryService.findByUsecaseIds(
            query.scope.systemIds,
            fileId,
          ),
        );

      case COMPONENT_SCOPE_TYPE.Subgraph:
        return this.loadAndMapComponents(
          svc.spfModuleQueryService.findBySubgraphId(
            query.scope.systemId,
            fileId,
          ),
          svc.dataLinkQueryService.findBySubgraphId(
            query.scope.systemId,
            fileId,
          ),
          svc.controlLinkQueryService.findBySubgraphId(
            query.scope.systemId,
            fileId,
          ),
        );
    }
  }

  private async findInvalidUsecaseId(
    systemIds: number[],
    fileId: number,
  ): Promise<Result<number | undefined>> {
    const allResult =
      await this.queryServices.useCaseQueryService.getAllUseCases(fileId);
    if (allResult.kind === RESULT_KIND.Fail) return allResult;
    const knownIds = new Set(allResult.data.map(uc => uc.systemId));
    return Result.ok(systemIds.find(id => !knownIds.has(id)));
  }

  private async loadAndMapComponents(
    modulesPromise: Promise<Result<ComponentsReadModel['modules']>>,
    dataLinksPromise: Promise<Result<ComponentsReadModel['dataLinks']>>,
    controlLinksPromise: Promise<Result<ComponentsReadModel['controlLinks']>>,
  ): Promise<Result<ComponentCollectionDto>> {
    const [modulesResult, dataLinksResult, controlLinksResult] =
      await Promise.all([
        modulesPromise,
        dataLinksPromise,
        controlLinksPromise,
      ]);
    if (modulesResult.kind === RESULT_KIND.Fail)
      throw new Error(
        modulesResult.issues[0]?.message ?? 'Failed to load modules',
      );
    if (dataLinksResult.kind === RESULT_KIND.Fail)
      throw new Error(
        dataLinksResult.issues[0]?.message ?? 'Failed to load data links',
      );
    if (controlLinksResult.kind === RESULT_KIND.Fail)
      throw new Error(
        controlLinksResult.issues[0]?.message ?? 'Failed to load control links',
      );
    const flat: ComponentsReadModel = {
      modules: modulesResult.data,
      dataLinks: dataLinksResult.data,
      controlLinks: controlLinksResult.data,
    };
    return Result.ok(mapComponentCollection(flat));
  }
}
