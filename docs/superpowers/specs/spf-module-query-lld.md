<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# SPF Module Query APIs — Low-Level Design

## Document Information

- **Version**: 6.0
- **Date**: June 2026
- **Status**: Current
- **Endpoints**:
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules/query?include=ckvs,tags`
  - `POST /arc-api/v1/projects/{projectId}/spf-modules`
- **Related Documents**:
  - `edit-session-persistence-design.md` — Edit session overlay pattern
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
11. [Persistence Layer Wiring](#11-persistence-layer-wiring)
12. [Folder Structure](#12-folder-structure)

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

### 1.2 Services are the reuse boundary

Handlers call services. Services own one aggregate slice and are shared across handlers.

```
NodeQueryService            → getDataPorts, getControlPorts (any node type)
SpfModuleQueryService       → findOne, findMany + sub-services
SpfTuningConfigService      → getModuleTuningConfig (CKV/TKV catalogue)
SpfModuleDefinitionQueryService → getDefinition (definition aggregate)
```

### 1.3 Every query method returns `Result<T>`

Every public method on every query service port returns `Result<T>`. Private helpers throw — the outer `try/catch` on the public method converts to `Result.fail`. This ensures:
- Errors always surface explicitly
- The controller never sees an unhandled exception from business logic
- Partial failures (e.g. port load failed for one module) become warnings, not errors

### 1.4 Three-tier overlay at persistence layer

Overlay is applied entirely at `@arc/persistence`. Read models carry only entity data — no change state propagates upward. Definition tables are overlaid the same way as instance tables since definitions can be modified within a session.

### 1.5 Port names resolved from definition tables

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
  static fail<T>(...errors: Error[]): Result<T>

  get isFailure(): boolean
  get data(): T   // throws if isFailure — access only after checking isSuccess
}
```

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

DbSpfModuleQueryService.findMany()        SpfModuleQueryHandler.handle()     SpfModuleController.querySpfModules()
  Result<SpfModuleReadModel[]>     ──►      Result<SpfModuleDetailedReadModel>  ──►  ApiResult<SpfModuleDto[]>
  isFailure → fatal (stop)                  isFailure → HTTP 422 (thrown)           HTTP 200 (success path)
  warnings  → partial (continue)           warnings  → accumulated + returned
                                            isSuccess → map data to DTOs
```

### Fatal errors vs warnings

| Scenario | Treatment | Effect |
|---|---|---|
| Empty `systemIds` | `Result.fail(INVALID_INPUT)` | HTTP 400 — stops immediately |
| DB error loading module roots | `Result.fail(INTERNAL_ERROR)` | HTTP 422 — stops immediately |
| Definition load failed for one module | `Result.fail` → collected as fatal | HTTP 422 |
| Port load failed for one module | Warning added, empty ports returned | HTTP 200, module included |
| Tuning config failed for one module | Warning added, module still returned | HTTP 200, module included |

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
  3. Construct QuerySpfModulesQuery(systemIds, projectId, includeCkvs, includeTags)
  4. queryBus.execute(query) → Result<SpfModuleDetailedReadModel>
  5. result.isFailure → throw HttpException (HTTP 422)
  6. result.data.modules.map(m → SpfModuleDto)
  7. Return ApiResult<SpfModuleDto[]> HTTP 200

  ──────────────────────────────────────────────────────────────
  @arc/core  SpfModuleQueryHandler.handle()
  ──────────────────────────────────────────────────────────────
  1. ProjectQueryService.getFileIdByProjectId(projectId) → fileSystemId
  2. SpfModuleQueryService.findMany(systemIds, fileSystemId, true)
       → Result<SpfModuleReadModel[]>
       isFailure → return Result.fail (fatal)
       warnings  → accumulated
  3. If includeCkvs || includeTags:
       SpfTuningConfigService.getModuleTuningConfig(moduleId, fileSystemId, ...)
         per module in parallel → Result<SpfModuleTuningConfigReadModel>
         isFailure → add warning, return null (partial — module still included)
  4. return Result.ok({ modules, tuningConfigMap? }, accumulatedWarnings)

  ──────────────────────────────────────────────────────────────
  @arc/persistence  DbSpfModuleQueryService.findMany()
  ──────────────────────────────────────────────────────────────
  try/catch wraps all steps → Result.fail(INTERNAL_ERROR) on exception

  Step 1: loadModuleRoots(systemIds, fileSystemId, applyOverlay)
            → Result<ModuleRootData[]>  — fatal if DB error
  Step 2: loadDefinitionCapabilities(defIds, fileSystemId, applyOverlay)
            → Result<Map<defSystemId, Result<DefinitionCapabilityData>>>
            outer Result.fail → fatal
            inner Result per defId → fatal if any definition fails
  Step 3+4: nodeQueryService.getDataPorts/getControlPorts(nodeId, ...)
            per module in parallel
            → Result<DataPortReadModel[]> / Result<ControlPortReadModel[]>
            isFailure → add to warnings, empty ports returned (partial)
  Step 5: loadSpfModuleTableData → overlay spf_modules rows
            DELETE draft → exclude module
            UPDATE draft → merge alias
  Step 6: assemble in memory → SpfModuleReadModel[]
  return Result.ok(assembled, warnings)

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

2. QuerySpfModulesQuery constructed with:
   - systemIds: number[]
   - projectId: number
   - includeCkvs: boolean
   - includeTags: boolean

3. SpfModuleQueryHandler.handle():
   a. getFileIdByProjectId(projectId)           — throws (not yet Result-wrapped at project service)
   b. SpfModuleQueryService.findMany(...)        → Result<SpfModuleReadModel[]>
      └─ isFailure → return Result.fail(errors)  ← propagates to controller → HTTP 422
      └─ isSuccess → modules = result.data
                     warnings = [...result.warnings]

   c. if needsTuning: parallel per module:
      SpfTuningConfigService.getModuleTuningConfig(...)  → Result<SpfModuleTuningConfigReadModel>
      └─ isFailure → warnings.push(error message), skip this module's tuning
      └─ isSuccess → add to tuningConfigMap

   d. return Result.ok({ modules, tuningConfigMap? }, warnings)

4. Controller receives Result<SpfModuleDetailedReadModel>:
   └─ isFailure → throw HttpException(errors[0].message, HTTP_422)
   └─ isSuccess → map result.data.modules → SpfModuleDto[]
                  return { data: dtos, success: true, message: '...' }
```

### DB queries issued per request (session active, no tuning)

```
Query 1:  Node JOIN spf_modules WHERE system_id IN (?)
           + subgraphs WHERE system_id IN (?)
           + containers WHERE system_id IN (?)
           ← module roots with business keys

Per unique definition (deduped):
  Query 2a: spf_module_definitions WHERE system_id = ?         ← identity + overlay
  Query 2b: data_port_groups WHERE module_definition_system_id = ?  ← overlay
  Query 2c: static_control_port_definitions WHERE module_definition_system_id = ?  ← overlay
  Query 2d: edit_actions WHERE aggregate_id = ? (definitionSystemId)

Per module node:
  Query 3:  data_ports WHERE node_system_id = ?
  Query 4:  COUNT data_links per port (LEFT JOIN)               ← totalLinksAtPort
  Query 5:  control_ports LEFT JOIN intents WHERE node_system_id = ?
  Query 6:  COUNT control_links per port (LEFT JOIN)            ← totalLinksAtPort
  Query 7:  Node + spfModule WHERE node.systemId = ?            ← resolve definitionSystemId
  Query 8:  data_port_definitions INNER JOIN data_port_groups   ← authoritative port names
  Query 9:  static_control_port_definitions LEFT JOIN static_intents  ← authoritative names
  Query 10: edit_actions WHERE aggregate_id = ? (definitionSystemId)  ← definition name overlay
  Query 11: edit_actions WHERE aggregate_id = ? (nodeSystemId)  ← port instance drafts

Query 12: edit_actions for spf_modules rows                     ← module-level overlay
```

When `applyOverlay=false` or no active session: all edit_actions queries skipped.

---

## 5. Read Model Hierarchy

### `Result<T>` wraps all service returns

```
Result<T>
  isSuccess: boolean
  data: T          ← only accessible when isSuccess=true (throws otherwise)
  errors: Error[]  ← always [], non-empty on failure
  warnings: Warning[] ← always [], non-empty on partial success
```

### Node port read models (node-generic, shared with subsystem)

```typescript
// packages/core/.../usecase/query-models/

interface DataPortReadModel extends ReadModelBase {
  portId:           number;   // data_ports.data_port_id
  name:             string;   // data_port_definitions.name (with INTERNAL_ERROR fallback)
  portIoType:       string;   // 'Input' | 'Output'
  isStatic:         boolean;
  totalLinksAtPort: number;   // overlay-aware COUNT of data_links
}

interface ControlPortReadModel extends ReadModelBase {
  portId:           number;   // control_ports.port_id
  name:             string;   // static_control_port_definitions.portName (with fallback)
  isStatic:         boolean;
  allocatedIntents: IntentReadModel[];
  totalLinksAtPort: number;   // overlay-aware COUNT of control_links
}

interface IntentReadModel {
  systemId: number;
  intentId: number;
  name:     string;   // static_intent_definitions.name (fallback: 'Intent_{intentId}')
}
```

**Name resolution (module nodes only):**
```
nodeSystemId → Node → SpfModule.definitionSystemId
  → DataPortDefinition WHERE dataPortId = data_ports.dataPortId
  → StaticControlPortDefinition WHERE portId = control_ports.portId
  → StaticIntentDefinition WHERE intentId = intents.intentId
```
Subsystem nodes have no definition — instance column values are used directly.

### Graph view read model

```typescript
interface SpfModuleReadModel extends ReadModelBase {
  parentId?:               number;
  instanceId:              number;
  alias:                   string;   // spf_modules.alias — overlay-aware
  name:                    string;   // spf_module_definitions.name
  moduleId:                number;   // spf_module_definitions.module_definition_id
  definitionSystemId:      number;
  subgraphId:              number;   // subgraphs.subgraph_id (business key)
  containerId:             number;   // containers.container_id (business key)
  maxInputPortsSupported:  number;
  maxOutputPortsSupported: number;
  maxControlPortsSupported: number;
  dataPorts:               DataPortReadModel[];
  controlPorts:            ControlPortReadModel[];
}
```

### Handler result model

```typescript
interface SpfModuleDetailedReadModel {
  modules:         SpfModuleReadModel[];
  tuningConfigMap?: Map<number, SpfModuleTuningConfigReadModel>;
  // tuningConfigMap absent when includeCkvs=false AND includeTags=false
}
```

### Tuning read models

```typescript
interface SpfModuleTuningConfigReadModel {
  moduleSystemId: number;
  ckvs: CkvTuningReadModel[] | null;   // null = includeCkvs was false
  tags: TagTuningReadModel[] | null;   // null = includeTags was false
}

interface CkvTuningReadModel extends ReadModelBase {
  keyValuePairs: KeyValuePairReadModel[];
  parameters:    ParamSummaryReadModel[];
}

interface TagTuningReadModel extends ReadModelBase {
  tagDefinitionSystemId: number;
  tagId:   number;
  tagName: string;
  tkvs:    TkvTuningReadModel[];
}

interface TkvTuningReadModel extends ReadModelBase {
  moduleTagIdMapSystemId: number;
  keyValuePairs: KeyValuePairReadModel[];
  parameters:    ParamSummaryReadModel[];
}

interface ParamSummaryReadModel {
  systemId:    number;
  parameterId: number;
  name:        string;
  description?: string;
}
```

---

## 6. Session Overlay

### Three-tier pattern

Every persistence service method applies overlay independently:

```typescript
const session = applyOverlay
  ? await this.editActionsSvc.findActiveSession(fileSystemId)
  : null;                                           // Tier 1: skip

if (!session) return Result.ok(baselineData);       // Tier 2: no session

const editActions = await this.editActionsSvc
  .getEditActionsByAggregateId(session.sessionId, aggregateId);

if (!editActions.length) return Result.ok(baselineData);  // Tier 2: no drafts

return Result.ok(applyToCollection(baselineData, editActions));  // Tier 3: merge
```

**Effects:**
- `DELETE` draft → row excluded from result
- `UPDATE` draft → payload fields merged onto baseline row
- `CREATE` draft → row injected (no baseline row exists)

### What gets overlaid

| Table | Aggregate ID | Overlay applies to |
|---|---|---|
| `nodes` | nodeSystemId | parentId changes |
| `spf_modules` | nodeSystemId | alias UPDATE, module DELETE |
| `data_ports` | nodeSystemId | port CREATE/DELETE |
| `control_ports` | nodeSystemId | port CREATE/DELETE |
| `data_port_definitions` | definitionSystemId | name changes |
| `static_control_port_definitions` | definitionSystemId | portName changes |
| `static_intent_definitions` | definitionSystemId | intent name changes |
| `ckv` | spfModuleSystemId | CKV row CREATE/DELETE |
| `ckv_parameter_payload` | ckvSystemId | payload changes |
| `tkv` | spfModuleSystemId | TKV row CREATE/DELETE |
| `tkv_parameter_payload` | tkvSystemId | payload changes |

---

## 7. Handler and Query Classes

### QuerySpfModulesQuery

```typescript
// packages/core/.../usecase-designer/spf-module/query/query-spf-modules.query.ts

export class QuerySpfModulesQuery extends BaseQuery {
  constructor(
    public readonly systemIds:   number[],    // module node system IDs
    public readonly projectId:   number,      // resolved to fileSystemId in handler
    public readonly includeCkvs: boolean,     // load CKV catalogue
    public readonly includeTags: boolean,     // load tag/TKV catalogue
    clientId: string,
  ) { super(clientId); }
}
```

### SpfModuleQueryHandler

```typescript
// packages/core/.../usecase-designer/spf-module/query/query-spf-modules.handler.ts

export class SpfModuleQueryHandler
  implements QueryHandler<SpfModuleQuery, Promise<Result<SpfModuleDetailedReadModel>>>
{
  async handle(query: SpfModuleQuery): Promise<Result<SpfModuleDetailedReadModel>> {

    // 1. Resolve projectId → fileSystemId (throws on project not found)
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // 2. Load modules — fatal on failure, warnings on partial port failures
    const modulesResult = await this.queryServices.spfModuleQueryService
      .findMany(query.systemIds, fileSystemId, true);

    if (modulesResult.isFailure)
      return Result.fail(...modulesResult.errors);  // ← stop here

    const modules = modulesResult.data;
    const warnings = [...modulesResult.warnings];

    // 3. Load tuning catalogue if requested — failures become warnings
    if (!(query.includeCkvs || query.includeTags) || !modules.length)
      return Result.ok({modules}, warnings);

    const tuningResults = await Promise.all(modules.map(async m => {
      const r = await this.queryServices.spfModuleQueryService
        .spfTuningConfigService
        .getModuleTuningConfig(m.systemId, fileSystemId,
          query.includeCkvs, query.includeTags, true);

      if (r.isFailure) {
        warnings.push({message: `Tuning failed for module ${m.systemId}: ...`});
        return null;  // ← module still included, tuning absent
      }
      warnings.push(...r.warnings);
      return {moduleSystemId: m.systemId, tuningConfig: r.data};
    }));

    const tuningConfigMap = new Map(
      tuningResults.filter(Boolean).map(r => [r!.moduleSystemId, r!.tuningConfig])
    );

    return Result.ok({modules, tuningConfigMap}, warnings);
  }
}
```

### Controller unwrapping

```typescript
// packages/api/.../spf-module/spf-module.controller.ts

const result = await this.queryBus.execute<Result<SpfModuleDetailedReadModel>>(query);

if (result.isFailure) {
  throw new HttpException(
    result.errors[0]?.message ?? 'Failed to retrieve SPF modules',
    HttpStatus.UNPROCESSABLE_ENTITY,  // HTTP 422
  );
}

const dtos = result.data.modules.map(m => this.mapToSpfModuleDto(m));
return { data: dtos, success: true, message: 'SPF modules retrieved successfully' };
```

---

## 8. Persistence Layer — DbSpfModuleQueryService

### Public methods

```typescript
findOne(spfModuleSystemId, fileSystemId, applyOverlay):  Promise<Result<SpfModuleReadModel | null>>
findMany(systemIds, fileSystemId, applyOverlay):          Promise<Result<SpfModuleReadModel[]>>
```

Both wrapped in `try/catch` → `Result.fail(INTERNAL_ERROR)` on DB exception.

### findMany assembly pipeline

```
try {
  Step 1: loadModuleRoots(uniqueIds, fileSystemId, applyOverlay)
            → Result<ModuleRootData[]>
            Failure (DB error) → Result.fail — stops pipeline
            Applies overlay: nodes + spf_modules rows
            Resolves subgraphId + containerId business keys

  Step 2: loadDefinitionCapabilities(defIds, fileSystemId, applyOverlay)
            → Result<Map<defSystemId, Result<DefinitionCapabilityData>>>
            Outer failure → Result.fail — stops pipeline
            Inner failures per definition → Result.fail aggregated → stops pipeline
            Each definition: getDefinition(defId, ..., {includeSummary: true}) → Result<...>
            applyOverlay always true — definitions are part of the edit session

  Step 3+4: nodeQueryService.getDataPorts(nodeId, ...) → Result<DataPortReadModel[]>
            nodeQueryService.getControlPorts(nodeId, ...) → Result<ControlPortReadModel[]>
            Per module in parallel
            isFailure → warning added, empty array used (partial — module kept)

  Step 5: loadSpfModuleTableData → Map<nodeSystemId, EditActionRow>
            DELETE draft → module excluded in assembly
            UPDATE draft → alias merged

  Step 6: assemble SpfModuleReadModel[] from roots + capabilities + ports
            Collect all definition failures as errors → Result.fail if any
            return Result.ok(assembled, warnings)
} catch (err) {
  return Result.fail({code: INTERNAL_ERROR, message: err.message})
}
```

---

## 9. Persistence Layer — DbNodeQueryService

### Port name resolution flow

```
getDataPorts(nodeSystemId, fileSystemId, applyOverlay):
  try {
    Step 1: Load data_ports baseline rows
    Step 2: countDataLinksPerPort → overlay-aware link counts
    Step 3: Three-tier overlay on data_port rows
    Step 4: resolveDefinitionSystemId(nodeSystemId)
              → Node JOIN SpfModule → definitionSystemId
              → null for Subsystem nodes (no definition)
            if module:
              Load definition draft actions for definitionSystemId
              buildDataPortNameMap(definitionSystemId, draftMap)
                → data_port_definitions INNER JOIN data_port_groups
                → overlay DataPortDefinition actions
                → Map<dataPortId, name>
    Map: name = portNameMap?.get(row.dataPortId) ?? row.name ?? ''
    return Result.ok(portRows.map(...))
  } catch (err) {
    return Result.fail({code: INTERNAL_ERROR, message: '...'})
  }

getControlPorts(nodeSystemId, fileSystemId, applyOverlay):
  try {
    Step 1: Load control_ports + intents baseline rows
    Step 2: countControlLinksPerPort → overlay-aware link counts
    Step 3: Three-tier overlay on control_port rows
    Step 4: resolveDefinitionSystemId(nodeSystemId) → null for Subsystem
            if module:
              Load definition draft actions
              buildControlPortNameMaps(definitionSystemId, draftMap)
                → static_control_port_definitions LEFT JOIN static_intents
                → overlay StaticControlPortDefinition + StaticIntentDefinition actions
                → controlPortNameMap: Map<portId, portName>
                → intentNameMap:      Map<intentId, name>
    Map: name          = controlPortNameMap?.get(row.portId) ?? row.name ?? ''
         intent.name   = intentNameMap?.get(i.intentId) ?? 'Intent_{intentId}'
    return Result.ok(portRows.map(...))
  } catch (err) {
    return Result.fail({code: INTERNAL_ERROR, message: '...'})
  }
```

---

## 10. Persistence Layer — DbSpfTuningConfigService

### getModuleTuningConfig

```typescript
async getModuleTuningConfig(
  spfModuleSystemId, fileSystemId, includeCkvs, includeTags, applyOverlay
): Promise<Result<SpfModuleTuningConfigReadModel>> {
  try {
    // Load only requested sections — null = not requested
    const ckvsResult = includeCkvs ? await this.loadCkvs(...) : null;
    const tagsResult = includeTags ? await this.loadTags(...) : null;

    // Child failure → whole tuning fails (propagated to handler as warning)
    if (ckvsResult?.isFailure) return Result.fail(...ckvsResult.errors);
    if (tagsResult?.isFailure) return Result.fail(...tagsResult.errors);

    return Result.ok({
      moduleSystemId,
      ckvs: ckvsResult?.data ?? null,  // null = not requested
      tags: tagsResult?.data ?? null,
    });
  } catch (err) {
    return Result.fail({code: INTERNAL_ERROR, message: err.message});
  }
}
```

### loadCkvs / loadTags

Both return `Result<T>`. Overlay is applied at all aggregate levels:

```
Module aggregate (spfModuleSystemId):
  → Ckv CREATE/DELETE (tkvDraftMap)

CKV aggregate (ckv.systemId):
  → CkvParameterPayload changes
  → ckv_values: composite PK — no system_id, overlay not applicable at row level
    value changes captured in parent CKV UPDATE draft

Per ckv_value (by valueDefSystemId):
  → ValueDefinition, KeyDefinition overlay

Per payload (by payload.systemId):
  → SpfModuleParameterDefinition overlay
```

Errors inside per-row overlay are re-thrown — the outer `try/catch` on `loadCkvs`/`loadTags` returns `Result.fail(INTERNAL_ERROR)`.

### `?include=` flags

| `include` param | `includeCkvs` | `includeTags` | `ckvs` field | `tags` field |
|---|---|---|---|---|
| absent | false | false | null | null |
| `ckvs` | true | false | CkvTuningReadModel[] | null |
| `tags` | false | true | null | TagTuningReadModel[] |
| `ckvs,tags` | true | true | CkvTuningReadModel[] | TagTuningReadModel[] |

---

## 11. Persistence Layer Wiring

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

export class DbQueryServices implements QueryServices {
  readonly spfModuleQueryService:           SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  readonly containerQueryService:           ContainerQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    this.spfModuleDefinitionQueryService = new DbSpfModuleDefinitionQueryService(
      dataSource, editActionsQueryService,
    );

    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource,
      editActionsQueryService,
      this.spfModuleDefinitionQueryService,
      // Internally creates: DbNodeQueryService + DbSpfTuningConfigService
    );

    this.containerQueryService = new DbContainerQueryService(
      dataSource, editActionsQueryService,
    );
  }
}
```

### Service ownership tree

```
DbQueryServices
  ├── DbSpfModuleQueryService
  │     ├── DbNodeQueryService          ← node/ — data+control ports, definition name resolution
  │     │     resolves names via:
  │     │       DataPortDefinition, StaticControlPortDefinition, StaticIntentDefinition
  │     └── DbSpfTuningConfigService    ← spf-module/ — CKV/TKV/tag catalogue
  │
  ├── DbSpfModuleDefinitionQueryService ← spf-module-definition/ — definition aggregate
  │     └── DbParameterDefinitionQueryService
  │
  └── DbContainerQueryService           ← container/ — container identity
```

---

## 12. Folder Structure

```
packages/core/src/application/
  shared/
    read-model-base.ts                        ← ReadModelBase { systemId }
    Result/
      operation-result.ts                    ← Result<T>, Error, Warning types
  errors/
    error-codes.ts                           ← ERROR_CODES const (ERR_1xxx, ERR_4xxx, ERR_9xxx)
  ports/persistence/query-services/
    query-services.ts                        ← QueryServices interface
    node/
      node-query-service.ts                  ← NodeQueryService (getDataPorts, getControlPorts)
    usecase/query-models/
      data-port-read-model.ts                ← DataPortReadModel
      control-port-read-model.ts             ← ControlPortReadModel
      intent-read-model.ts                   ← IntentReadModel
      key-vector-read-model.ts               ← KeyValuePairReadModel
    spf-module/
      spf-module-query-service.ts            ← SpfModuleQueryService — returns Result<T>
      spf-module-read-model.ts               ← SpfModuleReadModel
      tuning/
        spf-tuning-config-service.ts         ← SpfTuningConfigService — returns Result<T>
        tuning-config-read-model.ts          ← CkvTuningReadModel, TagTuningReadModel, etc.
    spf-module-definition/
      definition-attribute.ts                ← DefinitionIncludes (includeSummary, includeFullDetails)
      spf-module-definition-query-service.ts ← returns Result<T>
      spf-module-definition-read-model.ts    ← SpfModuleDefinitionReadModel + child read models
  usecase-designer/
    spf-module/
      query/
        query-spf-modules.query.ts           ← QuerySpfModulesQuery (includeCkvs, includeTags)
        query-spf-modules.handler.ts         ← SpfModuleQueryHandler → Result<SpfModuleDetailedReadModel>

packages/infrastructure/persistence/src/.../queries/
  node/
    db-node-query-service.ts                 ← getDataPorts + getControlPorts
                                                resolves names from definition tables with overlay
  spf-module/
    db-spf-module-query-service.ts           ← findMany 6-step pipeline — all steps Result-wrapped
    db-spf-tuning-config-service.ts          ← loadCkvs/loadTags — Result<T>, per-row overlay
  spf-module-definition/
    db-spf-module-definition-query-service.ts ← getDefinition with DefinitionIncludes overlay
  container/
    db-container-query-service.ts            ← findMany with edit session overlay
  edit-session/
    edit-actions-query-service.ts            ← findActiveSession, getEditActionsByAggregateId
    overlay-merge.ts                         ← applyToCollection()

packages/api/src/presentation/rest/modules/spf-module/
  spf-module.controller.ts   ← unwraps Result<T>; isFailure → HTTP 422; isSuccess → SpfModuleDto[]
  dto/shared/
    spf-module.dto.ts        ← SpfModuleDto (alias, moduleId, subgraphId, containerId, ports, ckvs?, tags?)
tests/e2e/spf-module/
  query-spf-modules.e2e-spec.ts  ← verifies DTO shape, definition names, partial results, alias overlay
```

---

*End of Document*
