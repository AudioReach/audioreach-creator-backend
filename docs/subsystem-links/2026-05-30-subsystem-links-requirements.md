<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Virtual Links: Requirements Document

**Date:** 2026-05-30 (updated 2026-06-17 — aligned with LLD)  
**Status:** Final — aligned with design doc  
**Supersedes:** `docs/datalink-virtual-link-design.md` (HLD), `docs/datalink-virtual-link-lld.md` (LLD), `docs/datalink-virtual-link-plan.md` — those documents were written before the usecase-subgraph schema redesign and the API-separation decision. This document is the authoritative requirements baseline.

**Related Documents:**
- `docs/superpowers/specs/2026-05-18-usecase-subgraph-schema-redesign.md` — DataLink schema changes this design builds on
- `docs/modification-framework/modification-framework-design.md` — `edit_actions`, session lifecycle, commit orchestration
- `docs/subgraph-kv-usecase-creation/subgraph-routing-requirements.md` — routing algorithm that consumes resolved DataLinks

---

## 1. Context

### 1.1 The dual-representation problem

A data connection between two modules has two valid visual representations depending on the user's active view:

**Flat mode** — the connection appears as a direct module-to-module link. The client identifies it by `data_links.system_id`.

**Subsystem mode** — the same physical connection is represented as a *chain* of subsystem link segments that cross subsystem (visual container) node boundaries. Each segment is a separately addressable entity. The client identifies it by `subsystem_link_segments.system_id`.

Both views must reflect the same underlying signal path and remain consistent across concurrent sessions.

### 1.2 Subsystems are an optional, advanced feature

Not all files use subsystems. Most flat-mode users are unaware of the subsystem concept. The base `POST /data-links` API must work without exposing any SLS concept to callers who don't need it.

Virtual-link segment operations are surfaced through a dedicated API (`POST /subsystem-links`). The server internally handles the relationship between DataLinks and SLS — flat-mode callers do not need to know that SLS exist.

### 1.3 Relationship to the usecase-subgraph schema redesign

The schema redesign (2026-05-18) changes `data_links` in ways that affect virtual link resolution:
- `is_inter_graph` is replaced by `link_type` (column name; TypeScript: `linkType`) with enum values `INTRA_SUBGRAPH`, `INTRA_USECASE`, `INTER_USECASE`
- `source_subgraph_system_id` and `dest_subgraph_system_id` are added (NOT NULL)
- `is_ec` is added (NULLABLE; only for `INTRA_USECASE` links)

All DataLink creation paths — whether via flat-mode `POST /data-links` or via chain resolution — must compute and set these fields correctly.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **DataLink** | A permanent module-to-module connection stored in `data_links`. The ground truth for signal routing. |
| **SubsystemLinkSegment (SLS)** | A single directed hop in the visual subsystem graph. Endpoints may be module nodes or subsystem nodes. Stored permanently in `subsystem_link_segments`. |
| **Chain** | A connected sequence of SLS from a module node to another module node, passing through zero or more subsystem nodes. |
| **Complete chain** | A chain where the first segment's source is a module, the last segment's destination is a module, and each segment's destination equals the next segment's source. |
| **Incomplete chain** | A chain that does not satisfy the complete-chain conditions. |
| **Subsystem port** | A `data_ports` row with `portIoType = InputOutput` or `OutputInput`, whose `node_system_id` points to a subsystem node. |
| **Auto-created subsystem port** | A subsystem port created automatically by the server — either when `POST /data-links` generates SLS for a cross-subsystem flat-mode link, or when `POST /subsystem-links` (Branch C) receives a subsystem endpoint without a portId. In both cases the server creates the port inline and returns its `systemId` to the caller. |
| **Chain resolution** | The process of traversing unresolved SLS (those with `data_link_system_id = null`), finding complete chains, and creating new DataLinks for them. |
| **Flat mode** | A view of the graph where subsystem structure is hidden; only module nodes and DataLinks are shown. |
| **Subsystem mode** | A view of the graph where subsystem nodes are shown as opaque blocks; connections are shown as SLS chains. |
| **linkType** | A three-value TypeScript enum on `data_links` (DB column: `link_type`): `INTRA_SUBGRAPH`, `INTRA_USECASE`, `INTER_USECASE`. |

---

## 3. Functional Requirements

### 3.1 API Separation

#### FR-VL-01: Separate creation endpoints

The two APIs are distinguished by **caller intent (UI mode)**, not by endpoint node type. The server never knows which mode the UI is in — the client signals mode by choosing which API to call.

1. **`POST /data-links`** — flat-mode; always produces a `DataLink`. Both endpoints must be module nodes. Callers do not need to know about SLS.

2. **`POST /subsystem-links`** — subsystem-mode; handles all connection types. Behavior branches on endpoint node types and `parentId` relationship:

   | Source | Destination | `parentId` relationship | Server creates | Response |
   |---|---|---|---|---|
   | Module | Module | same parent (or both `null`) | DataLink only | `{ systemId, type: 'DataLink' }` |
   | Module | Module | different parents | DataLink + resolved SLS chain | `{ subsystemLinkSegments: [{ systemId }, …] }` |
   | Module | Subsystem | — | Single unresolved SLS | `{ systemId; createdPortSystemId? }` |
   | Subsystem | Module | — | Single unresolved SLS | `{ systemId; createdPortSystemId? }` |
   | Subsystem | Subsystem | — | Single unresolved SLS | `{ systemId; createdPortSystemId? }` |

   **Same-parent mod→mod:** no subsystem boundary exists, so no SLS are created. The DataLink is returned directly so the subsystem-mode client can reference it.

   **Different-parent mod→mod:** even though the UI sends module-node endpoints (the user right-clicked a module port and linked to a module in another subsystem), the server detects the cross-boundary context via `parentId`, computes the full subsystem path, creates a DataLink plus the resolved SLS chain, and returns the SLS chain IDs. The client uses those IDs to render the traversal path.

Calling `POST /data-links` with a subsystem-node endpoint must return `422` with message directing the caller to use `POST /subsystem-links`.

#### FR-VL-02: Separate delete endpoints
- **`DELETE /data-links/{id}`** — deletes an actual DataLink (cascade behaviour in FR-VL-17)
- **`DELETE /subsystem-links/{id}`** — deletes a single SLS (cascade behaviour in FR-VL-19)

---

### 3.2 Subsystem Port Entities

#### FR-VL-03: Subsystem ports are real data_ports rows
Subsystem ports are persistent rows in the `data_ports` table with:
- `portIoType = 'InputOutput'` or `'OutputInput'`
- `node_system_id` pointing to a subsystem node
- A stable `system_id` and `data_port_id` assigned at creation time

**`InputOutput`**: outfacing = Input (receives signal from outside the subsystem); infacing = Output (sends signal inside the subsystem).  
**`OutputInput`**: outfacing = Output (sends signal to outside); infacing = Input (receives inside).

#### FR-VL-04: Auto-created subsystem ports from subsystem-mode SLS draw
When `POST /subsystem-links` (Branch C) receives a subsystem-node endpoint without a `portSystemId`, the server creates the subsystem port inline as part of the same operation. The response includes `createdPortSystemId` so the UI can display the new port without an additional GET round-trip. This replaces the previous explicit `POST /subsystems/{id}/ports` step.

#### FR-VL-05: Auto-created subsystem ports from flat-mode DataLink
When `POST /data-links` detects that source and destination modules have **different `parentId` values** (including when only one module is inside a subsystem), the server auto-creates subsystem ports on each boundary node in the path, creates SLS using those ports, and groups them all with the DataLink under a single `group_id`. See FR-VL-09 for the full auto-creation rules.

Auto-created subsystem ports are identical to user-created ones in schema — they are real `data_ports` rows. No special flag is needed; orphaned ports (those with no SLS referencing them) are cleaned up at commit time (FR-VL-21).

---

### 3.3 SubsystemLinkSegment Creation

#### FR-VL-06: SLS structure
Each SubsystemLinkSegment records:
- `source_node_system_id` — FK to `nodes`; may be a module or subsystem node
- `destination_node_system_id` — FK to `nodes`; may be a module or subsystem node
- `source_port_system_id` — FK to `data_ports`; may be a module port or subsystem port
- `destination_port_system_id` — FK to `data_ports`; may be a module port or subsystem port
- `data_link_system_id` — FK to `data_links`; **null** until chain is resolved
- `file_system_id` — FK to `arc_db_files`
- `version` — optimistic locking counter

#### FR-VL-07: Port direction validation
At SLS creation (both user-created and auto-created):  
`source_port_type ≠ 'Input'` AND `dest_port_type ≠ 'Output'`

| Source \ Dest | Input | Output | InputOutput | OutputInput |
|---|---|---|---|---|
| **Input** | ❌ | ❌ | ❌ | ❌ |
| **Output** | ✅ | ❌ | ✅ | ✅ |
| **InputOutput** | ✅ | ❌ | ✅ | ✅ |
| **OutputInput** | ✅ | ❌ | ✅ | ✅ |

Violation returns `422`.

#### FR-VL-08: One-connection-per-subsystem-port constraint
Within a file, a subsystem port may be:
- The `source_port` of **at most one** SLS
- The `destination_port` of **at most one** SLS

This is enforced at SLS creation time by checking both committed `subsystem_link_segments` and the active session's `edit_actions` overlay. Violation returns `422` identifying the conflicting port.

Note: module ports are not subject to this constraint. A module port may appear in multiple SLS (e.g., as source in S1 and destination in S3 for different chains).

#### FR-VL-09: Auto-SLS and auto-port creation from `POST /data-links`

**Condition**: `source_module.parentId ≠ dest_module.parentId` — where `null` means "top level (no subsystem parent)". This fires whenever the two modules are in different subsystem contexts, including the case where only one module is inside a subsystem:

| source.parentId | dest.parentId | Auto-SLS? |
|---|---|---|
| `null` | `null` | No — both at top level, no boundary |
| SubsystemX | SubsystemX | No — same subsystem, no boundary |
| SubsystemX | SubsystemY | Yes — different subsystems |
| SubsystemX | `null` | Yes — module exits its subsystem |
| `null` | SubsystemY | Yes — module enters dest's subsystem |

**Server behaviour**:
1. Determine the subsystem path between the two modules by traversing `nodes.parentId` until reaching the common ancestor level (or top level). This produces an ordered list of subsystem boundary nodes to cross.
2. For each subsystem boundary node crossed: auto-create a new subsystem port with the appropriate `portIoType` (`InputOutput` or `OutputInput`) determined by the direction of signal flow through that boundary. Existing unused ports are never reused — always create fresh (see OQ-1 resolved).
3. Build SLS segments covering the full path:
   - First segment: `source_node = ModuleA`, `dest_node = SubsystemX`, `source_port = PA` (ModuleA's port), `dest_port = portS` (SubsystemX boundary port)
   - Middle segments (one per subsystem boundary crossed after the first)
   - Last segment: `source_node = SubsystemY`, `dest_node = ModuleB`, `source_port = portT` (SubsystemY boundary port), `dest_port = PB` (ModuleB's port)
4. All auto-created `data_ports` rows and `SubsystemLinkSegment` rows share the same `group_id` as the DataLink CREATE `edit_action`.

**If both modules share the same `parentId`** (same subsystem, or both `null` meaning top level): no SLS or subsystem ports are created. The DataLink is created standalone.

#### FR-VL-10: Nested subsystem traversal
When a module is nested inside multiple levels of subsystems (e.g., ModuleA → SubsystemInner → SubsystemOuter), the auto-creation path must traverse all levels to reach the common ancestor with the destination module's subsystem chain. Subsystem ports are created at each boundary level in the path.

---

### 3.4 Chain Resolution

#### FR-VL-11: Chain definition and completeness
A **chain** is a connected directed sequence of SLS: the `destination_node` of segment N equals the `source_node` of segment N+1. A chain is **complete** when:
- The first segment's `source_node` is a module node
- The last segment's `destination_node` is a module node

A chain is **incomplete** if either condition is not met, or if a cycle is detected during traversal.

#### FR-VL-12: Resolution — endpoint extraction
For a complete chain `S1 → S2 → ... → SN`:
- `sourceNodeSystemId` = S1.`source_node_system_id` (a module)
- `destinationNodeSystemId` = SN.`destination_node_system_id` (a module)
- `sourcePortSystemId` = S1.`source_port_system_id` (S1's source is a module, so this is a module port)
- `destinationPortSystemId` = SN.`destination_port_system_id` (SN's destination is a module, so this is a module port)

The middle subsystem ports are used for traversal only; they are not carried into the resolved DataLink.

#### FR-VL-13: Resolution — DataLink creation

Resolution operates **only on unresolved SLS** (`data_link_system_id = null`). A DataLink is always the stable physical anchor; SLS are the volatile visual layer. There is no "partial chain" state to handle at resolution time because:
- User-initiated SLS deletion deletes the DataLink and lets sibling SLS be cleaned up at commit via ON DELETE CASCADE (FR-VL-20 Case B)
- Application-level topology operations (move module, disband subsystem) delete old SLS and create new ones atomically as part of a dedicated command (FR-VL-20a), leaving no dangling resolved segments

**Resolution algorithm:**
1. Build a directed graph from **unresolved SLS only** (`data_link_system_id = null`, from committed table + `edit_actions` overlay)
2. Find all chain start points: module nodes that have at least one outgoing unresolved edge
3. For each start point, traverse forward until reaching a module destination node (complete) or a dead end (incomplete)
4. For each complete chain, extract endpoints (FR-VL-12) and create a new DataLink:
   - Compute `naturalKeyHash(sourcePortSystemId, destinationPortSystemId)`
   - If a DataLink with this hash already exists: **422** — this indicates a bug; a DataLink with the same endpoints should not exist unless the application failed to clean up
   - If no conflict: pre-assign a new DataLink `system_id`; record DataLink CREATE + SLS UPDATEs (setting `data_link_system_id`) in `edit_actions`
5. For each incomplete chain: collect for 422 response (start node, last reachable node)

#### FR-VL-14: Resolution — linkType and subgraph FKs
When creating a new DataLink during resolution (FR-VL-13, "if no" branch):
1. Look up `spf_modules` to find `sourceModule.subgraphSystemId` and `destModule.subgraphSystemId`
2. If same subgraph: `linkType = 'INTRA_SUBGRAPH'`; `source_subgraph_system_id = dest_subgraph_system_id`
3. If different subgraphs: `linkType = 'INTRA_USECASE'` (default for live-edited cross-subgraph links resolved from SLS chains)
4. Set `source_subgraph_system_id` and `dest_subgraph_system_id` accordingly
5. `is_ec = null` (EC flag is a future concern)

#### FR-VL-15: INTRA_USECASE DataLinks and usecase assignment

When an `INTRA_USECASE` DataLink is created (either via `POST /data-links` or via chain resolution), **no `use_case_subgraph_pairs` rows are created at that point.** The DataLink floats as an unassigned `INTRA_USECASE` connection until the routing algorithm runs.

**Automatic visibility to existing usecases:** If a `use_case_subgraph_pair (U, sg_a, sg_b)` row already exists (from a previous routing session), any new `INTRA_USECASE` DataLink with `source_subgraph_system_id = sg_a` and `dest_subgraph_system_id = sg_b` is automatically accessible to usecase U via the query join pattern — no additional write is required.

**New subgraph pairs (not in any usecase yet):** A DataLink between two subgraphs that share no existing usecase pair row is a candidate for new usecase discovery. When the user calls `POST /auto-create-usecases`, the routing algorithm:
1. Reads the subgraph graph from `data_links` (`INTRA_USECASE` links only), including the new DataLink via the `edit_actions` overlay
2. Discovers the new path and generates a new usecase as an UNSTAGED `edit_action`
3. Creates UNSTAGED `use_case_subgraphs` and `use_case_subgraph_pairs` rows for the new usecase

**Stage/reject and orphan handling:** The user reviews UNSTAGED usecases and stages or rejects them. If a rejected usecase contains `INTRA_USECASE` DataLinks that are not shared with any other staged or existing usecase, those DataLinks become **orphan connections**. The system reports them to the user. The user must either:
- Explicitly delete the orphan DataLinks (and their SLS), or
- Accept the discarded usecase back

**Post-validation:** All `INTRA_USECASE` DataLinks in the file must be reachable from at least one committed or staged usecase. This is enforced by the routing algorithm's post-validation (see `subgraph-routing-requirements.md` FR-17). Orphan `INTRA_USECASE` DataLinks block commit.

#### FR-VL-16: linkType for flat-mode DataLink creation (`POST /data-links`)
When `POST /data-links` creates a DataLink directly:
1. Look up source and dest modules' `subgraphSystemId` from `spf_modules`
2. If same subgraph → `linkType = 'INTRA_SUBGRAPH'`; set both subgraph FKs to the same value
3. If different subgraphs → `linkType = 'INTRA_USECASE'` by default; `'INTER_USECASE'` when the caller passes `isInterUsecase = true`. Set `source_subgraph_system_id` and `dest_subgraph_system_id` accordingly
4. No `use_case_subgraph_pairs` rows are created — see FR-VL-15

---

### 3.5 Resolution Trigger Points

#### FR-VL-17: Triggers
Chain resolution runs at three points:

| Trigger | Behaviour for incomplete chains | Behaviour for complete chains |
|---|---|---|
| `GET /components?showSubsystems=false` | **422** — list incomplete chains (start node, last reachable node) | Resolve silently; return flat-mode view including newly resolved links |
| `POST /auto-create-usecases` (pre-pass) | **422** — list incomplete chains | Resolve; continue to routing |
| `POST /commit-changes` | **Discard** — incomplete chains silently removed; user warned with count | Resolve before writing to DB |

#### FR-VL-18: Fast path at GET /components?showSubsystems=false
If no SLS with `data_link_system_id = null` exist for the file (committed + overlay), skip resolution entirely and return actual links directly.

---

### 3.6 Delete Behaviour

#### FR-VL-19: Delete DataLink (`DELETE /data-links/{id}`)
1. Record DataLink DELETE in `edit_actions` (`base_version` = current version)
2. Find all SLS in `subsystem_link_segments` with `data_link_system_id = id` (plus any pending CREATE in `edit_actions` for this file with the same `data_link_system_id`)
3. Record SLS DELETE for each, all sharing the same `group_id` as the DataLink DELETE
4. Subsystem ports referenced by those SLS become orphaned; they are cleaned up at commit time (FR-VL-21)

#### FR-VL-20: Delete SLS (`DELETE /subsystem-links/{id}`)

**Case A — SLS is unresolved** (`data_link_system_id = null`):
- Record SLS DELETE in `edit_actions`. No cascade.

**Case B — SLS is resolved** (`data_link_system_id = L1`):
- Record SLS DELETE for this segment in `edit_actions`
- Record DataLink DELETE for L1 in `edit_actions` (`base_version` = current version)
- Both share the same `group_id`
- For each sibling SLS (other segments referencing L1): record an SLS UPDATE setting `data_link_system_id = null` in `edit_actions`, sharing the same `group_id`. This makes sibling SLS appear unresolved in the overlay so the commit pre-pass (FR-VL-22) can detect and discard them. The null-FK UPDATE is **never applied to the actual table** (the column is NOT NULL); it only exists in the overlay. ON DELETE CASCADE on the DataLink FK acts as a safety net for any committed sibling rows not caught by the pre-pass.
- Subsystem ports that become unreferenced after these changes are cleaned up at commit time (FR-VL-21)

Rationale: from the user's perspective in subsystem mode, deleting any segment of a resolved chain signals intent to remove or restructure the connection. The DataLink (physical connection) is removed. The user re-draws a new path; chain resolution creates a new DataLink when the new chain is complete.

#### FR-VL-20a: Application-level topology operations bypass the endpoint cascade

Operations such as **move module to a different subsystem** or **disband a subsystem** are higher-level application commands that need to replace SLS without deleting the underlying DataLink. These commands:
1. Directly record SLS DELETEs for the old chain in `edit_actions` — without going through `DELETE /subsystem-links/{id}`
2. Keep the DataLink intact (it still connects the same two modules)
3. Apply the same auto-SLS creation logic as FR-VL-09 for the new topology (new subsystem ports + new SLS, all with `data_link_system_id` set to the existing DataLink's `system_id`)
4. Group all changes under one `group_id` for atomic undo/redo

Example — **M2 moved from S1 to S2** (M1→S1.PortA→M2 becomes M1→S2.PortB→M2):
- Old SLS VS1, VS2 deleted; PortA orphaned → cleaned up at commit
- DataLink L1 kept unchanged
- New SLS VS3, VS4 created with auto-created PortB on S2; `data_link_system_id = L1`
- Committed state: L1 intact, VS3/VS4 point to it, clean chain

---

### 3.7 Commit Behaviour

#### FR-VL-21: Orphaned subsystem port cleanup at commit
Before the commit transaction begins, the server scans for subsystem ports (`portIoType = InputOutput` or `OutputInput`) that have no SLS referencing them after all pending DELETEs are applied. These ports are:
- If they exist only as pending CREATEs in `edit_actions`: discarded (not written to `data_ports`)
- If they are already committed rows in `data_ports`: included as DELETE operations in the commit

This covers auto-created ports that lost their SLS due to a DataLink or SLS deletion within the session.

#### FR-VL-22: Incomplete chain discard at commit
Before the commit transaction begins, SLS CREATEs in `edit_actions` with `data_link_system_id = null` that belong to incomplete chains are discarded (`change_status = 'DISCARDED'`). The user is warned: "N subsystem link segment(s) were discarded because they did not form complete connections."

A SLS CREATE that has `data_link_system_id` set (either because it was created as part of a flat-mode DataLink or because it was resolved before commit) is NOT affected by this rule.

#### FR-VL-23: Topological commit order
Within the commit transaction, changes are applied in this order to satisfy FK dependencies:

**DELETEs (reverse dependency):**
1. SLS DELETEs — explicit deletes first, before DataLink DELETEs
2. DataLink DELETEs — ON DELETE CASCADE removes any remaining committed SLS referencing these DataLinks
3. Subsystem port DELETEs (orphaned, from FR-VL-21) — safe because referencing SLS were removed in steps 1–2

**CREATEs (forward dependency):**
4. Subsystem port CREATEs
5. DataLink CREATEs
6. SLS CREATEs (`data_link_system_id` FK must exist by now; all CREATEs at this point have non-null `data_link_system_id` since unresolved ones were discarded in FR-VL-22)

**Post-create UPDATEs:**
7. SLS UPDATEs that set `data_link_system_id` to a new value (resolution results)

---

### 3.8 Read Overlay

#### FR-VL-24: Subsystem mode read (`GET /components?showSubsystems=true`)
Returns SLS merged from committed `subsystem_link_segments` (for the file) and `edit_actions` overlay (session):
- CREATE actions add new segments
- DELETE actions remove segments
- UPDATE actions merge partial payload (e.g., `data_link_system_id` set by resolution)

Unresolved segments (`data_link_system_id = null`) are included. They are visible as partial chains.

No chain resolution is triggered. No side effects.

Each SLS in the response includes port context for UI rendering:
- `portSystemId` — stable DB key; use for all write operations
- `portIoType` — port type
- `nodeSystemId` — which node owns the port (module or subsystem)

#### FR-VL-25: Flat mode read (`GET /components?showSubsystems=false`)
Returns DataLinks merged from committed `data_links` and `edit_actions` overlay (DataLink operations only).

If unresolved SLS exist for the session → triggers chain resolution (see FR-VL-17).

---

### 3.9 Integration with Routing Algorithm

#### FR-VL-26: auto-create-usecases pre-pass
Before the routing algorithm (`POST /auto-create-usecases`) runs:
1. Fetch all SLS with `data_link_system_id = null` (overlay for the file)
2. If any incomplete chains exist → **422** (user must complete or delete before routing)
3. If all chains are complete → resolve each chain (DataLink CREATEs + SLS UPDATEs recorded in `edit_actions`)
4. Routing reads `data_links` (with overlay) — only `INTRA_USECASE` DataLinks are traversable edges in the subgraph routing graph. The routing algorithm itself creates `use_case_subgraphs` and `use_case_subgraph_pairs` as part of its output.

#### FR-VL-27: Routing algorithm uses DataLinks, not SLS
The routing algorithm is unaware of SLS. It reads `data_links` (with `edit_actions` overlay) filtered by `linkType = 'INTRA_USECASE'` to build the traversable subgraph graph. SLS are purely a visual concern.

After routing creates UNSTAGED usecases and the user completes the stage/reject workflow, post-validation enforces that all `INTRA_USECASE` DataLinks are reachable from at least one staged or committed usecase. Orphan `INTRA_USECASE` DataLinks (those not covered by any accepted usecase) are reported to the user and must be resolved before commit — either by deleting them or by accepting a usecase that covers them.

---

## 4. Invariants

**I1 — DataLink endpoint types**: Both `source_node_system_id` and `destination_node_system_id` on `data_links` always reference module nodes. Never subsystem nodes.

**I2 — One-connection-per-subsystem-port**: Within a file, a subsystem port is the `source_port` of at most one SLS and the `destination_port` of at most one SLS (across committed rows + active session overlay).

**I3 — SLS state is always clean**: A DataLink is either:
- Referenced by **zero SLS** — flat-mode connection with no subsystem boundary, or connection whose old SLS were deleted as part of a topology operation currently in-flight
- Referenced by a **complete chain of SLS** — the fully resolved visual path

There is no "partial chain" state reachable via user-initiated endpoint calls. FR-VL-20 Case B deletes the segment and the DataLink; sibling SLS are cleaned up at commit via ON DELETE CASCADE on the actual table (and pending sibling CREATEs in edit_actions are discarded by the commit pre-pass). FR-VL-20a ensures topology operations (move module, disband subsystem) always write a complete, consistent new chain atomically.

**I4 — Chain endpoint ports are module ports**: The `source_port` of the first SLS in a resolved chain and the `destination_port` of the last SLS are always module ports (portIoType = Input or Output). These become the DataLink's `sourcePortSystemId` and `destinationPortSystemId`.

**I5 — linkType consistency**: For `INTRA_SUBGRAPH` links, `source_subgraph_system_id = dest_subgraph_system_id`. For `INTRA_USECASE` and `INTER_USECASE`, they differ.

**I6 — `is_ec` nullability**: `is_ec` is NOT NULL on `INTRA_USECASE` links (true or false). NULL on `INTRA_SUBGRAPH` and `INTER_USECASE` links.

**I7 — SLS permanence**: SLS written at commit time persist until explicitly deleted. A session opening the file in subsystem mode always sees all committed SLS.

**I8 — Subsystem port orphan**: A subsystem port with no SLS referencing it (in committed table or active overlay) is orphaned and is cleaned up at commit time.

---

## 5. Non-Functional Requirements

**NFR-VL-01: Transparency to non-subsystem users**: All callers of `POST /data-links` receive `{ systemId, type: 'DataLink' }` regardless of whether SLS were auto-created internally. No SLS-related fields appear in the response.

**NFR-VL-02: Atomic undo/redo**: All entities created or modified together (DataLink + auto-created subsystem ports + auto-created SLS) share a `group_id` in `edit_actions`. Undo/redo via `/activate-change` reverts all of them in one operation.

**NFR-VL-03: Idempotent resolution**: Running chain resolution multiple times on the same set of unresolved SLS produces the same result. The `naturalKeyHash` uniqueness constraint ensures no duplicate DataLinks are created.

**NFR-VL-04: File-scoped constraints**: The one-connection-per-port constraint and chain resolution graph are both computed per `file_system_id`. Concurrent sessions on different files do not interact.

**NFR-VL-05: Performance**: Chain resolution is O(N) where N is the number of SLS for the file. For typical use (a few segments per chain, a few chains per file), resolution must complete in under 50ms.

---

## 6. Out of Scope

The following are explicitly out of scope for this feature:

- **`INTER_USECASE` link declaration — partially in scope**: `POST /data-links` now accepts an `isInterUsecase: boolean` flag, allowing callers to explicitly declare a cross-subgraph DataLink as `INTER_USECASE`. Defaults to `INTRA_USECASE` when omitted. Full user-facing workflow for `INTER_USECASE` management (listing, reclassifying, routing implications) remains a future feature.
- **EC (Echo Cancellation) link handling**: The `is_ec` field is added to the schema but EC routing logic is a separate feature.
- **Subsystem port reuse policy — resolved**: The server always creates a new subsystem port at each boundary node during SLS auto-creation. Existing unused ports are never reused. Orphaned ports (those with no SLS referencing them) are cleaned up at commit time (FR-VL-21). See OQ-1.
- **Subsystem node creation/deletion**: Managing subsystem nodes themselves is outside this feature.
- **Port strategy configuration ingestion**: The `configuration` table (introduced in the LLD to store `portStrategy` per file) is created in this task, but populating it from the workspace AWSP file during upload is deferred to a future task.

---

## 7. Open Questions — All Resolved in Design Doc

**OQ-1 — Resolved**: Always create a new subsystem port. No reuse of existing unused ports. Rationale: reuse adds overlay-scan complexity for no observable benefit — the committed result is identical either way. (Design doc §2 OQ-1; implemented in FR-VL-09.)

**OQ-2 — Resolved**: The `SubsystemBoundaryPathService` uses an LCA (lowest common ancestor) traversal over the `node.parentId` chain. Walk upward from both module nodes to find the common ancestor, then assemble an ordered node sequence and assign `requiredPortType` (`OutputInput` for exit-boundary nodes, `InputOutput` for entry-boundary nodes). Full algorithm in design doc §5.1.

**OQ-3 — Resolved**: `POST /data-links` (flat mode) always returns `{ systemId, type: 'DataLink' }` regardless of whether SLS were auto-created internally. Flat-mode callers never see SLS IDs. `POST /subsystem-links` (subsystem mode) returns SLS IDs for the different-parent mod→mod case. (Design doc §2 OQ-3; see also NFR-VL-01.)

---

## 8. Control Subsystem Link Segments

Control links are bidirectional and use `control_ports` (no `portIoType`). Everything in this section is parallel to the data link feature but adapted for those differences. Full specification is in the design doc §11.

### 8.1 Overview

A `ControlSubsystemLinkSegment` (CSLS) is to control links what SLS is to data links: a single hop in the visual subsystem graph for a control connection. The same dual-representation problem applies — flat mode shows `control_links`, subsystem mode shows CSLS chains.

### 8.2 Additional requirements for control links

- **FR-VL-28: Canonical ordering on control_links**: Before every `ControlLink` insert, normalize so the endpoint with the lower `portSystemId` is stored as peerA. The unique index and a CHECK constraint enforce this invariant at DB level: `CHECK (nodeA_port_system_id < nodeB_port_system_id)`. This fixes a pre-existing duplicate-insert vulnerability in the current unordered unique index.

- **FR-VL-29: Control port intent propagation**: When a CSLS is drawn connecting a subsystem control port to a non-empty endpoint, the non-empty endpoint's intent set is propagated to all connected empty subsystem ports transitively. When a CSLS is deleted and a subsystem port becomes unanchored from any module endpoint, its intent records are cleared. The `ControlIntentPropagationService` handles both operations (design doc §11.8).

- **FR-VL-30: CSLS chain resolution triggers**: CSLS chain resolution runs at the same three trigger points as SLS resolution (FR-VL-17). Incomplete CSLS chains are discarded at commit with a warning message parallel to FR-VL-22.

- **FR-VL-31: Orphaned boundary control port cleanup**: Parallel to FR-VL-21 — subsystem boundary control ports with no CSLS referencing them are discarded or deleted at commit time.

For complete handler specs, persistence schema, intent propagation algorithm, and commit orchestration order, see design doc §11.

---

*End of Document*
