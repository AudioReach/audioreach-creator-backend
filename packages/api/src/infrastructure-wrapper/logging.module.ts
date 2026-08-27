/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {
  PinoLogService,
  LoggerFactory,
  ConsoleTransport,
  FileTransport,
  SQLiteTransport,
  DbLogQueryService,
} from '@arc/logger';
import type {DataSource} from 'typeorm';
import type {LogQueryService} from '@arc/core';
import {LoggingDataSourceProvider} from './database/providers/logging-data-source-provider.js';

@Module({
  providers: [
    LoggingDataSourceProvider,
    {
      provide: 'LOGGING_DATA_SOURCE',
      useFactory: (provider: LoggingDataSourceProvider) =>
        provider.getDataSource(),
      inject: [LoggingDataSourceProvider],
    },
    {
      provide: ConsoleTransport,
      useFactory: () => new ConsoleTransport(),
    },
    {
      provide: FileTransport,
      useFactory: () => new FileTransport(),
    },
    {
      provide: SQLiteTransport,
      useFactory: (dataSource: DataSource) => new SQLiteTransport(dataSource),
      inject: ['LOGGING_DATA_SOURCE'],
    },
    {
      provide: LoggerFactory,
      useFactory: () => new LoggerFactory(),
    },
    {
      provide: 'PINO_LOGGER',
      useFactory: (
        factory: LoggerFactory,
        console: ConsoleTransport,
        file: FileTransport,
        sqlite: SQLiteTransport,
      ) =>
        factory.createLogger({
          level: 'trace',
          transports: [
            {transport: console, level: 'info'},
            {
              transport: file,
              level: 'trace',
              options: {logsDir: './logs', filename: 'server-debug.log'},
            },
            {transport: sqlite, level: 'trace'},
          ],
        }),
      inject: [LoggerFactory, ConsoleTransport, FileTransport, SQLiteTransport],
    },
    {
      provide: 'LOGGER',
      useFactory: (pinoLogger: ReturnType<LoggerFactory['createLogger']>) =>
        new PinoLogService(pinoLogger),
      inject: ['PINO_LOGGER'],
    },
    {
      provide: 'LOG_QUERY_SERVICE',
      useFactory: (dataSource: DataSource): LogQueryService =>
        new DbLogQueryService(dataSource),
      inject: ['LOGGING_DATA_SOURCE'],
    },
  ],
  exports: ['LOGGER', 'LOG_QUERY_SERVICE'],
})
export class LoggingModule {}
