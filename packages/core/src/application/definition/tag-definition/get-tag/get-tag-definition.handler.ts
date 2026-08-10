/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetTagDefinitionQuery} from './get-tag-definition.query.js';
import {Result} from '../../../shared/result/result.js';
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

    const result =
      await this.queryServices.tagDefinitionQueryService.getTagDefinition(
        fileId,
        query.tagSystemId,
      );

    if (!result) {
      throw new ResourceNotFoundException(
        `Tag definition with system ID ${query.tagSystemId} not found`,
      );
    }

    return Result.ok(mapTagDefinition(result));
  }
}
