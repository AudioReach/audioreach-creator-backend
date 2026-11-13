/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {GetKeyDefinitionQuery} from './get-key-definition.query.js';
import {Result} from '../../../shared/result/result.js';
import {requireOne} from '../../../shared/result/require-one.js';
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

    const keys =
      await this.queryServices.keyValueDefQueryService.findKeyDefinitions(
        fileId,
        [query.keySystemId],
      );
    const key = requireOne(
      ISSUE_ENTITY_TYPE.KeyDefinition,
      query.keySystemId,
      keys,
    );

    return Result.ok(mapKeyDefinition(key));
  }
}
