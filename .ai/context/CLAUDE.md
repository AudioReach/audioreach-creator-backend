# AudioReach Creator Backend

Open-source backend framework for managing AudioReach audio processing database files (.awsp, .acdb)
and serving a REST API for audio graph design operations. BSD-3-Clause, Qualcomm.

## Architecture

**Hexagonal (Ports & Adapters) + CQRS + DDD.** Dependencies always point inward:

```
packages/api  (NestJS, controllers, DTOs)
     ↓
packages/core  (domain + application layer — ZERO framework dependencies)
     ↑
packages/infrastructure/persistence  (TypeORM / SQLite)
packages/infrastructure/fs           (file reading, worker pool)
```

**The cardinal rule: `packages/core` must never import NestJS, TypeORM, or any Node.js API.**
Core depends only on `zod` and `uuid`. (`class-validator` / `class-transformer` were added by mistake and are being removed.)

## Package Responsibilities

| Package | Import name | What it owns |
|---------|-------------|-------------|
| `packages/core` | `@arc/core` | Domain entities, CQRS infrastructure, port interfaces, file-parsing orchestration |
| `packages/api` | `@arc/api` | NestJS controllers, DTOs, exception filters, `ArcCqrsModule` wiring |
| `packages/infrastructure/persistence` | `@arc/persistence` | TypeORM schemas, repository implementations, migrations, query services |
| `packages/infrastructure/fs` | `@arc/fs` | `NodeFileReaderAdapter`, `NodeWorkerPoolAdapter`, `NodeProfilerAdapter` |

## CQRS Conventions

**All commands extend `BaseCommand`, all queries extend `BaseQuery`** (auto-generates UUID + timestamp).

**Manual handler registration** (no reflect-metadata — React Native / cross-platform compatibility):
- New command handler → register in `CommandHandlerRegistry.registerAllCommandHandlers()`
- New query handler → register in `QueryHandlerRegistry.registerAllQueryHandlers()`
- Both files: `packages/core/src/application/orchestration/cqrs/registries/`

**Naming pattern for feature operations:**
```
packages/core/src/application/<feature>/<operation>/
  <operation>.command.ts   or  <operation>.query.ts
  <operation>.handler.ts
```

**Transaction management is owned by the handler, not the bus.**
The `CommandBus` creates a `UnitOfWork` and passes it to the handler. The handler decides when to `startTransaction()`, `commit()`, and `rollback()`. CommandBus auto-rolls back if a transaction is still open after the handler returns, as a safety net.

**QueryBus** is stateless: no UoW, no transaction. Query handlers receive `QueryServices` only.

## Port Interfaces (defined in core, implemented in infrastructure)

| Port | Impl | Purpose |
|------|------|---------|
| `FileReaderPort` | `NodeFileReaderAdapter` | Read .awsp / .acdb from disk |
| `WorkerPoolPort` | `NodeWorkerPoolAdapter` | Parallel binary parsing |
| `ProfilerPort` | `NodeProfilerAdapter` | Stage-level perf tracking |
| `IdGenerationPort` | `EntityIdServiceRegistry` | DB-backed sequential IDs |
| `UnitOfWorkFactory` | `createTypeOrmUnitOfWorkFactory` | Per-command QueryRunner lifecycle |

## Domain Model

**Aggregate identification rule:** Any entity class that sits directly under a folder named after it (e.g., `spf-module-definition/aggregate/spf-module-definition.ts`) is an aggregate root. Supporting entities are kept in a nested `entities/` folder under that aggregate's directory.

**Known aggregates include:**
- `Project`, `Usecase`, `Subgraph`
- `SpfModule`, `Container`, `Subsystem`
- `DataLink`, `ControlLink`
- `SpfModuleDefinition`, `KeyDefinition`, `TagDefinition`
- (and others following the same folder convention in `packages/core/src/domain/entities/`)

All domain entities extend `BaseEntity<TJson>` from `packages/core/src/domain/entities/common/base-entity.ts`.

## File Upload Flow (the main implemented workflow)

```
POST /arc-api/v1/projects/offline/upload-files
  → OpenFileCommand (CommandBus)
  → OpenFileHandler
      Phase 1 (transactional): create Project record
      Phase 2 (continue-on-error): UploadFileOrchestrator
        → AcdbFileOrchestrator  (parse calibration DB)
        → AwspFileOrchestrator  (parse workspace, uses worker pool)
        → EntityBuilderService  (build domain entities, no systemIds yet)
        → BulkImportRepository  (insert; ForeignKeyMapper maps naturalKey → systemId)
```

## ESM Module System

All imports in source files use `.js` extensions (TypeScript ESM / NodeNext requirement):
```typescript
import {CommandBus} from './command-bus.js';   // correct
import {CommandBus} from './command-bus';        // wrong — will fail at runtime
```

## Tooling

- **Package manager:** pnpm ≥10.0.0
- **Build orchestration:** Turbo (incremental, cached)
- **Test runner:** Jest 29 with ts-jest
- **Node.js:** ≥22.0.0

```bash
pnpm run build            # build all packages (Turbo)
pnpm run start:dev        # NestJS hot-reload dev server
pnpm test                 # all tests (unit + integration + e2e)
pnpm run lint             # ESLint
pnpm run format           # Prettier

# Per-package
pnpm run build:core
pnpm run build:api
pnpm --filter @arc/core run test:unit:core
pnpm --filter @arc/api run test:e2e:api

# Database
pnpm run migration:run
pnpm run migration:revert
pnpm run migration:show
```

## Database Migration Workflow

**Until an external release milestone, all schema changes use a single regenerated migration — never hand-write migration files.**

### Steps every time a TypeORM entity schema changes

1. **Update the entity schema** in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/`.

2. **Build** so the TypeORM CLI can see the updated schema:
   ```bash
   pnpm run build
   ```

3. **Delete the current migration file** (there is always exactly one, named `initial-create`):
   ```bash
   rm packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<timestamp>-initial-create.ts
   ```

4. **Generate a new migration** using the CLI with the fixed name `initial-create`:
   ```bash
   pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create
   ```
   TypeORM will create `<new-timestamp>-initial-create.ts` automatically.

5. **Post-process the generated file** — two edits always required:
   - Add the Qualcomm copyright header at the top:
     ```typescript
     /*
      * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
      * SPDX-License-Identifier: BSD-3-Clause
      */
     ```
   - Change the import to use `type`:
     ```typescript
     import type {MigrationInterface, QueryRunner} from 'typeorm';
     ```

6. **Update `migration-index.ts`** to point to the new timestamp:
   ```typescript
   // packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts
   import {InitialCreate<new-timestamp>} from './migrations/<new-timestamp>-initial-create.js';
   export const migrations = [InitialCreate<new-timestamp>];
   ```

### Rules
- Always use `pnpm run migration:gen` — never hand-write migration SQL.
- Always use the name argument `initial-create` so the class is named `InitialCreate<timestamp>`.
- Always delete the old migration file before generating — there is only ever one migration file.
- If you hand-wrote a migration file by mistake, delete it and follow this workflow instead.

### Logging DB migration workflow (`@arc/logger`)

The same single-migration rule applies to `logging.db`. Use `pnpm run migration:gen:logging` — never hand-write.

**Steps every time `LogEntrySchema` changes:**

1. **Update the schema** in `packages/infrastructure/logger/src/entity-schema/log-entry.schema.ts`.

2. **Build:**
   ```bash
   pnpm run build
   ```

3. **Delete the current migration file** (there is always exactly one, named `create-log-entries`):
   ```bash
   rm packages/infrastructure/logger/src/migrations/<timestamp>-create-log-entries.ts
   ```

4. **Generate a new migration:**
   ```bash
   pnpm run migration:gen:logging ./packages/infrastructure/logger/src/migrations/create-log-entries
   ```
   TypeORM will create `<new-timestamp>-create-log-entries.ts` automatically.

5. **Post-process the generated file** — two edits always required:
   - Add the Qualcomm copyright header at the top:
     ```typescript
     /*
      * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
      * SPDX-License-Identifier: BSD-3-Clause
      */
     ```
   - Change the import to use `type`:
     ```typescript
     import type {MigrationInterface, QueryRunner} from 'typeorm';
     ```

6. **Update `logging-migration-index.ts`** to point to the new timestamp:
   ```typescript
   // packages/infrastructure/logger/src/migrations/logging-migration-index.ts
   import {CreateLogEntries<new-timestamp>} from './<new-timestamp>-create-log-entries.js';
   export const loggingMigrations = [CreateLogEntries<new-timestamp>];
   ```


## Test Structure

| Type | Location | Tools |
|------|----------|-------|
| Unit | `packages/core/tests/unit/` | Jest, mocks |
| Integration | `packages/infrastructure/persistence/tests/integration/` | Jest, in-memory SQLite |
| E2E | `packages/api/tests/e2e/` | Jest, Supertest |

E2E fixtures: `packages/api/tests/e2e/fixtures/` (`.awsp` and `.acdb` sample files)

## Implemented vs Planned Endpoints

Implemented (✅):
- `POST /arc-api/v1/projects/offline/upload-files`
- `GET /arc-api/v1/projects/:id/usecases/allUsecases`
- `POST /arc-api/v1/projects/:id/usecases/components/get`

All other endpoints exist in controllers but return "not implemented". Do not assume they work.

## Known Issues / Open TODOs

1. **Handler registries import every handler directly** — violates OCP. The `// To Do` comment in both registry files describes the fix: move registrations into per-feature `register.ts` files.

2. **`QueryHandler.handle` is synchronous in the interface** — will break when any query handler needs async DB access. Fix: change return type to `Promise<TResponse>`.

3. **`QueryBus` has no logging** — unlike `CommandBus`. Should add `Logger` dependency.

4. **`createHandler()` returns `any` in both buses** — type safety hole.

5. **`TypeOrmUnitOfWork.isInTransaction()`** tracks state with a local flag instead of `queryRunner.isTransactionActive`.

6. **`class-validator` / `class-transformer` in `@arc/core`** — being removed and replaced with `zod`. Do not add new usages.

## Decision Principles (Ordered by Priority)

1. Pragmatism over architectural purity (time, legacy, migration cost matter)
2. Explicit trade-offs (alternatives, pros/cons, risks, rationale)
3. Avoid over-engineering unless driven by a concrete requirement
4. Preserve stateless HTTP semantics
5. Prefer explicit contracts (DTO validation, invariants, idempotency)
6. Do not bypass CQRS
7. Do not couple domain logic to NestJS, TypeORM, or worker implementations

## Standards (Apply When Relevant)

- HTTP semantics & status codes (RFC-aligned: safety, idempotency, caching)
- Twelve-Factor configuration principles (env-driven config)
- Security hygiene: input validation, safe error handling, abuse controls (OWASP reference)

## Citation Policy

Cite official or credible sources only when they directly inform the decision (NestJS docs, TypeORM docs, HTTP RFCs, Twelve-Factor, OWASP). Otherwise, label guidance as "pragmatic recommendation."

## Logging Convention

Structured logging via `Logger` port. All log calls include: `msg`, `action`, `component`, `tag`, `timestamp`. Error calls also include `error: Error`.

**ID logging rule:** All entity IDs must be logged in hex using `BinaryUtils.toHexString()`. This applies to `systemId` and any natural-key ID field (e.g. `subgraphId`, `containerId`, `moduleId`). Always pair the hex ID with a human-readable identifier (alias, name) when available:
```typescript
`Module '${module.alias ?? 'unknown'}' (${BinaryUtils.toHexString(module.systemId)})`
`Container (${BinaryUtils.toHexString(container.containerId)})`
```

## Swagger

API docs auto-generated: `pnpm run generate:swagger` → `docs/swagger-api.json`
Dev server: `http://localhost:3000/api/docs`
