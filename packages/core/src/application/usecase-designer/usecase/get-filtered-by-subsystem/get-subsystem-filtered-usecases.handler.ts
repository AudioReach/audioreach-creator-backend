/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {
  RESULT_KIND,
  Result,
  type Result as ArcResult,
} from '../../../shared/result/result.js';
import {GetSubsystemFilteredUsecasesQuery} from './get-subsystem-filtered-usecases.query.js';
import type {SubsystemFilteredReadModel} from '../../../ports/persistence/query-services/usecase/query-models/subsystem-filtered-read-model.js';
import {SubsystemFilteredGkvService} from '../../../services/subsystem-filtered-gkv-service.js';

/**
 * Loads effective data, applies the core filtered-GKV algorithm, and assembles
 * the public subsystem-filtered response model.
 */
export class GetSubsystemFilteredUsecasesHandler implements QueryHandler<
  GetSubsystemFilteredUsecasesQuery,
  Promise<ArcResult<SubsystemFilteredReadModel[]>>
> {
  constructor(
    private readonly queryServices: QueryServices,
    private readonly subsystemFilteredGkvService: SubsystemFilteredGkvService,
  ) {}

  async handle(
    query: GetSubsystemFilteredUsecasesQuery,
  ): Promise<ArcResult<SubsystemFilteredReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const dataResult =
      await this.queryServices.useCaseQueryService.getUsecaseFilteredGkvData(
        fileId,
      );
    if (dataResult.kind === RESULT_KIND.Fail) return dataResult;

    const groupsResult = this.subsystemFilteredGkvService.buildFilteredGkv(
      dataResult.data,
      query.filter,
    );
    if (groupsResult.kind === RESULT_KIND.Fail) return groupsResult;

    const usecasesById = new Map(
      dataResult.data.usecases.map(usecase => [usecase.systemId, usecase]),
    );
    const readModels = groupsResult.data.map(group => ({
      filteredGkv: group.filteredGkv,
      usecases: group.usecaseSystemIds.flatMap(usecaseSystemId => {
        const usecase = usecasesById.get(usecaseSystemId);
        return usecase ? [usecase] : [];
      }),
    }));

    return dataResult.kind === RESULT_KIND.Partial
      ? Result.partial(readModels, dataResult.issues)
      : Result.ok(readModels);
  }
}
