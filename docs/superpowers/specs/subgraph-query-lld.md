<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Subgraph Query APIs — Low-Level Design

## Document Information

- **Version**: 1.1
- **Date**: July 2026
- **Status**: `GET /subgraphs` and `POST /subgraphs/query` are **Implemented**. `GET /subgraphs/{subgraphSystemId}/usecases` remains **Draft / Not implemented** (deferred — see §1.4 note).
- **Endpoints**:
  - `GET  /arc-api/v1/projects/{projectId}/subgraphs` — Implemented
  - `POST /arc-api/v1/projects/{projectId}/subgraphs/query` — Implemented
  - `GET  /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/usecases` — Draft, not implemented
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

| Endpoint | HTTP | Response DTO | Intent | Status |
|---|---|---|---|---|
| `/subgraphs` | GET | `SubgraphDto[]` | All subgraphs in the project file | Implemented |
| `/subgraphs/query` | POST | `SubgraphDto[]` | Subgraphs for given systemIds | Implemented |
| `/subgraphs/{subgraphSystemId}/usecases` | GET | `UsecaseIdentifierDto[]` | Usecases that contain the subgraph | Draft, not implemented |

The first two share the same persistence port (`SubgraphQueryService`), calling `findAll` / `findMany` respectively. The third is a separate query to a different entity and is not built — see §1.4 note.

### 1.2 Functional requirements — GET /subgraphs

#### FR-SGA-01: No body — scoped by projectId only
No request body. Returns all subgraphs whose `file_system_id` matches the resolved project file.

#### FR-SGA-02: projectId resolution
Controller MUST resolve `projectId` to `fileSystemId` via `ProjectQueryService.getFileIdByProjectId`. If not found → `404 Not Found`.

#### FR-SGA-03: `includes` is hardcoded by the handler, not caller-supplied
**As implemented**, `SubgraphController.getAllSubgraphs` takes no `includes` param — there is no query-string/body knob for it. `GetAllSubgraphsHandler` hardcodes `CONFIGURATION_INCLUDES.FullDetails` when calling `subgraphQueryService.findAll`. The controller has no `includes`-parsing logic at all (by design — see §5.2); `SubgraphQueryService.findAll` itself accepts an `includes: ConfigurationIncludes` parameter so the port supports `Summary` (identity fields only, `sgkvs: null`) as well, for future callers that want the lighter query, but today's only caller always requests `FullDetails`.

### 1.3 Functional requirements — POST /subgraphs/query

#### FR-SGQ-01: Request validation — empty systemIds
If `body.systemIds` is absent or empty, `querySubgraphs` still calls through — **as implemented**, `SubgraphQueryService.findMany` treats an empty `systemIds` array as `Result.ok([])` (empty result), not a `400`. Per-entry parse failures (see FR-SGQ-02) are the only client-error path on this endpoint today.

#### FR-SGQ-02: Request validation — invalid systemId format
If any entry cannot be parsed as an integer → `400 Bad Request` (`BadRequestException`, thrown in the controller via `Number.parseInt` + `Number.isNaN` check, radix 10).

#### FR-SGQ-03: Deduplication
Persistence layer deduplicates `systemIds` via `[...new Set(systemIds)]` before querying. Response MUST NOT contain duplicates.

#### FR-SGQ-04: Partial result for unknown IDs
Only subgraphs found are returned. No error raised for unrecognised IDs.

#### FR-SGQ-05: projectId resolution
Same as FR-SGA-02.

#### FR-SGQ-06: Always full detail
`findMany` has no `includes` parameter — it always resolves SGKV key-value pairs. There is no summary-only variant of the by-id lookup.

### 1.4 Functional requirements — GET /subgraphs/{subgraphSystemId}/usecases

> **Not implemented.** This endpoint's design below is retained from the original draft for future reference, but implementation was explicitly deferred/paused. `SubgraphController.getUsecasesForSubgraph` remains a `NotImplementedException` stub. None of §5.5–§5.6, §6.4, or `UsecaseForSubgraphReadModel` (§2.6–§2.8) exist in code today.

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

`SGKV` **is** populated (see §2.3/§2.5 — this reverses the original draft's FR-SH-05, which excluded it). `scenarioType` and `deviceType` were removed from `SubgraphDto` entirely (not merely left unset) — see §8.1.

`UsecaseIdentifierDto.changeInfo` → `undefined` (only relevant once §1.4 is implemented).

### 1.6 Non-functional requirements

**NFR-SG-01:** No N+1 patterns. All entity loading MUST use `IN` clauses or JOINs. SGKV key-value pair resolution is batched per-subgraph via `KeyValueDefQueryService.getKeyValueSummaryForGivenValues` (one call per subgraph, not one per value-def).
**NFR-SG-02:** Maximum 4 DB queries per request for the two implemented endpoints (baseline load, session check, overlay, plus the batched key-value resolution call(s)).

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

### 2.2 SubgraphReadModel — as implemented

`SubgraphDto.id` maps to `subgraphId` (business key), `subGraphSharedType` is derived from `isExported`, and `SGKV` is populated from `sgkvs`. This supersedes the original draft's "current state" / "required update" split (§2.2–2.3 in v1.0) — the fields below are what's in code today.

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   usecase/query-models/subgraph-read-model.ts

export interface SubgraphReadModel {
  readonly systemId:   number;                          // subgraphs.system_id    — internal PK
  readonly subgraphId: number;                           // subgraphs.subgraph_id  — domain/business key
  readonly name:       string;                           // subgraphs.name
  readonly isExported: boolean;                          // subgraphs.is_exported  — drives subGraphSharedType
  readonly sgkvs:      KeyValuePairListReadModel[] | null; // null = summary (not resolved), array = full detail
}
```

`sgkvs: null` signals "not requested" (summary `includes`); `sgkvs: []` means full detail was requested and the subgraph genuinely has no SGKV bins. Today's only caller (`GetAllSubgraphsHandler`) always requests `FullDetails`, so `null` is reachable in the type but not currently observed in a response — see FR-SGA-03.

### 2.3 KeyValuePairListReadModel / KeyValuePairReadModel — shared key-value bin shape

Introduced during implementation to deduplicate what were three near-identical shapes (`SgkvReadModel`, `CkvReadModel`, `TkvReadModel` — the latter two live in the SPF-module tuning read models). `CkvReadModel` was removed entirely; SGKV and CKV bins both use `KeyValuePairListReadModel` directly, and `TkvReadModel extends KeyValuePairListReadModel` with its extra `moduleTagIdMapSystemId` field.

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   usecase/query-models/key-vector-read-model.ts

export interface KeyValuePairReadModel {
  readonly key:   KeyDefinitionSummaryReadModel;
  readonly value: ValueDefinitionSummaryReadModel;
}

export interface KeyValuePairListReadModel {
  readonly systemId:      number;                        // sgkv.system_id (or ckv/tkv equivalent)
  readonly keyValuePairs: readonly KeyValuePairReadModel[];
}
```

### 2.4 Source columns for SubgraphReadModel

| Property | DB table | DB column / resolution | Notes |
|---|---|---|---|
| `systemId` | `subgraphs` | `system_id` | internal PK, unique per file |
| `subgraphId` | `subgraphs` | `subgraph_id` | business key → `SubgraphDto.id` |
| `name` | `subgraphs` | `name` | → `SubgraphDto.name` |
| `isExported` | `subgraphs` | `is_exported` | stored as 0/1 in SQLite; `true` → `SharedType.Exported` |
| `sgkvs` | `sgkv` → `sgkv_values` → `value_definitions` → `key_definitions` | joined + resolved via `KeyValueDefQueryService.getKeyValueSummaryForGivenValues` | `null` in summary mode; array in full-detail mode |

### 2.5 Mapping SubgraphReadModel → SubgraphDto

| `SubgraphReadModel` | `SubgraphDto` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(s.systemId)` |
| `subgraphId: number` | `id: number` | direct |
| `name: string` | `name?: string` | direct |
| `isExported: boolean` | `subGraphSharedType` | `isExported ? SharedType.Exported : SharedType.None` |
| `sgkvs: KeyValuePairListReadModel[] \| null` | `SGKV: KeyValuePairsInfo[]` | `(s.sgkvs ?? []).map(sgkv => mapSgkvToDto(sgkv))` |
| — | `changeInfo` | `undefined` (FR-SH-05) |
| — | `relatedEndPointLinks` | `[]` (FR-SH-05) |

`scenarioType` and `deviceType` are no longer `SubgraphDto` fields at all — removed from the DTO (see §8.1), not merely left unmapped.

### 2.6 UsecaseForSubgraphReadModel — new read model (deferred, not implemented)

> Retained from the original draft for the `/usecases` endpoint, which was explicitly deferred — see §1.4. No code for this exists yet.

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

### 2.7 Source columns for UsecaseForSubgraphReadModel (deferred)

| Property | DB table | DB column / join | Notes |
|---|---|---|---|
| `systemId` | `use_cases` | `system_id` | internal PK |
| `aliasId` | `use_cases` | `alias_id` | numeric alias |
| `alias` | `use_cases` | `alias` | human-readable alias name |
| `categories` | `use_case_categories_master` | `name` via `use_case_categories` join | may be empty |
| `gkv` | `usecase_gkv_values` → `value_definitions` → `key_definitions` | composite JOIN | key + value labels |

Usecases linked to a subgraph are resolved via: `use_case_subgraphs WHERE subgraph_system_id = ?`

### 2.8 Mapping UsecaseForSubgraphReadModel → UsecaseIdentifierDto (deferred)

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

### 3.1 GET /subgraphs — as implemented

```
GET /arc-api/v1/projects/{projectId}/subgraphs

  ──────────────────────────────────────────────────────
  @arc/api  SubgraphController.getAllSubgraphs()
  ──────────────────────────────────────────────────────
  1. Number.parseInt(projectId, 10)
  2. new GetAllSubgraphsQuery(projectId, 'client-id')   // TODO: real clientId from JWT
  3. queryBus.execute(query) → Result<SubgraphReadModel[]>
  4. result.isFailure → throw UnprocessableEntityException  HTTP 422
  5. result.data.map(s → mapToSubgraphDto(s))
  6. return ApiResult<SubgraphDto[]>  HTTP 200 (207 if PartialSuccessInterceptor sees errors)

  ──────────────────────────────────────────────────────
  @arc/core  GetAllSubgraphsHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
  2. subgraphQueryService.findAll(fileSystemId, CONFIGURATION_INCLUDES.FullDetails)
       → Result<SubgraphReadModel[]>   (returned as-is — thin passthrough, no
         includes-parsing in the controller or handler beyond this hardcode)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubgraphQueryService.findAll(fileSystemId, includes)
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Step 1 — baseline load (QueryBuilder), branches on `includes`:
    fullDetails: .leftJoinAndSelect('s.sgkvs', 'sgkv')
                 .leftJoinAndSelect('sgkv.values', 'sgkvVal')
    summary:     .select(['s.systemId', 's.subgraphId', 's.name', 's.isExported'])
    .where('s.fileSystemId = :fileSystemId', {fileSystemId})
    .getMany() → SubgraphRow[]

  Step 2 — overlay, table-wide (not per-aggregate-id — findAll has no fixed
  id list to loop over since it loads every subgraph in the file):
    session = editActionsSvc.findActiveSession(fileSystemId)
    rows = session
      ? applyToCollection(baselineRows,
          editActionsSvc.getEditActionsByTable(session.sessionId, ENTITY_NAMES.Subgraph))
      : baselineRows

  Step 3 — summary short-circuit:
    if includes !== FullDetails → return Result.ok(rows.map(r => ({..., sgkvs: null})))

  Step 4 — fullDetails: buildManySubgraphReadModels(rows, session, fileSystemId)
    → for each row, buildSubgraphReadModel:
        - overlaySgkvRows(row.sgkvs, row.systemId, session) if session active
            (getEditActionsByAggregateId(session.sessionId, row.systemId),
             filtered to tableName === ENTITY_NAMES.Sgkv, then applyToCollection)
        - for each surviving SGKV row: buildSgkvReadModel
            → resolveKeyValuePairs(valueDefIds, fileSystemId)
              via KeyValueDefQueryService.getKeyValueSummaryForGivenValues
              (one batched call per subgraph, not per valueDefId)
    → per-subgraph failures are collected as item errors; if any subgraph's
      build fails, the overall Result is Result.partial(data, itemErrors)
      rather than dropping the whole array — surfaces as HTTP 207 via
      PartialSuccessInterceptor

  ──────────────────────────────────────────────────────
  SQLite via TypeORM DataSource
  ──────────────────────────────────────────────────────
```

**Deviations from the v1.0 draft:** overlay uses `getEditActionsByTable` (table-wide), not a per-id `getEditActionsByAggregateIds` call — that method doesn't exist on `EditActionsQueryService`; the real API is `getEditActionsByAggregateId` (singular, one id at a time). `includes` is a real parameter on the port (not present in v1.0 at all) but is caller-hardcoded to `FullDetails` — see FR-SGA-03.

### 3.2 POST /subgraphs/query — as implemented

```
POST /arc-api/v1/projects/{projectId}/subgraphs/query
  Body: { systemIds: ["10", "11"] }

  ──────────────────────────────────────────────────────
  @arc/api  SubgraphController.querySubgraphs()
  ──────────────────────────────────────────────────────
  1. body.systemIds.map(id => Number.parseInt(id, 10))
       Number.isNaN → throw BadRequestException HTTP 400
  2. Number.parseInt(projectId, 10)
  3. new SubgraphsQuery(systemIds, projectId, 'client-id')
  4. queryBus.execute(query) → Result<SubgraphReadModel[]>
  5. result.isFailure → throw UnprocessableEntityException HTTP 422
  6. result.data.map(s → mapToSubgraphDto(s))
  7. return ApiResult<SubgraphDto[]>  HTTP 200 (207 if partial)

  ──────────────────────────────────────────────────────
  @arc/core  SubgraphsQueryHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
  2. subgraphQueryService.findMany(query.systemIds, fileSystemId)
       → Result<SubgraphReadModel[]>  (returned as-is)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubgraphQueryService.findMany(systemIds, fileSystemId)
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Guard: systemIds.length === 0 → return Result.ok([])   (NOT Result.fail —
    deviates from the v1.0 draft's INVALID_INPUT guard; see FR-SGQ-01)

  Step 1 — deduplicate + baseline load, always full detail (QueryBuilder):
    uniqueIds = [...new Set(systemIds)]
    .leftJoinAndSelect('s.sgkvs', 'sgkv')
    .leftJoinAndSelect('sgkv.values', 'sgkvVal')
    .where('s.systemId IN (:...ids)', {ids: uniqueIds})
    .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
    .getMany() → SubgraphRow[]

  Step 2 — overlay, table-wide (same getEditActionsByTable call as findAll,
  not scoped to uniqueIds — see 3.1's overlay note):
    session = editActionsSvc.findActiveSession(fileSystemId)
    overlaidRows = session
      ? applyToCollection(baselineRows,
          editActionsSvc.getEditActionsByTable(session.sessionId, ENTITY_NAMES.Subgraph))
      : baselineRows

  Step 3 — buildManySubgraphReadModels(overlaidRows, session, fileSystemId)
    — identical per-subgraph SGKV resolution + overlay as findAll's Step 4
```

**Deviations from the v1.0 draft:** empty `systemIds` returns `Result.ok([])`, not `Result.fail(INVALID_INPUT)` — the controller's `BadRequestException` only fires on unparseable entries, not an empty array. `findMany` has no `includes` param at all — always full detail (FR-SGQ-06).

### 3.3 GET /subgraphs/{subgraphSystemId}/usecases (deferred, not implemented)

> Design retained for future reference; `SubgraphController.getUsecasesForSubgraph` is a `NotImplementedException` stub today. See §1.4.

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

**GET /subgraphs (as implemented, fullDetails):**
```
Q1 (always):     SELECT s.*, sgkv.*, sgkv_values.* FROM subgraphs s
                   LEFT JOIN sgkv ON sgkv.subgraph_system_id = s.system_id
                   LEFT JOIN sgkv_values ON sgkv_values.sgkv_system_id = sgkv.system_id
                   WHERE s.file_system_id = ?
Q2 (always):     SELECT * FROM project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q3 (if session): SELECT * FROM edit_actions
                   WHERE session_id = ? AND table_name = 'Subgraph'
                   AND valid_until IS NULL AND change_status = 'STAGED'
Q4 (if session): SELECT * FROM edit_actions   ← per-subgraph, inside buildSubgraphReadModel
                   WHERE session_id = ? AND aggregate_id = ?
                   AND valid_until IS NULL AND change_status = 'STAGED'
                   (filtered in-memory to table_name = 'Sgkv')
Q5+ (per subgraph with SGKVs): key-value pair resolution via
                   KeyValueDefQueryService.getKeyValueSummaryForGivenValues
                   (batched per subgraph, not per value-def — see NFR-SG-01)
```
Summary mode (not currently exercised by any caller) skips the SGKV joins in Q1, uses the table-wide `getEditActionsByTable` overlay only (no Q4/Q5), and returns `sgkvs: null`.

**POST /subgraphs/query (as implemented — always full detail):**
```
Q1 (always):     SELECT s.*, sgkv.*, sgkv_values.* FROM subgraphs s
                   LEFT JOIN sgkv ON sgkv.subgraph_system_id = s.system_id
                   LEFT JOIN sgkv_values ON sgkv_values.sgkv_system_id = sgkv.system_id
                   WHERE s.system_id IN (?) AND s.file_system_id = ?
Q2 (always):     SELECT * FROM project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q3 (if session): SELECT * FROM edit_actions
                   WHERE session_id = ? AND table_name = 'Subgraph'
                   AND valid_until IS NULL AND change_status = 'STAGED'
Q4 (if session): per-subgraph SGKV overlay — same as GET /subgraphs Q4
Q5+:             per-subgraph key-value resolution — same as GET /subgraphs Q5
```
Empty `systemIds` short-circuits before Q1 (`Result.ok([])`).

**GET /subgraphs/{id}/usecases (deferred, not implemented):**
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

### 4.1 Two overlay call shapes actually used

`EditActionsQueryService` has no `getEditActionsByAggregateIds` (plural) method — that was a v1.0 draft assumption. The real API offers two shapes, and `DbSubgraphQueryService` uses both:

**Table-wide (subgraph row overlay in `findAll`/`findMany`):**
```typescript
const session = await this.editActionsSvc.findActiveSession(fileSystemId);
const rows = session
  ? applyToCollection(
      baselineRows,
      await this.editActionsSvc.getEditActionsByTable(session.sessionId, ENTITY_NAMES.Subgraph),
    )
  : baselineRows;
```
Table-wide because `findAll` loads every subgraph in the file — there's no fixed id list to scope an aggregate-id query by. `findMany` reuses the same table-wide call rather than scoping to `uniqueIds`, since the same method is shared via `buildManySubgraphReadModels`.

**Per-aggregate (SGKV bin overlay, inside `buildSubgraphReadModel`):**
```typescript
private async overlaySgkvRows(
  rows: SgkvRow[],
  subgraphSystemId: number,
  session: ProjectSessionRow,
): Promise<SgkvRow[]> {
  const actions = await this.editActionsSvc.getEditActionsByAggregateId(
    session.sessionId,
    subgraphSystemId,
  );
  const sgkvActions = actions.filter(a => a.tableName === ENTITY_NAMES.Sgkv);
  return sgkvActions.length > 0 ? applyToCollection(rows, sgkvActions) : rows;
}
```
Per-aggregate here because SGKV bins are scoped to one parent subgraph at a time — mirrors `overlayCkvRows` in `DbSpfTuningConfigService`. The key/value pairs inside each surviving SGKV bin are resolved separately via `KeyValueDefQueryService.getKeyValueSummaryForGivenValues`, which reflects value-definition renames/deletions directly from the definitions tables (no additional edit-action overlay needed there — see original design note in the requirements discussion: "we know the value, from there we get the keys; if the values are deleted or the key is modified, that's what we need to check — if we're doing it in overlay we're good").

### 4.2 Tables overlaid

| Table | Overlay call | Changes applied | Endpoint |
|---|---|---|---|
| `subgraphs` | `getEditActionsByTable(sessionId, 'Subgraph')` | `name`, `is_exported` UPDATE; DELETE; CREATE | GET /subgraphs, POST /query |
| `sgkv` | `getEditActionsByAggregateId(sessionId, subgraphSystemId)` filtered to `tableName === 'Sgkv'` | SGKV bin UPDATE/DELETE/CREATE at the subgraph level | GET /subgraphs, POST /query (fullDetails only) |
| `use_cases` | *(deferred — not implemented)* | `alias` UPDATE; DELETE; CREATE | GET /usecases |

`subgraph_property_data` is **not** overlaid by these endpoints.

### 4.3 Effect of each draft operation

| `edit_actions.operation` | Effect |
|---|---|
| `DELETE` | Row removed — entity absent from response |
| `UPDATE` | JSON `payload` fields merged onto baseline row |
| `CREATE` | Row injected — staged entity visible in response |

### 4.4 STAGED vs UNSTAGED

Both `getEditActionsByTable` and `getEditActionsByAggregateId` enforce `change_status = 'STAGED'` and `valid_until IS NULL`. UNSTAGED drafts are never visible (FR-SH-04).

---

## 5. CQRS — Queries and Handlers

### 5.1 GetAllSubgraphsQuery

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   get-all-subgraphs.query.ts

export class GetAllSubgraphsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

No `includes` field — see FR-SGA-03; the handler hardcodes it.

### 5.2 GetAllSubgraphsHandler

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   get-all-subgraphs.handler.ts

export class GetAllSubgraphsHandler implements QueryHandler<
  GetAllSubgraphsQuery,
  Promise<Result<SubgraphReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubgraphsQuery,
  ): Promise<Result<SubgraphReadModel[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.subgraphQueryService.findAll(
      fileSystemId,
      CONFIGURATION_INCLUDES.FullDetails,
    );
  }
}
```

Thinner than the v1.0 draft — no `isFailure`/re-wrap step, the port's `Result` (success, failure, or partial) is passed straight through.

### 5.3 SubgraphsQuery

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   subgraphs.query.ts

export class SubgraphsQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

Named `SubgraphsQuery`, not `QuerySubgraphsQuery` as in the v1.0 draft — matches `ContainerQuery`'s naming convention (entity name + `Query`, not verb-first).

### 5.4 SubgraphsQueryHandler

```typescript
// packages/core/src/application/usecase-designer/subgraph/query/
//   subgraphs.handler.ts

export class SubgraphsQueryHandler implements QueryHandler<
  SubgraphsQuery,
  Promise<Result<SubgraphReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: SubgraphsQuery): Promise<Result<SubgraphReadModel[]>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.subgraphQueryService.findMany(
      query.systemIds,
      fileSystemId,
    );
  }
}
```

### 5.5 GetUsecasesForSubgraphQuery (deferred, not implemented)

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

### 5.6 GetUsecasesForSubgraphHandler (deferred, not implemented)

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
//   subgraph/subgraph-query-service.ts

export interface SubgraphQueryService {
  /**
   * Returns every SubgraphReadModel for the given fileSystemId. Overlay
   * always applied — no applyOverlay flag (FR-SH-01).
   *
   * summary (default) → identity fields only, sgkvs: null
   * fullDetails       → summary + sgkvs resolved (same per-subgraph build as findMany)
   */
  findAll(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SubgraphReadModel[]>>;

  /**
   * Returns SubgraphReadModel[] for the given systemIds, with SGKVs resolved
   * (full detail — the query-by-id path is the one callers use to inspect a
   * specific subgraph's key-value data). Overlay always applied — no
   * applyOverlay flag (FR-SH-01). Unknown systemIds are silently omitted —
   * partial result (FR-SGQ-04).
   */
  findMany(
    systemIds:    number[],
    fileSystemId: number,
  ): Promise<Result<SubgraphReadModel[]>>;
}
```

`getUsecasesForSubgraph` is **not** on this interface — deferred along with §1.4/§5.5/§5.6.

### 6.2 Implementation — findAll

```typescript
async findAll(
  fileSystemId: number,
  includes: ConfigurationIncludes,
): Promise<Result<SubgraphReadModel[]>> {
  try {
    // Step 1 — baseline load, all subgraphs scoped to this file.
    // fullDetails joins sgkv + sgkv.values (valueDefIds needed for
    // key-value pairs); summary selects identity fields only.
    let qb = this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.fileSystemId = :fileSystemId', {fileSystemId});

    qb =
      includes === CONFIGURATION_INCLUDES.FullDetails
        ? qb
            .leftJoinAndSelect('s.sgkvs', 'sgkv')
            .leftJoinAndSelect('sgkv.values', 'sgkvVal')
        : qb.select(['s.systemId', 's.subgraphId', 's.name', 's.isExported']);

    const baselineRows = (await qb.getMany()) as SubgraphRow[];

    // Step 2 — Overlay: table-wide query, not one call per subgraph — this
    // loads ALL subgraphs so there's no fixed id list to scope by
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const rows = session
      ? applyToCollection(
          baselineRows,
          await this.editActionsSvc.getEditActionsByTable(
            session.sessionId,
            ENTITY_NAMES.Subgraph,
          ),
        )
      : baselineRows;

    // Step 3 — summary: sgkvs deferred; fullDetails: resolve per subgraph
    if (includes !== CONFIGURATION_INCLUDES.FullDetails) {
      return Result.ok(
        rows.map(
          r =>
            ({
              systemId: r.systemId,
              subgraphId: r.subgraphId,
              name: r.name,
              isExported: Boolean(r.isExported),
              sgkvs: null,
            }) satisfies SubgraphReadModel,
        ),
      );
    }

    return this.buildManySubgraphReadModels(rows, session, fileSystemId);
  } catch (error) {
    return Result.fail({
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        error instanceof Error ? error.message : 'Failed to query subgraphs',
    });
  }
}
```

### 6.3 Implementation — findMany

```typescript
async findMany(
  systemIds: number[],
  fileSystemId: number,
): Promise<Result<SubgraphReadModel[]>> {
  try {
    if (systemIds.length === 0) return Result.ok([]);

    const uniqueIds = [...new Set(systemIds)];

    // Step 1 — baseline load: subgraph + sgkv + sgkv_values (valueDefIds needed for key-value pairs)
    const baselineRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.sgkvs', 'sgkv')
      .leftJoinAndSelect('sgkv.values', 'sgkvVal')
      .where('s.systemId IN (:...ids)', {ids: uniqueIds})
      .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as SubgraphRow[];

    // Step 2 — Overlay at table level (shares the same call as findAll —
    // not scoped to uniqueIds, since buildManySubgraphReadModels is shared)
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const overlaidRows = session
      ? applyToCollection(
          baselineRows,
          await this.editActionsSvc.getEditActionsByTable(
            session.sessionId,
            ENTITY_NAMES.Subgraph,
          ),
        )
      : baselineRows;

    return this.buildManySubgraphReadModels(
      overlaidRows,
      session,
      fileSystemId,
    );
  } catch (error) {
    return Result.fail({
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        error instanceof Error ? error.message : 'Failed to query subgraphs',
    });
  }
}
```

Deviates from the v1.0 draft: empty `systemIds` short-circuits to `Result.ok([])`, not `Result.fail(INVALID_INPUT)` (FR-SGQ-01).

### 6.3.1 Shared assembly — buildManySubgraphReadModels / buildSubgraphReadModel

```typescript
/**
 * Builds SubgraphReadModel[] for a batch of subgraph rows — shared by
 * findAll(fullDetails) and findMany. Each subgraph builds independently —
 * a thrown exception, or a Result.fail from buildSubgraphReadModel, is
 * captured as an error for that subgraph and processing continues for the
 * rest. If any subgraph failed, the Result is partial (isSuccess=true,
 * errors non-empty) rather than dropping the whole array.
 */
private async buildManySubgraphReadModels(
  rows: SubgraphRow[],
  session: ProjectSessionRow | null,
  fileSystemId: number,
): Promise<Result<SubgraphReadModel[]>> {
  const itemErrors: AppError[] = [];
  const results = await Promise.all(
    rows.map(async row => {
      try {
        const result = await this.buildSubgraphReadModel(row, session, fileSystemId);
        if (result.isFailure) {
          itemErrors.push(...result.errors);
          return null;
        }
        itemErrors.push(...result.errors);
        return result.data;
      } catch (error) {
        itemErrors.push({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Subgraph ${row.systemId} failed to build: ${error instanceof Error ? error.message : String(error)}`,
        });
        return null;
      }
    }),
  );

  const data = results.filter((r): r is SubgraphReadModel => r !== null);
  return itemErrors.length > 0 ? Result.partial(data, itemErrors) : Result.ok(data);
}

/**
 * Builds SubgraphReadModel — overlays SGKV bin rows at the subgraph
 * aggregate level (catches a staged CREATE/UPDATE/DELETE of a whole SGKV
 * bin — the key/value pairs inside each surviving bin are separately
 * overlaid by resolveKeyValuePairs via KeyValueDefQueryService), then
 * delegates key-value pair resolution to
 * KeyValueDefQueryService.getKeyValueSummaryForGivenValues in one batched
 * call per subgraph, instead of one call per valueDefId (N+1).
 */
private async buildSubgraphReadModel(
  row: SubgraphRow,
  session: ProjectSessionRow | null,
  fileSystemId: number,
): Promise<Result<SubgraphReadModel>> {
  const baseSgkvRows = row.sgkvs ?? [];
  const overlaidSgkvRows = session
    ? await this.overlaySgkvRows(baseSgkvRows, row.systemId, session)
    : baseSgkvRows;

  const itemErrors: AppError[] = [];
  const sgkvs: KeyValuePairListReadModel[] = [];
  for (const sgkvRow of overlaidSgkvRows) {
    const result = await this.buildSgkvReadModel(sgkvRow, fileSystemId);
    if (result.isFailure) {
      itemErrors.push(...result.errors);
      continue;
    }
    itemErrors.push(...result.errors);
    sgkvs.push(result.data);
  }

  const model: SubgraphReadModel = {
    systemId: row.systemId,
    subgraphId: row.subgraphId,
    name: row.name,
    isExported: Boolean(row.isExported),
    sgkvs,
  };

  return itemErrors.length > 0 ? Result.partial(model, itemErrors) : Result.ok(model);
}
```

See §4.1 for `overlaySgkvRows` (per-aggregate SGKV overlay) and §6.3.2 for `buildSgkvReadModel`/`resolveKeyValuePairs`.

### 6.3.2 Key-value resolution — buildSgkvReadModel / resolveKeyValuePairs

```typescript
/**
 * Builds a key-value bin read model for one SGKV — same batched key-value
 * resolution pattern as buildCkvReadModel/buildTkvReadModel in
 * DbSpfTuningConfigService.
 */
private async buildSgkvReadModel(
  row: SgkvRow,
  fileSystemId: number,
): Promise<Result<KeyValuePairListReadModel>> {
  const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
  const pairsResult = await this.resolveKeyValuePairs(valueDefIds, fileSystemId);
  if (pairsResult.isFailure)
    return Result.fail<KeyValuePairListReadModel>(...pairsResult.errors);

  const model: KeyValuePairListReadModel = {
    systemId: row.systemId,
    keyValuePairs: pairsResult.data,
  };
  return pairsResult.errors.length > 0
    ? Result.partial(model, pairsResult.errors)
    : Result.ok(model);
}

private async resolveKeyValuePairs(
  valueDefIds: number[],
  fileSystemId: number,
): Promise<Result<KeyValuePairReadModel[]>> {
  return this.keyValueDefSvc.getKeyValueSummaryForGivenValues(valueDefIds, fileSystemId);
}
```

`resolveKeyValuePairs` reads key/value labels straight from `value_definitions`/`key_definitions` — a deleted value or renamed key is reflected here directly, no separate edit-action overlay needed on the key-value tables themselves (only the SGKV *bin* row is overlaid, per §4.1).

### 6.4 Implementation — getUsecasesForSubgraph (deferred, not implemented)

> Retained from the v1.0 draft; no code for this exists. See §1.4.

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
| Empty `systemIds` (findMany) | `Result.ok([])` before any DB query — **not** `Result.fail(INVALID_INPUT)` as drafted in v1.0 (FR-SGQ-01) |
| DB error on any query | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| systemId not in DB (findMany/findAll) | Partial result — silently omitted (FR-SGQ-04) |
| Per-subgraph SGKV/key-value build failure | Collected as an item error; that subgraph is dropped from `data`, others still returned — overall `Result.partial(data, itemErrors)` (§6.3.1) |
| Subgraph not found (getUsecasesForSubgraph) | *(deferred — not implemented)* would be `Result.fail(ENTITY_NOT_FOUND)` → HTTP 404 |

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
// packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts

import {DbSubgraphQueryService} from './subgraph/db-subgraph-query-service.js';

export class DbQueryServices implements QueryServices {
  readonly subgraphQueryService: SubgraphQueryService;

  constructor(dataSource: DataSource, logger?: Logger) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);
    // ... existing construction unchanged ...

    this.subgraphQueryService = new DbSubgraphQueryService(
      dataSource,
      editActionsQueryService,
      this.keyValueDefQueryService,
    );
  }
}
```

`DbSubgraphQueryService` takes a third constructor argument — `keyValueDefQueryService` — not present in the v1.0 draft, needed for SGKV key-value pair resolution (§6.3.2).

### 7.3 Register handlers in QueryHandlerRegistry

```typescript
// packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts

this.queryHandlerFactories.set(GetAllSubgraphsQuery, {
  create: (deps: QueryHandlerDependencies) =>
    new GetAllSubgraphsHandler(deps.queryServices),
});

this.queryHandlerFactories.set(SubgraphsQuery, {
  create: (deps: QueryHandlerDependencies) =>
    new SubgraphsQueryHandler(deps.queryServices),
});
```

Registered against `QueryHandlerRegistry.queryHandlerFactories` (a `Map`), not a `queryBus.register(...)` call as drafted in v1.0 — matches the registry pattern used for `ContainerQuery`/`SpfModulesQuery`. `GetUsecasesForSubgraphQuery` is not registered — deferred (§1.4).

---

## 8. DTO Mapping

### SubgraphReadModel → SubgraphDto (as implemented)

```typescript
// packages/api/src/presentation/rest/modules/subgraph/subgraph.controller.ts

private mapToSubgraphDto(s: SubgraphReadModel): SubgraphDto {
  const dto = new SubgraphDto(String(s.systemId), s.subgraphId);
  dto.name = s.name;
  dto.subGraphSharedType = s.isExported
    ? SharedType.Exported
    : SharedType.None;
  dto.SGKV = (s.sgkvs ?? []).map(sgkv => this.mapSgkvToDto(sgkv));
  dto.changeInfo = undefined;
  return dto;
}

private mapSgkvToDto(sgkv: KeyValuePairListReadModel): KeyValuePairsInfo {
  const keyValueCollection = (sgkv.keyValuePairs ?? [])
    .filter(kv => kv?.key && kv?.value)
    .map(
      kv =>
        new KeyValueInfo(
          new KeyInfo(kv.key.keyId, kv.key.name, String(kv.key.systemId)),
          new ValueInfo(kv.value.valueId, kv.value.name, String(kv.value.systemId)),
        ),
    );
  const dto = new KeyValuePairsInfo(keyValueCollection);
  dto.systemId = String(sgkv.systemId);
  return dto;
}
```

Reverses the v1.0 draft's `dto.SGKV = []` (FR-SH-05 excluded SGKV) — SGKV is now populated (§1.5/FR-SH-05 updated), and `s.sgkvs ?? []` null-guards the summary case where `sgkvs` is `null`.

### UsecaseForSubgraphReadModel → UsecaseIdentifierDto (deferred, not implemented)

> Retained from the v1.0 draft; no code for this exists — see §1.4.

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

### New files (implemented)

```
packages/core/src/application/
  ports/persistence/query-services/
    subgraph/
      subgraph-query-service.ts                 ← SubgraphQueryService port (findAll, findMany)
  usecase-designer/
    subgraph/
      query/
        get-all-subgraphs.query.ts              ← GetAllSubgraphsQuery extends BaseQuery
        get-all-subgraphs.handler.ts            ← GetAllSubgraphsHandler
        subgraphs.query.ts                      ← SubgraphsQuery extends BaseQuery
        subgraphs.handler.ts                    ← SubgraphsQueryHandler

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/
  subgraph/
    db-subgraph-query-service.ts                ← DbSubgraphQueryService
                                                   findAll / findMany (SGKV resolution + overlay)
```

### New files (deferred — not implemented, retained from v1.0 draft)

```
packages/core/src/application/
  ports/persistence/query-services/
    subgraph/
      query-models/
        usecase-for-subgraph-read-model.ts      ← UsecaseForSubgraphReadModel
  usecase-designer/
    subgraph/
      query/
        get-usecases-for-subgraph.query.ts      ← GetUsecasesForSubgraphQuery extends BaseQuery
        get-usecases-for-subgraph.handler.ts    ← GetUsecasesForSubgraphHandler
```

### Modified files (implemented)

```
packages/core/src/application/ports/persistence/query-services/
  usecase/query-models/subgraph-read-model.ts    ← add subgraphId, isExported, sgkvs (§2.2)
  usecase/query-models/key-vector-read-model.ts   ← KeyValuePairListReadModel / KeyValuePairReadModel (§2.3)
  query-services.ts                              ← add subgraphQueryService: SubgraphQueryService
  spf-module/tuning/tuning-config-read-model.ts   ← CkvReadModel removed; TkvReadModel extends KeyValuePairListReadModel
  spf-module/tuning/spf-tuning-config-service.ts  ← getModuleCkvs returns KeyValuePairListReadModel[]
  orchestration/cqrs/registries/query-handler-registry.ts ← register GetAllSubgraphsQuery, SubgraphsQuery

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
  entity-schema/entity-table-names.ts            ← add Sgkv, SgkvValues
  queries/typeorm-query-services.ts              ← wire DbSubgraphQueryService (3-arg constructor)
  queries/spf-module/db-spf-tuning-config-service.ts ← KeyValuePairListReadModel throughout
  queries/usecase/usecase-query-mappers.ts        ← subgraph.sgkvs: [] in module-mapping path

packages/api/src/presentation/rest/modules/
  subgraph/subgraph.controller.ts                ← replace stubs, inject QueryBus,
                                                     mapToSubgraphDto, mapSgkvToDto
  subgraph/subgraph.module.ts                    ← import ArcCqrsModule
  subgraph/dto/subgraph.dto.ts                   ← remove scenarioType, deviceType
  spf-module/spf-module.controller.ts            ← CkvReadModel → KeyValuePairListReadModel
```

### No DB changes needed

All required tables already exist: `subgraphs`, `sgkv`, `sgkv_values`, `value_definitions`, `key_definitions`, `edit_actions`, `project_sessions`. (`use_cases`, `use_case_subgraphs`, `usecase_gkv_values`, `use_case_categories`, `use_case_categories_master` are needed only for the deferred `/usecases` endpoint.)

---

*End of Document*
