/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCaseReadModel} from '../../../ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {Result} from '../../../shared/result/result.js';
import {GetAllUseCasesQuery} from './get-all-usecases.query.js';

export class GetAllUseCasesHandler implements QueryHandler<
  GetAllUseCasesQuery,
  Promise<Result<UseCaseReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllUseCasesQuery,
  ): Promise<Result<UseCaseReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.useCaseQueryService.getAllUseCases(
      fileId,
      query.filter,
    );
  }
}
