/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export {PinoLogService} from './pino-log.service.js';
export type {ServerLogRecord} from './pino-log.service.js';
export {AsyncLocalStorageLogContextProvider} from './context/async-local-storage-log-context-provider.js';
export type {
  ActiveLogContext,
  ActiveLogContextProvider,
} from './context/active-log-context.js';
export {
  createLogProducerIdentity,
  DEFAULT_SERVICE_NAME,
} from './identity/log-producer-identity.js';
export type {LogProducerIdentity} from './identity/log-producer-identity.js';
export {LoggerFactory} from './factories/logger.factory.js';
export {ConsoleTransport} from './transports/console-transport.js';
export {FileTransport} from './transports/file-transport.js';
export {SQLiteTransport} from './transports/sqlite-transport.js';
export {PinoClientLogWriter} from './client/pino-client-log-writer.js';
export type {
  ClientLogRecord,
  ClientLogWriter,
} from './client/client-log-writer.js';
export {DbLogQueryService} from './queries/db-log-query-service.js';
export {InvalidLogCursorError} from './queries/log-query-service.js';
export type {LogQueryService} from './queries/log-query-service.js';
export {LogOrigin} from './queries/log-entry-read-model.js';
export type {LogEntryReadModel} from './queries/log-entry-read-model.js';
export type {ClientInstanceReadModel} from './queries/client-instance-read-model.js';
export {
  LOG_SEARCH_DEFAULT_LIMIT,
  LOG_SEARCH_MAX_LIMIT,
  LogSortOrder,
} from './queries/log-search-criteria.js';
export type {
  ClientInstancePage,
  ClientInstanceSearchCriteria,
  LogSearchPage,
  ProjectLogFilter,
  ProjectLogSearchCriteria,
} from './queries/log-search-criteria.js';
export {getLoggingOrmBase} from './orm/logging-orm-base.js';
export {LogEntrySchema} from './entity-schema/log-entry.schema.js';
export type {LogEntryRow} from './entity-schema/log-entry.schema.js';
export type {LoggerConfig} from './interfaces/logger-config.interface.js';
export type {
  ITransport,
  PinoTransportConfig,
  TransportConfig,
} from './interfaces/transport.interface.js';
