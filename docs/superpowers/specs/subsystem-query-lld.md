<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Subsystem Query APIs — Low-Level Design

## Document Information

- **Version**: 1.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `POST /arc-api/v1/projects/{projectId}/subsystems/query`
  - `POST /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}/components/query`
- **Related Documents**:
  - `container-query-lld.md` — Parallel design (same CQRS + overlay pattern)
  - `subgraph-query-lld.md` — Parallel design
  - `spf-module-query-lld.md` — Reference design
  - `edit-session-persistence-design.md` — Edit session overlay pattern

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Read Models](#2-read-models)
3. [Architecture and Call Flow](#3-architecture-and-call-flow)
4. [Edit Session Overlay](#4-edit-session-overlay)
5. [CQRS — Queries and Handlers](#5-cqrs--queries-and-handlers)
6. [Persistence Layer — DbSubsystemQueryService](#6-persistence-layer--dbsubsystemqueryservice)
7. [Port Interface and Wiring](#7-port-interface-and-wiring)
8. [DTO Mapping](#8-dto-mapping)
9. [Folder Structure](#9-folder-structure)

---

## 1. Requirements

### 1.1 Endpoints and response DTOs

| Endpoint | HTTP | Body | Response DTO |
|---|---|---|---|
| `/subsystems/query` | POST | `{ systemIds: string[] }` required | `SubsystemDto[]` |
| `/subsystems/{subsystemSystemId}/components/query` | POST | `{ systemIds: string[] }` optional (usecase IDs) | `BaseComponentDto<number>[]` |

### 1.2 Functional requirements — POST /subsystems/query

#### FR-SSQ-01: Request validation — empty systemIds
If `body.systemIds` is absent or empty → `400 Bad Request`.

#### FR-SSQ-02: Request validation — invalid systemId format
If any entry cannot be parsed as a positive integer → `400 Bad Request`.

#### FR-SSQ-03: Deduplication
Persistence layer MUST deduplicate `systemIds` silently. Response MUST NOT contain duplicates.

#### FR-SSQ-04: Partial result for unknown IDs
Only subsystems found are returned. No error raised for unrecognised IDs.

#### FR-SSQ-05: projectId resolution
Controller MUST resolve `projectId` to `fileSystemId` via `ProjectQueryService.getFileIdByProjectId`. If not found → `404 Not Found`.

#### FR-SSQ-06: Full recursive tree loaded to leaf
Each `SubsystemDto.children` is a `ComponentCollectionWithSubsystemsDto` containing:
- `spfModules` — direct child module nodes at this level
- `dataLinks` — links whose both endpoint ports belong to nodes at this level
- `controlLinks` — links whose both endpoint ports belong to nodes at this level
- `subsystems` — direct child subsystem nodes, each recursively populated to leaf

Tree is assembled **in-memory** from a single batch load. No per-node DB queries.

#### FR-SSQ-07: filteredKeys included
Each `SubsystemDto.filteredKeys` MUST include `KeyInfo[]` from `key_definitions` via the subsystem's many-to-many join table.

### 1.3 Functional requirements — POST /subsystems/{subsystemSystemId}/components/query

#### FR-SSC-01: subsystemSystemId validation
If `subsystemSystemId` cannot be parsed as a positive integer → `400 Bad Request`.

#### FR-SSC-02: Subsystem existence check
If no subsystem exists for the given `subsystemSystemId` in the project file → `404 Not Found`.

#### FR-SSC-03: Returns direct children of the subsystem
Returns nodes WHERE `parent_id = subsystemSystemId` AND `file_system_id = ?`. Only the immediate level — not recursive.

#### FR-SSC-04: Optional usecase scoping
- **Body absent / empty** → return all direct children
- **Body with usecaseSystemIds** → scope module children via:
  ```
  usecaseSystemIds → use_case_subgraphs.subgraph_system_id
    → spf_modules WHERE subgraph_system_id IN (those ids)
    → module nodes WHERE parent_id = subsystemSystemId
  ```
  Subsystem children are **always included** regardless of usecase filter.

#### FR-SSC-05: projectId resolution
Same as FR-SSQ-05.

### 1.4 Shared functional requirements

#### FR-SH-01: Overlay always applied — no caller flag
`SubsystemQueryService` port methods expose **no `applyOverlay` flag**. Overlay is always attempted internally — same pattern as container-query-lld.md and subgraph-query-lld.md.

#### FR-SH-02: Baseline-only read when no session active
When no active session exists, rows are returned from baseline tables only.

#### FR-SH-03: Draft overlay when session active
- `DELETE` draft → exclude row
- `UPDATE` draft → merge changed fields
- `CREATE` draft → inject staged row

#### FR-SH-04: STAGED drafts only
Only `change_status = 'STAGED'` with `valid_until IS NULL` applied.

#### FR-SH-05: changeInfo excluded
`changeInfo` → `undefined` on all DTOs in scope of this LLD.

### 1.5 Non-functional requirements

**NFR-SS-01:** No N+1 patterns. Tree assembly MUST be done in-memory from batch-loaded data.
**NFR-SS-02:** `POST /subsystems/query` MUST issue at most 5 DB queries regardless of tree depth.

---

## 2. Read Models

### 2.1 `Result<T>` wraps all service returns

```
Result<T>
  isSuccess: boolean
  data: T              ← only accessible when isSuccess = true
  errors: Error[]      ← always [], non-empty on failure
  warnings: Warning[]  ← always [], non-empty on partial success
```

### 2.2 Existing read models reused (no changes)

These already exist and are used as-is inside the new read models:

```typescript
// EXISTING — packages/core/.../usecase/query-models/data-port-read-model.ts
export interface DataPortReadModel {
  readonly systemId:        number;   // data_ports.system_id
  readonly portId:          number;   // data_ports.data_port_id
  readonly name:            string;   // data_ports.name
  readonly portIoType:      string;   // data_ports.port_io_type  ('Input' | 'Output')
  readonly isStatic:        boolean;  // data_ports.is_static
  readonly totalLinksAtPort: number;  // COUNT — 0 for subsystem nodes (no definition lookup needed)
}

// EXISTING — packages/core/.../usecase/query-models/intent-read-model.ts
export interface IntentReadModel {
  readonly systemId: number;   // intents.system_id
  readonly intentId: number;   // intents.intent_id
  readonly name:     string;   // intents.name (fallback: 'Intent_{intentId}')
}

// EXISTING — packages/core/.../usecase/query-models/control-port-read-model.ts
export interface ControlPortReadModel {
  readonly systemId:         number;            // control_ports.system_id
  readonly portId:           number;            // control_ports.port_id
  readonly name:             string;            // control_ports.name
  readonly isStatic:         boolean;           // control_ports.is_static
  readonly allocatedIntents: IntentReadModel[]; // intents WHERE control_port_system_id = systemId
  readonly totalLinksAtPort: number;            // COUNT — 0 for subsystem nodes
}

// EXISTING — packages/core/.../usecase/query-models/data-link-read-model.ts
export interface DataLinkReadModel {
  readonly systemId:                number;     // data_links.system_id
  readonly sourceNodeSystemId:      number;     // data_links.source_node_system_id
  readonly destinationNodeSystemId: number;     // data_links.destination_node_system_id
  readonly sourcePortSystemId:      number;     // data_links.source_port_system_id
  readonly destinationPortSystemId: number;     // data_links.destination_port_system_id
  readonly linkType:                LinkType;   // data_links.link_type
  readonly isEc:                    boolean | null; // data_links.is_ec
}

// EXISTING — packages/core/.../usecase/query-models/control-link-read-model.ts
export interface ControlLinkReadModel {
  readonly systemId:          number;    // control_links.system_id
  readonly peerNodeASystemId: number;    // control_links.peer_nodeA_system_id
  readonly peerNodeBSystemId: number;    // control_links.peer_nodeB_system_id
  readonly nodeAPortSystemId: number;    // control_links.nodeA_port_system_id
  readonly nodeBPortSystemId: number;    // control_links.nodeB_port_system_id
  readonly heapId:            number;    // control_links.heap_id
  readonly linkType:          LinkType;  // control_links.link_type
}
```

### 2.3 New read models — subsystem/query-models/subsystem-read-model.ts

All four interfaces live in one new file.

```typescript
// NEW — packages/core/src/application/ports/persistence/query-services/
//         subsystem/query-models/subsystem-read-model.ts

// ── FilteredKeyReadModel ───────────────────────────────────────────────────
// One entry per key_definitions row linked via the subsystem filtered-keys join table.
export interface FilteredKeyReadModel {
  readonly systemId: number;   // key_definitions.system_id  → KeyInfo.keySystemId (as string)
  readonly keyId:    number;   // key_definitions.key_id     → KeyInfo.keyId
  readonly name:     string;   // key_definitions.name       → KeyInfo.keyLabel
}

// ── SpfModuleChildReadModel ────────────────────────────────────────────────
// Represents a module node that is a direct child of a subsystem.
// Reuses DataPortReadModel and ControlPortReadModel for port data.
export interface SpfModuleChildReadModel {
  readonly systemId:     number;                // nodes.system_id
  readonly instanceId:   number;                // spf_modules.instance_id
  readonly alias:        string;                // spf_modules.alias → SubsystemDto child name
  readonly parentId:     number;                // nodes.parent_id (= parent subsystem systemId)
  readonly dataPorts:    DataPortReadModel[];   // data_ports WHERE node_system_id = systemId
  readonly controlPorts: ControlPortReadModel[]; // control_ports + intents WHERE node_system_id = systemId
}

// ── SubsystemChildrenReadModel ─────────────────────────────────────────────
// Flat arrays at one level — populated for every level down to leaf.
// dataLinks:    only links whose BOTH endpoint ports belong to nodes at THIS level.
// controlLinks: only links whose BOTH endpoint ports belong to nodes at THIS level.
// subsystems:   each SubsystemReadModel is itself recursively populated.
export interface SubsystemChildrenReadModel {
  readonly spfModules:   SpfModuleChildReadModel[]; // direct child module nodes at this level
  readonly dataLinks:    DataLinkReadModel[];        // links scoped to this level's data port set
  readonly controlLinks: ControlLinkReadModel[];     // links scoped to this level's control port set
  readonly subsystems:   SubsystemReadModel[];       // direct child subsystem nodes — recurse
}

// ── SubsystemReadModel ─────────────────────────────────────────────────────
// Root read model for POST /subsystems/query.
// systemId is the node.system_id — shared with subsystems.system_id (1:1).
// dataPorts / controlPorts are the subsystem node's OWN ports (not children's).
// children holds everything one level down, recursively to leaf.
export interface SubsystemReadModel {
  readonly systemId:     number;                     // nodes.system_id = subsystems.system_id
  readonly name:         string;                     // subsystems.name
  readonly parentId:     number | undefined;         // nodes.parent_id; undefined for root
  readonly dataPorts:    DataPortReadModel[];         // data_ports WHERE node_system_id = systemId
  readonly controlPorts: ControlPortReadModel[];      // control_ports + intents WHERE node_system_id = systemId
  readonly filteredKeys: FilteredKeyReadModel[];      // key_definitions via subsystem_filtered_keys join table
  readonly children:     SubsystemChildrenReadModel;  // populated to leaf (FR-SSQ-06)
}
```

### 2.4 Source columns — SubsystemReadModel

| Field | DB table | DB column | How populated |
|---|---|---|---|
| `systemId` | `nodes` | `system_id` | batch load Q1; shared PK with `subsystems` |
| `name` | `subsystems` | `name` | leftJoinAndSelect `n.subsystem` in Q1 |
| `parentId` | `nodes` | `parent_id` | nullable; `undefined` when null |
| `dataPorts[].systemId` | `data_ports` | `system_id` | leftJoinAndSelect `n.dataPorts` in Q1 |
| `dataPorts[].portId` | `data_ports` | `data_port_id` | |
| `dataPorts[].name` | `data_ports` | `name` | |
| `dataPorts[].portIoType` | `data_ports` | `port_io_type` | |
| `dataPorts[].isStatic` | `data_ports` | `is_static` | |
| `dataPorts[].totalLinksAtPort` | — | — | hardcoded `0` (subsystem nodes need no definition lookup) |
| `controlPorts[].systemId` | `control_ports` | `system_id` | leftJoinAndSelect `n.controlPorts` in Q1 |
| `controlPorts[].portId` | `control_ports` | `port_id` | |
| `controlPorts[].name` | `control_ports` | `name` | |
| `controlPorts[].isStatic` | `control_ports` | `is_static` | |
| `controlPorts[].allocatedIntents` | `intents` | via `cp.allocatedIntents` | leftJoinAndSelect in Q1 |
| `controlPorts[].totalLinksAtPort` | — | — | hardcoded `0` |
| `filteredKeys[].systemId` | `key_definitions` | `system_id` | leftJoinAndSelect `ss.filteredKeys` in Q1 |
| `filteredKeys[].keyId` | `key_definitions` | `key_id` | |
| `filteredKeys[].name` | `key_definitions` | `name` | |
| `children.spfModules` | `nodes` + `spf_modules` | `parent_id = systemId AND type = 'module'` | in-memory grouping from Q1 |
| `children.dataLinks` | `data_links` | `source_port_system_id` AND `destination_port_system_id` ∈ level's dataPortIds | in-memory filter from Q2 |
| `children.controlLinks` | `control_links` | `nodeA_port_system_id` AND `nodeB_port_system_id` ∈ level's controlPortIds | in-memory filter from Q3 |
| `children.subsystems` | `nodes` + `subsystems` | `parent_id = systemId AND type = 'subsystem'` | recursive in-memory |

### 2.5 Source columns — SpfModuleChildReadModel

| Field | DB table | DB column | Notes |
|---|---|---|---|
| `systemId` | `nodes` | `system_id` | |
| `instanceId` | `spf_modules` | `instance_id` | leftJoinAndSelect `n.spfModule` |
| `alias` | `spf_modules` | `alias` | display name |
| `parentId` | `nodes` | `parent_id` | = parent subsystem's systemId |
| `dataPorts` | `data_ports` | `node_system_id = systemId` | same as SubsystemReadModel.dataPorts |
| `controlPorts` | `control_ports` + `intents` | `node_system_id = systemId` | same as SubsystemReadModel.controlPorts |

### 2.6 How links are scoped to a level

Links have no `parent_id`. A link belongs to a subsystem level when **both** its endpoint ports belong to nodes that are direct children of that subsystem:

```
levelNodeIds    = Set of systemIds for nodes WHERE parent_id = subsystemSystemId
dataPortIds     = Set of systemIds for data_ports WHERE nodeSystemId ∈ levelNodeIds
controlPortIds  = Set of systemIds for control_ports WHERE nodeSystemId ∈ levelNodeIds

levelDataLinks    = data_links WHERE sourcePortSystemId      ∈ dataPortIds
                                AND destinationPortSystemId  ∈ dataPortIds

levelControlLinks = control_links WHERE nodeAPortSystemId ∈ controlPortIds
                                   AND  nodeBPortSystemId ∈ controlPortIds
```

This is computed **in-memory** per level during recursive tree assembly. No additional DB queries.

### 2.7 New read model — subsystem/query-models/subsystem-component-read-model.ts

```typescript
// NEW — packages/core/src/application/ports/persistence/query-services/
//         subsystem/query-models/subsystem-component-read-model.ts

// Read model for POST /subsystems/{id}/components/query.
// Represents a single direct child node of the subsystem (one level only — not recursive).
// name is resolved from subsystems.name (type='subsystem') or spf_modules.alias (type='module').
export interface SubsystemComponentReadModel {
  readonly systemId:  number;                  // nodes.system_id
  readonly name:      string;                  // subsystems.name OR spf_modules.alias
  readonly nodeType:  'module' | 'subsystem';  // nodes.type
}
```

### 2.8 Source columns — SubsystemComponentReadModel

| Field | DB table | DB column | Notes |
|---|---|---|---|
| `systemId` | `nodes` | `system_id` | |
| `name` | `subsystems` | `name` | when `nodes.type = 'subsystem'` |
| `name` | `spf_modules` | `alias` | when `nodes.type = 'module'` |
| `nodeType` | `nodes` | `type` | `'module'` or `'subsystem'` |

### 2.9 Mapping SubsystemReadModel → SubsystemDto

| `SubsystemReadModel` field | `SubsystemDto` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(s.systemId)` |
| `systemId: number` | `id: number` | direct — no separate business key in `subsystems` |
| `name: string` | `name: string` | direct |
| `parentId: number \| undefined` | `parentId?: number` | direct |
| `dataPorts: DataPortReadModel[]` | `dataPorts: DataPortDto[]` | map via DataPort mapper |
| `controlPorts: ControlPortReadModel[]` | `controlPorts: ControlPortDto[]` | map via ControlPort mapper |
| `filteredKeys: FilteredKeyReadModel[]` | `filteredKeys: KeyInfo[]` | `new KeyInfo(k.keyId, k.name, String(k.systemId))` |
| `children: SubsystemChildrenReadModel` | `children?: ComponentCollectionWithSubsystemsDto` | recursive map (§8) |
| — | `changeInfo` | `undefined` (FR-SH-05) |
| — | `relatedEndPointLinks` | `[]` |

### 2.10 Mapping SubsystemComponentReadModel → BaseComponentDto<number>

| `SubsystemComponentReadModel` field | `BaseComponentDto<number>` field | Conversion |
|---|---|---|
| `systemId: number` | `systemId: string` | `String(c.systemId)` |
| `systemId: number` | `id: number` | direct |
| `name: string` | `name?: string` | direct |
| — | `changeInfo` | `undefined` (FR-SH-05) |
| — | `relatedEndPointLinks` | `[]` |

---

## 3. Architecture and Call Flow

### 3.1 POST /subsystems/query

```
POST /arc-api/v1/projects/{projectId}/subsystems/query
  Body: { systemIds: ["10", "11"] }

  ──────────────────────────────────────────────────────
  @arc/api  SubsystemController.querySubsystems()
  ──────────────────────────────────────────────────────
  1. Parse systemIds string[] → number[] — NaN → HTTP 400
  2. parseInt(projectId, 10)
  3. new QuerySubsystemsQuery(systemIds, projectId, clientId)
  4. queryBus.execute(query) → Result<SubsystemReadModel[]>
  5. result.isFailure → throw HttpException HTTP 422
  6. result.data.map(s → SubsystemDto)
  7. return ApiResult<SubsystemDto[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  QuerySubsystemsHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
       throws if not found → HTTP 404
  2. subsystemQueryService.findMany(query.systemIds, fileSystemId)
       → Result<SubsystemReadModel[]>
       isFailure → return Result.fail(...errors)
  3. return Result.ok(result.data, result.warnings)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubsystemQueryService.findMany()
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Guard: systemIds.length === 0 → Result.fail(INVALID_INPUT)

  Step 1 — batch load all nodes for the file (needed for tree):
    Q1: dataSource.getRepository(ENTITY_NAMES.Node)
          .createQueryBuilder('n')
          .leftJoinAndSelect('n.subsystem', 'ss')
          .leftJoinAndSelect('ss.filteredKeys', 'fk')
          .leftJoinAndSelect('n.spfModule', 'sm')
          .leftJoinAndSelect('n.dataPorts', 'dp')
          .leftJoinAndSelect('n.controlPorts', 'cp')
          .leftJoinAndSelect('cp.allocatedIntents', 'intent')
          .where('n.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany()
    → NodeRow[]  (all nodes in the file — module + subsystem types)

  Step 2 — batch load all data_links for the file:
    Q2: dataSource.getRepository(ENTITY_NAMES.DataLink)
          .createQueryBuilder('dl')
          .where('dl.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany()
    → DataLinkRow[]

  Step 3 — batch load all control_links for the file:
    Q3: dataSource.getRepository(ENTITY_NAMES.ControlLink)
          .createQueryBuilder('cl')
          .where('cl.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany()
    → ControlLinkRow[]

  Step 4 — session check + overlay on nodes, links:
    Q4: editActionsSvc.findActiveSession(fileSystemId) → session | null
    Q5: editActionsSvc.getEditActionsByAggregateIds(
          session.sessionId,
          [...nodeSystemIds, ...dataLinkSystemIds, ...controlLinkSystemIds]
        ) [if session exists]
        applyToCollection(nodeRows, nodeActions)    → merged NodeRow[]
        applyToCollection(dataLinkRows, dlActions)  → merged DataLinkRow[]
        applyToCollection(ctrlLinkRows, clActions)  → merged ControlLinkRow[]

  Step 5 — build in-memory lookup structures:
    nodesByParent     = Map<parentId, NodeRow[]>         (grouped by parent_id)
    dataPortsByNode   = Map<nodeSystemId, DataPortRow[]>  (from n.dataPorts)
    ctrlPortsByNode   = Map<nodeSystemId, ControlPortRow[]> (from n.controlPorts)
    nodeMap           = Map<systemId, NodeRow>

  Step 6 — recursive assembly for each requested root systemId:
    uniqueIds.filter(id => nodeMap.get(id)?.type === 'subsystem')
             .map(id => buildSubsystem(id))

    buildSubsystem(subsystemSystemId):
      node          = nodeMap.get(subsystemSystemId)
      childNodes    = nodesByParent.get(subsystemSystemId) ?? []
      levelNodeIds  = Set(childNodes.map(n => n.systemId))

      // port sets for this level
      dataPortIds   = Set of data_port systemIds for nodes in levelNodeIds
      ctrlPortIds   = Set of control_port systemIds for nodes in levelNodeIds

      // links scoped to this level
      levelDataLinks    = dataLinks.filter(l =>
        dataPortIds.has(l.sourcePortSystemId) &&
        dataPortIds.has(l.destinationPortSystemId))
      levelControlLinks = controlLinks.filter(l =>
        ctrlPortIds.has(l.nodeAPortSystemId) &&
        ctrlPortIds.has(l.nodeBPortSystemId))

      // children
      childModules    = childNodes.filter(n => n.type === 'module')
      childSubsystems = childNodes.filter(n => n.type === 'subsystem')
                                  .map(n => buildSubsystem(n.systemId))  // recurse

      return SubsystemReadModel {
        systemId:     node.systemId,
        name:         node.subsystem!.name,
        parentId:     node.parentId ?? undefined,
        dataPorts:    toDataPortReadModels(dataPortsByNode.get(node.systemId)),
        controlPorts: toControlPortReadModels(ctrlPortsByNode.get(node.systemId)),
        filteredKeys: toFilteredKeyReadModels(node.subsystem!.filteredKeys),
        children: {
          spfModules:   childModules.map(toSpfModuleChildReadModel),
          dataLinks:    levelDataLinks.map(toDataLinkReadModel),
          controlLinks: levelControlLinks.map(toControlLinkReadModel),
          subsystems:   childSubsystems,
        },
      }

  Step 7 — return Result.ok(SubsystemReadModel[])
```

### 3.2 POST /subsystems/{subsystemSystemId}/components/query

```
POST /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}/components/query
  Body: { systemIds: ["uc1", "uc2"] }  (optional — usecase system IDs)

  ──────────────────────────────────────────────────────
  @arc/api  SubsystemController.queryComponentsInSubsystem()
  ──────────────────────────────────────────────────────
  1. parseInt(projectId, 10), parseInt(subsystemSystemId, 10) — NaN → HTTP 400
  2. Optional: parse body?.systemIds string[] → number[] (usecase IDs)
  3. new QueryComponentsInSubsystemQuery(
       subsystemSystemId, projectId, usecaseSystemIds?, clientId)
  4. queryBus.execute(query) → Result<SubsystemComponentReadModel[]>
  5. result.isFailure:
       ENTITY_NOT_FOUND → throw HttpException HTTP 404
       other            → throw HttpException HTTP 422
  6. result.data.map(c → BaseComponentDto<number>)
  7. return ApiResult<BaseComponentDto<number>[]>  HTTP 200

  ──────────────────────────────────────────────────────
  @arc/core  QueryComponentsInSubsystemHandler.handle()
  ──────────────────────────────────────────────────────
  1. projectQueryService.getFileIdByProjectId(query.projectId)
       throws if not found → HTTP 404
  2. subsystemQueryService.getComponentsInSubsystem(
       query.subsystemSystemId, fileSystemId, query.usecaseSystemIds
     ) → Result<SubsystemComponentReadModel[]>
       isFailure → return Result.fail(...errors)
  3. return Result.ok(result.data, result.warnings)

  ──────────────────────────────────────────────────────
  @arc/persistence  DbSubsystemQueryService.getComponentsInSubsystem()
  ──────────────────────────────────────────────────────
  try/catch → Result.fail(INTERNAL_ERROR) on any exception

  Step 1 — existence check:
    Q1: dataSource.getRepository(ENTITY_NAMES.Subsystem)
          .createQueryBuilder('ss')
          .select('ss.systemId')
          .innerJoin('ss.node', 'n',
            'n.fileSystemId = :fileSystemId', {fileSystemId})
          .where('ss.systemId = :id', {id: subsystemSystemId})
          .getOne()
        → null → return Result.fail(ENTITY_NOT_FOUND) → HTTP 404

  Step 2 — load direct children (nodes WHERE parent_id = subsystemSystemId):

    Case A — no usecaseSystemIds (all direct children):
      Q2: dataSource.getRepository(ENTITY_NAMES.Node)
            .createQueryBuilder('n')
            .leftJoinAndSelect('n.subsystem', 'ss')
            .leftJoinAndSelect('n.spfModule', 'sm')
            .where('n.parentId = :subsystemSystemId', {subsystemSystemId})
            .andWhere('n.fileSystemId = :fileSystemId', {fileSystemId})
            .getMany()

    Case B — usecaseSystemIds provided (scope module children to usecases):
      Q2: dataSource.getRepository(ENTITY_NAMES.Node)
            .createQueryBuilder('n')
            .leftJoinAndSelect('n.subsystem', 'ss')
            .leftJoinAndSelect('n.spfModule', 'sm')
            .leftJoin(
              'use_case_subgraphs', 'ucs',
              'ucs.subgraph_system_id = sm.subgraphSystemId',
            )
            .where('n.parentId = :subsystemSystemId', {subsystemSystemId})
            .andWhere('n.fileSystemId = :fileSystemId', {fileSystemId})
            .andWhere(
              '(n.type = :subsystemType OR ucs.usecase_system_id IN (:...ucIds))',
              {subsystemType: NODE_TYPE.Subsystem, ucIds: uniqueUcIds},
            )
            .getMany()
      — module children: only those whose subgraph belongs to the given usecases
      — subsystem children: always included (no subgraph FK on subsystems)

  Step 3 — three-tier overlay on these nodes:
    Q3: editActionsSvc.findActiveSession(fileSystemId) → session | null
    Q4: editActionsSvc.getEditActionsByAggregateIds(
          session.sessionId, baselineRows.map(r => r.systemId)
        ) [if session]
        applyToCollection(baselineRows, editActions) → merged NodeRow[]

  Step 4 — assemble SubsystemComponentReadModel[]:
    rows.map(r => ({
      systemId: r.systemId,
      name:     r.type === NODE_TYPE.Subsystem
                  ? r.subsystem!.name
                  : r.spfModule!.alias,
      nodeType: r.type,
    }))
    return Result.ok(SubsystemComponentReadModel[])
```

### 3.3 DB queries per request

**POST /subsystems/query:**
```
Q1 (always):     nodes + subsystems + filteredKeys + spfModules + dataPorts + controlPorts + intents
                   WHERE file_system_id = ?
Q2 (always):     data_links WHERE file_system_id = ?
Q3 (always):     control_links WHERE file_system_id = ?
Q4 (always):     project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q5 (if session): edit_actions WHERE session_id = ? AND aggregate_id IN (all entity ids)
                   AND valid_until IS NULL AND change_status = 'STAGED'
```
Maximum **5 queries** regardless of tree depth. Tree built in-memory.

**POST /subsystems/{id}/components/query:**
```
Q1 (always):     SELECT system_id FROM subsystems JOIN nodes WHERE system_id = ? AND file_system_id = ?
Q2 (always):     nodes + subsystems + spfModules WHERE parent_id = ? AND file_system_id = ?
                   [+ use_case_subgraphs JOIN if usecaseSystemIds provided]
Q3 (always):     project_sessions WHERE file_system_id = ? AND status = 'ACTIVE'
Q4 (if session): edit_actions WHERE session_id = ? AND aggregate_id IN (child node ids)
                   AND valid_until IS NULL AND change_status = 'STAGED'
```

---

## 4. Edit Session Overlay

### 4.1 Three-tier pattern (same as container-query-lld.md §4)

```typescript
// Always attempted — no applyOverlay flag (FR-SH-01)
const session = await this.editActionsSvc.findActiveSession(fileSystemId);

if (!session) return Result.ok(toReadModels(baselineRows));

const editActions = await this.editActionsSvc
  .getEditActionsByAggregateIds(session.sessionId, aggregateIds);

if (!editActions.length) return Result.ok(toReadModels(baselineRows));

const merged = applyToCollection(baselineRows, editActions);
return Result.ok(toReadModels(merged));
```

### 4.2 Tables overlaid

| Table | Aggregate ID | Changes applied | Endpoint |
|---|---|---|---|
| `nodes` | `nodeSystemId` | `parentId` UPDATE; DELETE; CREATE | both |
| `subsystems` | `nodeSystemId` (shared PK) | `name` UPDATE | both |
| `data_ports` | `nodeSystemId` | CREATE/DELETE | /subsystems/query |
| `control_ports` | `nodeSystemId` | CREATE/DELETE | /subsystems/query |
| `data_links` | `dataLinkSystemId` | CREATE/DELETE | /subsystems/query |
| `control_links` | `controlLinkSystemId` | CREATE/DELETE | /subsystems/query |

`subsystem_filtered_keys_key_definition` join rows are **not** overlaid.

### 4.3 Effect of each draft operation

| `edit_actions.operation` | Effect |
|---|---|
| `DELETE` | Row removed — node/link absent from result |
| `UPDATE` | JSON `payload` fields merged onto baseline row |
| `CREATE` | Row injected — staged entity visible in tree |

### 4.4 STAGED vs UNSTAGED

`EditActionsQueryService.getEditActionsByAggregateIds` enforces `change_status = 'STAGED'` and `valid_until IS NULL`. UNSTAGED drafts are never visible (FR-SH-04).

---

## 5. CQRS — Queries and Handlers

### 5.1 QuerySubsystemsQuery

```typescript
// packages/core/src/application/usecase-designer/subsystem/query/
//   query-subsystems.query.ts  (new file)

export class QuerySubsystemsQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],   // subsystem node system IDs
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 5.2 QuerySubsystemsHandler

```typescript
// packages/core/src/application/usecase-designer/subsystem/query/
//   query-subsystems.handler.ts  (new file)

export class QuerySubsystemsHandler
  implements QueryHandler<QuerySubsystemsQuery, Promise<Result<SubsystemReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: QuerySubsystemsQuery): Promise<Result<SubsystemReadModel[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    const result = await this.queryServices.subsystemQueryService
      .findMany(query.systemIds, fileSystemId);

    if (result.isFailure) return Result.fail(...result.errors);
    return Result.ok(result.data, result.warnings);
  }
}
```

### 5.3 QueryComponentsInSubsystemQuery

```typescript
// packages/core/src/application/usecase-designer/subsystem/query/
//   query-components-in-subsystem.query.ts  (new file)

export class QueryComponentsInSubsystemQuery extends BaseQuery {
  constructor(
    public readonly subsystemSystemId: number,
    public readonly projectId: number,
    public readonly usecaseSystemIds: number[] | undefined, // undefined = no filter
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 5.4 QueryComponentsInSubsystemHandler

```typescript
// packages/core/src/application/usecase-designer/subsystem/query/
//   query-components-in-subsystem.handler.ts  (new file)

export class QueryComponentsInSubsystemHandler
  implements QueryHandler<QueryComponentsInSubsystemQuery, Promise<Result<SubsystemComponentReadModel[]>>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: QueryComponentsInSubsystemQuery,
  ): Promise<Result<SubsystemComponentReadModel[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    const result = await this.queryServices.subsystemQueryService
      .getComponentsInSubsystem(
        query.subsystemSystemId,
        fileSystemId,
        query.usecaseSystemIds,
      );

    if (result.isFailure) return Result.fail(...result.errors);
    return Result.ok(result.data, result.warnings);
  }
}
```

**Both handlers are thin** — all tree-building, link scoping, and overlay logic live in the persistence layer.

---

## 6. Persistence Layer — DbSubsystemQueryService

### 6.1 Port interface

```typescript
// packages/core/src/application/ports/persistence/query-services/
//   subsystem/subsystem-query-service.ts  (new file)

export interface SubsystemQueryService {
  /**
   * Returns SubsystemReadModel[] for the given subsystem node systemIds.
   * Each model contains the full recursive children tree to leaf (FR-SSQ-06):
   *   children.spfModules   — direct child module nodes
   *   children.dataLinks    — links scoped to this level's port sets
   *   children.controlLinks — links scoped to this level's port sets
   *   children.subsystems   — direct child subsystem nodes, recursively populated
   * Overlay always applied — no applyOverlay flag (FR-SH-01).
   * Partial results — missing IDs silently omitted (FR-SSQ-04).
   */
  findMany(
    systemIds:    number[],
    fileSystemId: number,
  ): Promise<Result<SubsystemReadModel[]>>;

  /**
   * Returns direct child nodes of the given subsystem.
   * usecaseSystemIds: when provided, module children are scoped to those usecases
   *   via use_case_subgraphs → spf_modules.subgraphSystemId (FR-SSC-04).
   *   Subsystem children always included regardless of filter.
   * Returns Result.fail(ENTITY_NOT_FOUND) if subsystem does not exist (FR-SSC-02).
   * Overlay always applied — no applyOverlay flag (FR-SH-01).
   */
  getComponentsInSubsystem(
    subsystemSystemId: number,
    fileSystemId:      number,
    usecaseSystemIds?: number[],
  ): Promise<Result<SubsystemComponentReadModel[]>>;
}
```

### 6.2 Implementation — findMany

```typescript
async findMany(
  systemIds:    number[],
  fileSystemId: number,
): Promise<Result<SubsystemReadModel[]>> {
  try {
    if (systemIds.length === 0)
      return Result.fail({code: ERROR_CODES.INVALID_INPUT, message: 'systemIds must not be empty'});

    const uniqueIds = [...new Set(systemIds)];

    // Q1 — all nodes in file (batch for tree assembly)
    const baselineNodes = await this.dataSource
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.subsystem', 'ss')
      .leftJoinAndSelect('ss.filteredKeys', 'fk')
      .leftJoinAndSelect('n.spfModule', 'sm')
      .leftJoinAndSelect('n.dataPorts', 'dp')
      .leftJoinAndSelect('n.controlPorts', 'cp')
      .leftJoinAndSelect('cp.allocatedIntents', 'intent')
      .where('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as NodeRow[];

    // Q2 — all data_links in file
    const baselineDataLinks = await this.dataSource
      .getRepository(ENTITY_NAMES.DataLink)
      .createQueryBuilder('dl')
      .where('dl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as DataLinkRow[];

    // Q3 — all control_links in file
    const baselineControlLinks = await this.dataSource
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as ControlLinkRow[];

    // Q4/Q5 — three-tier overlay on nodes + links
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    let nodes         = baselineNodes;
    let dataLinks     = baselineDataLinks;
    let controlLinks  = baselineControlLinks;

    if (session) {
      const allAggregateIds = [
        ...baselineNodes.map(n => n.systemId),
        ...baselineDataLinks.map(l => l.systemId),
        ...baselineControlLinks.map(l => l.systemId),
      ];
      const editActions = await this.editActionsSvc
        .getEditActionsByAggregateIds(session.sessionId, allAggregateIds);

      if (editActions.length > 0) {
        const nodeActions = editActions.filter(a => a.tableName === ENTITY_NAMES.Node);
        const dlActions   = editActions.filter(a => a.tableName === ENTITY_NAMES.DataLink);
        const clActions   = editActions.filter(a => a.tableName === ENTITY_NAMES.ControlLink);

        if (nodeActions.length)   nodes        = applyToCollection(baselineNodes, nodeActions) as NodeRow[];
        if (dlActions.length)     dataLinks     = applyToCollection(baselineDataLinks, dlActions) as DataLinkRow[];
        if (clActions.length)     controlLinks  = applyToCollection(baselineControlLinks, clActions) as ControlLinkRow[];
      }
    }

    // Build in-memory lookup structures
    const nodesByParent   = new Map<number, NodeRow[]>();
    const nodeMap         = new Map<number, NodeRow>();
    for (const n of nodes) {
      nodeMap.set(n.systemId, n);
      if (n.parentId != null) {
        const siblings = nodesByParent.get(n.parentId) ?? [];
        siblings.push(n);
        nodesByParent.set(n.parentId, siblings);
      }
    }

    // Recursive builder
    const buildSubsystem = (node: NodeRow): SubsystemReadModel => {
      const childNodes   = nodesByParent.get(node.systemId) ?? [];
      const levelNodeIds = new Set(childNodes.map(c => c.systemId));

      // Collect port systemIds for nodes at this level
      const dataPortIds  = new Set<number>();
      const ctrlPortIds  = new Set<number>();
      for (const c of childNodes) {
        for (const p of c.dataPorts  ?? []) dataPortIds.add(p.systemId);
        for (const p of c.controlPorts ?? []) ctrlPortIds.add(p.systemId);
      }

      // Links whose both endpoints are within this level's port sets
      const levelDataLinks = dataLinks.filter(l =>
        dataPortIds.has(l.sourcePortSystemId) &&
        dataPortIds.has(l.destinationPortSystemId),
      );
      const levelControlLinks = controlLinks.filter(l =>
        ctrlPortIds.has(l.nodeAPortSystemId) &&
        ctrlPortIds.has(l.nodeBPortSystemId),
      );

      const childSubsystems = childNodes
        .filter(c => c.type === NODE_TYPE.Subsystem)
        .map(c => buildSubsystem(c));  // recurse to leaf

      const childModules = childNodes
        .filter(c => c.type === NODE_TYPE.Module);

      return {
        systemId:     node.systemId,
        name:         node.subsystem!.name,
        parentId:     node.parentId ?? undefined,
        dataPorts:    (node.dataPorts ?? []).map(toDataPortReadModel),
        controlPorts: (node.controlPorts ?? []).map(toControlPortReadModel),
        filteredKeys: (node.subsystem!.filteredKeys ?? []).map(toFilteredKeyReadModel),
        children: {
          spfModules:   childModules.map(toSpfModuleChildReadModel),
          dataLinks:    levelDataLinks.map(toDataLinkReadModel),
          controlLinks: levelControlLinks.map(toControlLinkReadModel),
          subsystems:   childSubsystems,
        },
      } satisfies SubsystemReadModel;
    };

    const result = uniqueIds
      .map(id => nodeMap.get(id))
      .filter((n): n is NodeRow => !!n && n.type === NODE_TYPE.Subsystem)
      .map(n => buildSubsystem(n));

    return Result.ok(result);
  } catch (error) {
    return Result.fail({
      code:    ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to query subsystems',
    });
  }
}
```

### 6.3 Implementation — getComponentsInSubsystem

```typescript
async getComponentsInSubsystem(
  subsystemSystemId: number,
  fileSystemId:      number,
  usecaseSystemIds?: number[],
): Promise<Result<SubsystemComponentReadModel[]>> {
  try {
    // Q1 — existence check
    const subsystem = await this.dataSource
      .getRepository(ENTITY_NAMES.Subsystem)
      .createQueryBuilder('ss')
      .select('ss.systemId')
      .innerJoin('ss.node', 'n', 'n.fileSystemId = :fileSystemId', {fileSystemId})
      .where('ss.systemId = :id', {id: subsystemSystemId})
      .getOne();

    if (!subsystem)
      return Result.fail({
        code:    ERROR_CODES.ENTITY_NOT_FOUND,
        message: `Subsystem ${subsystemSystemId} not found`,
      });

    // Q2 — direct children
    const hasUcFilter  = usecaseSystemIds && usecaseSystemIds.length > 0;
    const uniqueUcIds  = hasUcFilter ? [...new Set(usecaseSystemIds)] : undefined;

    let qb = this.dataSource
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.subsystem', 'ss')
      .leftJoinAndSelect('n.spfModule', 'sm')
      .where('n.parentId = :subsystemSystemId', {subsystemSystemId})
      .andWhere('n.fileSystemId = :fileSystemId', {fileSystemId});

    if (hasUcFilter) {
      qb = qb
        .leftJoin(
          'use_case_subgraphs', 'ucs',
          'ucs.subgraph_system_id = sm.subgraphSystemId',
        )
        .andWhere(
          '(n.type = :subsystemType OR ucs.usecase_system_id IN (:...ucIds))',
          {subsystemType: NODE_TYPE.Subsystem, ucIds: uniqueUcIds},
        );
    }

    const baselineRows = await qb.getMany() as NodeRow[];

    // Q3/Q4 — three-tier overlay
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    let rows = baselineRows;
    if (session) {
      const editActions = await this.editActionsSvc.getEditActionsByAggregateIds(
        session.sessionId,
        baselineRows.map(r => r.systemId),
      );
      if (editActions.length > 0)
        rows = applyToCollection(baselineRows, editActions) as NodeRow[];
    }

    return Result.ok(
      rows.map(r => ({
        systemId: r.systemId,
        name:     r.type === NODE_TYPE.Subsystem
                    ? r.subsystem!.name
                    : r.spfModule!.alias,
        nodeType: r.type,
      } satisfies SubsystemComponentReadModel)),
    );
  } catch (error) {
    return Result.fail({
      code:    ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to query subsystem components',
    });
  }
}
```

### 6.4 Error handling

| Scenario | Treatment |
|---|---|
| Empty `systemIds` (findMany) | `Result.fail(INVALID_INPUT)` before any DB query |
| DB error | `try/catch` → `Result.fail(INTERNAL_ERROR)` |
| systemId not in DB (findMany) | Partial result — silently omitted (FR-SSQ-04) |
| Subsystem not found (getComponentsInSubsystem) | `Result.fail(ENTITY_NOT_FOUND)` → HTTP 404 |

---

## 7. Port Interface and Wiring

### 7.1 Add `subsystemQueryService` to `QueryServices`

```typescript
// packages/core/src/application/ports/persistence/query-services/query-services.ts

import type {SubsystemQueryService} from './subsystem/subsystem-query-service.js';

export interface QueryServices {
  // ... existing ...
  readonly subsystemQueryService: SubsystemQueryService;
}
```

### 7.2 Wire in `DbQueryServices`

```typescript
// packages/infrastructure/persistence/src/.../queries/typeorm-query-services.ts

import {DbSubsystemQueryService} from './subsystem/db-subsystem-query-service.js';

export class DbQueryServices implements QueryServices {
  readonly subsystemQueryService: SubsystemQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);
    // ... existing construction unchanged ...

    this.subsystemQueryService = new DbSubsystemQueryService(
      dataSource,
      editActionsQueryService,
    );
  }
}
```

### 7.3 Register handlers in QueryBus

```typescript
queryBus.register(QuerySubsystemsQuery,            new QuerySubsystemsHandler(queryServices));
queryBus.register(QueryComponentsInSubsystemQuery, new QueryComponentsInSubsystemHandler(queryServices));
```

---

## 8. DTO Mapping

### SubsystemReadModel → SubsystemDto (recursive)

```typescript
private mapToSubsystemDto(s: SubsystemReadModel): SubsystemDto {
  const dto = new SubsystemDto(String(s.systemId), s.systemId, s.name, s.parentId);
  dto.dataPorts    = s.dataPorts.map(p => this.mapDataPortToDto(p));
  dto.controlPorts = s.controlPorts.map(p => this.mapControlPortToDto(p));
  dto.filteredKeys = s.filteredKeys.map(k =>
    new KeyInfo(k.keyId, k.name, String(k.systemId)),
  );
  dto.children     = this.mapToComponentCollectionWithSubsystems(s.children);
  dto.changeInfo   = undefined;  // FR-SH-05
  return dto;
}

private mapToComponentCollectionWithSubsystems(
  c: SubsystemChildrenReadModel,
): ComponentCollectionWithSubsystemsDto {
  const collection       = new ComponentCollectionWithSubsystemsDto();
  collection.spfModules  = c.spfModules.map(m => this.mapSpfModuleChildToDto(m));
  collection.dataLinks   = c.dataLinks.map(l => this.mapDataLinkToDto(l));
  collection.controlLinks = c.controlLinks.map(l => this.mapControlLinkToDto(l));
  collection.subsystems  = c.subsystems.map(s => this.mapToSubsystemDto(s));  // recurse
  return collection;
}
```

### SubsystemComponentReadModel → BaseComponentDto<number>

```typescript
private mapToBaseComponentDto(c: SubsystemComponentReadModel): BaseComponentDto<number> {
  const dto = new BaseComponentDto<number>(String(c.systemId), c.systemId);
  dto.name       = c.name;
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
    subsystem/
      subsystem-query-service.ts                     ← SubsystemQueryService port
      query-models/
        subsystem-read-model.ts                      ← SubsystemReadModel, FilteredKeyReadModel,
                                                        SubsystemChildrenReadModel, SpfModuleChildReadModel
        subsystem-component-read-model.ts            ← SubsystemComponentReadModel
  usecase-designer/
    subsystem/
      query/
        query-subsystems.query.ts                    ← QuerySubsystemsQuery extends BaseQuery
        query-subsystems.handler.ts                  ← QuerySubsystemsHandler
        query-components-in-subsystem.query.ts       ← QueryComponentsInSubsystemQuery extends BaseQuery
        query-components-in-subsystem.handler.ts     ← QueryComponentsInSubsystemHandler

packages/infrastructure/persistence/src/.../queries/
  subsystem/
    db-subsystem-query-service.ts                    ← DbSubsystemQueryService
                                                        findMany / getComponentsInSubsystem
```

### Modified files

```
packages/core/src/application/ports/persistence/query-services/
  query-services.ts                              ← add subsystemQueryService: SubsystemQueryService

packages/infrastructure/persistence/src/.../queries/
  typeorm-query-services.ts                      ← wire DbSubsystemQueryService

packages/api/src/presentation/rest/modules/subsystem/
  subsystem.controller.ts                        ← replace stubs, inject QueryBus,
                                                    mapToSubsystemDto, mapToBaseComponentDto
  subsystem.module.ts                            ← add QueryBus provider
```

### No DB changes needed

All required tables already exist: `nodes`, `subsystems`, `data_ports`, `control_ports`, `intents`, `spf_modules`, `data_links`, `control_links`, `use_case_subgraphs`, `edit_actions`, `project_sessions`.
Join table `subsystem_filtered_keys_key_definition` is auto-generated by TypeORM.

---

*End of Document*
