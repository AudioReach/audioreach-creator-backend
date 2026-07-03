/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {KeyDefinitionReadModel} from '../../../ports/persistence/query-services/key-value/key-value-definition-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetKeyDefinitionQuery} from './get-key-definition.query.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

/**
 * Handler for GetKeyDefinitionQuery
 * Resolves projectId → fileId, then loads a single key definition (with
 * embedded values) by system ID
 */
export class GetKeyDefinitionHandler implements QueryHandler<
  GetKeyDefinitionQuery,
  Promise<KeyDefinitionReadModel>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetKeyDefinitionQuery): Promise<KeyDefinitionReadModel> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.keyValueDefQueryService.getByKeyDefinition(
        query.keySystemId,
        fileId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Key definition with system ID ${query.keySystemId} not found`,
      );
    }

    return result.data;
  }
}
