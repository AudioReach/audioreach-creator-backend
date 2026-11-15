/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {Result} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
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
    const links =
      await this.queryServices.dataLinkQueryService.findSubgraphPeerLinks(
        fileSystemId,
        query.filter,
      );
    if (links.length === 0) return Result.ok([]);

    const usecaseIds = [
      ...new Set(links.flatMap(link => [...link.usecaseSystemIds])),
    ];
    if (usecaseIds.length === 0)
      return Result.ok(
        links.map(link => ({
          link: mapDataLink(link.link),
          usecases: [],
        })),
      );

    const usecases =
      await this.queryServices.useCaseQueryService.findUseCaseReadModels(
        fileSystemId,
      );
    const referencedIds = new Set(usecaseIds);
    const usecaseIssues = failedToIssues({
      ...usecases,
      failed: usecases.failed.filter(entity =>
        referencedIds.has(entity.systemId),
      ),
    });

    const usecasesById = new Map(
      usecases.items.map(usecase => [usecase.systemId, mapUseCase(usecase)]),
    );
    const data = links.map(link => ({
      link: mapDataLink(link.link),
      usecases: [...link.usecaseSystemIds]
        .map(systemId => usecasesById.get(systemId))
        .filter(
          (usecase): usecase is NonNullable<typeof usecase> =>
            usecase !== undefined,
        ),
    }));

    return usecaseIssues.length > 0
      ? Result.partial(data, usecaseIssues)
      : Result.ok(data);
  }
}
