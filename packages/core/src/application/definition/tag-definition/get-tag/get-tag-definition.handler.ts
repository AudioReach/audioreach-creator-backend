/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {GetTagDefinitionQuery} from './get-tag-definition.query.js';
import {Result} from '../../../shared/result/result.js';
import {requireOne} from '../../../shared/result/require-one.js';
import type {TagDefinitionDto} from '../dto/tag-definition-dto.js';
import {mapTagDefinition} from '../dto/tag-definition-dto.js';

export class GetTagDefinitionHandler implements QueryHandler<
  GetTagDefinitionQuery,
  Promise<Result<TagDefinitionDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetTagDefinitionQuery,
  ): Promise<Result<TagDefinitionDto>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const tags =
      await this.queryServices.tagDefinitionQueryService.findTagDefinitions(
        fileId,
        [query.tagSystemId],
      );
    const tag = requireOne(
      ISSUE_ENTITY_TYPE.TagDefinition,
      query.tagSystemId,
      tags,
    );

    return Result.ok(mapTagDefinition(tag));
  }
}
