<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# SPF Module Query APIs — Low-Level Design

## Document Information

- **Version**: 2.0
- **Date**: June 2026
- **Status**: Draft
- **Endpoints**:
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query?includeTuningConfig=true`
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
6. [Change Info and Session Overlay](#6-change-info-and-session-overlay)
7. [API: POST /spf-modules/query](#7-api-post-spf-modulesquery)
8. [API: POST /spf-modules/query?includeTuningConfig=true](#8-api-post-spf-modulesqueryincludetuningconfigtrue)
9. [API: POST /spf-modules (Create)](#9-api-post-spf-modules-create)
10. [Folder Structure](#10-folder-structure)
11. [Implementation Order](#11-implementation-order)

---

## 1. Core Design Principles

### 1.1 One handler per user intent

A handler is created for each distinct **user intent** — not for each endpoint or each entity type. The test: if two operations differ in error conditions, response shape, or assembly logic they are different intents and need separate handlers.

```
Same intent → one handler with a flag:
  POST /spf-modules/query                        ← "give me these modules"
  POST /spf-modules/query?includeTuningConfig=true ← same intent, more data

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

The handler (in `@arc/core`) decides **what data** is needed and passes it as a flag or query parameter. The persistence layer decides **how** to load it. No infrastructure knowledge leaks upward.

### 1.5 Three-tier overlay pattern — applied at persistence layer

Every persistence service applies the same three-tier pattern:
- **Tier 1** — `applyOverlay = false` → skip session lookup entirely
- **Tier 2** — `applyOverlay = true`, no active session → read baseline directly
- **Tier 3** — `applyOverlay = true`, session active, changes present → merge overlay

---

## 2. Architecture Overview

```
HTTP Request
    │
    ▼
@arc/api — SpfModuleController
  - Validates input
  - Resolves projectId → fileSystemId (via QueryBus → ProjectQueryService)
  - Constructs Query object with includeTuningConfig flag
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
| Same resource, depth variant (`includeTuningConfig`) | One handler, flag on query | Same user intent, same error conditions, superset response |
| Different resource (`/query` vs `/properties`) | Separate handlers | Different primary entity, different errors, different response shape |
| Write vs read (`POST /spf-modules` vs `POST /spf-modules/query`) | Separate command/query handlers | Commands use `UnitOfWork`; queries use `QueryServices` only |

### Handlers for these APIs

```
QuerySpfModulesHandler          → POST /spf-modules/query (+ includeTuningConfig flag)
CreateSpfModuleHandler          → POST /spf-modules
GetSpfModulePropertiesHandler   → GET  /spf-modules/{id}/properties  (separate doc)
GetCkvCalibrationDataHandler    → GET  /spf-modules/{id}/cal-data    (separate doc)
GetTkvTagDataHandler            → GET  /spf-modules/{id}/tag-data    (separate doc)
```

---

## 4. Service Reuse Strategy

### Service ownership by aggregate slice

```
SpfModuleQueryService           owns: nodes + spf_modules + spf_module_definitions
                                       + subgraphs + containers
                                       + data_port_groups + static_control_port_definitions
  sub-services owned:
    DataPortQueryService        owns: data_ports + data_links (for link count)
    ControlPortQueryService     owns: control_ports + intents

SpfModuleDefinitionQueryService owns: spf_module_definitions (definition aggregate)
  sub-service owned:
    ParameterDefinitionQueryService owns: spf_module_parameter_definitions
```

### Reuse map across handlers

| Service method | Used by |
|---|---|
| `SpfModuleQueryService.findMany()` | `QuerySpfModulesHandler` |
| `SpfModuleQueryService.findOne()` | `GetSpfModulePropertiesHandler`, `GetCkvCalibrationDataHandler` |
| `SpfModuleQueryService.getModuleDefinitionSystemId()` | `GetCkvCalibrationDataHandler` |
| `DataPortQueryService.getDataPorts()` | `DbSpfModuleQueryService` (internal), future `SubsystemQueryService` |
| `ControlPortQueryService.getControlPorts()` | `DbSpfModuleQueryService` (internal), future `SubsystemQueryService` |
| `SpfTuningConfigService.getModuleTuningConfig()` | `QuerySpfModulesHandler` (when `includeTuningConfig=true`) |
| `SpfModuleDefinitionQueryService.parameterDefinitionQueryService.getParameterDefinitions()` | `GetCkvCalibrationDataHandler`, `GetTkvTagDataHandler` |

### Sub-service ownership pattern

`DataPortQueryService` and `ControlPortQueryService` are exposed as properties on `SpfModuleQueryService`. This allows handlers that only need ports (not the full module) to access them directly without going through the full assembly:

```typescript
// Handler that only needs ports directly (future use case)
const ports = await this.queryServices.spfModuleQueryService
  .dataPortQueryService.loadDataPorts(nodeIds, fileSystemId);

// Handler that needs the full module (current use case)
const modules = await this.queryServices.spfModuleQueryService
  .findMany(systemIds, fileSystemId);
// dataPorts and controlPorts are already inside each SpfModuleReadModel
```

---

## 5. Read Model Hierarchy

### Base types (shared by all read models)

```typescript
// packages/core/src/application/shared/change-vocabulary.ts
export interface ChangeInfo {
  changeType:    ChangeOperation;  // 'NONE' | 'CREATE' | 'UPDATE' | 'DELETE'
  changeId?:     number;           // EditActionRow.changeId
  changeStatus?: ChangeStatus;     // 'STAGED' | 'UNSTAGED'
}

// packages/core/src/application/shared/read-model-base.ts
export interface ReadModelBase {
  readonly systemId:   number;
  readonly changeInfo: ChangeInfo;
}
```

**Rule:** Any entity that has its own DB row has a read model extending `ReadModelBase`. This ensures uniform `changeInfo` tracking across all entities returned in responses.

### Graph view read models

```
ReadModelBase { systemId, changeInfo }
  │
  ├── SpfModuleReadModel
  │     parentId?, instanceId, alias, name, moduleId,
  │     subgraphId, containerId, definitionSystemId,
  │     maxInput/Output/ControlPortsSupported,
  │     dataPorts: SpfDataPortReadModel[],
  │     controlPorts: SpfControlPortReadModel[]
  │
  ├── SpfDataPortReadModel
  │     portId, name, portIoType (PortIoType), isStatic, totalLinksAtPort
  │
  └── SpfControlPortReadModel
        portId, name, isStatic,
        allocatedIntents: SpfIntentReadModel[]
              intentId, name ('Intent_{intentId}')
```

### Tuning config read models

```
ReadModelBase { systemId, changeInfo }
  │
  ├── CkvTuningReadModel
  │     keyValuePairs: CkvKeyValuePairReadModel[]
  │     parameters:    ParamSummaryReadModel[]
  │
  ├── TkvTuningReadModel
  │     moduleTagIdMapSystemId: number
  │     keyValuePairs: CkvKeyValuePairReadModel[]  ← same type as CKV
  │     parameters:    ParamSummaryReadModel[]
  │
  └── TagTuningReadModel
        tagDefinitionSystemId, tagId, tagName
        tkvs: TkvTuningReadModel[]

SpfModuleTuningConfigReadModel  (not extending ReadModelBase — aggregate result, not a DB row)
  moduleSystemId: number
  ckvs:  CkvTuningReadModel[]
  tags:  TagTuningReadModel[]

CkvKeyValuePairReadModel  (reused from reference — shared CKV+TKV key/value table chain)
  key:   CkvKeyReadModel   { keyId, name }
  value: CkvValueReadModel { valueId, name }

ParamSummaryReadModel  (new — param identity only, no binary, no paramStructure)
  systemId, parameterId, name, description?
```

### Read model reuse decisions

| Read model | Status | Used by |
|---|---|---|
| `CkvKeyReadModel`, `CkvValueReadModel`, `CkvKeyValuePairReadModel` | Copied from reference | Both CKV and TKV tuning read models |
| `CkvReadModel`, `ParameterPayloadReadModel` | Copied from reference | Reserved for cal-data endpoint — not used here |
| `ParamSummaryReadModel` | New | `CkvTuningReadModel`, `TkvTuningReadModel` |
| `CkvTuningReadModel` | New | `SpfModuleTuningConfigReadModel.ckvs` |
| `TkvTuningReadModel` | New | `TagTuningReadModel.tkvs` |
| `TagTuningReadModel` | New | `SpfModuleTuningConfigReadModel.tags` |
| `SpfModuleTuningConfigReadModel` | New | `QuerySpfModulesResult.tuningConfigMap` |

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
| `SpfDataPortReadModel.portId` | `data_ports.data_port_id` | Business key |
| `SpfDataPortReadModel.portIoType` | `data_ports.port_io_type` | Uses `PortIoType` domain type |
| `SpfDataPortReadModel.totalLinksAtPort` | COUNT `data_links` | Overlay-aware |
| `SpfControlPortReadModel.portId` | `control_ports.port_id` | Business key |
| `SpfIntentReadModel.name` | Generated: `Intent_{intentId}` | No name column in DB |
| `CkvTuningReadModel.keyValuePairs` | `ckv_values → value_definitions → key_definitions` | Key-value selector |
| `CkvTuningReadModel.parameters` | `ckv_parameter_payload → spf_module_parameter_definitions` | Names only |
| `TagTuningReadModel.tagId/tagName` | `tag_definitions` | Loaded in separate batch query |
| `TkvTuningReadModel.keyValuePairs` | `tkv_values → value_definitions → key_definitions` | Same tables as CKV |

---

## 6. Change Info and Session Overlay

### `ChangeInfo` on every read model

Every read model that represents a DB row extends `ReadModelBase` which carries `changeInfo`. When no session is active, `changeInfo.changeType` is always `'NONE'`. When a session is active and the entity has a staged change, `changeInfo` reflects the pending operation.

```
Module row in edit_actions (UPDATE)    → SpfModuleReadModel.changeInfo      = {changeType: 'UPDATE', changeId: 42, changeStatus: 'STAGED'}
Port row in edit_actions (CREATE)      → SpfDataPortReadModel.changeInfo    = {changeType: 'CREATE', changeId: 43, changeStatus: 'STAGED'}
No draft for entity                    → changeInfo = {changeType: 'NONE'}
```

### Parent `changeInfo` derives from children

`SpfModuleDto.changeInfo` in the API response reflects `UPDATE` if any child (port, CKV) has a pending draft — even if the module root itself was not directly modified. This derivation happens at the DTO mapper layer in `@arc/api`.

### Three-tier overlay — applied per service method

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

---

## 7. API: POST /spf-modules/query

### Use case

Return graph-view data for a set of known module `systemId` values — module identity, ports, definition capabilities.

### Call flow

```
POST /spf-modules/query
  Body: { systemIds: ["8388613", "8388614"] }
  Query: ?includeTuningConfig=false (default)

  ▼
SpfModuleController.querySpfModules()
  1. Validate systemIds[] — reject empty with HTTP 400
  2. Parse string IDs → number[] — reject non-integers with HTTP 400
  3. Resolve projectId → fileSystemId
  4. new QuerySpfModulesQuery(systemIds, fileSystemId, includeTuningConfig=false, clientId)
  5. queryBus.execute(query)
  6. Map SpfModuleReadModel[] → SpfModuleDto[]
  7. Return ApiResult<SpfModuleDto[]>

  ▼
QuerySpfModulesHandler.handle(query)
  calls: SpfModuleQueryService.findMany(query.systemIds, query.fileSystemId, applyOverlay=true)
  returns: SpfModuleReadModel[]

  ▼
DbSpfModuleQueryService.findMany(systemIds, fileSystemId, applyOverlay)
  Step 1: loadModuleRoots(systemIds)
          Query: Node INNER JOIN spf_modules WHERE node.system_id IN (?)
  Step 2: loadDefinitionCapabilities(defIds)
          Query: spf_module_definitions
                 LEFT JOIN data_port_groups
                 LEFT JOIN static_control_port_definitions
                 LEFT JOIN spf_modules → subgraphs, containers
          WHERE def.system_id IN (?) [deduped]
  Step 3: DataPortQueryService.loadDataPorts(systemIds, fileSystemId, applyOverlay)
          Query: data_ports WHERE node_system_id IN (?)
          + link count: data_links LEFT JOIN per port
          + three-tier overlay on data_ports
  Step 4: ControlPortQueryService.loadControlPorts(systemIds, fileSystemId, applyOverlay)
          Query: control_ports LEFT JOIN intents WHERE node_system_id IN (?)
          + three-tier overlay on control_ports
  Step 5: loadModuleDraftMap(systemIds, fileSystemId, applyOverlay)
          Three-tier overlay on spf_modules rows
  Step 6: Assemble in memory → SpfModuleReadModel[]
```

### Query class

```typescript
// packages/core/src/application/usecase-designer/spf-module/query/query-spf-modules.query.ts
export class QuerySpfModulesQuery extends BaseQuery {
  constructor(
    public readonly systemIds:            number[],
    public readonly fileSystemId:         number,
    public readonly includeTuningConfig:  boolean,
    clientId: string,
  ) { super(clientId); }
}
```

### Handler

```typescript
// packages/core/src/application/usecase-designer/spf-module/query/query-spf-modules.handler.ts

export interface QuerySpfModulesResult {
  modules:         SpfModuleReadModel[];
  tuningConfigMap: Map<number, SpfModuleTuningConfigReadModel>;
}

export class QuerySpfModulesHandler
  implements QueryHandler<QuerySpfModulesQuery, Promise<QuerySpfModulesResult>> {

  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QuerySpfModulesQuery): Promise<QuerySpfModulesResult> {
    const modules = await this.queryServices.spfModuleQueryService.findMany(
      query.systemIds,
      query.fileSystemId,
      true,
    );

    if (!query.includeTuningConfig || !modules.length) {
      return {modules, tuningConfigMap: new Map()};
    }

    // Load tuning config for all modules in parallel via SpfTuningConfigService
    const tuningResults = await Promise.all(
      modules.map(async m => ({
        moduleSystemId: m.systemId,
        tuningConfig: await this.queryServices.spfModuleQueryService
          .spfTuningConfigService.getModuleTuningConfig(
            m.systemId, query.fileSystemId, true,
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

The handler returns `QuerySpfModulesResult` — both `modules` and `tuningConfigMap` — to the controller. The controller assembles the final `SpfModuleDto[]`, populating `tuningConfig` per module from the map when `includeTuningConfig=true`.

### DB queries issued — 5 total (session active)

```
Query 1: Node INNER JOIN spf_modules                             ← module roots
Query 2: spf_module_definitions + data_port_groups + staticPorts ← capabilities
Query 3: data_ports + data_links (count)                        ← data ports
Query 4: control_ports + intents                                 ← control ports
Query 5: edit_actions WHERE aggregate_id IN (?)                  ← overlay drafts
```

When `applyOverlay=false` or no session active: Query 5 is skipped entirely.

### Error handling

| Condition | Response |
|---|---|
| `systemIds` empty/missing | HTTP 400 |
| Invalid ID format (non-integer) | HTTP 400 |
| Unknown `systemIds` in input | Silently omitted — partial result, HTTP 200 |
| Project not found | HTTP 404 |
| DB error | HTTP 422 |

---

## 8. API: POST /spf-modules/query?includeTuningConfig=true

### Use case

Same as §7 but each `SpfModuleDto` in the response also includes CKV and TKV catalogue data — parameter names only, no binary payload values. Used by clients that need both graph view and tuning navigation in a single call.

### Why one handler

`includeTuningConfig=true` is a **depth variant** of the same use case — same modules, same error conditions, response is a superset. One handler with a flag, result type carries both.

### Read models involved

```
QuerySpfModulesResult
  modules:         SpfModuleReadModel[]           ← from SpfModuleQueryService.findMany()
  tuningConfigMap: Map<moduleSystemId, SpfModuleTuningConfigReadModel>
                                                   ← from SpfTuningConfigService.getModuleTuningConfig()

SpfModuleTuningConfigReadModel
  moduleSystemId: number
  ckvs: CkvTuningReadModel[]
    systemId, changeInfo
    keyValuePairs: CkvKeyValuePairReadModel[]  ← reused from reference (same key/value tables)
    parameters: ParamSummaryReadModel[]        ← param id + name + description (no binary)
  tags: TagTuningReadModel[]
    systemId, tagDefinitionSystemId, tagId, tagName
    tkvs: TkvTuningReadModel[]
      systemId, moduleTagIdMapSystemId
      keyValuePairs: CkvKeyValuePairReadModel[]  ← same reused type
      parameters: ParamSummaryReadModel[]
```

`CkvReadModel` and `ParameterPayloadReadModel` (binary) are **not used** — they are reserved for the cal-data endpoint. `CkvKeyValuePairReadModel` is reused from the reference — same `key_definitions` + `value_definitions` tables serve both CKV and TKV selectors.

### `SpfTuningConfigService` — aggregate service

```typescript
// @arc/core port
interface SpfTuningConfigService {
  getModuleTuningConfig(
    spfModuleSystemId: number,
    fileSystemId:      number,
    applyOverlay?:     boolean,
  ): Promise<SpfModuleTuningConfigReadModel>;
}
```

Accessible as `SpfModuleQueryService.spfTuningConfigService` — a sub-service on the module service, same pattern as `dataPortQueryService` and `controlPortQueryService`.

### DB queries when `includeTuningConfig=true` — per module

```
Query 6: ckv + ckv_values + value_definitions + key_definitions
         + ckv_parameter_payload + spf_module_parameter_definitions
         WHERE ckv.spf_module_system_id = ?
         ← CKVs with key-value selectors and param names (no binary payload column selected)

Query 7: module_tag_id_map + tkv + tkv_values + value_definitions + key_definitions
         + tkv_parameter_payload + spf_module_parameter_definitions
         WHERE module_tag_id_map.spf_module_system_id = ?
         ← Tags + TKVs with key-value selectors and param names

Query 8: tag_definitions WHERE system_id IN (?)
         ← Tag name + tagId for each tag group
```

Three-tier overlay applied to CKV and TKV rows. Parameter definitions are not overlaid — they come from the definition aggregate, not the module instance aggregate.

### Why no binary blobs loaded

`ckv_parameter_payload.payload` and `tkv_parameter_payload.payload` are `BLOB` columns joined via `payloadCollection`. The TypeORM join does load the blob column unless excluded. The implementation joins `payloadCollection` to reach `spfParameter` (for name/description) — the blob `payload` column is present on the row but never accessed in the read model mapping. Future optimisation: use a select-projection query to exclude the blob column entirely.

### Response shape — `SpfModuleDto.tuningConfig` optional field

```typescript
class SpfModuleDto extends BaseConnectableComponentDto {
  // ... existing fields ...
  tuningConfig?: SpfModuleTuningConfigResponseDto;  // present only when includeTuningConfig=true
}
```

The controller maps `SpfModuleTuningConfigReadModel` → `SpfModuleTuningConfigResponseDto` (already exists in codebase) for each module that has a tuning config entry in the map.

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

---

## 10. Persistence Layer Wiring

### Service instantiation — `DbQueryServices`

All persistence services are instantiated in `typeorm-query-services.ts`. A single `EditActionsQueryService` instance is shared across all SPF module services — avoids duplicate session lookups.

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

export class DbQueryServices implements QueryServices {
  readonly spfModuleQueryService:           SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  // ... existing services ...

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    // SPF module service tree — shared EditActionsQueryService instance
    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource,
      editActionsQueryService,
      // Internally creates: DbDataPortQueryService + DbControlPortQueryService
    );

    this.spfModuleDefinitionQueryService = new DbSpfModuleDefinitionQueryService(
      dataSource,
      editActionsQueryService,
      // Internally creates: DbParameterDefinitionQueryService
    );
  }
}
```

### Service ownership tree

```
DbQueryServices
  ├── DbSpfModuleQueryService
  │     ├── DbDataPortQueryService      ← sub-service (data ports + link counts)
  │     └── DbControlPortQueryService   ← sub-service (control ports + intents)
  │
  └── DbSpfModuleDefinitionQueryService
        └── DbParameterDefinitionQueryService ← sub-service (param definitions)
```

### Files created/modified

| File | Status |
|---|---|
| `queries/typeorm-query-services.ts` | Modified — added SPF module services |
| `queries/spf-module/db-spf-module-query-service.ts` | Created |
| `queries/spf-module/db-data-port-query-service.ts` | Created |
| `queries/spf-module/db-control-port-query-service.ts` | Created |
| `queries/spf-module-definition/db-spf-module-definition-query-service.ts` | Created |
| `queries/definition/db-parameter-definition-query-service.ts` | Created (ported from reference) |

---

## 11. Folder Structure

```
packages/core/src/application/
  shared/
    change-vocabulary.ts          ← ChangeInfo, ChangeOperation, ChangeStatus (DONE)
    read-model-base.ts            ← ReadModelBase (DONE)
  ports/persistence/query-services/
    query-services.ts             ← QueryServices aggregate (DONE — has spf-module services)
    spf-module/
      spf-module-query-service.ts ← port interface: findOne, findMany, getModuleDefSystemId (DONE)
      spf-module-read-model.ts    ← SpfModuleReadModel (DONE)
      port/
        data-port-query-service.ts  ← DataPortQueryService port (DONE)
        data-port-read-model.ts     ← DataPortReadModel (DONE)
        control-port-query-service.ts ← ControlPortQueryService port (DONE)
        control-port-read-model.ts  ← ControlPortReadModel, IntentReadModel (DONE)
    spf-module-definition/
      spf-module-definition-query-service.ts  (DONE)
      parameter-definition/
        parameter-definition-query-service.ts (DONE)
        parameter-definition-read-model.ts    (DONE)
  usecase-designer/
    spf-module/
      query/                        ← NEW (T6 — handler to be created)
        query-spf-modules.query.ts
        query-spf-modules.handler.ts
      create/
        create-module.command.ts    (existing placeholder)
        create-module.handler.ts    (existing placeholder)
      get-cal-data/                 ← from Yu-Get-Cal-Data reference (future port)
        get-ckv-cal-data.query.ts
        get-ckv-cal-data.handler.ts
        ckv-calibration-read-model.ts
      param-parser/                 ← from Yu-Get-Cal-Data reference (future port)

packages/infrastructure/persistence/src/.../queries/
  spf-module/
    db-spf-module-query-service.ts    ← full assembly (DONE)
    db-data-port-query-service.ts     ← DataPortQueryService impl (DONE)
    db-control-port-query-service.ts  ← ControlPortQueryService impl (DONE)
  edit-session/
    edit-actions-query-service.ts     (existing)
    overlay-merge.ts                  (existing)
  spf-module-definition/              ← from Yu-Get-Cal-Data (future port)
    db-spf-module-definition-query-service.ts
  module-calibration/                 ← from Yu-Get-Cal-Data (future port)
    db-ckv-calibration-query-service.ts
  definition/                         ← from Yu-Get-Cal-Data (future port)
    db-parameter-definition-query-service.ts

packages/api/src/presentation/rest/modules/spf-module/
  spf-module.controller.ts          ← @Query('includeTuningConfig') added (DONE)
  dto/shared/
    spf-module.dto.ts               ← heapId removed (DONE)
```

---

## 12. Implementation Order

| Step | Task | Status | Package |
|------|------|--------|---------|
| T3 | `ChangeInfo` + `ReadModelBase` | ✅ Done | `@arc/core` |
| T1 | Remove `heapId` from `SpfModuleDto` | ✅ Done | `@arc/api` |
| T4 | `DataPortQueryService` port (`getDataPorts`) + `DbDataPortQueryService` | ✅ Done | `@arc/core`, `@arc/persistence` |
| T5 | `ControlPortQueryService` port (`getControlPorts`) + `DbControlPortQueryService` | ✅ Done | `@arc/core`, `@arc/persistence` |
| T6 | `SpfModuleQueryService` extended + `DbSpfModuleQueryService` assembly | ✅ Done | `@arc/core`, `@arc/persistence` |
| T2 | `includeTuningConfig` query param on controller | ✅ Done | `@arc/api` |
| — | `QuerySpfModulesQuery` + `QuerySpfModulesHandler` (returns `QuerySpfModulesResult`) | ✅ Done | `@arc/core` |
| — | Register `QuerySpfModulesQuery` in `QueryHandlerRegistry` | ✅ Done | `@arc/core` |
| — | Wire `DbSpfModuleQueryService` into `typeorm-query-services.ts` | ✅ Done | `@arc/persistence` |
| — | `ckv-read-model.ts` copied from reference | ✅ Done | `@arc/core` |
| — | Tuning config read models (`CkvTuningReadModel`, `TkvTuningReadModel`, `TagTuningReadModel`, `ParamSummaryReadModel`, `SpfModuleTuningConfigReadModel`) | ✅ Done | `@arc/core` |
| — | `SpfTuningConfigService` port + `DbSpfTuningConfigService` | ✅ Done | `@arc/core`, `@arc/persistence` |
| — | `SpfModuleQueryService.spfTuningConfigService` sub-service wired | ✅ Done | `@arc/core`, `@arc/persistence` |
| — | Rename port read models to avoid name clash with usecase models: `SpfDataPortReadModel`, `SpfControlPortReadModel`, `SpfIntentReadModel` | ✅ Done | `@arc/core`, `@arc/persistence` |
| — | Export all new types from `@arc/core` index; fix `ENTITY_NAMES` import to persistence-internal path; `read-model-base.ts` exported | ✅ Done | `@arc/core`, `@arc/persistence` |
| — | Controller implementation — replace `NOT_IMPLEMENTED` stub, inject `QueryBus`, map `QuerySpfModulesResult → SpfModuleDto[]` | ⬜ Next | `@arc/api` |
| — | DTO mapper: `SpfModuleReadModel → SpfModuleDto` + `SpfModuleTuningConfigReadModel → SpfModuleTuningConfigResponseDto` | ⬜ Next | `@arc/api` |
| — | Port `DbCkvCalibrationQueryService` from reference (for cal-data endpoint) | ⬜ Future | `@arc/persistence` |

---

*End of Document*
