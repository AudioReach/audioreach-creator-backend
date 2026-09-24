/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {DataLinkWithUsecasesDto} from '../../subgraph/dto/subgraph-pair-dto.js';
import {mapDataLink} from '../../usecase/dto/component-collection-dto.js';
import {mapUseCase} from '../../usecase/dto/usecase-dto.js';
import type {GetSubgraphPeerDataLinksQuery} from './get-subgraph-peer-data-links.query.js';

export class GetSubgraphPeerDataLinksHandler implements QueryHandler<
  GetSubgraphPeerDataLinksQuery,
  Promise<Result<DataLinkWithUsecasesDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphPeerDataLinksQuery,
  ): Promise<Result<DataLinkWithUsecasesDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    const linksResult =
      await this.queryServices.dataLinkQueryService.findSubgraphPeerLinks(
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
      ...(usecasesResult.issues ?? []),
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
