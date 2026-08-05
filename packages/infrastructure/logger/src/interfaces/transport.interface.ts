/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DestinationStream} from 'pino';

export interface PinoTransportConfig {
  level: string;
  stream: DestinationStream;
}

export interface TransportConfig {
  transport: ITransport;
  level: string;
  options?: Record<string, unknown>;
}

export interface ITransport {
  create(config: TransportConfig): PinoTransportConfig;
  validate?(config: TransportConfig): boolean;
}
