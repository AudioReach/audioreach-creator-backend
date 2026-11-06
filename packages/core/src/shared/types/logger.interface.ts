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
  /** Stable, low-cardinality event name: `<domain>.<operation>.<outcome>` */
  readonly eventName: string;
  /** Human-readable, contextual description of the event */
  readonly description: string;
  /** Component, service, or module that emitted the event */
  readonly component: string;
  /** Feature or category used to group events */
  readonly tag: string;
  /** When the event occurred, if earlier than the log call; defaults to now */
  readonly timestamp?: Date;
  /** The caught error */
  readonly error?: Error;
}

export interface Logger {
  logVerbose(data: LogData): void;
  logDebug(data: LogData): void;
  logInfo(data: LogData): void;
  logWarn(data: LogData): void;
  logError(data: LogData): void;
  logCritical(data: LogData): void;
}
