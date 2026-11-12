/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {DataLinkWithUsecasesDto} from '../../subgraph/dto/subgraph-pair-dto.js';
import {mapDataLink} from '../../usecase/dto/component-collection-dto.js';
import {mapUseCase} from '../../usecase/dto/usecase-dto.js';
import type {GetDataLinksByModulePortQuery} from './get-data-links-by-module-port.query.js';

export class GetDataLinksByModulePortHandler implements QueryHandler<
  GetDataLinksByModulePortQuery,
  Promise<Result<DataLinkWithUsecasesDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetDataLinksByModulePortQuery,
  ): Promise<Result<DataLinkWithUsecasesDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    const linksResult =
      await this.queryServices.dataLinkQueryService.findByModulePort(
        query.filter,
        fileSystemId,
      );

    if (linksResult.kind === RESULT_KIND.Fail)
      return Result.fail(...linksResult.issues);
    if (linksResult.data.length === 0) return Result.ok([], linksResult.issues);

    const usecaseIds = [
      ...new Set(linksResult.data.flatMap(link => [...link.usecaseSystemIds])),
    ];
    if (usecaseIds.length === 0)
      return this.withIssues(
        linksResult.data.map(link => ({
          link: mapDataLink(link.link),
          usecases: [],
        })),
        linksResult.issues,
      );

    const usecases =
      await this.queryServices.useCaseQueryService.findUseCaseReadModels(
        fileSystemId,
      );
    const referencedIds = new Set(usecaseIds);
    const usecaseIssues = failedToIssues(
      ISSUE_ENTITY_TYPE.UseCase,
      usecases.failed.filter(entity => referencedIds.has(entity.systemId)),
    );

    const usecasesById = new Map(
      usecases.items.map(usecase => [usecase.systemId, mapUseCase(usecase)]),
    );
    const data = linksResult.data.map(link => ({
      link: mapDataLink(link.link),
      usecases: [...link.usecaseSystemIds]
        .map(systemId => usecasesById.get(systemId))
        .filter(
          (usecase): usecase is NonNullable<typeof usecase> =>
            usecase !== undefined,
        ),
    }));

    return this.withIssues(data, [
      ...(linksResult.issues ?? []),
      ...usecaseIssues,
    ]);
  }

  private withIssues(
    data: DataLinkWithUsecasesDto[],
    issues: readonly Issue[] | undefined,
  ): Result<DataLinkWithUsecasesDto[]> {
    return issues && issues.length > 0
      ? Result.partial(data, issues)
      : Result.ok(data);
  }
}
