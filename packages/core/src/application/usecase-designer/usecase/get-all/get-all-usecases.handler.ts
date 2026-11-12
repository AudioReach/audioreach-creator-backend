/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {Result} from '../../../shared/result/result.js';
import {Result as ResultUtil} from '../../../shared/result/result.js';
import {failedToIssues} from '../../../shared/result/failed-to-issues.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
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

    const usecases =
      await this.queryServices.useCaseQueryService.findUseCaseReadModels(
        fileId,
        {filter: query.filter},
      );
    const dtos = usecases.items.map(uc => mapUseCase(uc));

    return usecases.failed.length > 0
      ? ResultUtil.partial(
          dtos,
          failedToIssues(ISSUE_ENTITY_TYPE.UseCase, usecases.failed),
        )
      : ResultUtil.ok(dtos);
  }
}
