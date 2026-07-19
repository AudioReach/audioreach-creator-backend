<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Modification Framework & DiffMerge Granularity — Consolidated Requirements

**Date:** 2026-07-04
**Status:** Draft
**Owner:** Nithin Simon

**Consolidates:**
- `docs/modification-framework/modification-framework-design.md` — foundation
- `docs/superpowers/specs/2026-06-11-modification-framework-design.md` §3 — SET API and Add Module requirements
- `docs/superpowers/specs/2026-07-04-diffmerge-granularity-requirements.md` — DiffMerge granularity

**Related context:**
- `docs/superpowers/specs/2026-06-01-auto-usecase-routing-requirements.md` — algorithmic writer that produces `UNSTAGED` edit-actions
- `docs/read-overlay-design.md` — read-side overlay pattern (separate LLD)

---

## 1. Scope

These requirements define **what** the write path of the AudioReach Creator Backend must do for:

- Editing a graph project through the edit-session framework (`project_sessions`, `edit_actions`, `session_commits`).
- Staging and committing user-initiated modifications to modules, ports, subgraphs, containers, and their child data.
- Applying a three-way diff into a target file (DiffMerge) with field-level and cross-entity change granularity.
- Providing pending-change context on entity GET APIs in both Designer and DiffMerge modes.

**In scope:**
- Session lifecycle and per-operation session-mode gating.
- Edit-action semantics (staging, read-overlay effective state, commit-time drift detection, API-call atomicity).
- Module structural fields (`alias`, `containerSystemId`) and module ports (`DataPort`, `ControlPort`) — create and rename — available in both `DESIGNER` and `DIFF_MERGE` modes.
- Add Module (three creation variants with auto-created Subgraph and Container) — available in both `DESIGNER` and `DIFF_MERGE` modes.
- Commit and undo/redo behavior.
- Three-way DiffMerge workflow, change granularity, atomic cross-entity groups.
- DiffMerge-exclusive write operations: Reference-file definition import; `CREATE` and `UPDATE` on definition entities (e.g., key-value definitions).
- Manual user-authored edits during a DiffMerge session (conflict resolution and manual authoring) — treated as user-initiated writes and staged by default.
- Stage/unstage APIs, change summary API, visual diff on entity GETs.
- Designer-mode pending-change surfacing.

**Out of scope:**
- DTOs, endpoint shapes, controller wiring, class/interface signatures, folder layout, and any code — these belong in the corresponding design specs.
- `cal-data` (CKV) and `tag-data` (TKV) parameter payloads — separate LLD.
- Read overlay algorithm — separate LLD.
- Delete Module and last-module cascade delete — requirement stated at high level (§7.8); design deferred.
- Conflict resolution UX in DiffMerge — separate spec.
- Undo/redo in `DIFF_MERGE` session mode.
- Changes to `TUNING` or `DISCOVERY_WIZARD` mode behavior.
- The diff algorithm itself (owned by the diff-compare tool).
- Concurrent sessions on the same file (single-active-session model).
- Restore points (`restore_points`) — captured by the foundation doc but not required by this consolidation.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| **Session** | A row in `project_sessions` scoping all pending edits for a file. Progresses `ACTIVE → ENDED`. |
| **Session mode** | One of `DESIGNER`, `TUNING`, `DISCOVERY_WIZARD`, `DIFF_MERGE`. Determines which write operations are permitted. `DIFF_MERGE` is a superset of `DESIGNER` for write operations (see REQ-SESS-11). |
| **Edit action** | A row in `edit_actions` representing one pending change for one target entity. |
| **STAGED / UNSTAGED** | The two change-status values for an edit-action. STAGED = will be applied at commit. UNSTAGED = pending user selection (DiffMerge) or algorithm proposal (auto-routing). |
| **Aggregate root** | The domain entity whose `systemId` scopes reads of a set of related pending changes. A module is the aggregate root for its Node, DataPorts, ControlPorts. Subgraphs and Containers are their own aggregate roots. Definition entities are their own aggregate roots for their owned property/key-value rows. |
| **Aggregate scoping (reference: `aggregateId`)** | The mechanism by which the read overlay retrieves every pending change for an aggregate root and its owned entities. In the reference schema this is a stored `aggregateId` column; the requirement is efficient aggregate-scoped reads, not the column itself. |
| **API-call atomic group (reference: `groupId`)** | The set of pending changes produced by a single API call, which must undo/redo/stage/unstage together. The API returns a tracking handle to the client — the reference schema uses a shared `groupId` UUID; alternatives include returning a list of change identifiers. |
| **`baseVersion`** | The reference-schema name for the captured version reference used at commit time for optimistic-lock drift detection. The requirement is drift detection; the specific storage representation is design. |
| **Accumulated effective state** | The union of all pending field changes for one entity in one session, as seen through the read overlay. The mechanism (accumulated payload on one row, delta chain, snapshot, per-field rows) is design. |
| **Reference / Base / Target** | The three files in a three-way DiffMerge workflow. Reference = original baseline; Base = evolved-from-reference source; Target = destination that receives selected changes. |
| **Change unit** | A user-selectable unit of change in DiffMerge. May cover one field, several grouped fields on an entity, or several entities across tables (atomic cross-entity group). |
| **Atomic cross-entity group** | A set of edit-actions across different entities/tables that must be staged and unstaged together, expressed by a shared identifier assigned by the diff-compare tool. |

---

## 3. Session Framework

### 3.1 Session Modes

**REQ-SESS-01:** The system shall support four session modes: `DESIGNER`, `TUNING`, `DISCOVERY_WIZARD`, `DIFF_MERGE`. Absence of an active session for a file shall constitute read-only mode for that file.

**REQ-SESS-02:** Editing shall require an explicit start-session call that specifies the mode. No implicit session creation on first edit is permitted.

**REQ-SESS-03:** At most one `ACTIVE` session shall exist per file at any time. Attempting to start a second concurrent session for the same file shall fail.

**REQ-SESS-04:** A session shall progress through statuses `ACTIVE → ENDED`. Commit shall leave the session `ACTIVE`. Only the explicit end-session call shall transition a session to `ENDED`.

### 3.2 Mode-Gated Operations

**REQ-SESS-05:** Every write API call shall require an `ACTIVE` session for the target file. Calls without an active session shall be rejected with `403 Forbidden`.

**REQ-SESS-06:** Every write API call shall declare the session mode(s) it accepts. Calls made under a disallowed mode shall be rejected with `403 Forbidden`.

**REQ-SESS-07:** Module structural modifications, module port modifications, Add Module, Add DataPort, and Add ControlPort operations shall be permitted under both `DESIGNER` mode and `DIFF_MERGE` mode. Performing these operations under `DIFF_MERGE` mode represents user-driven manual authoring during a merge session — analogous to the user manually editing files during a git rebase conflict resolution — and shall follow the same staging rules as `DESIGNER` (see REQ-EA-04): user-initiated edits are `STAGED` by default regardless of mode.

**REQ-SESS-08:** DiffMerge staging, unstaging, and change-summary retrieval operations shall be permitted only under `DIFF_MERGE` mode.

**REQ-SESS-11 (DIFF_MERGE is a write-superset of DESIGNER):** Every write operation permitted under `DESIGNER` mode shall also be permitted under `DIFF_MERGE` mode. In addition, `DIFF_MERGE` mode shall permit operations that `DESIGNER` mode does not:
- Importing module definitions from the Reference file into the Target file.
- `CREATE` and `UPDATE` on definition entities (e.g., module key-value definitions and other definition-scoped data) that are read-only in `DESIGNER` mode.

**REQ-SESS-12 (Manual conflict-resolution edits are STAGED):** When the user performs a designer-style write operation while in `DIFF_MERGE` mode — including edits made to resolve merge conflicts introduced by a prior diff apply — the resulting edit-action shall be recorded with `changeStatus = STAGED`. These user-authored edits are conceptually a manually-authored diff applied by the user, not by the diff-compare tool, and they bypass the DiffMerge selection panel.

### 3.3 End-Session Behavior

**REQ-SESS-09:** Ending a session shall discard all `UNSTAGED` edit-actions still present for that session.

**REQ-SESS-10:** Ending a session with no session commits recorded shall remove the session record. Ending a session with at least one recorded commit shall retain the session as audit history.

---

## 4. Edit Actions — Core Semantics

> **Storage-strategy note:** This section describes **what the system must observably do** when tracking pending changes. It does **not** prescribe the DB representation. The current reference design (see OQ-7, resolved) uses `pending_changes` with `changeId, sessionId, aggregateId, targetTable, targetSystemId, operation, fieldPath, newValue, source, changeStatus, groupId, crossEntityGroupId, createdAt, validUntil` — where `fieldPath` addresses the atomic replacement target (`"$"` for whole-entity replacement, `null` for whole-entity accumulator, scalar column name for per-field granularity, custom named group for multi-column atomic units, or element path such as `elements[id]` for sub-column atomicity in serialized columns), and `source ∈ {DIFF_TOOL, MANUAL, AUTO_ROUTING}` disambiguates writer provenance — together with a side-table `session_entity_versions (sessionId, targetSystemId, baseVersion)` for optimistic-lock capture. Supersession key: `(sessionId, targetSystemId, fieldPath) WHERE validUntil IS NULL`. Alternative representations remain admissible as long as the requirements below are satisfied.

### 4.1 Persistence and Retention

**REQ-EA-01 (Persistence of pending changes):** Every user-initiated or algorithm-initiated change to a project's state during a session shall be persisted for the duration of the session, together with enough associated metadata to satisfy every requirement in this document — including reconstruction of effective read state (§4.4), commit-time conflict detection (§4.5), staging vs. unstaged distinction (§4.2), API-call atomic undo/redo (§6), aggregate-scoped reads (§5), and DiffMerge selection granularity (§10).

**REQ-EA-02 (Effective pending state per entity is queryable):** The system shall be able to determine, for any entity being edited in a session, the current effective pending state of that entity (as it would appear in the read overlay) at any time. Whether this maps to a single "current" row per entity, several rows per entity (one per changed field or one per user action), or another representation, is a design decision.

**REQ-EA-03 (History retained within session):** The system shall retain enough state during a session to (a) reconstruct any prior intermediate effective state visited during the session and (b) support single-step undo and redo (REQ-EA-10, REQ-UNDO-02). No prior state shall be discarded before commit or session end.

### 4.2 Staging Defaults

**REQ-EA-04 (Auto-staged by user):** All user-initiated write API calls shall produce edit-actions with `changeStatus = STAGED`, regardless of session mode. No separate staging call shall be required for user-initiated writes in either `DESIGNER` or `DIFF_MERGE` mode. (See REQ-SESS-12 for the DIFF_MERGE-specific rationale.)

**REQ-EA-05 (Algorithm-produced changes — default UNSTAGED, diff-tool may override):** Changes produced by algorithmic writers shall default to `changeStatus = UNSTAGED`. Promotion to `STAGED` requires an explicit user action through the staging mechanism appropriate to the writer: the DiffMerge Stage API (§12) for diff-tool changes, and the auto-routing stage API (defined in the auto-usecase-routing spec) for auto-routed UseCases.

The diff-compare tool MAY override this default on a per-apply-diff-call basis when the user configures it — producing rows with `changeStatus = STAGED` directly for workflows where up-front review is not required. When the tool applies its writes as `STAGED`, they behave identically to user-manual STAGED writes: they are committed by the next commit call and do not appear as items awaiting selection in the change summary. Auto-routing does not support this override and always produces `UNSTAGED` rows.

### 4.3 Payload Rules by Operation

**REQ-EA-06:** For `CREATE`, the payload shall contain the full row representation for the target entity.

**REQ-EA-07:** For `UPDATE`, the payload shall carry enough information to identify which fields changed and to what values, and to permit the read overlay and commit to reconstruct the intended change. The exact payload representation (partial delta on the current row, delta chain across superseded rows, accumulated delta, snapshot, or a hybrid) is a design decision owned by the modification-framework LLD.

**REQ-EA-08:** For `DELETE`, the payload shall be empty.

### 4.4 Read-Overlay Effective State

These requirements describe **what must be true** for reads and commits, not how the payload is composed. The specific storage strategy (accumulated payload on the current edit-action, delta chain traversed across superseded rows, snapshot payload, or a hybrid) is a design decision owned by the modification-framework LLD.

**REQ-EA-09 (Effective state under multi-field edits):** When two or more field changes on the same entity have been made in one session, the read overlay for that entity shall reflect all such pending changes simultaneously. A subsequent change on one field shall not cause a prior pending change on a different field to be dropped from the effective state.

**REQ-EA-10 (History preservation, CREATE-then-modify, and undo granularity):** The system shall retain enough state during a session to:
(a) reconstruct the effective entity state at any point in the session's edit history;
(b) support single-step undo and redo at **API-call granularity** (REQ-ATO-01, REQ-ATO-05) — each undo step reverts, and each redo step reapplies, exactly the set of pending changes produced by one API call, whether that call touched one field of one entity or many fields across many entities and tables. Pending changes produced by *other* API calls in the same session shall not be affected by the step. The single-entity, single-field case is the trivial subset of this rule;
(c) represent an entity that was created in the current session and subsequently modified as a **pending creation** (not a pending update) to both the read overlay and commit, with all modifications reflected in the effective state before the entity is committed.

### 4.5 Optimistic Concurrency Control

> The requirement is **commit-time drift detection**. Storing a `baseVersion` value per stored change is one design; a `(sessionId, entity) → version` side-table is another. The specific representation is design.

**REQ-EA-11:** On the first modification of a committed entity within a session, the system shall capture a version reference tied to that entity's current committed `version`. This reference shall be used at commit time to detect whether the committed data has drifted since the session began editing the entity.

**REQ-EA-12:** An entity that is created within the current session (has no committed baseline) shall not carry a captured version reference; no commit-time drift check applies for such an entity.

**REQ-EA-13 (Capture-once):** The captured version reference for an entity within a session shall not change across subsequent modifications, undo/redo cycles, or supersession events for that same entity within that same session. It is captured once and preserved until commit or session end.

**REQ-EA-14 (Commit-time conflict detection):** At commit, for each pending `UPDATE` or `DELETE` on a committed entity, the system shall compare the entity's current committed `version` against the session-captured version reference for that entity. Any mismatch shall abort the commit and identify all conflicting entities in the error response.

---

## 5. Aggregate Roots and Aggregate-Scoped Reads

> The requirement is **efficient aggregate-scoped reads and writes**. Storing an `aggregateId` column on every stored change is one design; a mapping table, a computed index, or a graph traversal are alternatives.

**REQ-AGG-01 (Aggregate-scoped read overlay):** The read overlay shall be able to return every pending change for an aggregate root and every entity it owns as a single, efficient operation. Aggregate roots include, at minimum: a module (which owns its Node, DataPorts, and ControlPorts), a subgraph (which owns its property data rows), a container (which owns its property data rows), and a definition entity (which owns its property or key-value rows).

**REQ-AGG-02 (Aggregate write ownership):** All pending-change writes for an aggregate's entities shall go through that aggregate's dedicated write path. No code path outside that write path may produce pending changes attributed to that aggregate.

**REQ-AGG-03 (Aggregate scoping is orthogonal to API-call atomicity):** A single API call may produce pending changes across multiple aggregate roots (e.g., Add Module produces changes on a Module, a Subgraph, and a Container). Aggregate-scoped reads (this section) and API-call atomic undo/redo (§6) are separate mechanisms that shall coexist.

---

## 6. API-Call Atomic Undo/Redo

> Client software calls one API at a time. That single API call may internally produce pending changes across many entities and many tables. The client has no visibility into that internal decomposition. This section requires that the client can undo or redo the whole call as one atomic step, and receives a tracking handle from the API to reference it. The specific representation of that handle (a `groupId`, a list of change IDs returned to the client, or another mechanism) is a design decision.

**REQ-ATO-01 (Atomicity of an API call):** Every user-initiated write API call shall be reversible as a single undo step from the client's perspective. All pending changes the call produces internally — regardless of how many entities, tables, or aggregate roots they span — shall revert on undo, and reapply on redo, as one indivisible unit.

**REQ-ATO-02 (Tracking handle returned to client):** Every write API call that produces one or more pending changes shall return to the client a tracking handle sufficient for the client to later request undo, redo, staging, or unstaging of the entire call. The representation of this handle (a single group identifier, a list of change identifiers, or another form) is a design decision; the requirement is that the client's undo/redo/stage/unstage requests can address the call as a whole without knowing its internal decomposition.

**REQ-ATO-03 (Groups are fixed at API-call time):** The set of pending changes bound together by an API call's tracking handle shall be fixed at the moment the API call completes. Subsequent unrelated modifications shall not be added to a prior call's group. Each API call produces its own group (or its own list of change IDs).

**REQ-ATO-04 (Single-change API calls):** When an API call produces exactly one pending change, the tracking handle may degenerate to that single change's identifier. The client shall not need to distinguish single-change from multi-change calls in its undo/redo/stage/unstage code paths.

**REQ-ATO-05 (Undo/redo atomicity):** Undo and redo operations shall respect API-call atomicity: activating or deactivating any pending change that belongs to an API-call group shall move every pending change in that group together as one logical step (see §8.2).

---

## 7. Module Modification Requirements

### 7.1 Scenario Requirements

**REQ-MOD-01 (First edit in session):** When a SET operation targets an entity with no active edit-action in the current session, the system shall read the entity's committed `version`, insert an `UPDATE` edit-action with the field delta, and record that `version` as `baseVersion`.

**REQ-MOD-02 (Same entity modified multiple times):** Each subsequent SET call on the same entity in the same session shall be recorded such that:
(a) the read overlay continues to reflect every prior pending field change on that entity (REQ-EA-09);
(b) `baseVersion` for that entity is preserved unchanged from the first modification (REQ-EA-13);
(c) single-step undo of the most recent SET call restores the effective state that existed immediately before it, without discarding earlier pending changes on the same entity (REQ-EA-10, REQ-UNDO-02).

The specific storage strategy that achieves the above (superseding the current edit-action, chaining deltas, snapshot payloads, or a hybrid) is a design decision.

**REQ-MOD-03 (Multiple fields on same entity):** When two or more different fields of the same entity are changed in sequence within one session, every pending field change shall remain visible to the read overlay simultaneously (per REQ-EA-09). Ordering of SET calls shall not cause a prior change on a different field to be lost.

### 7.2 Module Structural Fields

**REQ-MOD-04:** Module structural modifications (rename module, change container assignment) shall follow the general modification rules of §4 and shall be attributed to the module as their aggregate root for aggregate-scoped reads (REQ-AGG-01).

### 7.3 Port Requirements

**REQ-PORT-01:** DataPort and ControlPort modifications shall follow the same modification rules as module structural modifications and shall be attributed to the port's owning module as the aggregate root for aggregate-scoped reads.

**REQ-PORT-02:** When a new DataPort or ControlPort is created via the SET API, it shall be recorded as a pending `CREATE` carrying all fields needed for later commit, with no captured version reference (REQ-EA-12), attributed to the owning module as its aggregate root. Subsequent SET calls on that port within the same session shall follow REQ-EA-10 (CREATE-then-modify representation).

**REQ-PORT-03:** Port names are read-only on module ports once created. No rename operation is required on DataPort or ControlPort.

### 7.4 Add Module — Creation Variants

**REQ-ADD-01 (Three creation variants):** The Add Module operation shall support three creation variants distinguished by which of `subgraphSystemId` and `containerSystemId` the caller supplies. All three variants shall be served by a single Add Module operation contract:

| Variant | `subgraphSystemId` | `containerSystemId` | Entities staged as CREATE |
|---------|-------------------|--------------------|--------------------------|
| Empty canvas | absent | absent | Subgraph + Subgraph property data + Container + Container property data + Module + Node + Ports |
| Existing subgraph, new container | provided | absent | Container + Container property data + Module + Node + Ports |
| Existing subgraph and container | provided | provided | Module + Node + Ports only |

**REQ-ADD-02 (Auto-created Subgraph — default name):** When a Subgraph is auto-created (Variant 1), the server shall assign a default name. The user may rename it later via the rename API.

**REQ-ADD-03 (Auto-created Container — type selection):** When a Container is auto-created (Variants 1 and 2), the Container's type shall be set to the first entry in the module definition's list of permitted container types.

**REQ-ADD-04 (Default property data):** When a Subgraph is auto-created, the system shall stage `CREATE` edit-actions for its property data rows using defaults sourced from subgraph property definitions. When a Container is auto-created, the system shall stage `CREATE` edit-actions for its property data rows using defaults sourced from container property definitions.

### 7.5 Add Module — Port Auto-Creation

**REQ-ADD-05:** The Add Module operation shall look up the target module's definition using `(moduleId, procId)`. If no matching definition is found, the operation shall fail with a not-found error.

**REQ-ADD-06:** All static DataPorts declared in the module definition shall be staged as `CREATE` edit-actions. All static ControlPorts declared in the module definition shall be staged as `CREATE` edit-actions. Dynamic ports shall not be created at add time.

### 7.6 Add Module — Atomicity

**REQ-ADD-07 (Single-step reversibility):** The Add Module call shall be reversible as one undo step from the client's perspective (REQ-ATO-01). Every internal pending change it produces — across every aggregate root involved (Subgraph, Container, Module, Node, DataPorts, ControlPorts, and any property data rows) — shall revert together on undo and reapply together on redo.

**REQ-ADD-08 (Multi-aggregate spanning):** Add Module may produce pending changes across multiple aggregate roots simultaneously. Aggregate-scoped reads (§5) shall continue to work correctly for each aggregate root touched by the call, independently of the call's atomic-undo grouping (§6).

### 7.7 Existence Validation

**REQ-VAL-01:** Before staging any UPDATE on an entity, the write path shall verify that the entity exists in the target file. Missing entities shall produce a not-found error.

**REQ-VAL-02:** When Add Module is called with an existing `subgraphSystemId`, the write path shall verify that the Subgraph exists in the target file. When Add Module is called with an existing `containerSystemId`, the write path shall verify that the Container exists in the target file.

### 7.8 Cascade on Last-Module Delete

**REQ-DEL-01 (Requirement only; design deferred):** When the last module referencing a Subgraph is deleted, that Subgraph and its property data rows shall also be staged for `DELETE`. The same rule shall apply to Container. The detailed design of this behavior is deferred to the Delete Module LLD.

---

## 8. Commit and Undo/Redo

### 8.1 Commit

**REQ-CMT-01:** Commit shall be all-or-nothing within a single database transaction.

**REQ-CMT-02 (Operation ordering):** Within one commit, applied operations shall be ordered `DELETE` → `UPDATE` → `CREATE` to respect forward and reverse foreign-key dependencies.

**REQ-CMT-03 (Applied fields for UPDATE):** For each `STAGED` `UPDATE`, commit shall apply the reconstructed effective change for that entity — i.e., the union of every pending field change the read overlay would show for that entity — to the target row. `UPDATE` remains a partial update at the target-row level, not a full row replacement. The mechanism by which the effective change is reconstructed from the edit-action storage is a design decision (see §4.4).

**REQ-CMT-04 (Conflict detection):** For each `STAGED` `UPDATE` or `DELETE`, the system shall verify that the target entity's current `version` equals the edit-action's `baseVersion` before applying. Any mismatch shall abort the commit and return the full list of conflicting entities.

**REQ-CMT-05 (Post-commit cleanup):** After a successful commit, applied `STAGED` edit-actions and their superseded predecessors shall be removed. `UNSTAGED` edit-actions shall remain associated with the still-active session.

**REQ-CMT-06 (Commit record):** Each commit shall record a user-supplied message, timestamp, and count of applied changes into `session_commits`.

**REQ-CMT-07:** Only `STAGED` edit-actions shall be applied at commit. `UNSTAGED` edit-actions shall never be applied by commit.

### 8.2 Undo / Redo

**REQ-UNDO-01:** The server shall be a passive versioned store; clients shall maintain their own undo/redo stack of change identifiers.

**REQ-UNDO-02 (Activate a prior change):** Activating a prior pending change shall promote it as the current effective state for its target entity, and demote the previously-current pending change for that entity. No prior state shall be deleted; both must remain reachable for further undo/redo. The mechanism (validity-timestamp swap on stored rows, pointer swap, chain-cursor advance, etc.) is design.

**REQ-UNDO-03 (Deactivate a current change):** Deactivating a current pending change shall remove it from the effective state without promoting any successor. This is the mechanism for undoing a pending `CREATE` so the entity disappears from the overlay. The stored data underlying the deactivated change shall remain retrievable so a subsequent redo can re-activate it.

**REQ-UNDO-04:** Undo and redo operations shall be atomic at the API-call granularity (REQ-ATO-05): activating or deactivating any pending change belonging to an API-call group shall move every pending change in that group together as one atomic step.

**REQ-UNDO-05 (Not supported in DIFF_MERGE):** Undo and redo are out of scope for `DIFF_MERGE` mode sessions.

---

## 9. DiffMerge — Three-Way Merge Workflow

**REQ-TM-01:** The system shall accept three files from the user: Reference (original baseline), Base (evolved from Reference), and Target (destination that will receive selected changes).

**REQ-TM-02:** The diff-compare tool shall compute what changed between Reference and Base, decide the granularity of each change (independently-selectable field, atomic multi-field group, cross-entity atomic group, or whole-entity replacement), and stage those changes against the Target file's active `DIFF_MERGE` session. The tool submits changes through the same edit-repository methods used by user-initiated writes; the specific submission mechanism (direct in-process invocation of the write path vs. an external wire format) is a design choice. Pure comparison (without staging) shall be an independently-invokable capability so that compare-only responses can be served without a session write.

**REQ-TM-03:** All change units produced by the diff-compare tool and applied to the Target file's session shall start as `UNSTAGED`. Nothing produced by the diff-compare tool shall be selected by default on first load. (This applies to changes emitted by the diff-compare tool; it does not apply to user-initiated manual edits performed under `DIFF_MERGE` mode, which follow REQ-EA-04 / REQ-SESS-12 and are `STAGED` by default.)

**REQ-TM-04:** The user shall review proposed changes, stage the ones they want, and commit. Only staged change units shall be applied to the Target file at commit time.

**REQ-TM-05:** `UNSTAGED` change units shall be discarded when the session ends.

**REQ-TM-06 (Idempotent apply):** Applying a diff to an active DiffMerge session shall be idempotent. Re-applying shall clear all existing `UNSTAGED` edit-actions for that session and rewrite them from the new diff result.

---

## 10. DiffMerge — Change Granularity

### 10.1 Field-Level Independence

**REQ-CG-01:** In `DIFF_MERGE` mode, individual field changes on the same entity shall be independently selectable. A change to one field and a change to another field on the same entity shall each carry their own selection handle; each may be staged without the other.

**REQ-CG-02:** Multiple fields on the same entity may be grouped into a single atomic change unit. All fields in the unit shall stage and unstage together; partial selection within the unit shall not be permitted.

**REQ-CG-03:** The diff-compare tool shall decide at write time whether fields are independently selectable or grouped as an atomic unit. The server shall store and enforce the grouping as provided, without interpreting field semantics.

**REQ-CG-04:** For an atomic field group, the user shall be able to see all field-level old and new values for context; selection shall always be all-or-nothing for the group as a whole.

### 10.2 Entity-Level Operations

**REQ-CG-05:** `CREATE` and `DELETE` operations on an entity shall be atomic at the entity level by default — the entity is either fully added or fully removed. The diff-compare tool may override this by providing finer grouping.

**REQ-CG-06:** For a large aggregate being added (e.g., a module with calibration data), some child entities may be independently selectable while others are mandatory members of the parent's atomic group. The diff-compare tool shall signal this distinction at write time.

---

## 11. DiffMerge — Atomic Cross-Entity Groups

**REQ-ACG-01:** Multiple entities spanning different tables may be expressed as one atomic selection unit. The user shall stage or unstage the entire group together; no individual member shall be independently stageable.

**REQ-ACG-02:** The server shall enforce cross-entity atomic grouping. Staging a strict subset of the members of an atomic group shall be rejected at the server level.

**REQ-ACG-03:** Unstaging any member of an atomic group shall unstage every member of the group.

**REQ-ACG-04:** Within a single parent aggregate, some child entities may belong to an atomic cross-entity group while other child entities remain independently selectable. Both shall be permitted to coexist under the same parent.

**REQ-ACG-05:** The grouping of entities into atomic units shall be determined and encoded by the diff-compare tool at write time. The server shall store the grouping definition without needing to interpret business rules.

**REQ-ACG-06:** The UI shall not present individual selection controls for entities that are members of an atomic cross-entity group. The group shall be represented as a single selectable item.

---

## 12. DiffMerge — Staging and Unstaging

**REQ-ST-01:** Each independently-selectable change unit shall carry a unique identifier that the UI uses to call Stage and Unstage APIs.

**REQ-ST-02:** The Stage API shall accept a list of change identifiers and stage all of them atomically in one call.

**REQ-ST-03:** The Unstage API shall accept a list of change identifiers and unstage all of them atomically in one call.

**REQ-ST-04:** The Stage API shall also accept identifiers for atomic cross-entity groups (§11, REQ-ACG). Staging a group identifier shall stage every member pending change of that group together, atomically. Partial staging of an atomic cross-entity group shall be rejected at the server (REQ-ACG-02, I6).

**REQ-ST-05:** The Unstage API shall also accept identifiers for atomic cross-entity groups. Unstaging a group identifier shall unstage every member pending change of that group together, atomically (REQ-ACG-03).

**REQ-ST-06:** The read overlay shall always include both `STAGED` and `UNSTAGED` pending changes. The user shall see a full preview of what the Target file would look like with all proposed changes applied, regardless of which have been selected.

**REQ-ST-07:** Only `STAGED` change units shall be applied to the Target file at commit. `UNSTAGED` change units shall not be applied and shall be discarded at session end.

---

## 13. DiffMerge — Change Summary

**REQ-CS-01:** A dedicated API shall return a summary of all proposed changes in the current DiffMerge session, together with their current selection state.

**REQ-CS-02:** The change summary shall present changes in a hierarchical structure, with child entities nested under their aggregate root.

**REQ-CS-03:** The change summary shall clearly distinguish between independently-selectable change units and atomic cross-entity groups.

**REQ-CS-04:** For each change unit, the summary shall include: entity type, entity identifier, operation (`CREATE / UPDATE / DELETE`), current selection status, and the field-level changes with old and new values.

**REQ-CS-05:** For each field-level change, the summary shall include the old value (committed state) and the new value (proposed state). For `CREATE`, the old value is absent. For `DELETE`, the new value is absent.

**REQ-CS-06:** Atomic cross-entity groups shall be represented as a single entry in the summary. Member entities shall be shown as informational detail but shall not be individually selectable.

**REQ-CS-07:** Each entity node in the summary shall expose an aggregated selection status: fully selected, fully unselected, or partially selected (some descendants selected, some not).

**REQ-CS-08:** Each entity node in the summary shall provide a pre-computed roll-up of all change identifiers for itself and all its descendants, enabling the UI to select or deselect an entire subtree in a single API call.

**REQ-CS-09:** The apply-diff API shall return the full change summary immediately upon applying the diff, so the UI can render the selection panel without a separate round-trip.

**REQ-CS-10:** A separate API shall allow the client to retrieve the current change summary at any time, so the UI can refresh the selection panel after staging or unstaging operations.

---

## 14. Visual Diff on Entity GET APIs

**REQ-VD-01:** All entity GET APIs shall support an optional mode where diff context is returned alongside entity data. Without opting in, the response shall be identical to today's response — clean entity data with no change metadata.

**REQ-VD-02:** When diff context is requested, the response shall identify which fields on the entity have pending changes and provide the old and new values for each changed field.

**REQ-VD-03:** Old values shall be derived from the committed state of the Target file at query time. The diff-compare tool shall not be required to supply them.

**REQ-VD-04:** For `CREATE` operations, the old values in diff context shall be absent (the entity did not exist in the committed state).

**REQ-VD-05:** For `DELETE` operations, the new values in diff context shall be absent (the entity is being removed).

**REQ-VD-06:** Diff context shall be available in both `DESIGNER` and `DIFF_MERGE` session modes using the same opt-in mechanism and the same response structure.

**REQ-VD-07:** When an entity response includes embedded child entities (e.g., ports embedded in a module), each child shall carry its own diff context independently.

**REQ-VD-08:** Entities that are members of an atomic cross-entity group shall carry a signal in their diff context indicating group membership. The UI shall use this signal to suppress individual selection controls and display a group indicator instead.

**REQ-VD-09:** The diff context shall carry enough information to support selection operations directly from the entity view — not only for visual rendering. It shall expose the identifiers needed to call Stage and Unstage for that entity's changes and for any atomic groups it belongs to.

---

## 15. Canvas and Tree-View Selection

**REQ-CV-01:** In `DIFF_MERGE` mode, the graph canvas shall display a selection control near each entity (e.g., a checkbox next to a module box). Activating it shall stage or unstage all changes for that entity and all its descendants in one action.

**REQ-CV-02:** A tree-view representation of the entity hierarchy shall be supported, with selection controls at each level of the hierarchy.

**REQ-CV-03:** Field-level selection (selecting one field change at a time) shall be supported in the tree view.

**REQ-CV-04:** Selecting an entity-level control in the canvas or tree shall stage all independently-selectable changes for that entity and its entire descendant subtree.

**REQ-CV-05:** Selecting the control for an atomic cross-entity group shall stage all member entities of the group together. Activating the group control on any one member shall have the same effect as activating it on any other member — the entire group is staged.

**REQ-CV-06:** The entity GET API with diff context shall serve as the data source for both the canvas and the tree-view. The same API that provides field colour data shall also provide the identifiers needed for staging.

**REQ-CV-07:** The same entity GET endpoint used in `DESIGNER` mode shall be reusable in `DIFF_MERGE` mode for diff-aware rendering. No separate DiffMerge-specific entity view endpoint shall be required.

---

## 16. Designer Mode Pending Changes

**REQ-DM-01:** In `DESIGNER` mode, entity GET APIs with diff context shall show which fields have pending (uncommitted) changes, including the committed (old) value and the current pending (new) value for each changed field.

**REQ-DM-02:** In `DESIGNER` mode, all pending changes shall be implicitly `STAGED` at all times. There shall be no selection controls in `DESIGNER` mode; the diff context is informational only.

**REQ-DM-03:** In `DESIGNER` mode, multiple field changes on the same entity shall be accumulated into a single change unit — they shall appear together, not as independently-selectable items. (Consistent with REQ-EA-09.)

**REQ-DM-04:** The diff-context response structure shall be identical between `DESIGNER` and `DIFF_MERGE` modes. The difference in behaviour (single accumulated unit vs multiple independent units) shall be expressed through the content of the response, not through a different structure.

---

## 17. DIFF_MERGE-Exclusive Write Operations

`DIFF_MERGE` mode is a superset of `DESIGNER` mode for writes (REQ-SESS-11). This section lists write operations that are permitted only under `DIFF_MERGE` mode and not under `DESIGNER` mode.

### 17.1 Definition Imports from the Reference File

**REQ-DEF-01:** Under `DIFF_MERGE` mode, the system shall permit importing module definitions from the Reference file into the Target file. Imported definitions become referenceable by modules already in — or being added to — the Target file.

**REQ-DEF-02:** Imported module definitions shall be recorded as `CREATE` edit-actions on the corresponding definition tables. Whether the resulting edit-actions are `STAGED` (user-driven import) or `UNSTAGED` (import proposed by the diff-compare tool) shall follow the same distinction as REQ-EA-04 vs REQ-EA-05: user-initiated imports are `STAGED`; tool-emitted imports are `UNSTAGED`.

**REQ-DEF-03:** An imported definition shall carry all fields necessary to make it independently usable in the Target file (no dangling references to the Reference file after import).

### 17.2 Definition CREATE and UPDATE

**REQ-DEF-04:** Under `DIFF_MERGE` mode, the system shall permit `CREATE` and `UPDATE` operations on definition entities (e.g., module key-value definitions and other definition-scoped data) that are read-only in `DESIGNER` mode.

**REQ-DEF-05:** All definition `CREATE` and `UPDATE` writes shall follow the same edit-action semantics as module writes: aggregate-root scoping (REQ-AGG-01), read-overlay effective state (REQ-EA-09, REQ-EA-10), `baseVersion` capture (REQ-EA-11..14), and staging defaults (REQ-EA-04, REQ-EA-05).

**REQ-DEF-06:** The aggregate root for a definition-owned entity shall be the definition itself. Pending changes to property or key-value rows owned by a definition shall be attributed to that definition for aggregate-scoped reads (REQ-AGG-01).

### 17.3 Interaction with the Selection Panel

**REQ-DEF-07:** Definition-related edit-actions produced by the diff-compare tool shall appear in the change summary alongside module-level and other entity change units, following the same granularity rules (independently-selectable, atomic field group, atomic cross-entity group) defined in §10 and §11.

**REQ-DEF-08:** User-authored definition edits performed under `DIFF_MERGE` mode shall be `STAGED` immediately (REQ-SESS-12) and shall not appear in the selection panel as items awaiting user selection. They are surfaced through the visual diff context (§14) like any other Designer-mode pending change.

---

## 18. Invariants

**I1 — Single active session per file:** No two `ACTIVE` sessions may exist for the same file at any time.

**I2 — Effective pending state per entity is single-valued:** For every entity being edited in a session, the read overlay shall yield exactly one effective pending state at any moment. The system's storage design shall guarantee this even when the underlying representation stores multiple physical records per entity.

**I3 — Version reference capture-once:** The version reference used for commit-time drift detection is captured on the first modification of a committed entity in a session and preserved unchanged for that entity for the remainder of the session (REQ-EA-13).

**I4 — Aggregate scoping:** Every pending change is attributable to an aggregate root such that aggregate-scoped reads (§5) return every pending change for a root and its owned entities.

**I5 — API-call atomicity:** Every pending change produced by a single API call is undone, redone, staged, and unstaged as a single logical unit, regardless of how many entities, tables, or aggregate roots it spans (§6).

**I6 — Atomic-group all-or-nothing:** Every DiffMerge atomic cross-entity group shall be fully staged or fully unstaged. Partial selection is invalid.

**I7 — Only STAGED applies at commit:** No `UNSTAGED` pending change shall be applied to a target table at commit time.

**I8 — Optimistic lock at commit:** No `UPDATE` or `DELETE` shall be applied if the target entity's current committed `version` differs from the session-captured version reference for that entity (REQ-EA-14).

**I9 — Read-overlay parity:** The read overlay shall reflect the same set of pending changes that the change-summary and entity-GET-with-diff-context APIs report.

---

## 19. Non-Functional Requirements

**NFR-CONSIST-01:** All edit-action writes, commit applies, staging changes, and diff apply operations shall occur within a single database transaction per API call.

**NFR-STAT-01:** All write and read APIs shall be stateless at the HTTP layer. All session state shall reside in the database.

**NFR-INDEX-01:** Read-overlay, change-summary, aggregate-scoped, and stage/unstage queries shall be supported by suitable indexes on whichever storage representation the design LLD selects. The current reference schema provides indexes on `(sessionId)`, `(sessionId, systemId)`, `(sessionId, aggregateId)`, `(sessionId, tableName)`, and `(sessionId, changeStatus)`, each restricted to the current-version subset; equivalent index coverage shall be present in any alternative representation.

**NFR-AUDIT-01:** Every successful commit shall leave an auditable record in `session_commits` including message, timestamp, and change count.

---

## 20. Out of Scope

- DTO shapes, endpoint paths, request/response schemas.
- The diff algorithm itself — owned by the diff-compare tool.
- Conflict resolution UX in DiffMerge.
- Undo/redo in `DIFF_MERGE` mode.
- Any change to `TUNING` or `DISCOVERY_WIZARD` mode behavior.
- Concurrent sessions on the same file (single-active-session model per I1).
- `cal-data` (CKV) and `tag-data` (TKV) parameter payloads.
- Read overlay algorithm and query design.
- Delete Module and last-module cascade delete design (requirement stated at high level).
- `restore_points` mechanism.
- Cross-file DiffMerge for content beyond what the diff-compare tool emits.

---

## 21. Open Questions

**OQ-1 — Property data for auto-created aggregates:** REQ-ADD-04 requires default subgraph and container property data to be staged as CREATEs on Add Module. The exact set of property definitions to seed (and whether they are read from a per-file or global source) is deferred to the Add Module design LLD.

**OQ-2 — Change identifier stability across re-apply:** REQ-TM-06 (idempotent apply) rewrites `UNSTAGED` edit-actions on re-apply. Whether change identifiers must be stable across re-applies (so the UI's prior staging survives a re-apply) is an open question for the DiffMerge design LLD.

**OQ-3 — Change-summary hierarchy for aggregates spanning multiple API-call groups:** REQ-CS-02 requires hierarchical presentation; multiple API-call groups (§6) may touch the same aggregate root. The composition rule (how groupings across the same aggregate compose in the summary tree) is an open question for the design LLD.

**OQ-4 — Manual STAGED edit superseding a tool-emitted UNSTAGED edit for the same entity:** Under `DIFF_MERGE` mode, a user's manual edit (REQ-SESS-12) may target an entity that already has an `UNSTAGED` diff-tool edit-action (REQ-EA-05). REQ-EA-02 permits only one current edit-action per `(sessionId, systemId)`. Open questions: (a) does the manual edit supersede the tool edit? (b) if so, does the resulting edit-action's payload accumulate over the tool payload or replace it? (c) does the resulting edit-action inherit `STAGED` (per REQ-SESS-12) or does the tool's `UNSTAGED` provenance persist as a separate selectable line? Design LLD must resolve.

**Storage-mechanism half resolved:** the reference design supersession key is `(sessionId, targetSystemId, fieldPath)` — not `(sessionId, systemId)` — so manual rows (typically scalar `fieldPath`) and tool rows (typically `"$"` or a custom named group) target *different* fieldPaths and coexist without supersession. The read overlay folds all active rows in `createdAt` order (later writes win per column). This resolves (a) and (b) mechanically: both edits remain independently stored, and the effective state is a deterministic per-field fold. Part (c) — selection-panel semantics when a manual STAGED row overrides a field also covered by a tool UNSTAGED row — remains open for the DiffMerge LLD (see OQ-6).

**OQ-5 — Change-summary treatment of user-authored STAGED edits in DIFF_MERGE:** REQ-DEF-08 states user-authored `DIFF_MERGE` edits are not part of the selection panel. Whether they appear in the change-summary payload at all (as read-only entries, informational entries, or omitted entirely) is an open question for the DiffMerge design LLD.

**OQ-6 — Selection controls in a DIFF_MERGE session containing both change kinds:** REQ-CV-01 places selection controls on entities in `DIFF_MERGE` mode. When an entity has both an `UNSTAGED` tool-emitted change and a `STAGED` user-authored change (see OQ-4), the semantics of the entity-level selection control (does it toggle only the UNSTAGED portion? all of it?) is an open question for the design LLD.

**OQ-7 — DTO-level tension: Designer accumulation vs DiffMerge field-level granularity — RESOLVED:** Storage uses a `fieldPath` addressing scheme that lets each pending-change row target any atomicity granularity — `null` or `"$"` for whole-entity accumulator (Designer default; subsequent SETs merge via read-modify-write into a single active row per entity), a scalar column name for independent per-field granularity (DiffMerge default when the tool marks fields independent), a custom named group for multi-column atomic units, or an element path like `elements[id]` for sub-column atomicity in serialized-string columns. Supersession is keyed by `(sessionId, targetSystemId, fieldPath) WHERE validUntil IS NULL`. Both DTO projections — Designer's single accumulated change unit (REQ-DM-03) and DiffMerge's independently-selectable per-field units (REQ-CG-01) — are naturally supported by the same underlying storage without read-time transformation. The commit reducer dispatches on `fieldPath` shape (scalar column, `"$"` full row, named group of columns, or element-in-serialized-column) rather than on any interpretation of custom field names.

**OQ-8 — API-call tracking handle representation — RESOLVED:** Every write API call returns both a `groupId` (a UUID stamped by the write handler on every pending-change row the call produces) and the list of `changeId`s produced. The client may address the call by either form. The Stage, Unstage, Undo, and Redo APIs accept either `groupId`s or `changeId`s (or a mix) and expand internally to the same row set. This degenerates cleanly for single-change API calls (the `changeId` list has one entry).

---

*End of Document*
