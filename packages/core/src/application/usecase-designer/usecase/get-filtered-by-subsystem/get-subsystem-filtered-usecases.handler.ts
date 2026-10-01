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
import {mapKeyValuePair, mapUseCase} from '../dto/usecase-dto.js';

/**
 * Delegates to SubsystemFilteredGkvService which owns the full algorithm:
 * topology fetch → filter → GKV fetch → grouping.
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

    const groupsResult =
      await this.subsystemFilteredGkvService.resolveFilteredGroups(
        fileId,
        query.filter,
      );
    if (groupsResult.kind === RESULT_KIND.Fail) return groupsResult;

    const readModels: SubsystemFilteredReadModel[] = groupsResult.data.map(
      group => ({
        filteredKv: {
          keyValuePairs: group.keyValuePairs.map(pair => mapKeyValuePair(pair)),
          subsystems: group.subsystems,
        },
        usecases: group.usecases.map(uc => mapUseCase(uc)),
      }),
    );

    return groupsResult.kind === RESULT_KIND.Partial
      ? Result.partial(readModels, groupsResult.issues)
      : Result.ok(readModels);
  }
}
