/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogEntryBase} from './log-entry-base.js';

export interface Logger {
  logVerbose(data: LogData): void;
  logDebug(data: LogData): void;
  logInfo(data: LogData): void;
  logWarn(data: LogData): void;
  logError(data: LogData): void;
  logCritical(data: LogData): void;
}

export interface LogData {
  /** The main log message describing what happened */
  msg: string;
  /** Timestamp when the log event occurred */
  timestamp: Date;
  /** Identifier of the client application or API consumer */
  clientId?: string;
  /** Identifier of the project/workspace context where the action occurred */
  projectId?: string;
  /** Specific action or operation that was performed */
  action: string;
  /** The component, service, or module that generated this log entry */
  component: string;
  /** Categorization tag for grouping related log entries */
  tag: string;
  /** Error object containing details when logging error-level events */
  error?: Error;
}

/** Even though there is no generic log method in ILogger interface, this is to maintain consistency on dependent packages */
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

/** New log data interface used by PinoLogService and all new logging code.
 * Future: once all LogData call sites are migrated, delete LogData/Logger and rename these. */
export interface LogData1 extends LogEntryBase {
  /** Timestamp when the log event occurred */
  timestamp: Date;
}

/** New logger interface backed by PinoLogService.
 * Future: once Logger is fully replaced, delete Logger and rename this to Logger. */
export interface Logger1 {
  logVerbose(data: LogData1): void;
  logDebug(data: LogData1): void;
  logInfo(data: LogData1): void;
  logWarn(data: LogData1): void;
  logError(data: LogData1): void;
  logCritical(data: LogData1): void;
}
