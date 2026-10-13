<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Future Server Undo/Redo — Detailed Implementation Design

**Status:** Future implementation proposal — not approved for implementation
**Date:** 2026-10-13
**Requirements:** [`../requirements/current-state-and-future-undo-requirements.md`](../requirements/current-state-and-future-undo-requirements.md)
**High-level design:** [`future-undo-redo-hld.md`](./future-undo-redo-hld.md)
**Current-state prerequisite:** [`current-pending-state-implementation-design.md`](./current-pending-state-implementation-design.md)

---

## 1. Decision

Add durable, strict-LIFO server Undo and Redo through **Command + Memento** beside the `edit_actions` current projection.

One eligible user-triggered DESIGNER command becomes one history operation. Its operation ID is the command correlation UUID generated once at the command boundary and reused by internal subcommands. A UoW-scoped recorder captures complete before and after `edit_actions` target states and commits them atomically with the current projection mutation.

Undo restores every affected target's before-state. Redo restores every affected target's captured after-state. Neither transition reruns the original command or modifies committed project entities.

This is not event sourcing. Normal overlay, validation, staging, discard, and commit continue to use only `edit_actions`.

---

## 2. Authority and Scope

### 2.1 Frozen behavior

The future requirements freeze:

- session-scoped, uncommitted Undo/Redo;
- one indivisible operation per eligible API call;
- initial DESIGNER support, including supported user-triggered routing;
- strict LIFO Undo and Redo;
- redo-tail deletion after a new eligible edit;
- exact before/after current-projection restoration;
- durable history for the active session;
- transactional history append and movement;
- expected revision or operation validation;
- preservation of the originally captured committed baseline;
- controlled deployment with no backfill.

### 2.2 Proposed implementation policy

The following remain proposals until the future feature is approved:

- command metadata used to classify operations;
- storage of cursor, tip, and revision on `project_sessions`;
- invalidating history after a successful non-undoable projection mutation;
- exact Undo/Redo API routes, DTOs, and error codes;
- snapshot format and operational limits.

The current release adds none of these APIs, fields, or history tables.

---

## 3. Current-Projection Invariants

History records and restores the same projection defined by the current-state design:

1. `edit_actions` contains current uncommitted state only.
2. Overlay, validation, staging, discard, and commit never replay history.
3. A session-created target is represented by one complete CREATE row; later edits update that payload.
4. Exact-slot replacement preserves stable `changeId`, status, and `linkedEntityGroupId`.
5. CREATE `source` records target origin; UPDATE `source` records the latest slot writer.
6. One current field value is stored by one non-overlapping field storage slot.
7. API-call `groupId` is not stored on current rows.
8. Command correlation UUID is future operation identity, not current-row membership.
9. Committed baselines use `(sessionId, targetTable, targetSystemId)` and are independent of history.
10. Undo/Redo restores current rows but never inserts, deletes, or rewrites `session_entity_versions`.
11. Current same-slot writes retain last-write-wins behavior; history revision does not add mutable-row conflict detection.

Any restored target state that violates the current projection's lifecycle, slot uniqueness, or storage-overlap rules is an integrity failure.

---

## 4. Architecture

```text
CommandBus
  commandCorrelationId
  effective history policy
        │
        ▼
Command handler ── transaction owner
        │
        ▼
Repository adapter
        │
        ▼
PendingChangeWriter ──► EditActionsQueryService
        │                reducePendingTarget (pure)
        │                private plan execution
        │
        ├──► PendingChangeCache
        │      Map<TargetKey, MutationIntent[]> only
        │
        └──► UoW EditHistoryRecorder
                 before/after target states
                          │
                          ▼
               edit_history_operations
               edit_history_target_states
```

### 4.1 Existing current-state components

- `PendingChangeWriter` remains the sole ordinary `edit_actions` mutation facade.
- `reducePendingTarget` remains a pure module-level function.
- `PendingChangeCache` remains a data-only ordered-intent buffer with no recorder callback or persistence policy.
- Handlers retain transaction ownership.

### 4.2 Future history components

- A UoW-scoped recorder owns operation grouping and first-before/final-after capture.
- A history repository owns append, redo-tail deletion, revision compare-and-swap, Undo, Redo, and cleanup.
- A history query service returns cursor state without exposing target snapshots.
- The Undo/Redo control restore path may replace validated target snapshots directly. Ordinary domain writes still use `PendingChangeWriter` and the reducer.

The recorder is a distinct future concern, not a wrapper around one straightforward query. It coordinates state across every target touched by one command and finalizes that state at the transaction boundary.

---

## 5. Eligibility and Grouping

### 5.1 Initially eligible

An operation is eligible when:

1. one user-triggered command explicitly declares itself undoable;
2. the active session mode is DESIGNER;
3. all pending mutations complete in one handler-owned transaction;
4. every cascade and server-derived mutation passes through the centralized writer boundary;
5. the command has not already finalized a history operation in that UoW.

Eligibility is command-level. It is not inferred from current-row `source`.

One command may touch many targets and tables. Optional Subgraph and Container creation, Node, Module, Ports, properties, relationships, cleanup, and derived survivor updates all belong to the same operation when produced by that command.

### 5.2 Initially excluded as undoable operations

- DIFF_MERGE operations;
- background or unrecorded algorithm mutations;
- stage and unstage;
- commit;
- session start and end;
- reads.

These exclusions are frozen. Discard, imports, and administrative mutations are not classified by the frozen future requirements. The initial proposal treats any that change `edit_actions` as non-undoable invalidation boundaries, but their final classification requires product approval. Whether any successful excluded mutation invalidates existing history is the proposed policy in §13, not a frozen requirement.

### 5.3 No-op commands

An eligible command whose complete before and after target states are identical creates no operation, does not move the cursor, and does not delete the redo tail.

---

## 6. Persistence Model

The proposed model uses the two selected history table names and stores session cursor state on `project_sessions`. This avoids a third one-to-one history-root table while preserving durable session revision state.

### 6.1 `project_sessions` history state

Proposed nullable columns:

| Column | Meaning |
|---|---|
| `edit_history_cursor_sequence` | Highest currently applied operation; zero means none. |
| `edit_history_tip_sequence` | Highest retained operation; may exceed the cursor after Undo. |
| `edit_history_revision` | Monotonic compare-and-swap revision. |

Every DESIGNER session started after history enablement initializes all three values to zero and can record its first eligible operation. Session modes with no eligible operations in the initial release may leave the fields null.

Constraints:

```text
0 <= cursor_sequence <= tip_sequence
revision >= 0
```

The revision never resets during an active session. Closing or invalidating a stack sets cursor and tip to zero and increments revision, preventing ABA races.

### 6.2 `edit_history_operations`

One row per eligible operation:

| Column | Meaning |
|---|---|
| `operation_id` | Primary UUID; the command correlation UUID. |
| `session_id` | Owning session; cascade delete. |
| `sequence_no` | Strict order within the session. |
| `action_name` | Stable diagnostic action key, not a JavaScript class name. |
| `format_version` | Snapshot contract version. |
| `affected_target_count` | Integrity and diagnostic count. |
| `created_at` | Operation creation time. |

Constraints:

```text
UNIQUE(session_id, sequence_no)
INDEX(session_id, created_at)
```

Applied versus undone state is derived from the session cursor. Do not store a mutable operation-status column.

### 6.3 `edit_history_target_states`

One row per target affected by an operation:

| Column | Meaning |
|---|---|
| `operation_id` | Owning operation; cascade delete. |
| `ordinal` | Deterministic target order within the operation. |
| `target_table` | Canonical target table. |
| `target_system_id` | Target row identity. |
| `before_state` | Complete array of current rows before the operation. |
| `after_state` | Complete array of current rows after the operation. |

Constraints:

```text
PRIMARY KEY(operation_id, ordinal)
UNIQUE(operation_id, target_table, target_system_id)
```

The owning operation supplies `sessionId`, so operation plus target table and target system ID identifies the complete target key. An empty state array means the target had no current pending rows on that side of the operation.

### 6.4 Snapshot contract

Conceptual row state:

```typescript
type EditActionSnapshot = {
  changeId: number;
  aggregateId: number;
  targetTable: EntityName;
  targetSystemId: number;
  operation: ChangeOperation;
  fieldPath: string | null;
  newValue: unknown;
  source: Source;
  changeStatus: ChangeStatus;
  linkedEntityGroupId: string | null;
  createdAt: string;
};
```

The snapshot deliberately has no `groupId`, `validUntil`, or speculative `updatedAt`. `sessionId` comes from the owning operation during restoration. Relation objects are never serialized.

Snapshots preserve `changeId` because it identifies the logical current slot. Replacing alias `B` with alias `C` in the same slot records the same `changeId` in both memento sides. CREATE absorption likewise preserves the CREATE row identity, source, status, and linked group.

SQLite must continue using non-reusing generated IDs for `edit_actions.change_id`. Undo may delete a row and Redo may restore its captured identifier. If the persistence engine cannot guarantee that an identifier has not been reassigned, explicit-ID restoration must be redesigned before deployment.

---

## 7. Command Context and History Policy

One possible implementation extends command metadata with four internal policies:

| Policy | Meaning |
|---|---|
| `NONE` | Command must not mutate the current projection. |
| `UNDOABLE` | Record one operation if current target state changes. |
| `INVALIDATE` | Proposed policy: clear prior history if a successful unsupported command changes current state. |
| `CONTROL` | Undo/Redo moves history and restores snapshots without recording another operation. |

`CommandBus` continues generating one correlation UUID per command execution and copies it into UoW context as `commandCorrelationId`. Existing APIs may still return that value through a response field named `groupId`; the internal history design does not use `groupId` as a current-row property.

Commands eligible in DESIGNER but allowed in another mode resolve policy by mode. For example, a routing command may be `UNDOABLE` in DESIGNER while producing no history in DIFF_MERGE.

Startup validation should reject an undoable command without a stable action name or supported session mode. Exact metadata types and registration mechanics remain implementation details for the future plan.

---

## 8. Recorder and Writer Integration

### 8.1 Before-state capture

Before `PendingChangeWriter` accepts the first mutation for a target, the UoW recorder captures that target's complete current `edit_actions` state. Repeated capture in the same operation is a no-op.

Batch and high-fan-out writer methods provide all known target keys together so the recorder can load before-states in bounded, set-based queries. A caller must not bypass the writer with direct current-row SQL.

### 8.2 Cached writes

The cache remains:

```text
Map<TargetKey, MutationIntent[]>
```

The writer, not the cache, registers targets with the recorder before enqueue. At flush, the writer batch-loads current snapshots, invokes `reducePendingTarget(snapshot, orderedIntents)`, and executes consolidated plans. The cache contains no recorder reference, callback, closure, or history policy.

Once a target has buffered intents, later same-target mutations join that buffer until flush. This preserves one ordered reduction path and one command-level before-state.

### 8.3 Immediate writes

For immediate writes, the writer captures first-before state, loads the current target snapshot, calls the same reducer with a one-item intent list, and executes the plan. Immediate and cached writes therefore differ only in loading and batching, not mutation semantics.

### 8.4 Transaction finalization

`TypeOrmUnitOfWork.commit()` is the mandatory future finalization boundary:

1. flush `PendingChangeCache` inside the active transaction;
2. capture final after-states for all touched targets;
3. append or invalidate history according to effective policy;
4. move cursor/tip/revision with compare-and-swap;
5. commit the QueryRunner transaction.

Handlers still decide when to start, commit, and roll back. They do not insert history rows directly. Recorder memory is discarded on rollback or release.

---

## 9. Operation Append Algorithm

For one `UNDOABLE` command:

1. capture the first before-state for each target through the writer boundary;
2. execute all current-projection mutations;
3. flush cached intents;
4. batch-load final after-states;
5. canonicalize each side and drop targets whose before and after states are equal;
6. if no targets remain, create no operation and preserve the redo tail;
7. load cursor, tip, and revision from the owning session;
8. if cursor is below tip, delete operations with `sequence_no > cursor`; target states cascade;
9. insert one `edit_history_operations` row at `cursor + 1`;
10. insert one `edit_history_target_states` row per changed target;
11. compare-and-swap cursor and tip to the new sequence and increment revision;
12. roll back the complete command if any step fails.

Redo-tail deletion, current-state writes, history writes, and cursor movement occur in one transaction. A failed compare-and-swap restores the old projection and redo tail through rollback.

---

## 10. Undo and Redo Algorithms

### 10.1 Undo

Input contains the active session identity, expected revision, and expected top operation ID.

Within one transaction:

1. load session history state and require the expected revision;
2. require cursor greater than zero;
3. load the operation at the cursor and require its operation ID;
4. load all target states in deterministic ordinal order;
5. batch-load current `edit_actions` rows for those targets;
6. require every live state to equal the operation's canonical after-state;
7. replace all affected target states with their before-states in bounded statements;
8. validate inserted counts and current-projection constraints;
9. compare-and-swap cursor to `cursor - 1` and increment revision;
10. commit.

The operation and target-state rows remain as the redo tail.

### 10.2 Redo

Within one transaction:

1. validate expected revision;
2. require cursor below tip;
3. load the operation at `cursor + 1` and validate its ID;
4. require every live target state to equal the canonical before-state;
5. replace affected targets with captured after-states;
6. validate counts and constraints;
7. compare-and-swap cursor to `cursor + 1` and increment revision;
8. commit.

Redo never invokes the original handler, ID allocation, routing engine, or other domain algorithm.

### 10.3 Divergence

If live state differs from the expected memento side, the transition fails as an edit-history divergence. It never performs a best-effort merge or partial restoration.

---

## 11. Snapshot Restoration and Integrity

The CONTROL restore path is the only path allowed to replace complete `edit_actions` target states without invoking normal mutation intents. It restores a previously validated projection, not a new domain mutation.

For each transition:

1. deserialize blobs with the same contract as `edit_actions`;
2. normalize timestamps and object-key ordering;
3. sort target states and rows deterministically;
4. compare complete row values;
5. delete current rows for all affected targets in bounded chunks;
6. insert destination rows preserving `changeId` and `createdAt`;
7. validate lifecycle shape, slot uniqueness, overlap, and inserted count;
8. move the cursor only after successful restoration.

Integrity failures include:

- missing target-state rows for the declared count;
- duplicate target states;
- unknown snapshot format version;
- a snapshot row belonging to another target;
- duplicate or reused `changeId`;
- invalid CREATE/UPDATE/DELETE combinations;
- overlapping field storage;
- cursor/tip constraint violations;
- divergence from the expected memento side.

Every failure rolls back. Memento payloads and raw SQLite errors are never exposed publicly.

---

## 12. Baselines and Current Lifecycle

Undo/Redo never modifies `session_entity_versions`.

- Undoing the first committed-target UPDATE removes its pending row but retains the originally captured baseline.
- Redo restores that UPDATE against the same baseline.
- Undoing a session-created CREATE removes the current CREATE and changes no baseline.
- Undoing cancellation of a session-created target may restore its captured CREATE through the CONTROL path.
- Undoing committed DELETE restores its prior pending state while retaining the original baseline.

This preserves commit-time conflict detection against the committed version first captured by the session.

A successful commit closes prior history in the same transaction as canonical writes and pending cleanup. Session end removes all remaining history. No operation survives either frozen history boundary.

Lifecycle sequence:

1. A commit applies the current STAGED projection, performs pending and baseline cleanup, deletes history operations and target states, and sets cursor/tip to zero while incrementing revision in one transaction.
2. A failed commit rolls back canonical writes, pending cleanup, baseline changes, and history cleanup together.
3. Session end first follows the current-state rule that any STAGED row rejects the attempt without changes.
4. A valid session end removes remaining UNSTAGED rows, baselines, and history in the same transaction. Session deletion cascades history; a retained ENDED session keeps zeroed cursor/tip state with an incremented revision.
5. Any cleanup failure rolls back the complete session-end attempt.

---

## 13. Non-Undoable Mutation Policy

Stage/unstage, DIFF_MERGE, and unsupported background or unrecorded algorithm mutations are frozen as outside initial undo scope. The initial proposal also treats discard, imports, and administrative mutations as non-undoable. A later full-target restore could reverse one of those mutations if history were retained unchanged.

The proposed initial isolation policy is:

1. if a successful non-undoable command changes `edit_actions`, delete that session's retained operations and target states;
2. set cursor and tip to zero;
3. increment revision with compare-and-swap;
4. retain the resulting current projection unchanged;
5. do nothing for a no-op.

For stage/unstage, invalidation prevents a later Redo from restoring stale `changeStatus`. A later enhancement could separate selection state from content/lifecycle history.

This section requires explicit product approval before implementation. Frozen requirements establish that these commands are not undoable; they do not yet mandate invalidation.

---

## 14. Routing Operations

Supported user-triggered manual and automatic Create UseCases commands are one `UNDOABLE` operation each in DESIGNER mode.

The recorder captures:

- cleanup of earlier routing output;
- every UseCase CREATE, UPDATE, and DELETE;
- UseCase/Subgraph and pair relationships;
- SGKV and referenced-component changes;
- all other derived current rows completed by the command.

Undo restores the complete projection before routing. Redo restores the captured result rather than recomputing against possibly changed code, configuration, or reference data.

Background or otherwise unrecorded routing remains outside initial undo scope and follows the approved non-undoable mutation policy.

---

## 15. Concurrency and Failure Semantics

### 15.1 History revision

Append, Undo, Redo, invalidation, and cleanup update session history fields only when the stored revision equals the expected revision. Zero affected rows means stale or concurrent state and rolls back the complete transaction.

### 15.2 Current writes

History revision serializes history movement; it does not replace SQLite write serialization, the single-active-session constraint, or current same-slot last-write-wins behavior.

If recorder finalization loses its compare-and-swap, the associated domain write also rolls back. A current mutation is never committed without the matching operation when its policy is `UNDOABLE`.

### 15.3 Committed concurrency

`session_entity_versions` independently protects commit from committed-data drift. History movement neither resets nor rebases that baseline.

---

## 16. Proposed API Boundary

The future feature needs:

- a read operation returning revision, `canUndo`, `canRedo`, and expected operation IDs;
- one Undo command carrying expected revision and operation ID;
- one Redo command carrying expected revision and operation ID.

Responses expose operation IDs, revision, availability, and affected-target count only. They never expose memento payloads.

Exact routes, DTO names, authorization behavior, status codes, CQRS files, and Swagger contracts are not frozen by this design. They require a dedicated write-API design review before implementation. The current release exposes no backend Undo or Redo API.

---

## 17. Logging and Observability

Structured logs should distinguish operation append, redo-tail deletion, Undo, Redo, invalidation, conflict, divergence, and cleanup. Include session, operation, sequence, revision, action name, and affected-target count. Log entity IDs in hexadecimal with target-table context. Do not log snapshot payloads.

Useful metrics include operation count, target-state count and bytes, transition latency, stale revision rate, divergence rate, invalidation reason, and cleanup duration.

Automatic pruning during an active session is not allowed by the frozen session-lifetime durability requirement. Any future capacity limit requires an explicit product policy.

---

## 18. Deployment

Deploy only when:

- projects are read-only;
- no active edit sessions exist;
- no pending actions exist;
- a database backup is complete.

No current rows or earlier commands are converted. Sessions created after enablement initialize future history state; earlier operations never become undoable.

Schema changes follow the repository's single regenerated `initial-create` migration workflow. Do not hand-write migration SQL. Enabling, disabling, or rolling back the feature also requires the no-active-session/no-pending-work boundary.

---

## 19. Test Strategy

### 19.1 Recorder and writer tests

- first before-state is captured once per target;
- command correlation UUID becomes operation ID;
- current rows never receive `groupId`;
- cache remains a data-only intent map;
- cached flush completes before final after-state capture;
- no-op command creates no operation and preserves redo;
- a new eligible edit after Undo removes the redo tail;
- routing cleanup and replacement rows share one operation.

### 19.2 Persistence integration tests

- session cursor constraints and revision compare-and-swap;
- operation and target-state constraints and cascades;
- Undo/Redo session-created CREATE absorption;
- stable `changeId` across same-slot updates and restoration;
- CREATE source and status preservation;
- UPDATE latest-writer source restoration;
- linked-group restoration;
- committed DELETE with prior UPDATE slots;
- multi-table cascades restore atomically;
- full target key and baseline rows remain unchanged;
- no `validUntil` or current-row `groupId` is introduced;
- binary payload round trip;
- stale, duplicate, concurrent, and divergent transitions change nothing;
- explicit restored IDs never collide with later generated IDs;
- restart preserves cursor and redo tail;
- normal overlay and commit issue no history reads;
- successful commit closes history atomically;
- failed commit preserves projection, baselines, and history;
- session end rejects STAGED rows without history changes;
- successful session end and cleanup failure follow the current lifecycle transaction rules.

### 19.3 Scenario tests

1. Create, rename, delete, Undo twice, Redo once, then create a new edit and verify the abandoned redo tail is gone.
2. Delete a committed module cascade, restart, Undo, and compare the full projection with the captured before-state.
3. Undo an UPDATE, change committed data elsewhere, Redo, and verify commit still checks the original baseline.
4. Run automatic routing twice; Undo the second call to restore the first result, then Undo the first to restore pre-routing state.
5. Race two clients with one expected revision and verify exactly one transition succeeds.
6. Exercise the approved non-undoable mutation policy for stage/unstage, discard, DIFF_MERGE, and unsupported algorithms.

API and handler tests are defined only after the future API contract is approved.

---

## 20. Proposed Implementation Sequence

1. Approve the non-undoable mutation policy and future API contract.
2. Add session history fields plus `edit_history_operations` and `edit_history_target_states` schemas.
3. Add snapshot serialization, canonical comparison, and integrity tests.
4. Add UoW recorder integration at `PendingChangeWriter`; keep the cache data-only.
5. Finalize operation append and redo-tail deletion at UoW commit.
6. Implement CONTROL snapshot restore plus Undo/Redo revision movement.
7. Add core ports, CQRS operations, query access, and manual registries.
8. Add approved REST DTOs, endpoints, error mapping, and Swagger.
9. Classify every current-projection mutation path and route all ordinary writes through the central boundary.
10. Add unit, integration, scenario, restart, concurrency, and E2E coverage.
11. Regenerate the single migration and deploy through the controlled maintenance window.

This sequence is planning guidance only; a fresh implementation plan is required when the future feature enters scope.

---

## 21. Acceptance Criteria

1. One eligible API command creates at most one durable operation containing every affected target.
2. Undo restores the exact valid current projection immediately before that operation.
3. Redo restores the exact captured result without rerunning domain logic.
4. CREATE, UPDATE, DELETE, routing, and cascades restore atomically.
5. Same-slot restoration preserves `changeId`, status, source semantics, linked group, and creation time.
6. Current rows contain no API-call `groupId`.
7. A new eligible edit after Undo deletes the redo tail atomically.
8. Restart and reconnect preserve active-session history.
9. Stale, duplicate, concurrent, corrupt, or divergent transitions cannot partially move history.
10. `session_entity_versions` never changes during Undo or Redo.
11. Successful commit and session end close prior history permanently.
12. Normal overlay, validation, staging, and commit read `edit_actions` without history joins.
13. No operation before feature deployment becomes undoable.

---

## 22. Requirement Traceability

| Requirement | Design sections |
|---|---|
| FR-FU-01, FR-FU-02 | 18 |
| FR-FU-03 | 2, 12, 18 |
| FR-FU-04 | 1, 5, 8 |
| FR-FU-05, FR-FU-05A | 5, 14 |
| FR-FU-06 | 5, 13 |
| FR-FU-07 | 9, 10 |
| FR-FU-08 | 9 |
| FR-FU-09 | 6, 10, 11 |
| FR-FU-10 | 5, 10, 13 |
| FR-FU-11 | 6, 18 |
| FR-FU-12 | 8-10 |
| FR-FU-13 | 6, 10, 15 |
| FR-FU-14 | 3, 12 |
| I-FU-01, NFR-CS-04 | 1, 3, 4 |
| FR-CS-01, FR-CS-03D-F | 3, 6.4, 19 |
| FR-CS-12 through FR-CS-14A | 3, 12, 19 |

---

## 23. Decision Requiring Product Sign-Off

Before future implementation approval, decide whether a successful non-undoable current-projection mutation invalidates the existing Undo/Redo stack as proposed in §13.

The proposal is pragmatic because it guarantees exact restoration without expanding the first Undo release to stage/unstage, discard, DIFF_MERGE, and every algorithm mutation. It reduces history availability, so it must not be treated as frozen behavior without explicit approval.
