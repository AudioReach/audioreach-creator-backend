/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {SubgraphLinksDto} from '../dto/subgraph-links-dto.js';
import {
  mapControlLink,
  mapDataLink,
} from '../../usecase/dto/component-collection-dto.js';
import {mapUseCase} from '../../usecase/dto/usecase-dto.js';
import type {GetSubgraphLinksQuery} from './get-subgraph-links.query.js';

export class GetSubgraphLinksHandler implements QueryHandler<
  GetSubgraphLinksQuery,
  Promise<Result<SubgraphLinksDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphLinksQuery,
  ): Promise<Result<SubgraphLinksDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    const [dataLinksResult, controlLinksResult] = await Promise.all([
      this.queryServices.dataLinkQueryService.findBySubgraph(
        query.filter,
        fileSystemId,
      ),
      this.queryServices.controlLinkQueryService.findBySubgraph(
        query.filter,
        fileSystemId,
      ),
    ]);

    if (dataLinksResult.kind === RESULT_KIND.Fail)
      return Result.fail(...dataLinksResult.issues);
    if (controlLinksResult.kind === RESULT_KIND.Fail)
      return Result.fail(...controlLinksResult.issues);

    const usecaseIds = [
      ...new Set([
        ...dataLinksResult.data.flatMap(link => [...link.usecaseSystemIds]),
        ...controlLinksResult.data.flatMap(link => [...link.usecaseSystemIds]),
      ]),
    ];

    if (usecaseIds.length === 0)
      return this.withIssues(
        {
          dataLinks: dataLinksResult.data.map(link => ({
            link: mapDataLink(link.link),
            usecases: [],
          })),
          controlLinks: controlLinksResult.data.map(link => ({
            link: mapControlLink(link.link),
            usecases: [],
          })),
        },
        [
          ...(dataLinksResult.issues ?? []),
          ...(controlLinksResult.issues ?? []),
        ],
      );

    const usecasesResult =
      await this.queryServices.useCaseQueryService.getAllUseCases(fileSystemId);
    if (usecasesResult.kind === RESULT_KIND.Fail)
      return Result.fail(...usecasesResult.issues);

    const usecasesById = new Map(
      usecasesResult.data.map(usecase => [
        usecase.systemId,
        mapUseCase(usecase),
      ]),
    );
    const data = {
      dataLinks: dataLinksResult.data.map(link => ({
        link: mapDataLink(link.link),
        usecases: [...link.usecaseSystemIds]
          .map(systemId => usecasesById.get(systemId))
          .filter(
            (usecase): usecase is NonNullable<typeof usecase> =>
              usecase !== undefined,
          ),
      })),
      controlLinks: controlLinksResult.data.map(link => ({
        link: mapControlLink(link.link),
        usecases: [...link.usecaseSystemIds]
          .map(systemId => usecasesById.get(systemId))
          .filter(
            (usecase): usecase is NonNullable<typeof usecase> =>
              usecase !== undefined,
          ),
      })),
    };

    return this.withIssues(data, [
      ...(dataLinksResult.issues ?? []),
      ...(controlLinksResult.issues ?? []),
      ...(usecasesResult.issues ?? []),
    ]);
  }

  private withIssues(
    data: SubgraphLinksDto,
    issues: readonly Issue[] | undefined,
  ): Result<SubgraphLinksDto> {
    return issues && issues.length > 0
      ? Result.partial(data, issues)
      : Result.ok(data);
  }
}
