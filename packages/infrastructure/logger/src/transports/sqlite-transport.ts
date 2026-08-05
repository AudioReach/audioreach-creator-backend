/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {PinoSQLiteTransport} from './pino-sqlite-transport.js';
import {BaseTransport} from './base-transport.js';
import type {
  PinoTransportConfig,
  TransportConfig,
} from '../interfaces/transport.interface.js';

export class SQLiteTransport extends BaseTransport {
  private readonly pinoTransport: PinoSQLiteTransport;

  constructor(dataSource: DataSource) {
    super();
    this.pinoTransport = new PinoSQLiteTransport(dataSource);
  }

  create(config: TransportConfig): PinoTransportConfig {
    return {
      level: config.level,
      stream: this.pinoTransport,
    };
  }

  flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pinoTransport.end((err?: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });
  }
}
