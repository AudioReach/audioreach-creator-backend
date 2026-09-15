/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {UsecaseChangeDetails} from '../../../ports/persistence/query-services/usecase/query-models/usecase-change-details-read-model.js';
import type {Result} from '../../../shared/result/result.js';
import {GetUsecaseChangeDetailsQuery} from './get-usecase-change-details.query.js';

export class GetUsecaseChangeDetailsHandler implements QueryHandler<
  GetUsecaseChangeDetailsQuery,
  Promise<Result<UsecaseChangeDetails[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}
  async handle(
    query: GetUsecaseChangeDetailsQuery,
  ): Promise<Result<UsecaseChangeDetails[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    return this.queryServices.useCaseQueryService.getChangeDetails(
      fileId,
      query.emittedChanges,
    );
  }
}
