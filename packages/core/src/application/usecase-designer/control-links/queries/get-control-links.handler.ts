/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetControlLinksQuery} from './get-control-links.query.js';
import type {ControlLinkDto} from '../../usecase/dto/component-collection-dto.js';
import {Result} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';

export class GetControlLinksHandler implements QueryHandler<
  GetControlLinksQuery,
  Promise<Result<ControlLinkDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetControlLinksQuery): Promise<Result<ControlLinkDto[]>> {
    const {systemIds, projectId} = query;

    if (systemIds.length === 0) return Result.ok([]);

    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        projectId,
      );
    const batch =
      await this.queryServices.controlLinkQueryService.findControlLinks(
        fileSystemId,
        systemIds,
      );
    const dtos = batch.items.map(link => mapControlLink(link));
    return batch.failed.length > 0
      ? Result.partial(dtos, failedToIssues(batch))
      : Result.ok(dtos);
  }
}
