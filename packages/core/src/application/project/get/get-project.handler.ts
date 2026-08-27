/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {GetProjectQuery} from './get-project.query.js';
import type {ProjectInfoResult} from '../get-all/get-projects.query.js';
import type {QueryServices} from '../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';

export class GetProjectHandler implements QueryHandler<
  GetProjectQuery,
  Promise<ProjectInfoResult>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetProjectQuery): Promise<ProjectInfoResult> {
    const summary =
      await this.queryServices.projectQueryService.getProjectWithSessionMode(
        query.projectId,
      );

    if (!summary) {
      throw new ResourceNotFoundException(
        `Project '${query.projectId}' not found.`,
      );
    }

    return {
      projectId: summary.systemId,
      name: summary.name,
      description: summary.description,
      type: summary.type,
      sessionMode: summary.sessionMode,
    };
  }
}
