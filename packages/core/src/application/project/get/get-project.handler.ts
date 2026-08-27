/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {GetProjectQuery} from './get-project.query.js';
import type {ProjectDto} from '../dto/project-dto.js';
import {mapProject} from '../dto/project-dto.js';
import type {QueryServices} from '../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';

export class GetProjectHandler implements QueryHandler<
  GetProjectQuery,
  Promise<ProjectDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetProjectQuery): Promise<ProjectDto> {
    const project = await this.queryServices.projectQueryService.getProject(
      query.projectId,
    );

    if (!project) {
      throw new ResourceNotFoundException(
        `Project '${query.projectId}' not found.`,
      );
    }

    return mapProject(project);
  }
}
