/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetKeyDefinitionQuery} from './get-key-definition.query.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import type {KeyDefinitionDto} from '../dto/key-definition-dto.js';
import {mapKeyDefinition} from '../dto/key-definition-dto.js';

export class GetKeyDefinitionHandler implements QueryHandler<
  GetKeyDefinitionQuery,
  Promise<Result<KeyDefinitionDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetKeyDefinitionQuery,
  ): Promise<Result<KeyDefinitionDto>> {
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

    return Result.ok(mapKeyDefinition(result.data));
  }
}
