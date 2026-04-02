/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../services/query-services.js';
import type {UseCaseReadModel} from '../../../services/usecase/query-models/index.js';
import {GetAllUseCasesQuery} from './get-all-usecases.query.js';

/**
 * Handler for GetAllUseCasesQuery
 * Retrieves all use cases with their global key vectors for a specific project
 * Orchestrates: projectId → fileId → use cases
 */
export class GetAllUseCasesHandler implements QueryHandler<
  GetAllUseCasesQuery,
  Promise<UseCaseReadModel[]>
> {
  constructor(private queryServices: QueryServices) {}

  async handle(query: GetAllUseCasesQuery): Promise<UseCaseReadModel[]> {
    // First, resolve projectId to fileId
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Then, get all use cases for that file
    return await this.queryServices.useCaseQueryService.getAllUseCases(fileId);
  }
}
