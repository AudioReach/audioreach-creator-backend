/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const LogLevel = {
  Verbose: 'VERBOSE',
  Debug: 'DEBUG',
  Info: 'INFO',
  Warn: 'WARN',
  Error: 'ERROR',
  Critical: 'CRITICAL',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * What server code passes to the `Logger`. It describes the server's own
 * work only; the writing service and request context are added by the
 * logging infrastructure, and client-submitted records do not use it.
 */
export interface LogData {
  /** Stable operation identifier used for grouping related log entries */
  msg: string;
  /** Detailed, contextual description of the logged event */
  description: string;
  /** Project or workspace associated with the log entry */
  projectId?: string;
  /** Component, service, or module that emitted the log entry */
  component: string;
  /** Feature or category used to group log entries */
  tag: string;
  /** Timestamp when the log event occurred; defaults to the current time */
  timestamp?: Date;
  /** The caught error, or preformatted text when no Error object exists */
  error?: Error | string;
}

export interface Logger {
  logVerbose(data: LogData): void;
  logDebug(data: LogData): void;
  logInfo(data: LogData): void;
  logWarn(data: LogData): void;
  logError(data: LogData): void;
  logCritical(data: LogData): void;
}
