# Aggregate Apply-Changes Framework: Low-Level Design

**Date:** 2026-10-19
**Status:** Approved design for the latest-state `edit_actions` model

Requirements: [aggregate-apply-changes-requirements.md](./aggregate-apply-changes-requirements.md)

## 1. Purpose

This design implements the existing `commit-changes` and `discard-changes`
endpoints for the current edit-session model.

`edit_actions` stores only the latest pending state for an active session. It
does not retain superseded action history and has no `validUntil` column. Where
the requirements document still refers to stale rows, action history, or the
old six-phase schedule catalogue, this LLD uses the approved latest-state
behavior defined below.

Commit shall:

1. select every `STAGED` edit action in the active session;
2. reduce those rows into permanent-table operations;
3. execute the reduced operations in a fixed domain and table order;
4. delete exactly the selected edit-action rows; and
5. commit all effects atomically.

Discard shall delete every edit-action row in the active session without
changing permanent tables.

## 2. Design Decisions

1. Commit always applies all `STAGED` rows in the active session. Partial
   commit by caller-supplied `changeIds` is not supported.
2. `UNSTAGED` rows never participate in commit and remain in `edit_actions`.
3. An empty commit fails with `422 NO_STAGED_CHANGES`.
4. An empty discard succeeds.
5. The handler owns transaction start, commit, and rollback.
6. Persistence owns edit-action interpretation, permanent identity derivation,
   reduction, fixed execution order, and cleanup.
7. Core never imports TypeORM types or interprets physical table identities.
8. Reduction produces a flat `ReducedEditAction[]`. There is no reduced-group
   wrapper and no `NO_OP` result.
9. Reduction and execution reuse the existing `CHANGE_OPERATION` values:
   `CREATE`, `UPDATE`, and `DELETE`. `NONE` is invalid for commit.
10. Execution order is encoded by direct domain-family and table calls. There
    is no `ApplyExecutionSchedule`, numeric phase catalogue, runtime graph,
    topological sort, execution index, or execution map.
11. One low-level `executeTableOperation()` call executes one
    `ReducedEditAction`.
12. Database cascade and restriction behavior remains authoritative.
13. Optimistic version enforcement remains out of scope.
14. A successful endpoint response is `200 {}`.

## 3. Architecture

```text
packages/api
  ProjectController.commitChanges()
  ProjectController.discardChanges()

packages/core
  ApplyChangesCommand / ApplyChangesHandler
  DiscardChangesCommand / DiscardChangesHandler
  UnitOfWork.applyChanges() / UnitOfWork.discardChanges()

packages/infrastructure/persistence
  TypeOrmApplyChangesService
  TypeOrmDiscardChangesService
  EditActionsQueryService
  ApplyEditActionReducer
  fixed-order execution functions
  TypeOrmSessionRepository
```

Dependencies continue to point inward. Core exposes only transaction-bound
instructions through `UnitOfWork`. All `EditActionRow`, `EntityManager`, schema,
identity, and execution details remain in persistence.

### 3.1 Minimal module structure

The apply implementation deliberately avoids one class per table and avoids
separate reduction, target, and schedule registries.

| Module | Responsibility |
|---|---|
| `TypeOrmApplyChangesService` | Coordinate selection, reduction, validation, fixed-order execution, and exact cleanup. |
| `ApplyEditActionReducer` | Convert selected latest-state rows into flat permanent-table operations. |
| Fixed-order execution module | Call domain-family operations in the approved order and execute one reduced action at a time. |
| `TypeOrmDiscardChangesService` | Delete all edit actions for the active session. |
| `EditActionsQueryService` | Read staged rows using explicit session and status filters. |
| `TypeOrmSessionRepository` | Perform transaction-bound edit-action deletion. |

Target-specific behavior is implemented with private reducer methods and small
immutable configuration objects. It is not exposed through strategy interfaces.

### 3.2 Planned placement

- Core commands and handlers:
  `packages/core/src/application/edit-session/apply-changes/` and
  `packages/core/src/application/edit-session/discard-changes/`.
- Core transaction interface:
  `packages/core/src/application/ports/persistence/unit-of-work.ts`.
- Persistence reduction and execution:
  `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/services/apply-changes/`.
- Existing API endpoints and DTOs remain under the project REST module.

## 4. Public and Transaction Contracts

The request DTOs are empty. They do not accept change IDs, aggregate IDs,
target filters, session IDs, or commit messages.

| Endpoint | Behavior | Success |
|---|---|---|
| `POST /arc-api/v1/projects/:projectId/commit-changes` | Commit all staged actions from the active session. | `200 {}` |
| `POST /arc-api/v1/projects/:projectId/discard-changes` | Delete all edit actions from the active session. | `200 {}` |

The active session is supplied through the existing request/session and
`WriteContext` flow.

`UnitOfWork` exposes transaction-bound instructions without returning physical
operation details:

```typescript
export interface UnitOfWork {
  // Existing methods are omitted.
  applyChanges(): Promise<void>;
  discardChanges(): Promise<void>;
}
```

The apply handler follows the existing transaction convention:

```typescript
await uow.startTransaction();

try {
  await uow.applyChanges();
  await uow.commit();
  return Result.ok({});
} catch (error) {
  if (uow.isInTransaction()) {
    await uow.rollback();
  }
  throw error;
}
```

Discard uses the same transaction structure and invokes
`uow.discardChanges()`.

## 5. Commit Input

Apply reads the current latest-state table once:

```typescript
const rows = await editActions.query({
  sessionId,
  changeStatus: CHANGE_STATUS.Staged,
});
```

No `validUntil` predicate exists in the current schema. The selected
`EditActionRow[]` is retained unchanged until cleanup.

If `rows.length === 0`, apply throws `NO_STAGED_CHANGES` before touching
permanent tables.

The initially selected IDs are authoritative for cleanup:

```typescript
const selectedChangeIds = rows
  .map(row => row.changeId)
  .sort((left, right) => left - right);
```

## 6. Reduction Output

Reduction returns one flat operation per permanent-table row:

```typescript
export interface ReducedEditAction {
  tableName: EntityName;
  operation: Exclude<
    ChangeOperation,
    typeof CHANGE_OPERATION.None
  >;
  targetSystemId: number;
  values?: Readonly<Record<string, unknown>>;
  sourceEditActionIds: readonly number[];
}
```

The fields mean:

| Field | Meaning |
|---|---|
| `tableName` | Destination TypeORM entity name. It is the source row's `targetTable`. |
| `operation` | Existing edit-session `CREATE`, `UPDATE`, or `DELETE` operation. |
| `targetSystemId` | Synthetic ID of the permanent row to insert, update, or delete. |
| `values` | Columns inserted or updated by the operation. |
| `sourceEditActionIds` | Sorted unique `changeId` values that contributed to this reduced action. |

Operation contracts are:

| Operation | Required data | TypeORM write |
|---|---|---|
| `CREATE` | `targetSystemId`; `values` optional | `repository.insert({systemId: targetSystemId, ...(values ?? {})})` |
| `UPDATE` | `targetSystemId` and non-empty `values` | `repository.update({systemId: targetSystemId}, values)` |
| `DELETE` | `targetSystemId`; no `values` | `repository.delete({systemId: targetSystemId})` |

There is no `NO_OP`. A selected source row that produces no permanent-table
operation is invalid and remains in the session after rollback.

## 7. ApplyEditActionReducer

```typescript
export class ApplyEditActionReducer {
  constructor(private readonly manager: EntityManager) {}

  async reduce(
    rows: readonly EditActionRow[],
  ): Promise<readonly ReducedEditAction[]>;
}
```

The transaction-bound manager provides TypeORM metadata for validating target
table columns. Reduction does not inspect committed graph state.

The public interface remains one method. Internally the reducer:

1. groups source rows by `targetTable` and `targetSystemId`;
2. validates that every grouped source operation is `CREATE`, `UPDATE`, or
   `DELETE`;
3. carries `targetSystemId` as the uniform permanent-row identity;
4. validates the target table metadata and removes only non-persistent UseCase
   routing metadata;
5. requires a consistent operation within each permanent row;
6. merges disjoint persisted payload fields for CREATE and UPDATE;
7. validates the operation-specific payload requirements;
8. emits flat `ReducedEditAction` objects; and
9. verifies source-action coverage before returning.

### 7.1 Latest-state operation rules

The pending writer has already reduced operation transitions before commit.
Apply therefore does not replay CREATE, UPDATE, and DELETE histories.

For one physical identity:

- a CREATE target has one current whole-row CREATE action;
- an UPDATE target may have multiple current disjoint field actions;
- a DELETE target has one current DELETE action; and
- mixed current operations for the same physical identity indicate invalid
  pending state and fail commit.

A create followed by delete is cancelled by the pending writer and should not
reach apply. If malformed state still reaches apply, it fails instead of
producing a no-operation result.

### 7.2 Generic system-ID targets

For normal entities:

```typescript
targetSystemId = row.targetSystemId;
tableName = row.targetTable;
```

CREATE payload fields become `values` after an optional `systemId` property is
checked for consistency with `targetSystemId` and removed. DELETE has no
values.

`fieldPath` is staging metadata and is not interpreted during apply. UPDATE
rows for the same target merge only when their sanitized payloads contain
disjoint persisted properties. Repeating a persisted property fails rather
than choosing one value silently.

Unknown payload properties fail unless they are non-persistent UseCase metadata.
All keys and values use TypeORM property names, not physical snake-case column
names.

### 7.3 Relationship rows with synthetic system IDs

Relationship tables that formerly relied on composite identities expose a
synthetic `systemId` and use the common `EntityBaseRow` columns. Each
relationship row is staged directly with its own `targetSystemId` and follows
the same generic reduction path as every other table:

```typescript
tableName = row.targetTable;
values = sanitized row.newValue;
```

The reducer does not expand virtual parent fields into relationship actions and
does not parse composite keys. A relationship CREATE, UPDATE, or DELETE is an
ordinary direct edit action. Natural-key uniqueness constraints remain the
database's responsibility.

### 7.4 UseCase handling

UseCase payloads may contain persistence-external metadata:

- `referencedComponents` is routing-owned metadata.
- `sgkvAssignments` is routing metadata that records the SGKV content selected
  during usecase creation.

Commit removes both fields without revalidating them. Direct `Sgkv` and
`SgkvValues` edit actions are reduced and applied independently by `systemId`.
Commit does not synthesize SGKV rows from UseCase metadata.

After metadata removal, a UseCase UPDATE must still contain at least one
persisted field. A metadata-only update is invalid; it is not a no-operation.

### 7.5 UseCase relationship staging

UseCase relationship rows remain independent edit actions. The repository does
not clear pending `UseCaseSubgraph`, `UseCaseSubgraphPair`, or
`UsecaseGkvValues` actions merely because a UseCase root action is created or
deleted. Apply reduces and tracks each selected edit-action row separately.

A UseCase delete stages the root DELETE only. The database foreign-key cascade
removes its committed `UsecaseGkvValues`, `UseCaseSubgraph`, and
`UseCaseSubgraphPair` rows. Any explicit relationship actions selected in the
same apply are executed according to the fixed table order and are cleaned up
only through their own `sourceEditActionIds`. UseCase creation or deletion does
not synthesize SGKV deletion.

The fixed executor creates a UseCase root before direct `UsecaseGkvValues`
CREATE actions.

### 7.6 No target-specific relationship expansion

Apply does not derive `SubsystemFilteredKey`, CKV/TKV value rows, SGKV value
rows, or any other relationship operations from fields on a parent edit action.
Those rows must be present as independent `edit_actions` records. A virtual
field that is not removed as documented for UseCase is not a valid persisted
payload property and fails commit.

### 7.7 Source coverage

Before execution, apply compares these sets:

```text
selected EditActionRow.changeId values
union of ReducedEditAction.sourceEditActionIds
```

The sets must be equal. Every reduced source ID must belong to the selected
session rows, and every selected row must contribute to at least one reduced
operation.

The selected IDs remain the authoritative cleanup list. Source IDs on reduced
actions provide traceability, validation context, and reduction coverage; they
are not persisted into permanent tables. With direct generic reduction, one
group produces one reduced action; multiple source IDs occur only when separate
staged rows update distinct fields of that same permanent row.

## 8. Fixed Domain and Table Execution

Execution is encoded as direct calls. There is no schedule object and no sort
by numeric phase, step, or sequence.

```typescript
async function executeReducedEditActionsInFixedOrder(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
): Promise<void> {
  // Direct family calls appear here in the exact order defined below.
}
```

The top-level execution function owns the complete action array. Family
functions select their matching table and operation actions, preserve the
reducer's order within that step, and call the low-level primitive once per
action:

```typescript
async function executeTableOperation(
  manager: EntityManager,
  action: ReducedEditAction,
): Promise<void>;
```

An empty family or table selection naturally executes zero iterations and is
ignored. A `ReducedEditAction` itself is never null.

Before the first write, execution validates that every reduced action belongs
to exactly one supported family/table-operation path and that its TypeORM
repository exists. During execution it records each executed action reference.
Before cleanup it verifies that every reduced action executed exactly once.

### 8.1 Runtime and data deletes

The first direct-call block executes:

1. `UsecaseGkvValues` DELETE;
2. `UseCaseSubgraph` DELETE;
3. `UseCaseSubgraphPair` DELETE;
4. `UseCase` DELETE;
5. `UseCaseCategory` DELETE;
6. `ModuleManagerData` DELETE;
7. `DkvValues`, `DkvParameterPayload`, `Dkv`, `DriverModule` DELETE;
8. `SubsystemDataLink`, `DataLink` DELETE;
9. `SubsystemControlLink`, `ControlLink` DELETE;
10. `ModuleTagIdMap`, `TkvValues`, `TkvParameterPayload`, `Tkv`,
    `CkvValues`, `CkvParameterPayload`, `Ckv`, `Intent`, `ControlPort`,
    `DataPort`, `SpfModulePropertiesData`, `SpfModule`, `Node` DELETE;
11. `ContainerPropertyData`, `Container` DELETE;
12. `VcpmParameterPayload`, `VcpmCkvValues`, `VcpmCkv`, `VcpmInstance`,
    `SgkvValues`, `Sgkv`, `SubgraphPropertyData`, `Subgraph` DELETE;
13. `SubsystemFilteredKey`, `Subsystem` DELETE.

The order is child/relationship before parent. Database cascades may remove
additional rows that do not have explicit staged actions.

### 8.2 Definition updates and creates

The second direct-call block executes:

1. `KeyDefinition` UPDATE, then CREATE;
2. `ValueDefinition` UPDATE, then CREATE;
3. `TagDefinition` UPDATE, then CREATE;
4. `ContainerProperty` UPDATE, then CREATE;
5. `ProcessorDefinition`, `ContainerType`, `SubgraphPropertyDefinition`,
   `VcpmModuleDefinition`, and `VcpmModuleParameterDefinition` UPDATE in that
   order, then CREATE in the same order;
6. the SPF definition family UPDATE in its registered parent-to-child order,
   then CREATE in the same parent-to-child order; and
7. `DriverModuleDefinition`, `DriverModuleParameterDefinition` UPDATE, then
   CREATE in parent-to-child order.

Definitions are created before runtime rows that reference them.

### 8.3 Runtime and data updates and creates

The third direct-call block executes:

1. SPF module-family UPDATE in the existing registered order;
2. `SubgraphPropertyData`, `Sgkv`, `VcpmInstance`, `VcpmCkv`, and
   `VcpmParameterPayload` UPDATE;
3. `DataLink`, `SubsystemDataLink`, `ControlLink`, and
   `SubsystemControlLink` UPDATE;
4. `Container`, `ContainerPropertyData` UPDATE;
5. the Subgraph family CREATE in registered parent-to-child order, including
   `SgkvValues` and `VcpmCkvValues`;
6. `Container`, `ContainerPropertyData` CREATE;
7. the SPF module family CREATE in registered parent-to-child order, including
   `CkvValues` and `TkvValues`;
8. `UseCase` UPDATE, then CREATE;
9. `DataLink`, `SubsystemDataLink` CREATE;
10. `ControlLink`, `SubsystemControlLink` CREATE;
11. `Subsystem` CREATE, then UPDATE;
12. `SubsystemFilteredKey` CREATE;
13. `Subgraph` UPDATE;
14. `UseCaseSubgraph` UPDATE, `UseCaseSubgraphPair` UPDATE,
    `UseCaseSubgraph` CREATE, `UseCaseSubgraphPair` CREATE,
    `UsecaseGkvValues` CREATE;
15. `UseCaseCategory` UPDATE, then CREATE;
16. `ModuleManagerData` UPDATE, then CREATE;
17. `DriverModule`, `Dkv`, `DkvParameterPayload` UPDATE, then
    `DriverModule`, `Dkv`, `DkvParameterPayload`, `DkvValues` CREATE.

### 8.4 Definition deletes

The final direct-call block executes:

1. `KeyDefinition` DELETE;
2. `ValueDefinition` DELETE;
3. `TagDefinition` DELETE;
4. `ContainerProperty` DELETE;
5. supporting definitions DELETE in registered child-to-parent order;
6. the SPF definition family DELETE in registered child-to-parent order; and
7. `DriverModuleParameterDefinition`, `DriverModuleDefinition` DELETE.

Definition deletes run last because runtime rows and child definitions may
still reference them. A commit that creates or retains a reference to a
definition being deleted fails validation or a database constraint and rolls
back.

## 9. Physical Execution

`executeTableOperation()` resolves the repository directly from
`action.tableName` and translates the existing edit operation:

```typescript
async function executeTableOperation(
  manager: EntityManager,
  action: ReducedEditAction,
): Promise<void> {
  const repository = manager.getRepository(action.tableName);

  switch (action.operation) {
    case CHANGE_OPERATION.Create:
      await repository.insert({
        systemId: action.targetSystemId,
        ...(action.values ?? {}),
      });
      return;

    case CHANGE_OPERATION.Update:
      await repository.update(
        {systemId: action.targetSystemId},
        action.values!,
      );
      return;

    case CHANGE_OPERATION.Delete:
      await repository.delete({systemId: action.targetSystemId});
      return;
  }
}
```

The reducer and pre-execution validation guarantee that UPDATE values exist,
DELETE values do not exist, keys match the configured identity, and `NONE`
cannot reach the switch.

`repository.save()` is not used. Each reduced action describes one explicit
physical operation; configured database cascades may add further effects.

## 10. Detailed Apply Execution Flow

The complete call path is:

```text
ApplyChangesHandler.handle()
  -> TypeOrmUnitOfWork.applyChanges()
  -> TypeOrmApplyChangesService.apply()
  -> ApplyEditActionReducer.reduce()
  -> executeReducedEditActionsInFixedOrder()
  -> TypeOrmSessionRepository.deleteStagedEditActionsByIds()
  -> ApplyChangesHandler.handle() commits the transaction
```

Every method in this path runs with the same transaction-bound
`EntityManager`. A thrown error returns control to `ApplyChangesHandler`, which
rolls the transaction back. Permanent-table writes, database cascades, and
edit-action cleanup therefore succeed or fail together.

### 10.1 `ApplyChangesHandler.handle()` and `TypeOrmUnitOfWork.applyChanges()`

| Method | Input | Processing | Output |
|---|---|---|---|
| `ApplyChangesHandler.handle(command)` | An `ApplyChangesCommand` and its transaction-capable `UnitOfWork`. The command carries no apply selection; the active session is already established by the request flow. | Starts the transaction, calls `uow.applyChanges()`, then commits. If any later method throws, it rolls back while the transaction is still active. | `Result.ok({})` after commit, or the original error after rollback. |
| `TypeOrmUnitOfWork.applyChanges()` | No explicit arguments. It uses its active query runner and `WriteContext`. | Creates `TypeOrmApplyChangesService` with the transaction manager, `EditActionsQueryService`, `ApplyEditActionReducer`, and `TypeOrmSessionRepository`, then calls `service.apply()`. | `Promise<void>` after the persistence flow completes. |

Neither method interprets an edit-action row or a `ReducedEditAction`. They
only establish the transaction and connect the core command to persistence.

### 10.2 `TypeOrmApplyChangesService.apply()` selects the work

**Input**

- `writeContext.session.sessionId` identifies the active edit session.
- `EditActionsQueryService` reads `EditActionRow` records.

**Processing**

1. Calls `editActions.query({sessionId, changeStatus: STAGED})`.
2. Rejects an empty result with `NO_STAGED_CHANGES`.
3. Extracts sorted, unique `changeId` values into `selectedChangeIds` and
   rejects duplicate IDs.
4. Passes the complete selected `EditActionRow[]` to
   `reducer.reduce(rows)`.

**Output**

The method does not return a value to its caller. Its working result is the
flat `ReducedEditAction[]` returned by the reducer, which becomes the input to
the fixed-order executor.

`UNSTAGED` rows are not selected, executed, counted, or deleted.

### 10.3 `ApplyEditActionReducer.reduce()` converts edit rows to actions

**Input**

```typescript
reduce(rows: readonly EditActionRow[]): Promise<readonly ReducedEditAction[]>
```

Each input row identifies a staged change through `changeId`, `targetTable`,
`targetSystemId`, `operation`, `newValue`, and `aggregateId`.

**Output**

```typescript
interface ReducedEditAction {
  tableName: EntityName;
  operation: CREATE | UPDATE | DELETE;
  targetSystemId: number;
  values?: Readonly<Record<string, unknown>>;
  sourceEditActionIds: readonly number[];
}
```

The reduced action is the executor contract:

| Field | Executor use |
|---|---|
| `tableName` | Selects the TypeORM repository and the fixed table-operation step. |
| `operation` | Selects `insert`, `update`, or `delete`. |
| `targetSystemId` | Identifies the permanent-table row. The executor converts it to `{systemId: targetSystemId}` for TypeORM. |
| `values` | Supplies persisted columns for CREATE or UPDATE. DELETE must omit it. |
| `sourceEditActionIds` | Connects the action to the staged rows it represents for coverage checks and cleanup traceability. |

#### `reduceRows(rows)`

**Input:** the selected `EditActionRow[]`.

**Processing:** creates a group key from
`targetTable + "|" + targetSystemId`. This creates exactly one group for one
row in one permanent table:

- same table and same system ID: rows are placed in the same group;
- same table and different system IDs: rows are separate groups; and
- different tables and the same system ID: rows are separate groups.

The method sorts the group keys for deterministic reducer output, while keeping
the input order of the rows inside each group. It calls
`reduceEditActionRows(group)` once for every group.

**Output:** one `ReducedEditAction` per group, after calling the reducer's
`validateSourceCoverage(rows, actions)` check.

#### `reduceEditActionRows(rows)`

**Input:** one non-empty group of `EditActionRow` records for the same
permanent-table row.

**Processing:**

1. Calls `validateEditActionGroup(rows, firstRow)`.
2. Carries `firstRow.targetSystemId` into the reduced action.
3. Collects the group's sorted unique `changeId` values into
   `sourceEditActionIds`.
4. Returns a DELETE action immediately when the shared operation is DELETE.
5. For CREATE and UPDATE, calls
   `mergeEditActionValues(rows, targetSystemId)` to merge
   persisted payload fields. An UPDATE with no persisted fields fails.

**Output:** one complete `ReducedEditAction` with the table, operation,
target system ID, optional values, and source IDs required by the executor.

#### `validateEditActionGroup(rows, firstRow)`

**Input:** the group and its first row, used as the common error context.

**Processing:**

1. Ensures every row has `CREATE`, `UPDATE`, or `DELETE`; `NONE` is rejected.
2. Calls `getPersistedPayload(row)` for every row to confirm the target table
   exposes `systemId` and that its payload contains only target-table columns.
3. Requires one operation across the complete group.
4. Requires DELETE rows to have no persisted values.

**Output:** no value. It either establishes that the group is safe to combine
or throws `COMMIT_VALIDATION_FAILED` before a permanent-table write occurs.
It does not verify graph state, target-row existence, or foreign-key
relationships; the database enforces those when the executor writes.

#### `getPersistedPayload(row)` and `sanitizePayload(row, payload, columns)`

**Input:** one edit row, its `newValue`, and the TypeORM column metadata for
the row's target table.

**Processing:** converts `newValue` to a record, obtains the target table's
column names, confirms that `systemId` is present, and removes the UseCase
routing-only fields `referencedComponents` and `sgkvAssignments`. It then
rejects any remaining property that is not a real target-table column.

**Output:** a new object containing only persisted columns. It is used by
`mergeEditActionValues()` and is never written back to `edit_actions`.

#### `mergeEditActionValues(rows, targetSystemId)`

**Input:** a CREATE or UPDATE group and its common `targetSystemId`.

**Processing:** reads each sanitized payload and combines disjoint fields into
one values object. A supplied `systemId` must equal the group's target ID. Repeating
the same persisted field in two source rows fails rather than choosing one
value silently.

**Output:** the merged `Record<string, unknown>` used as the reduced action's
`values` field.

#### `validateSourceCoverage(rows, actions)`

**Input:** all selected edit rows and all reduced actions.

**Processing:** compares the sorted unique input `changeId` set with the sorted
unique union of `actions[].sourceEditActionIds`.

**Output:** no value on equality; otherwise it throws. This prevents a staged
row being lost during grouping or reduction and later left behind after a
seemingly successful apply.

### 10.4 `TypeOrmApplyChangesService.validateSourceCoverage()` confirms the boundary

**Input:** `selectedChangeIds` captured before reduction and the reducer's
`ReducedEditAction[]` output.

**Processing:** repeats the source-ID set comparison at the service boundary.
The reducer check protects reduction itself; this check protects the cleanup
contract immediately before permanent-table execution.

**Output:** no value on complete coverage, otherwise
`COMMIT_VALIDATION_FAILED`. The selected IDs remain the authoritative cleanup
list because apply is all-or-nothing within one transaction.

### 10.5 `executeReducedEditActionsInFixedOrder()` applies the reduced actions

**Input**

```typescript
executeReducedEditActionsInFixedOrder(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
): Promise<void>
```

**Processing**

1. Calls `validateExecutableActions(manager, actions)`. It checks that every
   action has a supported fixed table-operation path, valid
   UPDATE and DELETE shapes, and an available TypeORM repository.
2. Creates one execution record for each action with an initial count of zero.
3. Calls the fixed table-family methods in this order:
   `executeRuntimeAndDataDeletes`,
   `executeDefinitionUpdatesAndCreates`,
   `executeRuntimeAndDataUpdatesAndCreates`, and
   `executeDefinitionDeletes`.
4. Verifies every execution record has a count of exactly one. Zero means no
   fixed table step accepted the action; more than one means a schedule error.

**Output:** `Promise<void>` after every reduced action has been applied exactly
once. The concrete table order is defined in Section 8.

#### Fixed family methods and `executeTableActions()`

Each family method receives the complete `ReducedEditAction[]` and the shared
execution records. It makes direct, table-specific calls to:

```typescript
executeTableActions(manager, actions, tableName, operation, records)
```

`executeTableActions()` filters `actions` for exactly that `tableName` and
operation. An empty match performs zero iterations, so optional table steps are
automatically skipped. For each match, it calls `executeTableOperation()` and
increments that action's execution count. The filtered array preserves reducer
order within a single table-operation step.

#### `executeTableOperation(manager, action)`

**Input:** TypeORM's transaction manager and one `ReducedEditAction`.

**Processing and output:** resolves `manager.getRepository(action.tableName)`
and performs exactly one physical write:

| `action.operation` | Physical call | Returned result |
|---|---|---|
| CREATE | `repository.insert({systemId: action.targetSystemId, ...action.values})` | `Promise<void>` after the insert completes. |
| UPDATE | `repository.update({systemId: action.targetSystemId}, action.values)` | `Promise<void>` after the update completes. |
| DELETE | `repository.delete({systemId: action.targetSystemId})` | `Promise<void>` after the delete completes. |

Database foreign keys, uniqueness rules, and cascades apply during these
writes. A TypeORM or database failure aborts execution and causes rollback.

### 10.6 Cleanup and commit

After `executeReducedEditActionsInFixedOrder()` returns successfully,
**`TypeOrmApplyChangesService.apply()`** performs cleanup:

1. Calls `deleteStagedEditActionsByIds(sessionId, selectedChangeIds)`.
   Its input is the same session ID and complete selection captured before
   reduction. It deletes only rows that are still `STAGED` in that session.
2. Requires the returned deleted-row count to equal
   `selectedChangeIds.length`.
3. Calls `countStagedChangesForSession(sessionId)` and requires zero remaining
   staged rows.

The service then returns `void`. Only then does
**`ApplyChangesHandler.handle()`** call `uow.commit()` and return `200 {}`.

## 11. Discard Flow

Discard does not reduce or execute permanent-table actions.

```typescript
class TypeOrmDiscardChangesService {
  async discard(): Promise<void> {
    const sessionId = this.writeContext.session.sessionId;
    await this.sessionRepository.deleteAllEditActionsForSession(sessionId);
  }
}
```

The deletion has no status, source, target, aggregate, or operation filter. An
empty result is successful. The handler commits the deletion transaction and
returns `{}`.

Discard does not modify permanent tables or entity versions.

## 12. Errors

| Condition | HTTP/code behavior |
|---|---|
| No staged rows | `422 NO_STAGED_CHANGES` |
| Unsupported table or `NONE` operation | `422 COMMIT_VALIDATION_FAILED` |
| Target without `systemId`, malformed payload, or unknown persisted property | `422 COMMIT_VALIDATION_FAILED` |
| Mixed operations for one permanent row | `422 COMMIT_VALIDATION_FAILED` |
| Overlapping fields, unknown fields, or empty UPDATE | `422 COMMIT_VALIDATION_FAILED` |
| Unmapped source row or unexecuted reduced action | `422 COMMIT_VALIDATION_FAILED` before cleanup; transaction rollback after any write |
| Cleanup count mismatch or staged rows remaining | Internal persistence failure and full rollback |
| TypeORM/database failure | Existing persistence error mapping and full rollback |

Validation errors include `targetTable` and `targetSystemId`. IDs in structured
logs follow the existing hex logging convention.

## 13. Testing

### 13.1 Reducer unit tests

- CREATE, UPDATE, and DELETE for normal system-ID tables.
- Multiple disjoint UPDATE rows merging into one action.
- CREATE and UPDATE payloads with disjoint persisted properties.
- Overlapping fields and mixed operations rejected.
- Aggregate mismatch and unknown payload fields rejected.
- `NONE` rejected.
- Direct synthetic-system-ID relationship rows use the generic reduction path.
- UseCase metadata stripped from physical values.
- UseCase metadata is ignored during permanent-table reduction.
- Selected/source change-ID coverage, including many source rows merged into
  one permanent-table action.

### 13.2 Fixed execution tests

- Every supported table-operation path appears in the direct call sequence.
- Empty family and table selections are skipped.
- Multiple actions for one table-operation preserve reducer output order.
- Each reduced action executes exactly once.
- Relationship-before-parent delete order.
- Definition-before-runtime create order.
- Parent-before-child create and child-before-parent delete order within SPF,
  Subgraph, Driver, and supporting-definition families.
- Definition deletes execute last.

### 13.3 Persistence integration tests

- Commit applies every staged row and preserves unstaged rows.
- Exact selected IDs are deleted after success.
- Cleanup mismatch rolls back permanent writes.
- A later write failure rolls back earlier explicit and cascaded writes.
- Synthetic-system-ID relationship rows are applied by the generic reducer.
- Committed UseCase subgraph relationship deletes execute before root delete.
- Discard clears all session rows and leaves permanent tables unchanged.
- Empty discard succeeds.

### 13.4 API tests

- Commit returns `200 {}`.
- Empty commit returns `422 NO_STAGED_CHANGES`.
- Invalid reduction returns `422 COMMIT_VALIDATION_FAILED`.
- Discard returns `200 {}` for populated and empty sessions.
- Active-session and project guards continue to apply.
- Request DTOs do not expose selective `changeIds`.

## 14. Out of Scope

- Partial commit or selective discard.
- Caller-supplied commit messages.
- Optimistic entity-version enforcement.
- Runtime dependency graphs or topological sorting.
- Aggregate completeness validation.
- Automatic synthesis of missing aggregate children or relationships.
- SGKV creation or deletion derived from UseCase metadata.
- Undo/redo and restore-point behavior.
- Bulk optimization of consecutive table operations.

## 15. Acceptance Criteria

The design is implemented when:

1. both endpoints use CQRS handlers and handler-owned transactions;
2. commit applies all and only staged rows from the active session;
3. reduction emits only flat `ReducedEditAction` objects;
4. every selected source row is represented by reduced source IDs;
5. fixed domain-family and physical-table calls replace the old schedule;
6. every reduced action executes exactly once in the documented order;
7. exact cleanup is atomic with permanent writes;
8. discard clears the complete active edit session atomically;
9. the API returns the agreed empty success body and validation errors; and
10. unit, integration, E2E, build, and lint checks pass.
