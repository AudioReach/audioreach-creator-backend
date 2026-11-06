/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger as PinoLogger} from 'pino';
import type {Logger, LogData, LegacyLogData} from '@arc/core';
import type {ActiveLogContextProvider} from './context/active-log-context.js';
import type {LogProducerIdentity} from './identity/log-producer-identity.js';

/**
 * A record the server writes about its own work: the caller's event plus
 * this process's producer identity and the active request context. Records
 * submitted by a client do not use this type.
 */
export interface ServerLogRecord {
  eventName: string;
  description: string;
  component: string;
  tag: string;
  timestamp: Date;
  error?: Error;
  serviceName: string;
  serviceInstanceId: string;
  /** Project of the request, when its route names one */
  projectId?: string;
  /** Client the request was made by, when there was one */
  clientName?: string;
  /** Client launch the request was made by, when there was one */
  clientInstanceId?: string;
}

/**
 * The only `Logger` implementation. It accepts both call shapes and writes
 * every record as `LogData`; legacy calls are translated here and nowhere
 * else.
 */
export class PinoLogService implements Logger {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly producer: LogProducerIdentity,
    private readonly contextProvider: ActiveLogContextProvider,
  ) {}

  logVerbose(data: LogData | LegacyLogData): void {
    this.pinoLogger.trace(this.toRecord(data));
  }
  logDebug(data: LogData | LegacyLogData): void {
    this.pinoLogger.debug(this.toRecord(data));
  }
  logInfo(data: LogData | LegacyLogData): void {
    this.pinoLogger.info(this.toRecord(data));
  }
  logWarn(data: LogData | LegacyLogData): void {
    this.pinoLogger.warn(this.toRecord(data));
  }
  logError(data: LogData | LegacyLogData): void {
    this.pinoLogger.error(this.toRecord(data));
  }
  logCritical(data: LogData | LegacyLogData): void {
    this.pinoLogger.fatal(this.toRecord(data));
  }

  private toRecord(data: LogData | LegacyLogData): ServerLogRecord {
    const {clientName, clientInstanceId, projectId} =
      this.contextProvider.current();
    const record: ServerLogRecord = {
      ...toLogData(data),
      serviceName: this.producer.serviceName,
      serviceInstanceId: this.producer.serviceInstanceId,
    };
    if (projectId !== undefined) {
      record.projectId = projectId;
    }
    if (clientName !== undefined) {
      record.clientName = clientName;
    }
    if (clientInstanceId !== undefined) {
      record.clientInstanceId = clientInstanceId;
    }
    return record;
  }
}

/**
 * Translates a legacy call: `msg` becomes `eventName`, a missing
 * `timestamp` becomes now, and a string `error` is wrapped in an `Error`.
 */
function toLogData(data: LogData | LegacyLogData): LogData {
  if (!isLegacy(data)) {
    return data;
  }
  const {msg, error, timestamp, ...rest} = data;
  return {
    ...rest,
    eventName: msg,
    timestamp: timestamp ?? new Date(),
    ...(error !== undefined && {
      error: typeof error === 'string' ? errorFromText(error) : error,
    }),
  };
}

/**
 * Wraps preformatted error text. The stack is removed: it would point at
 * this translation, not at the failure the text describes.
 */
function errorFromText(text: string): Error {
  const error = new Error(text);
  delete error.stack;
  return error;
}

function isLegacy(data: LogData | LegacyLogData): data is LegacyLogData {
  return 'msg' in data;
}
