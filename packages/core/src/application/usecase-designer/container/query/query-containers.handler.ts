/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ContainerReadModel} from '../../../ports/persistence/query-services/container/container-read-model.js';
import type {ContainerQuery} from './query-containers.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handles ContainerQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService
 * Step 2: Load all containers for the file via ContainerQueryService.findAll()
 *
 * findAll has no systemIds filter and returns the complete per-file
 * container set — the handler just resolves fileSystemId and passes its
 * Result straight through.
 */
export class ContainerQueryHandler implements QueryHandler<
  ContainerQuery,
  Promise<Result<ContainerReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ContainerQuery): Promise<Result<ContainerReadModel[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.containerQueryService.findAll(fileSystemId);
  }
}
