<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Subgraph Query APIs — Low-Level Design

## Document Information

- **Version**: 1.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `GET  /arc-api/v1/projects/{projectId}/subgraphs`
  - `POST /arc-api/v1/projects/{projectId}/subgraphs/query`
  - `GET  /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/usecases`
- **Related Documents**:
  - `container-query-lld.md` — Parallel design (same CQRS + overlay pattern)
  - `spf-module-query-lld.md` — Reference design
  - `edit-session-persistence-design.md` — Edit session overlay pattern
  - `2026-06-01-component-query-apis-requirements.md` — Component query requirements

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Read Models](#2-read-models)
3. [Architecture and Call Flow](#3-architecture-and-call-flow)
4. [Edit Session Overlay](#4-edit-session-overlay)
5. [CQRS — Queries and Handlers](#5-cqrs--queries-and-handlers)
6. [Persistence Layer — DbSubgraphQueryService](#6-persistence-layer--dbsubgraphqueryservice)
7. [Port Interface and Wiring](#7-port-interface-and-wiring)
8. [DTO Mapping](#8-dto-mapping)
9. [Folder Structure](#9-folder-structure)

---

## 1. Requirements

### 1.1 Endpoints and response DTOs

| Endpoint | HTTP | Response DTO | Intent |
|---|---|---|---|
| `/subgraphs` | GET | `SubgraphDto[]` | All subgraphs in the project file |
| `/subgraphs/query` | POST | `SubgraphDto[]` | Subgraphs for given systemIds |
| `/subgraphs/{subgraphSystemId}/usecases` | GET | `UsecaseIdentifierDto[]` | Usecases that contain the subgraph |

The first two share the same persistence method (`findMany` / `findAll`). The third is a separate query to a different entity.

### 1.2 Functional requirements — GET /subgraphs

#### FR-SGA-01: No body — scoped by projectId only
No request body. Returns all subgraphs whose `file_system_id` matches the resolved project file.

#### FR-SGA-02: projectId resolution
Controller MUST resolve `projectId` to `fileSystemId` via `ProjectQueryService.getFileIdByProjectId`. If not found → `404 Not Found`.

### 1.3 Functional requirements — POST /subgraphs/query

#### FR-SGQ-01: Request validation — empty systemIds
If `body.systemIds` is absent or empty → `400 Bad Request`.

#### FR-SGQ-02: Request validation — invalid systemId format
If any entry cannot be parsed as a positive integer → `400 Bad Request`.

#### FR-SGQ-03: Deduplication
Persistence layer MUST deduplicate `systemIds` silently. Response MUST NOT contain duplicates.

#### FR-SGQ-04: Partial result for unknown IDs
Only subgraphs found are returned. No error raised for unrecognised IDs.

#### FR-SGQ-05: projectId resolution
Same as FR-SGA-02.

### 1.4 Functional requirements — GET /subgraphs/{subgraphSystemId}/usecases

#### FR-SGUC-01: subgraphSystemId validation
If `subgraphSystemId` cannot be parsed as a positive integer → `400 Bad Request`.

#### FR-SGUC-02: Subgraph existence check
If no subgraph row exists for the given `subgraphSystemId` scoped to the project file → `404 Not Found`.

#### FR-SGUC-03: Returns usecases linked to the subgraph
Returns all `use_cases` rows joined through `use_case_subgraphs WHERE subgraph_system_id = ?`, with their GKV data.

#### FR-SGUC-04: projectId resolution
Same as FR-SGA-02.

### 1.5 Shared functional requirements

#### FR-SH-01: Overlay always applied — no caller flag
`SubgraphQueryService` port methods expose **no `applyOverlay` flag**. Overlay is always attempted internally.

#### FR-SH-02: Baseline-only read when no session active
When no active session exists, rows are returned from baseline tables only.

#### FR-SH-03: Draft overlay when session active
- `DELETE` draft → exclude row from result
- `UPDATE` draft → merge changed fields onto baseline row
- `CREATE` draft → inject staged row

#### FR-SH-04: STAGED drafts only
Only `change_status = 'STAGED'` with `valid_until IS NULL` is applied. UNSTAGED drafts MUST NOT appear.

#### FR-SH-05: Excluded fields
The following `SubgraphDto` fields are **not populated** in this scope:
- `changeInfo` → `undefined`
- `relatedEndPointLinks` → `[]`
- `SGKV` → `[]`
- `scenarioType` → not set
- `deviceType` → not set

`UsecaseIdentifierDto.changeInfo` → `undefined`.

### 1.6 Non-functional requirements

**NFR-SG-01:** No N+1 patterns. All entity loading MUST use `IN` clauses or JOINs.
**NFR-SG-02:** Maximum 4 DB queries per request for all endpoints.

---

## 2. Read Models

### 2.1 `Result<T>` wraps all service returns

```
Result<T>
  isSuccess: boolean
  data: T              ← only accessible when isSuccess = true (throws otherwise)
  errors: Error[]      ← always [], non-empty on failure
  warnings: Warning[]  ← always [], non-empty on partial success
```

### 2.2 SubgraphReadModel — current state

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   usecase/query-models/subgraph-read-model.ts   ← EXISTING FILE

export interface SubgraphReadModel {
  readonly systemId: number;   // subgraphs.system_id
  readonly name:     string;   // subgraphs.name
}
```

### 2.3 SubgraphReadModel — required update

`SubgraphDto.id` maps to `subgraphId` (business key) and `subGraphSharedType` is derived from `isExported`. Both are absent from the current read model.

```typescript
// Updated SubgraphReadModel — two fields added

export interface SubgraphReadModel {
  readonly systemId:   number;   // subgraphs.system_id    — internal PK
  readonly subgraphId: number;   // subgraphs.subgraph_id  — domain/business key
  readonly name:       string;   // subgraphs.name
  readonly isExported: boolean;  // subgraphs.is_exported  — drives subGraphSharedType
}
```

**Changes:** `subgraphId: number` and `isExported: boolean` added.

### 2.4 Source columns for SubgraphReadModel

| Property | DB table | DB column | Notes |
|---|---|---|---|
| `systemId` | `subgraphs` | `system_id` | internal PK, unique per file |
| `subgraphId` | `subgraphs` | `subgraph_id` | business key → `SubgraphDto.id` |
| `name` | `subgraphs` | `name` | → `SubgraphDto.name` |
| `isExported` | `subgraphs` | `is_exported` | stored as 0/1 in SQLite; `true` → `SharedType.Exported` |

### 2.5 Mapping SubgraphReadModel → SubgraphDto

| `SubgraphReadModel` | `SubgraphDto` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(s.systemId)` |
| `subgraphId: number` | `id: number` | direct |
| `name: string` | `name?: string` | direct |
| `isExported: boolean` | `subGraphSharedType` | `isExported ? SharedType.Exported : SharedType.None` |
| — | `scenarioType` | not set (FR-SH-05) |
| — | `deviceType` | not set (FR-SH-05) |
| — | `SGKV` | `[]` (FR-SH-05) |
| — | `changeInfo` | `undefined` (FR-SH-05) |
| — | `relatedEndPointLinks` | `[]` (FR-SH-05) |

### 2.6 UsecaseForSubgraphReadModel — new read model

No existing read model covers the `/usecases` endpoint response shape.

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   subgraph/query-models/usecase-for-subgraph-read-model.ts  (new file)

export interface UsecaseForSubgraphReadModel {
  readonly systemId:   number;                  // use_cases.system_id
  readonly aliasId:    number;                  // use_cases.alias_id   → usecaseAliasId
  readonly alias:      string;                  // use_cases.alias      → usecaseAliasName
  readonly categories: string[];                // use_case_categories_master.name[]
  readonly gkv:        KeyValuePairReadModel[]; // usecase_gkv_values JOIN value_definitions JOIN key_definitions
}
```

### 2.7 Source columns for UsecaseForSubgraphReadModel

| Property | DB table | DB column / join | Notes |
|---|---|---|---|
| `systemId` | `use_cases` | `system_id` | internal PK |
| `aliasId` | `use_cases` | `alias_id` | numeric alias |
| `alias` | `use_cases` | `alias` | human-readable alias name |
| `categories` | `use_case_categories_master` | `name` via `use_case_categories` join | may be empty |
| `gkv` | `usecase_gkv_values` → `value_definitions` → `key_definitions` | composite JOIN | key + value labels |

Usecases linked to a subgraph are resolved via: `use_case_subgraphs WHERE subgraph_system_id = ?`

### 2.8 Mapping UsecaseForSubgraphReadModel → UsecaseIdentifierDto

| `UsecaseForSubgraphReadModel` | `UsecaseIdentifierDto` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(u.systemId)` |
| `gkv: KeyValuePairReadModel[]` | `keyValueCollection: KeyValueInfo[]` | map key/value ids + names |
| `aliasId: number` | `usecaseAliasId?: number` | direct |
| `alias: string` | `usecaseAliasName?: string` | direct |
| `categories[0]: string` | `usecaseCategory?: string` | first category or `undefined` |
| — | `usecaseType` | `UsecaseType.Regular` (no type column in `use_cases`) |
| — | `changeInfo` | `undefined` (FR-SH-05) |
| — | `relatedEndPointLinks` | `[]` (FR-SH-05) |

---

## 3. Architecture and Call Flow

### 3.1 GET /subgraphs

```
GET /arc-api/v1/projects/{projectId}/subgraphs

  ──────────────────────────────────────────────────────
  @arc/api  SubgraphController.getAllSubgraphs()
  ──────────────────────────────────────────────────────
  1. parseInt(projectId, 10) — NaN → HTTP 400
  2. new GetAllSubgraphsQuery(projectId, clientId)
  3. queryBus.execute(query) → Result<SubgraphReadModel[]>
  4. result.isFailure → throw HttpException HTTP 422
  5. result.data.map(s → SubgraphDto)
  6. return ApiResult<SubgraphDto[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  GetAllSubgraphsHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
       throws if not found → HTTP 404
  2. subgraphQueryService.findAll(fileSystemId)
       → Result<SubgraphReadModel[]>
       isFailure → return Result.fail(...errors)
  3. return Result.ok(result.data, result.warnings)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubgraphQueryService.findAll()
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Step 1 — baseline load (QueryBuilder):
    dataSource.getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select(['s.systemId', 's.subgraphId', 's.name', 's.isExported'])
      .where('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()
    → SubgraphRow[]

  Step 2 — session check:
    editActionsSvc.findActiveSession(fileSystemId) → session | null
    null → return Result.ok(toReadModels(baselineRows))

  Step 3 — overlay (if session):
    editActionsSvc.getEditActionsByAggregateIds(
      session.sessionId,
      baselineRows.map(r => r.systemId),
    ) → EditActionRow[]
    [] → return Result.ok(toReadModels(baselineRows))

  Step 4 — merge + assemble:
    applyToCollection(baselineRows, editActions) → SubgraphRow[]
    return Result.ok(toReadModels(mergedRows))

  ──────────────────────────────────────────────────────
  SQLite via TypeORM DataSource
  ──────────────────────────────────────────────────────
```

### 3.2 POST /subgraphs/query

```
POST /arc-api/v1/projects/{projectId}/subgraphs/query
  Body: { systemIds: ["10", "11"] }

  ──────────────────────────────────────────────────────
  @arc/api  SubgraphController.querySubgraphs()
  ──────────────────────────────────────────────────────
  1. Parse systemIds string[] → number[]
       NaN → HTTP 400
  2. parseInt(projectId, 10)
  3. new QuerySubgraphsQuery(systemIds, projectId, clientId)
  4. queryBus.execute(query) → Result<SubgraphReadModel[]>
  5. result.isFailure → throw HttpException HTTP 422
  6. result.data.map(s → SubgraphDto)
  7. return ApiResult<SubgraphDto[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  QuerySubgraphsHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
       throws if not found → HTTP 404
  2. subgraphQueryService.findMany(query.systemIds, fileSystemId)
       → Result<SubgraphReadModel[]>
       isFailure → return Result.fail(...errors)
  3. return Result.ok(result.data, result.warnings)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubgraphQueryService.findMany()
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Guard: systemIds.length === 0 → Result.fail(INVALID_INPUT)

  Step 1 — deduplicate + baseline load (QueryBuilder):
    const uniqueIds = [...new Set(systemIds)]
    dataSource.getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select(['s.systemId', 's.subgraphId', 's.name', 's.isExported'])
      .where('s.systemId IN (:...ids)', {ids: uniqueIds})
      .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()
    → SubgraphRow[]

  Step 2 — session check:
    editActionsSvc.findActiveSession(fileSystemId) → session | null
    null → return Result.ok(toReadModels(baselineRows))

  Step 3 — overlay (if session):
    editActionsSvc.getEditActionsByAggregateIds(
      session.sessionId,
      uniqueIds,
    ) → EditActionRow[]
    [] → return Result.ok(toReadModels(baselineRows))

  Step 4 — merge + assemble:
    applyToCollection(baselineRows, editActions) → SubgraphRow[]
    return Result.ok(toReadModels(mergedRows))
```

### 3.3 GET /subgraphs/{subgraphSystemId}/usecases

```
GET /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/usecases

  ──────────────────────────────────────────────────────
  @arc/api  SubgraphController.getUsecasesForSubgraph()
  ──────────────────────────────────────────────────────
  1. parseInt(projectId, 10), parseInt(subgraphSystemId, 10)
       NaN → HTTP 400
  2. new GetUsecasesForSubgraphQuery(subgraphSystemId, projectId, clientId)
  3. queryBus.execute(query) → Result<UsecaseForSubgraphReadModel[]>
  4. result.isFailure:
       ENTITY_NOT_FOUND → throw HttpException HTTP 404
       other            → throw HttpException HTTP 422
  5. result.data.map(u → UsecaseIdentifierDto)
  6. return ApiResult<UsecaseIdentifierDto[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  GetUsecasesForSubgraphHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
       throws if not found → HTTP 404
  2. subgraphQueryService.getUsecasesForSubgraph(
       query.subgraphSystemId, fileSystemId
     ) → Result<UsecaseForSubgraphReadModel[]>
       isFailure → return Result.fail(...errors)
  3. return Result.ok(result.data, result.warnings)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubgraphQueryService.getUsecasesForSubgraph()
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Step 1 — existence check (QueryBuilder):
    dataSource.getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select('s.systemId')
      .where('s.systemId = :id', {id: subgraphSystemId})
      .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()
    → null → return Result.fail(ENTITY_NOT_FOUND) → HTTP 404

  Step 2 — load usecases + GKV + categories (QueryBuilder):
    dataSource.getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .innerJoin(ENTITY_NAMES.UseCaseSubgraph, 'ucs',
        'ucs.usecaseSystemId = uc.systemId')
      .leftJoinAndSelect('uc.gkvEntries', 'gkv')
      .leftJoinAndSelect('gkv.valueDef', 'vd')
      .leftJoinAndSelect('vd.keys', 'kd')
      .leftJoinAndSelect('uc.categories', 'cat')
      .where('ucs.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
      .andWhere('uc.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()
    → UseCaseRow[]

  Step 3 — session check:
    editActionsSvc.findActiveSession(fileSystemId) → session | null
    null → return Result.ok(toUsecaseReadModels(baselineRows))

  Step 4 — overlay (if session):
    editActionsSvc.getEditActionsByAggregateIds(
      session.sessionId,
      baselineRows.map(r => r.systemId),
    ) → EditActionRow[]
    [] → return Result.ok(toUsecaseReadModels(baselineRows))
    applyToCollection(baselineRows, editActions) → UseCaseRow[]
    return Result.ok(toUsecaseReadModels(mergedRows))
```

### 3.4 DB queries per request

**GET /subgraphs:**
```
Q1 (always):   SELECT system_id, subgraph_id, name, is_exported FROM subgraphs
                 WHERE file_system_id = ?
Q2 (always):   SELECT * FROM project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q3 (if session): SELECT * FROM edit_actions
                   WHERE session_id = ? AND aggregate_id IN (...)
                   AND valid_until IS NULL AND change_status = 'STAGED'
```

**POST /subgraphs/query:**
```
Q1 (always):   SELECT system_id, subgraph_id, name, is_exported FROM subgraphs
                 WHERE system_id IN (?) AND file_system_id = ?
Q2 (always):   SELECT * FROM project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q3 (if session): SELECT * FROM edit_actions
                   WHERE session_id = ? AND aggregate_id IN (...)
                   AND valid_until IS NULL AND change_status = 'STAGED'
```

**GET /subgraphs/{id}/usecases:**
```
Q1 (always):   SELECT system_id FROM subgraphs
                 WHERE system_id = ? AND file_system_id = ?  ← existence check
Q2 (always):   SELECT uc.* + gkv + categories FROM use_cases uc
                 INNER JOIN use_case_subgraphs ON subgraph_system_id = ?
                 LEFT JOIN usecase_gkv_values + value_definitions + key_definitions
                 LEFT JOIN use_case_categories + use_case_categories_master
                 WHERE file_system_id = ?
Q3 (always):   SELECT * FROM project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q4 (if session): SELECT * FROM edit_actions
                   WHERE session_id = ? AND aggregate_id IN (...)
                   AND valid_until IS NULL AND change_status = 'STAGED'
```

---

## 4. Edit Session Overlay

### 4.1 Three-tier pattern (same as container-query-lld.md §4)

```typescript
const session = await this.editActionsSvc.findActiveSession(fileSystemId);

if (!session) return Result.ok(toReadModels(baselineRows));

const editActions = await this.editActionsSvc
  .getEditActionsByAggregateIds(session.sessionId, uniqueIds);

if (!editActions.length) return Result.ok(toReadModels(baselineRows));

const merged = applyToCollection(baselineRows, editActions);
return Result.ok(toReadModels(merged));
```

### 4.2 Tables overlaid

| Table | Aggregate ID | Changes applied | Endpoint |
|---|---|---|---|
| `subgraphs` | `subgraphSystemId` | `name`, `is_exported` UPDATE; DELETE; CREATE | GET /subgraphs, POST /query |
| `use_cases` | `usecaseSystemId` | `alias` UPDATE; DELETE; CREATE | GET /usecases |

`subgraph_property_data` is **not** overlaid by these endpoints.

### 4.3 Effect of each draft operation

| `edit_actions.operation` | Effect |
|---|---|
| `DELETE` | Row removed — entity absent from response |
| `UPDATE` | JSON `payload` fields merged onto baseline row |
| `CREATE` | Row injected — staged entity visible in response |

### 4.4 STAGED vs UNSTAGED

`EditActionsQueryService.getEditActionsByAggregateIds` enforces `change_status = 'STAGED'` and `valid_until IS NULL`. UNSTAGED drafts are never visible (FR-SH-04).

---

## 5. CQRS — Queries and Handlers

### 5.1 GetAllSubgraphsQuery

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   get-all-subgraphs.query.ts  (new file)

export class GetAllSubgraphsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 5.2 GetAllSubgraphsHandler

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   get-all-subgraphs.handler.ts  (new file)

export class GetAllSubgraphsHandler
  implements QueryHandler<GetAllSubgraphsQuery, Promise<Result<SubgraphReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetAllSubgraphsQuery): Promise<Result<SubgraphReadModel[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    const result = await this.queryServices.subgraphQueryService
      .findAll(fileSystemId);

    if (result.isFailure) return Result.fail(...result.errors);
    return Result.ok(result.data, result.warnings);
  }
}
```

### 5.3 QuerySubgraphsQuery

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   query-subgraphs.query.ts  (new file)

export class QuerySubgraphsQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 5.4 QuerySubgraphsHandler

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   query-subgraphs.handler.ts  (new file)

export class QuerySubgraphsHandler
  implements QueryHandler<QuerySubgraphsQuery, Promise<Result<SubgraphReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QuerySubgraphsQuery): Promise<Result<SubgraphReadModel[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    const result = await this.queryServices.subgraphQueryService
      .findMany(query.systemIds, fileSystemId);

    if (result.isFailure) return Result.fail(...result.errors);
    return Result.ok(result.data, result.warnings);
  }
}
```

### 5.5 GetUsecasesForSubgraphQuery

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   get-usecases-for-subgraph.query.ts  (new file)

export class GetUsecasesForSubgraphQuery extends BaseQuery {
  constructor(
    public readonly subgraphSystemId: number,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 5.6 GetUsecasesForSubgraphHandler

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   get-usecases-for-subgraph.handler.ts  (new file)

export class GetUsecasesForSubgraphHandler
  implements QueryHandler<GetUsecasesForSubgraphQuery, Promise<Result<UsecaseForSubgraphReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetUsecasesForSubgraphQuery): Promise<Result<UsecaseForSubgraphReadModel[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    const result = await this.queryServices.subgraphQueryService
      .getUsecasesForSubgraph(query.subgraphSystemId, fileSystemId);

    if (result.isFailure) return Result.fail(...result.errors);
    return Result.ok(result.data, result.warnings);
  }
}
```

**All handlers are intentionally thin** — overlay logic lives entirely in the persistence layer.

---

## 6. Persistence Layer — DbSubgraphQueryService

### 6.1 Port interface

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   subgraph/subgraph-query-service.ts  (new file)

export interface SubgraphQueryService {
  /**
   * Returns all SubgraphReadModel for the file.
   * Overlay always applied — no applyOverlay flag (FR-SH-01).
   */
  findAll(fileSystemId: number): Promise<Result<SubgraphReadModel[]>>;

  /**
   * Returns SubgraphReadModel[] for the given systemIds.
   * Overlay always applied — no applyOverlay flag (FR-SH-01).
   * Partial results — missing IDs silently omitted (FR-SGQ-04).
   */
  findMany(
    systemIds:    number[],
    fileSystemId: number,
  ): Promise<Result<SubgraphReadModel[]>>;

  /**
   * Returns UsecaseForSubgraphReadModel[] for usecases linked to this subgraph.
   * Returns Result.fail(ENTITY_NOT_FOUND) if subgraph does not exist (FR-SGUC-02).
   * Overlay on use_cases rows always applied (FR-SH-01).
   */
  getUsecasesForSubgraph(
    subgraphSystemId: number,
    fileSystemId:     number,
  ): Promise<Result<UsecaseForSubgraphReadModel[]>>;
}
```

### 6.2 Implementation — findAll

```typescript
async findAll(fileSystemId: number): Promise<Result<SubgraphReadModel[]>> {
  try {
    // Step 1 — baseline load
    const baselineRows = await this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select(['s.systemId', 's.subgraphId', 's.name', 's.isExported'])
      .where('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as SubgraphRow[];

    // Steps 2-4 — three-tier overlay
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    let rows = baselineRows;
    if (session) {
      const editActions = await this.editActionsSvc.getEditActionsByAggregateIds(
        session.sessionId,
        baselineRows.map(r => r.systemId),
      );
      if (editActions.length > 0)
        rows = applyToCollection(baselineRows, editActions) as SubgraphRow[];
    }

    return Result.ok(rows.map(r => ({
      systemId:   r.systemId,
      subgraphId: r.subgraphId,
      name:       r.name,
      isExported: Boolean(r.isExported),
    } satisfies SubgraphReadModel)));
  } catch (error) {
    return Result.fail({
      code:    ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to query subgraphs',
    });
  }
}
```

### 6.3 Implementation — findMany

```typescript
async findMany(systemIds: number[], fileSystemId: number): Promise<Result<SubgraphReadModel[]>> {
  try {
    if (systemIds.length === 0)
      return Result.fail({code: ERROR_CODES.INVALID_INPUT, message: 'systemIds must not be empty'});

    const uniqueIds = [...new Set(systemIds)];

    // Step 1 — baseline load
    const baselineRows = await this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select(['s.systemId', 's.subgraphId', 's.name', 's.isExported'])
      .where('s.systemId IN (:...ids)', {ids: uniqueIds})
      .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as SubgraphRow[];

    // Steps 2-4 — three-tier overlay
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    let rows = baselineRows;
    if (session) {
      const editActions = await this.editActionsSvc.getEditActionsByAggregateIds(
        session.sessionId,
        uniqueIds,
      );
      if (editActions.length > 0)
        rows = applyToCollection(baselineRows, editActions) as SubgraphRow[];
    }

    return Result.ok(rows.map(r => ({
      systemId:   r.systemId,
      subgraphId: r.subgraphId,
      name:       r.name,
      isExported: Boolean(r.isExported),
    } satisfies SubgraphReadModel)));
  } catch (error) {
    return Result.fail({
      code:    ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to query subgraphs',
    });
  }
}
```

### 6.4 Implementation — getUsecasesForSubgraph

```typescript
async getUsecasesForSubgraph(
  subgraphSystemId: number,
  fileSystemId: number,
): Promise<Result<UsecaseForSubgraphReadModel[]>> {
  try {
    // Step 1 — existence check
    const subgraph = await this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select('s.systemId')
      .where('s.systemId = :id', {id: subgraphSystemId})
      .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne();

    if (!subgraph)
      return Result.fail({
        code:    ERROR_CODES.ENTITY_NOT_FOUND,
        message: `Subgraph ${subgraphSystemId} not found`,
      });

    // Step 2 — load usecases + GKV + categories via single QueryBuilder
    const baselineRows = await this.dataSource
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .innerJoin(
        ENTITY_NAMES.UseCaseSubgraph,
        'ucs',
        'ucs.usecaseSystemId = uc.systemId AND ucs.subgraphSystemId = :subgraphSystemId',
        {subgraphSystemId},
      )
      .leftJoinAndSelect('uc.gkvEntries', 'gkv')
      .leftJoinAndSelect('gkv.valueDef', 'vd')
      .leftJoinAndSelect('vd.keys', 'kd')
      .leftJoinAndSelect('uc.categories', 'cat')
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as UseCaseRow[];

    // Steps 3-4 — three-tier overlay on use_cases rows
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    let rows = baselineRows;
    if (session) {
      const editActions = await this.editActionsSvc.getEditActionsByAggregateIds(
        session.sessionId,
        baselineRows.map(r => r.systemId),
      );
      if (editActions.length > 0)
        rows = applyToCollection(baselineRows, editActions) as UseCaseRow[];
    }

    // Step 5 — assemble read models
    return Result.ok(rows.map(r => ({
      systemId:   r.systemId,
      aliasId:    r.aliasId,
      alias:      r.alias,
      categories: r.categories?.map(c => c.name) ?? [],
      gkv:        r.gkvEntries?.map(g => UseCaseQueryMappers.mapValueToKeyVector(g.valueDef!)) ?? [],
    } satisfies UsecaseForSubgraphReadModel)));
  } catch (error) {
    return Result.fail({
      code:    ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to query usecases for subgraph',
    });
  }
}
```

### 6.5 Error handling

| Scenario | Treatment |
|---|---|
| Empty `systemIds` (findMany) | `Result.fail(INVALID_INPUT)` before any DB query |
| DB error on any query | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| systemId not in DB (findMany/findAll) | Partial result — silently omitted (FR-SGQ-04) |
| Subgraph not found (getUsecasesForSubgraph) | `Result.fail(ENTITY_NOT_FOUND)` → HTTP 404 |

---

## 7. Port Interface and Wiring

### 7.1 Add `subgraphQueryService` to `QueryServices`

```typescript
// packages/core/src/application/ports/persistence/query-services/query-services.ts

import type {SubgraphQueryService} from './subgraph/subgraph-query-service.js';

export interface QueryServices {
  // ... existing ...
  readonly subgraphQueryService: SubgraphQueryService;
}
```

### 7.2 Wire in `DbQueryServices`

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

import {DbSubgraphQueryService} from './subgraph/db-subgraph-query-service.js';

export class DbQueryServices implements QueryServices {
  readonly subgraphQueryService: SubgraphQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);
    // ... existing construction unchanged ...

    this.subgraphQueryService = new DbSubgraphQueryService(
      dataSource,
      editActionsQueryService,
    );
  }
}
```

### 7.3 Register handlers in QueryBus

```typescript
queryBus.register(GetAllSubgraphsQuery,        new GetAllSubgraphsHandler(queryServices));
queryBus.register(QuerySubgraphsQuery,         new QuerySubgraphsHandler(queryServices));
queryBus.register(GetUsecasesForSubgraphQuery, new GetUsecasesForSubgraphHandler(queryServices));
```

---

## 8. DTO Mapping

### SubgraphReadModel → SubgraphDto

```typescript
private mapToSubgraphDto(s: SubgraphReadModel): SubgraphDto {
  const dto = new SubgraphDto(String(s.systemId), s.subgraphId);
  dto.name             = s.name;
  dto.subGraphSharedType = s.isExported ? SharedType.Exported : SharedType.None;
  dto.SGKV             = [];
  dto.changeInfo       = undefined;  // FR-SH-05
  return dto;
}
```

### UsecaseForSubgraphReadModel → UsecaseIdentifierDto

```typescript
private mapToUsecaseIdentifierDto(u: UsecaseForSubgraphReadModel): UsecaseIdentifierDto {
  const kvPairsInfo = new KeyValuePairsInfo(
    u.gkv.map(kv =>
      new KeyValueInfo(
        new KeyInfo(kv.key.keyId, kv.key.name, String(kv.key.systemId)),
        new ValueInfo(kv.value.valueId, kv.value.name, String(kv.value.systemId)),
      ),
    ),
  );
  const dto = new UsecaseIdentifierDto(
    String(u.systemId),
    UsecaseType.Regular,
    kvPairsInfo,
    u.aliasId,
    u.alias,
    u.categories[0],
  );
  dto.changeInfo = undefined;  // FR-SH-05
  return dto;
}
```

---

## 9. Folder Structure

### New files

```
packages/core/src/application/
  ports/persistence/query-services/
    subgraph/
      subgraph-query-service.ts                 ← SubgraphQueryService port
      query-models/
        usecase-for-subgraph-read-model.ts      ← UsecaseForSubgraphReadModel
  usecase-designer/
    subgraph/
      query/
        get-all-subgraphs.query.ts              ← GetAllSubgraphsQuery extends BaseQuery
        get-all-subgraphs.handler.ts            ← GetAllSubgraphsHandler
        query-subgraphs.query.ts                ← QuerySubgraphsQuery extends BaseQuery
        query-subgraphs.handler.ts              ← QuerySubgraphsHandler
        get-usecases-for-subgraph.query.ts      ← GetUsecasesForSubgraphQuery extends BaseQuery
        get-usecases-for-subgraph.handler.ts    ← GetUsecasesForSubgraphHandler

packages/infrastructure/persistence/src/.../queries/
  subgraph/
    db-subgraph-query-service.ts                ← DbSubgraphQueryService
                                                   findAll / findMany / getUsecasesForSubgraph
```

### Modified files

```
packages/core/src/application/ports/persistence/query-services/
  usecase/query-models/subgraph-read-model.ts    ← add subgraphId: number, isExported: boolean
  query-services.ts                              ← add subgraphQueryService: SubgraphQueryService

packages/infrastructure/persistence/src/.../queries/
  typeorm-query-services.ts                      ← wire DbSubgraphQueryService

packages/api/src/presentation/rest/modules/subgraph/
  subgraph.controller.ts                         ← replace stubs, inject QueryBus,
                                                    mapToSubgraphDto, mapToUsecaseIdentifierDto
  subgraph.module.ts                             ← add QueryBus provider
```

### No DB changes needed

All required tables already exist: `subgraphs`, `use_cases`, `use_case_subgraphs`, `usecase_gkv_values`, `value_definitions`, `key_definitions`, `use_case_categories`, `use_case_categories_master`, `edit_actions`, `project_sessions`.

---

*End of Document*
