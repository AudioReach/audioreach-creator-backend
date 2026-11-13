/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {GetAllTagDefinitionsQuery} from './get-all-tag-definitions.query.js';
import {Result} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
import type {TagDefinitionDto} from '../dto/tag-definition-dto.js';
import {mapTagDefinition} from '../dto/tag-definition-dto.js';

export class GetAllTagDefinitionsHandler implements QueryHandler<
  GetAllTagDefinitionsQuery,
  Promise<Result<TagDefinitionDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllTagDefinitionsQuery,
  ): Promise<Result<TagDefinitionDto[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const tags =
      await this.queryServices.tagDefinitionQueryService.findAllTagDefinitions(
        fileId,
        {naturalId: query.tagNaturalId},
      );
    const dtos = tags.items.map(tag => mapTagDefinition(tag));

    return tags.failed.length > 0
      ? Result.partial(
          dtos,
          failedToIssues(ISSUE_ENTITY_TYPE.TagDefinition, tags.failed),
        )
      : Result.ok(dtos);
  }
}
