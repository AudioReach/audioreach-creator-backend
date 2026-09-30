# Aggregate Apply-Changes Framework: Low-Level Design

**Date:** 2026-09-30
**Status:** Approved design, revised for persistence ownership

Requirements: [aggregate-apply-changes-requirements.md](./aggregate-apply-changes-requirements.md)

## 1. Purpose

This design applies the current staged edit actions from the active session to
the permanent SQLite tables.

V1 is deliberately limited to staged-action processing. It does not reconstruct
or validate a complete aggregate. Persistence reduces actions into physical
operations, assigns each operation to the existing fixed phase, step, and
sequence, and executes the result in one transaction.

## 2. Design Decisions

1. Only edit actions with `valid_until IS NULL` and `changeStatus = STAGED`
   participate in apply.
2. Core owns transaction orchestration and invokes
   `UnitOfWork.applyChanges()`; it does not interpret edit actions or physical
   operations.
3. Persistence owns physical identity resolution and operation reduction.
4. Composite or otherwise exceptional targets require dedicated persistence
   identity configuration.
5. The existing `edit_actions` schema is retained.
6. Every supported entity-operation pair has one authoritative fixed
   `(phase, step, sequence)`. Persistence does not build a runtime dependency
   graph or perform topological sorting.
7. Missing aggregate children and relationships are neither generated nor
   rejected in v1.
8. Existing database cascade and restrict behavior remains authoritative.
9. Optimistic version checking is not part of v1.
10. The command handler owns transaction commit and rollback.
11. Apply deletes selected action slots and matching older history after writes
    and commit recording succeed, before the transaction commits.
12. Discard hard-deletes every edit-action row for the active session and does
    not modify permanent tables or commit records.
13. The six source-defined merge phases are fixed; target names do not define
    execution order.
14. `UnitOfWork.applyChanges()` updates permanent tables, records the session
    commit, and cleans consumed edit actions before returning to the handler.
15. Future validation runs after `UnitOfWork.applyChanges()` and before commit.
    Validation failure rolls back permanent writes, commit recording, and
    edit-action cleanup.

## 3. Architecture and Package Boundaries

```text
packages/core
  ApplyChangesCommand / ApplyChangesHandler
  DiscardChangesCommand / DiscardChangesHandler
  UnitOfWork.applyChanges() / UnitOfWork.discardChanges()
  Result<ApplyChangesSummary> / Result<DiscardChangesSummary>

packages/infrastructure/persistence
  TypeOrmApplyChangesService
  TypeOrmDiscardChangesService
  EditActionRow -> PendingApplyAction mapper
  ApplyReductionRegistry
    generic EntityReductionRule entries
    composite-identity EntityReductionRule entries
  MainTableRowIdentity
  MainTableEntityWriteOperation
  ApplyExecutionSchedule
  ApplyTargetRegistry
  TypeOrmSessionRepository
  EditActionsQueryService
  PendingChangeWriter
  TypeOrmOperationExecutor
```

Dependencies continue to point inward:

- core exposes apply and discard through the existing `UnitOfWork` interface but
  has no edit-action mapping, operation-reduction, target-registry, or
  execution-order model;
- persistence maps each selected `edit_actions` row one-to-one into a
  `PendingApplyAction`, groups those values by `entityName`, and dispatches each
  entity group through `ApplyReductionRegistry`;
- each `EntityReductionRule` derives `MainTableRowIdentity` values, folds
  actions for the same permanent row, and emits final
  `MainTableEntityWriteOperation` values;
- persistence assigns and sorts by the fixed phase, step, and sequence,
  executes the operations, records the commit, and performs cleanup;
- the API layer only dispatches the command and maps the result or error.

### 3.1 Planned responsibilities

| Layer | Component | Responsibility |
|---|---|---|
| Core | `ApplyChangesHandler` | Start the transaction, invoke `UnitOfWork.applyChanges()`, reserve the post-apply validation point, commit or roll back, and wrap successful output in `Result.ok()`. |
| Core | `DiscardChangesHandler` | Own the discard transaction, invoke `UnitOfWork.discardChanges()`, and wrap successful output in `Result.ok()`. |
| Core | `UnitOfWork` | Expose transaction control and the transaction-bound apply and discard instructions without physical persistence details. |
| Persistence | `TypeOrmApplyChangesService` | Read candidates, map them one-to-one, dispatch entity reduction, order and execute final operations, record the commit, and delete selected action history. |
| Persistence | Edit-action mapper | Convert each selected `EditActionRow` into exactly one `PendingApplyAction` without combining rows or loading permanent data. |
| Persistence | `PendingApplyAction` | Preserve one selected edit row's aggregate ownership, entity name, target ID, operation, field path, and payload until reduction. |
| Persistence | `ApplyReductionRegistry` | Map each supported `entityName` to its `EntityReductionRule`. |
| Persistence | `EntityReductionRule` | Validate supported operations, derive `MainTableRowIdentity`, group actions for the same permanent row, validate consistent aggregate ownership, and reduce them to final write operations. |
| Persistence | `MainTableRowIdentity` | Identify one existing or intended permanent-table row using the entity name and its complete system-ID or composite identifier. It does not contain loaded row data. |
| Persistence | `MainTableEntityWriteOperation` | Carry the final reduced create, update, or delete and its values for one main-table row. |
| Persistence | `ApplyExecutionSchedule` | Assign the authoritative phase, step, and sequence to each supported target and operation. |
| Persistence | `ApplyTargetRegistry` | Map `MainTableRowIdentity.entityName` to TypeORM entity metadata and value sanitization. It remains separate for this refactor and may be simplified later. |
| Persistence | `TypeOrmDiscardChangesService` | Delete every edit-action row for the active session. |
| Persistence | `EditActionsQueryService` | Read only current edit actions with explicit status filtering. |
| Persistence | `PendingChangeWriter` | Create and supersede table-qualified action slots. |
| Persistence | `TypeOrmOperationExecutor` | Execute prepared physical operations through the QueryRunner-bound EntityManager. |
| Persistence | `TypeOrmSessionRepository` | Own session lifecycle, commit recording, and transactional edit-action deletion methods. |

There is no `ImpactCompletionService`, aggregate completeness validator, or
version validator in this design.

### 3.2 File placement

- Commands, handlers, and success results:
  `packages/core/src/application/edit-session/apply-changes/` and
  `packages/core/src/application/edit-session/discard-changes/`.
- Existing transaction-bound apply and discard instructions:
  `packages/core/src/application/ports/persistence/unit-of-work.ts`.
- The edit-action mapper, `PendingApplyAction`, `MainTableRowIdentity`,
  `MainTableEntityWriteOperation`, `EntityReductionRule` implementations,
  reduction registry, fixed schedule, target registry, TypeORM orchestration,
  and physical execution:
  `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/services/apply-changes/`.
- Commit recording and edit-action cleanup methods remain persistence-internal;
  they are not part of core's `ISessionRepository` contract.

The command handler must also be added to the manual command-handler registry,
and `UnitOfWork` plus its TypeORM implementation must expose `applyChanges()`
and `discardChanges()`.

## 4. Apply and Discard Contracts

Apply and discard are transaction-bound instructions on the existing core
`UnitOfWork` interface. The persistence implementations use the same
QueryRunner-bound session repository for commit recording and edit-action
deletion.

```typescript
export type ApplyChangesSummary = {
  commitId: number;
  appliedEntityCount: number;
  appliedAggregateCount: number;
};

export type DiscardChangesSummary = {
  discardedEditActionCount: number;
};

export interface UnitOfWork {
  // Existing transaction methods are omitted from this excerpt.
  applyChanges(): Promise<ApplyChangesSummary>;
  discardChanges(): Promise<DiscardChangesSummary>;
}
```

The active session ID is obtained from the `UnitOfWork` write context by each
persistence service. Neither command accepts an arbitrary session ID, an
aggregate subset, selective change IDs, or a caller-supplied commit message.

The TypeORM `UnitOfWork` implementation delegates these methods to
persistence-internal apply and discard implementations bound to the same
QueryRunner used by the command handler. Persistence repositories remain hidden
from the core handlers.

### 4.1 HTTP endpoints

The existing project endpoints expose the two commands:

| Endpoint | Command | Request body | Behavior |
|---|---|---|---|
| `POST /arc-api/v1/projects/:projectId/commit-changes` | `ApplyChangesCommand` | Empty object | Applies every current staged action in the active session. |
| `POST /arc-api/v1/projects/:projectId/discard-changes` | `DiscardChangesCommand` | Empty object | Deletes every edit-action row in the active session. |

The request DTOs intentionally contain no `changeIds`, aggregate filter, target
filter, or commit-message field. The active session is resolved by the normal
project session guard.

## 5. CQRS and Transaction Flow

`ApplyChangesCommand` and `DiscardChangesCommand` extend `BaseCommand` and
require an active session. Both handlers are registered manually in
`CommandHandlerRegistry`.

```typescript
async function handleApplyChanges(
  uow: UnitOfWork,
): Promise<Result<ApplyChangesSummary>> {
  await uow.startTransaction();

  try {
    const summary = await uow.applyChanges();

    // TODO: await validatePostApplyState(uow). Validation observes the
    // transaction's resulting permanent state and fails through this catch.

    await uow.commit();
    return Result.ok(summary);
  } catch (error) {
    if (uow.isInTransaction()) {
      await uow.rollback();
    }
    throw error;
  }
}
```

`handleDiscardChanges` follows the same structure, invokes
`uow.discardChanges()`, commits, and returns
`Result.ok(discardChangesSummary)`.

`Result<T>` remains the core application outcome envelope. Persistence returns
the successful `ApplyChangesSummary` or `DiscardChangesSummary`; each handler
creates `Result.ok(summary)` only after its transaction commits. Expected
command failures continue to throw typed exceptions and therefore cannot be
mistaken for successful or partial results.

`TypeOrmApplyChangesService.apply()` completes permanent writes,
schema-defined cascades, commit recording, and apply cleanup before returning.
Future validation then observes the post-apply state in the same transaction.
If validation fails, rollback restores permanent tables, the session commit,
and edit-action rows. Discard uses the same transaction pattern but only deletes
edit-action rows. No collaborator commits or rolls back independently.

## 6. Persistence Operation-Reduction Model

### 6.1 Edit-action input

`ChangeOperation` is the existing shared operation vocabulary:

```typescript
export const CHANGE_OPERATION = {
  None: 'NONE',
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;

export type ChangeOperation =
  (typeof CHANGE_OPERATION)[keyof typeof CHANGE_OPERATION];
```

It describes change intent; it is not an action or reduction-result object.
`NONE` is used by other application flows to describe the absence of a pending
change. It is not a valid operation for a selected apply candidate.

Persistence maps each selected `EditActionRow` to a persistence-internal value.
Each `PendingApplyAction` represents exactly one selected edit-session row. It
is a transient in-memory object, not a new database row or TypeORM schema. The
mapping copies only the row fields needed by operation reduction after the
query has selected current staged rows; it does not resolve physical identity
or describe the final database write. The mapper rejects `NONE` and narrows the
operation before constructing this value.

```typescript
// Persistence-internal object mapped from a current staged EditActionRow.
// It is never persisted back to the edit_actions table.
type PendingApplyAction = {
  aggregateId: number;
  // Canonical persistence entity name mapped from EditActionRow.targetTable.
  entityName: string;
  targetSystemId: number;
  operation: Exclude<ChangeOperation, typeof CHANGE_OPERATION.None>;
  fieldPath: string | null;
  newValue: Readonly<Record<string, unknown>>;
};
```

`entityName` is the canonical persistence name stored in `targetTable`. The
mapping is one-to-one: one selected `EditActionRow` produces one
`PendingApplyAction`, and no two edit rows are combined during this step.

The purpose of `PendingApplyAction` is to preserve the source action's
aggregate ownership, entity, operation, field path, and payload until
entity-specific reduction runs. It does not identify a main-table row for every
target shape and is not directly executable.

### 6.2 Reduction output

Reduction returns a persistence-internal physical operation containing the
target entity, its row identifier, and only the values required by the selected
operation. The physical target identity is derived from `edit_actions`; it is
not stored back into that table.

```typescript
type SystemIdRowIdentifier = {
  kind: 'SYSTEM_ID';
  values: {
    systemId: number;
  };
};

type CompositeRowIdentifier = {
  kind: 'COMPOSITE';
  values: Readonly<Record<string, string | number | boolean>>;
};

type RowIdentifier = SystemIdRowIdentifier | CompositeRowIdentifier;

type MainTableRowIdentity = {
  // Persistence catalogue token, not a TypeORM class.
  entityName: string;
  rowIdentifier: RowIdentifier;
};

type MainTableEntityWriteOperation =
  | {
      aggregateId: number;
      target: MainTableRowIdentity;
      operation: typeof CHANGE_OPERATION.Create;
      values?: Readonly<Record<string, unknown>>;
    }
  | {
      aggregateId: number;
      target: MainTableRowIdentity;
      operation: typeof CHANGE_OPERATION.Update;
      changes: Readonly<Record<string, unknown>>;
    }
  | {
      aggregateId: number;
      target: MainTableRowIdentity;
      operation: typeof CHANGE_OPERATION.Delete;
    };

interface EntityReductionRule {
  readonly allowedOperations: readonly PendingApplyAction['operation'][];

  /**
   * Receives all selected PendingApplyAction values for one entity name.
   *
   * The rule derives a MainTableRowIdentity for each action, groups actions
   * for the same permanent row, validates that each row group has one
   * aggregateId, and folds its operation sequence and column changes.
   *
   * It returns at most one final operation per MainTableRowIdentity. A valid
   * create/delete sequence may return no operation for that row.
   *
   * This method does not assign execution order, execute SQL, record the
   * commit, or clean edit-session rows.
   */
  reduceToMainTableWriteOperations(
    actions: readonly PendingApplyAction[],
  ): Result<readonly MainTableEntityWriteOperation[]>;
}

type ApplyReductionRegistry = ReadonlyMap<string, EntityReductionRule>;

function reducePendingActions(
  actions: readonly PendingApplyAction[],
  registry: ApplyReductionRegistry,
): Result<readonly MainTableEntityWriteOperation[]>;
```

`SystemIdRowIdentifier` is used for generic targets. A
`CompositeRowIdentifier` contains every physical key field required by its
registered target. Natural IDs appear only when they are part of that target's
physical database identity.

`MainTableRowIdentity` identifies one row in a permanent entity table. The
`entityName` selects the table metadata, and `rowIdentifier` provides the full
system-ID or composite key. It does not contain the row's non-key column values
and does not imply that the row has been loaded. For create, it identifies the
row to be inserted; for update or delete, it identifies the existing row.

When grouping or deterministic sorting needs a scalar key, persistence computes
one temporarily from `MainTableRowIdentity`, ordering composite key names
deterministically. The computed key is not stored in the operation model.

`MainTableEntityWriteOperation` does not carry edit-action cleanup identity or
an execution order. `TypeOrmApplyChangesService` captures `ApplyActionSlot`
values from the selected rows before mapping. Each `EntityReductionRule`
deterministically orders its `PendingApplyAction` values by their mapped slot
fields before folding them. A create operation omits `values` when the row
consists only of its identifier columns, as with a pure composite junction. The
`operation` member still records that creating the identified row is the
requested change; identifier fields are not duplicated inside `values`.

`MainTableEntityWriteOperation` is the final executable reduction result. It
combines the main-table row identity with the effective create, update, or
delete and its final values. Multiple pending actions for one row may produce
one operation, and a create/delete pair may produce no operation. One aggregate
may therefore be represented by zero, one, or many final operations.

There is no public identity-resolution step or normalized-action wrapper. Each
`EntityReductionRule` privately derives `MainTableRowIdentity` values, groups
its `PendingApplyAction` rows by those identities, verifies that one physical
row is not associated with conflicting aggregate IDs, and emits the final
operations.

The complete persistence data flow is:

```text
EditActionRow
  -> PendingApplyAction
  -> group by entityName
  -> reduce physical rows inside each EntityReductionRule
  -> MainTableEntityWriteOperation
  -> order the same MainTableEntityWriteOperation objects
  -> execute
```

In `PendingApplyAction`, `operation` is the operation recorded by one
edit-session row. In `MainTableEntityWriteOperation`, `operation` is the
effective operation remaining after all rows for the same main-table identity
have been folded. The discriminated union permits only create, update, or
delete.

Apply-specific error codes, factories, and validation messages belong to
persistence. An invalid edit-row operation fails during mapping before
reduction begins. Core treats a rejected `UnitOfWork.applyChanges()` promise as
an opaque failure and performs rollback.

A reduced operation is scoped to one physical row in one table. For example,
two staged field updates for `SpfModule(50)` fold into one `SpfModule`
operation. A staged update for `SpfModule(51)` remains a second operation even
though it targets the same table. This preserves row-specific identity.

### 6.3 Reduction registry behavior

The registry is an explicit, deterministic entity-name dispatch map. It does
not reduce actions itself; its value is the rule that performs reduction for
that entity.

```typescript
const applyReductionRegistry: ApplyReductionRegistry = new Map([
  [
    'SpfModule',
    createSystemIdReductionRule({
      entityName: 'SpfModule',
      allowedOperations: [
        CHANGE_OPERATION.Create,
        CHANGE_OPERATION.Update,
        CHANGE_OPERATION.Delete,
      ],
    }),
  ],
  [
    'SgkvValues',
    createCompositeValueReductionRule({
      entityName: 'SgkvValues',
      parentKey: 'sgkvSystemId',
      allowedOperations: [
        CHANGE_OPERATION.Create,
        CHANGE_OPERATION.Delete,
      ],
    }),
  ],
]);
```

The registry shall not use generic reduction as an unrestricted fallback. A
target is accepted only when its `entityName` has an explicit entry. Generic
system-ID entities may share a rule factory, and composite entities may share a
composite rule factory. An unregistered target fails before permanent writes
begin.

`ApplyReductionRegistry`, `ApplyExecutionSchedule`, and `ApplyTargetRegistry`
are separate persistence components:

- `ApplyReductionRegistry` dispatches each entity group to an
  `EntityReductionRule` that owns identity derivation, supported-operation
  validation, payload interpretation, and physical-row reduction.
- `ApplyExecutionSchedule` provides the complete fixed phase, step, and
  sequence for each supported entity-operation pair.
- `ApplyTargetRegistry` maps a reduced `target.entityName` token to its TypeORM
  entity target and value sanitizer. It remains unchanged for now and may be
  simplified later.

Keeping these responsibilities separate prevents operation reduction,
execution ordering, and TypeORM metadata from becoming one undifferentiated
registry while allowing the persistence composition root to build all three
from one target inventory.

### 6.4 Generic system-ID reduction

For an allowlisted generic target:

- the action slot is `(entityName, targetSystemId, fieldPath)`;
- the physical target identity uses the registered entity and
  `{kind: 'SYSTEM_ID', values: {systemId: targetSystemId}}`;
- actions are grouped by a temporary key computed from that identity so
  separate field slots fold together;
- updates combine the current field deltas deterministically;
- a terminal delete suppresses earlier updates;
- create followed by delete produces no physical operation;
- create, update, and delete operations use that same row identifier.

Reduction does not load the permanent row. The executor later uses
`rowIdentifier.values` as the insert identity or the update/delete criteria.

The reduced operations for a generic `SpfModule` target are:

```typescript
const createOperation: MainTableEntityWriteOperation = {
  aggregateId: 120,
  target: {
    entityName: 'SpfModule',
    rowIdentifier: {
      kind: 'SYSTEM_ID',
      values: {systemId: 120},
    },
  },
  operation: CHANGE_OPERATION.Create,
  values: {
    alias: 'module-a',
    containerSystemId: 30,
    subgraphSystemId: 40,
  },
};

const updateOperation: MainTableEntityWriteOperation = {
  aggregateId: 120,
  target: {
    entityName: 'SpfModule',
    rowIdentifier: {
      kind: 'SYSTEM_ID',
      values: {systemId: 120},
    },
  },
  operation: CHANGE_OPERATION.Update,
  changes: {alias: 'new-module-name'},
};

const deleteOperation: MainTableEntityWriteOperation = {
  aggregateId: 120,
  target: {
    entityName: 'SpfModule',
    rowIdentifier: {
      kind: 'SYSTEM_ID',
      values: {systemId: 120},
    },
  },
  operation: CHANGE_OPERATION.Delete,
};
```

The corresponding persistence operations are:

```typescript
await repository.insert({
  ...createOperation.target.rowIdentifier.values,
  ...(createOperation.values ?? {}),
});

await repository.update(
  updateOperation.target.rowIdentifier.values,
  updateOperation.changes,
);

await repository.delete(deleteOperation.target.rowIdentifier.values);
```

The `systemId` remains exclusively in the row identifier. Create values and
update changes shall not repeat or modify it.

### 6.5 Special-target identity contract

A special persistence configuration defines the meaning of `targetSystemId`,
the canonical action slot, required payload fields, and final row identifier for
its target.

The initial composite-value configurations use this contract:

| Target | `targetSystemId` anchor | Required key field in `newValue` | Composite row identifier |
|---|---|---|---|
| `UsecaseGkvValues` | `usecaseSystemId` | `valueDefSystemId` | `{usecaseSystemId, valueDefSystemId}` |
| `CkvValues` | `ckvSystemId` | `valueDefSystemId` | `{ckvSystemId, valueDefSystemId}` |
| `TkvValues` | `tkvSystemId` | `valueDefSystemId` | `{tkvSystemId, valueDefSystemId}` |
| `SgkvValues` | `sgkvSystemId` | `valueDefSystemId` | `{sgkvSystemId, valueDefSystemId}` |
| `DkvValues` | `dkvSystemId` | `valueDefSystemId` | `{dkvSystemId, valueDefSystemId}` |
| `VcpmCkvValues` | `vcpmCkvSystemId` | `valueDefSystemId` | `{vcpmCkvSystemId, valueDefSystemId}` |

For these configurations:

- the canonical `fieldPath` slot includes the secondary key, for example
  `$key:valueDefSystemId=300`;
- `newValue` carries all key fields for create and delete actions;
- reduction validates that the slot and payload describe the same key;
- the composite row identifier contains both physical key components;
- actions are grouped by a temporary key computed from the physical target
  identity;
- a delete operation retains both components in its row identifier.

These composite value relationship targets support `CREATE` and `DELETE` only.
An `UPDATE` action is invalid because the relationship row has no independent
mutable payload in v1.

`PendingChangeWriter` shall allow a special configuration or repository adapter
to provide the canonical field-path slot and identity payload. This avoids a
schema change while allowing multiple composite rows under the same anchor ID.

### 6.6 Junction-table targets

A junction row is a physical target when an edit repository writes it. The
reduction configuration follows its identity:

- a junction with a `systemId`, such as `UseCaseSubgraph` or
  `UseCaseSubgraphPair`, uses generic system-ID reduction;
- a junction with only a composite identity requires dedicated persistence
  identity configuration whose canonical field path and row identifier contain
  every key column;
- an unregistered junction target is rejected before physical writes begin.

Apply does not derive junction changes from parent aggregate changes and does
not synthesize missing relationship rows. The fixed execution sequence orders
staged relationship creates and deletes around their staged endpoints; schema
cascades may remove additional junction rows when a parent is deleted.

A pure composite junction reduces directly to a
`MainTableEntityWriteOperation` without an additional values object:

```typescript
{
  aggregateId: 10,
  target: {
    entityName: 'UseCaseSubgraph',
    rowIdentifier: {
      kind: 'COMPOSITE',
      values: {usecaseSystemId: 10, subgraphSystemId: 20},
    },
  },
  operation: CHANGE_OPERATION.Create,
}
```

A junction with a surrogate `systemId` uses that value as its row identifier.
Its endpoint foreign keys remain create values or mutable changes rather than
being duplicated into the row identifier.

## 7. Action Selection and Reduction

### 7.1 Selection

The apply reader performs one explicit query:

```typescript
const rows = await editActionsQueryService.query({
  sessionId,
  changeStatus: CHANGE_STATUS.Staged,
});
```

`EditActionsQueryService` already applies `validUntil IS NULL`. Apply must not
load both statuses and filter them after reduction.

### 7.2 Entity-grouped reduction

```typescript
function reducePendingActions(
  actions: readonly PendingApplyAction[],
  registry: ApplyReductionRegistry,
): Result<readonly MainTableEntityWriteOperation[]> {
  const entityGroups = groupBy(actions, action => action.entityName);
  const operations: MainTableEntityWriteOperation[] = [];

  for (const [entityName, entityActions] of sortGroupsByKey(entityGroups)) {
    const rule = registry.get(entityName);
    if (rule === undefined) {
      return Result.fail(unsupportedApplyTargetIssue(entityName));
    }

    const result = rule.reduceToMainTableWriteOperations(
      sortPendingActionsDeterministically(entityActions),
    );

    if (result.kind === RESULT_KIND.Fail) {
      return Result.fail<readonly MainTableEntityWriteOperation[]>(
        ...result.issues,
      );
    }

    operations.push(...result.data);
  }

  return Result.ok(operations);
}
```

The top-level reduction groups only by `entityName` so
`ApplyReductionRegistry` can dispatch one complete entity action set to the
appropriate `EntityReductionRule`. The rule groups actions by derived
`MainTableRowIdentity` and folds them into zero or one operation per physical
row. `aggregateId` is retained on the source actions and final operations for
ownership checks, logging, and summary counts; it is not a reduction grouping
level.

The reduction result does not carry edit-action IDs. The persistence service
keeps the table-qualified action slots from the selected rows. After successful
physical writes and commit recording, it deletes those slots and their older
history rows in the same transaction. This also cleans actions that folded
together or reduced to no physical operation.

The resulting `MainTableEntityWriteOperation[]` is passed directly to the
execution-order stage in Section 8. No additional write-operation model is
created between reduction and scheduling.

The executor may later batch consecutive compatible operations for the same
table as a performance optimization, provided it preserves the scheduled order,
row-specific identity, and failure behavior. Batching does not change the
one-row-per-operation contract.

## 8. Execution Order

Immediately after reduction creates `MainTableEntityWriteOperation[]`,
persistence first verifies that every operation has target metadata and a
predefined phase, step, and sequence. Ordering is a direct sort by that complete
tuple followed by a deterministic main-table row identity tie-breaker.

The ordering stage does not inspect relationships, load a complete aggregate,
create missing operations, build graph indexes, or perform topological sorting.
All validation and sorting finish before the first permanent write.

```typescript
/**
 * Applies the complete fixed phase/step/sequence order, then a deterministic
 * row-identity tie-breaker for rows sharing one entity-operation entry.
 */
function orderPersistenceOperations(
  operations: readonly MainTableEntityWriteOperation[],
  schedule: ApplyExecutionSchedule,
): readonly MainTableEntityWriteOperation[];
```

Ordering does not create another operation representation. The schedule is a
lookup used to return the same `MainTableEntityWriteOperation` objects in
executable order.

### 8.1 Staged operation preservation

After reduction for the same physical target, persistence retains every
operation produced from a current staged action.

A staged aggregate-root delete does not remove a staged create, update, or
delete for another target in the same aggregate. The aggregate ID is ownership,
logging, and summary context, not a reduction group or execution barrier. The
ordering function does not inspect unstaged actions or require actions for
children that will be affected by database cascade.

### 8.2 Fixed merge schedule

`ApplyExecutionSchedule` assigns every supported
`(target.entityName, operation)` pair an execution order consisting of a
phase, step, and sequence. The schedule is the complete execution plan and uses
the exact existing order below:

| Phase | Step | Fixed sequence |
|---|---:|---|
| Miscellaneous deletes | 1 | `UsecaseGkvValues` delete; `UseCaseSubgraph` delete; `UseCaseSubgraphPair` delete; `UseCase` delete |
| Miscellaneous deletes | 2 | `UseCaseCategory` delete |
| Miscellaneous deletes | 3 | `ModuleManagerData` delete |
| Miscellaneous deletes | 4 | `DkvValues`; `DkvParameterPayload`; `Dkv`; `DriverModule` deletes |
| Graph and runtime deletes | 1 | `SubsystemDataLink`; `DataLink` deletes |
| Graph and runtime deletes | 2 | `SubsystemControlLink`; `ControlLink` deletes |
| Graph and runtime deletes | 3 | `ModuleTagIdMap`; `TkvValues`; `TkvParameterPayload`; `Tkv`; `CkvValues`; `CkvParameterPayload`; `Ckv`; `Intent`; `ControlPort`; `DataPort`; `SpfModulePropertiesData`; `SpfModule`; `Node` deletes |
| Graph and runtime deletes | 4 | `ContainerPropertyData`; `Container` deletes |
| Graph and runtime deletes | 5 | `VcpmParameterPayload`; `VcpmCkvValues`; `VcpmCkv`; `VcpmInstance`; `SgkvValues`; `Sgkv`; `SubgraphPropertyData`; `Subgraph` deletes |
| Graph and runtime deletes | 6 | `Subsystem` delete |
| Definition updates and creates | 1 | `KeyDefinition` update; create |
| Definition updates and creates | 2 | `ValueDefinition` update; create |
| Definition updates and creates | 3 | `TagDefinition` update; create |
| Definition updates and creates | 4 | `ContainerProperty` update; create |
| Definition updates and creates | 5 | `ProcessorDefinition`, `ContainerType`, `SubgraphPropertyDefinition`, `VcpmModuleDefinition`, `VcpmModuleParameterDefinition` updates; then creates in the same order |
| Definition updates and creates | 6 | SPF definition-family updates in parent-to-child order; then creates in parent-to-child order |
| Definition updates and creates | 7 | `DriverModuleDefinition`, `DriverModuleParameterDefinition` updates; then creates in parent-to-child order |
| Graph and runtime updates and creates | 1 | SPF module-family updates in registered order |
| Graph and runtime updates and creates | 2 | `SubgraphPropertyData`, `Sgkv`, `VcpmInstance`, `VcpmCkv`, `VcpmParameterPayload` updates |
| Graph and runtime updates and creates | 3 | `DataLink`, `SubsystemDataLink`, `ControlLink`, `SubsystemControlLink` updates |
| Graph and runtime updates and creates | 4 | `Container`, `ContainerPropertyData` updates |
| Graph and runtime updates and creates | 5 | Subgraph-family creates in registered parent-to-child order, including `SgkvValues` and `VcpmCkvValues` |
| Graph and runtime updates and creates | 6 | `Container`, `ContainerPropertyData` creates |
| Graph and runtime updates and creates | 7 | SPF module-family creates in registered parent-to-child order, including `CkvValues` and `TkvValues` |
| Graph and runtime updates and creates | 8 | `UseCase` update; create |
| Graph and runtime updates and creates | 9 | `DataLink`; `SubsystemDataLink` creates |
| Graph and runtime updates and creates | 10 | `ControlLink`; `SubsystemControlLink` creates |
| Graph and runtime updates and creates | 11 | `Subsystem` create; update |
| Graph and runtime updates and creates | 12 | `Subgraph` update |
| Graph and runtime updates and creates | 13 | `UseCaseSubgraph` update; `UseCaseSubgraphPair` update; `UseCaseSubgraph` create; `UseCaseSubgraphPair` create; `UsecaseGkvValues` create |
| Miscellaneous updates and creates | 1 | `UseCaseCategory` update; create |
| Miscellaneous updates and creates | 2 | `ModuleManagerData` update; create |
| Miscellaneous updates and creates | 3 | `DriverModule`, `Dkv`, `DkvParameterPayload` updates; then `DriverModule`, `Dkv`, `DkvParameterPayload`, `DkvValues` creates |
| Definition deletes | 1 | `KeyDefinition` delete |
| Definition deletes | 2 | `ValueDefinition` delete |
| Definition deletes | 3 | `TagDefinition` delete |
| Definition deletes | 4 | `ContainerProperty` delete |
| Definition deletes | 5 | Supporting-definition deletes in registered child-to-parent order |
| Definition deletes | 6 | SPF definition-family deletes in registered child-to-parent order |
| Definition deletes | 7 | `DriverModuleParameterDefinition`; `DriverModuleDefinition` deletes |

The six phases execute in the table order. Steps within a phase also execute in
the table order. Empty phases and steps are skipped without changing the order
of the remaining staged operations. `Sgkv` and `SgkvValues` are runtime targets;
`SgkvValues` uses its composite identity configuration but is not placed in the
definition phase.

A table row that names an entity family uses an explicit sequence in the
persistence catalogue. For example, SPF module creates use `Node`,
`SpfModule`, `SpfModulePropertiesData`, `DataPort`, `ControlPort`, `Intent`,
`Ckv`, `CkvParameterPayload`, `CkvValues`, `Tkv`, `TkvParameterPayload`,
`TkvValues`, and `ModuleTagIdMap`. Deletes use the registered child-first
reverse relationship order, ending with `SpfModule` and then `Node`.

Within miscellaneous-delete step 1, the sequence orders staged
`UsecaseGkvValues`, `UseCaseSubgraph`, and `UseCaseSubgraphPair` deletes before
the staged `UseCase` root delete. The following miscellaneous-delete steps then
process `UseCaseCategory`, `ModuleManagerData`, and the Driver module-data
family in that order.

Concepts without a registered backend target do not create placeholder
operations. A newly supported target must be assigned an execution order before
its reduction and target metadata can be registered.

### 8.3 Catalogue invariants

The persistence target inventory builds three separate lookups:

1. `ApplyReductionRegistry` for entity-specific reduction;
2. `ApplyExecutionSchedule` for fixed ordering;
3. `ApplyTargetRegistry` for TypeORM metadata.

Every supported entity must have matching entries in all required lookups, and
every supported operation must have one schedule entry. A missing schedule or
target entry fails before the first permanent write. Adding a new entity or
operation therefore requires an explicit catalogue update and ordering choice.

No runtime relationship discovery is performed. Parent-before-child create and
child-before-parent delete behavior is represented directly by sequence values.
Unstaged or absent related rows are not added to the operation list; their
existence and referential correctness remain the responsibility of the current
database state and constraints.

### 8.4 Deterministic sort

The ordering function compares operations in this order:

1. `phase`;
2. `step`;
3. `sequence`;
4. the deterministic key computed from `target.entityName` and
   `target.rowIdentifier`.

The fourth comparison orders multiple physical rows that share one
entity-operation schedule entry. It does not change parent/child ordering,
which is already encoded by `sequence`.

## 9. TypeORM Execution

`TypeOrmApplyChangesService` passes each ordered operation to the shared
`TypeOrmOperationExecutor`. The executor uses repositories through the
QueryRunner-bound `EntityManager`, so every operation participates in the
handler-owned apply transaction. A later optimization may replace consecutive
compatible operations with a query builder or justified raw SQL while
preserving the same fixed order and transaction boundary.

`TypeOrmOperationExecutor` is an internal primitive for prepared single-row
operations. It is not the owner of ordering and is not exposed through
`UnitOfWork` or core's session repository contract.

```typescript
class TypeOrmOperationExecutor {
  // The manager belongs to the current UnitOfWork/QueryRunner transaction.
  constructor(private readonly manager: EntityManager) {}

  // Execute one reduced operation after its fixed execution order has been
  // selected by the persistence scheduler.
  async execute(operation: MainTableEntityWriteOperation): Promise<void> {
    const repository = this.getRepository(operation.target.entityName);
    const executor = OPERATION_EXECUTORS.get(operation.operation);
    if (executor === undefined) throw new Error('Unsupported operation');
    await executor(repository, operation);
  }
}
```

`OPERATION_EXECUTORS` is a map from the operation vocabulary to the three
physical write functions. Unsupported operations fail before a write.

The executor:

- maps only registered `target.entityName` values to TypeORM entity schemas;
- is called once for each scheduled operation, in execution order;
- does not start, commit, or roll back a transaction;
- does not inspect edit-session status, field paths, aggregate completeness, or
  versions;
- uses `target.rowIdentifier.values` as the TypeORM `where` object for updates
  and deletes;
- applies `changes` as the update-set values;
- combines `target.rowIdentifier.values` with `values ?? {}` for inserts;
- allows configured database cascades and restrictions to execute normally.

`repository.save(aggregate)` is not used. The ordered list contains explicit
physical operations, while additional physical changes may occur through
database cascades. The persistence service may use query builders or raw SQL
when a bulk or composite operation is materially clearer or more efficient.

## 10. End-to-End Orchestration

```typescript
class TypeOrmApplyChangesService {
  async apply(): Promise<ApplyChangesSummary> {
    const sessionId = this.writeContext.session.sessionId;
    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });

    // Keep table-qualified slots for cleanup before persistence reduction.
    const cleanupSlots = uniqueActionSlots(rows);
    const actions = rows.map(mapEditActionRow);
    const reductionResult = reducePendingActions(
      actions,
      this.reductionRegistry,
    );
    if (reductionResult.kind === RESULT_KIND.Fail) {
      throw persistenceIssueToException(reductionResult.issues);
    }
    const operations = reductionResult.data;

    // Validate TypeORM targets before the first permanent write.
    this.operationExecutor.validateOperations(operations);

    // Apply the hardcoded phase, step, and sequence, then use row identity as
    // the deterministic tie-breaker for rows sharing one schedule entry.
    const orderedOperations = orderPersistenceOperations(
      operations,
      this.executionSchedule,
    );

    // Execute each prepared main-table row write in fixed order.
    for (const operation of orderedOperations) {
      await this.operationExecutor.execute(operation);
    }

    const commitId = await this.recordCommit({
      sessionId,
      changeCount: orderedOperations.length,
    });

    // Hard-delete selected slots and their older versions before the handler
    // commits. A cleanup failure must roll back the complete apply.
    await this.sessionRepository.deleteAppliedActionHistory(
      sessionId,
      cleanupSlots,
    );

    return {
      commitId,
      appliedEntityCount: orderedOperations.length,
      appliedAggregateCount: countDistinctAggregateIds(orderedOperations),
    };
  }
}
```

The service does not reread actions after cleanup and does not read or clean
`session_entity_versions`. When future post-apply validation is added, it runs
in core after this method returns and before the handler commits. A validation
failure rolls back every change made by this method.

## 11. Module Property Definition Handling

`ModulePropertyDefinition` remains registered in the
`SpfModuleDefinition` aggregate family and definition ordering group.

`SpfModulePropertiesData` remains owned by its module and references the module
property definition. V1 does not load every consumer or reject a definition
delete before execution. The current TypeORM relationship behavior, including
its configured cascade, executes inside the apply transaction.

Any future semantic rule that requires consumer validation belongs to the
separate post-apply validation service, not persistence operation reduction or
the executor.

## 12. Session Commit and Cleanup

Apply captures the selected edit-action slots before reduction:

```typescript
type ApplyActionSlot = {
  targetTable: string;
  targetSystemId: number;
  fieldPath: string | null;
};
```

Together with the active `sessionId`, the canonical slot identity is
`(sessionId, targetTable, targetSystemId, fieldPath)`. `targetTable` is required
because different entities can share the same numeric target ID and field path.
Current-row lookup, supersession, and the database uniqueness constraints
already use this table-qualified identity.

`ApplyActionSlot` is separate from `MainTableRowIdentity`. The former identifies
source rows that must be cleaned from `edit_actions`; the latter identifies the
permanent row to write. Cleanup uses the captured slots because several actions
may fold into one operation and create/delete reduction may produce no
operation at all.

The apply and discard persistence services use internal transaction-bound
operations equivalent to:

```typescript
recordCommit(input: {
  sessionId: number;
  changeCount: number;
}): Promise<number>;

deleteAppliedActionHistory(
  sessionId: number,
  slots: readonly ApplyActionSlot[],
): Promise<number>;

deleteAllEditActions(sessionId: number): Promise<number>;
```

These methods are not part of core's `ISessionRepository`. Core handlers access
the persistence workflows only through `UnitOfWork.applyChanges()` and
`UnitOfWork.discardChanges()`.

`deleteAppliedActionHistory` hard-deletes each selected
`(targetTable, targetSystemId, fieldPath)` slot and its older rows where
`validUntil IS NOT NULL`. This includes actions folded into another operation
and actions eliminated by create-then-delete reduction. It does not remove
current unstaged actions or stale history for unrelated slots.

`deleteAllEditActions` hard-deletes every edit-action row for the active session,
regardless of status, source, or `validUntil`. It is used only by discard.

No version rows are read, compared, or cleaned in v1.

`TypeOrmDiscardChangesService.discard()` calls `deleteAllEditActions(sessionId)`
through the transaction-bound session repository. It does not inspect operation,
status, source, or history state. The discard handler commits only after that
deletion succeeds; otherwise the handler rolls it back.

## 13. Error Model

The apply path uses persistence-owned typed errors, operational codes, and issue
factories. Failures carry the action and target context available at the
failure point.

| Error category | Trigger |
|---|---|
| Unsupported target | No `ApplyReductionRegistry` entry exists for the action's `entityName`. |
| Invalid action | Operation, field path, or payload does not satisfy persistence reduction. |
| Invalid special key | A required composite-key field is absent or conflicts with the canonical slot. |
| Invalid target metadata | A reduced operation has no execution-schedule or `ApplyTargetRegistry` entry. |
| Persistence failure | TypeORM or SQLite rejects a prepared operation. |
| Commit/cleanup failure | Commit recording or applied-action cleanup fails. |

`UnitOfWork.applyChanges()` rejects with a typed persistence error. The core
handler does not reinterpret it; it rolls back and rethrows for API exception
mapping. Logs include `target.entityName`, `aggregateId`, and entity IDs in
hexadecimal where applicable.

## 14. Tests

### 14.1 Current-action selection and slot isolation

- Verify stale and current `UNSTAGED` actions do not produce operations.
- Verify current staged action slots and matching history are deleted only after
  successful writes and commit recording.
- Verify `SpfModule(50)` and `Node(50)` accumulator actions remain independent.
- Verify lookup and supersession include `targetTable`.

### 14.2 Persistence reduction and special identity

- Verify every selected `EditActionRow` maps to exactly one
  `PendingApplyAction` without loading permanent data.
- Verify entity-name grouping dispatches all actions for one entity to the same
  registered `EntityReductionRule`.
- Verify an `EntityReductionRule` groups actions by `MainTableRowIdentity` and
  emits at most one `MainTableEntityWriteOperation` per permanent row.
- Verify conflicting `aggregateId` values for one main-table row fail before
  any permanent write.
- For each initial composite-value configuration, verify all key components are
  required.
- Verify two values under the same anchor produce separate canonical slots.
- Verify create and delete operations contain complete row identifiers.
- Verify composite value relationship `UPDATE` actions fail before any permanent
  write.
- Verify an unregistered special target fails before any permanent write.
- Verify missing execution-schedule or `ApplyTargetRegistry` metadata fails
  before any permanent write.

### 14.3 Persistence execution ordering

- Verify each entity-operation pair is assigned to its predefined phase, step,
  and sequence.
- Verify a missing child or relationship action does not cause completeness
  rejection and is not synthesized.
- Verify a staged root delete retains staged owned-child creates, updates, and
  deletes and orders them before the root delete.
- Verify the six execution phases and their registered steps run in the defined
  order when all groups contain staged operations.
- Verify miscellaneous deletes run before graph/runtime deletes.
- Verify `Sgkv` and `SgkvValues` remain in the graph/runtime family rather than
  the definition family.
- Verify create/delete reduction can remove a root operation while preserving an
  independently staged child delete in the same aggregate.
- Verify empty phases and steps are skipped without reordering later groups.
- Verify a missing schedule entry fails before any permanent write.
- Verify sequence values enforce parent-before-child creates and
  child-before-parent deletes.
- Verify deterministic row-identity ordering for operations sharing one
  entity-operation schedule entry.

### 14.4 Transaction rollback and cascades

- Verify a schema-defined cascade occurs when its staged parent delete executes.
- Force a later operation failure and verify the parent delete and cascade roll
  back.
- Verify no commit row is retained and no action is cleaned after rollback.
- Verify retry reads the same current staged actions.

### 14.5 Discard

- Verify discard deletes current and stale actions from every source and status.
- Verify discard leaves permanent tables, `session_commits`, and
  `session_entity_versions` unchanged.
- Verify a discard failure rolls back the action deletion.

### 14.6 Layer ownership

- Keep a focused core unit test for transaction start,
  `UnitOfWork.applyChanges()` invocation, the post-apply validation position,
  commit, and rollback.
- Place operation-reduction, identity, and fixed phase/step/sequence tests in
  the persistence unit suite.
- Cover the complete core-to-persistence workflow through API E2E tests.

## 15. Requirements Traceability

| Requirement group | Design sections |
|---|---|
| FR-EDIT-01..07 | Sections 6, 7, 10, 12 |
| FR-RULE-01..04 | Sections 3, 6, 9, 10 |
| FR-AGG-01..04 | Sections 6, 8, 11 |
| FR-PLAN-01..06 | Section 8 |
| FR-APPLY-01..07 | Sections 5, 9, 10, 12, 13 |
| FR-DISCARD-01..03 | Sections 4, 5, 12, 14.5 |
| I1..I10 | Sections 5 through 13 |
| NFR-APPLY-01..05 | Sections 3, 6, 7, 8, 9, 13, 14 |

## 16. Future Validation Service Boundary

Aggregate completeness, ownership correctness, reverse-dependency analysis,
shared-reference safety, and optimistic concurrency are future work.

That work shall be specified as a separate service with its own requirements.
When integrated, core invokes it after `UnitOfWork.applyChanges()` returns and
before commit. It validates the transaction's post-apply permanent state. A
validation failure rolls back explicit writes, database cascades, the session
commit record, and edit-action cleanup. It shall not mutate edit actions to
repair the staged projection unless a later requirement explicitly adds that
behavior.
