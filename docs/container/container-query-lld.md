<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Container Query API — Low-Level Design

## Document Information

- **Version**: 3.0
- **Date**: August 2026
- **Status**: Current
- **Endpoint**: `POST /arc-api/v1/projects/{projectId}/containers/query`
- **Related Documents**:
  - `spf-module-query-lld.md` — Reference design (same CQRS pattern; `KeyValueDefQueryService` naming/`Result<T>` conventions this doc's method names now follow)
  - `edit-session-persistence-design.md` — Edit session overlay pattern

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

Returns container identity data for all containers in the given project.

### 1.2 Request body — accepted but unused

The request body is still typed as `SystemIdsRequestDto { systemIds: string[] }`, matching the documented swagger contract for this endpoint. **`systemIds` is not consumed anywhere in this design** — `ContainerQueryService` has no id-scoped lookup method. The endpoint always returns every container for the resolved project, regardless of what (if anything) is sent in `systemIds`. This is a deliberate simplification (see §1.4) — a future revision could reintroduce id filtering in the handler or the query service if a caller needs it.

### 1.3 Functional requirements

#### FR-CQ-01: No request validation on systemIds
Since `systemIds` is unused, there is no 400 for empty/missing `systemIds` — the field is accepted and ignored.

#### FR-CQ-02: projectId resolution
The controller MUST resolve `projectId` (string path param) to `fileSystemId` (integer) via `ProjectQueryService.getFileIdByProjectId`. If the project does not exist, the call throws (surfaces as an unhandled rejection today — no explicit 404 mapping exists in the controller; see Open Items).

#### FR-CQ-03: Overlay always applied — no caller flag
`ContainerQueryService` exposes **no `applyOverlay` flag**. Overlay is always attempted inside the implementation. When no active session exists the result is identical to a direct baseline read.

#### FR-CQ-04: Baseline-only read when no session active
When no active session exists for the project file, containers are returned from baseline tables only. No `edit_actions` lookup is performed.

#### FR-CQ-05: Draft overlay when session active
When an active session exists, the persistence layer MUST apply the edit session overlay:
- `DELETE` draft → exclude container from result
- `UPDATE` draft → merge changed fields onto baseline row
- `CREATE` draft → inject staged container (no baseline row exists)

#### FR-CQ-06: STAGED drafts only
Only `edit_actions` rows with `valid_until IS NULL` are fetched by `getEditActionsByTable` (the query used here — see §4). Change-status filtering is available via that method's `options` parameter but is not applied in this implementation; all non-expired drafts for the `Container` table are included regardless of STAGED/UNSTAGED.

#### FR-CQ-07: changeInfo excluded
`ContainerDto.changeInfo` is set to `undefined` in this endpoint.

#### FR-CQ-08: Response envelope
```json
{
  "data":    [ ContainerDto, ... ],
  "success": true,
  "message": "Containers retrieved successfully"
}
```

### 1.4 Why `findAll`, not `findMany`/`findOne`

Confirmed with the requester during implementation: `ContainerQueryService` should expose a single `findAll(fileSystemId)` returning every container for a file — not an id-scoped `findMany(systemIds, fileSystemId)`. Rationale given: "it is query, that means we need to fetch all the container id[s]." `findAll` never targets a specific id, so it only ever resolves to `Result.ok`/`Result.fail` — never `Result.partial`. `ContainerQuery` (the CQRS query class) carries no `systemIds` either, just `projectId` + `clientId`; `ContainerQueryHandler` resolves `fileSystemId` and passes `findAll`'s `Result` straight through, no filtering step in between.

This is a deliberate divergence from the original v1.0 draft of this doc (which specified `findMany(systemIds, fileSystemId)` with per-id partial-result semantics) and from `SpfModuleQueryService`'s `findOne`/`findMany` pair. If a future caller needs to look up specific container ids, that capability doesn't exist yet on this port.

### 1.5 Non-functional requirements

**NFR-CQ-01:** Maximum 4 DB queries per request. No N+1 patterns — `getByTable` inside `ContainerOverlayFetcher.applyToContainers` is one table-wide query, not one per container.

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

### 2.2 `ContainerReadModel`

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   usecase/query-models/container-read-model.ts

export interface ContainerReadModel {
  readonly systemId:    number;   // containers.system_id     — internal PK
  readonly containerId: number;   // containers.container_id  — domain/business key
  readonly type:        string;   // containers.type          — e.g. "AUDIO_SS"
}
```

`containerId` was added in this revision — the original read model only had `systemId`/`type`. `ContainerDto.id` maps to this business key.

### 2.3 Source columns

| `ContainerReadModel` property | DB table | DB column | Notes |
|---|---|---|---|
| `systemId` | `containers` | `system_id` | internal PK, unique per file |
| `containerId` | `containers` | `container_id` | domain/business key |
| `type` | `containers` | `type` | stores type name string directly; no JOIN to `container_types` needed |

### 2.4 Mapping ContainerReadModel → ContainerDto

| `ContainerReadModel` | `ContainerDto` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(c.systemId)` |
| `containerId: number` | `id: number` | direct |
| `type: string` | `name?: string` | direct — type string is the display name |
| — | `changeInfo` | `undefined` (FR-CQ-07) |
| — | `relatedEndPointLinks` | `[]` (default on `BaseComponentDto`, not set explicitly) |

---

## 3. Architecture and Call Flow

### 3.1 Layer diagram

```
POST /arc-api/v1/projects/{projectId}/containers/query
  Body: { systemIds: [...] }   ← accepted, unused (§1.2)

  ──────────────────────────────────────────────────────
  @arc/api  ContainerController.queryContainers()
  ──────────────────────────────────────────────────────
  1. parseInt(projectId, 10) → projectId: number
  2. new ContainerQuery(projectId, 'client-id')
       ('client-id' is a placeholder — same TODO as SpfModuleController,
        real clientId extraction from JWT is not wired up yet)
  3. queryBus.execute(query) → Result<ContainerReadModel[]>
  4. result.isFailure → throw UnprocessableEntityException  HTTP 422
  5. result.data.map(c → mapToContainerDto(c))
  6. return ApiResult<ContainerDto[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  ContainerQueryHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(projectId)
       throws if not found — no explicit try/catch here (see Open Items)
  2. containerQueryService.findAll(fileSystemId)
       → Result<ContainerReadModel[]>
  3. return that Result unchanged — no filtering, no re-wrapping

  ──────────────────────────────────────────────────────
  @arc/persistence  DbContainerQueryService.findAll()
  ──────────────────────────────────────────────────────
  try/catch wraps all steps → Result.fail(INTERNAL_ERROR) on exception

  Step 1+2: sessionRepo.findActiveSessionByFileSystemId(fileSystemId)
              → session | null
            containerFetcher.applyToContainers(fileSystemId, session?.sessionId ?? null)
              → ContainerBase[]  (baseline load + overlay applied inside fetcher)

  Step 3:   batch-query container_types WHERE system_id IN (overlaid typeSystemIds)
              → Map<typeSystemId, typeName>

  Step 4:   map ContainerBase[] + typeNameMap → ContainerReadModel[]
            return Result.ok(ContainerReadModel[])

  ──────────────────────────────────────────────────────
  SQLite via TypeORM DataSource
  ──────────────────────────────────────────────────────
```

### 3.2 DB queries per request

```
Query 1 (always — inside ContainerOverlayFetcher.applyToContainers):
  SELECT system_id, container_id, container_type_system_id, file_system_id
  FROM containers
  WHERE file_system_id = ?

Query 2 (always — ISessionRepository.findActiveSessionByFileSystemId):
  SELECT session_id, session_mode, file_system_id, p.system_id AS project_system_id
  FROM project_sessions ps
  JOIN arc_db_files f ON f.system_id = ps.file_system_id
  JOIN projects p ON p.system_id = f.project_system_id
  WHERE ps.file_system_id = ? AND ps.status = 'ACTIVE'

Query 3 (only when active session found — inside applyToContainers):
  SELECT * FROM edit_actions
  WHERE session_id = ?
    AND table_name = 'Container'
    AND valid_until IS NULL

Query 4 (only when containerTypeSystemId is non-null after overlay):
  SELECT system_id, name FROM container_types
  WHERE system_id IN (...)
```

Maximum **4 queries** per request: 2 always, 1 when a session is active, 1 when container types exist. Queries 1 and 3 are owned by `ContainerOverlayFetcher.applyToContainers()` — the query service only drives Query 2 (via `sessionRepo`) and Query 4 (type name resolution).

### 3.3 Result propagation

```
DbContainerQueryService.findAll()      ContainerQueryHandler.handle()      ContainerController
  Result<ContainerReadModel[]>   ──►     Result<ContainerReadModel[]>  ──►  ApiResult<ContainerDto[]>
  isFailure → INTERNAL_ERROR              passed through unchanged             HTTP 422 (UnprocessableEntityException)
  isSuccess → ContainerReadModel[]        passed through unchanged             HTTP 200
```

There is no `Result.partial` path in this flow — `findAll` has nothing to partially fail on (it's not resolving a specific set of requested ids), so the handler and controller only ever see `isSuccess`/`isFailure`.

---

## 4. Edit Session Overlay

### 4.1 Three-tier pattern via `ContainerOverlayFetcher`

Session lookup and overlay are split between the query service and the fetcher:

```typescript
// In DbContainerQueryService.findAll() — session lookup via ISessionRepository
const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
const rows = await this.containerFetcher.applyToContainers(
  fileSystemId,
  session?.sessionId ?? null,   // null → fetcher returns baseline rows directly
);
```

Inside `ContainerOverlayFetcher.applyToContainers()`:

```typescript
// Tier 1 — always load baseline (scalar ContainerBase rows, no relations)
const baseRows = ... // SELECT scalar columns FROM containers WHERE fileSystemId = ?

if (sessionId === null) return baseRows;   // Tier 2 — no session: baseline unchanged

// Tier 2b — session active: fetch all Container actions in one table-wide query
const actions = await this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Container);
if (actions.length === 0) return baseRows;

// Tier 3 — apply UPDATE+DELETE via OverlayMergeImpl (CREATEs handled separately)
const updateDeleteActions = actions.filter(a => a.operation !== CHANGE_OPERATION.Create);
const overlaid = this.overlay.applyToCollection(baseRows, updateDeleteActions).map(r => r.effective);

// Inject session-staged CREATEs — systemId always from a.targetSystemId, not newValue
const created = actions
  .filter(a => a.operation === CHANGE_OPERATION.Create && !baseIds.has(a.targetSystemId))
  .map(a => ({ systemId: a.targetSystemId, ...defaults from a.newValue }));

return [...overlaid, ...created];
```

`getByTable` is used (not `getByAggregateId`) because `findAll` has no fixed id list — the table-wide query is the only fit. This matches the one-query-for-the-whole-table batching principle from NFR-CQ-01.

`OverlayMergeImpl` (not the deprecated `applyToCollection` compat shim) handles UPDATE/DELETE. CREATE actions are handled separately so that `a.targetSystemId` is always the authoritative `systemId` for new entities.

### 4.2 What gets overlaid

| Table | Overlay applies to |
|---|---|
| `containers` | `type` UPDATE; row DELETE; staged CREATE |

`container_property_data` rows are **not** overlaid by this query.

### 4.3 Effect of each draft operation

| `edit_actions.operation` | Effect on `ContainerReadModel[]` |
|---|---|
| `DELETE` | Row removed — container absent from response |
| `UPDATE` | JSON `payload` fields merged onto baseline row — e.g. updated `type` |
| `CREATE` | Row injected into collection — staged container visible in response |

---

## 5. CQRS — Query and Handler

### `ContainerQuery`

```typescript
// packages/core/src/application/usecase-designer/container/query/
//   query-containers.query.ts

export class ContainerQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

Named `ContainerQuery` (not `QueryContainersQuery`) — matching `SpfModulesQuery`'s naming convention rather than the verb-first pattern the original draft of this doc used. No `systemIds` field (§1.4).

### `ContainerQueryHandler`

```typescript
// packages/core/src/application/usecase-designer/container/query/
//   query-containers.handler.ts

export class ContainerQueryHandler
  implements QueryHandler<ContainerQuery, Promise<Result<ContainerReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ContainerQuery): Promise<Result<ContainerReadModel[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // findAll has no systemIds filter — id-scoping does not exist on this path.
    return this.queryServices.containerQueryService.findAll(fileSystemId);
  }
}
```

Registered in `QueryHandlerRegistry` alongside `SpfModulesQuery`:

```typescript
this.queryHandlerFactories.set(ContainerQuery, {
  create: (deps: QueryHandlerDependencies) =>
    new ContainerQueryHandler(deps.queryServices),
});
```

---

## 6. Persistence Layer — DbContainerQueryService

### 6.1 Port interface

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   container/container-query-service.ts

export interface ContainerQueryService {
  /**
   * Returns every ContainerReadModel for the given fileSystemId.
   * Overlay is always applied internally — no applyOverlay flag.
   */
  findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>>;
}
```

### 6.2 Implementation

```typescript
// packages/infrastructure/persistence/src/.../queries/container/
//   db-container-query-service.ts

export class DbContainerQueryService implements ContainerQueryService {
  private readonly containerFetcher: ContainerOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc:  EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.containerFetcher = new ContainerOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  async findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>> {
    try {
      // Step 1+2 — baseline load + overlay via fetcher
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = await this.containerFetcher.applyToContainers(
        fileSystemId,
        session?.sessionId ?? null,
      );

      // Step 3 — resolve container type names in one batch query
      const typeIds = [...new Set(
        rows.map(r => r.containerTypeSystemId).filter((id): id is number => !!id),
      )];
      const typeNameMap = new Map<number, string>();
      if (typeIds.length > 0) {
        const typeRows = await this.dataSource
          .getRepository('ContainerType')
          .createQueryBuilder('ct')
          .select(['ct.systemId', 'ct.name'])
          .whereInIds(typeIds)
          .getMany() as Array<{systemId: number; name: string}>;
        for (const t of typeRows) typeNameMap.set(t.systemId, t.name);
      }

      // Step 4 — assemble ContainerReadModel[]
      return Result.ok(
        rows.map(r => ({
          systemId:             r.systemId,
          containerId:          r.containerId,
          containerTypeSystemId: r.containerTypeSystemId ?? null,
          containerTypeName:    r.containerTypeSystemId
            ? (typeNameMap.get(r.containerTypeSystemId) ?? null)
            : null,
        }) satisfies ContainerReadModel),
      );
    } catch (error) {
      return Result.fail({
        code:    ERROR_CODES.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Failed to query containers',
        severity: IssueSeverity.Error,
      });
    }
  }
}
```

### 6.3 Error handling

| Scenario | Treatment |
|---|---|
| DB error on baseline query | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| DB error on session or overlay query | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| No containers exist for the file | Empty `rows` — `Result.ok([])`, not an error |
| Project doesn't exist | Not handled here — `getFileIdByProjectId` throws before `findAll` is ever called; see §5 and Open Items |

---

## 7. Port Interface and Wiring

### 7.1 `containerQueryService` on `QueryServices`

```typescript
// packages/core/src/application/ports/persistence/query-services/query-services.ts

import type {ContainerQueryService} from './container/container-query-service.js';

export interface QueryServices {
  // ... existing ...
  readonly containerQueryService: ContainerQueryService;
}
```

### 7.2 `DbContainerQueryService` in `DbQueryServices`

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

import {DbContainerQueryService} from './container/db-container-query-service.js';

export class DbQueryServices implements QueryServices {
  readonly containerQueryService: ContainerQueryService;
  // ... existing fields ...

  constructor(dataSource: DataSource, logger?: Logger) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);
    // ... existing construction unchanged ...

    this.containerQueryService = new DbContainerQueryService(
      dataSource,
      editActionsQueryService,
      sessionRepo,             // already instantiated earlier in DbQueryServices constructor
    );
  }
}
```

No dependency on any other query service — same "leaf" category-service shape as `KeyValueDefQueryService`. `ContainerOverlayFetcher` is constructed internally by `DbContainerQueryService` (not shared with other services).

### 7.3 `ContainerModule` — `ArcCqrsModule` import required

`ContainerController` now injects `QueryBus` via its constructor. `ContainerModule` previously had no `imports` and would fail NestJS dependency resolution at bootstrap — fixed by importing `ArcCqrsModule` (which provides/exports `QueryBus`), same as `SpfModuleModule`:

```typescript
// packages/api/src/presentation/rest/modules/container/container.module.ts

@Module({
  imports: [ArcCqrsModule],
  controllers: [ContainerController],
  providers: [],
  exports: [],
})
export class ContainerModule {}
```

---

## 8. DTO Mapping

### `ContainerReadModel` → `ContainerDto`

```typescript
// ContainerController private helper

private mapToContainerDto(c: ContainerReadModel): ContainerDto {
  const dto = new ContainerDto(String(c.systemId), c.containerId);
  //  ↑ constructor(systemId: string, id: number)
  //    systemId  ← String(c.systemId)  e.g. "123"
  //    id        ← c.containerId       e.g. 5
  dto.name = c.type;           // e.g. "AUDIO_SS"
  dto.changeInfo = undefined;  // FR-CQ-07 — not included in this endpoint
  return dto;
}
```

### `queryContainers` controller method

```typescript
@Post('query')
async queryContainers(
  @Param('projectId') projectId: string,
  @Body() _request: SystemIdsRequestDto,   // accepted, unused — see §1.2
): Promise<ApiResult<ContainerDto[]>> {

  const query = new ContainerQuery(
    Number.parseInt(projectId, 10),  // radix 10 guards against octal misparse
    'client-id',                      // TODO: extract real clientId from JWT
  );

  const result = await this.queryBus.execute<Result<ContainerReadModel[]>>(query);

  if (result.isFailure) {
    throw new UnprocessableEntityException(
      result.errors?.[0]?.message ?? 'Failed to retrieve containers',
    );
  }

  return {
    data:    result.data.map(c => this.mapToContainerDto(c)),
    success: true,
    message: 'Containers retrieved successfully',
  };
}
```

`UnprocessableEntityException` (not a raw `HttpException`) — required by the repo's `enforce-http-exceptions` ESLint rule, which restricts controllers to a fixed set of typed NestJS exceptions.

---

## 9. Folder Structure

### New files

```
packages/core/src/application/
  ports/persistence/query-services/
    container/
      container-query-service.ts            ← ContainerQueryService port — findAll(fileSystemId) only
  usecase-designer/
    container/
      query/
        query-containers.query.ts           ← ContainerQuery extends BaseQuery (projectId, clientId)
        query-containers.handler.ts          ← ContainerQueryHandler

packages/infrastructure/persistence/src/.../queries/
  container/
    db-container-query-service.ts           ← DbContainerQueryService; delegates overlay to
                                                ContainerOverlayFetcher; injects ISessionRepository

packages/infrastructure/persistence/src/.../fetchers/
  container-overlay-fetcher.ts              ← fetchOne (single container with properties) +
                                                applyToContainers (batch — all containers for a file,
                                                containers table only, no property overlay)
```

### Modified files

```
packages/core/src/application/ports/persistence/query-services/
  usecase/query-models/container-read-model.ts   ← added containerId: number
  query-services.ts                              ← added containerQueryService: ContainerQueryService
  spf-module/... (no changes)

packages/core/src/
  index.ts                                        ← exported ContainerQueryService, ContainerQuery, ContainerQueryHandler
  application/orchestration/cqrs/registries/
    query-handler-registry.ts                     ← registered ContainerQuery → ContainerQueryHandler

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/
  usecase/usecase-query-mappers.ts                ← added containerId to the inline ContainerReadModel literal
                                                      built for ModuleReadModel.container (unrelated call site,
                                                      broke once containerId became a required field)
  typeorm-query-services.ts                       ← wired DbContainerQueryService (now passes sessionRepo)

packages/api/src/presentation/rest/modules/container/
  container.controller.ts                        ← implemented queryContainers; injects QueryBus;
                                                      added mapToContainerDto private helper
  container.module.ts                             ← added ArcCqrsModule to imports
```

### No DB changes needed

All required tables already exist: `containers`, `edit_actions`, `project_sessions`.

---

## Open Items (not addressed in this revision)

- **No 404 for missing project.** `ProjectQueryService.getFileIdByProjectId` throws when the project doesn't exist; `ContainerQueryHandler`/`ContainerController` don't catch that and map it to `NotFoundException` — the original FR-CQ-05 ("404 Not Found" for missing project) from the v1.0 draft is not actually implemented. Swagger still documents a 404 response for this endpoint.
- **No id-scoped lookup.** `systemIds` in the request body is accepted but ignored (§1.2/§1.4). If a caller needs "give me containers X, Y, Z" rather than "give me every container," `ContainerQueryService` needs a new method — no `findOne`/`findMany` exists today.
- **207 Multi-Status is unreachable.** Swagger documents a 207 response for this endpoint (`PartialSuccessInterceptor` is applied at the controller level), but since `findAll` never produces `Result.partial`, `ApiResult.errors` is never populated by this code path — the endpoint can only ever return 200 or 422.
- **Change-status filtering not applied.** `getEditActionsByTable` supports an `options.changeStatus` filter to restrict to `STAGED` only; this implementation passes no options, so STAGED and UNSTAGED drafts (any non-expired row) are both included. Compare to the original FR-CQ-06 in the v1.0 draft, which specified STAGED-only.

---

*End of Document*
