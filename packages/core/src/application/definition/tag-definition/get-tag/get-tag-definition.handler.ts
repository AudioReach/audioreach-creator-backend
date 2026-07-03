/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {TagDefinitionReadModel} from '../../../ports/persistence/query-services/tag-definition/tag-definition-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetTagDefinitionQuery} from './get-tag-definition.query.js';

/**
 * Handler for GetTagDefinitionQuery
 * Resolves projectId → fileId, then loads a single tag definition (with
 * associated key definitions and their values) by system ID
 */
export class GetTagDefinitionHandler implements QueryHandler<
  GetTagDefinitionQuery,
  Promise<TagDefinitionReadModel>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetTagDefinitionQuery): Promise<TagDefinitionReadModel> {
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

    return result;
  }
}
