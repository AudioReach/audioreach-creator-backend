/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/components-read-model.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {FAILED_ENTITY_REASON} from '../../../ports/persistence/batch-read.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
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
      await this.assertUsecasesExist(query.scope.systemIds, fileId);
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

  private async assertUsecasesExist(
    systemIds: readonly number[],
    fileId: number,
  ): Promise<void> {
    const usecases =
      await this.queryServices.useCaseQueryService.findUseCaseReadModels(
        fileId,
        {ids: systemIds},
      );
    const notFound = usecases.failed.filter(
      entity => entity.reason === FAILED_ENTITY_REASON.NotFound,
    );
    if (notFound.length > 0)
      throw new ResourceNotFoundException(
        `UseCase ${notFound.map(entity => entity.systemId).join(', ')} not found`,
        failedToIssues(ISSUE_ENTITY_TYPE.UseCase, notFound),
      );
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
