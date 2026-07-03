/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../shared/result/result.js';
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {TagDefinitionReadModel} from '../../../ports/persistence/query-services/tag-definition/tag-definition-read-model.js';
import {GetAllTagDefinitionsQuery} from './get-all-tag-definitions.query.js';

/**
 * Handler for GetAllTagDefinitionsQuery
 * Resolves projectId → fileId, then lists tag definitions (with associated
 * key definitions and their values) for that file.
 * Forwards the Result straight through — a per-key/per-tag failure surfaces
 * as Result.partial, not an exception; the controller decides the HTTP status.
 */
export class GetAllTagDefinitionsHandler implements QueryHandler<
  GetAllTagDefinitionsQuery,
  Promise<Result<TagDefinitionReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllTagDefinitionsQuery,
  ): Promise<Result<TagDefinitionReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.tagDefinitionQueryService.getAllTagDefinitions(
      fileId,
      query.tagId,
    );
  }
}
