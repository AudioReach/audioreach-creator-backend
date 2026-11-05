/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogLevel} from '@arc/core';
import type {LogEntryReadModel, LogOrigin} from './log-entry-read-model.js';
import type {ClientInstanceReadModel} from './client-instance-read-model.js';

export const LogSortOrder = {
  /** Newest first */
  Desc: 'desc',
  /** Oldest first */
  Asc: 'asc',
} as const;

export type LogSortOrder = (typeof LogSortOrder)[keyof typeof LogSortOrder];

export const LOG_SEARCH_DEFAULT_LIMIT = 200;
export const LOG_SEARCH_MAX_LIMIT = 1000;

/** Narrows one project's log records (design §10). All given filters apply. */
export interface ProjectLogFilter {
  readonly projectId: string;
  /** Records belonging to this client: written by it or for it */
  readonly clientName?: string;
  /** Records belonging to this client launch, by the same rule */
  readonly clientInstanceId?: string;
  readonly origin?: LogOrigin;
  /** Records at this level or more severe */
  readonly minLevel?: LogLevel;
}

export interface ProjectLogSearchCriteria extends ProjectLogFilter {
  /** Page size, 1 to `LOG_SEARCH_MAX_LIMIT` */
  readonly limit: number;
  /** Direction of the `(timestamp, systemId)` sort */
  readonly order: LogSortOrder;
  /**
   * The `nextCursor` of the previous page; opaque to callers, and valid only
   * with the same filter and order
   */
  readonly cursor?: string;
}

export interface LogSearchPage {
  readonly items: LogEntryReadModel[];
  /** Cursor for the next page; omitted on the last page */
  readonly nextCursor?: string;
  /**
   * Number of records matching the filter when the page was read; only on
   * the first page (no `cursor`). An estimate for progress: the listing is
   * complete when `nextCursor` is absent.
   */
  readonly totalCount?: number;
}

/**
 * Selects client launches that have records for at least one project, newest
 * `lastTimestamp` first.
 */
export interface ClientInstanceSearchCriteria {
  readonly clientName?: string;
  /** Page size, 1 to `LOG_SEARCH_MAX_LIMIT` */
  readonly limit: number;
  /** The `nextCursor` of the previous page, valid only with the same filter */
  readonly cursor?: string;
}

export interface ClientInstancePage {
  readonly items: ClientInstanceReadModel[];
  /** Cursor for the next page; omitted on the last page */
  readonly nextCursor?: string;
  /**
   * Number of launches matching the filter when the page was read; only on
   * the first page (no `cursor`). An estimate for progress: the listing is
   * complete when `nextCursor` is absent.
   */
  readonly totalCount?: number;
}
