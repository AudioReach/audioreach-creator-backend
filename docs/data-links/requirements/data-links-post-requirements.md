# Requirements: POST /data-links and POST /data-links/with-subsystems

**Feature folder:** `docs/data-links/`
**Status:** APPROVED
**Date:** 2026-08-08

---

## Context

Two new write endpoints for managing data-links in the AudioReach usecase designer. The `POST /data-links` handler currently throws "Not implemented". The upload path already contains subsystem-boundary-crossing logic (`SubsystemBuilder.attachBoundaryPorts()` using `SubsystemBoundaryPathService`) that must be extracted into a shared domain service so both upload and the new APIs reuse it.

---

## Definitions

| Term | Meaning |
|---|---|
| DataLink | A resolved module-to-module link stored in `data_links`. Has source+dest module endpoints and optional SLS chain. |
| SLS / SubsystemDataLink | A single directed hop in `subsystem_data_links`. May be resolved (has `dataLinkSystemId`) or unresolved (`dataLinkSystemId = null`). |
| Boundary port | A subsystem data port with `portIoType = InputOutput` (entry) or `OutputInput` (exit). Auto-created when traversing subsystem boundaries. |
| Flat mode | Caller sees only DataLinks and module-level ports; SLS are internal. |
| Subsystem mode | Caller sees SLS chain including subsystem nodes and boundary ports. |
| nodeParentMap | A `Map<nodeSystemId, parentSystemId | null>` covering all nodes in a file, used by the path service. |

---

## Functional Requirements — POST /data-links (flat mode)

### FR-DL-01 — Endpoint definition

`POST /arc-api/v1/projects/:projectId/data-links`

Request body:

```
{
  sourceModuleSystemId:    string        // must be a module node
  sourcePortSystemId:      string        // must be OUTPUT port, must belong to source node
  destinationModuleSystemId: string      // must be a module node
  destinationPortSystemId: string        // must be INPUT port, must belong to dest node
  isInterUsecase?:         boolean       // if true → INTER_USECASE; server derives INTRA_SUBGRAPH vs INTRA_USECASE otherwise
  isEc?:                   boolean       // optional; only valid when derived linkType is INTRA_USECASE
}
```

### FR-DL-02 — Module-only endpoints

`sourceModuleSystemId` and `destinationModuleSystemId` must both be module-type nodes. If either is a subsystem node → `422`.

### FR-DL-03 — Node and port existence

All provided node and port IDs must exist in the session's file. Return `404` if any are not found.

### FR-DL-04 — Port direction validation

- `sourcePortSystemId` must have `portIoType = OUTPUT`. → `422` if not.
- `destinationPortSystemId` must have `portIoType = INPUT`. → `422` if not.

### FR-DL-05 — Port ownership validation

`sourcePortSystemId` must belong to `sourceModuleSystemId`. `destinationPortSystemId` must belong to `destinationModuleSystemId`. → `422` on mismatch.

### FR-DL-06 — No self-loops

`sourceModuleSystemId ≠ destinationModuleSystemId`. → `422` if equal.

### FR-DL-07 — Duplicate DataLink check

If a non-deleted DataLink already exists in the session with the same `(sourcePortSystemId, destinationPortSystemId)` pair → `409 Conflict`.

### FR-DL-07a — Soft-deleted link re-activation

If a **soft-deleted** DataLink exists with the same `(sourcePortSystemId, destinationPortSystemId)` pair, the server shall re-activate it (restore `deleted = false`) rather than creating a new record.

Any SLS associated with the soft-deleted DataLink are **not** re-activated. The server derives a fresh SLS chain from the current graph topology following FR-DL-11. New SLS and boundary ports are created with fresh system IDs and grouped with the re-activated DataLink under a single `groupId`.

### FR-DL-08 — Subgraph IDs are server-derived

The server reads `sourceSubgraphSystemId` from the source module entity and `destSubgraphSystemId` from the dest module entity. These are never provided by the caller.

### FR-DL-09 — linkType derivation

The server derives the internal `linkType` from `isInterUsecase` and the subgraph IDs of the source and dest modules:

- If `isInterUsecase = true` → derived `linkType = INTER_USECASE`. The server validates that the source and dest subgraphs belong to **different** usecases; otherwise → `422`.
- If `isInterUsecase` is absent or `false`:
  - `sourceSubgraph == destSubgraph` → `INTRA_SUBGRAPH`
  - `sourceSubgraph ≠ destSubgraph` → `INTRA_USECASE`

The caller never supplies `linkType` directly. `linkType` is an internal server concept used for persistence.

### FR-DL-10 — EC flag constraint

`isEc` is allowed only when the derived `linkType = INTRA_USECASE`. If provided when the derived `linkType` is `INTRA_SUBGRAPH` or `INTER_USECASE` → `422`.

If `isEc` is omitted for an `INTRA_USECASE` link, the server persists `false`. `isEc` is `NULL` for `INTRA_SUBGRAPH` and `INTER_USECASE` links.

### FR-DL-11 — Subsystem boundary traversal (inline SLS creation)

When source and dest modules have different subsystem contexts (different `parentId` in the node hierarchy), the server must:

1. Load a `nodeParentMap` by querying **all nodes in the file** in a single query.
2. Invoke `SubsystemDataLinkDerivationService` (see FR-SVC-01–04) to compute the traversal path and segment descriptors.
3. Allocate new system IDs and auto-create boundary ports at each traversal boundary node.
4. Construct and persist all SLS segments and boundary ports atomically with the DataLink in the same unit of work, sharing a single `groupId`.

If source and dest modules share the same subsystem context, no SLS are created.

### FR-DL-12 — Response

Returns `ComponentCollectionDto` containing the created DataLink. SLS and boundary ports are **not** included in the response.

### FR-DL-13 — Persistence via edit-actions

All creates (DataLink, SLS, boundary ports) are written to `edit_actions` with `operation = CREATE`, `source = MANUAL`, `changeStatus = STAGED`, sharing a single `groupId`.

---

## Functional Requirements — POST /data-links/with-subsystems (subsystem mode)

### FR-DLS-01 — Endpoint definition

`POST /arc-api/v1/projects/:projectId/data-links/with-subsystems`

Request body:

```
{
  sourceNodeSystemId:      string         // module or subsystem node
  sourcePortSystemId:      string         // required for all endpoint types
  destinationNodeSystemId: string         // module or subsystem node
  destinationPortSystemId: string         // required for all endpoint types
  isInterUsecase?:         boolean        // only meaningful when both endpoints are modules; if true → INTER_USECASE
  isEc?:                   boolean        // only meaningful when both endpoints are modules and derived linkType is INTRA_USECASE
}
```

### FR-DLS-02 — Port required for all endpoints

`sourcePortSystemId` and `destinationPortSystemId` are always required regardless of node type. → `422` if either is absent.

### FR-DLS-03 — Node and port existence

All provided node and port IDs must exist in the session's file. → `404` if any are not found.

### FR-DLS-04 — No self-loops

`sourceNodeSystemId ≠ destinationNodeSystemId`. → `422` if equal.

### FR-DLS-05 — Module port direction validation

Same as FR-DL-04: source module port must be `OUTPUT`; dest module port must be `INPUT`.

### FR-DLS-06 — Module port ownership validation

Same as FR-DL-05: port must belong to the given module node.

### FR-DLS-07 — Subsystem port occupancy check

If caller provides `sourcePortSystemId` for a **subsystem** source node, that port must not already be the **source** of a non-deleted SLS in the session. → `422` if occupied.
If caller provides `destinationPortSystemId` for a **subsystem** dest node, that port must not already be the **destination** of a non-deleted SLS in the session. → `422` if occupied.

### FR-DLS-08 — Subsystem port type validation

If caller provides a subsystem port, the server loads the port's `portIoType` and validates:

- Source-side subsystem port → must be `InputOutput`. → `422` if not.
- Dest-side subsystem port → must be `OutputInput`. → `422` if not.

### FR-DLS-10 — Topology: both endpoints are modules

If both source and destination are module nodes, the handler performs the same logic as FR-DL-11 (full boundary traversal + DataLink + SLS creation). The DataLink is created and persisted internally but is not included in the response (the subsystem-mode client renders SLS segments, not DataLinks). The response includes the SLS chain and any auto-created boundary ports.

### FR-DLS-11 — Topology: at least one endpoint is a subsystem (single-hop unresolved SLS)

If at least one endpoint is a subsystem node, the server creates **one unresolved SLS** between the two endpoints (`dataLinkSystemId = null`). No DataLink is created. The SLS records:

- `sourceNodeSystemId` and `destinationNodeSystemId` as provided.
- `sourcePortSystemId`: as provided by the caller.
- `destinationPortSystemId`: as provided by the caller.

If `isInterUsecase` or `isEc` is provided when at least one endpoint is a subsystem node → `422`. These fields are only meaningful for module-to-module links.

### FR-DLS-12 — Persistence via edit-actions

Same pattern as FR-DL-13. All creates (SLS, auto-created ports, optionally DataLink) share a `groupId`.

### FR-DLS-14 — Response

Returns `ComponentCollectionWithSubsystemsDto`:

- **Both endpoints are modules (resolved):** `dataLinks` is empty; SLS chain and any auto-created boundary ports are included. The DataLink is created and persisted internally but excluded from the response — the subsystem-mode client renders SLS segments, not DataLinks.
- **At least one subsystem endpoint (unresolved):** `dataLinks` is empty; the single SLS and any auto-created port are included.

---

## Functional Requirements — Shared Domain Service

### FR-SVC-01 — Extract and name

`SubsystemBoundaryPathService` is **replaced** by a new pure domain service named `SubsystemDataLinkDerivationService`. The old service and its exported `PathInput`/`PathOutput` interfaces are deleted.

All callers of `SubsystemBoundaryPathService.compute()` — currently only `SubsystemBuilder.attachBoundaryPorts()` — are migrated to the new service API (see FR-SVC-04). The new service no longer takes `sourcePortId`/`destPortId` as inputs; they are not needed for path computation and are dropped.

### FR-SVC-02 — Inputs and outputs (pure function contract)

```
Input:
  sourceNodeId:  number
  destNodeId:    number
  nodeParentMap: Map<number, number | null>   // all nodes in file: systemId → parentId|null

Output:
  Array<{
    sourceNodeId:           number
    destNodeId:             number
    sourceBoundaryPortType: PortIoType | null  // null if module endpoint
    destBoundaryPortType:   PortIoType | null  // null if module endpoint
    position:               number             // 0-based index in the chain
  }>
  // Empty array if source and dest share the same subsystem context.
```

### FR-SVC-03 — Pure function, no I/O

The service performs no DB lookups, ID allocations, or network calls. Port system IDs and new entity system IDs are allocated and assigned by the calling handler.

### FR-SVC-04 — Upload path refactored

`SubsystemBuilder.attachBoundaryPorts()` is refactored to delegate to `SubsystemDataLinkDerivationService`. Upload behavior must not change — this is a pure code-movement refactor.

---

## Decisions

The following design decisions were made during requirements review (2026-08-08):

| # | Decision | Rationale |
|---|---|---|
| D1 | Duplicate DataLink uniqueness key is `(sourcePortSystemId, destinationPortSystemId)` only — `parentId` is not part of the key. | A port pair is globally unique in the graph regardless of subsystem parent context. |
| D2 | EC link auto-detection (auto-deriving `isEcLink=true` from GKV membership) is dropped. `isEc` is purely caller-controlled. | Simplifies server logic; caller has full context of the use case type. |
| D3 | If an INTRA_USECASE link is POSTed where an INTER_USECASE link already exists for the same `(sourcePort, destPort)` pair, the server rejects with `409`. | A port pair is a unique signal path; conflicting linkType is a caller error, not a silent upgrade. |
| D4 | When a soft-deleted DataLink exists with the same `(sourcePort, destPort)` pair, re-activate it rather than creating a new record. | Avoids duplicate rows; preserves the original entity's history and system ID. |

---

## Out of Scope

- **Subgraph pair creation** (`use_case_subgraph_pairs`) — deferred; not created by these APIs.
- **Chain resolution** (converting complete unresolved SLS chains into DataLinks) — handled at commit/flatten time.
- **DELETE /data-links** — separate feature.
- **Control links** — separate feature.
- **Orphaned subsystem port cleanup** — handled at commit time, not triggered by creation.

---

## Invariants

| # | Invariant |
|---|---|
| I1 | DataLink source and dest must be module nodes (not subsystems). |
| I2 | Source port must be OUTPUT; destination port must be INPUT (for module endpoints). |
| I3 | Source-side boundary port must be `InputOutput`; dest-side must be `OutputInput`. |
| I4 | No two non-deleted DataLinks can share the same `(sourcePort, destPort)` pair. |
| I5 | A subsystem boundary port can be the source of at most one non-deleted SLS per file. |
| I6 | A subsystem boundary port can be the destination of at most one non-deleted SLS per file. |
| I7 | `isEc` is only valid on `INTRA_USECASE` DataLinks. |
| I8 | `INTRA_SUBGRAPH` requires source and dest in the same subgraph. |
| I9 | `INTER_USECASE` requires source and dest subgraphs in different usecases. |
| I10 | `isEc` defaults to `false` when omitted on `INTRA_USECASE` DataLinks. It is `NULL` on `INTRA_SUBGRAPH` and `INTER_USECASE`. |

---

## Error Codes Summary

| Scenario | HTTP Code |
|---|---|
| Node or port not found | 404 |
| Node is wrong type (subsystem where module expected, or vice versa) | 422 |
| Port required but absent (module endpoint without portSystemId) | 422 |
| Port does not belong to node | 422 |
| Port has wrong direction | 422 |
| Subsystem port already occupied | 422 |
| Subsystem port has wrong portIoType for position | 422 |
| Self-loop (source == dest node) | 422 |
| `isInterUsecase=true` but source and dest subgraphs belong to the same usecase | 422 |
| `isEc` provided when derived linkType is not `INTRA_USECASE` | 422 |
| `isInterUsecase` or `isEc` provided when a subsystem endpoint is involved | 422 |
| Duplicate DataLink (same port pair exists and is not deleted) | 409 |
