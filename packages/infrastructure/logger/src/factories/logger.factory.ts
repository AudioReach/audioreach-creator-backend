/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {pino, multistream} from 'pino';
import type {Logger} from 'pino';
import {LogLevel} from '@arc/core';
import type {LoggerConfig} from '../interfaces/logger-config.interface.js';

/** Writes each record's `level` as the matching `LogLevel`. */
const LOG_LEVEL_BY_PINO_LABEL: Readonly<Record<string, LogLevel>> = {
  trace: LogLevel.Verbose,
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
  fatal: LogLevel.Critical,
};

export class LoggerFactory {
  createLogger(config: LoggerConfig): Logger {
    const streams = config.transports.map(t => t.transport.create(t));
    return pino(
      {
        level: config.level,
        serializers: {
          error(error: unknown): unknown {
            if (error instanceof Error) {
              return {
                message: error.message,
                stack: error.stack,
              };
            }
            return error;
          },
        },
        formatters: {
          level(label: string): {level: string} {
            return {level: LOG_LEVEL_BY_PINO_LABEL[label] ?? label};
          },
        },
      },
      multistream(streams),
    );
  }
}
