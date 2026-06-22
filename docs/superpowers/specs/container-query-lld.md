<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Container Query APIs — Low-Level Design

## Document Information

- **Version**: 2.1
- **Date**: June 2026
- **Status**: Current
- **Endpoints implemented**:
  - `POST /arc-api/v1/projects/{projectId}/containers/query`
- **Endpoints stubbed (future)**:
  - `GET  /arc-api/v1/projects/{projectId}/containers/{containerSystemId}/properties`
- **Related Documents**:
  - `spf-module-query-lld.md` — Reference design for query API patterns
  - `edit-session-persistence-design.md` — Edit session overlay pattern

---

## Table of Contents

1. [Domain Overview](#1-domain-overview)
2. [Design Principles](#2-design-principles)
3. [Architecture Overview](#3-architecture-overview)
4. [Read Model](#4-read-model)
5. [Query and Handler](#5-query-and-handler)
6. [ContainerQueryService Port](#6-containerqueryservice-port)
7. [Persistence Implementation](#7-persistence-implementation)
8. [API Layer](#8-api-layer)
9. [Session Overlay](#9-session-overlay)
10. [Folder Structure](#10-folder-structure)

---

## 1. Domain Overview

### DB tables

```
containers
  system_id       PK
  container_id    business key (unique per file)
  type            container type string (e.g. 'WCD_RX', 'APM')
  file_system_id  FK → arc_db_files.system_id (scopes the container to a project file)
```

### What `POST /containers/query` returns

Graph-view identity data — the three fields a client needs to place a container node on the canvas:

| Field | Source | Description |
|---|---|---|
| `systemId` | `containers.system_id` | Internal persistence key — used to address the container in all subsequent API calls |
| `containerId` | `containers.container_id` | Business key from the ACDB file — used by clients for display and cross-referencing |
| `type` | `containers.type` | Container type string — determines icon, colour, and routing rules on the graph |

---

## 2. Design Principles

### Three-tier overlay applied to `findMany`

Container `type` can be staged for change within an active edit session. `findMany` applies the same three-tier overlay pattern used by all other query services:
- **Tier 1** — `applyOverlay = false` → skip session lookup entirely
- **Tier 2** — session active, no draft for this container → return baseline
- **Tier 3** — session active, draft exists → merge overlay onto baseline row

### `fileSystemId` scopes all queries

Every container row is tied to a specific file via `file_system_id`. The handler resolves `projectId → fileSystemId` via `ProjectQueryService` before calling the persistence layer. Unknown `systemIds` that belong to a different file are silently omitted (no 404).

### Partial results are correct for graph view

The query endpoint accepts multiple `systemIds` and returns only the ones that exist. Clients that request stale or non-existent IDs receive a partial result — HTTP 200 with fewer items than requested. This matches the usecase and SPF module query patterns.

### No `changeInfo` on read models

Read models carry only entity data. Change state tracking belongs to a dedicated change-details API (future). `changeInfo` on `BaseDto` is optional and is not populated by this endpoint.

---

## 3. Architecture Overview

```
POST /arc-api/v1/projects/{projectId}/containers/query
  Body: { systemIds: ["8388613", "8388614"] }

  ──────────────────────────────────────────────────────
  @arc/api  ContainerController
  ──────────────────────────────────────────────────────
    1. Validate body.systemIds — reject empty → HTTP 400
    2. Parse each string ID → number — reject non-integer → HTTP 400
    3. Construct QueryContainersQuery(systemIds, projectId, clientId)
    4. Dispatch via QueryBus → QueryContainersHandler
    5. Map ContainerReadModel[] → ContainerDto[]
    6. Return ApiResult<ContainerDto[]>  (HTTP 200)

  ──────────────────────────────────────────────────────
  @arc/core  QueryContainersHandler
  ──────────────────────────────────────────────────────
    1. Resolve projectId → fileSystemId via ProjectQueryService
    2. Call ContainerQueryService.findMany(systemIds, fileSystemId)
    3. Return ContainerReadModel[]

  ──────────────────────────────────────────────────────
  @arc/persistence  DbContainerQueryService
  ──────────────────────────────────────────────────────
    1. Guard: return [] if systemIds is empty
    2. SELECT system_id, container_id, type FROM containers
       WHERE system_id IN (?) AND file_system_id = ?
    3. Apply three-tier overlay (container type can be staged for change)
    4. Map rows → ContainerReadModel[]

  ──────────────────────────────────────────────────────
  SQLite via TypeORM DataSource
  ──────────────────────────────────────────────────────
```

---

## 4. Read Model

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   usecase/query-models/container-read-model.ts

/**
 * Graph-view identity read model for a container instance.
 * Returned by ContainerQueryService.findMany() and .findOne().
 *
 * Does not extend ReadModelBase — container read models in the usecase
 * query-models folder follow the same flat pattern as other read models
 * used by the usecase graph query.
 *
 * changeInfo is absent — not populated by the graph-view query.
 */
export interface ContainerReadModel {
  readonly systemId:    number;  // containers.system_id   — persistence key
  readonly containerId: number;  // containers.container_id — business key
  readonly type:        string;  // containers.type
}
```

All three fields are always populated — the three-state `null` convention does not apply here.

---

## 5. Query and Handler

### Query class

```typescript
// packages/core/src/application/usecase-designer/container/query/
//   query-containers.query.ts

/**
 * Carries the input for QueryContainersHandler.
 *
 * projectId is the raw project system ID from the HTTP layer.
 * The handler resolves it to fileSystemId via ProjectQueryService
 * before calling the persistence layer — same pattern as QuerySpfModulesQuery.
 *
 * systemIds are the container instance system IDs (containers.system_id).
 */
export class QueryContainersQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### Handler

```typescript
// packages/core/src/application/usecase-designer/container/query/
//   query-containers.handler.ts

/**
 * Handles QueryContainersQuery.
 *
 * Step 1: Resolve projectId → fileSystemId via ProjectQueryService.
 *         The HTTP layer knows the projectId; the persistence layer needs
 *         fileSystemId to scope the query to the correct file.
 *
 * Step 2: Load containers via ContainerQueryService.findMany().
 *         Unknown systemIds are silently omitted — partial result is correct.
 */
export class QueryContainersHandler
  implements QueryHandler<QueryContainersQuery, Promise<ContainerReadModel[]>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QueryContainersQuery): Promise<ContainerReadModel[]> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.containerQueryService.findMany(
      query.systemIds,
      fileSystemId,
    );
  }
}
```

### Registration

`QueryContainersQuery` → `QueryContainersHandler` is registered in `QueryHandlerRegistry.registerAllQueryHandlers()`:

```typescript
// packages/core/src/application/orchestration/cqrs/registries/
//   query-handler-registry.ts

this.queryHandlerFactories.set(QueryContainersQuery, {
  create: (deps: QueryHandlerDependencies) =>
    new QueryContainersHandler(deps.queryServices),
});
```

---

## 6. ContainerQueryService Port

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   container/container-query-service.ts

import type {ContainerReadModel} from '../usecase/query-models/container-read-model.js';

/**
 * Port for loading container identity data.
 *
 * findMany: batch load by systemId list, scoped to a file.
 *           Three-tier overlay applied — container type can be staged for change.
 *           Unknown systemIds are silently omitted.
 * findOne:  single container load; returns null when not found.
 */
export interface ContainerQueryService {
  findMany(
    systemIds:    number[],
    fileSystemId: number,
  ): Promise<ContainerReadModel[]>;

  findOne(
    systemId:     number,
    fileSystemId: number,
  ): Promise<ContainerReadModel | null>;
}
```

The port is added to `QueryServices`:

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   query-services.ts

export interface QueryServices {
  readonly containerQueryService: ContainerQueryService;
  // ... existing services ...
}
```

---

## 7. Persistence Implementation

```typescript
// packages/infrastructure/persistence/src/.../queries/container/
//   db-container-query-service.ts

/**
 * Database implementation of ContainerQueryService.
 *
 * findMany applies the three-tier edit session overlay — container type
 * can be staged for change within an active session.
 *
 * editActionsSvc is also retained for use by getProperties() (future),
 * which will overlay container_property_data rows.
 */
export class DbContainerQueryService implements ContainerQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async findMany(
    systemIds:    number[],
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<ContainerReadModel[]> {
    if (systemIds.length === 0) return [];

    // SQL:
    // SELECT c.system_id, c.container_id, c.type
    // FROM containers c
    // WHERE c.system_id IN (?) AND c.file_system_id = ?
    const baseRows = await this.dataSource
      .getRepository(ENTITY_NAMES.Container)
      .createQueryBuilder('c')
      .select(['c.systemId', 'c.containerId', 'c.type'])
      .where('c.systemId IN (:...ids)', {ids: systemIds})
      .andWhere('c.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany();

    if (baseRows.length === 0) return [];

    // Three-tier overlay — container type can be staged for change
    const session = applyOverlay
      ? await this.editActionsSvc.findActiveSession(fileSystemId)
      : null;

    let rows = baseRows;
    if (session) {
      const allActions = await Promise.all(
        baseRows.map(r =>
          this.editActionsSvc.getEditActionsByAggregateId(
            session.sessionId,
            r.systemId,
          ),
        ),
      );
      const flatActions = allActions
        .flat()
        .filter(a => a.tableName === ENTITY_NAMES.Container);

      if (flatActions.length > 0) {
        rows = applyToCollection(baseRows, flatActions);
      }
    }

    return rows.map(r => ({
      systemId:    r.systemId,
      containerId: r.containerId,
      type:        r.type,
    }));
  }

  async findOne(
    systemId:     number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<ContainerReadModel | null> {
    const results = await this.findMany([systemId], fileSystemId, applyOverlay);
    return results[0] ?? null;
  }
}
```

### Wiring in `DbQueryServices`

```typescript
// packages/infrastructure/persistence/src/.../queries/
//   typeorm-query-services.ts

export class DbQueryServices implements QueryServices {
  readonly containerQueryService: ContainerQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    // editActionsQueryService is shared — used by container overlay now
    // and by getProperties() overlay when implemented.
    this.containerQueryService = new DbContainerQueryService(
      dataSource,
      editActionsQueryService,
    );

    // ... existing services ...
  }
}
```

---

## 8. API Layer

### DTO

```typescript
// packages/api/.../container/dto/container.dto.ts

/**
 * Graph-view DTO for a container instance.
 *
 * Extends BaseComponentDto<number> which provides:
 *   systemId: string  — string form of containers.system_id
 *   id:       number  — containers.container_id (business key)
 *
 * type is the only container-specific field needed for the graph view.
 */
export class ContainerDto extends BaseComponentDto<number> {
  @ApiProperty({description: 'Container type'})
  type!: string;

  constructor(systemId: string, id: number, type: string) {
    super(systemId, id);
    this.type = type;
  }
}
```

### Controller

```typescript
// packages/api/.../container/container.controller.ts

@Post('query')
@HttpCode(HttpStatus.OK)   // NestJS defaults POST to 201 — override to 200 for query
async queryContainers(
  @Param('projectId') projectId: string,
  @Body() body: SystemIdsRequestDto,
): Promise<ApiResult<ContainerDto[]>> {

  // 1. Validate — reject empty systemIds immediately
  if (!body?.systemIds?.length) → HTTP 400

  // 2. Parse each string ID to number — reject non-integers
  const systemIds = body.systemIds.map(id => parseInt(id, 10))  → HTTP 400 on NaN

  // 3. Dispatch via QueryBus
  const query = new QueryContainersQuery(systemIds, Number(projectId), 'client-id');
  const containers = await this.queryBus.execute<ContainerReadModel[]>(query);

  // 4. Map read model → DTO
  //    systemId: String(c.systemId)  — number → string for JSON transport
  //    id:       c.containerId       — business key
  //    type:     c.type
  return { data: containers.map(c => new ContainerDto(String(c.systemId), c.containerId, c.type)), ... }
}
```

**`@HttpCode(HttpStatus.OK)`** is required — NestJS defaults all `@Post` handlers to HTTP 201. This endpoint is a query (reads, does not create) so it must return 200.

### Error handling

| Condition | HTTP | Details |
|---|---|---|
| `systemIds` empty or missing | 400 | Validated in controller before dispatch |
| Non-integer in `systemIds` | 400 | `parseInt` returns `NaN` → rejected in controller |
| Unknown `systemIds` | 200 | Silently omitted — partial result is correct |
| Project not found | 422 | `ProjectQueryService.getFileIdByProjectId()` throws → caught as unprocessable |
| DB error | 422 | Any uncaught error → `UNPROCESSABLE_ENTITY` |

### NestJS module

```typescript
// packages/api/.../container/container.module.ts

@Module({
  imports: [ArcCqrsModule],  // provides QueryBus for constructor injection
  controllers: [ContainerController],
})
export class ContainerModule {}
```

`ArcCqrsModule` must be imported — without it `QueryBus` cannot be injected into the controller constructor.

---

## 9. Session Overlay

`DbContainerQueryService` accepts `editActionsQueryService` and applies the three-tier overlay in `findMany`:

- Container `type` can be staged for `UPDATE` within an edit session — the overlay merges the draft payload onto the baseline row.
- A `DELETE` draft would exclude the container from the result.
- `editActionsSvc` is also retained for `getProperties()` (future), which will overlay `container_property_data` rows.

Overlay is skipped when:
- `applyOverlay = false` is passed explicitly (Tier 1)
- No active session exists for the file (Tier 2)

---

## 10. Folder Structure

```
packages/core/src/application/
  ports/persistence/query-services/
    query-services.ts                         ← containerQueryService added
    container/
      container-query-service.ts             ← ContainerQueryService port (findMany, findOne)
  usecase/query-models/
    container-read-model.ts                  ← ContainerReadModel { systemId, containerId, type }
  usecase-designer/
    container/
      query/
        query-containers.query.ts            ← QueryContainersQuery
        query-containers.handler.ts          ← QueryContainersHandler

packages/infrastructure/persistence/src/.../queries/
  container/
    db-container-query-service.ts            ← ContainerQueryService impl (overlay applied)

packages/api/src/presentation/rest/modules/container/
  container.controller.ts                    ← queryContainers (implemented)
                                                getContainerProperties (NOT_IMPLEMENTED stub)
  container.module.ts                        ← imports ArcCqrsModule
  dto/
    container.dto.ts                         ← ContainerDto { type }
                                                ContainerPropertiesDto (future)
tests/e2e/container/
  query-containers.e2e-spec.ts
```

---

*End of Document*
