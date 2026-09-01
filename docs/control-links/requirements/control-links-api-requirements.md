# Requirements: Control Link APIs

**Feature folder:** `docs/control-links/`
**Status:** DRAFT
**Date:** 2026-08-10
**Reference:** `docs/control-links/qact-control-link-requirements.md` (C# source)

---

## Context

Five write/read endpoints for managing control links in the AudioReach usecase designer. Control links carry control signal connections between module nodes, potentially crossing subsystem boundaries. They carry intent metadata and a heap ID for memory allocation.

The schema stores control links bidirectionally — ports are ordered canonically (`nodeAPortSystemId < nodeBPortSystemId`). Intents are stored in the `intents` table (one row per `(controlPortSystemId, intentId)` pair). Subsystem-crossing hops are stored as `subsystem_control_links` rows.

---

## Definitions

| Term | Meaning |
|---|---|
| ControlLink | A bidirectional control connection stored in `control_links`. Canonical ordering: `nodeAPortSystemId < nodeBPortSystemId`. |
| SubsystemControlLink (SCL) | A single segment of a control connection that crosses a subsystem boundary. Stored in `subsystem_control_links`. |
| ControlPort | A port on a module or subsystem node through which control signals flow. Stored in `control_ports`. One port may carry N intents. |
| Intent | A numeric identifier (`intentId`) stored in the `intents` table. A port's active intents are the allocated intents. A module's definition lists its supported intents. |
| HeapId | Integer memory allocation identifier stored on the ControlLink. Default = 1. |
| ConnectionType | Derived from node types at both ends: `MODULE_MODULE`, `MODULE_SUBSYSTEM`, `SUBSYSTEM_MODULE`, `SUBSYSTEM_SUBSYSTEM`. |
| LinkType | `INTRA_SUBGRAPH`, `INTRA_USECASE`, or `INTER_USECASE`. `INTER_USECASE` is set by the caller via `isInterUsecase`; the other two are server-derived from subgraph membership. |
| isInterUsecase | A link between two nodes that are not in the same use case. |
| Canonical peer assignment | peerA = endpoint with lower portSystemId; peerB = endpoint with higher portSystemId. |

---

## Functional Requirements — POST /control-links (flat view)

### FR-CL-01 — Endpoint definition

`POST /arc-api/v1/projects/:projectId/control-links`

Request body:

```
{
  startModuleSystemId: number     // source module node
  startPortId:         number     // control port on source module
  endModuleSystemId:   number     // destination module node
  endPortId:           number     // control port on destination module
  parentId?:           number     // optional parent subsystem system ID
  isInterUsecase?:     boolean    // defaults to false
}
```

### FR-CL-02 — No self-loops

`startModuleSystemId` and `endModuleSystemId` must be different. → `422` if equal.

### FR-CL-03 — Node existence

Both `startModuleSystemId` and `endModuleSystemId` must exist as **module** nodes in the session's file. Subsystem IDs are not accepted on the flat view. → `404` if not found; `422` if the resolved node is a subsystem.

### FR-CL-04 — Port existence and ownership

`startPortId` must exist in `control_ports` and must belong to `startModuleSystemId`. `endPortId` must exist in `control_ports` and must belong to `endModuleSystemId`. → `404` if not found; `422` on ownership mismatch.

### FR-CL-05 — Duplicate check

If a non-deleted ControlLink already exists with the same `(startPortId, endPortId)` port pair (in either canonical order) → `409 Conflict`.

### FR-CL-06 — Soft-deleted link re-activation

If a soft-deleted ControlLink exists with the same `(startPortId, endPortId)` port pair, the server shall re-activate it (restore `deleted = false`) rather than creating a new record. If `heapId` or intents have changed, the re-activated link is marked as modified.

### FR-CL-07 — Intent resolution

**Domain context — where intents live:** Intents are allocated at the **port level**, not the link level. All ControlLinks that share a control port share that port's allocated intent set. The backend works with allocated intents on ports; any intent representation on the ControlLink in the response is a client-facing projection only.

The server resolves allocated intents for the new link:

1. Load the currently **allocated intents from control port** `startPortId` (read the port's intent rows, not by iterating links).
2. Load the currently **allocated intents from control port** `endPortId`.
3. If both ports already have intents: compute the **intersection**. If the intersection is empty → `422`.
4. If a port has **no existing links** (and therefore no allocated intents yet): read supported intents from the module's definition (`static_intent_definitions` or `dynamic_intent_definitions`). The module definition supplies the full available set for that port to use as the candidate.
5. If no intents can be resolved at all → `422`.

### FR-CL-08 — Intent propagation after creation

After the link is created, if the resolved intent set is narrower than the current allocated intents on either port: BFS through all ControlLinks reachable via shared ports and update the **allocated intents on every port** in the connected chain to the narrowed set. (The BFS traverses ControlLinks to reach ports; what gets written is the intent rows on the ports at each end of every link in the chain — not anything stored on the links themselves.)

Before writing, validate that every module endpoint in the chain supports the narrowed set. If any module cannot support it, discard all writes for this operation and return `422`.

**Rollback semantics:** The ControlLink CREATE and all intent updates from this operation must share the same `groupId` and either succeed together or be discarded together. A partial write where some port intents are updated but the link is not created would leave the session in an inconsistent state. All writes in a single `CreateControlLinkHandler` invocation automatically share the `groupId` from `uow.getWriteContext()`, ensuring atomic staging via `edit_actions`.

### FR-CL-10 — LinkType derivation

`linkType` is not server-derived. The caller signals intent via `isInterUsecase`:

- `isInterUsecase = false` (default): server checks subgraph membership and assigns `INTRA_SUBGRAPH` (same subgraph) or `INTRA_USECASE` (different subgraphs, same usecase). If the two nodes actually belong to different usecases → `422`.
- `isInterUsecase = true`: server assigns `INTER_USECASE`. If the two nodes share a common usecase → `422`.

### FR-CL-11 — Canonical port ordering

Before persisting, the server assigns canonical order: `nodeAPortSystemId = min(startPortId, endPortId)`, `nodeBPortSystemId = max(startPortId, endPortId)`. The corresponding peer nodes are assigned to match.

### FR-CL-12 — SubsystemControlLinks for cross-boundary links

When source and destination modules live in different subsystem contexts, the server creates `SubsystemControlLink` segments using `ControlChainResolutionService` to stitch the path. All SCL segments and the ControlLink are persisted atomically in the same unit of work.

### FR-CL-13 — HeapId default

If `heapId` is not provided, the server defaults to `1`.

### FR-CL-14 — Persistence via edit-actions

All creates (ControlLink, SCL segments) are written to `edit_actions` with `operation = CREATE`, `source = MANUAL`, `changeStatus = STAGED`, sharing a single `groupId`.

### FR-CL-15 — Response

Returns `ComponentCollectionDto` containing the created ControlLink (and any SCL segments that were created). SCL are not included in the flat response.

---

## Functional Requirements — POST /control-links/with-subsystems

### FR-CLS-01 — Endpoint definition

`POST /arc-api/v1/projects/:projectId/control-links/with-subsystems`

Request body:

```
{
  startComponentId: number     // source node (module or subsystem)
  startPortId:      number     // control port on source node
  endComponentId:   number     // destination node (module or subsystem)
  endPortId:        number     // control port on destination node
  parentId?:        number     // optional parent subsystem system ID
  isInterUsecase?:  boolean    // defaults to false
}
```

### FR-CLS-02 — Same write path

Performs the identical DB write as `POST /control-links`. All validation rules (FR-CL-02 through FR-CL-14) apply, with FR-CL-03 overridden by FR-CLS-06 and FR-CL-07 overridden by FR-CLS-04. (`connectionType` derivation is in FR-CLS-05, which replaces the removed FR-CL-09.)

### FR-CLS-03 — Response

Returns `ComponentCollectionWithSubsystemsDto`:

- `controlLinks`: the created ControlLink.
- `subsystems`: subsystem nodes in the traversal path, if any.

### FR-CLS-04 — Intent resolution

Overrides FR-CL-07 for this endpoint. The server resolves allocated intents for the new link:

**Step 1 — Subsystem port uniqueness (preflight)**

A subsystem control port may carry at most two connections: one on the **inner side** (connecting to a node inside the subsystem) and one on the **outer side** (connecting to a node outside the subsystem). The check is topological:

For each existing non-deleted ControlLink through the same `startPortId`:
- Classify its other endpoint as **inner** (inside the subsystem) or **outer** (outside the subsystem).
- If any existing link already occupies the **same side** as the new link's other endpoint → `422`.

Same check applies to `endPortId`.

**Step 2 — Classify each endpoint**

- *Module port, has existing link*: use its currently allocated intents.
- *Module port, no existing link*: read supported intents from the module's definition (`static_intent_definitions` or `dynamic_intent_definitions`).
- *Subsystem port, has existing link*: use its currently allocated intents (reachable only via re-activation of a soft-deleted link; Step 1 guards against a live duplicate).
- *Subsystem port, no existing link*: no inherent intents; resolved in Step 3.

**Step 3 — Combine**

- Both sides have intents (module or previously-allocated subsystem port): compute the **intersection**. If the intersection is empty → `422`.
- One side has intents and the other is a subsystem port with no existing link: the subsystem port inherits the resolved set from the other side. Assign that set to both ports.
- Both sides are subsystem ports with no existing links: keep the allocated intent set empty for both ports. Not an error; such a link will be discarded at session end if never connected into a module path.
- One side is a module port and intents cannot be resolved from the definition or existing links → `422`.

### FR-CLS-05 — ConnectionType derivation

The server derives `connectionType` from the node types at each endpoint:

| Source node type | Destination node type | connectionType |
|---|---|---|
| Module | Module | `MODULE_MODULE` |
| Module | Subsystem | `MODULE_SUBSYSTEM` |
| Subsystem | Module | `SUBSYSTEM_MODULE` |
| Subsystem | Subsystem | `SUBSYSTEM_SUBSYSTEM` |

### FR-CLS-06 — Node existence

Overrides FR-CL-03 for this endpoint. Both `startComponentId` and `endComponentId` must exist as module or subsystem nodes in the session's file. → `404` if not found.

---

## Functional Requirements — DELETE /control-links/:controlLinkSystemId

### FR-DCL-01 — Endpoint definition

`DELETE /arc-api/v1/projects/:projectId/control-links/:controlLinkSystemId`

### FR-DCL-02 — Link existence

The specified `controlLinkSystemId` must refer to a non-deleted ControlLink in the session's file. → `404` if not found.

### FR-DCL-03 — Soft delete

The server marks the ControlLink as deleted in `edit_actions` (`operation = DELETE`). The underlying row in `control_links` is not physically removed until commit.

### FR-DCL-04 — Port intent cleanup after deletion

After the link is removed:

- If `nodeAPort` has no remaining non-deleted ControlLinks: for a module port, reset allocated intents to the full supported set from the module definition; for a subsystem port, use `ControlIntentPropagationService.findPortsToClear` to find and clear unanchored ports.
- Same logic applies to `nodeBPort`.

### FR-DCL-05 — Response

Returns a `ControlLinkDto` snapshot of the deleted link (including `connectionType`, `sourceId`, `sourcePortId`, `destinationId`, `destinationPortId`, `isInterUsecase`, `parentId`) so the caller can support undo.

---

## Functional Requirements — PATCH /control-links/:controlLinkSystemId/properties

### FR-PCL-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/control-links/:controlLinkSystemId/properties`

Request body (`ControlLinkPropertiesDto` — both fields optional, at least one required):

```
{
  AllocatedIntents?: {
    intents: { id: number; name: string }[]
  }
  HeapId?: {
    heapId: { value: number }
  }
}
```

At least one of `AllocatedIntents` or `HeapId` must be provided. → `422` if both absent.

### FR-PCL-02 — Link existence

The specified `controlLinkSystemId` must refer to a non-deleted ControlLink in the session's file. → `404` if not found.

### FR-PCL-03 — Update intents (when AllocatedIntents provided)

- The new intent list must be non-empty. → `422` if empty.
- Validate the new intents against the supported intents of every module node in the connected chain. If any module's port does not support the requested intents → `422`.
- Update allocated intents on **all** ControlLinks in the connected path (BFS via shared-port traversal), not just the target link.

### FR-PCL-04 — Update heapId (when HeapId provided)

- If the new `heapId` equals the current `heapId`, succeed without modification.
- Update `heapId` on the specified ControlLink.
- If the source node is a subsystem: propagate the new `heapId` upstream (toward source modules) via BFS.
- If the destination node is a subsystem: propagate the new `heapId` downstream (toward destination modules) via BFS.

### FR-PCL-05 — Response

Returns `ControlLinkDto[]` — all control links that were modified (may be more than one if intent or heapId propagation touched connected links).

---

## Functional Requirements — GET /control-links/:controlLinkSystemId/properties

> **Implementation status:** Controller stub exists (`getControlLinkProperties`) but throws `NotImplementedException`. No query handler or query service method backs this endpoint. Needs to be implemented.

### FR-GCL-01 — Endpoint definition

`GET /arc-api/v1/projects/:projectId/control-links/:controlLinkSystemId/properties`

### FR-GCL-02 — Link existence

The specified `controlLinkSystemId` must refer to a non-deleted ControlLink in the session's file. → `404` if not found.

### FR-GCL-03 — Response

Returns `ControlLinkPropertiesDto`:

```
{
  AllocatedIntents: {
    propId:   0x08001062
    propName: 'Intents Property'
    intents:  { id: number; name: string }[]   // intents on nodeAPort (same on nodeBPort)
  }
  SupportedIntents?: {
    propId:   0x08001062
    propName: 'Intents Property'
    intents:  { id: number; name: string }[]   // union of supported intents from all modules in chain
  }
  HeapId: {
    propId:   0x0800136f
    propName: 'Heap Property'
    heapId:   ConfigElementDto                 // current heapId value
  }
}
```

`SupportedIntents` is included only when at least one module endpoint exists in the path.

---

## Functional Requirements — POST /control-links/query

> **Implementation status:** Controller stub exists (`queryControlLinks`) but throws `NotImplementedException`. The existing `ControlLinkQueryService` has `findByUsecaseIds` / `findBySubgraphId` but no method for lookup by system IDs. Needs to be implemented.

### FR-QCL-01 — Endpoint definition

`POST /arc-api/v1/projects/:projectId/control-links/query`

Request body: `{ systemIds: number[] }`

### FR-QCL-02 — Partial success

For each requested `systemId`:

- If found (non-deleted): include in the result.
- If not found or deleted: include an error entry in the response.

Returns `207 Multi-Status` if any IDs failed; `200 OK` if all succeeded.

### FR-QCL-03 — Response

Returns `ControlLinkDto[]` for all found links, with errors for any that were not found.

---

## Cross-Cutting Requirements

### FR-CCL-01 — Edit session required

All write operations (POST, PATCH, DELETE) require an active edit session for the project. → `422` if no session is open.

### FR-CCL-02 — Staging model

All write operations stage changes in `edit_actions`. Changes are not committed to the canonical tables until the caller invokes `PATCH /projects/:projectId/commit`.

### FR-CCL-03 — Session overlay for reads

GET and query operations apply the session edit-actions overlay so that staged (uncommitted) creates and deletes are reflected in the response.

---

## Invariants

| # | Invariant |
|---|---|
| I1 | `nodeAPortSystemId < nodeBPortSystemId` — canonical port ordering is always enforced on insert. |
| I2 | No two non-deleted ControlLinks can share the same `(nodeAPortSystemId, nodeBPortSystemId)` pair (enforced by `uk_control_link_unique`). |
| I3 | A ControlLink's `heapId` is a positive integer; default is `1`. |
| I4 | Allocated intents on a port must be a subset of the supported intents for every module endpoint in the connected chain. |
| I5 | Intent propagation always touches all ports in the connected SCL component — partial updates are not allowed. |

---

## Error Codes Summary

| Scenario | HTTP Code |
|---|---|
| Node or port not found | 404 |
| ControlLink not found | 404 |
| Self-loop (`startModuleSystemId == endModuleSystemId`) | 422 |
| Subsystem ID provided to flat view (`POST /control-links`) | 422 |
| Port does not belong to node | 422 |
| Intent intersection empty / no intents resolvable | 422 |
| New intent list is empty | 422 |
| Intent not supported by module in chain | 422 |
| `isInterUsecase = false` but nodes are in different usecases | 422 |
| `isInterUsecase = true` but nodes share a common usecase | 422 |
| No edit session active | 422 |
| Both `AllocatedIntents` and `HeapId` absent in PATCH | 422 |
| Duplicate ControlLink (same port pair, non-deleted) | 409 |

---

## Out of Scope

- **Switch nodes** — deprecated and removed from the current project. All `SWITCH_*` connection types from the C# reference are not applicable.
- **CreateMarkerControlLinks** — the C# API that auto-creates full subsystem traversal paths by discovering the common ancestor. Deferred; not covered here.
- **SetControlPortCount** — auto-called by CreateMarkerControlLinks. Deferred with it.
- **Commit / undo / redo** — lifecycle operations handled by the modification framework (`PATCH /projects/:projectId/commit`), not by these endpoints.
- **Validation rules** (`StartGraphEdit`, `ApplySessionChanges`) — session lifecycle management is a separate concern.
