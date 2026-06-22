/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ContainerReadModel} from '../../../ports/persistence/query-services/usecase/query-models/container-read-model.js';
import type {QueryContainersQuery} from './query-containers.query.js';

export class QueryContainersHandler implements QueryHandler<
  QueryContainersQuery,
  Promise<ContainerReadModel[]>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QueryContainersQuery): Promise<ContainerReadModel[]> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    return this.queryServices.containerQueryService.findMany(
      query.systemIds,
      fileSystemId,
    );
  }
}
