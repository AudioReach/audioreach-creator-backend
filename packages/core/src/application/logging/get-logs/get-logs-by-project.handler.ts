/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../ports/persistence/query-services/query-services.js';
import {GetLogsByProjectQuery} from './get-logs-by-project.query.js';
import type {LogEntryReadModel} from '../../ports/persistence/query-services/logging/log-entry-read-model.js';

export class GetLogsByProjectHandler implements QueryHandler<
  GetLogsByProjectQuery,
  Promise<LogEntryReadModel[]>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetLogsByProjectQuery): Promise<LogEntryReadModel[]> {
    return await this.queryServices.logQueryService.getLogsByProject(
      query.projectId,
      query.clientId,
    );
  }
}
