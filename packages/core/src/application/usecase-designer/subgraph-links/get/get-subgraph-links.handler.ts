/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {Result} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
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
    const [dataLinks, controlLinks] = await Promise.all([
      this.queryServices.dataLinkQueryService.findSubgraphPeerLinks(
        fileSystemId,
        query.filter,
      ),
      this.queryServices.controlLinkQueryService.findSubgraphPeerLinks(
        fileSystemId,
        query.filter,
      ),
    ]);

    const usecaseIds = [
      ...new Set([
        ...dataLinks.flatMap(link => [...link.usecaseSystemIds]),
        ...controlLinks.flatMap(link => [...link.usecaseSystemIds]),
      ]),
    ];

    if (usecaseIds.length === 0)
      return Result.ok({
        dataLinks: dataLinks.map(link => ({
          link: mapDataLink(link.link),
          usecases: [],
        })),
        controlLinks: controlLinks.map(link => ({
          link: mapControlLink(link.link),
          usecases: [],
        })),
      });

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
    const data = {
      dataLinks: dataLinks.map(link => ({
        link: mapDataLink(link.link),
        usecases: [...link.usecaseSystemIds]
          .map(systemId => usecasesById.get(systemId))
          .filter(
            (usecase): usecase is NonNullable<typeof usecase> =>
              usecase !== undefined,
          ),
      })),
      controlLinks: controlLinks.map(link => ({
        link: mapControlLink(link.link),
        usecases: [...link.usecaseSystemIds]
          .map(systemId => usecasesById.get(systemId))
          .filter(
            (usecase): usecase is NonNullable<typeof usecase> =>
              usecase !== undefined,
          ),
      })),
    };

    return usecaseIssues.length > 0
      ? Result.partial(data, usecaseIssues)
      : Result.ok(data);
  }
}
