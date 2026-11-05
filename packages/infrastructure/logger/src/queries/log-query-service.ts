/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ClientInstancePage,
  ClientInstanceSearchCriteria,
  LogSearchPage,
  ProjectLogSearchCriteria,
} from './log-search-criteria.js';

/**
 * Reads stored log records. Logs are operational data, not domain data, so
 * this lives with the logging infrastructure rather than as a core port; the
 * API calls it directly.
 */
export interface LogQueryService {
  /**
   * Returns one page of a project's records sorted by `(timestamp, systemId)`
   * in `criteria.order`. Throws `InvalidLogCursorError` for a bad cursor.
   */
  searchProjectLogs(criteria: ProjectLogSearchCriteria): Promise<LogSearchPage>;

  /**
   * Returns one page of client launches, newest `lastTimestamp` first.
   * Throws `InvalidLogCursorError` for a bad cursor.
   */
  listClientInstances(
    criteria: ClientInstanceSearchCriteria,
  ): Promise<ClientInstancePage>;
}

/**
 * Thrown by a `LogQueryService` when `cursor` is malformed or was issued for
 * a different filter or sort order. The API maps it to HTTP 400.
 */
export class InvalidLogCursorError extends Error {
  constructor(reason: string) {
    super(`Invalid log cursor: ${reason}`);
    this.name = 'InvalidLogCursorError';
  }
}
