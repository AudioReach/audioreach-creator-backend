/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TransportConfig} from './transport.interface.js';

export interface LoggerConfig {
  level: string;
  transports: TransportConfig[];
}
