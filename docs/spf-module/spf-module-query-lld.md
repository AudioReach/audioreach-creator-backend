<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# SPF Module Query APIs — Low-Level Design

## Document Information

- **Version**: 9.1
- **Date**: August 2026
- **Status**: Current
- **Endpoints**:
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query?include=ckvs,tags`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules`
- **Related Documents**:
  - `edit-session-persistence-design.md` — Edit session overlay pattern
  - `decomposed-query-services.md` — Category service decomposition design
  - `container-query-lld.md` — Container query reference design

---

## Table of Contents

1. [Core Design Principles](#1-core-design-principles)
2. [Result\<T\> Error Handling Pattern](#2-resultt-error-handling-pattern)
3. [Architecture Overview](#3-architecture-overview)
4. [Complete Call Flow](#4-complete-call-flow)
5. [Read Model Hierarchy](#5-read-model-hierarchy)
6. [Session Overlay](#6-session-overlay)
7. [Handler and Query Classes](#7-handler-and-query-classes)
8. [Persistence Layer — DbSpfModuleQueryService](#8-persistence-layer--dbspfmodulequeryservice)
9. [Persistence Layer — DbNodeQueryService](#9-persistence-layer--dbnodequeryservice)
10. [Persistence Layer — DbSpfTuningConfigService](#10-persistence-layer--dbspftuningconfigservice)
11. [Persistence Layer — DbKeyValueDefQueryService](#11-persistence-layer--dbkeyvaluedefqueryservice)
12. [Persistence Layer Wiring](#12-persistence-layer-wiring)
13. [Folder Structure](#13-folder-structure)

---

## 1. Core Design Principles

### 1.1 One handler per user intent

A handler is created for each distinct **user intent**. Same intent with optional depth → one handler with flags. Different primary entity or error conditions → separate handlers.

```
Same intent → one handler with flags:
  POST /spf-modules/query                    ← base module fields
  POST /spf-modules/query?include=ckvs,tags  ← same intent, tuning data added

Different intent → separate handlers:
  POST /spf-modules/query   → SpfModuleQueryHandler
  POST /spf-modules         → CreateSpfModuleHandler
```

### 1.2 Category services are the reuse boundary

Handlers call coordinator services, which delegate to focused category services. Each category service owns one set of DB tables and is reused across every API that needs that data. See `decomposed-query-services.md` for the full design.

```
NodeQueryService         → getDataPorts, getControlPorts (any node type)
SpfModuleQueryService    → getSpfModule, getSpfModules + sub-services
SpfTuningConfigService   → getModuleCkvs, getModuleCkvParams, getModuleTags
KeyValueDefQueryService  → getKeyValueDefinitionForGivenValue(s), getByKeyDefinition
  (owns arc_values + arc_keys — reused by CKV, TKV, and future GKV/usecase paths)
```

### 1.3 Every query method returns `Result<T>`

Every public method on every query service port returns `Result<T>`. Private helpers throw — the calling method's `try/catch` converts thrown exceptions to `Result.fail` (request-level failure) or, for batch methods, isolates a single item's exception per-item and returns `Result.partial` (item-level failure — see §2).

### 1.4 Three-tier overlay at persistence layer

Overlay is applied entirely at `@arc/persistence`. Read models carry only entity data — no change state propagates upward. Overlay is always applied — there is no `applyOverlay` flag; every service consults the active edit session on every call. Definition tables are overlaid the same way as instance tables since definitions can be modified within a session.

Module instance overlay (nodes + spf_modules) is applied via `ModuleNodeOverlayFetcher.applyToModuleNodes()` — a dedicated batch fetcher that loads scalar Base rows (no TypeORM relation joins) and applies `OverlayMergeImpl` directly. This replaced the deprecated `applyToCollection` compat shim and the redundant `loadSpfModuleTableData` second-pass overlay that previously existed alongside it.

### 1.5 Batched overlay to avoid N+1

Any method that resolves N related aggregates (e.g. N valueDefSystemIds for one CKV, N TKVs for one tag) must resolve them with a **bounded number of DB queries**, not one query per item:
- `getKeyValueDefinitionForGivenValues([...ids])` — two queries total regardless of how many ids are requested: one `WHERE systemId IN (...)` query to resolve the requested ids to their distinct parent key ids, one `WHERE keySystemId IN (...)` query to load every value under those keys — plus the two `getEditActionsByTable` calls (ValueDefinition + KeyDefinition) from `applyBatchOverlay`, invoked once per query.
- `overlayTkvRows(rows, tagMapId, session)` — one `getEditActionsByAggregateId` call overlays every TKV under one tag map, instead of one call per TKV.

### 1.6 Batch item isolation — `Result.partial`

Any method that builds an **array of independent items** must isolate each item's build in its own `try/catch`. A thrown exception for one item is captured as an `Error` entry naming that item, the item is dropped from the result array, and processing continues for the rest. The method returns:
- `Result.ok(data)` — every item built successfully.
- `Result.partial(data, errors)` — some items succeeded, some failed; `isSuccess: true`, `errors` non-empty, data contains only the successful items.
- `Result.fail(...)` — the request itself could not proceed at all (e.g. the initial query threw before any item was even loaded).

This is the general pattern for `getModuleCkvs` (per-CKV isolation) and `getModuleTags` (per-tag, and per-TKV within a tag, isolation) — see §10.

### 1.7 Port names resolved from definition tables

`data_ports.name` and `control_ports.name` are synthetic at import time. Authoritative names come from:
- Data ports: `data_port_definitions.name` matched by `dataPortId`
- Control ports: `static_control_port_definitions.portName` matched by `portId`
- Intents: `static_intent_definitions.name` matched by `intentId`

For subsystem nodes (no definition), instance names are used as fallback.

---

## 2. Result\<T\> Error Handling Pattern

### The `Result<T>` class

```typescript
// packages/core/src/application/shared/Result/operation-result.ts

export type Error   = { code?: string; message: string; };
export type Warning = { code?: string; message: string; };

export class Result<T> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _data?: T,
    public readonly errors:   Error[]   = [],
    public readonly warnings: Warning[] = [],
  ) {}

  static ok<T>(data: T, warnings: Warning[] = []): Result<T>

  /**
   * Partial success — usable data was produced, but some individual items
   * in a batch failed independently. isSuccess is true, errors is non-empty.
   * Distinct from Result.ok (no errors) and Result.fail (no data at all).
   */
  static partial<T>(data: T, errors: Error[]): Result<T>

  static fail<T>(...errors: Error[]): Result<T>

  get isFailure(): boolean
  get isComplete(): boolean   // isSuccess && errors.length === 0
  get data(): T   // throws if isFailure — access only after checking isSuccess
}
```

### Three outcomes, not two

| Outcome | `isSuccess` | `errors` | `data` accessible | Meaning |
|---|---|---|---|---|
| `Result.ok(data)` | `true` | `[]` | yes | Everything succeeded |
| `Result.partial(data, errors)` | `true` | non-empty | yes | Some batch items failed; `data` holds the successful ones |
| `Result.fail(...errors)` | `false` | non-empty | throws | The request itself failed — no usable data |

`Result.ok()` never carries `errors` — a clean success and a partial success are always distinguishable by inspecting `errors.length` (or the `isComplete` getter), never by convention alone.

### Error codes

`ERROR_CODES` from `packages/core/src/shared/errors/error-codes.ts`:

| Code | Range | Used for |
|---|---|---|
| `INVALID_INPUT` | `ERR_1004` | Empty systemIds, invalid format |
| `ENTITY_NOT_FOUND` | `ERR_4004` | Module/definition not found in DB |
| `INTERNAL_ERROR` | `ERR_9001` | DB errors, unexpected exceptions |

### How Result propagates through layers

```
@arc/persistence  →  @arc/core handler  →  @arc/api controller

DbSpfTuningConfigService.getModuleCkvs()   SpfModuleQueryHandler.handle()   SpfModuleController.querySpfModules()
  Result<CkvReadModel[]>            ──►     Result<SpfModuleDetailedReadModel> ──►  ApiResult<SpfModuleDto[]>
  isFailure   → whole call failed            per-module Result kept in a Map        per-Result isSuccess check
  isPartial   → some CKVs failed, rest kept  merged into ckvsByModule/tagsByModule   before mapping to DTO fields
  isSuccess   → all CKVs built
```

### Fatal errors vs per-item failures

| Scenario | Treatment | Effect |
|---|---|---|
| Empty `systemIds` | `Result.fail(INVALID_INPUT)` | HTTP 400 — stops immediately |
| DB error loading module roots | `Result.fail(INTERNAL_ERROR)` | HTTP 422 — stops immediately |
| Definition load failed for one module | `Result.fail` → collected as fatal | HTTP 422 |
| One CKV's key-value resolution throws | `Result.partial` from `getModuleCkvs` — that CKV dropped, others kept | HTTP 200, module included with partial CKVs |
| One TKV under a tag fails to build | `Result.partial` from `buildTagTkvReadModels`, merged into `getModuleTags`'s own errors | HTTP 200, tag included with remaining TKVs |
| Module not found (`getSpfModule`) | `Result.fail(ENTITY_NOT_FOUND)` | Caller (core handler) decides how to surface |

### Infrastructure → Core → Middleware error propagation

Infrastructure never throws domain exceptions. Every method returns `Result<T>`. The core handler is the only layer that decides whether a `Result.fail` becomes an HTTP error code.

**Rule**: infrastructure emits `Result.fail` with structured `Issue` objects. The handler reads all issues and throws a domain exception carrying them. The `AllExceptionsFilter` maps the exception type to an HTTP status code and surfaces all issues in the response body.

**Flow for a single-item lookup (`getSpfModule`)**

```
DbSpfModuleQueryService.getSpfModule()
  getSpfModules([id]) → Result.fail({code: ENTITY_NOT_FOUND, message: '...', severity: 'ERROR'})
  ↓ returns Result.fail(...issues)  — never throws

GetCkvCalibrationDataHandler.handle()
  const result = await spfModuleQueryService.getSpfModule(id, fileId)
  if (result.kind === RESULT_KIND.Fail) {
    throw new ResourceNotFoundException('SpfModule X not found', result.issues)
    // constructor formats message as:
    // "SpfModule X not found:\n1. <issue1.message>\n2. <issue2.message>"
  }
  const spfModule = result.data   // TypeScript: data only accessible after FAIL guard

AllExceptionsFilter.catch()
  ResourceNotFoundException instanceof DomainException
  → status: 404  (from DOMAIN_STATUS_MAP)
  → issues: exception.issues  (surfaced in response body — all issues listed)
```

**HTTP 404 response when multiple issues are present**

```json
{
  "statusCode": 404,
  "errorCode": "RESOURCE_NOT_FOUND",
  "message": "SpfModule 99 not found:\n1. capability data missing\n2. port query failed",
  "issues": [
    {"code": "ERR_4004", "message": "capability data missing", "severity": "ERROR"},
    {"code": "ERR_9001", "message": "port query failed",       "severity": "ERROR"}
  ]
}
```

**`DomainException` base — issues field**

```typescript
// packages/core/src/shared/exceptions/domain-exception.ts
abstract class DomainException extends Error {
  readonly details?: unknown;
  readonly issues?: readonly Issue[];

  constructor(message: string, details?: unknown, issues?: readonly Issue[]) {
    // When issues are present, message is auto-formatted:
    // "<message>:\n1. <issue1.message>\n2. <issue2.message>"
    const formattedMessage =
      issues?.length
        ? `${message}:\n${issues.map((i, n) => `${n + 1}. ${i.message}`).join('\n')}`
        : message;
    super(formattedMessage);
    this.details = details;
    this.issues  = issues;
  }
}
```

All `DomainException` subclasses inherit the formatting. `ResourceNotFoundException` exposes two constructor overloads: `(message)` for callers with no issues, `(message, issues)` for callers forwarding a `Result.fail`.

**`AllExceptionsFilter` — issues surfaced for all `DomainException`**

Before this change the `DomainException` branch hardcoded `issues: undefined` — only `DomainRuleViolationException` (422) surfaced issues. Now the branch reads `exception.issues` so every domain exception (404, 400, 501, etc.) can carry and expose its diagnostic list.

```typescript
// DomainRuleViolationException branch — unchanged, checked first
if (exception instanceof DomainRuleViolationException) { ... issues: exception.issues ... }

// DomainException branch — updated
if (exception instanceof DomainException) {
  return {
    status: DOMAIN_STATUS_MAP.get(...) ?? 500,
    errorCode: exception.errorCode,
    details: exception.details,
    issues: exception.issues as Issue[] | undefined,  // ← was hardcoded undefined
  };
}
```

---

## 3. Architecture Overview

```
POST /arc-api/v1/projects/{projectId}/spf-modules/query
  Body:  { systemIds: ["8388613", "8388614"] }
  Query: ?include=ckvs,tags  (optional)

  ──────────────────────────────────────────────────────────────
  @arc/api  SpfModuleController.querySpfModules()
  ──────────────────────────────────────────────────────────────
  1. Parse ?include= → Set; includeCkvs = has('ckvs'), includeTags = has('tags')
  2. Parse systemIds string[] → number[] — reject NaN → HTTP 400
  3. Construct SpfModulesQuery(systemIds, projectId, includeCkvs, includeTags, clientId)
  4. queryBus.execute(query) → Result<SpfModuleDetailedReadModel>
  5. result.isFailure → throw UnprocessableEntityException (HTTP 422)
  6. result.data.modules.map(m → mapToSpfModuleDto(m, ckvsByModule?.get(m.systemId), tagsByModule?.get(m.systemId)))
     mapToSpfModuleDto only sets dto.ckvs/dto.tags when the per-module Result.isSuccess is true
  7. Return ApiResult<SpfModuleDto[]> HTTP 200

  ──────────────────────────────────────────────────────────────
  @arc/core  SpfModuleQueryHandler.handle()
  ──────────────────────────────────────────────────────────────
  1. ProjectQueryService.getFileIdByProjectId(projectId) → fileSystemId
  2. SpfModuleQueryService.findMany(systemIds, fileSystemId)
       → Result<SpfModuleReadModel[]>
       isFailure → return Result.fail (fatal)
  3. If includeCkvs || includeTags:
       loadCkvsForModules / loadTagsForModules — one call per module per concern, in parallel
         SpfTuningConfigService.getModuleCkvs(m.systemId, fileSystemId)
         SpfTuningConfigService.getModuleTags(m.systemId, fileSystemId, CONFIGURATION_INCLUDES.Summary)
       Each module's Result (ok/partial/fail) is kept as-is in ckvsByModule/tagsByModule —
       never collapsed into a shared warnings/errors array on the outer Result.
  4. return Result.ok({ modules, ckvsByModule?, tagsByModule? })

  ──────────────────────────────────────────────────────────────
  @arc/persistence  DbSpfModuleQueryService.findMany()
  ──────────────────────────────────────────────────────────────
  try/catch wraps all steps → Result.fail(INTERNAL_ERROR) on exception

  Step 1: loadModuleRoots(systemIds, fileSystemId)
            → delegates to ModuleNodeOverlayFetcher.applyToModuleNodes()
            → Result<ModuleRootData[]>  — fatal if DB error
  Step 2: loadDefinitionCapabilities(defIds, fileSystemId)
            → Result<Map<defSystemId, Result<DefinitionCapabilityData>>>
  Step 3+4: nodeQueryService.getDataPorts/getControlPorts(nodeId, ...)
            per module in parallel — isFailure → warning added, empty ports returned (partial)
  Step 5: assemble in memory → SpfModuleReadModel[] (overlay already applied in Step 1)
  return Result.ok(assembled, warnings)

  ──────────────────────────────────────────────────────────────
  @arc/persistence  DbSpfTuningConfigService.getModuleCkvs() / getModuleTags()
  ──────────────────────────────────────────────────────────────
  See §10 — per-item (per-CKV / per-tag / per-TKV) isolation via Result.partial

  ──────────────────────────────────────────────────────────────
  SQLite via TypeORM DataSource
  ──────────────────────────────────────────────────────────────
```

---

## 4. Complete Call Flow

### Step-by-step with Result handling

```
1. HTTP POST /spf-modules/query
   Controller parses input, throws HttpException on validation failure (before Result)

2. SpfModulesQuery constructed with:
   - systemIds:   number[]
   - projectId:   number
   - includeCkvs: boolean
   - includeTags: boolean

3. SpfModuleQueryHandler.handle():
   a. getFileIdByProjectId(projectId)
   b. SpfModuleQueryService.findMany(...)       → Result<SpfModuleReadModel[]>
      └─ isFailure → return Result.fail(errors)  ← propagates to controller → HTTP 422
      └─ isSuccess → modules = result.data

   c. if includeCkvs || includeTags, in parallel per concern:
      loadCkvsForModules(modules, fileSystemId)  → Map<number, Result<CkvReadModel[]>>
      loadTagsForModules(modules, fileSystemId)  → Map<number, Result<TagReadModel[]>>
      Each entry is that module's own SpfTuningConfigService Result — untouched,
      not merged into a shared warnings array.

   d. return Result.ok({ modules, ckvsByModule?, tagsByModule? })

4. Controller receives Result<SpfModuleDetailedReadModel>:
   └─ isFailure → throw UnprocessableEntityException(errors[0].message)
   └─ isSuccess → for each module m:
                  mapToSpfModuleDto(m, ckvsByModule?.get(m.systemId), tagsByModule?.get(m.systemId))
                  Inside the mapper: if ckvsResult?.isSuccess → dto.ckvs = ckvsResult.data.map(...)
                                       (isSuccess is true for BOTH Result.ok and Result.partial —
                                        a partial CKV list is still shown, just missing the failed ones)
```

### DB queries issued per request (session active, `include=ckvs,tags`)

```
Module roots — ModuleNodeOverlayFetcher.applyToModuleNodes():
  Query 1a: spf_modules WHERE system_id IN (?) AND file_system_id = ?   ← scalar Base rows, no joins
  Query 1b: nodes WHERE system_id IN (?) AND file_system_id = ?         ← scalar Base rows, no joins
  Query 1c: edit_actions WHERE session_id = ? AND table_name = 'SpfModule'  ← table-wide, filtered in-memory to requested ids
  Query 1d: edit_actions WHERE session_id = ? AND table_name = 'Node'       ← table-wide, filtered in-memory to requested ids
  (4 queries total for overlay, regardless of how many modules — replaces N pairs of getByAggregateId calls)

Business keys (resolved from overlaid FK ids):
  Query 2a: subgraphs WHERE system_id IN (?)     ← batch, overlaid subgraphSystemIds
  Query 2b: containers WHERE system_id IN (?)    ← batch, overlaid containerSystemIds

Per unique definition (deduped):
  Query 3a: spf_module_definitions WHERE system_id = ?         ← identity + overlay
  Query 3b: data_port_groups WHERE module_definition_system_id = ?
  Query 3c: static_control_port_definitions WHERE module_definition_system_id = ?
  Query 3d: edit_actions WHERE aggregate_id = ? (definitionSystemId)

Per module node:
  Query 4-10: data ports / control ports + link counts + name resolution (see §9)

Per module, for CKVs (getModuleCkvs):
  Query 11: ckv LEFT JOIN ckv_values WHERE spf_module_system_id = ?
  Query 12: edit_actions WHERE aggregate_id = ? (spfModuleSystemId)          ← CKV-level overlay
  Query 13: arc_values WHERE system_id IN (:...allValueDefIdsAcrossAllCkvs) ← ONE query, not one per CKV
             LEFT JOIN arc_keys                                             ← resolves requested ids → distinct parent key ids
  Query 14: edit_actions WHERE session_id = ? AND table_name = 'ValueDefinition'  ← table-wide, scoped to Query 13's rows
  Query 15: edit_actions WHERE session_id = ? AND table_name = 'KeyDefinition'    ← table-wide, scoped to Query 13's rows
  Query 16: arc_values WHERE key_system_id IN (:...distinctKeyIdsFromQuery13)     ← ONE query, loads ALL values
             LEFT JOIN arc_keys                                                    under those keys, not just the requested ones
  Query 17: edit_actions WHERE session_id = ? AND table_name = 'ValueDefinition'  ← table-wide, scoped to Query 16's rows
  Query 18: edit_actions WHERE session_id = ? AND table_name = 'KeyDefinition'    ← table-wide, scoped to Query 16's rows

Per module, for tags (getModuleTags):
  Query 19: module_tag_id_map LEFT JOIN tkv LEFT JOIN tkv_values WHERE spf_module_system_id = ?
  Query 20: edit_actions WHERE aggregate_id = ? (spfModuleSystemId)          ← tag-map-level overlay
  Query 21: tag_definitions WHERE system_id IN (:...tagDefIds)
  Per tag map:
    Query 22: edit_actions WHERE aggregate_id = ? (tagMapSystemId)           ← ALL TKVs under this
              tag overlaid from this ONE call, not one call per TKV
    Query 23-29: same two-step arc_values/arc_keys pattern as CKVs (Queries 13-18), scoped to this tag's TKVs
```

When no active session exists: all `edit_actions` queries skipped.

---

## 5. Read Model Hierarchy

### `Result<T>` wraps all service returns

```
Result<T>
  isSuccess: boolean
  data: T             ← accessible when isSuccess=true (both Result.ok and Result.partial)
  errors: Error[]      ← empty for Result.ok; non-empty for Result.partial (data still usable)
                         and Result.fail (data inaccessible)
  warnings: Warning[]  ← non-empty on Result.ok with soft partial issues (e.g. port load failures)
```

### Node port read models (node-generic, shared with subsystem)

```typescript
// packages/core/.../usecase/query-models/

interface DataPortReadModel extends ReadModelBase {
  portId:           number;
  name:             string;
  portIoType:       string;   // 'Input' | 'Output'
  isStatic:         boolean;
  totalLinksAtPort: number;
}

interface ControlPortReadModel extends ReadModelBase {
  portId:           number;
  name:             string;
  isStatic:         boolean;
  allocatedIntents: IntentReadModel[];
  totalLinksAtPort: number;
}

interface IntentReadModel {
  systemId: number;
  intentId: number;
  name:     string;
}
```

### Graph view read model

```typescript
interface SpfModuleReadModel extends ReadModelBase {
  parentId?:               number;
  instanceId:              number;
  alias:                   string;
  name:                    string;
  moduleId:                number;
  definitionSystemId:      number;
  subgraphId:              number;
  containerId:             number;
  maxInputPortsSupported:  number;
  maxOutputPortsSupported: number;
  maxControlPortsSupported: number;
  dataPorts:               DataPortReadModel[];
  controlPorts:            ControlPortReadModel[];
}
```

### Handler result model

```typescript
// packages/core/.../usecase-designer/spf-module/query/query-spf-modules.handler.ts

interface SpfModuleDetailedReadModel {
  modules: SpfModuleReadModel[];
  // Present when includeCkvs/includeTags=true — one entry per requested module.
  // Each value is that module's own Result from SpfTuningConfigService —
  // ok/partial/fail preserved as-is, never collapsed into a shared array.
  ckvsByModule?: Map<number, Result<CkvReadModel[]>>;
  tagsByModule?: Map<number, Result<TagReadModel[]>>;
}
```

### Tuning read models — `KeyValueDefQueryService` owns key-value resolution

```typescript
// packages/core/.../key-value/key-value-definition-read-model.ts

// Reduced identity-only projections — base shape shared by the full models below
interface KeyReadModel   { systemId: number; keyId: number;   name: string; description?: string; }
interface ValueReadModel { systemId: number; valueId: number; name: string; description?: string; }

// Full projections — returned by KeyValueDefQueryService
interface ValueDefinitionReadModel extends ValueReadModel {
  enumValue?: string; specialValue?: string;
}
interface KeyDefinitionReadModel extends KeyReadModel {
  isCalibrationKey?: boolean; isGraphKey?: boolean; isVoice?: boolean; isDynamic?: boolean;
  cEnumMemberName?: string; cEnumName?: string;
  specialityKeyValue?: string; calibrationEnumValue?: string; graphEnumValue?: string;
  values: ValueDefinitionReadModel[];   // ALL child values under this key, not just a requested subset
}
```

```typescript
// packages/core/.../spf-module/tuning/tuning-config-read-model.ts

interface CkvReadModel {
  readonly systemId: number;
  readonly keyValuePairs: ReadonlyArray<{ key: KeyReadModel; value: ValueReadModel }>;
}

interface TkvReadModel {
  readonly systemId: number;
  readonly moduleTagIdMapSystemId: number;
  readonly keyValuePairs: ReadonlyArray<{ key: KeyReadModel; value: ValueReadModel }>;
}

interface TagReadModel {
  readonly systemId: number;
  readonly tagDefinitionSystemId: number;
  readonly tagId: number;
  readonly tagName: string;
  readonly tkvs: TkvReadModel[];   // inline — loaded within getModuleTags, no separate call
}

interface CkvParamReadModel {
  readonly systemId: number;
  readonly definition: {
    readonly systemId: number; readonly parameterId: number;
    readonly name?: string; readonly description?: string; readonly pidType: string;
    readonly elementsStructure?: string; readonly isPersistent?: boolean;
    readonly isReadOnly?: boolean; readonly maxSize?: number; readonly toolPolicies?: string;
  };
  readonly payload?: Uint8Array;   // present only when includes === CONFIGURATION_INCLUDES.FullDetails
}
```

`CkvReadModel`/`TkvReadModel.keyValuePairs` embed the reduced `KeyReadModel`/`ValueReadModel` shape, not the full `KeyDefinitionReadModel`/`ValueDefinitionReadModel` — `DbSpfTuningConfigService.resolveKeyValuePairs` (§10) reduces via `toKeyReadModel`/`toValueReadModel` after resolving through `KeyValueDefQueryService`.

---

## 6. Session Overlay

### Three-tier pattern — always applied, no flag

Module instance overlay (nodes + spf_modules) flows through `ModuleNodeOverlayFetcher.applyToModuleNodes()`:

```typescript
// In loadModuleRoots — single fetcher call replaces the two-pass overlay that used to exist
const session = await this.editActionsSvc.findActiveSession(fileSystemId);
const overlaidModules = await this.moduleNodeFetcher.applyToModuleNodes(
  nodeSystemIds,
  fileSystemId,
  session?.sessionId ?? null,   // null → fetcher returns baseline rows directly
);
// DELETE-staged modules are absent from overlaidModules; alias and other scalar
// fields already carry the overlaid values — no second pass needed.
```

Inside the fetcher (`ModuleNodeOverlayFetcher.applyToModuleNodes`):

```typescript
// 1. Load scalar Base rows — no TypeORM relation joins
const baseSpfRows = ... // SELECT scalar columns FROM spf_modules WHERE systemId IN (?)
const baseNodeRows = ... // SELECT systemId, parentId FROM nodes WHERE systemId IN (?)

if (sessionId === null) return baseSpfRows.map(...);  // no session — baseline only

// 2. Two table-wide queries (not N aggregate-scoped queries)
const [allSpfActions, allNodeActions] = await Promise.all([
  editActionsSvc.getByTable(sessionId, ENTITY_NAMES.SpfModule),
  editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node),
]);

// 3. Filter to requested modules in memory
const spfActions  = allSpfActions.filter(a => moduleIdSet.has(a.targetSystemId));
const nodeActions = allNodeActions.filter(a => moduleIdSet.has(a.targetSystemId));

// 4. Apply UPDATE+DELETE via OverlayMergeImpl (CREATEs handled separately)
const overlaidSpf  = overlay.applyToCollection(baseSpfRows,  spfUpdateDelete).map(r => r.effective);
const overlaidNode = overlay.applyToCollection(baseNodeRows, nodeUpdateDelete).map(r => r.effective);

// 5. Inject session-staged CREATEs — systemId comes from a.targetSystemId, never newValue.systemId
const createdSpf  = spfActions.filter(CREATE && !baseSpfIds.has(targetSystemId))
  .map(a => ({ systemId: a.targetSystemId, ...a.newValue defaults }));
const createdNode = nodeActions.filter(CREATE && !baseNodeIds.has(targetSystemId))
  .map(a => ({ systemId: a.targetSystemId, ...a.newValue defaults }));

return [...overlaidSpf, ...createdSpf].map(sm => ({...sm, parentId: nodeMap.get(sm.systemId)?.parentId}));
```

**Key properties:**
- `OverlayMergeImpl` (not the deprecated `applyToCollection` shim) handles UPDATE+DELETE
- CREATE actions are processed separately — `a.targetSystemId` is always the authoritative `systemId` for new entities
- 4 queries total for module overlay regardless of how many modules (2 scalar loads + 2 `getByTable`)

**Effects:**
- `DELETE` draft → row absent from `applyToModuleNodes` result
- `UPDATE` draft → payload fields merged onto baseline row
- `CREATE` draft → row injected (no baseline row exists yet)

### Batched overlay — the N+1 fix

Two distinct patterns exist for avoiding one `edit_actions` query per item:

**Aggregate-scoped batching** — one aggregate has many children; overlay all children from a single `getEditActionsByAggregateId` call on the parent aggregate:
```
overlayTkvRows(tkvRows, tagMapSystemId, session)
  → ONE getEditActionsByAggregateId(session, tagMapSystemId) call
  → applyToCollection(tkvRows, actions.filter(tableName === 'Tkv'))
  → every TKV under this tag map overlaid from that single call
```

**Table-scoped batching** — many independent aggregates (e.g. N unrelated `valueDefSystemId`s across several CKVs); overlay them all from two table-wide queries instead of N aggregate-scoped queries:
```
applyBatchOverlay(valueDefRows, requestedIds, session)
  → getEditActionsByTable(session, 'ValueDefinition')  — ONE query, whole table
  → getEditActionsByTable(session, 'KeyDefinition')    — ONE query, whole table
  → filter each in memory to requestedIds / their resolved key systemIds
  → applyToCollection per table
```

### What gets overlaid

| Table | Aggregate ID | Overlay applies to |
|---|---|---|
| `nodes` | nodeSystemId | parentId changes |
| `spf_modules` | nodeSystemId | alias UPDATE, module DELETE |
| `data_ports` / `control_ports` | nodeSystemId | port CREATE/DELETE |
| `data_port_definitions` / `static_control_port_definitions` / `static_intent_definitions` | definitionSystemId | name changes |
| `ckv` | spfModuleSystemId | CKV row CREATE/DELETE |
| `tkv` | moduleTagIdMapSystemId | TKV row CREATE/DELETE — batched via `overlayTkvRows` |
| `arc_values` / `arc_keys` | table-wide (batched) | value/key CREATE/UPDATE/DELETE — batched via `applyBatchOverlay` |
| `ckv_parameter_payload` / `tkv_parameter_payload` | payload systemId | payload changes |

---

## 7. Handler and Query Classes

### SpfModulesQuery

```typescript
// packages/core/.../usecase-designer/spf-module/query/query-spf-modules.query.ts

export class SpfModulesQuery extends BaseQuery {
  constructor(
    public readonly systemIds:   number[],
    public readonly projectId:   number,
    public readonly includeCkvs: boolean,
    public readonly includeTags: boolean,
    clientId: string,
  ) { super(clientId); }
}
```

### SpfModuleQueryHandler

```typescript
// packages/core/.../usecase-designer/spf-module/query/query-spf-modules.handler.ts

export interface SpfModuleDetailedReadModel {
  modules: SpfModuleReadModel[];
  ckvsByModule?: Map<number, Result<CkvReadModel[]>>;
  tagsByModule?: Map<number, Result<TagReadModel[]>>;
}

export class SpfModuleQueryHandler implements QueryHandler<SpfModulesQuery, Promise<Result<SpfModuleDetailedReadModel>>> {
  async handle(query: SpfModulesQuery): Promise<Result<SpfModuleDetailedReadModel>> {
    const fileSystemId = await this.queryServices.projectQueryService.getFileIdByProjectId(query.projectId);

    const modulesResult = await this.queryServices.spfModuleQueryService.findMany(query.systemIds, fileSystemId);
    if (modulesResult.isFailure) return Result.fail(...modulesResult.errors);

    const modules = modulesResult.data;
    if (modules.length === 0 || (!query.includeCkvs && !query.includeTags))
      return Result.ok({modules});

    const [ckvsByModule, tagsByModule] = await Promise.all([
      query.includeCkvs ? this.loadCkvsForModules(modules, fileSystemId) : undefined,
      query.includeTags ? this.loadTagsForModules(modules, fileSystemId) : undefined,
    ]);

    return Result.ok({modules, ckvsByModule, tagsByModule});
  }

  private async loadCkvsForModules(modules, fileSystemId): Promise<Map<number, Result<CkvReadModel[]>>> {
    const entries = await Promise.all(
      modules.map(async m => {
        const result = await this.queryServices.spfTuningConfigService
          .getModuleCkvs(m.systemId, fileSystemId);
        return [m.systemId, result] as [number, Result<CkvReadModel[]>];
      }),
    );
    return new Map(entries);   // every module gets an entry — ok, partial, or fail
  }

  // loadTagsForModules — identical shape, calls getModuleTags(m.systemId, fileSystemId, CONFIGURATION_INCLUDES.Summary)
}
```

### Controller unwrapping

```typescript
// packages/api/.../spf-module/spf-module.controller.ts

const result = await this.queryBus.execute<Result<SpfModuleDetailedReadModel>>(query);

if (result.isFailure) {
  throw new UnprocessableEntityException(result.errors?.[0]?.message ?? 'Failed to retrieve SPF modules');
}

const {modules, ckvsByModule, tagsByModule} = result.data;
const dtos = modules.map(m =>
  this.mapToSpfModuleDto(m, ckvsByModule?.get(m.systemId), tagsByModule?.get(m.systemId)),
);

// mapToSpfModuleDto:
//   if (ckvsResult?.isSuccess) dto.ckvs = ckvsResult.data.map(c => this.mapCkvToDto(c));
//   if (tagsResult?.isSuccess) dto.tags = tagsResult.data.map(t => this.mapTagToDto(t));
//   isSuccess is true for BOTH Result.ok and Result.partial — a partially-built
//   CKV/tag list is still returned to the caller, just missing the items that failed.
```

---

## 8. Persistence Layer — DbSpfModuleQueryService

### Public methods

```typescript
getSpfModule(spfModuleSystemId, fileSystemId):  Promise<Result<SpfModuleReadModel>>
getSpfModules(systemIds, fileSystemId):          Promise<Result<SpfModuleReadModel[]>>
```

`getSpfModule` delegates to `getSpfModules([id])` and converts an empty result into `Result.fail(ENTITY_NOT_FOUND)` — it never throws and never returns `Result.ok(null)`. The calling core handler receives the `Result` and is responsible for throwing a domain exception (e.g. `ResourceNotFoundException`) if appropriate. Both methods wrapped in `try/catch` → `Result.fail(INTERNAL_ERROR)` on DB exception.

### Constructor — services injected, not self-constructed

```typescript
constructor(
  dataSource: DataSource,
  editActionsSvc: EditActionsQueryService,
  definitionQuerySvc: SpfModuleDefinitionQueryService,
  tuningConfigSvc: SpfTuningConfigService,   // ← injected, shared single instance
  keyValueDefQuerySvc: KeyValueDefQueryService,
) {
  this.nodeQueryService = new DbNodeQueryService(dataSource, editActionsSvc);
  this.spfTuningConfigService = tuningConfigSvc;   // NOT `new DbSpfTuningConfigService(...)`
  this.spfModuleDefinitionQuerySvc = definitionQuerySvc;
  this.ckvQueryService = new DbCkvCalibrationQueryService(dataSource, editActionsSvc, keyValueDefQuerySvc);
  this.moduleNodeFetcher = new ModuleNodeOverlayFetcher(dataSource.manager, editActionsSvc);
}
```

`DbSpfTuningConfigService` is constructed exactly once in `DbQueryServices` and passed in. `ModuleNodeOverlayFetcher` is constructed internally — it is not shared with other services.

### findMany assembly pipeline

```
try {
  Step 1: loadModuleRoots(uniqueIds, fileSystemId)
            → moduleNodeFetcher.applyToModuleNodes(ids, fileSystemId, session?.sessionId ?? null)
            → batch-resolve subgraph/container business keys from overlaid FK ids
            → Result<ModuleRootData[]>  — fatal if DB error
  Step 2: loadDefinitionCapabilities(defIds, fileSystemId) → Result<Map<defSystemId, Result<...>>>
  Step 3+4: nodeQueryService.getDataPorts/getControlPorts(nodeId, ...) per module in parallel
            isFailure → warning added, empty array used (partial — module kept)
  Step 5: assemble SpfModuleReadModel[] from roots + capabilities + ports
          (DELETE filtering and alias overlay already applied by fetcher in Step 1)
          return Result.ok(assembled, warnings)
} catch (err) {
  return Result.fail({code: INTERNAL_ERROR, message: err.message})
}
```

---

## 9. Persistence Layer — DbNodeQueryService

### Port name resolution flow

```
getDataPorts(nodeSystemId, fileSystemId):
  try {
    Step 1: Load data_ports baseline rows
    Step 2: countDataLinksPerPort → overlay-aware link counts
    Step 3: Three-tier overlay on data_port rows
    Step 4: resolveDefinitionSystemId(nodeSystemId) → null for Subsystem nodes
            if module: buildDataPortNameMap(definitionSystemId) → Map<dataPortId, name>
    Map: name = portNameMap?.get(row.dataPortId) ?? row.name ?? ''
    return Result.ok(portRows.map(...))
  } catch (err) {
    return Result.fail({code: INTERNAL_ERROR, message: '...'})
  }

getControlPorts(nodeSystemId, fileSystemId):
  — same pattern, resolves control port + intent names
```

---

## 10. Persistence Layer — DbSpfTuningConfigService

Owns `ckv`, `ckv_values`, `tkv`, `tkv_values`, `module_tag_id_map`. Delegates key-value pair resolution to `KeyValueDefQueryService` (§11) — never touches `arc_values`/`arc_keys` directly.

### Three public methods

```typescript
getModuleCkvs(spfModuleSystemId, fileSystemId)                 → Result<CkvReadModel[]>
  // No ConfigurationIncludes — CKVs have no fullDetails-gated dimension, always key-value pairs only.
getModuleCkvParams(ckvSystemId, fileSystemId, includes)        → Result<CkvParamReadModel[]>
getModuleTags(spfModuleSystemId, fileSystemId, includes)       → Result<TagReadModel[]>
  // includes === CONFIGURATION_INCLUDES.Summary     → key-value pairs; TagReadModel.tkvs loaded inline, same call
  // includes === CONFIGURATION_INCLUDES.FullDetails → summary + params + payload per bin (CkvParamReadModel only)
```

`getModuleTkvs` as a separate public method was removed — `TagReadModel.tkvs` is populated inline within `getModuleTags` using a batched overlay (see below), so no second round-trip per tag is needed.

### `getModuleCkvs` — per-CKV isolation via `Result.partial`

```
Step 1 — QueryBuilder: ckv LEFT JOIN ckv_values WHERE spfModuleSystemId = ?
Step 2 — Overlay: overlayCkvRows — one getEditActionsByAggregateId(spfModuleSystemId) call,
          filtered to 'Ckv' table actions, applied via applyToCollection
Step 3 — Per CKV, in a Promise.all with a try/catch PER ITEM:
          try { buildCkvReadModel(row, fileSystemId) } → Result<CkvReadModel>
          isFailure/errors from the Result (not just a thrown exception) are pushed to itemErrors
          catch (error) { itemErrors.push({code: INTERNAL_ERROR, message: `CKV ${row.systemId} failed...`}); return null }
          buildCkvReadModel delegates to resolveKeyValuePairs (shared with buildTkvReadModel — see below)
Step 4 — return itemErrors.length > 0 ? Result.partial(successfulCkvs, itemErrors) : Result.ok(successfulCkvs)
```

### `getModuleTags` — per-tag AND per-TKV isolation

```
Step 1 — QueryBuilder: module_tag_id_map LEFT JOIN tkv LEFT JOIN tkv_values (always joined);
          payload + param definition joins gated by includes === CONFIGURATION_INCLUDES.FullDetails
Step 2 — Overlay: overlayTagMapRows — one getEditActionsByAggregateId(spfModuleSystemId) call
Step 3 — loadTagDefinitions(tagDefIds) — batched IN query for tagId/tagName
Step 4 — Per tag map, in a Promise.all:
          buildTagTkvReadModels(tagMap, session, fileSystemId) → Result<TkvReadModel[]>
            ├─ overlayTkvRows(tagMap.tkvs, tagMap.systemId, session)
            │    → ONE getEditActionsByAggregateId(tagMap.systemId) call overlays
            │      EVERY TKV under this tag — not one call per TKV (the N+1 that was fixed)
            └─ per TKV, try/catch PER ITEM around buildTkvReadModel
                 → Result.partial(successfulTkvs, tkvErrors) if any TKV failed
          tkvResult.errors are pushed into this method's own itemErrors array
Step 5 — return itemErrors.length > 0 ? Result.partial(tagResults, itemErrors) : Result.ok(tagResults)
```

`buildTkvReadModel` (like `buildCkvReadModel`) delegates to `resolveKeyValuePairs`.

### `resolveKeyValuePairs` — shared helper behind `buildCkvReadModel`/`buildTkvReadModel`

```
private async resolveKeyValuePairs(valueDefIds, fileSystemId) → Result<Array<{key: KeyReadModel; value: ValueReadModel}>>

Step 1 — keyValueDefSvc.getKeyValueDefinitionForGivenValues(valueDefIds, fileSystemId)
          → Result<KeyDefinitionReadModel[]> — ONE batched call, deduped by parent key (§11)
          isFailure → propagate as Result.fail
Step 2 — Flatten: build a Map<valueDefSystemId, {key, value}> by walking every returned
          KeyDefinitionReadModel's .values array — since the batch call dedupes by key and
          returns each key's FULL child set, this is how a specific requested valueDefId is
          relocated within a deduped result.
Step 3 — For each originally-requested valueDefId, look it up in the flattened map:
          found    → {key: toKeyReadModel(resolved.key), value: toValueReadModel(resolved.value)}
          missing  → itemErrors.push({message: `ValueDefinition ${id} not found`}); dropped from result
          (the batch call itself silently omits unresolved ids — this step reconstructs the
          per-id not-found signal that buildCkvReadModel/buildTkvReadModel need for Result.partial)
Step 4 — return itemErrors.length > 0 ? Result.partial(pairs, itemErrors) : Result.ok(pairs)
```

`buildCkvReadModel`/`buildTkvReadModel` call `resolveKeyValuePairs` once per CKV/TKV and propagate its `Result` directly — a batch-level failure becomes `Result.fail`, per-id not-found errors become `Result.partial`.

### `getModuleCkvParams` — no per-item isolation needed

```
Step 1 — QueryBuilder: ckv_parameter_payload LEFT JOIN spf_module_parameter_definitions
Step 2 — Overlay: overlayPayloadRows — one getEditActionsByAggregateId call per payload row
                   (payload rows are independent aggregates by design — see §6 table)
Step 3 — Synchronous filter/map over already-loaded rows — no async per-item call that
          can independently throw, so no try/catch-per-item isolation is needed here.
return Result.ok(results)
```

---

## 11. Persistence Layer — DbKeyValueDefQueryService

Owns `arc_values`, `arc_keys`. Reused by `SpfTuningConfigService` for both CKV and TKV key-value pairs — the same service will back any future GKV/usecase read path that needs value/key resolution.

All three public methods return `Result<T>` — `Result.fail(ERROR_CODES.INTERNAL_ERROR)` on a thrown DB exception, `Result.fail(ERROR_CODES.ENTITY_NOT_FOUND)` when a requested id resolves to nothing after checking both the DB row and the session overlay.

`KeyDefinitionReadModel` (§5) carries its full child `values: ValueDefinitionReadModel[]` inline — there is no separate `{key, value}`/`{key, values}` wrapper type; each method returns the read model directly.

### `getKeyValueDefinitionForGivenValue` — thin wrapper over the batch method

```typescript
getKeyValueDefinitionForGivenValue(valueDefSystemId, fileSystemId): Promise<Result<KeyDefinitionReadModel>>
  → getKeyValueDefinitionForGivenValues([valueDefSystemId], fileSystemId)
  → find the one returned KeyDefinitionReadModel whose .values contains a value
    with systemId === valueDefSystemId
  → Result.fail(ENTITY_NOT_FOUND) if the batch call failed or no match found
```

### `getKeyValueDefinitionForGivenValues` — the batch method, two queries total

Deduped by parent key: if two requested valueDefSystemIds share a parent key, that key appears once in the result, carrying ALL its child values (not just the requested ones) — not once per input id. Ids that don't resolve are silently omitted from the result (no per-id error tracking at this layer).

```
Step 1 — Resolve requested values → their distinct parent key ids
          QueryBuilder: WHERE v.systemId IN (:...valueDefSystemIds), LEFT JOIN v.keys
          Overlay: applyBatchOverlay(rows, valueDefSystemIds, session)
            ├─ getEditActionsByTable(session, 'ValueDefinition') — ONE table-wide query, filtered to requestedIds
            ├─ applyToCollection(rows, filteredValueActions)
            ├─ getEditActionsByTable(session, 'KeyDefinition')   — ONE table-wide query, filtered to resolved key ids
            └─ applyToCollection(keyRows, filteredKeyActions), re-attached to each value row
          Collect distinct r.keys.systemId across the overlaid rows → keySystemIds
          keySystemIds.length === 0 → return Result.ok([])
Step 2 — Load ALL values under those keys, one batched query
          QueryBuilder: WHERE v.keySystemId IN (:...keySystemIds), LEFT JOIN v.keys
          Overlay: applyBatchOverlay(allValueRows, allValueIds, session) — same helper, reused,
            two MORE table-wide getEditActionsByTable queries (ValueDefinition + KeyDefinition)
Step 3 — Group Step 2's overlaid rows by row.keys.systemId, map each group to
          toKeyDefinitionReadModel(keyRow, valueRowsForThatKey)
return Result.ok(keyDefinitionReadModels)
```

Two DB queries total (Step 1 + Step 2), each paired with `applyBatchOverlay`'s own two table-wide `getEditActionsByTable` calls — four table-wide overlay queries total, regardless of how many ids or distinct keys are involved. This reintroduces a second value-table query relative to the earlier single-query design (§1.5), traded for returning genuine `KeyDefinitionReadModel`s with a complete `.values` set instead of a `{key, value}` pair scoped to just the requested id.

### `getByKeyDefinition`

```
Step 1 — QueryBuilder: k.systemId = ?, LEFT JOIN k.values
Step 2 — Overlay: applyKeyDefOverlay
          ├─ getEditActionsByAggregateId(keyDefSystemId) — one call for the key's own actions
          └─ applyBatchOverlay(key.values, valueSystemIds, session) — reuses the SAME
             batch method as getKeyValueDefinitionForGivenValues for the key's child values
Step 3 — overlaid === null → Result.fail(ENTITY_NOT_FOUND); else Result.ok(toKeyDefinitionReadModel(overlaid, overlaid.values))
```

`applyValueDefOverlay` (a per-value, one-`getEditActionsByAggregateId`-call-per-value method) was removed once `applyKeyDefOverlay` was rewritten to reuse `applyBatchOverlay` — it had no remaining callers.

### Projection helpers

`toKeyDefinitionReadModel(key: KeyDefinitionRow, values: ValueDefinitionRow[])` and `toValueDefinitionReadModel(v: ValueDefinitionRow)` are shared private mapping helpers used by all three public methods — replacing the inline key/value literal construction that used to be duplicated across them.

---

## 12. Persistence Layer Wiring

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

export class DbQueryServices implements QueryServices {
  readonly spfModuleQueryService:           SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  readonly keyValueDefQueryService:         KeyValueDefQueryService;
  readonly spfTuningConfigService:          SpfTuningConfigService;

  constructor(dataSource: DataSource, logger?: Logger) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    // Key-value category service — no dependency on any other query service
    this.keyValueDefQueryService = new DbKeyValueDefQueryService(
      dataSource, editActionsQueryService,
    );

    this.spfModuleDefinitionQueryService = new DbSpfModuleDefinitionQueryService(
      dataSource, editActionsQueryService,
    );

    // Tuning config service — constructed ONCE here, delegates to keyValueDefQueryService
    this.spfTuningConfigService = new DbSpfTuningConfigService(
      dataSource, editActionsQueryService, this.keyValueDefQueryService,
    );

    // Module service — receives the SAME spfTuningConfigService instance,
    // does not construct its own copy
    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource, editActionsQueryService,
      this.spfModuleDefinitionQueryService, this.spfTuningConfigService,
    );
  }
}
```

### Service ownership tree

```
DbQueryServices
  ├── DbKeyValueDefQueryService          ← key-value/ — arc_values + arc_keys, no dependencies
  ├── DbSpfModuleDefinitionQueryService  ← spf-module-definition/ — definition aggregate
  ├── DbSpfTuningConfigService           ← spf-module/ — CKV/TKV/tag catalogue
  │     └── delegates to DbKeyValueDefQueryService (injected, shared instance)
  └── DbSpfModuleQueryService            ← spf-module/ — module instance + ports
        ├── ModuleNodeOverlayFetcher     ← fetchers/ — scalar Base overlay for Node + SpfModule
        ├── DbNodeQueryService           ← node/ — data+control ports, definition name resolution
        └── receives DbSpfTuningConfigService (injected, SAME shared instance — not self-constructed)
```

---

## 13. Folder Structure

```
packages/core/src/application/
  shared/
    read-model-base.ts
    Result/
      operation-result.ts                    ← Result<T>.ok/partial/fail, Error, Warning
  errors/
    error-codes.ts
  ports/persistence/query-services/
    query-services.ts
    configuration-includes.ts                ← ConfigurationIncludes const-object + derived type (Summary | FullDetails)
    node/
      node-query-service.ts
    usecase/query-models/
      data-port-read-model.ts
      control-port-read-model.ts
      intent-read-model.ts
    key-value/
      key-value-def-query-service.ts         ← KeyValueDefQueryService — getKeyValueDefinitionForGivenValue(s), getByKeyDefinition
      key-value-definition-read-model.ts      ← KeyDefinitionReadModel (embeds values[]), ValueDefinitionReadModel, KeyReadModel, ValueReadModel
    spf-module/
      spf-module-query-service.ts             ← SpfModuleQueryService — getSpfModule, getSpfModules
      spf-module-read-model.ts
      tuning/
        spf-tuning-config-service.ts          ← SpfTuningConfigService — getModuleCkvs, getModuleCkvParams, getModuleTags
        tuning-config-read-model.ts            ← CkvReadModel, TkvReadModel, TagReadModel, CkvParamReadModel
    spf-module-definition/
      definition-attribute.ts
      spf-module-definition-query-service.ts
      spf-module-definition-read-model.ts
  usecase-designer/
    spf-module/
      query/
        query-spf-modules.query.ts            ← SpfModulesQuery
        query-spf-modules.handler.ts           ← SpfModuleQueryHandler → Result<SpfModuleDetailedReadModel>

packages/infrastructure/persistence/src/.../queries/
  key-value/
    db-key-value-def-query-service.ts         ← getKeyValueDefinitionForGivenValues (batch, 2 queries + overlay,
                                                  deduped by parent key), applyBatchOverlay (table-wide edit_actions)
  node/
    db-node-query-service.ts                  ← getDataPorts + getControlPorts
  spf-module/
    db-spf-module-query-service.ts            ← getSpfModule/getSpfModules; getSpfModule returns Result.fail (never throws);
                                                  receives spfTuningConfigService by injection
    db-spf-tuning-config-service.ts           ← getModuleCkvs/getModuleTags — Result.partial per-item isolation,
                                                  resolveKeyValuePairs (shared flatten + not-found reconstruction),
                                                  buildTagTkvReadModels (batched TKV overlay + per-TKV isolation)
  spf-module-definition/
    db-spf-module-definition-query-service.ts
  typeorm-query-services.ts                   ← DbQueryServices — constructs spfTuningConfigService ONCE

packages/infrastructure/persistence/src/.../fetchers/
  module-node-overlay-fetcher.ts              ← fetchOne (single module) + applyToModuleNodes (batch);
                                                  loads scalar SpfModuleBase + NodeBase rows, applies OverlayMergeImpl,
                                                  injects a.targetSystemId for CREATE-staged modules

packages/api/src/presentation/rest/modules/spf-module/
  spf-module.controller.ts   ← unwraps Result<T> per-module; isSuccess check (true for ok AND partial)
  dto/shared/
    spf-module.dto.ts

docs/superpowers/specs/
  decomposed-query-services.md   ← category service decomposition design (KeyValueDefQueryService, etc.)

tests/e2e/spf-module/
  query-spf-modules.e2e-spec.ts  ← verifies DTO shape, definition names, partial results, alias overlay
```

---

*End of Document*
