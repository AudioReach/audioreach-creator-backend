/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogLevel} from '@arc/core';

/** Who wrote a log record. */
export const LogOrigin = {
  /** A client submitted it through `POST /logs` */
  Client: 'CLIENT',
  /** The API wrote it */
  Server: 'SERVER',
} as const;

export type LogOrigin = (typeof LogOrigin)[keyof typeof LogOrigin];

/** One stored log record, whoever wrote it. */
export interface LogEntryReadModel {
  /** Database-generated log entry identifier */
  readonly systemId: number;
  /** Severity of the log entry */
  readonly level: LogLevel;
  /** When the event occurred, ISO-8601 */
  readonly timestamp: string;
  /** Stable event identifier used for grouping related log entries */
  readonly eventName: string;
  /** Detailed, contextual description of the logged event */
  readonly description: string;
  /** Project or workspace associated with the log entry */
  readonly projectId?: string;
  /** Component, service, or module that emitted the log entry */
  readonly component: string;
  /** Feature or category used to group log entries */
  readonly tag: string;
  /** Serialized error details when the entry represents a failure */
  readonly error?: string;
  /** Who wrote the record */
  readonly origin: LogOrigin;
  /**
   * Client the record belongs to, such as `audioreach-creator-ui`: the client
   * that wrote it, or the client a server record was written for
   */
  readonly clientName?: string;
  /** Client launch the record belongs to, by the same rule as `clientName` */
  readonly clientInstanceId?: string;
  /** Server records only: the API run that wrote the record */
  readonly serverInstanceId?: string;
}
