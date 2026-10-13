<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Future Server Undo/Redo — High-Level Design

**Status:** Future proposal for lead review
**Date:** 2026-10-13
**Requirements:** [`../requirements/current-state-and-future-undo-requirements.md`](../requirements/current-state-and-future-undo-requirements.md)
**Current-state prerequisite:** [`current-pending-state-implementation-design.md`](./current-pending-state-implementation-design.md)
**Detailed proposal:** [`future-undo-redo-implementation-design.md`](./future-undo-redo-implementation-design.md)

---

## 1. Executive Summary

The current release stores only the latest uncommitted workspace state in `edit_actions` and provides no backend Undo or Redo API.

A future release may add durable, strict-LIFO undo/redo using **Command + Memento**. Each eligible user-triggered operation records the current pending state immediately before and after the operation for every affected target. Undo restores the before-state; redo restores the captured after-state without rerunning domain or routing logic.

The history extension does not turn canonical project data into event sourcing. `edit_actions` remains the only current projection used by overlay, validation, staging, discard, and commit. Normal projection reads never join or replay history.

---

## 2. Settled Direction

The frozen future requirements establish these decisions:

1. Undo/redo applies only to uncommitted work in an active session.
2. One eligible API call and every target mutation it causes form one indivisible operation.
3. Initial support is limited to eligible user-triggered DESIGNER operations, including supported manual and automatic routing calls.
4. Undo and redo are strict LIFO; a new eligible edit after Undo removes the redo tail.
5. History is durable for the active session and closes at successful commit or session end.
6. Each transition is transactional and revision-checked so stale requests change nothing.
7. Undo/redo restores `edit_actions` target states but never modifies committed entities or `session_entity_versions`.
8. Deployment occurs only while projects are read-only, with no active sessions or pending actions. Earlier operations are not backfilled.

The interaction between history and successful non-undoable mutations remains a proposed policy requiring product approval; see §8.

---

## 3. Proposed Architecture

```text
Eligible write command
  command correlation UUID = future operation ID
        │
        ▼
PendingChangeWriter ──► edit_actions current projection
        │
        └── before/after target states ──► edit_history_operations
                                           edit_history_target_states

Normal overlay / validation / staging / commit ──► edit_actions only
Undo / Redo control path ──► history + exact edit_actions restoration
```

### Operation

One eligible user-triggered API call. Its `operationId` is the command correlation UUID generated once at the command boundary and reused by internal subcommands. The API may expose that UUID through its existing `groupId` response field, but `groupId` is not stored on `edit_actions` rows.

### Target-state memento

The complete before and after arrays of current `edit_actions` rows for one target. Empty arrays represent no pending state for that target. Mementos preserve stable `changeId`, aggregate scope, operation, field path, payload, source, status, linked-group identity, and creation time.

### Session history cursor

A durable cursor separates applied operations from redoable operations. A monotonic revision protects append, Undo, Redo, invalidation, and cleanup from stale or concurrent movement.

---

## 4. Current-Projection Compatibility

Recording and restoration preserve the current-state rules:

- a session-created target remains one complete CREATE row, and later edits are absorbed into its payload;
- exact-slot replacement preserves `changeId`, status, and `linkedEntityGroupId`;
- CREATE `source` remains the target's origin;
- UPDATE `source` identifies the latest writer of the atomic slot;
- current field storage remains non-overlapping;
- no API-call `groupId` is added to current rows;
- committed-target baselines remain keyed by the complete target key and are not rewritten by history movement.

History stores snapshots of this projection. It does not introduce a second overlay model or reactivate superseded current rows.

---

## 5. User-Visible Behavior

### Undo

Undo restores every target changed by the latest applied eligible operation in one transaction. A module operation that changed the module, ports, properties, relationships, and optional containing targets is restored as one unit.

### Redo

Redo restores the selected operation's captured after-state. It does not call the original handler or rerun routing, allocation, or other domain logic.

### New edit after Undo

A new eligible operation deletes the redo tail and appends after the current cursor in the same transaction as its pending-state changes.

### Commit and session end

A successful commit or session end permanently closes the prior undo history. History cleanup occurs in the same transaction as the corresponding lifecycle transition; a failed commit or failed session end leaves both current state and history unchanged. Undo never changes committed project data and never crosses either boundary.

---

## 6. Initially Supported Scope

### Included

- eligible user-triggered DESIGNER creates, updates, and deletes;
- multi-target and multi-table cascades;
- server-derived changes completed inside the eligible command;
- supported manual and automatic Create UseCases routing calls;
- durable strict-LIFO Undo and Redo.

One supported routing call is one operation. Its target states include cleanup of prior routing output and every created, updated, deleted, relationship, and derived row. Undo restores the complete pre-routing projection, and redo restores the captured result.

### Excluded initially

- DIFF_MERGE undo;
- background or otherwise unrecorded algorithm mutations;
- commit, session start/end, stage/unstage, and reads as undoable operations;
- selective or out-of-order undo;
- branching history or named restore points;
- project audit history;
- event sourcing of committed data.

---

## 7. Persistence Impact

The proposed future release adds two history tables and session cursor state:

| Store | Purpose |
|---|---|
| `project_sessions` history fields | Cursor, redo tip, and monotonic revision for an undo-capable session. |
| `edit_history_operations` | Ordered operation records keyed by command correlation UUID. |
| `edit_history_target_states` | Complete before/after `edit_actions` arrays for affected targets. |

Applied versus undone status is derived from the cursor; it is not copied onto each operation. History rows are internal restoration data, not a public audit API.

---

## 8. Proposed Isolation Policy Requiring Sign-Off

Stage/unstage, DIFF_MERGE, and unsupported background or unrecorded algorithm mutations are not initially undoable. Discard's future classification is still open; this proposal treats it as another non-undoable boundary. Because these operations can change `edit_actions` after a memento is recorded, restoring an older full target state could otherwise reverse or overwrite the later unsupported change.

Only the exclusions listed in the frozen future requirements are settled. Treating discard as non-undoable and invalidating history after any of these mutations are proposed policies, not approved requirements.

The pragmatic initial proposal is:

> A successful non-undoable command that changes the current pending projection invalidates the session's existing undo/redo history. A no-op does not.

For stage/unstage, this avoids restoring stale `changeStatus` values captured before a later selection change. A future design could preserve history by separating selection status from content/lifecycle state, but that is not part of the frozen requirements.

This invalidation rule is a proposal, not a settled product requirement. It must be approved before implementation planning.

---

## 9. Correctness and Concurrency

The implementation must guarantee:

- projection mutation, operation append, target-state recording, redo-tail deletion, and cursor movement commit atomically;
- Undo or Redo validates the expected revision and expected top operation;
- the live target state matches the expected memento side before restoration;
- stale, duplicate, concurrent, or divergent requests change nothing;
- `session_entity_versions` remains untouched;
- current same-slot writes retain their existing last-write-wins policy; history revision protects history movement, not mutable-row writes;
- normal overlay, validation, staging, and commit do not read history tables.

---

## 10. Deployment

The feature is introduced only through a controlled upgrade:

1. put projects in read-only mode;
2. verify there are no active sessions or pending actions;
3. back up the database;
4. deploy the history schema and application behavior;
5. enable history only for sessions started after deployment.

No current pending rows or earlier commands are converted into undo history.

---

## 11. Trade-Offs

| Trade-off or risk | Mitigation |
|---|---|
| Full target snapshots use more storage during long sessions. | Keep history session-scoped, measure size, and clean it at lifecycle boundaries. |
| Every eligible mutation must be grouped correctly. | Wrap the centralized `PendingChangeWriter` boundary with one UoW-scoped recorder. |
| Large cascades produce large operations. | Capture and restore targets in bounded, set-based transactions. |
| Stale clients may request the wrong transition. | Require expected revision and operation ID. |
| Snapshot format may evolve. | Store a format version and reject unknown formats safely. |
| Unsupported mutations may invalidate useful history. | Obtain product sign-off and document the initial policy before implementation. |

---

## 12. Approval Requested

Approval of this HLD confirms the settled direction in §2 and the Command + Memento architecture. The history-invalidation behavior in §8 requires a separate explicit product decision.

Exact schemas, algorithms, proposed APIs, tests, and implementation sequencing are described in the detailed future proposal. They are not part of the current release.
