# Aggregate Apply-Changes Framework: Low-Level Design

**Date:** 2026-10-06
**Status:** Approved design, revised for direct `EditActionRow` reduction

Requirements: [aggregate-apply-changes-requirements.md](./aggregate-apply-changes-requirements.md)

This document uses the target refactored symbol names. Source files that still
use the previous operation-oriented names must be renamed when this design is
implemented.

## 1. Purpose

This design applies the current staged edit actions from the active session to
the permanent SQLite tables.

V1 is deliberately limited to staged-action processing. It does not reconstruct
or validate a complete aggregate. Persistence reduces actions into permanent-row
mutations, assigns each mutation to the existing fixed phase, step, and
sequence, and executes the result in one transaction.

## 2. Design Decisions

1. Only edit actions with `valid_until IS NULL` and `changeStatus = STAGED`
   participate in apply.
2. Core owns transaction orchestration and invokes
   `UnitOfWork.applyChanges()`; it does not interpret edit actions or physical
   operations.
3. Persistence owns physical identity resolution and mutation reduction.
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
11. Apply retains the selected `EditActionRow[]` and deletes those exact source
    rows plus matching older history after writes and commit recording succeed,
    before the transaction commits.
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
  ApplyOperationReducer
  ApplyReductionRegistry
    generic EntityReductionRule entries
    composite-identity EntityReductionRule entries
  MainTableRowIdentity
  ReducedMainTableMutation
  ApplyExecutionSchedule
  ApplyTargetRegistry
  TypeOrmSessionRepository
  EditActionsQueryService
  PendingChangeWriter
  TypeOrmMutationExecutor
```

Dependencies continue to point inward:

- core exposes apply and discard through the existing `UnitOfWork` interface but
  has no edit-action interpretation, mutation-reduction, target-registry, or
  execution-order model;
- persistence retains the selected `EditActionRow[]`, groups the same row
  objects by `targetTable`, and dispatches each table group through
  `ApplyOperationReducer`;
- each `EntityReductionRule` derives `MainTableRowIdentity` values, folds
  selected rows for the same permanent row, and emits final
  `ReducedMainTableMutation` values;
- persistence assigns and sorts by the fixed phase, step, and sequence,
  executes the mutations, records the commit, and performs cleanup;
- the API layer only dispatches the command and maps the result or error.

### 3.1 Planned responsibilities

| Layer | Component | Responsibility |
|---|---|---|
| Core | `ApplyChangesHandler` | Start the transaction, invoke `UnitOfWork.applyChanges()`, reserve the post-apply validation point, commit or roll back, and wrap successful output in `Result.ok()`. |
| Core | `DiscardChangesHandler` | Own the discard transaction, invoke `UnitOfWork.discardChanges()`, and wrap successful output in `Result.ok()`. |
| Core | `UnitOfWork` | Expose transaction control and the transaction-bound apply and discard instructions without physical persistence details. |
| Persistence | `TypeOrmApplyChangesService` | Read and retain candidates, invoke reduction, validate and order the resulting mutations, execute them, record the commit, and clean the retained source rows and matching history. |
| Persistence | `ApplyOperationReducer` | Group selected rows by `targetTable`, obtain the registered rule for each table, and combine the rule outputs. The registry is injected through the constructor. |
| Persistence | `ApplyReductionRegistry` | Map each supported `EditActionRow.targetTable` to its `EntityReductionRule`. |
| Persistence | `EntityReductionRule` | For one target table, validate the fields it consumes, derive `MainTableRowIdentity`, group selected rows for the same permanent row, validate consistent aggregate ownership, and reduce them to final mutations. |
| Persistence | `MainTableRowIdentity` | Identify one existing or intended permanent-table row using the entity name and its complete system-ID or composite identifier. It does not contain loaded row data. |
| Persistence | `ReducedMainTableMutation` | Carry the not-yet-executed create, update, or delete and final values for one permanent row after all staged rows for that identity have been folded. |
| Persistence | `ApplyExecutionSchedule` | Assign the authoritative phase, step, and sequence to each supported target and operation. |
| Persistence | `ApplyTargetRegistry` | Map `MainTableRowIdentity.entityName` to TypeORM entity metadata and value sanitization. It remains separate for this refactor and may be simplified later. |
| Persistence | `TypeOrmDiscardChangesService` | Delete every edit-action row for the active session. |
| Persistence | `EditActionsQueryService` | Read only current edit actions with explicit status filtering. |
| Persistence | `PendingChangeWriter` | Create and supersede table-qualified action slots. |
| Persistence | `TypeOrmMutationExecutor` | Validate target metadata and execute reduced mutations through the QueryRunner-bound EntityManager. |
| Persistence | `TypeOrmSessionRepository` | Own session lifecycle, commit recording, and transactional edit-action deletion methods. |

There is no `ImpactCompletionService`, aggregate completeness validator, or
version validator in this design.

### 3.2 File placement

- Commands, handlers, and success results:
  `packages/core/src/application/edit-session/apply-changes/` and
  `packages/core/src/application/edit-session/discard-changes/`.
- Existing transaction-bound apply and discard instructions:
  `packages/core/src/application/ports/persistence/unit-of-work.ts`.
- `ApplyOperationReducer`, `MainTableRowIdentity`,
  `ReducedMainTableMutation`, `EntityReductionRule` implementations,
  reduction registry, fixed schedule, target registry, TypeORM orchestration,
  and physical execution:
  `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/services/apply-changes/`.
- The refactor replaces the one-row projection mapper and free reduction
  function with `apply-operation-reducer.ts`. Validation is performed inside
  the entity rule that consumes each field. The obsolete projected-row and
  cleanup-slot types are removed from `apply-changes.types.ts`.
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

type ApplyChangeOperation = Exclude<
  ChangeOperation,
  typeof CHANGE_OPERATION.None
>;
```

It describes change intent; it is not an action or reduction-result object.
`NONE` is used by other application flows to describe the absence of a pending
change. It is not a valid operation tag for a selected apply candidate.

#### 6.1.1 Source operation assignment

The operation stored in `edit_actions.operation` is assigned when the change is
staged, before the apply pipeline starts. Apply does not infer this operation
from `newValue`, the permanent table, or the current existence of a row.

Aggregate edit repositories choose the writer instruction that represents the
requested change. `PendingChangeWriter` stamps the corresponding operation on
the new `EditActionRow`:

| Staging instruction | Stored operation | Meaning |
|---|---|---|
| `writeCreate(...)` | `CHANGE_OPERATION.Create` | The target row is intended to be inserted when the session is applied. |
| `writeDelta(...)` or `writeDeltaBatch(...)` | `CHANGE_OPERATION.Update` | One or more fields of an existing or session-created target are being changed. |
| `writeDelete(...)` | `CHANGE_OPERATION.Delete` | The target row is intended to be removed when the session is applied. |

The writer may supersede an older current edit row for the same action slot,
but the newly inserted row receives the operation selected by the writer method.
`NONE` is not written by these staging instructions; it represents the absence
of a pending change in read-side models.

Example:

```text
Module repository calls writeDelta({targetTable: SpfModule, targetSystemId: 50,
                                  delta: {alias: "Voice"}, ...})
  -> PendingChangeWriter inserts EditActionRow.operation = UPDATE
  -> apply selects that row
  -> the SpfModule rule validates UPDATE when it consumes the row
  -> the rule combines it with other rows for systemId=50
```

There are three distinct operation-related stages:

1. **Source operation**: `EditActionRow.operation`, assigned by
   `PendingChangeWriter` during staging.
2. **Effective operation**: `ReducedMainTableMutation.operation`, produced
   by an entity reduction rule after combining source rows for one permanent
   row. For example, create plus updates remains `CREATE`, updates alone become
   `UPDATE`, delete suppresses updates, and create plus delete produces no
   permanent mutation.
3. **Execution position**: `ApplyExecutionSchedule` looks up the final
   `entityName + effective operation` pair and assigns its fixed phase, step,
   and sequence. These ordering values are not stored in `edit_actions`.

Persistence retains the exact `EditActionRow[]` returned by the current-staged
query. The same row objects are used by reduction and later cleanup. There is no
one-to-one reducer-input projection, no standalone selected-row validator, and
no renamed `entityName` property at this stage. Reduction dispatches using
`EditActionRow.targetTable`.

Validation is local to the `EntityReductionRule` that understands the target.
While deriving identity and folding a row, that rule validates only the fields
it consumes:

- `targetTable` must match the registered rule;
- `operation` must be supported by that rule, so `NONE` is rejected there;
- fields used to derive `MainTableRowIdentity` must be present and valid;
- `fieldPath` must match the target's canonical slot format when the target
  uses one;
- `newValue` must contain the payload fields required by that operation and
  target. A malformed required payload is rejected rather than replaced with
  `{}`.

The original row retains every field throughout the pipeline:

- reduction reads `aggregateId`, `targetTable`, `targetSystemId`, `operation`,
  `fieldPath`, and `newValue`;
- cleanup reads `changeId`, `targetTable`, `targetSystemId`, and `fieldPath`;
- persistence-only fields such as `sessionId`, status, source, and timestamps
  remain on the object but are ignored by reduction.

### 6.2 Reduction output

Reduction returns a persistence-internal mutation containing the
target entity, its row identifier, and only the values required by the selected
operation tag. The physical target identity is derived from `edit_actions`; it is
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

type ReducedMainTableMutation =
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
  /**
   * Receives all selected EditActionRow values for one targetTable.
   *
   * For each row, the rule validates the target, operation, identity fields,
   * canonical field path, and payload fields required by this target. It then
   * derives MainTableRowIdentity, groups rows for the same permanent row,
   * validates one aggregateId per group, and folds operations and values.
   *
   * It returns at most one reduced mutation per MainTableRowIdentity. A valid
   * create/delete sequence may return no mutation for that row.
   *
   * This method does not assign execution order, execute SQL, record the
   * commit, or clean edit-session rows.
   */
  reduceToMainTableMutations(
    rows: readonly EditActionRow[],
  ): Result<readonly ReducedMainTableMutation[]>;
}

type ApplyReductionRegistry = ReadonlyMap<string, EntityReductionRule>;

declare class ApplyOperationReducer {
  constructor(registry: ApplyReductionRegistry);
  reduce(
    rows: readonly EditActionRow[],
  ): Result<readonly ReducedMainTableMutation[]>;
}
```

The name `ReducedMainTableMutation` describes its exact lifecycle position:

| Question | Answer |
|---|---|
| Is it another selected edit row? | No. Several `EditActionRow` values may be folded into one mutation. |
| Is it a group object? | No. The row group is temporary inside the rule; the mutation is the group's final decision. |
| Has SQL already run? | No. It is data passed next to metadata validation, ordering, and execution. |
| What does one object represent? | Exactly one intended create, update, or delete against one permanent-table row. |
| Why not execute the reduced rows directly? | Rows still describe individual staged changes and may be incomplete or contradictory when viewed alone. The mutation contains the complete row identity, effective operation, and merged values required by the executor. |

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
deterministically. The computed key is not stored in the mutation model.

`ReducedMainTableMutation` does not carry edit-action cleanup identity or
an execution order. `TypeOrmApplyChangesService` retains the selected
`EditActionRow[]` separately from the reduced mutation list. Each
`EntityReductionRule` deterministically orders its selected rows by
`targetSystemId`, `fieldPath`, operation, and payload before folding them. A
create operation omits `values` when the row
consists only of its identifier columns, as with a pure composite junction. The
`operation` member still records that creating the identified row is the
requested change; identifier fields are not duplicated inside `values`.

`ReducedMainTableMutation` is the final, not-yet-executed reduction result. It
combines the main-table row identity with the effective create, update, or
delete and its final values. Multiple selected edit rows for one permanent row
may produce one mutation, and a create/delete pair may produce no mutation.
One aggregate may therefore be represented by zero, one, or many final
mutations.

There is no public identity-resolution step or normalized-action wrapper. Each
`EntityReductionRule` privately derives `MainTableRowIdentity` values, groups
its selected `EditActionRow` values by those identities, verifies that one
physical row is not associated with conflicting aggregate IDs, and emits the
final mutations.

The complete persistence data flow is:

```text
selected EditActionRow[]
  -> group by targetTable
  -> validate, derive identity, group, and fold inside each EntityReductionRule
  -> ReducedMainTableMutation
  -> order the same ReducedMainTableMutation objects
  -> execute
```

In `EditActionRow`, `operation` is the operation recorded by one edit-session
row. In `ReducedMainTableMutation`, `operation` is the effective operation
remaining after all rows for the same main-table identity have been folded. The
discriminated union permits only create, update, or delete.

Apply-specific error codes, factories, and validation messages belong to
persistence. An invalid edit-row operation, identity, field path, or required
payload fails inside its entity rule before any permanent write begins. Core
treats a rejected
`UnitOfWork.applyChanges()` promise as an opaque failure and performs rollback.

A reduced mutation is scoped to one physical row in one table. For example,
two staged field updates for `SpfModule(50)` fold into one `SpfModule`
mutation. A staged update for `SpfModule(51)` remains a second mutation even
though it targets the same table. This preserves row-specific identity.

### 6.3 Reduction registry behavior

The registry is an explicit, deterministic `targetTable` dispatch map. It does
not reduce rows itself; its value is the rule that performs reduction for that
table.

```typescript
const applyReductionRegistry: ApplyReductionRegistry = new Map([
  [
    'SpfModule',
    new SystemIdEntityReductionRule('SpfModule'),
  ],
  [
    'SgkvValues',
    new CompositeValueEntityReductionRule({
      entityName: 'SgkvValues',
      parentKey: 'sgkvSystemId',
    }),
  ],
]);
```

The registry shall not use generic reduction as an unrestricted fallback. A
target is accepted only when its `targetTable` has an explicit entry. Generic
system-ID entities may share a rule factory, and composite entities may share a
composite rule factory. An unregistered target fails before permanent writes
begin.

`ApplyReductionRegistry`, `ApplyExecutionSchedule`, and `ApplyTargetRegistry`
are separate persistence components:

- `ApplyReductionRegistry` dispatches each target-table group to an
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

- the logical edit slot is `(targetTable, targetSystemId, fieldPath)`;
- the physical target identity uses the registered entity and
  `{kind: 'SYSTEM_ID', values: {systemId: targetSystemId}}`;
- selected rows are grouped by a temporary key computed from that identity so
  separate field slots fold together;
- updates combine the current field deltas deterministically;
- a terminal delete suppresses earlier updates;
- create followed by delete produces no physical mutation;
- create, update, and delete mutations use that same row identifier.

Reduction does not load the permanent row. The executor later uses
`rowIdentifier.values` as the insert identity or the update/delete criteria.

The reduced mutations for a generic `SpfModule` target are:

```typescript
const createMutation: ReducedMainTableMutation = {
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

const updateMutation: ReducedMainTableMutation = {
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

const deleteMutation: ReducedMainTableMutation = {
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

The corresponding persistence calls are:

```typescript
await repository.insert({
  ...createMutation.target.rowIdentifier.values,
  ...(createMutation.values ?? {}),
});

await repository.update(
  updateMutation.target.rowIdentifier.values,
  updateMutation.changes,
);

await repository.delete(deleteMutation.target.rowIdentifier.values);
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
- selected rows are grouped by a temporary key computed from the physical target
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
`ReducedMainTableMutation` without an additional values object:

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

The returned `rows` array is retained unchanged until apply completes.
Consequently:

- `rows` is the reducer input;
- each entity rule validates the fields it reads from those rows;
- `rows` remains available while permanent mutations execute;
- `rows` is the cleanup input after commit recording succeeds.

### 7.2 Target-table-grouped reduction

```typescript
class ApplyOperationReducer {
  constructor(private readonly registry: ApplyReductionRegistry) {}

  reduce(
    rows: readonly EditActionRow[],
  ): Result<readonly ReducedMainTableMutation[]> {
    const tableGroups = groupBy(rows, row => row.targetTable);
    const mutations: ReducedMainTableMutation[] = [];

    for (const [targetTable, tableRows] of sortGroupsByKey(tableGroups)) {
      const rule = this.registry.get(targetTable);
      if (rule === undefined) {
        return Result.fail(unsupportedApplyTargetIssue(targetTable));
      }

      const result = rule.reduceToMainTableMutations(
        sortEditActionRowsDeterministically(tableRows),
      );

      if (result.kind === RESULT_KIND.Fail) {
        return Result.fail<readonly ReducedMainTableMutation[]>(
          ...result.issues,
        );
      }

      mutations.push(...result.data);
    }

    return Result.ok(mutations);
  }
}
```

The registry is constructor-injected because it is stable configuration for the
reducer, not data that varies for each call. The caller therefore supplies only
the selected rows. This keeps the reducer interface small while retaining the
entity-specific dispatch behavior internally.

Top-level reduction groups only by `EditActionRow.targetTable` so the registry
can dispatch one complete table row set to the appropriate
`EntityReductionRule`. The rule groups those rows by derived
`MainTableRowIdentity` and folds them into zero or one mutation per physical
row. `aggregateId` remains on the source rows and final mutations for ownership
checks, logging, and summary counts; it is not a reduction grouping level.

The reduction result does not carry edit-action IDs. The persistence service
keeps the selected `EditActionRow[]` itself. After successful physical writes
and commit recording, it deletes the exact selected current rows by `changeId`
and deletes older history using each row's table-qualified logical slot. This
also cleans rows that folded together or reduced to no physical mutation.

The resulting `ReducedMainTableMutation[]` is passed directly to the
execution-order stage in Section 8. No additional write-mutation model is
created between reduction and scheduling.

The executor may later batch consecutive compatible mutations for the same
table as a performance optimization, provided it preserves the scheduled order,
row-specific identity, and failure behavior. Batching does not change the
one-row-per-mutation contract.

## 8. Execution Order

Immediately after reduction creates `ReducedMainTableMutation[]`,
persistence first verifies that every mutation has target metadata and a
predefined phase, step, and sequence. Ordering is a direct sort by that complete
tuple followed by a deterministic main-table row identity tie-breaker.

The ordering stage does not inspect relationships, load a complete aggregate,
create missing mutations, build graph indexes, or perform topological sorting.
All validation and sorting finish before the first permanent write.

```typescript
/**
 * Applies the complete fixed phase/step/sequence order, then a deterministic
 * row-identity tie-breaker for rows sharing one entity-operation entry.
 */
function orderMainTableMutations(
  mutations: readonly ReducedMainTableMutation[],
  schedule: ApplyExecutionSchedule,
): readonly ReducedMainTableMutation[];
```

Ordering does not create another mutation representation. The schedule is a
lookup used to return the same `ReducedMainTableMutation` objects in
executable order.

### 8.1 Staged operation preservation

After reduction for the same physical target, persistence retains every
mutation produced from current staged actions.

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
mutations. A newly supported target must be assigned an execution order before
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
Unstaged or absent related rows are not added to the mutation list; their
existence and referential correctness remain the responsibility of the current
database state and constraints.

### 8.4 Deterministic sort

The ordering function compares mutations in this order:

1. `phase`;
2. `step`;
3. `sequence`;
4. the deterministic key computed from `target.entityName` and
   `target.rowIdentifier`.

The fourth comparison orders multiple physical rows that share one
entity-operation schedule entry. It does not change parent/child ordering,
which is already encoded by `sequence`.

## 9. TypeORM Execution

`TypeOrmApplyChangesService` passes each ordered mutation to the shared
`TypeOrmMutationExecutor`. The executor uses repositories through the
QueryRunner-bound `EntityManager`, so every mutation participates in the
handler-owned apply transaction. A later optimization may replace consecutive
compatible mutations with a query builder or justified raw SQL while
preserving the same fixed order and transaction boundary.

`TypeOrmMutationExecutor` is an internal primitive for prepared single-row
mutations. It is not the owner of ordering and is not exposed through
`UnitOfWork` or core's session repository contract.

```typescript
class TypeOrmMutationExecutor {
  // The manager belongs to the current UnitOfWork/QueryRunner transaction.
  constructor(private readonly manager: EntityManager) {}

  // Execute one reduced mutation after its fixed execution order has been
  // selected by the persistence scheduler.
  async execute(mutation: ReducedMainTableMutation): Promise<void> {
    const repository = this.getRepository(mutation.target.entityName);
    const executor = OPERATION_EXECUTORS.get(mutation.operation);
    if (executor === undefined) throw new Error('Unsupported operation');
    await executor(repository, mutation);
  }
}
```

`OPERATION_EXECUTORS` is a map from the operation vocabulary to the three
physical write functions. Unsupported operations fail before a write.

The executor:

- maps only registered `target.entityName` values to TypeORM entity schemas;
- is called once for each scheduled mutation, in execution order;
- does not start, commit, or roll back a transaction;
- does not inspect edit-session status, field paths, aggregate completeness, or
  versions;
- uses `target.rowIdentifier.values` as the TypeORM `where` object for updates
  and deletes;
- applies `changes` as the update-set values;
- combines `target.rowIdentifier.values` with `values ?? {}` for inserts;
- allows configured database cascades and restrictions to execute normally.

`repository.save(aggregate)` is not used. The ordered list contains explicit
physical mutations, while additional physical changes may occur through
database cascades. The persistence service may use query builders or raw SQL
when a bulk or composite mutation is materially clearer or more efficient.

## 10. End-to-End Orchestration

```typescript
class TypeOrmApplyChangesService {
  async apply(): Promise<ApplyChangesSummary> {
    const sessionId = this.writeContext.session.sessionId;
    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });

    // The reducer consumes the original rows. Each rule validates the fields
    // it needs while deriving identity and folding a permanent-row group.
    const reductionResult = this.operationReducer.reduce(rows);
    if (reductionResult.kind === RESULT_KIND.Fail) {
      throw persistenceIssueToException(reductionResult.issues);
    }
    const mutations = reductionResult.data;

    // Validate TypeORM targets before the first permanent write.
    this.mutationExecutor.validateMutations(mutations);

    // Apply the hardcoded phase, step, and sequence, then use row identity as
    // the deterministic tie-breaker for rows sharing one schedule entry.
    const orderedMutations = orderMainTableMutations(
      mutations,
      this.executionSchedule,
    );

    // Execute each prepared main-table row write in fixed order.
    for (const mutation of orderedMutations) {
      await this.mutationExecutor.execute(mutation);
    }

    const commitId = await this.sessionRepository.recordCommit({
      sessionId,
      changeCount: orderedMutations.length,
    });

    // Delete the exact selected source rows and their older history before the
    // handler commits. A cleanup failure rolls back the complete apply.
    await this.sessionRepository.deleteAppliedActionHistory(
      sessionId,
      rows,
    );

    return {
      commitId,
      appliedEntityCount: orderedMutations.length,
      appliedAggregateCount: countDistinctAggregateIds(orderedMutations),
    };
  }
}
```

### 10.1 Method-by-method apply pipeline

The statements inside `TypeOrmApplyChangesService.apply()` map to concrete
methods as follows:

| Pipeline step | Class or function | Method call | Input processed | Internal work | Output consumed by next step |
|---|---|---|---|---|---|
| Select current staged rows | `EditActionsQueryService` | `query({sessionId, changeStatus: STAGED})` | Active session ID and required status | Builds a TypeORM query with `sessionId`, `changeStatus = STAGED`, and `validUntil IS NULL`; executes `getMany()` | `EditActionRow[]` assigned to local variable `rows` |
| Retain source rows | `TypeOrmApplyChangesService` | `const rows = await this.editActions.query(...)` | Query result | Keeps the same array reference in `apply()`; no mapping, copying, renaming, or deletion occurs | The same `rows` variable is passed to reduction and later cleanup |
| Group rows and choose rules | `ApplyOperationReducer` | `this.operationReducer.reduce(rows)` | Retained `EditActionRow[]` | Groups the original row objects by `row.targetTable`, sorts table keys, calls `this.registry.get(targetTable)`, and rejects an unregistered table | Each table's original rows are passed to its registered rule; successful results are combined into `Result<ReducedMainTableMutation[]>` |
| Reduce a system-ID table | `SystemIdEntityReductionRule` | `reduceToMainTableMutations(tableRows)` | All retained rows for one normal table, such as `SpfModule` | For each row, verifies the table, supported operation, integer `targetSystemId`, and required create/update payload; derives `{systemId: targetSystemId}`; groups by that identity; validates one aggregate owner; folds create/update/delete sequences and merged columns | Zero or one `ReducedMainTableMutation` per permanent system-ID row |
| Reduce a composite table | `CompositeValueEntityReductionRule` | `reduceToMainTableMutations(tableRows)` | All retained rows for one composite table, such as `CkvValues` | For each row, verifies the table and supported operation; reads required key fields from `newValue`; verifies integer keys, the `targetSystemId` anchor, and canonical `fieldPath`; groups by the complete composite identity; folds create/delete sequences | Zero or one `ReducedMainTableMutation` per permanent composite row |
| Validate TypeORM targets | `TypeOrmMutationExecutor` | `validateMutations(mutations)` | Reduced mutations | Calls `ApplyTargetRegistry.get(mutation.target.entityName)` for every mutation so missing TypeORM metadata fails before the first write | The same unmodified mutation array |
| Validate and order mutations | `orderMainTableMutations` | `orderMainTableMutations(mutations, executionSchedule)` | Reduced mutations and fixed schedule | Rejects duplicate permanent-row identities, requires an entity-operation schedule entry, then sorts by phase, step, sequence, and row identity | `orderedMutations`, containing the same mutation objects in execution order |
| Execute permanent writes | `TypeOrmMutationExecutor` | `execute(mutation)` inside the loop | One ordered `ReducedMainTableMutation` | Resolves the registered target and repository, sanitizes values, then calls `repository.insert()`, `repository.update()`, or `repository.delete()` | No value; the permanent database state changes inside the open transaction |
| Record the apply commit | `TypeOrmSessionRepository` | `recordCommit({sessionId, changeCount})` | Session ID and `orderedMutations.length` | Inserts one `session_commits` row and keeps the required legacy message as an empty string | Generated numeric `commitId` |
| Clean selected source rows | `TypeOrmSessionRepository` | `deleteAppliedActionHistory(sessionId, rows)` | Active session ID and the original selected rows | Deletes each selected current row by `changeId`, then deletes older history using `targetTable + targetSystemId + fieldPath` | Deleted-row count; apply does not currently expose it |
| Build response data | `TypeOrmApplyChangesService` | Inline `return {commitId, ...}` | `commitId` and `orderedMutations` | Counts reduced mutations and distinct `aggregateId` values | `ApplyChangesSummary` returned to `TypeOrmUnitOfWork.applyChanges()` |

The target Unit-of-Work wiring is:

```typescript
const reductionRegistry = createDefaultApplyReductionRegistry();
const operationReducer = new ApplyOperationReducer(reductionRegistry);

const applyService = new TypeOrmApplyChangesService(
  this.getWriteContext(),
  new EditActionsQueryService(manager),
  operationReducer,
  createDefaultApplyExecutionSchedule(),
  new TypeOrmMutationExecutor(manager, createDefaultApplyTargetRegistry()),
  new TypeOrmSessionRepository(manager),
);

return applyService.apply();
```

This construction makes the interfaces explicit:

```text
TypeOrmUnitOfWork.applyChanges()
  -> TypeOrmApplyChangesService.apply()
       -> EditActionsQueryService.query(...)
       -> ApplyOperationReducer.reduce(rows)
            -> ApplyReductionRegistry.get(targetTable)
            -> EntityReductionRule.reduceToMainTableMutations(tableRows)
                 -> rule validates consumed fields and resolves row identity
                 -> rule groups rows by identity and folds each group
       -> TypeOrmMutationExecutor.validateMutations(mutations)
       -> orderMainTableMutations(mutations, executionSchedule)
       -> TypeOrmMutationExecutor.execute(mutation)
       -> TypeOrmSessionRepository.recordCommit(...)
       -> TypeOrmSessionRepository.deleteAppliedActionHistory(sessionId, rows)
       -> inline ApplyChangesSummary construction
  -> ApplyChangesHandler.handle()
       -> UnitOfWork.commit()
```

### 10.2 How each method input is derived

#### ActiveSession input

`SessionGuard.canActivate()` derives the session from the route project ID:

```typescript
const projectId = request.params['projectId'];
const session =
  await sessionRepository.findActiveSessionByProjectId(projectId);

request.arcSession = session;
```

Therefore `ProjectController.commitChanges()` receives `session` from
`@ArcSession()`. It does not create or reload the session:

```typescript
await commandBus.execute(new ApplyChangesCommand(), session);
```

#### WriteContext and UnitOfWork input

`CommandBus.execute()` obtains a command-scoped Unit of Work from
`UnitOfWorkFactory`, generates a command group ID, and attaches the session:

```typescript
const {uow, release} = await uowFactory();
uow.setWriteContext({
  session,
  groupId: generateUuid(),
});
```

`ApplyChangesHandler.handle()` receives that configured `uow` from the command
handler registry. Its input is therefore not only the command; the handler's
constructor already contains the Unit of Work carrying the `WriteContext`:

```typescript
await uow.startTransaction();
const summary = await uow.applyChanges();
await uow.commit();
```

#### TypeOrmApplyChangesService dependencies

`TypeOrmUnitOfWork.applyChanges()` derives the transaction-bound manager from
its `QueryRunner`:

```typescript
const manager = this.queryRunner.manager;
```

It then constructs every persistence dependency from that manager or from the
static apply catalogue:

```typescript
const editActions = new EditActionsQueryService(manager);

const reductionRegistry = createDefaultApplyReductionRegistry();
const operationReducer = new ApplyOperationReducer(reductionRegistry);

const executionSchedule = createDefaultApplyExecutionSchedule();
const targetRegistry = createDefaultApplyTargetRegistry();
const mutationExecutor = new TypeOrmMutationExecutor(manager, targetRegistry);
const sessionRepository = new TypeOrmSessionRepository(manager);

const applyService = new TypeOrmApplyChangesService(
  this.getWriteContext(),
  editActions,
  operationReducer,
  executionSchedule,
  mutationExecutor,
  sessionRepository,
);
```

The same `manager` is used by the query service, mutation executor, and session
repository. Their reads and writes therefore participate in the transaction
started by `ApplyChangesHandler`.

#### EditActionsQueryService.query input

`TypeOrmApplyChangesService.apply()` derives `sessionId` from the injected
`WriteContext`. The status is not supplied by the HTTP request; apply always
chooses the `STAGED` constant:

```typescript
const sessionId = this.writeContext.session.sessionId;

const queryFilters = {
  sessionId,
  changeStatus: CHANGE_STATUS.Staged,
};

const rows = await this.editActions.query(queryFilters);
```

`EditActionsQueryService.query()` converts those inputs into database predicates:

```text
sessionId                 -> WHERE ea.sessionId = :sessionId
CHANGE_STATUS.Staged      -> AND ea.changeStatus = :changeStatus
query() current-row rule  -> AND ea.validUntil IS NULL
```

The output `rows` is populated by TypeORM from the matching `edit_actions`
records. Every returned object includes its source `changeId`, target table and
ID, source operation, field path, payload, aggregate owner, and session metadata.

#### ApplyOperationReducer.reduce input

The reducer has two inputs with different lifetimes:

```text
registry -> constructed once by TypeOrmUnitOfWork and injected in the constructor
rows     -> produced for this apply call by EditActionsQueryService.query()
```

Inside `reduce(rows)`, each table-group input is derived from
`EditActionRow.targetTable`:

```typescript
const tableGroups = groupBy(rows, row => row.targetTable);
```

Example:

```text
rows = [
  Row 201 {targetTable: SpfModule, targetSystemId: 50, operation: CREATE},
  Row 202 {targetTable: SpfModule, targetSystemId: 50, operation: UPDATE},
  Row 203 {targetTable: CkvValues, targetSystemId: 20, operation: CREATE}
]

tableGroups = {
  SpfModule -> [Row 201, Row 202],
  CkvValues -> [Row 203]
}
```

For each group, `targetTable` becomes the registry lookup input, and the grouped
row array becomes the rule input. No mapper or validator creates an intermediate
row type:

```typescript
const rule = this.registry.get(targetTable);
const result = rule.reduceToMainTableMutations(tableRows);
```

#### EntityReductionRule input

The table-specific rule is the first module that interprets the contents of an
edit row. It receives the original objects, validates the exact fields it will
consume, and returns no intermediate identity-row type.

For `SystemIdEntityReductionRule`, each input row is processed as follows:

```text
row.targetTable    -> must equal the rule's configured entity name
row.operation      -> must be CREATE, UPDATE, or DELETE for this rule
row.targetSystemId -> must be an integer; becomes rowIdentifier.systemId
row.aggregateId    -> must agree across all rows for the derived identity
row.newValue       -> required object for CREATE/UPDATE; values are merged
row.fieldPath      -> used for deterministic folding order
```

Rows with the same `targetTable + targetSystemId` produce the same permanent-row
identity and enter the same row-level reduction group. For example:

```text
input:
  Row 201 UPDATE SpfModule(50) {alias: "Voice"}
  Row 202 UPDATE SpfModule(50) {containerSystemId: 20}

derived group key:
  SpfModule|systemId=50

folded output:
  ReducedMainTableMutation {
    aggregateId: 50,
    target: SpfModule|systemId=50,
    operation: UPDATE,
    changes: {alias: "Voice", containerSystemId: 20}
  }
```

For `CompositeValueEntityReductionRule`, identity is derived from the row anchor
and required payload fields while those values are validated:

```text
row.targetTable                    -> must equal configured composite entity
row.operation                      -> must be CREATE or DELETE
row.newValue[configured parentKey] -> required integer parent identity
row.newValue.valueDefSystemId      -> required integer secondary identity
row.targetSystemId                 -> must equal the payload parent identity
row.fieldPath                      -> must encode the same secondary identity
row.aggregateId                    -> must agree across the derived row group
```

Example:

```text
Row 203:
  targetTable=CkvValues
  targetSystemId=20
  fieldPath=$key:valueDefSystemId=300
  newValue={ckvSystemId: 20, valueDefSystemId: 300}

Derived identity:
  CkvValues|ckvSystemId=20|valueDefSystemId=300
```

Each rule returns final `ReducedMainTableMutation[]`. The top-level reducer
appends every successful rule result into its `mutations` array. This array is
derived from row-level folding, not directly from the number of source rows.

#### TypeOrmMutationExecutor.validateMutations input

The input is the successful reducer payload:

```typescript
const mutations = reductionResult.data;
this.mutationExecutor.validateMutations(mutations);
```

For every mutation, the target-registry key comes from:

```typescript
mutation.target.entityName
```

The target registry itself was created by
`createDefaultApplyTargetRegistry()` in `TypeOrmUnitOfWork.applyChanges()`.
Validation calls `targets.get(entityName)` and does not modify the mutations.

#### orderMainTableMutations input

The ordering function receives:

```text
mutations         <- reductionResult.data
executionSchedule <- createDefaultApplyExecutionSchedule()
```

For each mutation, its schedule lookup key is derived from:

```text
mutation.target.entityName + mutation.operation
```

Its deterministic tie-breaker is derived from the complete
`MainTableRowIdentity`. The function copies only the array before sorting; the
mutation objects inside it are the same objects returned by reduction:

```typescript
const orderedMutations = [...mutations].sort(...);
```

#### TypeOrmMutationExecutor.execute input

The loop derives each `mutation` input from `orderedMutations` in schedule
order:

```typescript
for (const mutation of orderedMutations) {
  await this.mutationExecutor.execute(mutation);
}
```

Inside `execute(mutation)`:

```text
TypeORM target   <- targets.get(mutation.target.entityName)
repository       <- manager.getRepository(target.entityName)
write function   <- OPERATION_EXECUTORS.get(mutation.operation)
WHERE/insert ID  <- mutation.target.rowIdentifier.values
insert values    <- mutation.values + rowIdentifier.values
update values    <- mutation.changes
```

The operation type selects `repository.insert()`, `repository.update()`, or
`repository.delete()`.

#### TypeOrmSessionRepository.recordCommit input

The two input members have different sources:

```typescript
const commitId = await this.sessionRepository.recordCommit({
  sessionId,                              // from WriteContext.session
  changeCount: orderedMutations.length, // final physical write count
});
```

`changeCount` is not `rows.length`. Three selected edit rows can reduce to two
permanent mutations, so the stored count is two.

`recordCommit()` inserts the supplied values plus the schema-required empty
legacy commit message. The generated identifier becomes `commitId`.

#### TypeOrmSessionRepository.deleteAppliedActionHistory input

Cleanup receives:

```text
sessionId <- WriteContext.session.sessionId
rows      <- the original EditActionsQueryService.query() result
```

```typescript
await this.sessionRepository.deleteAppliedActionHistory(sessionId, rows);
```

For every retained row, cleanup derives:

```text
exact selected-row key = sessionId + row.changeId

history-slot key =
  sessionId
  + row.targetTable
  + row.targetSystemId
  + row.fieldPath
```

The exact key deletes the source row selected by this apply attempt. The slot
key deletes only older rows where `validUntil IS NOT NULL`.

#### ApplyChangesSummary input

The summary is built directly inside `TypeOrmApplyChangesService.apply()`:

```typescript
return {
  commitId, // returned by TypeOrmSessionRepository.recordCommit()
  appliedEntityCount: orderedMutations.length,
  appliedAggregateCount: new Set(
    orderedMutations.map(mutation => mutation.aggregateId),
  ).size,
};
```

`ApplyChangesHandler.handle()` receives this object from
`UnitOfWork.applyChanges()`. It commits the already-open transaction and returns
`Result.ok(summary)`.

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

Apply retains the selected `EditActionRow[]` through reduction, execution, and
commit recording. It does not create a separate cleanup-key array or cleanup
input type. `deleteAppliedActionHistory()` receives the original
`EditActionRow[]` and reads the fields required for two cleanup identities:

1. `(sessionId, changeId)` identifies the exact current row selected by this
   apply attempt.
2. `(sessionId, targetTable, targetSystemId, fieldPath)` identifies older rows
   for the same logical edit slot.

`targetTable` is required because different entities can share the same numeric
target ID and field path. The logical edit-slot identity is separate from
`MainTableRowIdentity`, which identifies the permanent row to write.

The apply and discard persistence services use internal transaction-bound
mutation-related calls equivalent to:

```typescript
recordCommit(input: {
  sessionId: number;
  changeCount: number;
}): Promise<number>;

deleteAppliedActionHistory(
  sessionId: number,
  rows: readonly EditActionRow[],
): Promise<number>;

deleteAllEditActions(sessionId: number): Promise<number>;
```

These methods are not part of core's `ISessionRepository`. Core handlers access
the persistence workflows only through `UnitOfWork.applyChanges()` and
`UnitOfWork.discardChanges()`.

`deleteAppliedActionHistory` first hard-deletes each exact selected current row
using `(sessionId, changeId)`. It then hard-deletes older rows where
`validUntil IS NOT NULL` and the table-qualified logical slot matches the
retained source row. This includes rows folded into another mutation and rows
eliminated by create-then-delete reduction. It does not remove a different
current row, current unstaged rows, or history for unrelated logical slots.

Conceptually, cleanup performs these predicates for every retained row:

```sql
DELETE FROM edit_actions
WHERE session_id = :sessionId
  AND change_id = :changeId;

DELETE FROM edit_actions
WHERE session_id = :sessionId
  AND target_table = :targetTable
  AND target_system_id = :targetSystemId
  AND (
    field_path = :fieldPath
    OR (field_path IS NULL AND :fieldPath IS NULL)
  )
  AND valid_until IS NOT NULL;
```

The implementation may combine or deduplicate these deletes for efficiency,
but that is internal behavior. Its interface remains the retained selected rows.

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
| Unsupported target | No `ApplyReductionRegistry` entry exists for the row's `targetTable`. |
| Invalid action | Operation, field path, or payload does not satisfy persistence reduction. |
| Invalid special key | A required composite-key field is absent or conflicts with the canonical slot. |
| Invalid target metadata | A reduced mutation has no execution-schedule or `ApplyTargetRegistry` entry. |
| Persistence failure | TypeORM or SQLite rejects a prepared mutation. |
| Commit/cleanup failure | Commit recording or applied-action cleanup fails. |

`UnitOfWork.applyChanges()` rejects with a typed persistence error. The core
handler does not reinterpret it; it rolls back and rethrows for API exception
mapping. Logs include `target.entityName`, `aggregateId`, and entity IDs in
hexadecimal where applicable.

## 14. Tests

### 14.1 Current-action selection and cleanup isolation

- Verify stale and current `UNSTAGED` actions do not produce mutations.
- Verify exact selected current rows and matching older history are deleted only
  after successful writes and commit recording.
- Verify cleanup uses `changeId` for each selected current row and does not
  delete a newer current row that occupies the same logical slot.
- Verify `SpfModule(50)` and `Node(50)` accumulator actions remain independent.
- Verify lookup and supersession include `targetTable`.

### 14.2 Persistence reduction and special identity

- Verify the original `EditActionRow` objects reach the registered rule without
  mapping, and that each rule rejects unsupported operations, invalid identity
  fields, non-canonical field paths, and malformed required payloads.
- Verify `targetTable` grouping dispatches all selected rows for one table to
  the same registered `EntityReductionRule`.
- Verify `ApplyOperationReducer.reduce(rows)` uses its constructor-injected
  registry and requires no registry argument at the call site.
- Verify an `EntityReductionRule` groups selected rows by
  `MainTableRowIdentity` and emits at most one
  `ReducedMainTableMutation` per permanent row.
- Verify conflicting `aggregateId` values for one main-table row fail before
  any permanent write.
- For each initial composite-value configuration, verify all key components are
  required.
- Verify two values under the same anchor produce separate canonical slots.
- Verify create and delete mutations contain complete row identifiers.
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
  order when all groups contain staged mutations.
- Verify miscellaneous deletes run before graph/runtime deletes.
- Verify `Sgkv` and `SgkvValues` remain in the graph/runtime family rather than
  the definition family.
- Verify create/delete reduction can remove a root mutation while preserving an
  independently staged child delete in the same aggregate.
- Verify empty phases and steps are skipped without reordering later groups.
- Verify a missing schedule entry fails before any permanent write.
- Verify sequence values enforce parent-before-child creates and
  child-before-parent deletes.
- Verify deterministic row-identity ordering for mutations sharing one
  entity-operation schedule entry.

### 14.4 Transaction rollback and cascades

- Verify a schema-defined cascade occurs when its staged parent delete executes.
- Force a later mutation failure and verify the parent delete and cascade roll
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
