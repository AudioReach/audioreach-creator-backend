/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PinoTransportConfig,
  TransportConfig,
} from '../interfaces/transport.interface.js';
import {BaseTransport} from './base-transport.js';

export class ConsoleTransport extends BaseTransport {
  create(config: TransportConfig): PinoTransportConfig {
    return {
      level: config.level,
      stream: config.options?.['useStderr'] ? process.stderr : process.stdout,
    };
  }
}
