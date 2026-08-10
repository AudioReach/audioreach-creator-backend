/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../shared/result/result.js';
import {
  RESULT_KIND,
  Result as ResultClass,
} from '../../../shared/result/result.js';
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {GetAllTagDefinitionsQuery} from './get-all-tag-definitions.query.js';
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

    const result =
      await this.queryServices.tagDefinitionQueryService.getAllTagDefinitions(
        fileId,
        query.tagId,
      );

    if (result.kind === RESULT_KIND.Fail) return result;

    const dtos = result.data.map(t => mapTagDefinition(t));

    if (result.kind === RESULT_KIND.Partial) {
      return ResultClass.partial(dtos, result.issues);
    }
    return ResultClass.ok(dtos, result.issues);
  }
}
