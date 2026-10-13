<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Current-State Editing and Future Undo/Redo: Requirements

**Date:** 2026-10-13

**Status:** Frozen

---

## 1. Context

The backend is a durable project workspace. A client uploads project data, maintains an isolated edit session, commits the desired result, and downloads the generated files. The current release does not require backend undo/redo or reconstruction of intermediate pending states.

Pending storage shall therefore retain only the current uncommitted workspace state. Undo/redo may be introduced in a future release through a separately deployed operation-history extension. Upgrades that change edit-session persistence occur only while projects are read-only, with no active edit sessions or pending changes.

## 2. Settled Product Decisions

1. Backend undo/redo is removed from the current scope.
2. Superseded pending versions are not retained.
3. UI compensation payloads are not added to normal write or DELETE responses.
4. Committed optimistic-concurrency protection remains required.
5. A future backend undo feature need not support operations performed before that feature is deployed.
6. Future undo applies only within an uncommitted edit session and never crosses commit or session-end boundaries.
7. A session-created target is represented by one atomic CREATE row containing its complete latest payload; later updates fold into that row.
8. The source of a session-created CREATE identifies its origin and is not changed when a user manually refines the payload.
9. Replacing an existing pending slot does not automatically stage or unstage it; a new manual slot starts STAGED.
10. A diff may be applied only once per active `DIFF_MERGE` session; recomputation requires a fresh session.
11. Current pending rows do not store API-call `groupId`; future operation/memento persistence owns undoable command identity and membership.
12. Source has operation-specific semantics: CREATE records the origin of the target, while UPDATE records the writer of the current field/group slot.
13. `changeId` is the stable identity of one logical current slot, not a version identifier.
14. Every current field value is stored by exactly one field storage slot; a mutation updates that slot rather than creating an overlapping row.
15. Concurrent writes to the same pending slot use current last-write-wins behavior; pending-row revision conflict detection is deferred until concurrent session editing becomes a concrete requirement.

## 3. Definitions

| Term | Definition |
|---|---|
| Current pending change | The latest uncommitted state for one target or independently selectable field slot. |
| Field storage slot | The one current pending row whose `fieldPath` and payload store a field's current pending value. One slot may store one field, an atomic field group, a whole row, or a structured element. |
| Session-created target | A target represented by a pending CREATE and not yet present in committed entity storage. |
| Committed target | A target that existed in committed entity storage when first modified by the session. |
| Cancellation | Removal of all pending state for a session-created target that is deleted before commit. |
| Current projection | The complete set of current pending changes used by overlay, validation, staging, and commit. |
| Future edit operation | One eligible user-triggered write API call and every target change produced by that call. |

---

## 4. Current-Release Functional Requirements

### 4.1 Current-state storage

**FR-CS-01 — No pending history:** Pending storage shall contain only current pending changes. Superseded pending values shall be replaced or removed rather than retained as historical versions.

**FR-CS-02 — Current slot uniqueness:** For one session, target table, target system ID, and independently selectable field slot, at most one current pending value shall exist.

**FR-CS-03 — Current-row metadata:** Current pending changes shall retain source, status, aggregate scope, and linked-selection metadata required by staging, DiffMerge, and diagnostics. They shall not persist an API-call `groupId`. A command UUID may still be generated for response or log correlation, but it shall not define current-row identity or membership.

**FR-CS-03A — Status replacement semantics:** Replacing an existing current pending slot shall preserve its current STAGED or UNSTAGED status. A new manual slot with no current pending predecessor shall start STAGED. Aggregate-level PARTIAL is derived from multiple rows and shall not be persisted as a row status.

**FR-CS-03B — UPDATE source semantics:** For an UPDATE slot, source shall identify the writer that most recently modified that atomic slot. When a user modifies a `DIFF_TOOL` scalar, whole-row, or grouped UPDATE slot, the one current row shall be updated with `source = MANUAL`, even when an unchanged member of a composite payload originally came from the diff tool. No prior value or source row shall be retained.

**FR-CS-03C — Linked-group stability:** Replacing the value, source, or status-independent content of a current target slot shall preserve its `linkedEntityGroupId`. Only an operation explicitly responsible for changing linked-selection membership may set, replace, or clear that identifier.

**FR-CS-03D — Stable current-slot identity:** Replacing the payload, source, status, or linked-selection metadata of the same logical slot shall preserve its `changeId`. A new `changeId` shall be allocated only when creating a genuinely new slot or lifecycle action. Removing a slot shall remove its identifier; identifiers shall not be reused for unrelated slots.

**FR-CS-03E — Non-overlapping field storage:** One current field value shall be stored by at most one field storage slot for a target. If an existing scalar, accumulator, whole-row, group, or element slot stores the field being changed, the mutation shall update that slot rather than insert an overlapping slot. Storage of the same field by multiple current slots is an integrity error.

**FR-CS-03F — Command correlation ID:** Each eligible write API call shall have exactly one command correlation UUID, generated at its command boundary and reused by any internal subcommands. The API may return it through the existing `groupId` response field and include it in structured logs. In the current release, that UUID shall be an opaque correlation value: it shall not be persisted in current pending rows or accepted as a pending-change selector. A future undo release shall persist that same UUID as its operation ID for eligible commands.

**FR-CS-03G — Multi-field mutation:** A mutation affecting multiple fields shall resolve each field to its field storage slot and update every distinct slot atomically. A field with no current storage slot shall create a new slot at the scalar or grouped granularity explicitly declared by the operation. When a normal DESIGNER mutation declares an existing null accumulator, previously unrepresented fields may be added to that accumulator; this expands its field storage coverage without creating a second slot. A new named multi-field group may be created only when none of its member fields already has a storage slot; adding members to or otherwise changing a named group requires an explicit regrouping operation. A normal value mutation that would create overlapping storage or cannot resolve field storage unambiguously shall fail without changing pending state.

### 4.2 CREATE, UPDATE, and DELETE

**FR-CS-04 — CREATE then UPDATE:** Updates to a session-created target shall replace the affected values inside its existing CREATE payload. No separate UPDATE row shall coexist for that target. Overlay and commit shall continue treating the target as one atomic pending creation containing its latest complete values.

**FR-CS-04A — CREATE source semantics:** The source of a session-created CREATE shall identify the origin of that pending creation. A later manual edit shall not change a `DIFF_TOOL` CREATE to `MANUAL`, and field-level source attribution inside a CREATE payload is not required.

**FR-CS-04B — CREATE status stability:** Updating a session-created target shall preserve the CREATE row's current STAGED or UNSTAGED status. Only an explicit stage or unstage operation shall change that status.

**FR-CS-05 — Session-created cancellation:** Deleting a session-created target shall remove all current pending changes for that target and shall not create a pending DELETE for it.

**FR-CS-06 — Committed-target DELETE:** Deleting a committed target shall remove all of that target's current pending UPDATE slots and create one target-wide DELETE slot. The DELETE shall receive a new `changeId` plus the source, status, and explicit linked-selection metadata supplied by the DELETE operation; it shall not inherit row metadata from the removed UPDATE slots. The target-scoped committed baseline is not row metadata and shall remain unchanged for DELETE conflict detection.

**FR-CS-07 — Invalid missing target:** DELETE or UPDATE against a target absent from both committed and current pending state shall fail using the existing not-found behavior.

**FR-CS-07A — No implicit resurrection:** A committed target with a current pending DELETE shall be absent from the effective workspace. UPDATE, repeated DELETE, or CREATE reusing that target's system ID shall be rejected. The user may create a new entity through the normal CREATE flow, but it shall receive a new system ID and shall not cancel or reuse the deleted target.

**FR-CS-08 — Cascades:** Domain deletion services shall continue determining all roots, owned rows, relationships, and derived updates affected by an operation. Cancellation versus real DELETE/UPDATE shall be resolved independently for each selected target.

### 4.3 Overlay and validation

**FR-CS-09 — Current projection reads:** Effective reads and write-time validation shall combine committed data only with the current pending projection. They shall not replay historical actions.

**FR-CS-10 — Status-independent overlay:** Effective reads shall continue including both STAGED and UNSTAGED current changes. Status controls commit selection, not workspace visibility.

### 4.4 Commit and concurrency

**FR-CS-11 — Current-state commit:** Commit shall apply only current STAGED pending changes. Superseded values and cancelled session-created targets shall not reach commit.

**FR-CS-12 — Capture-once baseline:** The first modification of a committed target in a session shall capture its committed version. Replacing current pending values shall not replace or remove that captured version before successful commit or session end.

**FR-CS-13 — Session-created targets:** Session-created targets shall not require committed-version capture.

**FR-CS-14 — Conflict detection:** Commit shall reject UPDATE or DELETE when the current committed version differs from the captured baseline.

**FR-CS-14A — Failed commit preservation:** A version conflict or any other commit failure shall roll back the complete commit attempt. Current pending rows, statuses, target baselines, and active-session state shall remain unchanged and retryable.

**FR-CS-15 — No-op cancellation:** A fully cancelled session-created target contributes no entity-table mutation and no applied-change count. If cancellation leaves the session with no current STAGED work, there is nothing to commit for that cancelled work.

### 4.5 Lifecycle and cleanup

**FR-CS-16 — Commit cleanup:** Successful commit shall remove applied current pending changes and their no-longer-needed baseline metadata.

**FR-CS-17 — Session cleanup:** Ending a session with current STAGED rows shall fail without changing session state. Otherwise, session end shall transactionally remove all remaining UNSTAGED pending rows and every target baseline owned by the session. A session with no recorded commits shall then be removed; a session with one or more recorded commits shall be retained in ENDED status as commit audit history. Cleanup failure shall roll back the complete end-session attempt. There is no historical pending chain to retain or clean.

**FR-CS-18 — No current undo API:** The current release shall not expose backend Undo or Redo commands, handlers, or API behavior.

**FR-CS-19 — Single diff application:** A diff may be applied successfully at most once to an active `DIFF_MERGE` session. The complete apply operation shall be transactional: any failure shall roll back all diff changes, shall not consume the session's one successful application, and may be retried. Re-application after success shall be rejected. Recomputing or re-adding an applied diff requires closing the current session and applying the diff in a fresh session.

---

## 5. Future Undo/Redo Requirements

These requirements guide a later design and deployment; they do not require implementation in the current release.

### 5.1 Deployment boundary

**FR-FU-01 — Controlled introduction:** Future undo persistence shall be introduced only while projects are read-only, no edit sessions are active, and no pending changes exist.

**FR-FU-02 — No historical conversion:** Operations performed before the undo-capable release shall not become undoable. Every edit session created after the feature is enabled shall support undo from its first eligible operation.

### 5.2 Scope and granularity

**FR-FU-03 — Pending edits only:** Undo/redo shall apply only to uncommitted edits in the active session. Successful commit or session end permanently closes that undo history.

**FR-FU-04 — Operation granularity:** One eligible user-triggered write API call and all target changes it produces shall form one indivisible undo/redo operation. The future operation and memento records, rather than metadata duplicated on current pending rows, shall own that membership.

**FR-FU-05 — Supported mode:** Undo/redo shall initially apply to eligible user-triggered edits in DESIGNER mode. This includes manual edits and user-triggered automatic or manual UseCase routing when the complete routing call is recorded as one operation. DIFF_MERGE and background or otherwise unrecorded algorithm mutations remain outside the initial future scope.

**FR-FU-05A — Routing operation:** One eligible routing call shall include cleanup of prior routing output plus every created, updated, deleted, and derived UseCase/relationship pending row. Undo shall restore the complete pre-routing pending projection; it shall not merely remove rows created by routing.

**FR-FU-06 — Excluded operations:** Commit, session start/end, stage/unstage, and read operations shall not themselves become undoable edit operations.

### 5.3 Behavior

**FR-FU-07 — Strict LIFO:** Undo shall reverse the latest applied undoable operation in the session. Redo shall reapply the latest undone operation.

**FR-FU-08 — Redo invalidation:** A new undoable edit after one or more undo operations shall discard the redo tail.

**FR-FU-09 — Exact restoration:** Undo shall restore the current pending projection to the state immediately before the target operation, including multi-table module cascades and server-derived changes. Redo shall restore the corresponding after-state. Strict LIFO requires later applied operations to be undone first; undo shall validate the expected current after-state before restoring the snapshot.

**FR-FU-10 — Isolation:** Undo/redo shall affect only targets changed by the selected operation and shall not reverse unrelated manual or algorithm-produced changes.

**FR-FU-11 — Durability:** Future undo history shall survive backend restart and client reconnect for the lifetime of the active edit session.

### 5.4 Transactions and concurrency

**FR-FU-12 — Atomic transition:** Recording an undoable operation, updating the current pending projection, and later undoing or redoing that operation shall each be transactional.

**FR-FU-13 — Session serialization:** Future undo/redo requests shall validate the expected session revision or current operation so stale requests cannot move the session history incorrectly.

**FR-FU-14 — Existing committed baseline:** Undo/redo shall not reset the committed baseline version captured for optimistic concurrency. Commit-time conflict detection remains relative to the originally captured committed version.

---

## 6. Invariants

**I-CS-01 — One current truth:** Overlay, validation, staging, and commit shall use the same current pending projection.

**I-CS-02 — Committed isolation:** Current pending changes shall not modify committed entity tables before commit.

**I-CS-03 — Committed concurrency preservation:** Simplifying pending storage shall preserve the database-enforced single-active-session rule, handler-owned transaction atomicity, capture-once committed baselines, and committed-version conflict detection. Same-slot pending writes remain last-write-wins in the current release; they do not weaken commit-time drift detection.

**I-CS-04 — No hidden history dependency:** No current-release behavior may require superseded pending rows after they are replaced or cancelled.

**I-FU-01 — Future projection compatibility:** Future undo/redo shall restore the same current pending projection used by the current release rather than introducing a second overlay or commit model.

## 7. Non-Functional Requirements

**NFR-CS-01 — Centralized mutation:** All current pending-state mutations shall use a shared persistence service so a future operation-history recorder can wrap one authoritative boundary.

**NFR-CS-02 — Set-based cascades:** High-fan-out cancellation and deletion shall use bounded, set-based persistence operations rather than one query per historical action.

**NFR-CS-03 — Open-source clarity:** Schema names, contracts, and documentation shall describe current pending state rather than imply event sourcing or implemented undo history.

**NFR-CS-04 — Projection/history separation:** Current overlay, staging, validation, and commit behavior shall not depend on future operation or memento tables. When introduced, those tables may restore the current projection but shall not become part of normal projection reads.

**NFR-FU-01 — Future implementation independence:** No speculative undo tables are required now. The future feature may add its persistence through the controlled deployment boundary in FR-FU-01.

## 8. Out of Scope

- Backend undo/redo in the current release.
- Reconstruction of intermediate current-release workspace states.
- Client compensation payloads returned by normal write APIs.
- Undo after commit or session end.
- Collaborative selective undo across clients.
- Event sourcing of canonical project data.
- Long-term audit reconstruction from pending edit history.
- Field-level writer provenance within the payload of a session-created CREATE.
- Pending-row revision tokens or stale-write rejection for same-slot concurrent session edits.
- Removal of committed optimistic concurrency.

## 9. Requirements Superseded Upon Approval

Approval of this document supersedes current requirements that mandate retaining all pending versions or implementing server activation/deactivation of prior pending rows, including the undo/history portions of `REQ-EA-03`, `REQ-EA-10`, `REQ-UNDO-01` through `REQ-UNDO-05`, and the frozen CREATE-then-DELETE cancellation requirements that depend on retained history. It also supersedes the former idempotent same-session re-application behavior in `REQ-TM-06` and requirements that stamp API-call `groupId` onto every current pending row for future undo membership.

Requirements for current effective state, staging, aggregate scope, committed conflict detection, and API-call atomic writes remain in force unless explicitly changed above.
