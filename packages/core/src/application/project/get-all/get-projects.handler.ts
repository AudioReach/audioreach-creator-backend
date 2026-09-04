/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {GetProjectsQuery} from './get-projects.query.js';
import type {ProjectDto} from '../dto/project-dto.js';
import {mapProject} from '../dto/project-dto.js';
import type {QueryServices} from '../../ports/persistence/query-services/query-services.js';

export class GetProjectsHandler implements QueryHandler<
  GetProjectsQuery,
  Promise<ProjectDto[]>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(_query: GetProjectsQuery): Promise<ProjectDto[]> {
    const projects =
      await this.queryServices.projectQueryService.getAllProjects();

    return projects.map(p => mapProject(p));
  }
}
