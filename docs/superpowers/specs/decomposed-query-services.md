<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# SPF Module Query — Service Decomposition Design

## Core Principle

```
Each query service owns one category of data.
  Step 1 — QueryBuilder: load entity rows for its owned tables
  Step 2 — Overlay: always applied — EditActionsQueryService is always called
  Step 3 — Return: a typed result interface — NOT a raw DB row

Raw DB rows never cross a method boundary.
The caller receives a typed result and maps it to the read model shape it needs.
Overlay is not optional — every service method always applies the edit session overlay.
```

This separation means:
- Services are reusable across APIs that need the same data in different shapes
- Adding a new API does not require changing existing services
- Each service can be tested independently against its entity rows and overlay logic

---

## Service Categories

Each service owns one category. The category boundary is defined by the DB tables the service is responsible for.

| Service | Category | Tables owned |
|---|---|---|
| `KeyValueDefQueryService` | Key-value definition data | `arc_values`, `arc_keys` |
| `ParameterPayloadQueryService` | Parameter payload data | `ckv_parameter_payload`, `tkv_parameter_payload`, `spf_module_parameter_definitions` |
| `SpfModuleDefinitionQueryService` | Module definition data | `spf_module_definitions`, `data_port_groups`, `data_port_definitions`, `static_control_port_definitions`, `static_intent_definitions`, `dynamic_intent_definitions`, `spf_module_parameter_definitions` |
| `PropertyDefinitionQueryService` | Property definition data | `module_property_definitions`, `subgraph_property_definitions`, `driver_property_definitions` |
| `NodeQueryService` | Node port instance data | `data_ports`, `control_ports`, `intents`, `data_links`, `control_links` |
| `SpfTuningConfigService` | Tuning calibration data | `ckv`, `ckv_values`, `tkv`, `tkv_values`, `module_tag_id_map` |
| `SpfModuleQueryService` | Module instance data | `nodes`, `spf_modules`, `subgraphs`, `containers` |
| `EditActionsQueryService` | Edit session actions | `edit_actions`, `project_sessions` |

---

## Service Graph

```
                    @arc/api
                    SpfModuleController
                         │
                         │ QueryBus
                         ▼
                    @arc/core
                    SpfModuleQueryHandler
                         │
           ┌─────────────┼──────────────────────┐
           │             │                       │
           ▼             ▼                       ▼
  SpfModuleQueryService  SpfTuningConfigService  PropertyDefinitionQueryService
  (coordinator)          (coordinator)            (category service)
           │                       │
     ┌─────┴──────┐         ┌──────┴──────────────────────────┐
     │            │         │             │                   │
     ▼            ▼         ▼             ▼                   ▼
NodeQueryService  SpfModule  KeyValueDef  ParameterPayload    SpfModuleDefinition
(category)        Definition QueryService QueryService        QueryService
                  QuerySvc   (category)   (category)          (category, param names)
                  (category,
                   counts)



                    ┌─────────────────────────────────────────┐
                    │         EditActionsQueryService          │
                    │         (shared infrastructure)          │
                    │                                         │
                    │  findActiveSession(fileSystemId)        │
                    │  getEditActionsByAggregateId(...)       │
                    │  getEditActionsByTable(...)             │
                    │  getAllEditActions(...)                  │
                    │                                         │
                    │  ◄── injected into every service above  │
                    │  ◄── called when applyOverlay = true    │
                    └─────────────────────────────────────────┘
```

---

## What Each Service Returns

A service method returns a **typed result interface** — never a raw DB row. The DB row is consumed internally. The caller maps the typed result to whatever read model shape it needs.

```
KeyValueDefQueryService.getByValueDefId(valueDefSystemId, fileSystemId)
  → KeyValueDefResult { systemId, valueId, name, keySystemId, keyId, keyName }
  caller maps to: KeyValuePairReadModel  (for CKV/TKV tuning)
                  KeyVectorReadModel     (for UseCase GKV)
                  any shape the caller needs

KeyValueDefQueryService.getByKeyDefId(keyDefSystemId, fileSystemId)
  → KeyValueDefResult[]

ParameterPayloadQueryService.getPayloadsForCkv(ckvSystemId, fileSystemId)
  → ParamPayloadResult { parameters: ParamSummaryReadModel[], payload?: Uint8Array }

ParameterPayloadQueryService.getPayloadsForTkv(tkvSystemId, fileSystemId)
  → ParamPayloadResult { parameters: ParamSummaryReadModel[], payload?: Uint8Array }

SpfTuningConfigService.queryCkvRows(spfModuleSystemId, fileSystemId, includes)
  → CkvQueryResult[] { systemId, valueDefIds? }
  // CkvRow consumed internally — CkvValues (composite PK, no systemId) → valueDefIds: number[]

SpfModuleDefinitionQueryService.getDefinition(defId, includes)
  → SpfModuleDefinitionResult (with requested child data)
  caller maps to: SpfModuleDefinitionReadModel  (API [4])
                  capability counts for SpfModuleReadModel  (API [1])
                  parameter names for tuning catalogue  (API [2])

NodeQueryService.getDataPorts(nodeId, fileSystemId)
  → DataPortResult[] (with link counts)
  caller maps to: DataPortReadModel[]

PropertyDefinitionQueryService.getModuleProperties(moduleSystemId, fileSystemId)
  → PropertyResult[] (with definition data)
  caller maps to: PropertyReadModel[]
```

---

## `KeyValueDefQueryService` — Two Methods

The service owns `arc_values` and `arc_keys`. Two methods — two directions of entry into the same category.

### Method 1 — `getByValueDefId(valueDefSystemId, fileSystemId)`

Caller knows the value's systemId, wants that value with its parent key.

```
Step 1 — QueryBuilder:
  dataSource.getRepository('ValueDefinition')
    .createQueryBuilder('v')
    .leftJoinAndSelect('v.keys', 'k')
    .where('v.systemId = :id', {id: valueDefSystemId})
    .getOne()

Step 2 — Overlay (always applied):
  session = editActionsSvc.findActiveSession(fileSystemId)
  actions = editActionsSvc.getEditActionsByAggregateId(session, valueDef.systemId)
  filter 'ValueDefinition' → applyToCollection([valueDef], actions)   → overlaid value
  filter 'KeyDefinition'   → applyToCollection([value.keys], actions) → overlaid key

Step 3 — Return KeyValueDefResult:
  { systemId, valueId, name, keySystemId: keys.systemId, keyId: keys.keyId, keyName: keys.name }
  // ValueDefinitionRow consumed internally — never returned
```

### Method 2 — `getByKeyDefId(keyDefSystemId, fileSystemId)`

Caller knows the key's systemId, wants all values that belong to it.

```
Step 1 — QueryBuilder:
  dataSource.getRepository('KeyDefinition')
    .createQueryBuilder('k')
    .leftJoinAndSelect('k.values', 'v')
    .where('k.systemId = :id', {id: keyDefSystemId})
    .getOne()

Step 2 — Overlay (always applied):
  session = editActionsSvc.findActiveSession(fileSystemId)
  actions = editActionsSvc.getEditActionsByAggregateId(session, keyDef.systemId)
  filter 'KeyDefinition'   → applyToCollection([keyDef], actions)    → overlaid key
  per value in keyDef.values:
    filter 'ValueDefinition' → applyToCollection([value], actions)   → overlaid value

Step 3 — Return KeyValueDefResult[]:
  values.map(v => ({ systemId: v.systemId, valueId: v.valueId, name: v.name,
                     keySystemId: key.systemId, keyId: key.keyId, keyName: key.name }))
  // KeyDefinitionRow and ValueDefinitionRow consumed internally — never returned
```

**Both methods use `EditActionsQueryService` for overlay. Overlay is always applied.**

---

## `ParameterPayloadQueryService` — Two Methods

The service owns `ckv_parameter_payload`, `tkv_parameter_payload`, and `spf_module_parameter_definitions`.

### Method 1 — `getPayloadsForCkv(ckvSystemId, fileSystemId)`

```
Step 1 — QueryBuilder:
  dataSource.getRepository('CkvParameterPayload')
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.spfParameter', 'param')
    .where('p.ckvSystemId = :id', {id: ckvSystemId})
    .getMany()

Step 2 — Overlay (always applied):
  session = editActionsSvc.findActiveSession(fileSystemId)
  per payload row:
    actions = editActionsSvc.getEditActionsByAggregateId(session, payload.systemId)
    filter 'CkvParameterPayload' → applyToCollection([payload], actions) → overlaid payload

Step 3 — Return ParamPayloadResult:
  {
    parameters: overlaidPayloads.map(p => ({
      systemId:    p.spfParameter.systemId,
      parameterId: p.spfParameter.paramId,
      name:        p.spfParameter.name,
    })),
    payload: overlaidPayloads[0]?.payload,  // binary payload bytes — optional
  }
  // DB rows consumed internally — never returned
```

### Method 2 — `getPayloadsForTkv(tkvSystemId, fileSystemId)`

Identical structure — owns `tkv_parameter_payload` instead of `ckv_parameter_payload`.

---

## `SpfTuningConfigService` — Decomposed `loadCkvs`

### Interfaces

```typescript
interface TuningBinIncludes {
  includeKeyValueDefs: boolean;
  includePayloads:     boolean;
}

interface CkvQueryResult {
  systemId:     number;
  valueDefIds?: number[];  // present when includeKeyValueDefs=true
                           // extracted from composite-PK CkvValues — CkvRow never returned
}

interface CkvLoadResult {
  systemId:       number;
  keyValuePairs?: KeyValuePairReadModel[];
  parameters?:    ParamSummaryReadModel[];
  payload?:       Uint8Array;
}
```

### Method 1 — `queryCkvRows(spfModuleSystemId, fileSystemId, includes)`

```
Step 1 — QueryBuilder:
  getRepository(Ckv).createQueryBuilder('ckv')
    .leftJoinAndSelect('ckv.values', 'ckvVal')  // only when includeKeyValueDefs=true
    .where('ckv.spfModuleSystemId = :id')
    .getMany()

Step 2 — Overlay (always applied):
  session = editActionsSvc.findActiveSession(fileSystemId)
  actions = editActionsSvc.getEditActionsByAggregateId(session, spfModuleSystemId)
  ckvActions = actions.filter(a => a.tableName === Ckv)
  overlaidRows = applyToCollection(rows, ckvActions)

Step 3 — Return CkvQueryResult[]:
  overlaidRows.map(row => ({
    systemId:    row.systemId,
    valueDefIds: row.values?.map(v => v.valueDefSystemId),
    // CkvRow consumed internally — CkvValues (composite PK) → FK only, never returned
  }))
```

### Method 2 — `buildCkvResult(ckv, fileSystemId, includes)`

```
Receives CkvQueryResult — not CkvRow.
Calls other services — overlay is always applied inside each service.

if includes.includeKeyValueDefs:
  per valueDefId in ckv.valueDefIds:
    → keyValueDefSvc.getByValueDefId(id, fileSystemId)
  result.keyValuePairs = results.map(r => ({
    key:   {systemId: r.keySystemId, keyId: r.keyId,    name: r.keyName},
    value: {systemId: r.systemId,    valueId: r.valueId, name: r.name},
  }))

if includes.includePayloads:
  → getParamPayloadSummary(ckv.systemId, CkvParameterPayload, fileSystemId, {
      includeBinaryPayload: includes.includePayload,
    })
  result.parameters = summary.parameters
  result.payload    = summary.payload

return CkvLoadResult
```

### Method 3 — `getParamPayloadSummary(binId, binTableName, fileSystemId, includes)`

```
Shared by CKV and TKV — binTableName determines which service method to call.

if binTableName === CkvParameterPayload:
  → parameterPayloadSvc.getPayloadsForCkv(binId, fileSystemId)
else:
  → parameterPayloadSvc.getPayloadsForTkv(binId, fileSystemId)

return {
  parameters: payloadResult.parameters,
  payload:    includes.includeBinaryPayload ? payloadResult.payload : undefined,
}
```

### Method 4 — `loadCkvs(spfModuleSystemId, fileSystemId, includes)` — coordinator

```
ckvQueryResults = await queryCkvRows(spfModuleSystemId, fileSystemId, includes)
results = await Promise.all(
  ckvQueryResults.map(ckv => buildCkvResult(ckv, fileSystemId, includes))
)
return Result.ok(results)
```

---

## Edit Session Overlay — Self-Contained Per Service

Every service applies its own overlay unconditionally. No `applyOverlay` flag on any method — the edit session is always consulted.

```
loadCkvs
  │
  ├─► queryCkvRows(spfModuleSystemId, fileSystemId, includes)
  │     └─► editActionsSvc.getEditActionsByAggregateId(...)
  │
  └─► buildCkvResult(ckv, fileSystemId, includes)
        │
        ├─► keyValueDefSvc.getByValueDefId(id, fileSystemId)
        │     └─► editActionsSvc.getEditActionsByAggregateId(...)
        │
        └─► getParamPayloadSummary(ckv.systemId, CkvParameterPayload, fileSystemId, includes)
              └─► parameterPayloadSvc.getPayloadsForCkv(binId, fileSystemId)
                    └─► editActionsSvc.getEditActionsByAggregateId(...)
```

**Rule:** Every method owns its own `EditActionsQueryService` call. No session object is threaded through. No service inherits overlay state from another. If no active session exists, `findActiveSession` returns null and the base QueryBuilder result is returned as-is.

---

## Target APIs — Which Services Are Used

```
API [1] POST /spf-modules/query
  SpfModuleQueryService (coordinator)
    ├── own: NodeRow + SpfModuleRow
    ├── NodeQueryService                    (data ports, control ports)
    └── SpfModuleDefinitionQueryService     (port capacity counts)

API [2] POST /spf-modules/query?include=ckvs,tags,properties
  SpfModuleQueryService (same as [1])   +
  SpfTuningConfigService (coordinator)
    ├── own: CkvRow, TkvRow, ModuleTagIdMapRow
    ├── KeyValueDefQueryService             (value+key data per CKV/TKV entry)
    ├── ParameterPayloadQueryService        (param names + payload per CKV/TKV)
    └── PropertyDefinitionQueryService      (when include=properties)

API [3] GET /spf-modules/{id}/cal-data/{ckvId}   (future)
  SpfTuningConfigService (coordinator)
    ├── own: CkvRow
    ├── KeyValueDefQueryService             (key-value selector for this CKV)
    └── ParameterPayloadQueryService        (binary payload)

API [4] GET /spf-module-definitions   (future)
  SpfModuleDefinitionQueryService (full details)
    └── own: all definition tables
```

---

## Files to Create

| File | Service | Category |
|---|---|---|
| `queries/key-value/key-value-def-query-service.ts` | `KeyValueDefQueryService` | `arc_values`, `arc_keys` |
| `queries/parameter-payload/parameter-payload-query-service.ts` | `ParameterPayloadQueryService` | `ckv_parameter_payload`, `tkv_parameter_payload` |
| `queries/property-definition/property-definition-query-service.ts` | `PropertyDefinitionQueryService` | property definition tables |

## Files to Update

| File | Change |
|---|---|
| `queries/spf-module/db-spf-tuning-config-service.ts` | Decompose `loadCkvs`/`loadTags` into `queryCkvRows`, `buildCkvResult`, `getParamPayloadSummary`; delegate to `KeyValueDefQueryService` + `ParameterPayloadQueryService`; remove `overlayValueDefRow`, `overlayPayloadRow` |
| `queries/usecase/db-usecase-query-service.ts` | GKV uses `KeyValueDefQueryService.getByValueDefId()` |
| `queries/usecase/usecase-query-mappers.ts` | `mapValueToKeyVector` removed — caller maps `KeyValueDefResult` directly |
| `queries/typeorm-query-services.ts` | Wire `KeyValueDefQueryService`, `ParameterPayloadQueryService`, `PropertyDefinitionQueryService` |
