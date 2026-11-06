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
  /** When the event occurred */
  readonly timestamp: Date;
  /** The caught error */
  readonly error?: Error;
  /**
   * Not allowed: the event name is `eventName`. Keeps `LogData` and
   * `LegacyLogData` apart; remove it with `LegacyLogData` once every call
   * uses `LogData`.
   */
  readonly msg?: never;
}

/**
 * The log call shape before `LogData`.
 * @deprecated Migrate to `LogData`. Removed when the migration completes.
 */
export interface LegacyLogData {
  /** Stable operation identifier used for grouping related log entries */
  readonly msg: string;
  /** Detailed, contextual description of the logged event */
  readonly description: string;
  /** Component, service, or module that emitted the log entry */
  readonly component: string;
  /** Feature or category used to group log entries */
  readonly tag: string;
  /** Timestamp when the log event occurred; defaults to the current time */
  readonly timestamp?: Date;
  /** The caught error, or preformatted text when no Error object exists */
  readonly error?: Error | string;
  /**
   * Not allowed: use `LogData` for `eventName`. Keeps `LogData` and
   * `LegacyLogData` apart; removed with this interface once every call uses
   * `LogData`.
   */
  readonly eventName?: never;
}

export interface Logger {
  logVerbose(data: LogData): void;
  /** @deprecated Use the `LogData` overload. */
  logVerbose(data: LegacyLogData): void;
  logDebug(data: LogData): void;
  /** @deprecated Use the `LogData` overload. */
  logDebug(data: LegacyLogData): void;
  logInfo(data: LogData): void;
  /** @deprecated Use the `LogData` overload. */
  logInfo(data: LegacyLogData): void;
  logWarn(data: LogData): void;
  /** @deprecated Use the `LogData` overload. */
  logWarn(data: LegacyLogData): void;
  logError(data: LogData): void;
  /** @deprecated Use the `LogData` overload. */
  logError(data: LegacyLogData): void;
  logCritical(data: LogData): void;
  /** @deprecated Use the `LogData` overload. */
  logCritical(data: LegacyLogData): void;
}
