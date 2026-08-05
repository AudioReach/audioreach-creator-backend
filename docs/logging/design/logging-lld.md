<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Logging — Low-Level Design

## Document Information

- **Version**: 2.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `POST /arc-api/v1/logs` — write a log entry
  - `GET /arc-api/v1/projects/{projectId}/logs` — read log entries for a project

---

## Table of Contents

1. [Scope and Requirements](#1-scope-and-requirements)
2. [New Dependency](#2-new-dependency)
3. [Database Schema](#3-database-schema)
4. [LogController](#4-logcontroller)
5. [Read Log Entries Endpoint](#5-read-log-entries-endpoint)
6. [PinoLogService](#6-pinologservice)
7. [Architecture Overview](#7-architecture-overview)
8. [Transport Layer](#8-transport-layer)
9. [Module Wiring](#9-module-wiring)
10. [Error Handling](#10-error-handling)
11. [Folder Structure](#11-folder-structure)
12. [Logger Propagation Pattern](#12-logger-propagation-pattern)
13. [LogData Field Convention](#13-logdata-field-convention)
14. [LogData Migration Strategy](#14-logdata-migration-strategy)

---

## 1. Scope and Requirements

Persistent DB logging for the AudioReach Creator Backend. All server-generated log calls and client-submitted log entries are written to the SQLite database, and can be read back per project. Console and file logging are preserved via Pino transports.

### Functional Requirements

**FR-1 — Client log endpoint**

Clients can POST a log entry to the server via REST. The server persists it to the database.

- **Endpoint**: `POST /arc-api/v1/logs`
- Request body: `level`, `description`, `timestamp`, `msg`, `component`, `tag`, `projectId` (optional), `error` (optional, string)
- `clientId` is **not** part of the request body. It is extracted from the JWT in the controller layer (assumed available) and written to the `source` column.
- Returns 200 on success, 400 on validation failure

**FR-2 — Server-side logging to DB**

All server-generated log calls are persisted to the database. This includes logs emitted by: `CommandBus`, `QueryBus`, controllers, exception filters, and middleware.

**FR-3 — All six log levels supported**

`verbose`, `debug`, `info`, `warn`, `error`, `critical` — all persisted to the database for both client-submitted and server-generated log entries.

**FR-4 — Single table for all logs**

All log entries — from all clients and the server — are stored in one table. No per-client or per-project table splitting.

**FR-5 — Log entries survive errors**

A command transaction failure or rollback must not cause log entries from that operation to be lost.

**FR-6 — Multiple clients in parallel**

Multiple clients must be able to submit log entries concurrently without data loss or corruption.

**FR-7 — Read log entries by project**

Clients and internal tools can retrieve log entries for a given project via REST.

- **Endpoint**: `GET /arc-api/v1/projects/:projectId/logs`
- `clientId` is extracted from the JWT in the controller layer (same mechanism as the write endpoint, Section 4) — not a query parameter
- Returns log entries where `source` matches the caller's `clientId` **and** either `projectId` matches the path parameter **or** `projectId` is `null` (server-generated or project-less entries belonging to that client are always included)
- Response is always an array; an empty array is a valid response when no entries match

---

## 2. New Dependency

`pino` must be added to `packages/infrastructure/logger/package.json` — see Section 7.1 for why the logging implementation lives in its own infrastructure package rather than `packages/api`:

```json
"pino": "^9.x"
```

---

## 3. Database Schema

### 3.1 Table: `log_entries`

The log table deliberately does **not** follow `EntityBaseRow`. Uses SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`.

```sql
CREATE TABLE IF NOT EXISTS log_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       TEXT NOT NULL,
  timestamp   TEXT NOT NULL,
  source      TEXT NOT NULL,
  project_id  TEXT,
  component   TEXT NOT NULL,
  tag         TEXT NOT NULL,
  msg         TEXT NOT NULL,
  description TEXT NOT NULL,
  error       TEXT
);
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER PK | no | auto-increment |
| `level` | TEXT | no | one of `LogLevel` — `verbose`/`debug`/`info`/`warn`/`error`/`critical` |
| `timestamp` | TEXT | no | ISO-8601 string |
| `source` | TEXT | no | `clientId` for client-submitted logs, `LogSource.Server` for server-generated logs. Replaces the old `client_id` column — `client_id` is no longer stored. Column stays `TEXT` since client IDs are unbounded; only the well-known `"Server"` value has a named constant. |
| `project_id` | TEXT | yes | |
| `component` | TEXT | no | |
| `tag` | TEXT | no | |
| `msg` | TEXT | no | short kebab-case operation identifier — also the Pino message field (Section 8.7) |
| `description` | TEXT | no | JSON string; exact shape varies by `level` — shape to be defined later (see Section 13) |
| `error` | TEXT | yes | JSON blob — `{ message, stack }` when present |

### 3.2 TypeORM Entity Schema

**File**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/logging/log-entry.schema.ts`

`level` uses the `LogLevel` type from `@arc/core` instead of plain `string`, giving type safety at the persistence seam. A new `LogSource` constant is added alongside `LogLevel` in `packages/core/src/shared/types/logger.interface.ts` for the well-known `"Server"` value; the `source` column itself stays `string`/`TEXT` since client IDs are unbounded:

```typescript
export const LogSource = {Server: 'Server'} as const;
export type LogSource = (typeof LogSource)[keyof typeof LogSource];
```

```typescript
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
    id:          { type: 'integer', primary: true, generated: 'increment' },
    level:       { name: 'level',       type: 'text', nullable: false },
    timestamp:   { name: 'timestamp',   type: 'text', nullable: false },
    source:      { name: 'source',      type: 'text', nullable: false },
    projectId:   { name: 'project_id',  type: 'text', nullable: true },
    component:   { name: 'component',   type: 'text', nullable: false },
    tag:         { name: 'tag',         type: 'text', nullable: false },
    msg:         { name: 'msg',         type: 'text', nullable: false },
    description: { name: 'description', type: 'text', nullable: false },
    error:       { name: 'error',       type: 'text', nullable: true },
  },
});
```

`LogEntrySchema` is added to `getAllEntitySchemas()` and `ENTITY_NAMES` in `entity-table-names.ts`.

---

## 4. LogController

**File**: `packages/api/src/presentation/rest/modules/logging/logging.controller.ts`

`LogController` handles both the write endpoint (`POST /arc-api/v1/logs`, Section 4.1) and the read endpoint (`GET /arc-api/v1/projects/:projectId/logs`, Section 4.2), defined together in this one class/file.

```typescript
@Controller('arc-api/v1')
export class LogController {
  constructor(
    @Inject('LOGGER') private readonly logger: Logger,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('logs')
  @HttpCode(HttpStatus.OK)
  log(@Body() dto: CreateLogEntryRequestDto, @ClientId() clientId: string): void {
    const data: LogData = {
      description: dto.description,
      timestamp:   dto.timestamp,
      msg:         dto.msg,
      component:   dto.component,
      tag:         dto.tag,
      source:      clientId,
      projectId:   dto.projectId,
      error:       dto.error ? new Error(dto.error) : undefined,
    };

    switch (dto.level) {
      case LogLevel.Verbose:  this.logger.logVerbose(data);  break;
      case LogLevel.Debug:    this.logger.logDebug(data);    break;
      case LogLevel.Info:     this.logger.logInfo(data);     break;
      case LogLevel.Warn:     this.logger.logWarn(data);     break;
      case LogLevel.Error:    this.logger.logError(data);    break;
      case LogLevel.Critical: this.logger.logCritical(data); break;
    }
  }

  @Get('projects/:projectId/logs')
  async getLogs(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
  ): Promise<ApiResult<LogEntryResponseDto[]>> {
    const query = new GetLogsByProjectQuery(projectId, clientId);
    const logs = await this.queryBus.execute<LogEntryReadModel[]>(query);

    return {
      data: logs.map(l => this.mapToDto(l)),
      success: true,
      message: 'Log entries retrieved successfully',
    };
  }

  private mapToDto(log: LogEntryReadModel): LogEntryResponseDto {
    const dto = new LogEntryResponseDto();
    dto.id = log.id;
    dto.level = log.level;
    dto.description = log.description;
    dto.timestamp = log.timestamp;
    dto.msg = log.msg;
    dto.component = log.component;
    dto.tag = log.tag;
    dto.source = log.source;
    dto.projectId = log.projectId;
    dto.error = log.error;
    return dto;
  }
}
```

`@ClientId()` extracts the client identifier from the JWT (assumed to already exist as a param decorator — out of scope for this doc), used by both `log()` and `getLogs()` to populate/filter `source`. For server-generated logs (e.g. `CommandBus`), `source` is set to the literal `"Server"` instead.

### 4.1 Write endpoint — `POST /arc-api/v1/logs`

Clients submit a log entry via REST; the server persists it through the same `Logger`/Pino pipeline as server-generated logs (Section 7):

`LogController.log()` → `PinoLogService` → `pinoLogger` → `pino.multistream` → `ConsoleTransport` / `FileTransport` / `SQLiteTransport` → (`SQLiteTransport` only) `PinoSQLiteTransport` → `DataSource.query()` → `log_entries` table

`projectId` is optional and lives in the request body below, not the path.

**Request DTO** — **File**: `packages/api/src/presentation/rest/modules/logging/dto/create-log-entry-request.dto.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `level` | `LogLevel` | yes | one of the six values |
| `description` | `string` | yes | |
| `timestamp` | `Date` | yes | ISO-8601 |
| `msg` | `string` | yes | |
| `component` | `string` | yes | |
| `tag` | `string` | yes | |
| `projectId` | `string` | no | |
| `error` | `string` | no | serialised error message from client; wrapped in `new Error()` by controller |

`clientId` is not part of this DTO — it is extracted from the JWT (`@ClientId()`, Section 4) and used to populate `source`.

No `async`/`await` on `log()` — `Logger` methods return `void`. DB write is fire-and-forget inside `PinoSQLiteTransport`.

### 4.2 Read endpoint — `GET /arc-api/v1/projects/:projectId/logs`

Project-scoped in its path, matching the `GetAllKeyDefinitions`-style convention. Follows the same CQRS pattern as every other read endpoint in this codebase: `Controller → QueryBus → Handler → QueryService port → DataSource` (Section 5) — `getLogs()` (Section 4) is the controller-layer entry point into that chain.

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | matches `log_entries.project_id`, OR `project_id IS NULL` (server-generated/project-less entries belonging to the caller are always included) |

`clientId` (Section 4) is not a query parameter here either — it always filters `log_entries.source`. There is no way to read another client's logs or explicitly filter to `"Server"`-labeled entries through this endpoint — a caller only ever sees their own `source` rows.

Response is always an array; an empty array is a valid response.

`getLogs()` is `async` since it awaits `QueryBus.execute()`, unlike `log()`.

---

## 5. Read Log Entries Endpoint

### 5.1 Read model (`@arc/core`)

**File**: `packages/core/src/application/ports/persistence/query-services/logging/log-entry-read-model.ts`

```typescript
export interface LogEntryReadModel {
  readonly id: number;
  readonly level: LogLevel;
  readonly description: string;
  readonly timestamp: string;
  readonly msg: string;
  readonly component: string;
  readonly tag: string;
  readonly source: string;
  readonly projectId?: string;
  readonly error?: string;
}
```

### 5.2 Query service port (`@arc/core`)

**File**: `packages/core/src/application/ports/persistence/query-services/logging/log-query-service.ts`

```typescript
export interface LogQueryService {
  getLogsByProject(
    projectId: string,
    clientId: string,
  ): Promise<LogEntryReadModel[]>;
}
```

Registered in `QueryServices`:

```typescript
export interface QueryServices {
  // ... existing services ...
  readonly logQueryService: LogQueryService;  // NEW
}
```

`logQueryService` follows the same pattern as every other query service in this codebase: it is a `readonly` property constructed inside `DbQueryServices` (`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`), the single class implementing `QueryServices`. There is no separate NestJS provider or DI token for it — `DbQueryServices` is already the sole `'QUERY_SERVICES'` provider (Section 9.1), and `logQueryService` is wired the same way as `containerQueryService`, `keyValueDefQueryService`, etc.:

```typescript
export class DbQueryServices implements QueryServices {
  // ... existing readonly properties ...
  readonly logQueryService: LogQueryService;  // NEW

  constructor(dataSource: DataSource, logger?: Logger) {
    // ... existing assignments ...
    this.logQueryService = new DbLogQueryService(dataSource);  // NEW
  }
}
```

### 5.3 Query and Handler (`@arc/core`)

**File**: `packages/core/src/application/logging/get-logs/get-logs-by-project.query.ts`

```typescript
export class GetLogsByProjectQuery extends BaseQuery {
  constructor(
    public readonly projectId: string,
    clientId_: string,
  ) {
    super(clientId_);
  }
}
```

`GetLogsByProjectQuery` has no separate `source`/`clientId` constructor parameter — `BaseQuery` already exposes `readonly clientId: string`, populated from the JWT-derived value the controller passes in. The handler forwards `query.clientId` straight through to `logQueryService.getLogsByProject()`, which matches it against `log_entries.source` at the DB layer (Section 5.4) — `clientId` is the concept name used through the query/handler/port layers, and `source` is only the DB column name it's matched against.

**File**: `packages/core/src/application/logging/get-logs/get-logs-by-project.handler.ts`

```typescript
export class GetLogsByProjectHandler implements QueryHandler<
  GetLogsByProjectQuery,
  Promise<LogEntryReadModel[]>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetLogsByProjectQuery): Promise<LogEntryReadModel[]> {
    return this.queryServices.logQueryService.getLogsByProject(
      query.projectId,
      query.clientId,
    );
  }
}
```

Registered in `QueryHandlerRegistry.registerAllQueryHandlers()` alongside the other query handlers.

### 5.4 DB implementation (`@arc/persistence`)

**File**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/logging/db-log-query-service.ts`

```typescript
export class DbLogQueryService implements LogQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getLogsByProject(
    projectId: string,
    clientId: string,
  ): Promise<LogEntryReadModel[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.LogEntry)
      .createQueryBuilder('l')
      .where('l.source = :clientId', {clientId})
      .andWhere('(l.projectId = :projectId OR l.projectId IS NULL)', {
        projectId,
      })
      .orderBy('l.timestamp', 'DESC')
      .getMany() as Promise<LogEntryReadModel[]>;
  }
}
```

No overlay/session logic — `log_entries` is append-only and not subject to edit sessions, unlike domain entities such as `KeyDefinition`.

---

## 6. PinoLogService

**File**: `packages/infrastructure/logger/src/pino-log.service.ts`

Implements the `Logger` interface from `@arc/core`. Wraps a `pino.Logger`. All six methods delegate to the corresponding Pino level. Plain class — constructed via `useFactory` in `ArcCqrsModule` (Section 9.1), not `@Injectable()`.

| `Logger` method | Pino level |
|---|---|
| `logVerbose` | `trace` |
| `logDebug` | `debug` |
| `logInfo` | `info` |
| `logWarn` | `warn` |
| `logError` | `error` |
| `logCritical` | `fatal` |

```typescript
export class PinoLogService implements Logger {
  constructor(private readonly pinoLogger: pino.Logger) {}

  logVerbose(data: LogData): void  { this.pinoLogger.trace(data); }
  logDebug(data: LogData): void    { this.pinoLogger.debug(data); }
  logInfo(data: LogData): void     { this.pinoLogger.info(data); }
  logWarn(data: LogData): void     { this.pinoLogger.warn(data); }
  logError(data: LogData): void    { this.pinoLogger.error(data); }
  logCritical(data: LogData): void { this.pinoLogger.fatal(data); }
}
```

### 6.1 Worked example — one `logInfo()` call, three transports

```typescript
this.logger.logInfo({
  description: 'Fetching key definitions for project 42',
  msg: 'Fetched key definitions',
  component: 'GetAllKeyDefinitionsHandler',
  tag: 'key-definition',
  timestamp: new Date(),
  source: 'client-abc',
  projectId: '42',
});
```

`logInfo()` calls `this.pinoLogger.info(data)` once. Pino serialises `data` to a single JSON string and writes that same string to every stream in `pino.multistream` (Section 7) — the three transports don't run sequentially or call back into `PinoLogService`; Pino fans the one write out to all of them:

- **`ConsoleTransport`** (Section 8.3) — writes the JSON line to `process.stdout`, e.g.:
  ```
  {"level":"info","msg":"Fetched key definitions","description":"Fetching key definitions for project 42","component":"GetAllKeyDefinitionsHandler","tag":"key-definition","source":"client-abc","projectId":"42","timestamp":"2026-07-26T10:00:00.000Z"}
  ```
- **`FileTransport`** (Section 8.4) — the identical line is appended to `logs/server-debug.log` via `pino.destination`.
- **`SQLiteTransport`** (Section 8.5/8.6) — `PinoSQLiteTransport._transform()` receives the same JSON string, parses it, and runs one `INSERT INTO log_entries` with `level='info'`, `msg='Fetched key definitions'`, `description='Fetching key definitions for project 42'`, `source='client-abc'`, `project_id='42'`, etc.

Each transport is only reached if its configured `level` in `LoggerConfig.transports` (Section 9.1) is at or below `info` — e.g. `ConsoleTransport` is configured at `'info'` so this call reaches it, but a hypothetical transport configured at `'warn'` would not receive it.

---

## 7. Architecture Overview

`PinoLogService` is the `'LOGGER'` provider. Pino fans out log calls to three transports: `ConsoleTransport` (stdout), `FileTransport` (log file), and `SQLiteTransport` (DB). A REST endpoint allows clients to submit their own log entries through the same pipeline, and a second REST endpoint allows reading log entries back per project.

```
'LOGGER' token (ArcCqrsModule)
    └── PinoLogService         (implements Logger from @arc/core)
            └── pino.multistream
                    ├── ConsoleTransport   → stdout/stderr
                    ├── FileTransport      → logs/server-debug-*.log
                    └── SQLiteTransport
                            └── PinoSQLiteTransport  (Transform stream)
                                    └── DataSource.query()
                                            └── log_entries table

POST /arc-api/v1/logs
    └── LogController.log()
            └── inject 'LOGGER'  →  PinoLogService  (same pipeline)

GET /arc-api/v1/projects/:projectId/logs
    └── LogController.getLogs()   (same class as the write endpoint — see Section 4)
            └── QueryBus → GetLogsByProjectHandler → LogQueryService
                    └── DataSource.query()  (read from log_entries table)
```

### 7.1 Package placement: `@arc/logger` vs. `@arc/persistence`

`PinoLogService`, `LoggerFactory`, and all three transports (`ConsoleTransport`, `FileTransport`, `SQLiteTransport`/`PinoSQLiteTransport`) live in a new package, `packages/infrastructure/logger` (`@arc/logger`) — a sibling to `@arc/persistence` and `@arc/fs`, not inside either.

**Why a new package instead of `packages/api`:** none of these classes need NestJS's request/controller context to do their job — they turn a `Logger.logInfo(data)` call into bytes written somewhere (console, file, or DB). That is adapter work, not presentation-layer work. They are plain classes with no `@Injectable()` decorator, constructed via `useFactory` in `ArcCqrsModule` (Section 9.1) — the same convention `@arc/persistence`'s `DbQueryServices` already follows. Adding `@nestjs/common` as a dependency of an infrastructure package (as an earlier draft of this LLD proposed) would be the first such dependency in any infrastructure package and was rejected for that reason.

**Why a new package instead of `@arc/persistence`:** `@arc/persistence` is scoped to the shape and retrieval of domain data — entity schemas and query services implementing `@arc/core` ports (`LogEntrySchema`, `DbLogQueryService`, and their ~12 siblings). `@arc/logger` is scoped to the logging *pipeline* — fanning one `Logger` call out to multiple write destinations. Only `SQLiteTransport` touches a `DataSource`; `ConsoleTransport` and `FileTransport` write to stdout and disk and have no relation to persistence at all. Splitting `SQLiteTransport` into `@arc/persistence` while its two sibling transports stayed elsewhere would fragment one cohesive feature (logging) across two packages for a thin distinction, and would give `@arc/persistence` a reason to own unrelated stdout/file I/O.

The one place the two packages meet is `log_entries` itself: `@arc/persistence` owns the schema and the read path (`LogEntrySchema`, `DbLogQueryService` — Sections 3.2, 5.4), and `@arc/logger`'s `SQLiteTransport` is one of the write paths into that same table (Section 8.6). `SQLiteTransport` takes the shared `DataSource` as a constructor argument — the same loose coupling `DbQueryServices` already has — so it does not need to physically live inside `@arc/persistence` to use it.

---

## 8. Transport Layer

All classes in this section live in a new package, `packages/infrastructure/logger` (`@arc/logger`) — see Section 7.1 for why this is a separate package from `@arc/persistence`. None of them use `@Injectable()`; they are plain classes constructed via `useFactory` in `ArcCqrsModule` (Section 9.1), the same convention `@arc/persistence`'s `DbQueryServices` already follows.

`SQLiteTransport` receives the existing `DataSource` as a plain constructor argument — no separate SQLite database file is created.

### 8.1 Interfaces

**`transport.interface.ts`**:
```typescript
export interface PinoTransportConfig {
  level: string;
  stream: DestinationStream;
}

export interface ITransport {
  create(config: TransportConfig): PinoTransportConfig;
  validate?(config: TransportConfig): boolean;
}
```

**`logger-config.interface.ts`**:
```typescript
export interface LoggerConfig {
  level: string;
  transports: TransportConfig[];
}

export interface TransportConfig {
  transport: ITransport;
  level: string;
  options?: Record<string, any>;
}
```

### 8.2 BaseTransport

Abstract class. Subclasses implement `create()`. Provides `validate()` with level checking.

### 8.3 ConsoleTransport

Writes to `process.stdout` or `process.stderr`.

```typescript
export class ConsoleTransport extends BaseTransport {
  create(config: TransportConfig): PinoTransportConfig {
    return {
      level: config.level,
      stream: config.options?.useStderr ? process.stderr : process.stdout,
    };
  }
}
```

### 8.4 FileTransport

Writes to a rotating log file via `pino.destination`.

```typescript
export class FileTransport extends BaseTransport {
  create(config: TransportConfig): PinoTransportConfig {
    const filePath = path.join(
      config.options?.logsDir ?? './logs',
      config.options?.filename ?? 'app.log',
    );
    return {
      level: config.level,
      stream: pino.destination({ dest: filePath, sync: false, mkdir: true }),
    };
  }
}
```

### 8.5 SQLiteTransport

Receives the existing `DataSource` as a constructor argument (passed in by `ArcCqrsModule`'s `useFactory`, not resolved via `@Inject()`). Creates a `PinoSQLiteTransport` stream backed by it.

```typescript
export class SQLiteTransport extends BaseTransport {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  create(config: TransportConfig): PinoTransportConfig {
    return {
      level: config.level,
      stream: new PinoSQLiteTransport(this.dataSource),
    };
  }
}
```

### 8.6 PinoSQLiteTransport

A Node.js `Transform` stream. Receives each log entry from Pino, writes to `log_entries` via `DataSource.query()`. Errors are swallowed — a transport failure must never crash the application or block the stream.

No `objectMode: true` — Pino's `multistream` always writes stringified JSON to destination streams, and a `string` chunk is valid input in default (buffer) mode. `objectMode: true` would only matter if this stream needed to receive JS objects directly, which it never does.

```typescript
export class PinoSQLiteTransport extends Transform {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  _transform(chunk: any, _encoding: string, callback: () => void): void {
    const entry = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;

    this.dataSource
      .query(
        `INSERT INTO log_entries
           (level, timestamp, source, project_id, component, tag, msg, description, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.level       ?? LogLevel.Info,
          entry.timestamp   ?? new Date().toISOString(),
          entry.source      ?? LogSource.Server,
          entry.projectId   ?? null,
          entry.component   ?? '',
          entry.tag         ?? '',
          entry.msg         ?? '',
          entry.description ?? '',
          entry.error ? JSON.stringify(entry.error) : null,
        ],
      )
      .then(() => callback())
      .catch(err => {
        console.error('PinoSQLiteTransport insert error:', err);
        callback();
      });
  }

  _flush(callback: () => void): void {
    callback();
  }
}
```

### 8.7 LoggerFactory

Pino serialises the log level as a **number** by default (`trace=10, debug=20, info=30, warn=40, error=50, fatal=60`), not as a string. `LoggerFactory` overrides `formatters.level` so every stream — console, file, and SQLite — receives the string label instead. This fixes the level representation once at the source rather than remapping it downstream in every consumer.

Pino also expects the log message on a field named `msg` by default. `LogData` (Section 13) already has a field named `msg` — the short kebab-case operation identifier — so Pino's default `msg` lookup is used as-is; no `messageKey` override is needed. `description` (the longer free-text field) is a separate, non-message field on `LogData` and is not what Pino displays as the log line's message text.

```typescript
export class LoggerFactory {
  createLogger(config: LoggerConfig): pino.Logger {
    const streams = config.transports.map(t => t.transport.create(t));
    return pino(
      {
        level: config.level,
        formatters: {
          level(label: string): {level: string} {
            return {level: label};
          },
        },
      },
      pino.multistream(streams),
    );
  }
}
```

---

## 9. Module Wiring

### 9.1 ArcCqrsModule changes

Add transport providers, `LoggerFactory`, `'PINO_LOGGER'` factory, and `PinoLogService` as the `'LOGGER'` provider. All classes come from `@arc/logger` (Section 7.1) and are plain classes — every provider below uses `useFactory`, not `useClass`, since none of them are `@Injectable()`.

```typescript
// Transport providers
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
  inject: ['DATA_SOURCE'],
},

// LoggerFactory
{
  provide: LoggerFactory,
  useFactory: () => new LoggerFactory(),
},

// Pino logger instance
{
  provide: 'PINO_LOGGER',
  useFactory: (
    factory:          LoggerFactory,
    consoleTransport: ConsoleTransport,
    fileTransport:    FileTransport,
    sqliteTransport:  SQLiteTransport,
  ) =>
    factory.createLogger({
      level: 'trace',
      transports: [
        { transport: consoleTransport, level: 'info'  },
        { transport: fileTransport,    level: 'trace',
          options: { logsDir: './logs', filename: 'server-debug.log' } },
        { transport: sqliteTransport,  level: 'trace' },
      ],
    }),
  inject: [LoggerFactory, ConsoleTransport, FileTransport, SQLiteTransport],
},

// LOGGER token
{
  provide: 'LOGGER',
  useFactory: (pinoLogger: pino.Logger) => new PinoLogService(pinoLogger),
  inject: ['PINO_LOGGER'],
},
```

`logQueryService` requires no new provider or token — it is constructed inside `DbQueryServices` (see Section 5.2), which is already injected via the existing `'QUERY_SERVICES'` provider.

### 9.2 LogModule (new)

```typescript
@Module({
  imports: [ArcCqrsModule],
  controllers: [LogController],
})
export class LogModule {}
```

### 9.3 AppModule

`LogModule` added to `AppModule` imports.

---

## 10. Error Handling

| Layer | Condition | Behaviour | Reason |
|---|---|---|---|
| `LogController` | Invalid request body | `400 Bad Request` — NestJS validation | — |
| `LogController` | Unknown `level` value | `400 Bad Request` — DTO validation | — |
| `PinoSQLiteTransport` | `DataSource.query()` throws | `console.error`, `callback()` called — stream continues, entry is lost silently | Calling `callback()` without an error keeps the stream alive; a logging failure must never crash the app or fail the operation being logged — worst case is one lost log line, not a broken request |
| `PinoSQLiteTransport` | JSON parse error on chunk | `console.error`, `callback()` called — stream continues | Same as above — an unparseable chunk must not stop subsequent log entries from being written |
| `LogController` (read) | No entries match `projectId`/`source` | `200 OK` with empty array — not a 404 | A project or source having no logs yet is a normal, expected state, not an error condition |
| `DbLogQueryService` | Unexpected DB error | Exception propagates — `500 Internal Server Error` via NestJS default filter | — |

---

## 11. Folder Structure

```
packages/infrastructure/logger/                 ← NEW package (@arc/logger)
  package.json                                 ← NEW — deps: pino, @arc/core (peer)
  src/
    pino-log.service.ts                        ← NEW
    transports/
      base-transport.ts                        ← NEW
      console-transport.ts                     ← NEW
      file-transport.ts                        ← NEW
      sqlite-transport.ts                      ← NEW
      pino-sqlite-transport.ts                 ← NEW
    interfaces/
      logger-config.interface.ts               ← NEW
      transport.interface.ts                   ← NEW
    factories/
      logger.factory.ts                        ← NEW
    index.ts                                   ← NEW — package exports

packages/api/src/
  infrastructure-wrapper/
    arc-cqrs.module.ts                          ← MODIFY (providers use useFactory, import from @arc/logger)

  presentation/rest/modules/
    logging/
      logging.controller.ts                    ← NEW (LogController — write + read endpoints)
      logging.module.ts                        ← NEW
      dto/
        create-log-entry-request.dto.ts        ← NEW
        log-entry-response.dto.ts              ← NEW

packages/core/src/
  application/
    logging/
      get-logs/
        get-logs-by-project.query.ts           ← NEW
        get-logs-by-project.handler.ts         ← NEW
    ports/persistence/query-services/
      logging/
        log-entry-read-model.ts                ← NEW
        log-query-service.ts                   ← NEW
      query-services.ts                        ← MODIFY (add logQueryService)
    orchestration/cqrs/registries/
      query-handler-registry.ts                ← MODIFY (register GetLogsByProjectQuery)

packages/infrastructure/persistence/src/
  persistence-typeorm-sqllite/
    entity-schema/
      logging/
        log-entry.schema.ts                    ← NEW
      entity-table-names.ts                    ← MODIFY (add LogEntry)
    queries/
      logging/
        db-log-query-service.ts                ← NEW
      typeorm-query-services.ts                ← MODIFY (wire logQueryService)
```

---

## 12. Logger Propagation Pattern

The `Logger` interface lives in `@arc/core`. The concrete implementation (`PinoLogService`) lives in `@arc/logger` (Section 7.1). Core never imports the implementation — it only imports the interface. The concrete instance is passed across package boundaries as a constructor argument, wired by `ArcCqrsModule`.

### 12.1 Package dependency model

| Package | `@arc/core` entry | Can import `Logger`? |
|---|---|---|
| `@arc/core` | owns the interface | ✅ no import needed |
| `@arc/persistence` | `peerDependency` + `devDependency` | ✅ already works today — no change needed |
| `@arc/logger` | `peerDependency` + `devDependency` | ✅ same setup as `@arc/persistence` — implements `Logger` (`PinoLogService`), does not need it in `dependencies` |
| `@arc/api` | `dependency` | ✅ direct |

`@arc/persistence` and `@arc/logger` do **not** need `@arc/core` in `dependencies`. The `peerDependency` ensures `@arc/api` provides the shared instance at runtime. `devDependency` makes types available during build. This is the correct setup and must not be changed.

### 12.2 Injection chain — full picture

```
ArcCqrsModule (@arc/api)
  useFactory(pinoLogger) => new PinoLogService(pinoLogger)   (@arc/logger)
  'LOGGER' → PinoLogService
        │
        │  constructor arg: new CommandBus(..., logger)
        ▼
  CommandBus (@arc/core)
    this.logger: Logger
        │
        │  deps.logger passed into createHandler()
        ▼
  Any CommandHandler (@arc/core)
    this.logger?: Logger
        │
        │  constructor arg: new TypeOrmUnitOfWork(..., logger)
        │  (via createTypeOrmUnitOfWorkFactory)
        ▼
  TypeOrmUnitOfWork (@arc/api)
    this.logger?: Logger
        │
        │  constructor arg: new TypeOrmBulkImportRepository(manager, idGen, logger)
        ▼
  TypeOrmBulkImportRepository (@arc/persistence)
    this.logger?: Logger
        │
        │  constructor arg: new DataLinkInserter(manager, logger)
        ▼
  DataLinkInserter (@arc/persistence)
    this.logger?.logInfo(...)   ← Logger interface, Pino invisible
```

`DbQueryServices` already follows this same pattern — `Logger` is passed in via constructor from `ArcCqrsModule` today.

### 12.3 Requirements per layer to start logging

Getting a working `this.logger?.logInfo(...)` call in a new class depends on which layer it's in — each layer reaches `PinoLogService` through a different path.

**New Controller (`@arc/api`)**

Inject `'LOGGER'` directly in the constructor, the same way `LogController` does (Section 4):
```typescript
constructor(@Inject('LOGGER') private readonly logger: Logger) {}
```
`'LOGGER'` is already registered as a provider on `ArcCqrsModule` (Section 9.1); any controller in a module that imports `ArcCqrsModule` can inject it with no further wiring.

**New `CommandHandler` (`@arc/core`)**

`Logger` reaches command handlers via `deps.logger` passed through `CommandHandlerRegistry` → `CommandBus.createHandler()` (Section 12.2's injection chain). Any new `CommandHandler` or repository that needs logging:
1. Add `private readonly logger?: Logger` to its constructor — **optional** so existing callers don't break
2. Import `Logger` from `@arc/core`
3. Register the logger in `CommandHandlerRegistry` via `deps.logger`
4. No changes to `package.json` in any package

**New `QueryHandler` (`@arc/core`)**

**Does not currently receive `Logger` at all.** `QueryBus` is stateless — no `UnitOfWork`, no transaction — and passes only `QueryServices` into `QueryHandler.handle()`, unlike `CommandBus`, which threads `deps.logger` through to every `CommandHandler`. A new `QueryHandler` that wants to log has two options today, neither of which is "just add a constructor param" the way `CommandHandler` works:
- Log from the underlying query service instead (see below), which does receive `Logger`.
- Wait for `QueryBus` logging to be added — a known gap, tracked as a general codebase issue independent of this LLD.

**New `QueryService` in `@arc/persistence`**

Add `private readonly logger?: Logger` (optional, same convention as `CommandHandler`) to the service's constructor, and construct it with `logger` passed through from `DbQueryServices` — which already receives `Logger` as a constructor argument, itself injected from `ArcCqrsModule`'s `'QUERY_SERVICES'` provider (`inject: ['DATA_SOURCE', 'LOGGER']`, Section 9.1). This is exactly the pattern `DbLogQueryService` could follow (Section 5.4 does not currently take a `logger`, since it has no error path worth logging beyond what `DbLogQueryService`'s own DB errors already propagate via NestJS's default exception filter — see Section 11).

---

## 13. `LogData` Field Convention

Consistent use of every `LogData` field across all layers is what makes logs filterable and traceable end-to-end for a single feature.

- **`description`** — a JSON string whose exact shape varies by `level`; the concrete shape per level is **not yet defined** and is deferred to a follow-up. Until then, treat it as an opaque human-readable string when constructing `LogData` at call sites — do not build structured JSON manually. Once the shape is defined, this section and the `LogEntrySchema`/`LogEntryReadModel` types (Sections 3.2, 5.1) will be updated together.
- **`timestamp`** — when the log event occurred. Always `new Date()` at the call site, not when the entry is eventually persisted by the transport.
- **`source`** — identifies the origin of the log entry: the `clientId` (extracted from the JWT) for client-submitted logs, or the literal `"Server"` for server-generated logs. Propagated from the command/query, not re-derived at the logging call site.
- **`projectId`** — identifies which project/workspace context the operation ran in, when known. Propagated from the request (e.g. `String(query.projectId)`), not looked up again.
- **`msg`** — a short, human-readable summary of what happened (e.g. `Failed to load key definitions`). This is also the field Pino uses as the log line's message text (its default `msg` lookup, Section 8.7).
- **`component`** — the emitting class name, verbatim (e.g. `GetAllKeyDefinitionsHandler`). One value per class.
- **`tag`** — a stable category shared by every layer participating in one feature or call flow (e.g. `key-definition`). Coarse-grained — lets a query like `WHERE tag = 'key-definition'` return every log entry for that feature across controller, handler, and persistence layers regardless of which class emitted it.
- **`error`** — the `Error` object, included only on failure paths (`logError`/`logCritical`, or any level when something recoverable still went wrong). Never fabricated — pass the actual caught error, wrapped with `error instanceof Error ? error : new Error(String(error))` when the caught value isn't guaranteed to be an `Error`.

`description` and `msg` are complementary, not duplicates: `description` carries the specific, contextual detail for this one call — which project, which id, which input — while `msg` stays a stable, short summary of the operation/outcome that reads the same across every invocation of that code path (useful for grouping/filtering log lines by what happened, independent of which specific record was involved).

---

## 14. LogData Migration Strategy

### 14.0 Implementation decision — additive approach (LogData1 / Logger1)

To avoid breaking 271 existing call sites during this implementation, `LogData` and `Logger` are **not renamed**. Instead, two new types are added to `packages/core/src/shared/types/logger.interface.ts`:

- **`LogData1`** — the new interface with the correct field names (`msg`, `description`, `source`)
- **`Logger1`** — the new interface whose 6 methods accept `LogData1`

`PinoLogService implements Logger1`. All new logging code (transports, controller, DTOs) uses `LogData1`. `ConsoleLoggerService` continues implementing `Logger` with `LogData` untouched.

**Future refactoring (separate task):** Once the team decides to migrate all existing call sites, delete `LogData`, `Logger`, and `ConsoleLoggerService`, then rename `LogData1` → `LogData` and `Logger1` → `Logger` across the codebase. The 271 call sites span `@arc/core`, `@arc/api`, and `@arc/persistence` — the TypeScript compiler will flag every unmigrated site as a type error, making the sweep mechanical.

---

### 14.1 Original migration intent (deferred)

The original plan was a **breaking change** — field renames in one atomic commit:

| Old field | New field | Note |
|---|---|---|
| `msg` | `description` | old `msg` was the long free-text message; renamed to `description` |
| `action` | `msg` | old `action` was the short kebab-case operation identifier; the new `msg` (Section 13) is a short human-readable summary of the outcome, not a kebab-case identifier — a semantic change alongside the rename. Also the Pino message field (Section 8.7). Different field from the old `msg` above. |
| `clientId` | `source` | |

`tag`, `component`, `projectId`, `timestamp`, `error` keep their existing names and semantics.

### 14.2 Scope of impact (for future migration)

`271` call sites across `40` files construct or consume a `LogData` object, spanning `@arc/core` (entity builders, orchestrators, `CommandBus`), `@arc/api` (`main.ts`, middleware, filters, `ConsoleLoggerService`), and `@arc/persistence` (`typeorm-bulk-read-query-service.ts`). `ConsoleLoggerService.formatLogEntry()` additionally reads `data.msg`, `data.action`, and `data.clientId` directly to format the console/file log line.
