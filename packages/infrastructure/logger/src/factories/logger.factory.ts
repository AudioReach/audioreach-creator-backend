/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {pino, multistream} from 'pino';
import type {Logger} from 'pino';
import type {LoggerConfig} from '../interfaces/logger-config.interface.js';

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
            const map: Record<string, string> = {
              trace: 'verbose',
              fatal: 'critical',
            };
            return {level: map[label] ?? label};
          },
        },
      },
      multistream(streams),
    );
  }
}
