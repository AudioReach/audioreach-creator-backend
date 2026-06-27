<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Subsystem Links: Design Document

**Date:** 2026-05-31 
**Status:** Draft — pending implementation plan 
**Requirements baseline:** `docs/superpowers/specs/2026-05-30-virtual-links-requirements.md` 
**Approach:** Approach A — procedural domain services, callers orchestrate (pure TS services with no ports; three trigger-point callers fetch data and write edit actions independently)

---

## 1. Scope & Prerequisites

This design covers the full subystem link feature as specified in the requirements document. All references to `FR-VL-*`, `NFR-VL-*`, and `I*` are to that document.

**Schema prerequisite already in place:** The `data_links` table already has `sourceSubgraphSystemId`, `destSubgraphSystemId`, `isEc`, and `linkType` (column `link_type`; enum values `INTRA_SUBGRAPH`, `INTRA_USECASE`, `INTER_USECASE`). The requirements doc refers to this field as `link_scope` / `LinkScope`; the implementation uses `linkType` / `LinkType` / `LINK_TYPE`. This document uses the implementation names throughout.

**Controllers and API endpoint/DTO design are out of scope.** This document specifies from the command/query handler inward.

---

## 2. Resolved Open Questions

### OQ-1 — Subsystem port creation policy

Always create a new subsystem port. No reuse of existing ports.

Orphaned ports (those left unreferenced after a link deletion within the session) are cleaned up at commit time by Step B of the commit pre-pass (FR-VL-21). Reusing them would add query complexity and overlay-scan logic for no observable benefit — the net result after commit is identical either way.

### OQ-2 — Nested subsystem traversal algorithm

The `SubsystemBoundaryPathService` uses an LCA (lowest common ancestor) traversal over the `node.parentId` chain. Full algorithm described in Section 5.1. The output is an ordered `nodeSequence` plus a `requiredPortType` map — one entry per intermediate subsystem node.

### OQ-3 — Response shapes for both link-creation endpoints

**`POST /data-links` (flat-mode):**

```typescript
// Always — regardless of whether SLS were auto-created internally:
{ systemId: number; type: 'DataLink' }
```

Flat-mode callers never see SLS. The auto-creation is an internal side-effect invisible to the caller (NFR-VL-01).

**`POST /subsystem-links` (subsystem-mode):**

```typescript
// Both endpoints are module nodes, same parentId (or both null) — DataLink only, no SLS:
{ systemId: number; type: 'DataLink' }

// Both endpoints are module nodes, different parentIds — DataLink + resolved SLS chain:
{ subsystemLinkSegments: { systemId: number }[] }

// At least one endpoint is a subsystem node — single unresolved SLS:
// createdPortSystemId is present only when the caller omitted a portSystemId for the subsystem endpoint
// and the server auto-created one; UI uses it to display the new port without an extra GET round-trip
{ systemId: number; createdPortSystemId?: number }
```

In the different-parentId mod→mod case the DataLink `systemId` is intentionally absent from the response. The subsystem-mode client works with SLS IDs; it has no direct use for the underlying DataLink ID. The DataLink is the physical anchor but is invisible to this caller.

---

## 3. Domain Entities & Enums

### 3.1 `PortIoType` enum extension

**File:** `packages/core/src/domain/entities/common/enums/port-io-type.ts`
**Mirror:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/port-io-type-definition.schema.ts`

Both files gain two new values:

```typescript
export const PORT_IO_TYPE = {
  Input:       'Input',
  Output:      'Output',
  InputOutput: 'InputOutput',   // subsystem port: outfacing=Input, infacing=Output
  OutputInput: 'OutputInput',   // subsystem port: outfacing=Output, infacing=Input
} as const;
```

`InputOutput` and `OutputInput` only ever appear on nodes where `node.type = NodeType.Subsystem`. Module nodes only ever use `Input` or `Output`. This invariant is enforced by the command handlers — there is no DB-level constraint.

### 3.2 `SubsystemLinkSegment` domain entity

**New file:** `packages/core/src/domain/entities/usecase-data/subsystem-link-segment/subsystem-link-segment.ts`

```typescript
export class SubsystemLinkSegment {
  systemId:                number;
  sourceNodeSystemId:      number;
  destinationNodeSystemId: number;
  sourcePortSystemId:      number;
  destinationPortSystemId: number;
  dataLinkSystemId:      number | null;   // null in edit_actions payload only (unresolved); committed rows are always non-null
  fileSystemId:            number;
  version:                 number;
}
```

`SubsystemLinkSegment` is an independent aggregate root. It has no ownership relationship with `DataLink` — `dataLinkSystemId` is a loose FK, not an ownership link. A SLS can exist in edit_actions without a resolved DataLink (`dataLinkSystemId = null`), and a DataLink can exist without any SLS (flat-mode connection with no subsystem boundary). Committed SLS in the actual table always have a non-null `dataLinkSystemId`.

No domain invariants are enforced in the constructor. Validation (port direction, one-connection-per-port) is performed by the command handler before the entity is constructed — the same pattern used by `DataLink`, which defers DB-dependent checks to the handler.

---

## 4. Persistence Layer

### 4.1 `subsystem_link_segments` table

**New file:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/links/subsystem-link-segment.schema.ts`

```typescript
export interface SubsystemLinkSegmentRow extends EntityBaseRow {
  sourceNodeSystemId:      number;
  destinationNodeSystemId: number;
  sourcePortSystemId:      number;
  destinationPortSystemId: number;
  dataLinkSystemId:        number;
  fileSystemId:            number;
}
```

Column definitions:

| Column | Type | Nullable | FK behaviour |
|---|---|---|---|
| `system_id` | INTEGER PK | — | `BaseColumnSchemaPart` |
| `source_node_system_id` | INTEGER | NOT NULL | → `nodes` ON DELETE CASCADE |
| `destination_node_system_id` | INTEGER | NOT NULL | → `nodes` ON DELETE CASCADE |
| `source_port_system_id` | INTEGER | NOT NULL | → `data_ports` ON DELETE RESTRICT |
| `destination_port_system_id` | INTEGER | NOT NULL | → `data_ports` ON DELETE RESTRICT |
| `data_link_system_id` | INTEGER | NOT NULL | → `data_links` ON DELETE CASCADE |
| `file_system_id` | INTEGER | NOT NULL | → `arc_db_files` ON DELETE CASCADE |
| `version` | INTEGER | NOT NULL | default 1, optimistic locking |
| `created_at` / `updated_at` | DATETIME | — | `BaseColumnSchemaPart` |

`ON DELETE CASCADE` on `data_link_system_id`: when a DataLink row is deleted from the actual table at commit time, all SLS referencing it are automatically removed. The actual `subsystem_link_segments` table never contains rows with a null or dangling `data_link_system_id` — the commit pre-pass (§8.1) ensures all unresolved SLS in edit_actions are either resolved or discarded before the transaction runs, and ON DELETE CASCADE handles any remaining sibling SLS rows after an explicit DataLink DELETE.

`ON DELETE RESTRICT` on port FKs: prevents deleting a `data_ports` row that is still referenced by a SLS. Orphaned subsystem port cleanup (§7.4, FR-VL-21) always records SLS DELETEs before DataPort DELETEs, so this constraint is never violated at commit time.

Indices:

```
idx_sls_file              ON (file_system_id)
idx_sls_data_link       ON (data_link_system_id)
idx_sls_src_port_file     ON (source_port_system_id, file_system_id)
idx_sls_dst_port_file     ON (destination_port_system_id, file_system_id)
```

### 4.2 `ENTITY_NAMES` additions

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts`

Add two entries: `SubsystemLinkSegment: 'SubsystemLinkSegment'` and `Configuration: 'Configuration'`.

### 4.3 `configuration` table

**New file:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/project-data/configuration.schema.ts`

```typescript
export const MODULE_PORT_STRATEGY = {
  InputOddOutputEven: 'INPUT_ODD_OUTPUT_EVEN',
  Sequential:         'SEQUENTIAL',
} as const;
export type ModulePortStrategy = (typeof MODULE_PORT_STRATEGY)[keyof typeof MODULE_PORT_STRATEGY];

export interface ConfigurationRow extends EntityBaseRow {
  fileSystemId:  number;
  portStrategy:  ModulePortStrategy;
  extraConfig:   string | null;   // JSON blob for future workspace config fields
}
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `system_id` | INTEGER PK | — | `BaseColumnSchemaPart` |
| `file_system_id` | INTEGER | NOT NULL | → `arc_db_files` ON DELETE CASCADE; UNIQUE |
| `port_strategy` | simple-enum | NOT NULL | `INPUT_ODD_OUTPUT_EVEN` \| `SEQUENTIAL` |
| `extra_config` | TEXT | NULL | JSON; for future workspace fields not queried directly |

One row per file. `file_system_id` has a unique index.

**Scope note:** Populating this table from the workspace AWSP file during upload is **out of scope for this task**. The table and repository are introduced here so handlers can read the port strategy. It is assumed the row exists before any port-creation handler runs.

### 4.4 Migration

Follow the standard workflow from `CLAUDE.md`: delete the existing `initial-create` migration, run `pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create`, add the Qualcomm copyright header, change the import to `import type`, update `migration-index.ts`. The regenerated migration captures both the new `subsystem_link_segments` table and the extended `port_io_type` enum values.

---

## 5. Domain Services

Both services are pure TypeScript — no injected ports, no imports outside `packages/core`. They operate on in-memory data provided by the caller.

**Location:** `packages/core/src/domain/services/virtual-links/`

### 5.1 `SubsystemBoundaryPathService`

**Purpose:** Given two module nodes that are in different subsystem contexts, computes the ordered node sequence the signal must pass through and the `PortIoType` required at each subsystem boundary.

**Called by:** `CreateDataLinkHandler`, after confirming `sourceModule.parentId ≠ destModule.parentId`.

#### Input

```typescript
interface PathInput {
  sourceNodeId:  number;   // node.system_id for the source module
  sourcePortId:  number;   // output port on the source module (caller-resolved)
  destNodeId:    number;   // node.system_id for the dest module
  destPortId:    number;   // input port on the dest module (caller-resolved)

  // All nodes visible in the file: maps node.system_id → node.parentId (null = top level)
  nodeParentMap: Map<number, number | null>;
}
```

#### Output

```typescript
interface PathOutput {
  // Ordered node IDs: [sourceModule, ...subsystemNodes, destModule]
  nodeSequence: number[];

  // For each subsystem node in nodeSequence: the PortIoType it must have.
  // Uses PORT_IO_TYPE values — no raw string literals.
  requiredPortType: Map<number, typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput>;
}
```

#### Algorithm

1. Walk `nodeParentMap` upward from `sourceNodeId`, recording `exitChain = [parent₁, parent₂, …]` until `null` is reached.
2. Walk upward from `destNodeId`, recording `entryChain = [parent₁, parent₂, …]` until `null` is reached.
3. Find the LCA: the first entry shared by both chains (or `null` = top level if no earlier match).
4. Trim both chains at LCA (exclusive — LCA itself is not a boundary node in the path).
5. Reverse `entryChain` so it reads top-down (LCA-level down to dest's immediate parent).
6. Assemble `nodeSequence`: `[sourceNodeId, ...exitChain, ...entryChain, destNodeId]`.
7. Assign `requiredPortType`:
   - Nodes from `exitChain` → `PORT_IO_TYPE.OutputInput` (signal exits these subsystems)
   - Nodes from `entryChain` → `PORT_IO_TYPE.InputOutput` (signal enters these subsystems)

#### Worked example

Setup: ModuleA inside SubsystemInner (inside SubsystemOuter); ModuleB inside SubsystemY. All three subsystems are top-level (parentId = null).

```
exitChain  (ModuleA upward): [SubsystemInner, SubsystemOuter, null]  → trimmed: [SubsystemInner, SubsystemOuter]
entryChain (ModuleB upward): [SubsystemY, null]                       → trimmed: [SubsystemY]
LCA: null

nodeSequence:    [ModuleA, SubsystemInner, SubsystemOuter, SubsystemY, ModuleB]
requiredPortType:
  SubsystemInner → OutputInput
  SubsystemOuter → OutputInput
  SubsystemY     → InputOutput
```

The handler then walks `nodeSequence`, resolves a port for each subsystem node (reuse or create, per OQ-1), and assembles SLS edit actions for each adjacent pair.

---

### 5.2 `ChainResolutionService`

**Purpose:** Given all unresolved SLS for a file, finds every complete chain (module → subsystems → module) and returns the information needed to create a DataLink for each. Also reports incomplete chains.

**Called by:** three locations — `ResolveVirtualLinkChainsHandler`, `AutoCreateUsecasesHandler` (pre-pass), and `CommitChangesHandler` (pre-commit step A).

#### Input

```typescript
interface ResolutionInput {
  // All SLS where dataLinkSystemId = null (committed + overlay merged by caller)
  unresolvedSegments: {
    systemId:                number;
    sourceNodeSystemId:      number;
    destinationNodeSystemId: number;
    sourcePortSystemId:      number;
    destinationPortSystemId: number;
  }[];

  // NodeType (already exported from node.ts) for every node that appears in the segments
  nodeTypeMap: Map<number, NodeType>;
}
```

#### Output

```typescript
interface ResolutionResult {
  completeChains: {
    segmentIds:         number[];   // ordered SLS system_ids — used for SLS UPDATE edit actions
    sourceModuleNodeId: number;     // the module node where the chain starts
    destModuleNodeId:   number;     // the module node where the chain ends
    sourcePortId:       number;     // S1.sourcePortSystemId → DataLink.sourcePortSystemId
    destPortId:         number;     // SN.destPortSystemId   → DataLink.destPortSystemId
  }[];

  incompleteChains: {
    segmentIds:          number[];  // all SLS system_ids in the incomplete chain (ordered)
    startModuleNodeId:   number;    // module node where the chain begins
    lastReachableNodeId: number;    // last node reached before the dead end (may be a subsystem)
  }[];
}
```

`segmentIds` on `incompleteChains` gives the caller everything needed to report exactly which SLS are unresolved — used both for 422 error responses and for the commit-time warning message.

#### Algorithm

1. Build a directed adjacency map: `sourceNodeId → SLS[]` from `unresolvedSegments`.
2. Identify start nodes: nodes that appear as `sourceNodeSystemId` in at least one SLS AND whose `nodeTypeMap` entry is `NodeType.Module`.
3. For each start node, walk forward greedily. Maintain a `visited` set to detect cycles (a cycle → incomplete). At each step, follow the outgoing SLS from the current node. Fan-out (one node with multiple outgoing unresolved SLS) spawns independent branches, each walked separately.
4. A walk terminates as **complete** when the destination node's `nodeTypeMap` entry is `NodeType.Module` and it is not the start node. It terminates as **incomplete** on dead end or cycle.
5. Extract endpoints from each complete chain per FR-VL-12: `sourcePortId` = first segment's `sourcePortSystemId`; `destPortId` = last segment's `destinationPortSystemId`.

---

## 6. Command & Query Handlers

### 6.0 Session resolution pattern (applies to all command handlers)

All command handlers receive `projectId` as their primary identifier. `fileSystemId` and `sessionId` are **never passed by the caller** — they are resolved by the handler at the start of execution:

1. Call `IProjectRepository.getActiveFileId(projectId)` → `fileSystemId` (typically the first/primary file for the project).
2. Call `ISessionRepository.getActiveSession(projectId)` → `session`.
3. Validate `session.mode ∈ { 'Designer', 'DiffMerge' }` → 422 if not (graph modifications are not allowed in other modes).

The resolved `fileSystemId` and `sessionId` are then passed **explicitly** to all repository calls. Repositories take explicit parameters — they do not query for the session themselves. This keeps repositories simple, stateless, and independently testable.

Command field signatures below show `projectId` only; `fileSystemId` and `sessionId` are always resolved per the pattern above.

---

### 6.1 Subsystem data port creation — inlined, no standalone handler

Subsystem boundary data ports are created **inline** by the handlers that need them. There is no separate API endpoint for explicit port creation:

- `CreateDataLinkHandler` cross-subsystem (§6.3): auto-creates ports for every boundary node traversed.
- `CreateSubsystemLinkSegmentHandler` Branch B (§6.2): same.
- `CreateSubsystemLinkSegmentHandler` Branch C (§6.2): creates a port when the caller omits `portSystemId` for the subsystem endpoint.

The creation logic is the same in all three cases: call `IConfigurationRepository.getByFileId` → `portStrategy`, count existing data ports of the required `portIoType` on the subsystem node → `baseIndex`, compute `dataPortId = calculatePortId(baseIndex, isInput, portStrategy)`, pre-assign `systemId`, record DataPort CREATE edit action.

---

### 6.2 `CreateSubsystemLinkSegmentHandler` — new

**Command fields:** `sourceNodeSystemId`, `destinationNodeSystemId`, `sourcePortSystemId`, `destinationPortSystemId`, `projectId`

The `portSystemId` for a subsystem-node endpoint is **optional**. If omitted, the handler creates the port inline. For module-node endpoints, the port ID is always required.

The handler branches on endpoint node types before any other validation.

---

#### Branch A — Both endpoints are module nodes, same `parentId` (or both `null`)

No subsystem boundary exists. Behaviour is identical to `CreateDataLinkHandler`'s same-context path:

1. Duplicate check: if a DataLink with the same `(sourcePortSystemId, destinationPortSystemId)` already exists in committed table or overlay → 422.
2. Compute `linkType`: same subgraph → `INTRA_SUBGRAPH`; different subgraphs → `INTRA_USECASE`.
3. Pre-assign `systemId` via `IdGenerationPort`.
4. Record DataLink CREATE edit action (`change_status = STAGED`).
5. Return `{ systemId, type: 'DataLink' }`.

---

#### Branch B — Both endpoints are module nodes, different `parentId` values

Behaviour mirrors `CreateDataLinkHandler`'s cross-subsystem path, but the response returns SLS IDs instead of the DataLink ID:

1. Duplicate check: if a DataLink with the same `(sourcePortSystemId, destinationPortSystemId)` already exists → 422.
2. Call `INodeRepository.getNodeParentMap(fileId)`.
3. Call `SubsystemBoundaryPathService` → `pathOutput`.
4. Call `IConfigurationRepository.getByFileId(fileId)` → `portStrategy`.
5. For each subsystem node in `pathOutput.nodeSequence` (excluding first and last): count existing data ports of the required `portIoType` on that node (committed + overlay) → `baseIndex`; compute `dataPortId = calculatePortId(baseIndex, isInput, portStrategy)`; pre-assign a new `systemId` and record a DataPort CREATE edit action.
6. Pre-assign a `systemId` for the DataLink. Generate a shared `groupId` (UUID).
7. Compute `linkType` from subgraph membership.
8. Record DataLink CREATE edit action with `groupId`.
9. For each adjacent pair `(nodeA, nodeB)` in `pathOutput.nodeSequence`: resolve source and dest port IDs (first pair uses the module's output port from the command; intermediate pairs use the subsystem port created in step 5; last pair uses the module's input port from the command). Record a SLS CREATE edit action with `dataLinkSystemId` set to the new DataLink's `systemId`, sharing the `groupId`. These SLS are immediately resolved.
10. Record all DataPort CREATEs from step 5 with the same `groupId`.
11. Return `{ subsystemLinkSegments: [{ systemId }, …] }` — the DataLink `systemId` is not included; the subsystem-mode client works with SLS IDs.

---

#### Branch C — At least one endpoint is a subsystem node

This is the classic SLS creation case. Validation (first failure returns 422):

1. Port direction check (FR-VL-07): `source port type ≠ Input` AND `dest port type ≠ Output`. Full validity matrix per FR-VL-07.
2. One-connection-per-subsystem-port (FR-VL-08): for each subsystem port in the request (where portId was provided), call `ISubsystemLinkSegmentRepository.getByPortId()` against committed + overlay. If already used as source (for source port) or dest (for dest port) → 422 identifying the conflicting port.

**Inline port creation** — if the subsystem endpoint's `portSystemId` was omitted:

3. Call `IConfigurationRepository.getByFileId(fileId)` → `portStrategy`.
4. Count existing data ports of the required `portIoType` on the subsystem node (committed + overlay) → `baseIndex`. Compute `dataPortId = calculatePortId(baseIndex, isInput, portStrategy)`.
5. Pre-assign `portSystemId` via `IdGenerationPort`. Record DataPort CREATE edit action (`change_status = STAGED`). Store as `createdPortSystemId`.

If all checks pass:

6. Pre-assign SLS `systemId` via `IdGenerationPort`.
7. Record SLS CREATE edit action (`dataLinkSystemId = null`, `change_status = STAGED`), using the provided or just-created `portSystemId` for the subsystem endpoint.
8. Return `{ systemId; createdPortSystemId? }` — `createdPortSystemId` is present only when a port was auto-created in step 5.

---

### 6.3 `CreateDataLinkHandler` — extended

**Command fields:** `sourceNodeSystemId`, `destinationNodeSystemId`, `sourcePortSystemId`, `destinationPortSystemId`, `isInterUsecase: boolean`, `projectId`

`isInterUsecase` allows the caller to explicitly declare a cross-subgraph DataLink as `INTER_USECASE`. This flag is ignored when both modules share the same subgraph (always `INTRA_SUBGRAPH`).

Validation:

1. If either node is `NodeType.Subsystem` → 422: "Subsystem node endpoints are not supported — use the subsystem-link-segments endpoint instead."
2. Duplicate check: if a DataLink with the same `(sourcePortSystemId, destinationPortSystemId)` already exists in committed table or overlay → 422.

**Same subsystem context** (`sourceModule.parentId = destModule.parentId`):

3. Compute `linkType`: same subgraph → `INTRA_SUBGRAPH`; different subgraphs → `INTRA_USECASE` (or `INTER_USECASE` if `isInterUsecase = true`).
4. Pre-assign `systemId`.
5. Record DataLink CREATE edit action (`change_status = STAGED`).
6. Return `{ systemId, type: 'DataLink' }`.

**Cross-subsystem context** (`sourceModule.parentId ≠ destModule.parentId`):

3. Call `INodeRepository.getNodeParentMap(fileId)` to get the full node parentId map.
4. Call `SubsystemBoundaryPathService` → `pathOutput`.
5. Call `IConfigurationRepository.getByFileId(fileId)` → `portStrategy`. For each subsystem node in `pathOutput.nodeSequence` (excluding first and last): count existing data ports of the required `portIoType` on that node → `baseIndex`; compute `dataPortId = calculatePortId(baseIndex, isInput, portStrategy)`; pre-assign a new `systemId` and record a DataPort CREATE edit action.
6. Pre-assign a `systemId` for the DataLink. Generate a shared `groupId` (UUID).
7. Compute `linkType` from subgraph membership and `isInterUsecase` flag.
8. Record DataLink CREATE edit action with `groupId`.
9. For each adjacent pair `(nodeA, nodeB)` in `pathOutput.nodeSequence`: determine the source and dest port IDs — the first pair uses `sourcePortId` (the module's output port from the command); intermediate pairs use the subsystem port created in step 5; the last pair uses `destPortId` (the module's input port from the command). Record a SLS CREATE edit action with `dataLinkSystemId` set to the new DataLink's `systemId`, sharing the `groupId`. These SLS are immediately resolved.
10. Record all DataPort CREATEs from step 5 with the same `groupId`.
11. Return `{ systemId, type: 'DataLink' }`.

---

### 6.4 `DeleteDataLinkHandler` — extended

**Command fields:** `dataLinkSystemId`, `projectId`

1. Load DataLink from committed table + overlay; if not found → 404.
2. Generate a shared `groupId`.
3. Record DataLink DELETE (with `baseVersion`), sharing `groupId`.
4. Call `ISubsystemLinkSegmentRepository.getByDataLinkId(dataLinkSystemId, fileId, sessionId)`.
5. For each SLS returned: record SLS DELETE, sharing `groupId`.
6. Orphaned subsystem ports are cleaned up at commit time (§8.2) — not deleted immediately.

---

### 6.5 `DeleteSubsystemLinkSegmentHandler` — new

**Command fields:** `slsSystemId`, `projectId`

Load SLS from committed table + overlay; if not found → 404.

**Case A — unresolved** (`dataLinkSystemId = null`):

1. Record SLS DELETE. Return 204.

**Case B — resolved** (`dataLinkSystemId = L1`):

1. Generate a shared `groupId`.
2. Record SLS DELETE for this segment, sharing `groupId`.
3. Record DataLink DELETE for L1 (with `baseVersion`), sharing `groupId`.
4. Call `ISubsystemLinkSegmentRepository.getByDataLinkId(L1, fileId, sessionId)`. For each sibling (all SLS except the deleted one): record SLS UPDATE setting `dataLinkSystemId = null`, sharing `groupId`. This makes sibling SLS appear unresolved in the overlay so they are picked up and discarded by the commit pre-pass (§8.1).
5. Return 204.

The null-FK UPDATE edit_actions are **never applied to the actual table** (the column is NOT NULL). At commit, the pre-pass (§8.1) detects these sibling SLS as unresolved in the overlay, runs chain resolution, finds incomplete chains, and records explicit DELETE edit_actions for committed sibling rows. Pending sibling CREATEs are marked DISCARDED. ON DELETE CASCADE on the actual table acts as a safety net for any committed rows not caught by the pre-pass.

---

### 6.6 `ResolveSLSChainsService` — shared application service

**Purpose:** Encapsulates the full chain resolution orchestration so it can be called from within any handler without duplicating application-layer logic. Returns 422-ready information when incomplete chains exist.

**Location:** `packages/core/src/application/services/virtual-links/resolve-sls-chains.service.ts`

**Interface:**

```typescript
interface ResolveSLSChainsResult {
  status: 'ok' | 'incomplete';
  incompleteChains?: { segmentIds: number[]; startModuleNodeId: number; lastReachableNodeId: number }[];
}
```

**Steps (called within an active handler's transaction context):**

1. Call `ISubsystemLinkSegmentRepository.getUnresolvedForFile(fileId, sessionId)` — this includes both original unresolved SLS (pending CREATEs with null FK) **and** sibling SLS whose FK was nulled via UPDATE edit_action in the overlay.
2. If empty → return `{ status: 'ok' }` immediately (fast path, FR-VL-18).
3. Call `INodeRepository.getNodeTypeMap(nodeIds)` for all nodes referenced in the unresolved segments.
4. Call `ChainResolutionService.resolve({ unresolvedSegments, nodeTypeMap })`.
5. If `result.incompleteChains` is non-empty → return `{ status: 'incomplete', incompleteChains: … }`.
6. For each complete chain: pre-assign DataLink `systemId`; generate `groupId`; compute `linkType`; record DataLink CREATE + SLS UPDATEs (setting `dataLinkSystemId`) in edit actions, all sharing `groupId`.
7. Return `{ status: 'ok' }`.

---

### 6.7 `ResolveVirtualLinkChainsHandler` — new command handler

**Command fields:** `projectId`

Thin handler that delegates to `ResolveSLSChainsService`. Called by the controller before `GetComponentsFlatQuery`.

1. Call `ResolveSLSChainsService.resolve(fileId, sessionId)`.
2. If `status = 'incomplete'` → return 422 listing each incomplete chain's `segmentIds`, `startModuleNodeId`, and `lastReachableNodeId`.
3. Return success.

The controller calls this command first, then `GetComponentsFlatQuery`. `GetComponentsSubsystemHandler` (subsystem mode read) is a pure query handler that does not trigger resolution.

---

### 6.8 `AutoCreateUsecasesHandler` — pre-pass extension

Before the routing algorithm runs, the handler now:

1. Call `ResolveSLSChainsService.resolve(fileId, sessionId)`.
2. If `status = 'incomplete'` → return 422. Routing does not run.
3. Proceed to routing as before.

---

### 6.8 Handler registration

Following the existing manual registration pattern (no reflect-metadata):

- **`CommandHandlerRegistry.registerAllCommandHandlers()`**: add `CreateSubsystemLinkSegmentHandler`, `DeleteSubsystemLinkSegmentHandler`, `ResolveVirtualLinkChainsHandler`, `CreateControlSubsystemLinkSegmentHandler`, `DeleteControlSubsystemLinkSegmentHandler`, and the updated `CreateDataLinkHandler` / `DeleteDataLinkHandler`.
- **`ResolveSLSChainsService`** is registered as a shared application service (not a handler) and injected into `ResolveVirtualLinkChainsHandler`, `AutoCreateUsecasesHandler`, and `CommitChangesHandler`.
- **`QueryHandlerRegistry.registerAllQueryHandlers()`**: add `GetComponentsSubsystemHandler` (subsystem mode, pure read). The flat-mode response is assembled by the controller after dispatching the resolve command and the flat read query.

---

## 7. Port Interfaces

CQRS boundary: command handlers use **repositories** (write-side, QueryRunner-scoped). Query services are out of scope for this LLD.

### 7.1 `ISubsystemLinkSegmentRepository`

**Location:** `packages/core/src/application/ports/persistence/repositories/`

```typescript
interface ISubsystemLinkSegmentRepository {
  // Committed + overlay, only where dataLinkSystemId = null (including sibling UPDATEs that nulled FK)
  getUnresolvedForFile(fileId: number, sessionId: number): Promise<SubsystemLinkSegmentRow[]>;

  // Committed + overlay, filtered by dataLinkSystemId — used by DeleteDataLinkHandler
  getByDataLinkId(dataLinkSystemId: number, fileId: number, sessionId: number): Promise<SubsystemLinkSegmentRow[]>;

  // One-connection-per-port check (FR-VL-08): returns SLS system_id using this port as source or dest, null if unused
  getByPortId(portSystemId: number, fileId: number, sessionId: number): Promise<{
    asSource: number | null;
    asDest:   number | null;
  }>;
}
```

### 7.2 `INodeRepository` — extensions

```typescript
// All nodes for the file: maps node.system_id → parentId
getNodeParentMap(fileId: number): Promise<Map<number, number | null>>;

// NodeType for a given set of node IDs
getNodeTypeMap(nodeIds: number[]): Promise<Map<number, NodeType>>;
```

### 7.3 `IDataPortRepository` — no new methods required

Auto-created subsystem ports are written directly as DataPort CREATE edit actions.

### 7.4 `IConfigurationRepository` — new

**Location:** `packages/core/src/application/ports/persistence/repositories/`

```typescript
interface IConfigurationRepository {
  // Returns the file's port strategy. Throws if no configuration row exists.
  getByFileId(fileId: number): Promise<ConfigurationRow>;
}
```

Used by `CreateSubsystemLinkSegmentHandler` Branch B and Branch C, `CreateDataLinkHandler` cross-subsystem, and the control-link equivalents to compute port IDs via `calculatePortId`.

`calculatePortId` is the existing pure utility extracted from `spf-module-builder.ts:682-701`:

```typescript
// packages/core/src/domain/utilities/port-id-strategy.ts
export function calculatePortId(
  baseIndex: number,
  isInput:   boolean,
  strategy:  ModulePortStrategy,
): number {
  if (strategy === MODULE_PORT_STRATEGY.Sequential) return baseIndex + 1;
  return isInput ? baseIndex * 2 + 2 : baseIndex * 2 + 1;
}
```

This utility is shared between upload-time and modification-time port creation — no duplication.

---

## 8. Commit Orchestration Extensions

These steps run inside `CommitChangesHandler` before the transaction that writes to actual tables.

### 8.1 Step A — incomplete chain discard and committed sibling cleanup (FR-VL-22)

1. Call `ISubsystemLinkSegmentRepository.getUnresolvedForFile(fileId, sessionId)` — this returns both pending CREATE SLS with `dataLinkSystemId = null` AND committed SLS whose FK was nulled via UPDATE edit_action (i.e., siblings from `DeleteSubsystemLinkSegmentHandler` Case B).
2. Run `ChainResolutionService.resolve()` on all of them.
3. For complete chains: record DataLink CREATE + SLS UPDATEs in the STAGED set (same as §6.6 step 6). These are resolved before the transaction.
4. For incomplete chains, for each SLS in the chain:
   - If it exists only as a pending CREATE in edit_actions: mark that CREATE `change_status = DISCARDED`.
   - If it is a committed row in the actual table (with a null-FK UPDATE in the overlay): record an explicit SLS DELETE in the STAGED set. This DELETE is applied in the transaction before the DataLink DELETE (topological order §8.3 step 1).
5. If any SLS were discarded or deleted: include in commit response: `"N subsystem link segment(s) were discarded because they did not form complete connections."`

**Strict invariant assertion:** After Step A, scan the STAGED edit set for any SLS CREATE or UPDATE with `dataLinkSystemId = null`. If any remain → abort commit with internal error. No SLS with a null or broken FK should reach the transaction. This check is O(staged-set size) and prevents silent data corruption.

### 8.2 Step B — orphaned subsystem port cleanup (FR-VL-21)

1. Collect all subsystem port `systemId` values referenced only by SLS that are being DELETED or were just DISCARDED in Step A.
2. Check whether any remaining STAGED SLS CREATEs or committed SLS still reference these ports.
3. Ports with no remaining references are orphaned:
   - If the port exists only as a pending CREATE in edit actions: mark that edit action DISCARDED.
   - If the port is already in the committed `data_ports` table: record a DataPort DELETE in the STAGED set.

### 8.3 Step C — topological commit order (FR-VL-23)

Changes are applied within the transaction in this order:

| Order | Operation | Reason |
|---|---|---|
| 1 | SLS DELETEs | Must precede DataLink DELETEs; explicit deletions first so the subsequent cascade has no conflicts |
| 2 | DataLink DELETEs | ON DELETE CASCADE removes any remaining committed SLS rows referencing these DataLinks (siblings not explicitly deleted in step 1) |
| 3 | DataPort DELETEs | Orphaned subsystem ports; `ON DELETE RESTRICT` on SLS port FKs is safe since all referencing SLS were removed in steps 1–2 |
| 4 | DataPort CREATEs | New subsystem ports must exist before SLS referencing them are created |
| 5 | DataLink CREATEs | Must exist before SLS CREATEs that reference them |
| 6 | SLS CREATEs | `data_link_system_id` FK satisfied by step 5; all CREATEs at this point have non-null `dataLinkSystemId` (unresolved ones were discarded in pre-pass) |
| 7 | SLS UPDATEs that **set** `dataLinkSystemId` | Resolution results; DataLink must exist (step 5) |

---

## 9. Invariant Enforcement

| Invariant | Enforced by |
|---|---|
| **I1** — DataLink endpoints are always module nodes | `CreateDataLinkHandler` step 1 rejects subsystem node endpoints |
| **I2** — Subsystem port in at most one SLS as source, at most one as dest | `CreateSubsystemLinkSegmentHandler` and `CreateDataLinkHandler` (auto-SLS): `ISubsystemLinkSegmentRepository.getByPortId()` checked before every write |
| **I3** — DataLink referenced by zero SLS or a complete chain | `DeleteSubsystemLinkSegmentHandler` Case B deletes this segment and the DataLink; ON DELETE CASCADE removes sibling SLS at commit; topology operations (`FR-VL-20a`) write a complete new chain atomically |
| **I4** — Chain endpoint ports are module ports | `ChainResolutionService`: `sourcePortId` and `destPortId` are the ports of the first/last segment's module endpoints; module nodes only have `Input`/`Output` ports |
| **I5** — `linkType` consistency with subgraph FKs | `CreateDataLinkHandler` and chain resolution callers compute `linkType` and set both subgraph FKs in the same step |
| **I6** — `isEc` nullability | Handler sets `isEc = null` for `INTRA_SUBGRAPH` and `INTER_USECASE`; only a boolean for `INTRA_USECASE` |
| **I7** — Committed SLS persist until explicitly deleted | No bulk-delete of SLS outside the designated delete handlers and the commit pre-pass; commit pre-pass only discards pending-CREATE SLS, never committed rows |
| **I8** — Orphaned subsystem port cleanup | Commit Step B: scans for unreferenced subsystem ports after all DELETEs/DISCARDs; discards pending CREATEs and records committed-row DELETEs |

---

## 10. Testing Strategy

### 10.1 Unit tests — `packages/core/tests/unit/`

Pure domain services with no DB or mocks.

**`ChainResolutionService`:**
- Single complete chain (module → subsystem → module)
- Multiple independent complete chains in one call
- Incomplete chain (dead end at a subsystem node)
- Cycle detection (SLS form a loop)
- Fan-out: one module with two outgoing SLS (two separate chains)
- Empty input (fast path — no segments)

**`SubsystemBoundaryPathService`:**
- Both modules inside the same top-level subsystem but reported as different (should not be called in practice — defensive)
- One module at top level, one inside one subsystem
- Both modules inside different top-level subsystems
- Source module nested two levels deep, dest nested one level deep (LCA = null)
- Both modules share an outer subsystem (LCA is a non-null subsystem node) — only inner boundaries crossed
- Deep nesting on both sides with a non-null LCA

### 10.2 Integration tests — `packages/infrastructure/persistence/tests/integration/`

In-memory SQLite, full handler execution.

| Handler | Key cases |
|---|---|
| `CreateSubsystemLinkSegmentHandler` (Branch A — same-parent mod→mod) | DataLink created; no SLS produced; returns `{ systemId, type: 'DataLink' }` |
| `CreateSubsystemLinkSegmentHandler` (Branch B — cross-parent mod→mod) | DataLink + SLS chain created; all share groupId; new subsystem port created per boundary; returns SLS IDs only |
| `CreateSubsystemLinkSegmentHandler` (Branch C — subsystem endpoint) | Valid SLS creation; 422 port direction; 422 port already in use (I2) |
| `CreateDataLinkHandler` (same context) | DataLink only; no SLS produced |
| `CreateDataLinkHandler` (cross-subsystem) | DataLink + SLS chain; all share groupId; new subsystem port created per boundary |
| `DeleteDataLinkHandler` | DataLink + all sibling SLS get DELETE edit actions; same groupId |
| `DeleteSubsystemLinkSegmentHandler` Case A | SLS deleted; nothing else touched |
| `DeleteSubsystemLinkSegmentHandler` Case B | DataLink deleted; sibling SLS cleaned up by ON DELETE CASCADE at commit; groupId shared |
| `ResolveVirtualLinkChainsHandler` | Complete chains resolved; 422 on incomplete chains; fast path when no unresolved SLS |
| Commit pre-pass | Incomplete SLS discarded with warning; orphaned subsystem ports cleaned up; topological order respected |

### 10.3 E2E tests — `packages/api/tests/e2e/`

Full NestJS + Supertest round-trips.

| Scenario | What it verifies |
|---|---|
| Flat-mode create + flat read | `POST /data-links` (same context) → `GET /components?showSubsystems=false` returns the link |
| Cross-subsystem flat create | `POST /data-links` (cross-subsystem) → `{ systemId, type: 'DataLink' }`; SLS auto-created internally; `GET /components?showSubsystems=true` shows the chain |
| Subsystem-mode same-parent mod→mod | `POST /subsystem-links` (both modules in same subsystem) → response is `{ systemId, type: 'DataLink' }`; no SLS in subsystem view |
| Subsystem-mode cross-parent mod→mod | `POST /subsystem-links` (modules in different subsystems) → response contains SLS IDs only; `GET /components?showSubsystems=true` shows the resolved chain; DataLink exists in flat view |
| Subsystem-mode create + resolve | `POST /subsystem-links` ×N to build a chain → `GET /components?showSubsystems=false` triggers resolution and returns DataLink |
| Incomplete chain blocks flat read | Dangling SLS → `GET /components?showSubsystems=false` returns 422 with segment IDs |
| Delete DataLink cascades | `DELETE /data-links/{id}` → commit → SLS absent from subsystem view |
| Delete resolved SLS (Case B) | `DELETE /subsystem-links/{id}` on resolved SLS → siblings become unresolved → DataLink absent from flat view |
| Commit discards incomplete SLS | Dangling SLS → `POST /commit-changes` → warning in response; SLS absent from DB |

---

## 11. Control Subsystem Link Segments

Control links are bidirectional and use a separate port type (`control_ports`, no `portIoType`). Everything in this section is parallel to the data link design but adapted for those two differences. Abbreviation: **CSLS** (`ControlSubsystemLinkSegment`).

---

### 11.1 Schema fix — canonical ordering on `control_links`

**Problem:** The current unique index `uk_control_link_unique: (peerNodeASystemId, peerNodeBSystemId, nodeAPortSystemId, nodeBPortSystemId)` is ordered. `(A, B, P1, P2)` and `(B, A, P2, P1)` pass independently, creating duplicate rows for the same bidirectional link.

**Fix:** Before every `ControlLink` insert, normalize so the endpoint with the **lower `portSystemId`** is always stored as peerA. Update the unique index and add a CHECK constraint to make the invariant DB-enforced:

```sql
-- new unique index (node columns are redundant once ports are canonical)
uk_control_link_unique: (nodeAPortSystemId, nodeBPortSystemId)

-- new CHECK constraint
CHECK (nodeA_port_system_id < nodeB_port_system_id)
```

All `ControlLink` creation paths — `CreateControlLinkHandler` (flat-mode) and chain resolution — must apply this normalization before the duplicate check.

---

### 11.2 `ControlSubsystemLinkSegment` domain entity

**New file:** `packages/core/src/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.ts`

```typescript
export class ControlSubsystemLinkSegment {
  systemId:         number;
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  controlLinkSystemId: number | null;  // null in edit_actions payload only (unresolved); committed rows are always non-null
  fileSystemId:     number;
  version:          number;
}
```

`controlLinkSystemId` is a loose FK — a CSLS can exist in edit_actions without a resolved ControlLink (`controlLinkSystemId = null`), and a ControlLink can exist without any CSLS (flat-mode connection with no subsystem boundary). Committed CSLS rows in the actual table always have a non-null `controlLinkSystemId`. There is no peerA/peerB canonical ordering on the segment itself — canonical ordering applies only to the resolved `ControlLink`.

---

### 11.3 `control_subsystem_link_segments` table

**New file:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/links/control-subsystem-link-segment.schema.ts`

```typescript
export interface ControlSubsystemLinkSegmentRow extends EntityBaseRow {
  peerNodeASystemId:   number;
  peerNodeBSystemId:   number;
  nodeAPortSystemId:   number;
  nodeBPortSystemId:   number;
  controlLinkSystemId: number;
  fileSystemId:        number;
}
```

Column definitions:

| Column | Type | Nullable | FK behaviour |
|---|---|---|---|
| `system_id` | INTEGER PK | — | `BaseColumnSchemaPart` |
| `peer_nodeA_system_id` | INTEGER | NOT NULL | → `nodes` ON DELETE CASCADE |
| `peer_nodeB_system_id` | INTEGER | NOT NULL | → `nodes` ON DELETE CASCADE |
| `nodeA_port_system_id` | INTEGER | NOT NULL | → `control_ports` ON DELETE RESTRICT |
| `nodeB_port_system_id` | INTEGER | NOT NULL | → `control_ports` ON DELETE RESTRICT |
| `control_link_system_id` | INTEGER | NOT NULL | → `control_links` ON DELETE CASCADE |
| `file_system_id` | INTEGER | NOT NULL | → `arc_db_files` ON DELETE CASCADE |
| `version` | INTEGER | NOT NULL | default 1, optimistic locking |
| `created_at` / `updated_at` | DATETIME | — | `BaseColumnSchemaPart` |

`ON DELETE CASCADE` on `control_link_system_id`: when a ControlLink row is deleted at commit time, all CSLS referencing it are automatically removed. The actual `control_subsystem_link_segments` table never contains rows with a null or dangling `control_link_system_id` — the commit pre-pass (Step A') discards all unresolved CSLS before the transaction runs.

`ON DELETE RESTRICT` on port FKs: prevents deleting a `control_ports` row still referenced by a CSLS. Orphaned boundary control port cleanup (§11.9) always records CSLS DELETEs before ControlPort DELETEs.

Indices:

```
idx_csls_file              ON (file_system_id)
idx_csls_control_link      ON (control_link_system_id)
idx_csls_nodeA_port_file   ON (nodeA_port_system_id, file_system_id)
idx_csls_nodeB_port_file   ON (nodeB_port_system_id, file_system_id)
```

Add `ControlSubsystemLinkSegment: 'ControlSubsystemLinkSegment'` to `ENTITY_NAMES`.

---

### 11.4 Subsystem control port creation — inlined, no standalone handler

Subsystem boundary control ports are created **inline** by `CreateControlSubsystemLinkSegmentHandler` Branch B and Branch C. There is no separate API endpoint:

- **Branch B**: auto-creates a control port on every boundary node traversed (portId = next sequential integer, intents propagated from module endpoints).
- **Branch C**: creates a control port inline when the caller omits `portSystemId` for the subsystem endpoint (portId = next sequential integer, intents propagated from non-empty endpoint per §11.6 Branch C).

---

### 11.5 `POST /control-subsystem-links` response shapes

```typescript
// Both endpoints are module nodes, same parentId (or both null) — ControlLink only:
{ systemId: number; type: 'ControlLink' }

// Both endpoints are module nodes, different parentIds — ControlLink + resolved CSLS chain:
{ controlSubsystemLinkSegments: { systemId: number }[] }

// At least one endpoint is a subsystem node — single unresolved CSLS:
// createdPortSystemId present only when a port was auto-created (portSystemId omitted by caller)
{ systemId: number; createdPortSystemId?: number }
```

Parallel to `POST /subsystem-links`. `POST /control-links` (flat-mode) is unchanged except for the canonical ordering fix applied at the handler level.

---

### 11.6 `CreateControlSubsystemLinkSegmentHandler` — new

**Command fields:** `peerNodeASystemId`, `peerNodeBSystemId`, `nodeAPortSystemId`, `nodeBPortSystemId`, `projectId`

The `portSystemId` for a subsystem-node endpoint is **optional**. If omitted, the handler creates the control port inline (portId = next sequential integer on that node). For module-node endpoints the port ID is always required.

Branches on endpoint node types before any other validation.

---

#### Branch A — Both endpoints are module nodes, same `parentId` (or both `null`)

No subsystem boundary. Create ControlLink directly:

1. Canonicalize: if `nodeAPortSystemId > nodeBPortSystemId`, swap peerA↔peerB.
2. Duplicate check: if a ControlLink with the same `(nodeAPortSystemId, nodeBPortSystemId)` already exists → 422.
3. Compute `linkType` from subgraph membership.
4. Pre-assign `systemId`.
5. Record ControlLink CREATE (`change_status = STAGED`).
6. Return `{ systemId, type: 'ControlLink' }`.

---

#### Branch B — Both endpoints are module nodes, different `parentId` values

Reuses `SubsystemBoundaryPathService` for the node sequence. The `requiredPortType` map in the output is ignored — control ports have no type.

1. Canonicalize peerA/peerB (lower `portSystemId` first).
2. Duplicate check on canonicalized ports → 422 if exists.
3. Validate both module control ports have identical intent sets (`intentIds`). If they differ → 422: "control port intents do not match."
4. Call `INodeRepository.getNodeParentMap(fileId)`.
5. Call `SubsystemBoundaryPathService` → `pathOutput` (use `nodeSequence` only).
6. For each subsystem node in `pathOutput.nodeSequence` (excluding first and last): count existing control ports on that node → `baseIndex`; compute `portId = baseIndex + 1`; pre-assign a new `systemId`; record a ControlPort CREATE edit action (`isStatic = false`); record IntentRow CREATEs for each intent in the module endpoint's intent set, assigning them to this new subsystem port — all sharing `groupId`. Propagating intents at creation time ensures that if this chain is later partially broken and a user attempts to re-connect via Branch C, the intermediate ports correctly reject mismatched module intents at draw time rather than at commit.
7. Pre-assign a `systemId` for the ControlLink. Generate a shared `groupId`.
8. Compute `linkType` from subgraph membership.
9. Record ControlLink CREATE with `groupId`.
10. For each adjacent pair `(nodeA, nodeB)` in `pathOutput.nodeSequence`: resolve port IDs — first pair uses the source module's control port from the command; intermediate pairs use the boundary control port created in step 6; last pair uses the destination module's control port. Record a CSLS CREATE with `controlLinkSystemId` set to the new ControlLink's `systemId`, sharing the `groupId`. These CSLS are immediately resolved.
11. Record all ControlPort CREATEs and IntentRow CREATEs from step 6 with the same `groupId`.
12. Return `{ controlSubsystemLinkSegments: [{ systemId }, …] }`.

---

#### Branch C — At least one endpoint is a subsystem node

Validation and intent propagation (first failure returns 422):

1. **Topology-aware side check**: for each endpoint port that belongs to a subsystem node (call it SubsystemX), determine which topological side the new CSLS would occupy and verify that side is not already taken.

   **Determining the side of a connection relative to SubsystemX:** walk the `parentId` chain of the other endpoint node upward. If SubsystemX appears anywhere in that chain, the connection is on the **inner side** (the other node lives inside SubsystemX). If SubsystemX does not appear, the connection is on the **outer side** (the other node lives outside SubsystemX).

   **Check:** call `IControlSubsystemLinkSegmentRepository.getByPortId(portSystemId, fileId, sessionId)` to get all existing CSLS for this port. For each existing CSLS, apply the same ancestry walk to its other endpoint to classify it as inner or outer. If any existing CSLS already occupies the same side as the new CSLS → **422**: "control port already connected on the [inner|outer] side."

   A port may have one inner-side connection and one outer-side connection simultaneously — only a second connection on the same side is rejected.

2. **Intent validation and propagation:**

   Determine the intent set of each endpoint (committed IntentRows + overlay for that port):

   | Port A intents | Port B intents | Action |
   |---|---|---|
   | Non-empty (module or already-propagated subsystem port) | Empty subsystem port | Propagate to port B; then cascade (see below) |
   | Empty subsystem port | Non-empty | Propagate to port A; then cascade |
   | Both non-empty, same intent set | — | Allow; no propagation needed |
   | Both non-empty, different intent sets | — | 422: "control port intents do not match" |
   | Both empty | — | 422: "must start from a module control port — cannot connect two empty subsystem ports" |

   **Cascade forward propagation** — after writing IntentRow CREATEs for the directly-populated port, call `ControlIntentPropagationService.cascadePropagate(...)` (§11.8) to fill all other empty subsystem ports connected through the existing segment graph. All IntentRow CREATEs from the direct propagation and the cascade share the same `groupId` as the CSLS CREATE.

**Inline port creation** — if the subsystem endpoint's `portSystemId` was omitted:

3. Count existing control ports on the subsystem node (committed + overlay) → `baseIndex`. Compute `portId = baseIndex + 1`.
4. Pre-assign `portSystemId` via `IdGenerationPort`. Record ControlPort CREATE edit action (`isStatic = false`, no intents, `change_status = STAGED`). Store as `createdPortSystemId`.

If all checks pass:

5. Pre-assign CSLS `systemId` via `IdGenerationPort`.
6. Record CSLS CREATE (`controlLinkSystemId = null`, `change_status = STAGED`), using the provided or just-created `portSystemId`.
7. Return `{ systemId; createdPortSystemId? }` — `createdPortSystemId` is present only when a port was auto-created in step 4.

---

### 11.7 `DeleteControlSubsystemLinkSegmentHandler` — new

**Command fields:** `cslsSystemId`, `projectId`

Both cases share a common **intent clearing step** after the segment DELETE is recorded:

**Intent clearing (applied in both cases):**
1. Load all remaining CSLS for the file (committed + overlay, excluding the segment being deleted).
2. Build the undirected CSLS graph from those remaining segments.
3. Identify connected components. For each component, check whether it contains at least one module node (`nodeTypeMap`).
4. For each subsystem control port that was an endpoint of the deleted segment: if its connected component has **no module node**, collect all `IntentRow` records for every subsystem port in that component (committed + overlay). Record IntentRow DELETE edit_actions for each.

**Case A — unresolved** (`controlLinkSystemId = null`):
1. Record CSLS DELETE.
2. Apply intent clearing step above.
3. Return 204.

**Case B — resolved** (`controlLinkSystemId = L1`):
1. Generate shared `groupId`.
2. Record CSLS DELETE for this segment, sharing `groupId`.
3. Record ControlLink DELETE for L1 (with `baseVersion`), sharing `groupId`.
4. Call `IControlSubsystemLinkSegmentRepository.getByControlLinkId(L1, fileId, sessionId)`. For each sibling: record CSLS UPDATE setting `controlLinkSystemId = null`, sharing `groupId`. This makes sibling CSLS appear unresolved in the overlay so they are picked up and discarded/deleted by the commit pre-pass (§11.11 Step A').
5. Apply intent clearing step above (include sibling CSLS in the remaining graph when computing reachability — they still appear in the overlay after the null-FK UPDATE and correctly represent the connected topology for intent clearing).
6. Return 204.

The null-FK UPDATE edit_actions are **never applied to the actual table** (the column is NOT NULL). At commit, Step A' detects these sibling CSLS as unresolved in the overlay, runs chain resolution, finds incomplete chains, and records explicit DELETE edit_actions for committed sibling rows. Pending sibling CREATEs are marked DISCARDED. ON DELETE CASCADE acts as a safety net.

---

### 11.8 `ControlIntentPropagationService` — new pure service

**Purpose:** Two complementary operations on the CSLS graph — clearing intents from unanchored ports after a deletion, and cascade-propagating intents forward through empty connected ports after a new segment is drawn.

**Location:** `packages/core/src/domain/services/control-links/`

---

#### Operation A — `findPortsToClear` (used by delete handler)

```typescript
interface ClearInput {
  remainingSegments: {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }[];
  nodeTypeMap:    Map<number, NodeType>;
  deletedSegment: { peerNodeASystemId: number; peerNodeBSystemId: number };
}

interface ClearResult {
  portsToClear: number[];  // systemIds of subsystem ports in components with no module node
}
```

**Algorithm:**
1. Build undirected adjacency from `remainingSegments`.
2. Run connected-component analysis (BFS/DFS).
3. For each component: if `nodeTypeMap` shows no module node, collect all subsystem-node ports in the component.
4. Return those ports as `portsToClear`.

---

#### Operation B — `cascadePropagate` (used by create handler Branch C)

After directly propagating intents to the empty endpoint port, this operation finds all other empty subsystem ports reachable through the existing CSLS graph and propagates the same intent set to them.

```typescript
interface PropagateInput {
  startPortSystemId: number;     // the port that just received intents
  intentIds:         number[];   // intents to propagate
  allSegments: {                 // all CSLS for the file (committed + overlay, including the new segment)
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }[];
  nodeTypeMap:        Map<number, NodeType>;
  portIntentMap:      Map<number, number[]>;  // portSystemId → current intentIds (empty array = no intents)
}

interface PropagateResult {
  portsToFill: { portSystemId: number; intentIds: number[] }[];
}
```

**Algorithm (BFS flood fill):**
1. Build undirected adjacency from `allSegments`.
2. Start BFS from `startPortSystemId`. Visited set prevents re-visiting.
3. For each neighbour node in the graph:
   - If it is a **module node** → stop this branch (do not cross module boundaries; modules have fixed intents).
   - If it is a **subsystem node** with an empty port (`portIntentMap` shows empty) → add `{ portSystemId, intentIds }` to `portsToFill`; enqueue for further traversal.
   - If it is a **subsystem node** with intents already set → stop this branch (already has intents, no fill needed).
4. Return `portsToFill`.

The caller records IntentRow CREATEs for each port in `portsToFill`, sharing the same `groupId` as the triggering CSLS CREATE.

---

### 11.9 `ControlChainResolutionService`

**Purpose:** Given all unresolved CSLS for a file, finds every complete undirected path between two module nodes and returns the information needed to create a canonical ControlLink for each.

**Location:** `packages/core/src/domain/services/control-links/`

#### Input

```typescript
interface ControlResolutionInput {
  unresolvedSegments: {
    systemId:          number;
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }[];
  nodeTypeMap: Map<number, NodeType>;
}
```

#### Output

```typescript
interface ControlResolutionResult {
  completeChains: {
    segmentIds:       number[];    // ordered CSLS system_ids for UPDATE edit actions
    peerAPortSystemId: number;     // canonicalized (lower systemId) — → ControlLink.nodeAPortSystemId
    peerBPortSystemId: number;     // canonicalized (higher systemId) — → ControlLink.nodeBPortSystemId
    peerANodeSystemId: number;
    peerBNodeSystemId: number;
  }[];
  incompleteChains: {
    segmentIds:        number[];
    reachableNodeIds:  number[];   // all nodes reached before dead end or cycle
  }[];
}
```

#### Algorithm

1. Build an **undirected** adjacency map: `nodeId → { neighborNodeId, segmentSystemId, portOnThisNode, portOnNeighborNode }[]`. Each segment contributes two entries (one per direction).
2. Identify module nodes that appear in any segment.
3. For each unvisited module node, run undirected DFS. Maintain a `visited` set to detect cycles.
4. A walk terminates as **complete** when the current node is a module node and is not the start node. It terminates as **incomplete** on dead end or cycle.
5. For each complete chain, extract the two module endpoint ports. Apply canonical ordering: `peerAPortSystemId = min(startPort, endPort)`, `peerBPortSystemId = max(...)`.

---

### 11.10 `IControlSubsystemLinkSegmentRepository`

**Location:** `packages/core/src/application/ports/persistence/repositories/`

```typescript
interface IControlSubsystemLinkSegmentRepository {
  // All CSLS for the file — used by DeleteControlSubsystemLinkSegmentHandler intent clearing
  getAllForFile(fileId: number, sessionId: number): Promise<ControlSubsystemLinkSegmentRow[]>;

  // Only where controlLinkSystemId = null (including sibling null-FK UPDATEs) — used by commit Step A'
  getUnresolvedForFile(fileId: number, sessionId: number): Promise<ControlSubsystemLinkSegmentRow[]>;

  // Filtered by controlLinkSystemId — used by DeleteControlSubsystemLinkSegmentHandler Case B sibling nulling
  getByControlLinkId(controlLinkSystemId: number, fileId: number, sessionId: number): Promise<ControlSubsystemLinkSegmentRow[]>;

  // All CSLS where this port appears as either nodeAPort or nodeBPort — used by Branch C side check
  getByPortId(portSystemId: number, fileId: number, sessionId: number): Promise<ControlSubsystemLinkSegmentRow[]>;
}
```

**`IControlPortRepository` — new method:**

```typescript
// Returns all IntentRows for a given control port (committed + overlay).
getIntentsByPortId(portSystemId: number, sessionId: number): Promise<IntentRow[]>;
```

Used by the delete handler to find which IntentRows to clear for unanchored ports.

---

### 11.11 Commit orchestration additions

Two new steps run in `CommitChangesHandler` alongside the existing data link steps (§8):

**Step A' — incomplete control chain discard and committed sibling cleanup**

Parallel to §8.1 (same extended logic):
1. Call `IControlSubsystemLinkSegmentRepository.getUnresolvedForFile(fileId, sessionId)` — returns both pending CREATE CSLS with `controlLinkSystemId = null` AND committed CSLS whose FK was nulled via UPDATE edit_action (siblings from `DeleteControlSubsystemLinkSegmentHandler` Case B).
2. Run `ControlChainResolutionService.resolve()` on all of them.
3. For complete chains: canonicalize endpoints, record ControlLink CREATE + CSLS UPDATEs in STAGED set.
4. For incomplete chains, for each CSLS in the chain:
   - Pending CREATE in edit_actions: mark `change_status = DISCARDED`.
   - Committed row in actual table (with null-FK UPDATE in overlay): record an explicit CSLS DELETE in the STAGED set.
5. If any were discarded or deleted: append to commit response: `"N control subsystem link segment(s) were discarded because they did not form complete connections."`

**Strict invariant assertion:** After Step A', scan the STAGED edit set for any CSLS CREATE or UPDATE with `controlLinkSystemId = null`. If any remain → abort commit with internal error.

**Step B' — orphaned boundary control port cleanup**

Parallel to §8.2: scan for control ports on subsystem nodes that have no CSLS referencing them after all DELETEs/DISCARDs. Discard pending CREATEs; record committed-row DELETEs.

**Topological commit order additions** (inserted into §8.3 table):

| Order | Operation |
|---|---|
| 1a | IntentRow DELETEs (unanchored port clearing from `DeleteControlSubsystemLinkSegmentHandler`) |
| 2a | CSLS DELETEs |
| 3a | ControlLink DELETEs |
| 4a | Boundary ControlPort DELETEs |
| 5a | Boundary ControlPort CREATEs |
| 6a | IntentRow CREATEs (propagated intents from `CreateControlSubsystemLinkSegmentHandler` Branch B and Branch C cascade) |
| 7a | ControlLink CREATEs |
| 8a | CSLS CREATEs |
| 9a | CSLS UPDATEs that **set** `controlLinkSystemId` |

IntentRow DELETEs (1a) precede ControlPort DELETEs (4a): the FK from `intents.control_port_system_id → control_ports` must be cleared before the port row can be deleted. IntentRow CREATEs (6a) follow ControlPort CREATEs (5a) for the same FK reason — the port must exist before any IntentRow can reference it.

---

### 11.12 Testing additions

**Unit tests — `ControlChainResolutionService`:**
- Single complete chain (module ↔ subsystem ↔ module)
- Multiple independent complete chains
- Incomplete chain (dead end at a subsystem node)
- Cycle detection
- Fan-out: one boundary port with two outgoing segments (two separate chains)
- Chain traversed in reverse direction produces same canonical output (`peerA` always has lower `portSystemId`)

**Unit tests — `ControlIntentPropagationService`:**
- **`findPortsToClear`**: Delete module-end segment from incomplete chain → all downstream ports returned; delete middle segment → only isolated downstream component cleared; delete segment from resolved chain (sibling still in overlay) → reachability via sibling prevents clearing; isolated port → returned for clearing
- **`cascadePropagate`**: New segment restores intents to one port → cascade fills all connected empty ports; cascade stops at module boundary; cascade stops at already-populated subsystem port; cascade stops when no further empty ports reachable; chain of three empty ports — all filled from single segment draw

**Integration tests:**

| Handler | Key cases |
|---|---|
| `CreateControlSubsystemLinkSegmentHandler` Branch A | ControlLink created with canonical ordering; 422 on duplicate (both orderings) |
| `CreateControlSubsystemLinkSegmentHandler` Branch B | ControlLink + CSLS chain; intermediate subsystem ports receive IntentRow CREATEs with module endpoint intents; module intents match; 422 when module intents mismatch; returns CSLS IDs only |
| `CreateControlSubsystemLinkSegmentHandler` Branch C | Intent propagation: module→subsystem propagates intents and cascades to all connected empty subsystem ports; subsystem→subsystem carries intents; both empty → 422; mismatch → 422; 422 same-side violation |
| `DeleteControlSubsystemLinkSegmentHandler` Case A | CSLS deleted; unanchored ports cleared; anchored ports untouched |
| `DeleteControlSubsystemLinkSegmentHandler` Case B | ControlLink deleted; sibling CSLS reachable from other module end keeps intents; isolated ports cleared |
| `CreateControlLinkHandler` (flat-mode) | Canonical ordering enforced; reverse-direction duplicate → 422 |
| Commit pre-pass | Incomplete CSLS discarded; orphaned boundary control ports and their intents cleaned up |
| `DeleteControlSubsystemLinkSegmentHandler` Case B | ControlLink deleted; sibling CSLS cleaned up by ON DELETE CASCADE at commit; groupId shared |
| `CreateControlLinkHandler` (flat-mode) | Canonical ordering enforced; adding reverse-direction duplicate → 422 |
| Commit pre-pass | Incomplete CSLS discarded; orphaned boundary control ports cleaned up |

**E2E tests:**

| Scenario | What it verifies |
|---|---|
| Same-parent control link via subsystem API | `POST /control-subsystem-links` (same subsystem) → `{ systemId, type: 'ControlLink' }` |
| Cross-parent control link via subsystem API | `POST /control-subsystem-links` (different subsystems) → CSLS IDs; ControlLink in flat view |
| Reverse-direction flat duplicate blocked | `POST /control-links` P1→P2 then P2→P1 → second call 422 |
| Same-side violation | `POST /control-subsystem-links` with boundary port already used on same topological side → 422 |

---

*End of Document*
