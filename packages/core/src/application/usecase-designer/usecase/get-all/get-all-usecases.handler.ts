/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {Result} from '../../../shared/result/result.js';
import {
  Result as ResultUtil,
  RESULT_KIND,
} from '../../../shared/result/result.js';
import {GetAllUseCasesQuery} from './get-all-usecases.query.js';
import type {UseCaseDto} from '../dto/usecase-dto.js';
import {mapUseCase} from '../dto/usecase-dto.js';

export class GetAllUseCasesHandler implements QueryHandler<
  GetAllUseCasesQuery,
  Promise<Result<UseCaseDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetAllUseCasesQuery): Promise<Result<UseCaseDto[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result = await this.queryServices.useCaseQueryService.getAllUseCases(
      fileId,
      query.filter,
    );

    if (result.kind === RESULT_KIND.Fail) return result;

    const dtos = result.data.map(uc => mapUseCase(uc));

    if (result.kind === RESULT_KIND.Partial)
      return ResultUtil.partial(dtos, result.issues);
    return ResultUtil.ok(dtos, result.issues);
  }
}
