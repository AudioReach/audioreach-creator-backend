<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Logging Infrastructure Design

**Requirements:** [../requirements/separate-logging-db-requirements.md](../requirements/separate-logging-db-requirements.md)
**Reference:** `docs/logging/logging-lld.md` (original logging LLD), `docs/logging/design/separate-logging-db-design1.md` (earlier separate DB design — input to review)
**Review:** `docs/logging/logging-redesign-lld.md` (reviewer's redesign of separate-logging-db-design1.md)
**Date:** 2026-08-15
**Status:** Draft

---

## Table of Contents

1. [Scope](#1-scope)
2. [Architecture Overview](#2-architecture-overview)
3. [Changes in @arc/logger](#3-changes-in-arclogger)
4. [Changes in @arc/persistence](#4-changes-in-arcpersistence)
5. [API Layer: LoggingDataSourceProvider and database-path.ts](#5-api-layer-loggingdatasourceprovider-and-database-pathts)
6. [API Layer: LoggingModule](#6-api-layer-loggingmodule)
7. [Changes in ArcCqrsModule](#7-changes-in-arccqrsmodule)
8. [File Changes Summary](#8-file-changes-summary)

---

## 1. Scope

The original logging LLD (`logging-lld.md`) placed `log_entries` inside `database.db` — the same SQLite file as all domain entities. This causes two problems:

1. **Write contention** — SQLite locks the entire file on every write. Fire-and-forget log writes compete with domain transactions on the same lock.
2. **Transactional entanglement** — a domain transaction rollback can interfere with in-flight log writes.

This document describes the infrastructure changes required to move `log_entries` into a dedicated `logging.db`, fully isolated from the main DB.

The following are **out of scope**:
- Changes to `ConsoleLoggerService` or `'LOGGER'` — existing server-generated log call sites are untouched.
- Changes to the `log_entries` table schema or the logging REST API.
- Migrating existing log data from `database.db` to `logging.db`.

---

## 2. Architecture Overview

```
                    ┌─────────────────────────────────────────────────┐
                    │               @arc/logger package                │
                    │                                                   │
                    │  LogEntrySchema    logging migrations             │
                    │  getLoggingOrmBase                               │
                    │  PinoLogService    LoggerFactory                 │
                    │  ConsoleTransport  FileTransport  SQLiteTransport│
                    │  PinoSQLiteTransport                             │
                    │  DbLogQueryService                               │
                    └─────────────────────────────────────────────────┘
                             ↑                          ↑
                    implements Logger1           implements LogQueryService
                    from @arc/core               from @arc/core

┌─────────────────────────────────────────────────────────────────────┐
│                       LoggingModule (NestJS)                         │
│  LoggingDataSourceProvider → LOGGING_DATA_SOURCE → logging.db        │
│  exports: 'LOGGER1' (PinoLogService)                                 │
│           'LOG_QUERY_SERVICE' (DbLogQueryService)                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ imported by
┌──────────────────────────────▼──────────────────────────────────────┐
│                         ArcCqrsModule                                │
│  'LOGGER'  ──────────────► ConsoleLoggerService  (unchanged)         │
│  'LOGGER1' ──────────────► PinoLogService        (from LoggingModule)│
│  QUERY_SERVICES factory ──► new DbQueryServices(dataSource,          │
│                               logQueryService, logger)               │
└─────────────────────────────────────────────────────────────────────┘

Write path (any Logger1 call):
  logger1.logXxx(data)
    → PinoLogService → pino.multistream
        ├── ConsoleTransport  → stdout
        ├── FileTransport     → logs/server-debug.log
        └── SQLiteTransport → PinoSQLiteTransport
                → LOGGING_DATA_SOURCE.query() → logging.db

Read path:
  GET /arc-api/v1/projects/:projectId/logs
    → LogController → QueryBus → GetLogsByProjectHandler
        → queryServices.logQueryService.getLogsByProject()
            → DbLogQueryService → LOGGING_DATA_SOURCE → logging.db
```

**Key invariant:** `LOGGING_DATA_SOURCE` never crosses the `LoggingModule` boundary as a raw token. `ArcCqrsModule` receives only `'LOGGER1'` and `'LOG_QUERY_SERVICE'`. `DbQueryServices` (in `@arc/persistence`) receives only a `LogQueryService` interface — it never sees the logging `DataSource` directly.

---

## 3. Changes in @arc/logger

All logging persistence artifacts — schema, migration, ORM base, and query service — live in `@arc/logger`. This gives the logging concern a single package boundary end-to-end: schema → migration → write transport → read service. `log_entries` has no domain relationships with any entity in `@arc/persistence` and is not subject to edit sessions or domain transactions, so it does not belong there.

### 3.1 LogEntrySchema and LogEntryRow

**File:** `packages/infrastructure/logger/src/entity-schema/log-entry.schema.ts` (new)

Moved from `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/logging/log-entry.schema.ts`. Content is identical — no schema changes.

```typescript
import {EntitySchema} from 'typeorm';
import type {LogLevel} from '@arc/core';

export interface LogEntryRow {
  id: number;
  level: LogLevel;
  timestamp: string;
  source: string;
  projectId?: string;
  component: string;
  tag: string;
  msg: string;
  description: string;
  error?: string;
}

export const LogEntrySchema = new EntitySchema<LogEntryRow>({
  name: 'LogEntry',
  tableName: 'log_entries',
  columns: {
    id:          {type: 'integer', primary: true, generated: 'increment'},
    level:       {name: 'level',       type: 'text', nullable: false},
    timestamp:   {name: 'timestamp',   type: 'text', nullable: false},
    source:      {name: 'source',      type: 'text', nullable: false},
    projectId:   {name: 'project_id',  type: 'text', nullable: true},
    component:   {name: 'component',   type: 'text', nullable: false},
    tag:         {name: 'tag',         type: 'text', nullable: false},
    msg:         {name: 'msg',         type: 'text', nullable: false},
    description: {name: 'description', type: 'text', nullable: false},
    error:       {name: 'error',       type: 'text', nullable: true},
  },
});
```

### 3.2 getLoggingOrmBase

**File:** `packages/infrastructure/logger/src/orm/logging-orm-base.ts` (new)

```typescript
import {LogEntrySchema} from '../entity-schema/log-entry.schema.js';
import {loggingMigrations} from '../migrations/logging-migration-index.js';
import type {DataSourceOptions} from 'typeorm';

export function getLoggingOrmBase(): Pick<DataSourceOptions, 'entities' | 'migrations' | 'synchronize'> {
  return {
    entities: [LogEntrySchema],
    migrations: loggingMigrations,
    synchronize: false,
  };
}
```

### 3.3 Logging Migration Index

**File:** `packages/infrastructure/logger/src/migrations/logging-migration-index.ts` (new)

```typescript
import {CreateLogEntries1755100000000} from './1755100000000-create-log-entries.js';

export const loggingMigrations = [CreateLogEntries1755100000000];
```

### 3.4 Logging Migration

**File:** `packages/infrastructure/logger/src/migrations/1755100000000-create-log-entries.ts` (new)

```typescript
import type {MigrationInterface, QueryRunner} from 'typeorm';

export class CreateLogEntries1755100000000 implements MigrationInterface {
  name = 'CreateLogEntries1755100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "log_entries" (
        "id"          INTEGER PRIMARY KEY AUTOINCREMENT,
        "level"       TEXT NOT NULL,
        "timestamp"   TEXT NOT NULL,
        "source"      TEXT NOT NULL,
        "project_id"  TEXT,
        "component"   TEXT NOT NULL,
        "tag"         TEXT NOT NULL,
        "msg"         TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "error"       TEXT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "log_entries"`);
  }
}
```

### 3.5 DbLogQueryService

**File:** `packages/infrastructure/logger/src/queries/db-log-query-service.ts` (new — moved from `@arc/persistence`)

```typescript
import type {DataSource} from 'typeorm';
import type {LogQueryService, LogEntryReadModel} from '@arc/core';

const LOG_ENTRY_ENTITY = 'LogEntry';

export class DbLogQueryService implements LogQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getLogsByProject(projectId: string, clientId: string): Promise<LogEntryReadModel[]> {
    return this.dataSource
      .getRepository(LOG_ENTRY_ENTITY)
      .createQueryBuilder('l')
      .where('l.source = :clientId', {clientId})
      .andWhere('(l.projectId = :projectId OR l.projectId IS NULL)', {projectId})
      .orderBy('l.timestamp', 'DESC')
      .getMany() as Promise<LogEntryReadModel[]>;
  }
}
```

`ENTITY_NAMES.LogEntry` from `@arc/persistence` is no longer used — the local string constant `'LogEntry'` matches the `name` field in `LogEntrySchema` directly.

### 3.6 Updated index.ts

**File:** `packages/infrastructure/logger/src/index.ts` (modified)

```typescript
export {PinoLogService} from './pino-log.service.js';
export {LoggerFactory} from './factories/logger.factory.js';
export {ConsoleTransport} from './transports/console-transport.js';
export {FileTransport} from './transports/file-transport.js';
export {SQLiteTransport} from './transports/sqlite-transport.js';
export {PinoSQLiteTransport} from './transports/pino-sqlite-transport.js';
export {DbLogQueryService} from './queries/db-log-query-service.js';
export {getLoggingOrmBase} from './orm/logging-orm-base.js';
export {LogEntrySchema} from './entity-schema/log-entry.schema.js';
export type {LogEntryRow} from './entity-schema/log-entry.schema.js';
export type {LoggerConfig} from './interfaces/logger-config.interface.js';
export type {ITransport, PinoTransportConfig, TransportConfig} from './interfaces/transport.interface.js';
```

---

## 4. Changes in @arc/persistence

### 4.1 Remove LogEntrySchema from the main DB

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/index.ts`

Remove the `LogEntrySchema` import and its entry in `getAllEntitySchemas()`.

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts`

Remove the `LogEntry` entry from `ENTITY_NAMES`.

### 4.2 Delete DbLogQueryService

Delete `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/logging/db-log-query-service.ts`. It now lives in `@arc/logger` (Section 3.5).

### 4.3 Update DbQueryServices constructor

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`

`DbQueryServices` receives a pre-built `LogQueryService` interface instead of constructing `DbLogQueryService` internally. This keeps `@arc/persistence` working purely against `@arc/core` abstractions — it has no reason to know about the logging `DataSource`.

```typescript
import type {LogQueryService} from '@arc/core';

export class DbQueryServices implements QueryServices {
  // ... all existing readonly properties unchanged ...

  constructor(dataSource: DataSource, logQueryService: LogQueryService, logger?: Logger) {
    // ... all existing assignments unchanged ...
    this.logQueryService = logQueryService;
  }
}
```

Remove the `DbLogQueryService` import — it no longer lives in this package.

### 4.4 Main DB migration — no change needed

The main DB migration (`1785297093633-initial-create.ts`) does not contain `CREATE TABLE log_entries` (verified). No change required.

**Existing installations:** Any `database.db` that has a `log_entries` table (created via `synchronize: true` in a dev environment) is unaffected — TypeORM ignores tables not in its entity list.

---

## 5. API Layer: LoggingDataSourceProvider and database-path.ts

### 5.1 getDatabasePath — add filename parameter

**File:** `packages/api/src/infrastructure-wrapper/database/database-path.ts` (modified)

Add a required `filename` parameter to `getDatabasePath()`. There is only one existing call site (`DataSourceProvider`), which is updated to pass `'database.db'` explicitly. No `getLoggingDatabasePath()` wrapper is needed — `LoggingDataSourceProvider` calls `getDatabasePath('logging.db')` directly, consistent with how `DataSourceProvider` calls `getDatabasePath('database.db')`.

```typescript
export function getDatabasePath(filename: string): string {
  const appName = 'audioreach-creator';
  switch (os.platform()) {
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Local', appName, filename);
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName, filename);
    default:
      return path.join(os.homedir(), '.local', 'share', appName, filename);
  }
}
```

`DataSourceProvider` updated:
```typescript
database: getDatabasePath('database.db'),
```

`LoggingDataSourceProvider` uses:
```typescript
database: getDatabasePath('logging.db'),
```

### 5.2 LoggingDataSourceProvider

**File:** `packages/api/src/infrastructure-wrapper/database/providers/logging-data-source-provider.ts` (new)

Manages the lifecycle of `logging.db`. Follows the same `OnModuleInit`/`OnModuleDestroy` pattern as `DataSourceProvider`.

```typescript
import {Injectable} from '@nestjs/common';
import type {OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {getLoggingOrmBase} from '@arc/logger';
import {getDatabasePath} from '../database-path.js';

@Injectable()
export class LoggingDataSourceProvider implements OnModuleInit, OnModuleDestroy {
  private static instance: DataSource | null = null;

  async onModuleInit(): Promise<void> {
    await this.getDataSource();
  }

  async getDataSource(): Promise<DataSource> {
    if (LoggingDataSourceProvider.instance) {
      return LoggingDataSourceProvider.instance;
    }
    LoggingDataSourceProvider.instance = new DataSource({
      type: 'sqlite',
      database: getDatabasePath('logging.db'),
      ...getLoggingOrmBase(),
    });
    await LoggingDataSourceProvider.instance.initialize();
    const hasPending = await LoggingDataSourceProvider.instance.showMigrations();
    if (hasPending) {
      await LoggingDataSourceProvider.instance.runMigrations({transaction: 'all'});
    }
    return LoggingDataSourceProvider.instance;
  }

  async onModuleDestroy(): Promise<void> {
    if (LoggingDataSourceProvider.instance) {
      await LoggingDataSourceProvider.instance.destroy();
      LoggingDataSourceProvider.instance = null;
    }
  }
}
```

`LoggingDataSourceProvider` does not inject `'LOGGER'`. Injecting a logger here would create a circular dependency within `LoggingModule` — the module that provides `'LOGGER1'` also owns this provider.

---

## 6. API Layer: LoggingModule

**File:** `packages/api/src/infrastructure-wrapper/logging.module.ts` (new)

The single wiring point for all logging infrastructure. `LOGGING_DATA_SOURCE` is an internal provider — never exported. `ArcCqrsModule` only sees `'LOGGER1'` and `'LOG_QUERY_SERVICE'`.

```typescript
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
      useFactory: (provider: LoggingDataSourceProvider) => provider.getDataSource(),
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
            {transport: file,    level: 'trace', options: {logsDir: './logs', filename: 'server-debug.log'}},
            {transport: sqlite,  level: 'trace'},
          ],
        }),
      inject: [LoggerFactory, ConsoleTransport, FileTransport, SQLiteTransport],
    },
    {
      provide: 'LOGGER1',
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
  exports: ['LOGGER1', 'LOG_QUERY_SERVICE'],
})
export class LoggingModule {}
```

---

## 7. Changes in ArcCqrsModule

**File:** `packages/api/src/infrastructure-wrapper/arc-cqrs.module.ts` (modified)

**1. Import LoggingModule:**
```typescript
@Module({
  imports: [LoggingModule],
  ...
})
```

**2. Update QUERY_SERVICES factory:**
```typescript
{
  provide: 'QUERY_SERVICES',
  useFactory: (dataSource: DataSource, logQueryService: LogQueryService, logger: Logger) =>
    new DbQueryServices(dataSource, logQueryService, logger),
  inject: ['DATA_SOURCE', 'LOG_QUERY_SERVICE', 'LOGGER'],
},
```

**3. Remove transport providers now owned by LoggingModule:**

Remove these providers — they have moved to `LoggingModule`:
- `ConsoleTransport`
- `FileTransport`
- `SQLiteTransport`
- `LoggerFactory`
- `'PINO_LOGGER'`

Everything else is unchanged:
- `'LOGGER'` → `ConsoleLoggerService` stays as-is
- `LoggingModule` is added to the `exports` array — this re-exports `'LOGGER1'` and `'LOG_QUERY_SERVICE'` to any module that imports `ArcCqrsModule`
- `CommandBus` and `QueryBus` continue injecting `'LOGGER'`

---

## 8. File Changes Summary

| File | Action | Notes |
|---|---|---|
| `packages/infrastructure/logger/src/entity-schema/log-entry.schema.ts` | **New** | Moved from `@arc/persistence` — no content change |
| `packages/infrastructure/logger/src/orm/logging-orm-base.ts` | **New** | |
| `packages/infrastructure/logger/src/migrations/logging-migration-index.ts` | **New** | |
| `packages/infrastructure/logger/src/migrations/1755100000000-create-log-entries.ts` | **New** | |
| `packages/infrastructure/logger/src/queries/db-log-query-service.ts` | **New** | Moved from `@arc/persistence` |
| `packages/infrastructure/logger/src/index.ts` | Modify | Add exports for new artifacts |
| `packages/infrastructure/persistence/.../entity-schema/index.ts` | Modify | Remove `LogEntrySchema` import and array entry |
| `packages/infrastructure/persistence/.../entity-schema/entity-table-names.ts` | Modify | Remove `LogEntry` entry |
| `packages/infrastructure/persistence/.../queries/logging/db-log-query-service.ts` | **Delete** | Moved to `@arc/logger` |
| `packages/infrastructure/persistence/.../queries/typeorm-query-services.ts` | Modify | Constructor: replace internal `DbLogQueryService` construction with `LogQueryService` parameter |
| `packages/infrastructure/persistence/tests/integration/logging/db-log-query-service.spec.ts` | Modify | Import updated to `@arc/logger`; switched to self-contained in-memory DataSource |
| `packages/infrastructure/persistence/package.json` | Modify | Add `@arc/logger` as `devDependency` (test-only) |
| `packages/api/src/infrastructure-wrapper/database/database-path.ts` | Modify | Add required `filename` param to `getDatabasePath()`; remove `getLoggingDatabasePath()` |
| `packages/api/src/infrastructure-wrapper/database/providers/data-source-provider.ts` | Modify | Update call to `getDatabasePath('database.db')` |
| `packages/api/src/infrastructure-wrapper/database/providers/logging-data-source-provider.ts` | **New** | |
| `packages/api/src/infrastructure-wrapper/logging.module.ts` | **New** | |
| `packages/api/src/infrastructure-wrapper/arc-cqrs.module.ts` | Modify | Import `LoggingModule`; update `QUERY_SERVICES`; remove transport providers; export `LoggingModule` instead of `'LOGGER1'` |
| `packages/core/src/index.ts` | Modify | Add exports for `GetLogsByProjectQuery` and `GetLogsByProjectHandler` |
