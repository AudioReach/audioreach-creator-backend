<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Container Query API — Low-Level Design

## Document Information

- **Version**: 1.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoint**: `POST /arc-api/v1/projects/{projectId}/containers/query`
- **Related Documents**:
  - `spf-module-query-lld.md` — Reference design (same CQRS + overlay pattern)
  - `edit-session-persistence-design.md` — Edit session overlay pattern
  - `2026-06-01-component-query-apis-requirements.md` — Component query requirements

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Read Model](#2-read-model)
3. [Architecture and Call Flow](#3-architecture-and-call-flow)
4. [Edit Session Overlay](#4-edit-session-overlay)
5. [CQRS — Query and Handler](#5-cqrs--query-and-handler)
6. [Persistence Layer — DbContainerQueryService](#6-persistence-layer--dbcontainerqueryservice)
7. [Port Interface and Wiring](#7-port-interface-and-wiring)
8. [DTO Mapping](#8-dto-mapping)
9. [Folder Structure](#9-folder-structure)

---

## 1. Requirements

### 1.1 Endpoint

`POST /arc-api/v1/projects/{projectId}/containers/query`

Returns container identity data for a given set of container `systemId` values.

### 1.2 Functional requirements

#### FR-CQ-01: Request validation — empty systemIds
If `body.systemIds` is absent or empty, the controller MUST reject with `400 Bad Request` before any handler runs.

#### FR-CQ-02: Request validation — invalid systemId format
If any entry in `body.systemIds` cannot be parsed as a positive integer, the controller MUST reject with `400 Bad Request`.

#### FR-CQ-03: Deduplication
The persistence layer MUST deduplicate `systemIds` silently. The response MUST NOT contain duplicate containers.

#### FR-CQ-04: Partial result for unknown IDs
If some `systemIds` have no matching container row, the response MUST include only the containers found. No error is raised for unrecognised IDs.

#### FR-CQ-05: projectId resolution
The controller MUST resolve `projectId` (string path param) to `fileSystemId` (integer) via `ProjectQueryService.getFileIdByProjectId`. If the project does not exist, respond `404 Not Found`.

#### FR-CQ-06: Overlay always applied — no caller flag
The `ContainerQueryService` port exposes **no `applyOverlay` flag**. Overlay is always attempted inside the implementation. When no active session exists the result is identical to a direct baseline read.

#### FR-CQ-07: Baseline-only read when no session active
When no active session exists for the project file, containers are returned from baseline tables only. No `edit_actions` lookup is performed.

#### FR-CQ-08: Draft overlay when session active
When an active session exists, the persistence layer MUST apply the edit session overlay:
- `DELETE` draft → exclude container from result
- `UPDATE` draft → merge changed fields onto baseline row
- `CREATE` draft → inject staged container (no baseline row exists)

#### FR-CQ-09: STAGED drafts only
Only `edit_actions` rows with `change_status = 'STAGED'` and `valid_until IS NULL` MUST be applied. UNSTAGED changes MUST NOT appear in the response.

#### FR-CQ-10: changeInfo excluded
`ContainerDto.changeInfo` MUST be set to `undefined` in this endpoint.

#### FR-CQ-11: Response envelope
```json
{
  "data":    [ ContainerDto, ... ],
  "success": true,
  "message": "Containers retrieved successfully"
}
```

### 1.3 Non-functional requirements

**NFR-CQ-01:** Maximum 3 DB queries per request. No N+1 patterns.

---

## 2. Read Model

### 2.1 `Result<T>` wraps all service returns

```
Result<T>
  isSuccess: boolean
  data: T              ← only accessible when isSuccess = true (throws otherwise)
  errors: Error[]      ← always [], non-empty on failure
  warnings: Warning[]  ← always [], non-empty on partial success
```

### 2.2 ContainerReadModel — current state

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   usecase/query-models/container-read-model.ts   ← EXISTING FILE

export interface ContainerReadModel {
  readonly systemId: number;   // containers.system_id
  readonly type:     string;   // containers.type  e.g. "AUDIO_SS"
}
```

### 2.3 ContainerReadModel — required update

`ContainerDto.id` maps to the domain/business key `containerId`. It is absent from the current read model and must be added.

```typescript
// Updated ContainerReadModel  (same file — add containerId)

export interface ContainerReadModel {
  readonly systemId:    number;   // containers.system_id     — internal PK
  readonly containerId: number;   // containers.container_id  — domain/business key
  readonly type:        string;   // containers.type          — e.g. "AUDIO_SS"
}
```

**Change:** one field added — `containerId: number`.

### 2.4 Source columns

| `ContainerReadModel` property | DB table | DB column | Notes |
|---|---|---|---|
| `systemId` | `containers` | `system_id` | internal PK, unique per file |
| `containerId` | `containers` | `container_id` | domain/business key |
| `type` | `containers` | `type` | stores type name string directly; no JOIN to `container_types` needed |

### 2.5 Mapping ContainerReadModel → ContainerDto

| `ContainerReadModel` | `ContainerDto` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(c.systemId)` |
| `containerId: number` | `id: number` | direct |
| `type: string` | `name?: string` | direct — type string is the display name |
| — | `changeInfo` | `undefined` (FR-CQ-10) |
| — | `relatedEndPointLinks` | `[]` (not required) |

---

## 3. Architecture and Call Flow

### 3.1 Layer diagram

```
POST /arc-api/v1/projects/{projectId}/containers/query
  Body: { systemIds: ["123", "456"] }

  ──────────────────────────────────────────────────────
  @arc/api  ContainerController.queryContainers()
  ──────────────────────────────────────────────────────
  1. Parse systemIds string[] → number[]
       NaN → HTTP 400 (before handler)
  2. parseInt(projectId, 10) → projectId: number
  3. new QueryContainersQuery(systemIds, projectId, clientId)
  4. queryBus.execute(query) → Result<ContainerReadModel[]>
  5. result.isFailure → throw HttpException HTTP 422
  6. result.data.map(c → ContainerDto)
  7. return ApiResult<ContainerDto[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  QueryContainersHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(projectId)
       throws if not found → HTTP 404
  2. containerQueryService.findMany(systemIds, fileSystemId)
       → Result<ContainerReadModel[]>
       isFailure → return Result.fail (fatal, propagates to HTTP 422)
  3. return Result.ok(result.data, result.warnings)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbContainerQueryService.findMany()
  ──────────────────────────────────────────────────────
  try/catch wraps all steps → Result.fail(INTERNAL_ERROR) on exception

  Step 1: SELECT system_id, container_id, type FROM containers
            WHERE system_id IN (?) AND file_system_id = ?
            → ContainerRow[] (baseline)

  Step 2: findActiveSession(fileSystemId) → session | null
            null → return Result.ok(baseline as ContainerReadModel[])

  Step 3: getEditActionsByAggregateIds(session.sessionId, uniqueIds)
            → EditActionRow[]
            [] → return Result.ok(baseline as ContainerReadModel[])

  Step 4: applyToCollection(baselineRows, editActions) → merged ContainerRow[]

  Step 5: map merged rows → ContainerReadModel[]
          return Result.ok(ContainerReadModel[])

  ──────────────────────────────────────────────────────
  SQLite via TypeORM DataSource
  ──────────────────────────────────────────────────────
```

### 3.2 DB queries per request

```
Query 1 (always):
  SELECT system_id, container_id, type
  FROM containers
  WHERE system_id IN (?, ?, ...) AND file_system_id = ?

Query 2 (always):
  SELECT * FROM project_sessions
  WHERE file_system_id = ? AND status = 'ACTIVE'

Query 3 (only when active session found):
  SELECT * FROM edit_actions
  WHERE session_id = ?
    AND aggregate_id IN (?, ?, ...)
    AND valid_until IS NULL
    AND change_status = 'STAGED'
```

Maximum **3 queries** per request. Query 3 is skipped when no active session exists.

### 3.3 Result propagation

```
DbContainerQueryService.findMany()     QueryContainersHandler.handle()     ContainerController
  Result<ContainerReadModel[]>   ──►     Result<ContainerReadModel[]>  ──►  ApiResult<ContainerDto[]>
  isFailure → INTERNAL_ERROR             isFailure → Result.fail              HTTP 422
  isSuccess → ContainerReadModel[]       isSuccess → Result.ok                HTTP 200
```

---

## 4. Edit Session Overlay

### 4.1 Three-tier pattern

```typescript
// Tier 1 — always attempt; no flag exposed to callers
const session = await this.editActionsSvc.findActiveSession(fileSystemId);

// Tier 2 — no session: return baseline unchanged
if (!session) return Result.ok(toReadModels(baselineRows));

const editActions = await this.editActionsSvc
  .getEditActionsByAggregateIds(session.sessionId, uniqueIds);

// Tier 2 — no drafts for these containers: return baseline unchanged
if (!editActions.length) return Result.ok(toReadModels(baselineRows));

// Tier 3 — apply drafts
const merged = applyToCollection(baselineRows, editActions);
return Result.ok(toReadModels(merged));
```

### 4.2 Tables overlaid

| Table | Aggregate ID used | Changes applied |
|---|---|---|
| `containers` | `containerSystemId` (= `system_id`) | `type` UPDATE; row DELETE; staged CREATE |

`container_property_data` rows are **not** overlaid by this query.

### 4.3 Effect of each draft operation

| `edit_actions.operation` | Effect on `ContainerReadModel[]` |
|---|---|
| `DELETE` | Row removed — container absent from response |
| `UPDATE` | JSON `payload` fields merged onto baseline row — e.g. updated `type` |
| `CREATE` | Row injected into collection — staged container visible in response |

### 4.4 STAGED vs UNSTAGED

`EditActionsQueryService.getEditActionsByAggregateIds` enforces `change_status = 'STAGED'` and `valid_until IS NULL`. UNSTAGED drafts are never visible in read responses (FR-CQ-09).

---

## 5. CQRS — Query and Handler

### QueryContainersQuery

```typescript
// packages/core/src/application/usecase-designer/container/query/
//   query-containers.query.ts  (new file)

export class QueryContainersQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],   // container systemIds to look up
    public readonly projectId: number,     // resolved to fileSystemId in handler
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### QueryContainersHandler

```typescript
// packages/core/src/application/usecase-designer/container/query/
//   query-containers.handler.ts  (new file)

export class QueryContainersHandler
  implements QueryHandler<QueryContainersQuery, Promise<Result<ContainerReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QueryContainersQuery): Promise<Result<ContainerReadModel[]>> {
    // Resolve project → file scope
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // Delegate entirely to persistence — overlay is handled there
    const result = await this.queryServices.containerQueryService
      .findMany(query.systemIds, fileSystemId);

    if (result.isFailure)
      return Result.fail(...result.errors);

    return Result.ok(result.data, result.warnings);
  }
}
```

---

## 6. Persistence Layer — DbContainerQueryService

### 6.1 Port interface

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   container/container-query-service.ts  (new file)

export interface ContainerQueryService {
  /**
   * Returns ContainerReadModel[] for the given systemIds scoped to fileSystemId.
   * Overlay is always applied internally — no applyOverlay flag (FR-CQ-06).
   * Returns Result.ok([]) if none of the systemIds exist — not an error.
   */
  findMany(
    systemIds:    number[],
    fileSystemId: number,
  ): Promise<Result<ContainerReadModel[]>>;
}
```

### 6.2 Implementation

```typescript
// packages/infrastructure/persistence/src/.../queries/container/
//   db-container-query-service.ts  (new file)

export class DbContainerQueryService implements ContainerQueryService {
  constructor(
    private readonly dataSource:     DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async findMany(
    systemIds:    number[],
    fileSystemId: number,
  ): Promise<Result<ContainerReadModel[]>> {
    try {
      if (systemIds.length === 0)
        return Result.fail({
          code:    ERROR_CODES.INVALID_INPUT,
          message: 'systemIds must not be empty',
        });

      const uniqueIds = [...new Set(systemIds)];

      // Step 1 — baseline load
      const baselineRows = await this.dataSource
        .getRepository(ENTITY_NAMES.Container)
        .createQueryBuilder('c')
        .select(['c.systemId', 'c.containerId', 'c.type'])
        .where('c.systemId IN (:...ids)', {ids: uniqueIds})
        .andWhere('c.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany() as ContainerRow[];

      // Steps 2–4 — three-tier overlay
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      let rows: ContainerRow[] = baselineRows;

      if (session) {
        const editActions = await this.editActionsSvc
          .getEditActionsByAggregateIds(session.sessionId, uniqueIds);

        if (editActions.length > 0)
          rows = applyToCollection(baselineRows, editActions) as ContainerRow[];
      }

      // Step 5 — assemble ContainerReadModel[]
      return Result.ok(
        rows.map(r => ({
          systemId:    r.systemId,
          containerId: r.containerId,
          type:        r.type,
        } satisfies ContainerReadModel)),
      );
    } catch (error) {
      return Result.fail({
        code:    ERROR_CODES.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Failed to query containers',
      });
    }
  }
}
```

### 6.3 Error handling

| Scenario | Treatment |
|---|---|
| Empty `systemIds` | `Result.fail(INVALID_INPUT)` — before any DB query |
| DB error on baseline query | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| DB error on session or overlay query | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| systemId not found in DB | Row absent from baseline — partial result, not an error (FR-CQ-04) |

---

## 7. Port Interface and Wiring

### 7.1 Add `containerQueryService` to `QueryServices`

```typescript
// packages/core/src/application/ports/persistence/query-services/query-services.ts

import type {ContainerQueryService} from './container/container-query-service.js';

export interface QueryServices {
  // ... existing ...
  readonly containerQueryService: ContainerQueryService;
}
```

### 7.2 Wire `DbContainerQueryService` in `DbQueryServices`

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

import {DbContainerQueryService} from './container/db-container-query-service.js';

export class DbQueryServices implements QueryServices {
  readonly containerQueryService: ContainerQueryService;
  // ... existing fields ...

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);
    // ... existing construction unchanged ...

    this.containerQueryService = new DbContainerQueryService(
      dataSource,
      editActionsQueryService,
    );
  }
}
```

### 7.3 Register handler in QueryBus

```typescript
queryBus.register(QueryContainersQuery, new QueryContainersHandler(queryServices));
```

---

## 8. DTO Mapping

### ContainerReadModel → ContainerDto

```typescript
// ContainerController private helper

private mapToContainerDto(c: ContainerReadModel): ContainerDto {
  const dto = new ContainerDto(String(c.systemId), c.containerId);
  //  ↑ constructor(systemId: string, id: number)
  //    systemId  ← String(c.systemId)  e.g. "123"
  //    id        ← c.containerId       e.g. 5
  dto.name = c.type;           // e.g. "AUDIO_SS"
  dto.changeInfo = undefined;  // FR-CQ-10 — not included in this endpoint
  return dto;
}
```

### Updated `queryContainers` controller method

```typescript
@Post('query')
@HttpCode(HttpStatus.OK)
async queryContainers(
  @Param('projectId') projectId: string,
  @Body() request: SystemIdsRequestDto,
): Promise<ApiResult<ContainerDto[]>> {

  const systemIds = request.systemIds.map(id => {
    const parsed = Number.parseInt(id, 10);
    if (Number.isNaN(parsed))
      throw new HttpException(`Invalid system ID: ${id}`, HttpStatus.BAD_REQUEST);
    return parsed;
  });

  const query = new QueryContainersQuery(
    systemIds,
    Number.parseInt(projectId, 10),
    'client-id',  // TODO: extract from JWT
  );

  const result = await this.queryBus.execute<Result<ContainerReadModel[]>>(query);

  if (result.isFailure) {
    throw new HttpException(
      result.errors?.[0]?.message ?? 'Failed to retrieve containers',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  return {
    data:    result.data.map(c => this.mapToContainerDto(c)),
    success: true,
    message: 'Containers retrieved successfully',
  };
}
```

---

## 9. Folder Structure

### New files

```
packages/core/src/application/
  ports/persistence/query-services/
    container/
      container-query-service.ts            ← ContainerQueryService port interface
  usecase-designer/
    container/
      query/
        query-containers.query.ts           ← QueryContainersQuery extends BaseQuery
        query-containers.handler.ts         ← QueryContainersHandler

packages/infrastructure/persistence/src/.../queries/
  container/
    db-container-query-service.ts           ← DbContainerQueryService
```

### Modified files

```
packages/core/src/application/ports/persistence/query-services/
  usecase/query-models/container-read-model.ts   ← add containerId: number
  query-services.ts                              ← add containerQueryService: ContainerQueryService

packages/infrastructure/persistence/src/.../queries/
  typeorm-query-services.ts                      ← wire DbContainerQueryService

packages/api/src/presentation/rest/modules/container/
  container.controller.ts                        ← replace stub, inject QueryBus, mapToContainerDto
  container.module.ts                            ← add QueryBus provider
```

### No DB changes needed

All required tables already exist: `containers`, `edit_actions`, `project_sessions`.

---

*End of Document*
