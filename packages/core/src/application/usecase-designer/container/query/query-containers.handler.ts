/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ContainerQuery} from './query-containers.query.js';
import type {ContainerDto} from '../dto/container-dto.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';

/**
 * Handles ContainerQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load all containers via ContainerQueryService.findAll()
 * Step 3: Map each ContainerReadModel to ContainerDto (ReadModel stays internal)
 */
export class ContainerQueryHandler implements QueryHandler<
  ContainerQuery,
  Promise<Result<ContainerDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ContainerQuery): Promise<Result<ContainerDto[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const readModels =
      await this.queryServices.containerQueryService.findAll(fileSystemId);

    if (readModels.kind === RESULT_KIND.Fail) return readModels;

    const dtos = readModels.data.map(c => ({
      systemId: String(c.systemId),
      id: c.containerId,
      name: c.containerTypeName ?? String(c.containerTypeSystemId ?? ''),
    }));

    if (readModels.kind === RESULT_KIND.Partial) {
      return Result.partial(dtos, readModels.issues);
    }
    return Result.ok(dtos, readModels.issues);
  }
}
