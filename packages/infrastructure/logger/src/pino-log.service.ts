/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger as PinoLogger} from 'pino';
import {LogSource} from '@arc/core';
import type {Logger, LogData} from '@arc/core';

export class PinoLogService implements Logger {
  constructor(private readonly pinoLogger: PinoLogger) {}

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

  private withDefaults(data: LogData): LogData {
    return {
      ...data,
      source: data.source ?? LogSource.Server,
      timestamp: data.timestamp ?? new Date(),
    };
  }
}
