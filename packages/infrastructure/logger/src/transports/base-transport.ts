/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ITransport,
  PinoTransportConfig,
  TransportConfig,
} from '../interfaces/transport.interface.js';
import {LogLevel} from '@arc/core';

export abstract class BaseTransport implements ITransport {
  abstract create(config: TransportConfig): PinoTransportConfig;

  validate(config: TransportConfig): boolean {
    const validLevels: string[] = Object.values(LogLevel);
    return validLevels.includes(config.level);
  }
}
