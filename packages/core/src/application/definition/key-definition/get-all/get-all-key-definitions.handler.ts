/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {GetAllKeyDefinitionsQuery} from './get-all-key-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';
import {
  RESULT_KIND,
  Result as ResultClass,
} from '../../../shared/result/result.js';
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

    const result =
      await this.queryServices.keyValueDefQueryService.getAllKeyDefinitions(
        fileId,
        query.keyId,
      );

    if (result.kind === RESULT_KIND.Fail) return result;

    const dtos = result.data.map(k => mapKeyDefinition(k));

    if (result.kind === RESULT_KIND.Partial) {
      return ResultClass.partial(dtos, result.issues);
    }
    return ResultClass.ok(dtos, result.issues);
  }
}
