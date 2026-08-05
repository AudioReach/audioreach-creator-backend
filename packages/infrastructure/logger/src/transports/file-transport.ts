/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PinoTransportConfig,
  TransportConfig,
} from '../interfaces/transport.interface.js';
import {BaseTransport} from './base-transport.js';
import {destination} from 'pino';
import path from 'node:path';

export class FileTransport extends BaseTransport {
  create(config: TransportConfig): PinoTransportConfig {
    const logsDir =
      (config.options?.['logsDir'] as string | undefined) ?? './logs';
    const filename =
      (config.options?.['filename'] as string | undefined) ?? 'app.log';
    const filePath = path.join(logsDir, filename);

    return {
      level: config.level,
      stream: destination({dest: filePath, sync: false, mkdir: true}),
    };
  }
}
