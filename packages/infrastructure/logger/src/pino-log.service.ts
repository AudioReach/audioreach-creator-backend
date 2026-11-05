/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger as PinoLogger} from 'pino';
import type {Logger, LogData} from '@arc/core';
import type {ActiveLogContextProvider} from './context/active-log-context.js';
import type {LogProducerIdentity} from './identity/log-producer-identity.js';

/**
 * A record the server writes about its own work: the caller's `LogData` plus
 * this process's producer identity and the active request context. Records
 * submitted by a client do not use this type.
 */
export interface ServerLogRecord extends LogData {
  serviceName: string;
  serviceInstanceId: string;
  /** Client the request was made by, when there was one */
  clientName?: string;
  /** Client launch the request was made by, when there was one */
  clientInstanceId?: string;
}

export class PinoLogService implements Logger {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly producer: LogProducerIdentity,
    private readonly contextProvider: ActiveLogContextProvider,
  ) {}

  logVerbose(data: LogData): void {
    this.pinoLogger.trace(this.withDefaults(data));
  }
  logDebug(data: LogData): void {
    this.pinoLogger.debug(this.withDefaults(data));
  }
  logInfo(data: LogData): void {
    this.pinoLogger.info(this.withDefaults(data));
  }
  logWarn(data: LogData): void {
    this.pinoLogger.warn(this.withDefaults(data));
  }
  logError(data: LogData): void {
    this.pinoLogger.error(this.withDefaults(data));
  }
  logCritical(data: LogData): void {
    this.pinoLogger.fatal(this.withDefaults(data));
  }

  private withDefaults(data: LogData): ServerLogRecord {
    const {clientName, clientInstanceId, projectId} =
      this.contextProvider.current();
    const record: ServerLogRecord = {
      ...data,
      timestamp: data.timestamp ?? new Date(),
      serviceName: this.producer.serviceName,
      serviceInstanceId: this.producer.serviceInstanceId,
    };
    if (record.projectId === undefined && projectId !== undefined) {
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
