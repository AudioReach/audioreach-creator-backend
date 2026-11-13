/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {GetAllKeyDefinitionsQuery} from './get-all-key-definitions.query.js';
import {Result} from '../../../shared/result/result.js';
import type {KeyDefinitionDto} from '../dto/key-definition-dto.js';
import {mapKeyDefinition} from '../dto/key-definition-dto.js';

export class GetAllKeyDefinitionsHandler implements QueryHandler<
  GetAllKeyDefinitionsQuery,
  Promise<Result<KeyDefinitionDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllKeyDefinitionsQuery,
  ): Promise<Result<KeyDefinitionDto[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Plain list, no `failed`: a key references nothing outside itself
    // (its values are its own children), so no key can be skipped.
    const keys =
      await this.queryServices.keyValueDefQueryService.findAllKeyDefinitions(
        fileId,
        {naturalId: query.keyNaturalId},
      );

    return Result.ok(keys.map(key => mapKeyDefinition(key)));
  }
}
