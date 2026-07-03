/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../ports/persistence/query-services/key-value/key-value-definition-read-model.js';
import {GetAllKeyDefinitionsQuery} from './get-all-key-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handler for GetAllKeyDefinitionsQuery
 * Resolves projectId → fileId, then lists key definitions (with values) for that file.
 * Forwards the Result straight through — a per-key failure surfaces as
 * Result.partial, not an exception; the controller decides the HTTP status.
 */
export class GetAllKeyDefinitionsHandler implements QueryHandler<
  GetAllKeyDefinitionsQuery,
  Promise<Result<KeyDefinitionReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllKeyDefinitionsQuery,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.keyValueDefQueryService.getAllKeyDefinitions(
      fileId,
      query.keyId,
    );
  }
}
