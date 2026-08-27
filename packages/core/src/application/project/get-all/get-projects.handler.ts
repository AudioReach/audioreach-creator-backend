/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {
  GetProjectsQuery,
  ProjectInfoResult,
} from './get-projects.query.js';
import type {QueryServices} from '../../ports/persistence/query-services/query-services.js';

export class GetProjectsHandler implements QueryHandler<
  GetProjectsQuery,
  Promise<ProjectInfoResult[]>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(_query: GetProjectsQuery): Promise<ProjectInfoResult[]> {
    const summaries =
      await this.queryServices.projectQueryService.getAllProjectsWithSessionMode();

    return summaries.map(s => ({
      projectId: s.systemId,
      name: s.name,
      description: s.description,
      type: s.type,
      sessionMode: s.sessionMode,
    }));
  }
}
