<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# SPF Module Query APIs — Low-Level Design

## Document Information

- **Version**: 5.0
- **Date**: June 2026
- **Status**: Draft
- **Endpoints**:
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query?include=ckvs,tags`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules`
- **Related Documents**:
  - `edit-session-persistence-design.md` — Edit session overlay pattern
  - `spf-module-get-ckv-calibration-design.md` — Cal-data handler reference design
  - `get-api-classification-and-overlap.md` — API classification and reuse map

---

## Table of Contents

1. [Core Design Principles](#1-core-design-principles)
2. [Architecture Overview](#2-architecture-overview)
3. [Handler Design — When One vs Multiple](#3-handler-design--when-one-vs-multiple)
4. [Service Reuse Strategy](#4-service-reuse-strategy)
5. [Read Model Hierarchy](#5-read-model-hierarchy)
6. [Session Overlay](#6-session-overlay)
7. [API: POST /spf-modules/query](#7-api-post-spf-modulesquery)
8. [API: POST /spf-modules/query?include=ckvs,tags](#8-api-post-spf-modulesqueryincludeckvstags)
9. [API: POST /spf-modules (Create)](#9-api-post-spf-modules-create)
10. [Persistence Layer Wiring](#10-persistence-layer-wiring)
11. [Folder Structure](#11-folder-structure)

---

## 1. Core Design Principles

### 1.1 One handler per user intent

A handler is created for each distinct **user intent** — not for each endpoint or each entity type. The test: if two operations differ in error conditions, response shape, or assembly logic they are different intents and need separate handlers.

```
Same intent → one handler with flags:
  POST /spf-modules/query                    ← "give me these modules"
  POST /spf-modules/query?include=ckvs,tags  ← same intent, more data

Different intent → separate handlers:
  POST /spf-modules/query   → QuerySpfModulesHandler
  POST /spf-modules         → CreateSpfModuleHandler
  GET  /spf-modules/{id}/properties → GetSpfModulePropertiesHandler
```

### 1.2 Services are the reuse boundary

Handlers are never reused. Services are the reusable building blocks. A service is scoped to **one aggregate slice** — it knows one entity group's tables, queries, and overlay logic.

```
DataPortQueryService    → reused by SpfModule, Subsystem, UseCase component query
ControlPortQueryService → reused by SpfModule, Subsystem
SpfModuleQueryService   → reused by all handlers that need module identity
```

### 1.3 Read models are shared vocabulary

Read models live in `@arc/core` query-services folder. They are not owned by any one handler. Any service or handler that needs them imports from the shared location.

### 1.4 Spec constructs in `@arc/core`, executed in `@arc/persistence`

The handler (in `@arc/core`) decides **what data** is needed and passes it as flags. The persistence layer decides **how** to load it. No infrastructure knowledge leaks upward.

### 1.5 Three-tier overlay pattern — applied at persistence layer

Every persistence service applies the same three-tier pattern:
- **Tier 1** — `applyOverlay = false` → skip session lookup entirely
- **Tier 2** — `applyOverlay = true`, no active session → read baseline directly
- **Tier 3** — `applyOverlay = true`, session active, changes present → merge overlay

### 1.6 Definition data is part of the edit session

Definition tables (`spf_module_definitions`, `data_port_groups`, `static_control_port_definitions`, `spf_module_parameter_definitions`, `module_property_definitions`) **can be modified within an active edit session** — for example when a new module version is imported during a session. Every definition fetch must apply the three-tier overlay, same as instance data.

**No definition table is exempt from overlay.** The three-tier pattern applies to all definition reads via `SpfModuleDefinitionQueryService`.

### 1.7 Definition includes — load only what is needed

The definition aggregate has many child tables. `DefinitionIncludes` declares which chunks to load. `includeFullDetails` takes precedence over `includeSummary` when both are true.

```
DefinitionIncludes:
  includeSummary     → data_port_groups (maxInput/maxOutput counts)
                       static_control_port_definitions (maxControl count)
  includeFullDetails → data_port_groups + data_port_definitions (structural)
                       static_control_port_definitions + static_intent_definitions
                       dynamic_intent_definitions
                       spf_module_parameter_definitions
```

The identity root row (`name`, `moduleId`) is always loaded regardless of flags.
Read model fields are `null` when their flag was `false` — distinguishing "not requested" from "loaded but empty".

### 1.8 Tuning include flags — load only what is needed

`SpfTuningConfigService.getModuleTuningConfig()` accepts `includeCkvs` and `includeTags` flags. Unset sections return `null` in the read model — distinguishing "not requested" from "loaded but empty". This mirrors the `?include=ckvs,tags` query parameter pattern on the HTTP layer.

`includeProperties` belongs to a separate properties query service (future).

### 1.9 Controller may stitch multiple read models

One controller method may receive a composite result from a handler containing multiple read models, then assemble a single DTO. There is no requirement for one-to-one mapping between handler output and DTO. The controller is the assembly layer.

---

## 2. Architecture Overview

```
HTTP Request
    │
    ▼
@arc/api — SpfModuleController
  - Validates input
  - Parses ?include= query param → includeCkvs, includeTags flags
  - Constructs QuerySpfModulesQuery with flags
  - Calls queryBus.execute(query)
  - Maps ReadModel → DTO
    │
    │ QueryBus
    ▼
@arc/core — Handler (one per use case)
  - Receives QueryServices
  - Calls the appropriate service methods
  - Assembles final read model from service results
  - Returns read model to controller
    │
    │ port boundary (QueryServices interface)
    ▼
@arc/persistence — Db*QueryService implementations
  - Own all TypeORM queries
  - Apply three-tier session overlay
  - Return read models to handlers
    │
    ▼
  SQLite (via TypeORM DataSource)
```

---

## 3. Handler Design — When One vs Multiple

### Decision table

| Scenario | Pattern | Reason |
|---|---|---|
| Same resource, depth variant (`?include=ckvs,tags`) | One handler, flags on query | Same user intent, same error conditions, superset response |
| Different resource (`/query` vs `/properties`) | Separate handlers | Different primary entity, different errors, different response shape |
| Write vs read (`POST /spf-modules` vs `POST /spf-modules/query`) | Separate command/query handlers | Commands use `UnitOfWork`; queries use `QueryServices` only |

### Handlers for these APIs

```
QuerySpfModulesHandler          → POST /spf-modules/query (+ includeCkvs/includeTags flags)
CreateSpfModuleHandler          → POST /spf-modules
GetSpfModulePropertiesHandler   → GET  /spf-modules/{id}/properties  (separate doc)
GetCkvCalibrationDataHandler    → GET  /spf-modules/{id}/cal-data    (separate doc)
GetTkvTagDataHandler            → GET  /spf-modules/{id}/tag-data    (separate doc)
```

---

## 4. Service Reuse Strategy

### Service ownership by aggregate slice

```
SpfModuleQueryService           owns: nodes + spf_modules
                                       + subgraphs + containers
                                       + (definition capabilities via DefinitionIncludes)
  sub-services owned:
    DataPortQueryService        owns: data_ports + data_links (for link count)
    ControlPortQueryService     owns: control_ports + intents + control_links (for link count)
    SpfTuningConfigService      owns: ckv + tkv + tag data

SpfModuleDefinitionQueryService owns: spf_module_definitions (definition aggregate)
                                       All child tables overlaid via three-tier pattern.
                                       Callers pass DefinitionIncludes to select which
                                       child tables to load.
  includeSummary tables:
    data_port_groups                → maxInputPortsSupported, maxOutputPortsSupported
    static_control_port_definitions → maxControlPortsSupported
  includeFullDetails tables:
    data_port_groups + data_port_definitions     → DataPortGroupReadModel[]
    static_control_port_definitions + static_intent_definitions → StaticControlPortDefinitionReadModel[]
    dynamic_intent_definitions                   → DynamicIntentDefinitionReadModel[]
    spf_module_parameter_definitions             → ParameterDefinitionReadModel[]
```

### `DefinitionIncludes` type

```typescript
// packages/core/src/application/ports/persistence/query-services/spf-module-definition/
//   definition-attribute.ts

export interface DefinitionIncludes {
  includeSummary: boolean;      // port capacity counts
  includeFullDetails: boolean;  // structural definition records + parameters
}
```

`includeFullDetails` takes precedence — if both are `true`, the full-details joins run (which are a superset of summary joins).

### How each API uses `DefinitionIncludes`

| API | Includes |
|---|---|
| `POST /spf-modules/query` | `{ includeSummary: true, includeFullDetails: false }` — counts only |
| `GET /spf-modules/{id}/properties` | `{ includeSummary: false, includeFullDetails: true }` — property definitions |
| `GET /spf-modules/{id}/cal-data` | `{ includeSummary: false, includeFullDetails: true }` — parameter definitions |

### Reuse map across handlers

| Service method | Used by |
|---|---|
| `SpfModuleQueryService.findMany()` | `QuerySpfModulesHandler` |
| `SpfModuleQueryService.findOne()` | `GetSpfModulePropertiesHandler`, `GetCkvCalibrationDataHandler` |
| `SpfModuleQueryService.getModuleDefinitionSystemId()` | `GetCkvCalibrationDataHandler` |
| `DataPortQueryService.getDataPorts()` | `DbSpfModuleQueryService` (internal), future `SubsystemQueryService` |
| `ControlPortQueryService.getControlPorts()` | `DbSpfModuleQueryService` (internal), future `SubsystemQueryService` |
| `SpfTuningConfigService.getModuleTuningConfig()` | `QuerySpfModulesHandler` (when `includeCkvs` or `includeTags`) |
| `SpfModuleDefinitionQueryService.getDefinition()` | `DbSpfModuleQueryService` (loadDefinitionCapabilities step) |

### Sub-service ownership pattern

`DataPortQueryService` and `ControlPortQueryService` are exposed as properties on `SpfModuleQueryService`. This allows handlers that only need ports (not the full module) to access them directly without going through the full assembly:

```typescript
// Handler that only needs ports directly (future use case)
const ports = await this.queryServices.spfModuleQueryService
  .dataPortQueryService.getDataPorts(nodeIds, fileSystemId);

// Handler that needs the full module (current use case)
const modules = await this.queryServices.spfModuleQueryService
  .findMany(systemIds, fileSystemId);
// dataPorts and controlPorts are already inside each SpfModuleReadModel
```

---

## 5. Read Model Hierarchy

### Base types (shared by all read models)

```typescript
// packages/core/src/application/shared/read-model-base.ts
export interface ReadModelBase {
  readonly systemId: number;
}
```

`changeInfo` is absent from all read models. The graph view query returns entity data only. Change state tracking belongs to a dedicated change-details API (future endpoint). `changeInfo` in `BaseDto` (`@arc/api`) is **optional** — present only when an API explicitly populates it, defaulting to `{ changeType: 'NONE' }` in the spf-module query.

### Node port read models — shared across node types

```typescript
// packages/core/.../query-services/usecase/query-models/

interface KeyReadModel         { systemId, keyId, name }
interface ValueReadModel       { systemId, valueId, name }
interface KeyValuePairReadModel { key: KeyReadModel, value: ValueReadModel }

interface IntentReadModel      { systemId, intentId, name }

interface DataPortReadModel {
  systemId, portId, name, portIoType (string), isStatic, totalLinksAtPort
}

interface ControlPortReadModel {
  systemId, portId, name, isStatic,
  allocatedIntents: IntentReadModel[],
  totalLinksAtPort
}
```

These types live in `usecase/query-models/` and are shared by the usecase graph query, `SpfModuleReadModel`, and future `SubsystemReadModel`.

### Graph view read models

```
ReadModelBase { systemId }
  │
  └── SpfModuleReadModel
        parentId?, instanceId, alias, name, moduleId,
        subgraphId, containerId, definitionSystemId,
        maxInputPortsSupported, maxOutputPortsSupported, maxControlPortsSupported,
        dataPorts: DataPortReadModel[],
        controlPorts: ControlPortReadModel[]
```

### Definition read models

```
ReadModelBase { systemId }
  │
  └── SpfModuleDefinitionReadModel
        name, moduleId                    ← always loaded

        // includeSummary (null when not requested)
        maxInputPortsSupported: number | null
        maxOutputPortsSupported: number | null
        maxControlPortsSupported: number | null

        // includeFullDetails (null when not requested)
        dataPortGroups: DataPortGroupReadModel[] | null
          systemId, portIoType, maxAllowedPortCount
          ports: DataPortDefinitionReadModel[] | null
            systemId, dataPortId, name
        staticControlPorts: StaticControlPortDefinitionReadModel[] | null
          systemId, portId, portName
          staticIntents: StaticIntentDefinitionReadModel[] | null
            systemId, intentId, name
        dynamicIntents: DynamicIntentDefinitionReadModel[] | null
          systemId, intentId, name, maxPort
        parameterDefinitions: ParameterDefinitionReadModel[] | null
```

### Tuning config read models

```
ReadModelBase { systemId }
  │
  ├── CkvTuningReadModel
  │     keyValuePairs: KeyValuePairReadModel[]
  │     parameters:    ParamSummaryReadModel[]
  │
  ├── TkvTuningReadModel
  │     moduleTagIdMapSystemId: number
  │     keyValuePairs: KeyValuePairReadModel[]
  │     parameters:    ParamSummaryReadModel[]
  │
  └── TagTuningReadModel
        tagDefinitionSystemId, tagId, tagName
        tkvs: TkvTuningReadModel[]

SpfModuleTuningConfigReadModel  (not extending ReadModelBase — aggregate result, not a DB row)
  moduleSystemId: number
  ckvs:  CkvTuningReadModel[] | null   ← null when includeCkvs=false
  tags:  TagTuningReadModel[] | null   ← null when includeTags=false

ParamSummaryReadModel  — param identity only, no binary payload
  systemId, parameterId, name, description?
```

### API response DTO shape

```typescript
// packages/api/src/presentation/rest/modules/spf-module/dto/shared/spf-module.dto.ts

class SpfModuleDto extends BaseConnectableComponentDto {
  alias: string
  moduleId: number
  subgraphId: number
  containerId: number
  maxInputPortsSupported: number
  maxOutputPortsSupported: number
  maxControlPortsSupported: number
  // heapId removed

  ckvs?:       CkvDto[]      // present only when ?include=ckvs
  tags?:       TagInfoDto[]  // present only when ?include=tags
  properties?: PropertyDto[] // reserved for future properties query service
}
```

`changeInfo?: ChangeInfoDto` is inherited from `BaseDto` (optional). The spf-module query controller sets it to `{ changeType: 'NONE' }` for all returned modules.

### Field sources per read model

| Field | Source table | Notes |
|---|---|---|
| `SpfModuleReadModel.systemId` | `nodes.system_id` | Identity key |
| `SpfModuleReadModel.instanceId` | `spf_modules.instance_id` | |
| `SpfModuleReadModel.alias` | `spf_modules.alias` | User-editable instance alias |
| `SpfModuleReadModel.name` | `spf_module_definitions.name` | Definition type name |
| `SpfModuleReadModel.moduleId` | `spf_module_definitions.module_definition_id` | Business key |
| `SpfModuleReadModel.subgraphId` | `subgraphs.subgraph_id` | Business key via join |
| `SpfModuleReadModel.containerId` | `containers.container_id` | Business key via join |
| `SpfModuleReadModel.maxInput/OutputPortsSupported` | SUM `data_port_groups.max_allowed_port_count` | Grouped by `port_io_type` |
| `SpfModuleReadModel.maxControlPortsSupported` | COUNT `static_control_port_definitions` | |
| `DataPortReadModel.portId` | `data_ports.data_port_id` | Business key |
| `DataPortReadModel.portIoType` | `data_ports.port_io_type` | String |
| `DataPortReadModel.totalLinksAtPort` | COUNT `data_links` | Overlay-aware |
| `ControlPortReadModel.portId` | `control_ports.port_id` | Business key |
| `ControlPortReadModel.totalLinksAtPort` | COUNT `control_links` | Overlay-aware |
| `IntentReadModel.name` | Generated: `Intent_{intentId}` | No name column in DB |
| `CkvTuningReadModel.keyValuePairs` | `ckv_values → value_definitions → key_definitions` | Key-value selector |
| `CkvTuningReadModel.parameters` | `ckv_parameter_payload → spf_module_parameter_definitions` | Names only |
| `TagTuningReadModel.tagId/tagName` | `tag_definitions` | Loaded in separate batch query |
| `TkvTuningReadModel.keyValuePairs` | `tkv_values → value_definitions → key_definitions` | Same tables as CKV |

---

## 6. Session Overlay

### Three-tier overlay — applied per service method

The overlay pattern is applied entirely at the persistence layer. Read models carry only entity data — no change state is propagated upward to handlers or the controller.

```typescript
// Every Db*QueryService follows this pattern
const session = applyOverlay
  ? await this.editActionsSvc.findActiveSession(fileSystemId)
  : null;

if (!session) return baseline;              // Tier 1 or 2

const editActions = await this.editActionsSvc
  .getEditActionsByAggregateId(session.sessionId, aggregateId);

if (!editActions.length) return baseline;  // Tier 2

return applyOverlay(baseline, editActions); // Tier 3
```

**Effect on results:**
- `DELETE` draft → entity excluded from result array
- `UPDATE` draft → entity payload fields merged onto baseline row
- `CREATE` draft → entity injected into result (no baseline row exists)

Change state tracking (which entities were staged, what operation, at which changeId) is a separate concern addressed by a dedicated change-details API (future endpoint).

---

## 7. API: POST /spf-modules/query

### Use case

Return graph-view data for a set of known module `systemId` values — module identity, ports, definition capabilities.

### Call flow

```
POST /spf-modules/query
  Body: { systemIds: ["8388613", "8388614"] }
  Query: (no ?include — base fields only)

  ▼
SpfModuleController.querySpfModules()
  1. Parse ?include= → Set<string>; includeCkvs = has('ckvs'), includeTags = has('tags')
  2. Validate systemIds[] — reject empty with HTTP 400
  3. Parse string IDs → number[] — reject non-integers with HTTP 400
  4. new QuerySpfModulesQuery(systemIds, projectId, includeCkvs, includeTags, clientId)
  5. queryBus.execute(query)
  6. Map QuerySpfModulesResult → SpfModuleDto[]
     - dto.changeInfo = { changeType: 'NONE' }
  7. Return ApiResult<SpfModuleDto[]> with HTTP 200

  ▼
QuerySpfModulesHandler.handle(query)
  Step 1: Resolve projectId → fileSystemId via ProjectQueryService
  Step 2: SpfModuleQueryService.findMany(systemIds, fileSystemId, applyOverlay=true)
  Step 3: if (includeCkvs || includeTags) && modules.length > 0:
            SpfTuningConfigService.getModuleTuningConfig(
              moduleSystemId, fileSystemId, includeCkvs, includeTags, true)
          → tuningConfigMap
  Returns: QuerySpfModulesResult { modules, tuningConfigMap? }

  ▼
DbSpfModuleQueryService.findMany(systemIds, fileSystemId, applyOverlay)
  Step 1: loadModuleRoots(systemIds)
          Query: Node INNER JOIN spf_modules WHERE node.system_id IN (?)
          Returns: ModuleRootData[] { systemId, alias, definitionSystemId,
                   subgraphSystemId, containerSystemId }

  Step 2: loadDefinitionCapabilities(defIds, roots, fileSystemId, applyOverlay)
          Delegates to SpfModuleDefinitionQueryService.getDefinition() per unique defId
          Includes: { includeSummary: true, includeFullDetails: false }
          ─ spf_module_definitions row (name, moduleId) — always loaded
          ─ data_port_groups rows — three-tier overlay
            → maxInputPortsSupported, maxOutputPortsSupported
          ─ static_control_port_definitions rows — three-tier overlay
            → maxControlPortsSupported
          Subgraph/container business keys resolved from:
            SELECT subgraph_id FROM subgraphs WHERE system_id IN (?)
            SELECT container_id FROM containers WHERE system_id IN (?)

  Step 3: DataPortQueryService.getDataPorts(nodeId, fileSystemId, applyOverlay)
          Query: data_ports WHERE node_system_id = ?
          Three-tier overlay on data_ports rows
          Link count: COUNT data_links per port (overlay-aware) → totalLinksAtPort

  Step 4: ControlPortQueryService.getControlPorts(nodeId, fileSystemId, applyOverlay)
          Query: control_ports LEFT JOIN intents WHERE node_system_id = ?
          Three-tier overlay on control_ports rows
          Link count: COUNT control_links per port (overlay-aware) → totalLinksAtPort

  Step 5: loadModuleDraftMap(systemIds, fileSystemId, applyOverlay)
          Three-tier overlay on spf_modules rows only
          DELETE draft → module excluded from result
          UPDATE draft → alias merged onto baseline

  Step 6: Assemble in memory → SpfModuleReadModel[]
```

### Query class

```typescript
// packages/core/src/application/usecase-designer/spf-module/query/query-spf-modules.query.ts
export class QuerySpfModulesQuery extends BaseQuery {
  constructor(
    public readonly systemIds:   number[],
    public readonly projectId:   number,
    public readonly includeCkvs: boolean,
    public readonly includeTags: boolean,
    clientId: string,
  ) { super(clientId); }
}
```

### Handler

```typescript
// packages/core/src/application/usecase-designer/spf-module/query/query-spf-modules.handler.ts

export interface QuerySpfModulesResult {
  modules:          SpfModuleReadModel[];
  tuningConfigMap?: Map<number, SpfModuleTuningConfigReadModel>;
}

export class QuerySpfModulesHandler
  implements QueryHandler<QuerySpfModulesQuery, Promise<QuerySpfModulesResult>> {

  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QuerySpfModulesQuery): Promise<QuerySpfModulesResult> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(query.projectId);

    const modules = await this.queryServices.spfModuleQueryService.findMany(
      query.systemIds, fileSystemId, true,
    );

    const needsTuning = (query.includeCkvs || query.includeTags) && modules.length > 0;
    if (!needsTuning) return {modules};

    const tuningResults = await Promise.all(
      modules.map(async m => ({
        moduleSystemId: m.systemId,
        tuningConfig: await this.queryServices.spfModuleQueryService
          .spfTuningConfigService.getModuleTuningConfig(
            m.systemId, fileSystemId, query.includeCkvs, query.includeTags, true,
          ),
      })),
    );

    return {
      modules,
      tuningConfigMap: new Map(tuningResults.map(r => [r.moduleSystemId, r.tuningConfig])),
    };
  }
}
```

### DB queries issued per request (session active)

```
Query 1: Node INNER JOIN spf_modules WHERE system_id IN (?)
         ← module roots

Per unique definition (deduped across modules):
  Query 2a: spf_module_definitions WHERE system_id = ?         ← identity + overlay
  Query 2b: data_port_groups WHERE module_definition_system_id = ?  ← overlay
  Query 2c: static_control_port_definitions WHERE module_definition_system_id = ?  ← overlay
  Query 2d: edit_actions WHERE aggregate_id = ? (definitionSystemId)  ← definition drafts

Query 3: subgraphs WHERE system_id IN (?)   ← subgraphId business keys
Query 4: containers WHERE system_id IN (?)  ← containerId business keys

Per module node:
  Query 5: data_ports WHERE node_system_id = ?            ← data ports
  Query 6: COUNT data_links per port (LEFT JOIN)          ← totalLinksAtPort (overlay-aware)
  Query 7: control_ports LEFT JOIN intents                ← control ports + intents
  Query 8: COUNT control_links per port (LEFT JOIN)       ← totalLinksAtPort (overlay-aware)
  Query 9: edit_actions WHERE aggregate_id = ? (nodeSystemId)  ← port drafts

Query 10: edit_actions WHERE aggregate_id IN (nodeSystemIds)
          ← module-level drafts (spf_modules UPDATE/DELETE)
```

When `applyOverlay=false` or no session active: all edit_actions queries are skipped.

### Error handling

| Condition | Response |
|---|---|
| `systemIds` empty/missing | HTTP 400 |
| Invalid ID format (non-integer) | HTTP 400 |
| Unknown `systemIds` in input | Silently omitted — partial result, HTTP 200 |
| Project not found | HTTP 404 |
| DB error | HTTP 422 |

---

## 8. API: POST /spf-modules/query?include=ckvs,tags

### Use case

Same as §7 but each `SpfModuleDto` in the response also includes CKV and/or TKV catalogue data — parameter names only, no binary payload values. Used by clients that need both graph view and tuning navigation in a single call.

### Why one handler

`?include=ckvs,tags` is a **depth variant** of the same use case — same modules, same error conditions, response is a superset. One handler with flags, result type carries both.

### `?include=` parameter

| Value | Effect |
|---|---|
| _(absent)_ | Base module fields only — no tuning data loaded |
| `ckvs` | Load CKV catalogue (key-value selectors + param names) |
| `tags` | Load tag/TKV catalogue (key-value selectors + param names) |
| `ckvs,tags` | Load both CKV and tag/TKV catalogues |
| `properties` | Reserved — properties query service not yet implemented |

### `SpfTuningConfigService` port

```typescript
// @arc/core port
interface SpfTuningConfigService {
  getModuleTuningConfig(
    spfModuleSystemId: number,
    fileSystemId:      number,
    includeCkvs:       boolean,
    includeTags:       boolean,
    applyOverlay?:     boolean,
  ): Promise<SpfModuleTuningConfigReadModel>;
}
```

- `ckvs` is `null` in the returned read model when `includeCkvs=false`
- `tags` is `null` in the returned read model when `includeTags=false`

Accessible as `SpfModuleQueryService.spfTuningConfigService`.

### DB queries when include flags are set — per module

```
When includeCkvs=true:
  Query A: ckv + ckv_values + value_definitions + key_definitions
           + ckv_parameter_payload + spf_module_parameter_definitions
           WHERE ckv.spf_module_system_id = ?
           ← CKVs with key-value selectors and param names (no binary payload)

When includeTags=true:
  Query B: module_tag_id_map + tkv + tkv_values + value_definitions + key_definitions
           + tkv_parameter_payload + spf_module_parameter_definitions
           WHERE module_tag_id_map.spf_module_system_id = ?
           ← Tags + TKVs with key-value selectors and param names

  Query C: tag_definitions WHERE system_id IN (?)
           ← Tag name + tagId for each tag group
```

Three-tier overlay applied to CKV and TKV rows.

### Why no binary blobs loaded

`ckv_parameter_payload.payload` and `tkv_parameter_payload.payload` are `BLOB` columns. The implementation joins `payloadCollection` to reach `spfParameter` (for name/description) — the blob `payload` column is present on the row but never accessed in the read model mapping.

---

## 9. API: POST /spf-modules (Create)

### Use case

Create a new SPF module instance in the active edit session. Returns the created module as `SpfModuleDto`.

### This is a command, not a query

Uses `CommandBus` and `UnitOfWork`. The handler stages the creation via the edit session (writes to `edit_actions`), then reads back the staged module via `SpfModuleQueryService.findOne()`.

### Handler sketch

```typescript
export class CreateSpfModuleHandler
  implements CommandHandler<CreateSpfModuleCommand, SpfModuleReadModel> {

  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: CreateSpfModuleCommand): Promise<SpfModuleReadModel> {
    // 1. Validate definition exists
    // 2. Stage CREATE via edit session (writes to edit_actions)
    // 3. Read back the staged module via SpfModuleQueryService.findOne()
    // 4. Return SpfModuleReadModel to controller
  }
}
```

---

## 10. Persistence Layer Wiring

### Service instantiation — `DbQueryServices`

All persistence services are instantiated in `typeorm-query-services.ts`. A single `EditActionsQueryService` instance is shared across all SPF module services — avoids duplicate session lookups.

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

export class DbQueryServices implements QueryServices {
  readonly spfModuleQueryService:           SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    this.spfModuleDefinitionQueryService = new DbSpfModuleDefinitionQueryService(
      dataSource,
      editActionsQueryService,
      // Internally creates: DbParameterDefinitionQueryService
    );

    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource,
      editActionsQueryService,
      this.spfModuleDefinitionQueryService,
      // Internally creates: DbDataPortQueryService + DbControlPortQueryService
      //                      + DbSpfTuningConfigService
    );
  }
}
```

### Service ownership tree

```
DbQueryServices
  ├── DbSpfModuleQueryService
  │     ├── DbDataPortQueryService      ← node/port/ — data ports + overlay-aware link counts
  │     ├── DbControlPortQueryService   ← node/port/ — control ports + intents + overlay-aware link counts
  │     └── DbSpfTuningConfigService    ← spf-module/ — CKV/TKV/tag tuning catalogue
  │
  └── DbSpfModuleDefinitionQueryService
        └── DbParameterDefinitionQueryService ← definition/ — param definitions
```

### Files in `@arc/persistence`

| File | Role |
|---|---|
| `queries/typeorm-query-services.ts` | Wires all SPF module services into `DbQueryServices` |
| `queries/spf-module/db-spf-module-query-service.ts` | Full module assembly — 6-step pipeline |
| `queries/node/port/db-data-port-query-service.ts` | `DataPortQueryService` impl — any node type |
| `queries/node/port/db-control-port-query-service.ts` | `ControlPortQueryService` impl — any node type |
| `queries/spf-module/db-spf-tuning-config-service.ts` | CKV/TKV/tag tuning config — `includeCkvs`/`includeTags` flags |
| `queries/spf-module-definition/db-spf-module-definition-query-service.ts` | Definition aggregate — `DefinitionIncludes` overlay |
| `queries/definition/db-parameter-definition-query-service.ts` | Parameter definition rows |

---

## 11. Folder Structure

```
packages/core/src/application/
  shared/
    read-model-base.ts                       ← ReadModelBase { systemId }
  ports/persistence/query-services/
    query-services.ts                        ← QueryServices interface
    node/
      port/
        data-port-query-service.ts           ← DataPortQueryService (getDataPorts)
        control-port-query-service.ts        ← ControlPortQueryService (getControlPorts)
    usecase/
      query-models/
        data-port-read-model.ts              ← DataPortReadModel (shared — node-generic)
        control-port-read-model.ts           ← ControlPortReadModel (shared — node-generic)
        intent-read-model.ts                 ← IntentReadModel
        key-vector-read-model.ts             ← KeyValuePairReadModel, KeyReadModel, ValueReadModel
    spf-module/
      spf-module-query-service.ts            ← SpfModuleQueryService (findOne, findMany, getModuleDefinitionSystemId)
      spf-module-read-model.ts               ← SpfModuleReadModel
      tuning/
        spf-tuning-config-service.ts         ← SpfTuningConfigService (includeCkvs, includeTags flags)
        tuning-config-read-model.ts          ← CkvTuningReadModel, TkvTuningReadModel, TagTuningReadModel,
                                                ParamSummaryReadModel, SpfModuleTuningConfigReadModel
                                                (ckvs/tags are null when not requested)
    spf-module-definition/
      definition-attribute.ts                ← DefinitionIncludes interface
      spf-module-definition-query-service.ts ← getDefinition(defId, fileSystemId, includes)
      spf-module-definition-read-model.ts    ← SpfModuleDefinitionReadModel + all definition child read models
      parameter-definition/
        parameter-definition-query-service.ts ← ParameterDefinitionQueryService
        parameter-definition-read-model.ts    ← ParameterDefinitionReadModel
  usecase-designer/
    spf-module/
      query/
        query-spf-modules.query.ts            ← QuerySpfModulesQuery (includeCkvs, includeTags)
        query-spf-modules.handler.ts          ← QuerySpfModulesHandler, QuerySpfModulesResult
      create/
        create-module.command.ts              ← CreateSpfModuleCommand
        create-module.handler.ts              ← CreateSpfModuleHandler

packages/infrastructure/persistence/src/.../queries/
  node/
    port/
      db-data-port-query-service.ts          ← DataPortQueryService impl + overlay-aware link count
      db-control-port-query-service.ts       ← ControlPortQueryService impl + overlay-aware link count
  spf-module/
    db-spf-module-query-service.ts           ← full 6-step assembly
    db-spf-tuning-config-service.ts          ← SpfTuningConfigService impl — skips DB when flag=false
  spf-module-definition/
    db-spf-module-definition-query-service.ts ← getDefinition() — DefinitionIncludes, per-chunk overlay
  definition/
    db-parameter-definition-query-service.ts  ← ParameterDefinitionQueryService impl
  edit-session/
    edit-actions-query-service.ts             ← shared session/overlay helpers
    overlay-merge.ts                          ← applyToCollection()
  module-calibration/
    db-ckv-calibration-query-service.ts       ← (future — cal-data endpoint)

packages/api/src/presentation/rest/modules/spf-module/
  spf-module.controller.ts   ← SpfModuleController (querySpfModules — @HttpCode(200), ?include= param)
  spf-module.module.ts       ← NestJS module — imports ArcCqrsModule
  dto/shared/
    spf-module.dto.ts        ← SpfModuleDto (no heapId; ckvs?, tags?, properties?; changeInfo? from BaseDto)
tests/e2e/spf-module/
  query-spf-modules.e2e-spec.ts
```

---

*End of Document*
