<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Subsystem Links Upload Design

**Date:** 2026-07-22
**Status:** Implemented

---

## Context

The upload pipeline inserts `Subsystem` nodes and `DataLink`/`ControlLink`
entities. Subsystem boundary crossing link segments — `SubsystemDataLink` (SLS)
and `SubsystemControlLink` (CSLS) — were never populated. The inserters for
both entity types already read from `DataLink.subsystemDataLinks[]` and
`ControlLink.subsystemControlLinks[]`; once those arrays are populated before
insertion, persistence requires no further changes.

---

## Requirements

**FR1.** For every `DataLink` whose source and destination modules belong to
different subsystem contexts, compute the `SubsystemDataLink` segment chain and
attach it to `DataLink.subsystemDataLinks[]` before insertion.

**FR2.** For every `ControlLink` whose peer modules belong to different subsystem
contexts, compute the `SubsystemControlLink` segment chain and attach it to
`ControlLink.subsystemControlLinks[]` before insertion.

**FR3.** Boundary data and control ports on each subsystem node are auto-created
with unique `systemId` and `portId` values and inserted as part of the subsystem
node row.

**FR4.** Each data link crossing a subsystem boundary gets its own dedicated data
port on that subsystem. Same for control links and control ports.

**FR5.** Subsystem DB insertion happens after all boundary ports are computed, so
subsystem rows are inserted once with full ports.

**FR6.** Path computation is separated from ID assignment — paths are computed
first (synchronous, pure), IDs assigned second (async, sequential).

**FR7.** When a worker pool is available and threading is supported, path
computation runs in parallel: data links split across 4 worker tasks, control
links in 1 worker task. Falls back to sequential when pool is unavailable.

**Out of scope:** Subsystem link creation/deletion as a live editing operation.
Control port intents insertion (already deferred in a separate TODO).

---

## Architecture

### Upload pipeline phase order

```
Phase 2:  buildAndInsertSubgraphs         (registers subgraph FK mappings)
Phase 3:  buildAndInsertContainers
Phase 4:  buildAndInsertSpfModules        (registers module→subgraph mappings)
Phase 4b: buildAndInsertDriverModules
Phase 5:  (inline in persistEntitiesInHierarchicalOrder)
          1. buildDataLinks()
          2. buildControlLinks()
          3. if uiSubsystems present:
               builderService.buildSubsystems() → SubsystemBuildResult
          4. insertSubsystems()
          5. insertDataLinks()
          6. insertControlLinks()
Phase 7:  buildAndInsertUsecases
```

There is no separate Phase 2b or Phase 5c. Subsystem building and link
enrichment are a single inline block in Phase 5 — no intermediate class-level
state is carried between phases.

### Key design decisions

- **`SubsystemBuilder` owns all subsystem construction.** The former
  `SubsystemLinkBuilder` class has been merged into `SubsystemBuilder`. One
  class, one responsibility: produce complete `Subsystem` entities (shells +
  boundary ports) and enrich the link arrays with SLS/CSLS segments.

- **`SubsystemBuilder.build()` is the single entry point:**
  ```typescript
  async build(
    uiSubsystems: UiSubsystem[],
    fileSystemId: number,
    dataLinks: DataLink[],
    controlLinks: ControlLink[],
  ): Promise<SubsystemBuildResult>
  ```
  Returns `{ subsystems, dataLinks, controlLinks }`. The link arrays are the
  same instances passed in — boundary-crossing ones are mutated with segments
  attached; unchanged links have empty segment arrays. Subsystems are new
  instances rebuilt with boundary ports populated (immutable entity).

- **No class-level phase state.** The orchestrator has no `builtSubsystems`
  field or deferred-insert pattern. All values are local variables within the
  Phase 5 block.

- **`nodeParentMap` is built inside `SubsystemBuilder`**, not in the
  orchestrator. It is an implementation detail of `attachBoundaryPorts()`.

---

## SubsystemBuilder Algorithm

### Phase 1 — Shell building (`buildSubsystemShells`)

Topological sort of `UiSubsystem[]`, then for each entry in parent-first order:

1. Allocate `systemId` via `idGenerator.getNextId()`.
2. Resolve `parentId` via `foreignKeyMapper.getSubsystemSystemId()`.
3. Construct `Subsystem` with empty `dataPorts` / `controlPorts`.
4. Register FK mapping: `foreignKeyMapper.addSubsystemMapping(naturalId, systemId)`.
5. For each `Subgraph` child: look up the subgraph's `systemId` from the FK
   mapper and store `subgraphSystemId → subsystemSystemId` in the internal
   `subgraphToSubsystemMap`.

### Phase 2 — Boundary port attachment (`attachBoundaryPorts`)

#### nodeParentMap construction

Built once from the shell list:

- **Subsystem entries:** `s.systemId → s.parentId ?? null`
- **Module entries:** iterate `foreignKeyMapper.getModuleInstanceSubgraphEntries()`
  (module instanceNaturalId → subgraph **systemId**). For each entry:
  - `moduleSystemId = foreignKeyMapper.getSpfModuleSystemId(instanceNaturalId)`
  - `parentSubsystemSystemId = subgraphToSubsystemMap.get(subgraphSystemId) ?? null`

Driver modules have no subgraph entry and receive `null` parent (treated as
top-level by the path service).

#### Steps A–F

**Step A — Compute paths (parallel or sequential):**
For each `DataLink`, call `SubsystemBoundaryPathService.compute({sourceNodeId,
destNodeId, nodeParentMap})`. Skip if `nodeSequence.length <= 2` (no boundary).
For `ControlLink`, use `peerNodeASystemId` / `peerNodeBSystemId`.

When a `WorkerPoolPort` is available and threading is supported:
- Data links split into 4 equal chunks → 4 parallel worker tasks.
- Control links dispatched as 1 worker task.
- Worker handler key: `COMPUTE_SUBSYSTEM_LINK_PATHS`, registered in
  `parser-registry.ts` and backed by the static `SubsystemBuilder.computePaths()`.
- `nodeParentMap` serialized as `[number, number|null][]` for structured-clone
  transfer. Results deserialized back to `PathOutput | null` on the main thread.

**Step B — Collect port requirements:**
For each boundary-crossing link, record one port slot per
`(linkIndex, boundarySubsystemSystemId)` key. Data ports carry the `portIoType`
from the path service output. Control ports have no direction.

**Step C — Assign IDs (async, sequential per subsystem):**
Allocate a `systemId` via `idGenerator` and a `portId` counter (1-based per
subsystem) for each port slot.

**Step D — Build SLS segments:**
Walk `nodeSequence` pairwise. First segment: source port =
`dataLink.sourcePortSystemId`. Last segment: destination port =
`dataLink.destinationPortSystemId`. Interior segments use the boundary port
from the adjacent subsystem. Each segment gets its own `systemId` from
`idGenerator`. Attach via `dataLink.addSubsystemDataLink()`.

**Step E — Build CSLS segments:**
Same pairwise walk for control links. Attach by pushing to
`controlLink.subsystemControlLinks`.

**Step F — Rebuild Subsystem entities:**
Assemble `DataPort[]` and `ControlPort[]` per subsystem from the port
assignments. Return new `Subsystem` instances (same `systemId`s) with ports
populated. Subsystems with no boundary crossings are returned as-is (original
instance).

---

## Result type

```typescript
export interface SubsystemBuildResult {
  subsystems: Subsystem[];   // rebuilt with boundary ports
  dataLinks: DataLink[];     // full input array; crossing ones have SLS attached
  controlLinks: ControlLink[]; // full input array; crossing ones have CSLS attached
}
```

---

## Files

| File | Role |
|------|------|
| `entity-builders/subsystem-builder.ts` | `SubsystemBuilder` — all subsystem construction: shells, boundary ports, SLS/CSLS assembly. Exports `SubsystemBuildResult`, `SubsystemPathComputeInput`, `SubsystemPathComputeOutput`. |
| `entity-builder-service.ts` | `buildSubsystems(uiSubsystems, fileSystemId, dataLinks, controlLinks)` delegates to `SubsystemBuilder.build()`. |
| `upload-file-orchestrator.ts` | Phase 5 inline block: `buildDataLinks()`, `buildControlLinks()`, optional `buildSubsystems()`, then `insertSubsystems()`, `insertDataLinks()`, `insertControlLinks()`. |
| `workers/parser-registry.ts` | Registers `COMPUTE_SUBSYSTEM_LINK_PATHS` handler backed by `SubsystemBuilder.computePaths()`. |
| `links/data-link.ts` | `addSubsystemDataLink()` changed from `private` to `public`. |
| `foreign-key-mapper.ts` | `getModuleInstanceSubgraphEntries()` exposes module→subgraph map for `nodeParentMap` construction. |

---

## Edge Cases

- **Module not in any subsystem:** `nodeParentMap` has no entry (treated as
  top-level). `SubsystemBoundaryPathService` computes no segments.
- **DataLink within same subsystem:** `nodeSequence.length === 2`, no SLS
  created.
- **Subsystem with no boundary crossings:** Returned as-is with empty
  `dataPorts` / `controlPorts`.
- **No subsystems in ui-metadata:** `builderService.buildSubsystems()` is not
  called; `DataLink`s and `ControlLink`s are inserted directly without SLS/CSLS.
