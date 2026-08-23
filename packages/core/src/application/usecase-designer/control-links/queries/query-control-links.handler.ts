/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {QueryControlLinksQuery} from './query-control-links.query.js';
import type {ControlLinkDto} from '../../usecase/dto/component-collection-dto.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';

export class QueryControlLinksHandler implements QueryHandler<
  QueryControlLinksQuery,
  Promise<Result<ControlLinkDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QueryControlLinksQuery): Promise<Result<ControlLinkDto[]>> {
    const {systemIds, projectId} = query;

    if (systemIds.length === 0) return Result.ok([]);

    const fileSystemId = await this.queryServices.projectQueryService.getFileIdByProjectId(projectId);
    const result = await this.queryServices.controlLinkQueryService.findBySystemIds(
      systemIds,
      fileSystemId,
    );

    if (result.kind === RESULT_KIND.Fail) {
      return Result.fail(...(result.issues ?? []));
    }

    const found = result.kind === RESULT_KIND.Ok || result.kind === RESULT_KIND.Partial ? result.data : [];
    const foundIds = new Set(found.map(l => l.systemId));

    const missingIssues = systemIds
      .filter(id => !foundIds.has(id))
      .map(id => IssueFactory.notFound(ISSUE_ENTITY_TYPE.ControlLink, id));

    const dtos = found.map(l => mapControlLink(l));

    if (missingIssues.length > 0) {
      return Result.partial(dtos, missingIssues);
    }

    return Result.ok(dtos);
  }
}
