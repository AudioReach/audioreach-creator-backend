<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Change Selection Dependencies - Design

**Date:** 2026-08-27
**Status:** Draft for review

**Requirements:** `docs/edit-crud/requirements.md`, especially REQ-ST-08 through REQ-ST-16

**Initial consumer:** `docs/module-write/requirements/delete-module-requirements.md`

---

## 1. Purpose

Stage and Unstage operations cannot always change only the units explicitly selected by the caller. Some pending changes are valid only when other pending changes are selected with them.

Examples:

- a pending CKV create requires its pending Module create;
- a pending parameter payload create may require both a pending CKV create and a pending Parameter Definition create;
- a Module delete requires deletion of connected links;
- deleting a session-created entity may require the preceding pending CREATE to be staged;
- unstaging a required parent or definition must also unstage changes that depend on it.

This design derives those relationships from the current pending-change history each time Stage or Unstage executes. It does not persist a second dependency graph in the database.

---

## 2. Scope

### 2.1 In scope

- Build a directed dependency graph from pending changes and domain relationships.
- Allow any independently selectable change unit to be an entry point.
- Stage the transitive closure of required units.
- Unstage the transitive closure of dependent units.
- Preserve strict atomic selection groups.
- Include active DELETE tombstones and relevant superseded actions during dependency derivation.
- Update `changeStatus` in bulk without entity-specific status methods.
- Support manual DiffMerge writes such as Delete Module over existing `UNSTAGED` changes.

### 2.2 Out of scope

- Undo and Redo activation/deactivation algorithms.
- Commit ordering and target-table materialization.
- UI hierarchy and presentation details.
- Changing domain cascade rules such as which records Delete Module removes.
- Persisting dependency edges or a denormalized subject-reference index.
- Enabling Delete Module in `DIFF_MERGE` before this capability exists.

---

## 3. Design Decisions

1. Dependencies are directed. `A requires B` means staging A stages B, and unstaging B unstages A.
2. Dependencies form a graph, not a strict tree. A unit may require multiple units, and links can connect otherwise separate aggregate hierarchies.
3. The graph is derived for each Stage or Unstage transaction from committed state and edit-action history.
4. Only direct dependency edges are generated. Transitive closure is computed by the generic selection planner.
5. API `groupId` remains the undo/redo boundary. It can expand into initial Stage/Unstage roots but is not itself a dependency node.
6. `linkedEntityGroupId` continues to represent a strict atomic selection group.
7. `IChangeStatusRepository` only mutates status for resolved `changeId` values. It contains no domain rules.
8. Dependency rules live in `@arc/core` and operate on domain-shaped change descriptors. Table-name mapping and history reads remain in `@arc/persistence`.
9. The initial implementation loads and analyzes the session in bulk. Targeted graph loading is a future optimization behind the same ports.

---

## 4. Terminology

| Term | Meaning |
|------|---------|
| Change action | One physical `edit_actions` row identified by `changeId`. |
| Change unit | The smallest independently selectable unit. It is either one change action or all actions sharing a strict `linkedEntityGroupId`. |
| API group | Actions created by one API call and sharing `groupId`. It is atomic for undo/redo, not automatically atomic for Stage/Unstage. |
| Root unit | A change unit explicitly selected by the caller or obtained by expanding an input API group. |
| Required unit | A unit that must be staged for another unit to remain valid. |
| Dependent unit | A unit that becomes invalid when one of its required units is unstaged. |
| Pending-change snapshot | An in-memory, session-scoped view of edit-action metadata and history used to derive dependencies. |
| State transition | The domain state immediately before and after a change action. A DELETE has a non-null before state and a null after state. |

---

## 5. Architecture

```text
Stage Handler / Unstage Handler / Manual DiffMerge Handler
                         |
                         v
               ChangeSelectionService
                         |
              +----------+-----------+
              |                      |
              v                      v
    ChangeSelectionPlanner   IChangeStatusRepository
              |
       +------+------+-------------------+
       |             |                   |
       v             v                   v
PendingChange   ChangeState        Dependency Rule
Snapshot Port   Resolver Port      Registry
       |             |                   |
       +-------------+-------------------+
                         |
                         v
               ChangeSelectionGraph
```

### 5.1 Core ownership

`@arc/core` owns:

- change-unit and graph types;
- dependency rules;
- graph construction;
- forward and reverse traversal;
- selection planning;
- orchestration of status updates;
- validation of dependency invariants.

### 5.2 Persistence ownership

`@arc/persistence` owns:

- querying edit-action metadata and history;
- mapping `targetTable` to core `ChangeSubjectKind` values;
- loading committed baseline rows in batches;
- reconstructing domain-shaped before/after state through port implementations;
- updating `changeStatus` for exact `changeId` values;
- transaction-aware query execution through the supplied `UnitOfWork`.

Persistence does not decide that a Module delete requires a Link delete or that a payload create requires a CKV create.

---

## 6. Change Unit Identity

No new persisted `selectionUnitId` is required for the initial implementation.

```typescript
type ChangeUnitRef =
  | {kind: 'CHANGE'; changeId: number}
  | {kind: 'ATOMIC_GROUP'; linkedEntityGroupId: string};
```

Rules:

- An action with no `linkedEntityGroupId` forms a `CHANGE` unit.
- All relevant actions with the same `linkedEntityGroupId` form one `ATOMIC_GROUP` unit.
- A unit contains the exact `changeId` values that must receive the same status update.
- A request containing a `groupId` expands all applicable members of that API group into root units.
- Expanding a `groupId` does not turn the API group into a permanent atomic selection group.
- Internal dependency planning may include superseded change actions when later actions require their pending state.

If stable selection handles across DiffMerge re-apply become necessary, a persisted `selectionUnitId` can be introduced later without changing dependency-rule semantics.

---

## 7. Pending-Change Snapshot

The existing `EditActionsQueryService` intentionally filters to `validUntil IS NULL`. Selection dependency derivation requires a separate port that can include history.

```typescript
interface IPendingChangeSnapshotRepository {
  load(
    sessionId: number,
    uow: UnitOfWork,
  ): Promise<PendingChangeSnapshot>;
}
```

The core-facing snapshot uses domain terminology:

```typescript
interface PendingChangeDescriptor {
  changeId: number;
  sessionId: number;
  aggregateId: number;
  target: ChangeSubject;
  operation: ChangeOperation;
  fieldPath: string | null;
  source: Source;
  status: ChangeStatus;
  groupId: string | null;
  linkedEntityGroupId: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

interface PendingChangeSnapshot {
  readonly descriptors: readonly PendingChangeDescriptor[];
  readonly byChangeId: ReadonlyMap<number, PendingChangeDescriptor>;
  readonly historyByTarget: ReadonlyMap<ChangeTargetKey, readonly PendingChangeDescriptor[]>;
  readonly membersByApiGroup: ReadonlyMap<string, readonly PendingChangeDescriptor[]>;
  readonly membersByAtomicGroup: ReadonlyMap<string, readonly PendingChangeDescriptor[]>;
}
```

The repository shall:

- load all edit actions needed for the active session, including relevant superseded rows;
- sort each target history by `(createdAt ASC, changeId ASC)`;
- map table names to `ChangeSubjectKind` in the persistence adapter;
- reject rows that claim a different session than the requested session;
- avoid exposing TypeORM entities or table-name constants to core.

---

## 8. State Reconstruction

Dependency rules need relationship data even when an action is a DELETE with an empty payload. A change-state resolver reconstructs the target immediately before and after an action.

```typescript
interface IChangeStateResolver {
  resolve(
    changeId: number,
    snapshot: PendingChangeSnapshot,
    uow: UnitOfWork,
  ): Promise<ChangeStateTransition>;
}

interface ChangeStateTransition {
  target: ChangeSubject;
  before: DomainChangeState | null;
  after: DomainChangeState | null;
}
```

### 8.1 Reconstruction algorithm

For one target entity:

1. Load its committed row, if one exists.
2. Read its ordered edit-action history from the snapshot.
3. Fold CREATE and UPDATE actions using the existing field-path semantics.
4. Capture the state immediately before the requested action.
5. Apply the requested action.
6. Return null after-state for DELETE.

### 8.2 Deleted committed entity

For a committed DataLink followed by a pending DELETE:

```typescript
{
  target: {kind: 'DATA_LINK', systemId: 100},
  before: {
    sourceModuleSystemId: 10,
    destinationModuleSystemId: 20,
  },
  after: null,
}
```

The dependency rule can therefore identify both endpoint modules even though the normal effective overlay omits the link.

### 8.3 Pending CREATE followed by DELETE

For a session-created link:

```text
LINK_CREATE (UNSTAGED)
       |
       v
LINK_DELETE (STAGED manual cascade)
```

The resolver reconstructs the DELETE before-state from the earlier CREATE payload. The graph also records that the DELETE requires the pending CREATE when commit or undo semantics require that predecessor to remain selected.

### 8.4 Batch loading

The persistence adapter shall batch-load committed baselines by subject kind. It shall not issue one database query per change action.

---

## 9. Dependency Graph

```typescript
interface ChangeDependencyEdge {
  dependent: ChangeUnitRef;
  required: ChangeUnitRef;
  reason: ChangeDependencyReason;
}

interface ChangeSelectionGraph {
  requiredClosure(roots: readonly ChangeUnitRef[]): ReadonlySet<ChangeUnitRef>;
  dependentClosure(roots: readonly ChangeUnitRef[]): ReadonlySet<ChangeUnitRef>;
}
```

An edge is interpreted as:

```text
A requires B
```

- Stage A: include B.
- Unstage B: include A.
- Unstage A: do not include B unless another edge requires it.
- Stage B: do not include A unless another edge requires it.

A dependent may have any number of required units:

```text
                      +--> CKV_CREATE
PAYLOAD_CREATE -------+
                      +--> PARAMETER_DEFINITION_CREATE
```

Only direct edges are generated. Traversal computes transitive effects.

### 9.1 Cycle safety

The graph implementation maintains a visited set keyed by normalized `ChangeUnitRef`. Cycles are legal and terminate safely. A cycle effectively makes its members move together for the relevant traversal direction.

Strictly inseparable changes should normally use one atomic group rather than relying on a cycle.

---

## 10. Hierarchy And Multiple Entry Points

The UI or domain may present a hierarchy:

```text
Module
  CKV
    Parameter Payload
```

Validity dependencies are separate from presentation hierarchy.

For CREATE operations:

```text
CKV_CREATE requires MODULE_CREATE
PAYLOAD_CREATE requires CKV_CREATE
```

Results:

- Stage Payload: stage Payload, CKV, and Module.
- Stage CKV: stage CKV and Module.
- Unstage Module: unstage Module, CKV, and Payload.
- Unstage CKV: unstage CKV and Payload; leave Module staged.
- Unstage Payload: unstage only Payload when it is independently optional.

For DELETE operations, ownership direction commonly reverses:

```text
MODULE_DELETE requires CKV_DELETE
CKV_DELETE requires PAYLOAD_DELETE
```

Cross-hierarchy edges are also allowed:

```text
MODULE_DELETE requires DATA_LINK_DELETE
PAYLOAD_CREATE requires PARAMETER_DEFINITION_CREATE
```

Stage and Unstage can therefore begin at any change unit while still preserving graph validity.

---

## 11. Dependency Rule API

Dependencies are derived by a registry of core rules.

```typescript
interface ChangeDependencyRule {
  readonly name: string;

  appliesTo(
    change: PendingChangeDescriptor,
    context: ChangeDependencyContext,
  ): boolean;

  addDependencies(
    change: PendingChangeDescriptor,
    context: ChangeDependencyContext,
    graph: ChangeSelectionGraphBuilder,
    uow: UnitOfWork,
  ): Promise<void>;
}
```

All applicable rules run. A rule does not own the graph and may add zero, one, or many direct edges.

```typescript
interface ChangeDependencyContext {
  readonly snapshot: PendingChangeSnapshot;

  unitOf(change: PendingChangeDescriptor): ChangeUnitRef;

  transitionOf(
    changeId: number,
    uow: UnitOfWork,
  ): Promise<ChangeStateTransition>;

  pendingCreatesOf(subject: ChangeSubject): readonly ChangeUnitRef[];

  pendingDeletesOf(subject: ChangeSubject): readonly ChangeUnitRef[];

  currentChangesOf(subject: ChangeSubject): readonly ChangeUnitRef[];
}
```

The exact lookup methods can be refined during implementation, but they must remain domain-oriented and bulk-backed.

### 11.1 Rule organization

Rules should align with aggregate and relationship families, not database tables:

- `PendingHistoryDependencyRule`
- `ModuleOwnershipDependencyRule`
- `KeyValueDependencyRule`
- `DefinitionReferenceDependencyRule`
- `LinkDependencyRule`
- `SubsystemRouteDependencyRule`
- `UseCaseRelationshipDependencyRule`

This keeps stage and unstage code generic while localizing domain knowledge.

### 11.2 Pending history rule

When a later action depends on an earlier pending action for the target to exist or for its before-state to be meaningful, the later unit requires the earlier unit.

Examples:

- pending UPDATE of a session-created entity requires its CREATE;
- pending DELETE of a session-created entity requires its CREATE;
- a later field action may require an earlier independently selectable field action when domain validation depends on the combined state.

### 11.3 Definition reference rule

For a payload create referencing a CKV and Parameter Definition:

```typescript
graph.requires(payloadUnit, pendingCkvCreateUnit);
graph.requires(payloadUnit, pendingParameterDefinitionCreateUnit);
```

No edge is added when the referenced parent or definition already exists in committed state and has no pending creation requirement.

### 11.4 Delete ownership rule

Deleting an owner requires deletion of owned records that cannot survive independently. Records that form one indivisible selection choice should share an atomic group instead of being connected only by directed edges.

---

## 12. Selection Planner

```typescript
interface ChangeSelectionRequest {
  sessionId: number;
  changeIds?: readonly number[];
  linkedEntityGroupIds?: readonly string[];
  groupIds?: readonly string[];
}

interface ChangeSelectionPlan {
  requestedUnits: readonly ChangeUnitRef[];
  affectedUnits: readonly ChangeUnitRef[];
  affectedChangeIds: readonly number[];
  reasons: readonly ChangeSelectionReason[];
}
```

### 12.1 Plan construction

1. Load the pending-change snapshot inside the caller's transaction.
2. Validate that every requested handle belongs to the active session.
3. Expand requested `groupId` values into their member change units.
4. Normalize strict linked-entity groups into atomic graph nodes.
5. Resolve before/after states in batches as rules request them.
6. Run every applicable dependency rule and build direct graph edges.
7. For Stage, compute forward required closure from the root units.
8. For Unstage, compute reverse dependent closure from the root units.
9. Flatten reached units into exact `changeId` values.
10. Return a deterministic plan ordered by numeric `changeId`.

### 12.2 Planner API

```typescript
interface IChangeSelectionPlanner {
  planStage(
    request: ChangeSelectionRequest,
    uow: UnitOfWork,
  ): Promise<ChangeSelectionPlan>;

  planUnstage(
    request: ChangeSelectionRequest,
    uow: UnitOfWork,
  ): Promise<ChangeSelectionPlan>;
}
```

The plan is useful for unit tests, structured logs, and future preview APIs. It is not persisted.

---

## 13. Change Selection Service

```typescript
interface IChangeSelectionService {
  stage(
    request: ChangeSelectionRequest,
    uow: UnitOfWork,
  ): Promise<ChangeSelectionResult>;

  unstage(
    request: ChangeSelectionRequest,
    uow: UnitOfWork,
  ): Promise<ChangeSelectionResult>;
}
```

Implementation outline:

```typescript
class ChangeSelectionService implements IChangeSelectionService {
  async stage(
    request: ChangeSelectionRequest,
    uow: UnitOfWork,
  ): Promise<ChangeSelectionResult> {
    const plan = await this.planner.planStage(request, uow);

    await this.statusRepository.setStatus(
      request.sessionId,
      plan.affectedChangeIds,
      CHANGE_STATUS.Staged,
      uow,
    );

    return ChangeSelectionResult.from(plan, CHANGE_STATUS.Staged);
  }

  async unstage(
    request: ChangeSelectionRequest,
    uow: UnitOfWork,
  ): Promise<ChangeSelectionResult> {
    const plan = await this.planner.planUnstage(request, uow);

    await this.statusRepository.setStatus(
      request.sessionId,
      plan.affectedChangeIds,
      CHANGE_STATUS.Unstaged,
      uow,
    );

    return ChangeSelectionResult.from(plan, CHANGE_STATUS.Unstaged);
  }
}
```

Planning and mutation execute in the same transaction. A plan must not be reused after that transaction ends.

---

## 14. Change Status Repository

```typescript
interface IChangeStatusRepository {
  setStatus(
    sessionId: number,
    changeIds: readonly number[],
    status: ChangeStatus,
    uow: UnitOfWork,
  ): Promise<void>;
}
```

The repository shall:

- accept only exact `changeId` values produced by the planner;
- verify that every change belongs to the supplied session;
- perform bulk updates rather than one update per action;
- update historical actions when the plan includes them;
- treat an already-correct status as success;
- report a failure when a requested change does not exist in the session;
- contain no entity-type switches and no cascade logic.

Conceptual SQL:

```sql
UPDATE edit_actions
SET change_status = :status
WHERE session_id = :sessionId
  AND change_id IN (:changeIds);
```

The adapter shall verify the matched row set before or after the update so a cross-session or missing ID cannot be silently ignored.

---

## 15. Module Create Example

Assume DiffMerge produced these `UNSTAGED` units:

```text
M  MODULE_CREATE
C  CKV_CREATE
P  PARAMETER_PAYLOAD_CREATE
D  PARAMETER_DEFINITION_CREATE
```

The derived graph is:

```text
C requires M
P requires C
P requires D
```

### 15.1 Stage Payload

Input root: `P`

Forward closure:

```text
P -> C -> M
P -> D
```

Result: stage `P`, `C`, `M`, and `D`.

### 15.2 Unstage Module

Input root: `M`

Reverse closure:

```text
M <- C <- P
```

Result: unstage `M`, `C`, and `P`. Leave `D` staged because the definition remains independently valid.

### 15.3 Unstage CKV

Input root: `C`

Result: unstage `C` and `P`. Leave `M` and `D` staged.

---

## 16. Module Delete Example

### 16.1 Existing UNSTAGED link create

Assume an `UNSTAGED` DataLink CREATE connects Module `10` to Module `20`. The user manually deletes Module `10`.

The Delete Module workflow creates staged delete actions, including a Link DELETE for the effective pending link.

Derived graph:

```text
MODULE_DELETE requires LINK_DELETE
LINK_DELETE requires LINK_CREATE
```

Staging the DELETE API group therefore stages the pre-existing link CREATE as well. Existing actions retain their original `groupId`.

### 16.2 Existing UNSTAGED link delete tombstone

Assume an earlier `UNSTAGED` Link DELETE already hides the committed link from the normal effective overlay.

After the Module DELETE actions are written, the selection planner:

1. sees the Module DELETE action;
2. scans pending Link DELETE actions;
3. reconstructs each link's before-state;
4. identifies the deleted link as connected to the module;
5. adds `MODULE_DELETE requires EXISTING_LINK_DELETE`;
6. stages the existing link-delete unit.

No tombstone-specific logic is needed in the normal effective-state repository.

### 16.3 Reverse unstage

For `MODULE_DELETE requires LINK_DELETE`:

- Unstage Module DELETE: leave Link DELETE staged.
- Unstage Link DELETE: also unstage Module DELETE.

This allows an independently valid link deletion to remain selected while preventing a module deletion from being selected without its required cleanup.

---

## 17. Delete Module Integration And Rollout

### 17.1 Initial Designer delivery

The initial Delete Module implementation:

- allows `Designer` mode only;
- creates manual edit actions as `STAGED`;
- does not invoke `ChangeSelectionService`;
- does not implement dynamic dependency derivation;
- includes explicit TODOs for DiffMerge enablement.

Command TODO:

```typescript
static readonly allowedModes = [SESSION_MODE.Designer];

// TODO(change-selection-dependencies): Add DiffMerge after dependency-aware
// Stage/Unstage is implemented.
```

Handler TODO after delete actions are recorded and before commit:

```typescript
// TODO(change-selection-dependencies): Ensure the DELETE API group is staged
// with its dynamically derived dependency closure before enabling DiffMerge.
```

### 17.2 DiffMerge enablement

Once this design is implemented, the Delete Module handler shall execute the following in one transaction:

1. Validate and create all module and cascade delete actions.
2. Read the ambient DELETE `groupId` from `WriteContext`.
3. Call `ChangeSelectionService.stage()` with that `groupId` as the initial root set.
4. Derive and stage existing required changes.
5. Commit only after the status update succeeds.

The handler does not inspect `changeStatus` and does not query individual dependent entity types.

---

## 18. Stage And Unstage Handler Flow

```text
Controller
   |
   v
StageCommand / UnstageCommand
   |
   v
Handler starts transaction
   |
   v
ChangeSelectionService
   |
   +--> load session snapshot and history
   +--> derive before/after states
   +--> build dependency graph
   +--> compute closure
   +--> bulk update status
   |
   v
Handler commits transaction
```

Handlers shall not duplicate graph traversal or call entity-specific stage methods.

---

## 19. Validation And Failure Handling

### 19.1 Invalid request handle

A change ID, linked group ID, or API group ID that does not belong to the active session shall fail the request. No status shall change.

### 19.2 Missing dependency state

If a rule identifies a required pending target but its history cannot be reconstructed, planning shall fail closed rather than return a partial plan.

### 19.3 Invalid pending reference

If a pending change references an entity that is neither committed nor created by an applicable pending unit, the selection operation shall fail with a structured validation issue. Stage shall not silently select an invalid graph.

### 19.4 Unsupported relationship-bearing change

The rule registry shall have explicit coverage for every relationship-bearing change kind supported by DiffMerge. Missing coverage is an implementation error and shall fail planning with diagnostic context.

### 19.5 Cycles

Cycles terminate through visited-set traversal. Reached nodes are updated once. Cycles that indicate invalid domain data may additionally produce a validation issue when a domain rule requires acyclicity.

### 19.6 Persistence failure

Any snapshot, reconstruction, or status-update failure propagates to the handler. The handler rolls back the transaction.

---

## 20. Transaction And Concurrency Rules

- The command handler owns transaction start, commit, and rollback.
- Snapshot loading, graph construction, and status updates use the same `UnitOfWork`.
- A selection plan is valid only inside the transaction that produced it.
- Status updates are idempotent.
- Dependency rules never write to persistence.
- The repository verifies session ownership of every updated action.
- Concurrent requests that invalidate the snapshot must cause one transaction to fail or observe the serialized result; partial status updates are not permitted.

---

## 21. Performance

The first implementation favors correctness and simple bulk access:

1. Load all session edit actions, including history, in one ordered query.
2. Build metadata indexes in memory.
3. Collect committed baseline IDs by subject kind.
4. Batch-load baselines by kind.
5. Cache state transitions within the planner transaction.
6. Build and traverse the graph in memory.
7. Update statuses in bounded bulk statements.

Recommended index coverage:

- session history by `(session_id, target_table, target_system_id, created_at, change_id)`;
- existing active status and linked-group indexes;
- API-group lookup by `(session_id, group_id)`;
- target history lookup including superseded rows.

If session size later becomes a measured problem, the snapshot repository may load a reachable subset. That optimization must preserve the same core interfaces and results.

---

## 22. Logging

Selection operations shall log:

- Stage or Unstage action;
- number of requested roots;
- number of affected units;
- number of affected change actions;
- dependency-rule names that contributed edges;
- failure reason when planning fails.

Logs shall follow the repository's structured logging convention. Domain entity IDs included in diagnostics shall use `BinaryUtils.toHexString()` and include a readable name or alias when available.

The full dependency graph should not be logged by default because it may be large. Debug-level summaries may include edge reason counts.

---

## 23. Testing Strategy

### 23.1 Graph unit tests

- one required edge;
- one dependent with multiple requirements;
- transitive forward closure;
- transitive reverse closure;
- asymmetric unstage behavior;
- diamond-shaped graph deduplication;
- cycle termination;
- deterministic output ordering.

### 23.2 Change-unit tests

- independent `changeId` unit;
- strict linked-entity group expansion;
- API `groupId` expansion into multiple root units;
- API-group members remain independently selectable when no atomic group or dependency connects them;
- historical action included as a required unit.

### 23.3 Rule unit tests

- CKV CREATE requires pending Module CREATE;
- payload CREATE requires pending CKV CREATE;
- payload CREATE also requires pending Parameter Definition CREATE;
- committed definitions produce no pending dependency edge;
- Module DELETE requires connected Link DELETE;
- unrelated Link DELETE produces no edge;
- pending DELETE before-state is used for relationship discovery;
- strict ownership cleanup is represented as an atomic unit where required.

### 23.4 Persistence integration tests

- session snapshot includes active and superseded actions;
- histories are deterministically ordered;
- committed plus CREATE/UPDATE history reconstructs correct before/after state;
- DELETE payload with no new value retains reconstructable before-state;
- pending CREATE followed by DELETE is reconstructable;
- bulk status update changes exact IDs only;
- cross-session IDs are rejected;
- transaction rollback leaves every status unchanged.

### 23.5 Service tests

- Stage applies forward closure atomically;
- Unstage applies reverse closure atomically;
- repeated Stage and Unstage are idempotent;
- planner failure performs no update;
- linked atomic groups and dependencies compose correctly.

### 23.6 Delete Module integration tests

- Designer Delete Module does not invoke dependency selection;
- DiffMerge enablement remains gated until the service exists;
- pending link CREATE is auto-staged with module deletion;
- pending link DELETE tombstone is discovered and auto-staged;
- unstaging required link deletion unstages module deletion;
- unstaging module deletion leaves independently valid link deletion staged;
- existing dependent changes retain their original `groupId`.

---

## 24. Suggested Core Structure

```text
packages/core/src/application/editing/change-selection/
  change-unit.ts
  change-selection-graph.ts
  change-selection-plan.ts
  change-selection-planner.ts
  change-selection.service.ts
  change-dependency-rule.ts
  change-dependency-rule-registry.ts
  pending-change-snapshot.repository.ts
  change-state-resolver.port.ts
  change-status.repository.ts
  rules/
    pending-history-dependency.rule.ts
    module-ownership-dependency.rule.ts
    key-value-dependency.rule.ts
    definition-reference-dependency.rule.ts
    link-dependency.rule.ts
    subsystem-route-dependency.rule.ts
    usecase-relationship-dependency.rule.ts
```

Concrete rule names may be adjusted to match existing aggregate ownership boundaries. Rules shall not be organized one-for-one with database tables.

Suggested persistence structure:

```text
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
  repositories/edit-session/
    pending-change-snapshot.repository.ts
    change-status.repository.ts
  services/edit-session/
    change-state-resolver.ts
```

---

## 25. Alternatives Considered

### 25.1 Persist dependency edges

Rejected for the initial design. It makes Stage/Unstage traversal cheap, but relationships can become stale when actions are superseded, re-applied, moved, or deleted. Maintaining a second graph would require complex synchronization in every writer.

### 25.2 Persist a subject-reference index

Rejected for the initial design. It makes tombstone lookup efficient, but duplicates relationship data already reconstructable from committed rows and edit history.

### 25.3 Entity-specific Stage and Unstage methods

Rejected. Methods such as `stageModule`, `unstageCkv`, and `stagePayload` duplicate traversal and make every new entity type change the status repository.

### 25.4 Use API `groupId` as the selection boundary

Rejected. API-call grouping is symmetric and cannot represent the required asymmetric behavior. A Link DELETE may remain staged after Module DELETE is unstaged.

### 25.5 Add a persisted selection-unit table immediately

Deferred. Existing `changeId` and `linkedEntityGroupId` identifiers can represent initial change units. A dedicated stable unit identifier may be added later if DiffMerge re-apply or long-lived client handles require it.

---

## 26. Requirements Alignment

| Requirement | Design coverage |
|-------------|-----------------|
| REQ-ST-08 | Directed in-memory graph and dependency rules, sections 9 and 11. |
| REQ-ST-09 | Forward required closure, sections 9 and 12. |
| REQ-ST-10 | Reverse dependent closure, sections 9 and 12. |
| REQ-ST-11 | Asymmetric traversal, sections 9, 15, and 16. |
| REQ-ST-12 | Atomic linked-entity change units, sections 6 and 12. |
| REQ-ST-13 | History-aware snapshot and state reconstruction, sections 7 and 8. |
| REQ-ST-14 | Status-only mutation and preserved `groupId`, sections 6 and 14. |
| REQ-ST-15 | Same-transaction planning and idempotent update, sections 13, 14, and 20. |
| REQ-ST-16 | Visited-set cycle handling, section 9. |
| FR-DM-06A | Deferred Delete Module DiffMerge integration, sections 16 and 17. |
| FR-DM-24 | Same-transaction selection integration, sections 17 and 20. |

---

## 27. Deferred Integration Checklist

Before enabling Delete Module in `DIFF_MERGE`:

- implement the pending-change snapshot port;
- implement domain state reconstruction for all Delete Module cascade entity kinds;
- implement and register the required dependency rules;
- implement `IChangeStatusRepository`;
- implement Stage and Unstage handlers using `ChangeSelectionService`;
- add the handler integration call described in section 17;
- remove the command-mode TODO and add `DiffMerge` to `allowedModes`;
- add unit, integration, and e2e coverage from section 23;
- keep `docs/edit-crud/overall-design.md`, `docs/edit-crud/module-write-path.md`, and the Delete Module design aligned with any changes to this dependency mechanism.

---

## 28. Open Questions

There are no unresolved product-behavior questions in this design. Exact DTO names, validation issue codes, and batching limits may be selected during the implementation plan without changing the dependency semantics defined here.
