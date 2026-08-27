/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogEntryBase} from './log-entry-base.js';

export const LogLevel = {
  Verbose: 'verbose',
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
  Critical: 'critical',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LogSource = {Server: 'Server'} as const;
export type LogSource = (typeof LogSource)[keyof typeof LogSource];

export interface LogData extends Omit<LogEntryBase, 'error' | 'source'> {
  /** Timestamp when the log event occurred; defaults to the current time */
  timestamp?: Date;
  /** Origin of the log entry; defaults to the server */
  source?: string;
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
