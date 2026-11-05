/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger as PinoLogger} from 'pino';
import {LogLevel} from '@arc/core';
import type {ClientLogRecord, ClientLogWriter} from './client-log-writer.js';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const PINO_LEVEL: Record<LogLevel, PinoLevel> = {
  [LogLevel.Verbose]: 'trace',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Critical]: 'fatal',
};

/**
 * Writes client records through the server's Pino instance, so they reach
 * the same transports. Unlike `PinoLogService`, it adds neither the server's
 * identity nor the active request context: the client is both the producer
 * (OpenTelemetry `service.*`) and the client the record belongs to.
 */
export class PinoClientLogWriter implements ClientLogWriter {
  constructor(private readonly pinoLogger: PinoLogger) {}

  write(record: ClientLogRecord): void {
    const {level, ...fields} = record;
    this.pinoLogger[PINO_LEVEL[level]]({
      ...fields,
      serviceName: record.clientName,
      serviceInstanceId: record.clientInstanceId,
    });
  }
}
