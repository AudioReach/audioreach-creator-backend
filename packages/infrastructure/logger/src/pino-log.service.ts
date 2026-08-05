/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from 'pino';
import type {Logger1, LogData1} from '@arc/core';

export class PinoLogService implements Logger1 {
  constructor(private readonly pinoLogger: Logger) {}

  logVerbose(data: LogData1): void {
    this.pinoLogger.trace(data);
  }
  logDebug(data: LogData1): void {
    this.pinoLogger.debug(data);
  }
  logInfo(data: LogData1): void {
    this.pinoLogger.info(data);
  }
  logWarn(data: LogData1): void {
    this.pinoLogger.warn(data);
  }
  logError(data: LogData1): void {
    this.pinoLogger.error(data);
  }
  logCritical(data: LogData1): void {
    this.pinoLogger.fatal(data);
  }
}
