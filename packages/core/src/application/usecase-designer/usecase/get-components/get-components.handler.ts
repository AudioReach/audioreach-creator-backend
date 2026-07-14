/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {UseCaseComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/index.js';
import {GetComponentsQuery} from './get-components.query.js';
import {Result} from '../../../shared/result/result.js';

export class GetComponentsHandler implements QueryHandler<
  GetComponentsQuery,
  Promise<Result<UseCaseComponentsReadModel>>
> {
  constructor(private queryServices: QueryServices) {}

  async handle(
    query: GetComponentsQuery,
  ): Promise<Result<UseCaseComponentsReadModel>> {
    if (query.projectId !== undefined) {
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    }
    const useCaseSystemIds = query.useCaseSystemIds.map(Number);
    return Result.ok(
      await this.queryServices.useCaseQueryService.getAllComponentsForUseCases(
        useCaseSystemIds,
      ),
    );
  }
}
