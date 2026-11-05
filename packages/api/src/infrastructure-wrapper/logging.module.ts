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
  PinoClientLogWriter,
  AsyncLocalStorageLogContextProvider,
  createLogProducerIdentity,
} from '@arc/logger';
import type {
  ActiveLogContextProvider,
  LogProducerIdentity,
  LogQueryService,
  ClientLogWriter,
} from '@arc/logger';
import type {DataSource} from 'typeorm';
import {LoggingDataSourceProvider} from './database/providers/logging-data-source-provider.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const LOG_PRODUCER_IDENTITY = 'LOG_PRODUCER_IDENTITY';
export const LOG_CONTEXT = 'LOG_CONTEXT';
export const CLIENT_LOG_WRITER = 'CLIENT_LOG_WRITER';
export const LOG_QUERY_SERVICE = 'LOG_QUERY_SERVICE';

const logsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../logs',
);

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
              options: {logsDir, filename: 'server-debug.log'},
            },
            {transport: sqlite, level: 'trace'},
          ],
        }),
      inject: [LoggerFactory, ConsoleTransport, FileTransport, SQLiteTransport],
    },
    {
      provide: LOG_PRODUCER_IDENTITY,
      useFactory: (): LogProducerIdentity => createLogProducerIdentity(),
    },
    {
      provide: LOG_CONTEXT,
      useFactory: (): ActiveLogContextProvider =>
        new AsyncLocalStorageLogContextProvider(),
    },
    {
      provide: 'LOGGER',
      useFactory: (
        pinoLogger: ReturnType<LoggerFactory['createLogger']>,
        producer: LogProducerIdentity,
        logContext: ActiveLogContextProvider,
      ) => new PinoLogService(pinoLogger, producer, logContext),
      inject: ['PINO_LOGGER', LOG_PRODUCER_IDENTITY, LOG_CONTEXT],
    },
    {
      provide: CLIENT_LOG_WRITER,
      useFactory: (
        pinoLogger: ReturnType<LoggerFactory['createLogger']>,
      ): ClientLogWriter => new PinoClientLogWriter(pinoLogger),
      inject: ['PINO_LOGGER'],
    },
    {
      provide: LOG_QUERY_SERVICE,
      useFactory: (dataSource: DataSource): LogQueryService =>
        new DbLogQueryService(dataSource),
      inject: ['LOGGING_DATA_SOURCE'],
    },
  ],
  exports: [
    'LOGGER',
    LOG_QUERY_SERVICE,
    LOG_CONTEXT,
    LOG_PRODUCER_IDENTITY,
    CLIENT_LOG_WRITER,
  ],
})
export class LoggingModule {}
