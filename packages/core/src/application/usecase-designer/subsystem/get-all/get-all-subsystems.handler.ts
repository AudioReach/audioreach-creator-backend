/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import type {Result as ResultType} from '../../../shared/result/result.js';
import type {SubsystemDto} from '../dto/subsystem-dto.js';
import {mapSubsystem} from '../dto/subsystem-dto.js';
import type {GetAllSubsystemsQuery} from './get-all-subsystems.query.js';

export class GetAllSubsystemsHandler implements QueryHandler<
  GetAllSubsystemsQuery,
  Promise<ResultType<SubsystemDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubsystemsQuery,
  ): Promise<ResultType<SubsystemDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result = await this.queryServices.subsystemQueryService.findAll(
      fileSystemId,
      query.systemIds,
    );

    if (result.kind === RESULT_KIND.Fail) return Result.fail(...result.issues);

    const dtos = result.data.map(subsystem => mapSubsystem(subsystem));
    if (result.kind === RESULT_KIND.Partial)
      return Result.partial(dtos, result.issues);
    return Result.ok(dtos, result.issues);
  }
}
