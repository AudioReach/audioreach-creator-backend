# Aggregate Apply-Changes Framework: Low-Level Design

**Date:** 2026-09-22
**Status:** Approved design, revised for PR 137 feedback

Requirements: [aggregate-apply-changes-requirements.md](./aggregate-apply-changes-requirements.md)

## 1. Purpose

This design applies the current staged edit actions from the active session to
the permanent SQLite tables.

V1 is deliberately limited to staged-action processing. It does not reconstruct
or validate a complete aggregate. It uses core-owned apply rules to reduce
actions and prepare mutations, orders dependencies that exist between staged
mutations, and executes the plan in one transaction.

## 2. Design Decisions

1. Only edit actions with `valid_until IS NULL` and `changeStatus = STAGED`
   participate in apply.
2. Apply semantics are defined by rules in `@arc/core`.
3. An allowlisted generic rule handles targets addressed by `systemId`.
4. Composite or otherwise exceptional targets require dedicated core rules.
5. The existing `edit_actions` schema is retained.
6. The operation graph contains only explicit staged mutations and fixed phase
   barriers.
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

## 3. Architecture and Package Boundaries

```text
packages/core
  ApplyChangesCommand / ApplyChangesHandler
  DiscardChangesCommand / DiscardChangesHandler
  ApplyChangesPort / DiscardChangesPort
  ApplyRuleRegistry
    SystemIdApplyRule
    explicit special-target rules
  orderStagedMutations()

packages/infrastructure/persistence
  TypeOrmApplyChangesService
  TypeOrmDiscardChangesService
  TypeOrmSessionRepository
  EditActionsQueryService
  PendingChangeWriter
  TypeOrmOperationExecutor
```

Dependencies continue to point inward:

- core rules use plain TypeScript data and import no TypeORM, NestJS, or Node.js
  APIs;
- persistence reads `edit_actions`, maps rows to core action types, invokes the
  core rules and ordering function, and executes their output through TypeORM;
- the API layer only dispatches the command and maps the result or error.

### 3.1 Planned responsibilities

| Layer | Component | Responsibility |
|---|---|---|
| Core | `ApplyChangesHandler` | Own the apply transaction and invoke the transaction-bound apply port. |
| Core | `DiscardChangesHandler` | Own the discard transaction and invoke the transaction-bound discard port. |
| Core | `ApplyRuleRegistry` | Resolve the registered rule for each target type. |
| Core | `SystemIdApplyRule` | Fold allowlisted single-ID target actions. |
| Core | Special apply rules | Fold target-specific actions and produce complete physical criteria. |
| Core | `orderStagedMutations()` | Pure function that preserves every staged physical mutation and applies topological and fixed merge ordering. |
| Persistence | `TypeOrmApplyChangesService` | Read candidates, invoke rules and ordering, execute mutations, record the commit, and delete the selected action history. |
| Persistence | `TypeOrmDiscardChangesService` | Delete every edit-action row for the active session. |
| Persistence | `EditActionsQueryService` | Read only current edit actions with explicit status filtering. |
| Persistence | `PendingChangeWriter` | Create and supersede table-qualified action slots. |
| Persistence | `TypeOrmOperationExecutor` | Execute prepared mutation criteria through the QueryRunner-bound EntityManager. |
| Persistence | `TypeOrmSessionRepository` | Own session lifecycle, commit recording, and transactional edit-action deletion methods. |

There is no `ImpactCompletionService`, aggregate completeness validator, or
version validator in this design.

### 3.2 File placement

- Command, handler, rule contracts, registry, rules, and ordering function:
  `packages/core/src/application/edit-session/apply-changes/`.
- Session repository contract:
  `packages/core/src/application/ports/persistence/repositories/session/session.repository.ts`.
- TypeORM orchestration and execution:
  `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/services/apply-changes/`.

The command handler must also be added to the manual command-handler registry,
and `UnitOfWork` plus its TypeORM implementation must expose the session
repository.

## 4. Apply and Discard Contracts

Apply and discard are session lifecycle operations exposed as transaction-bound
core ports. The persistence services use the same QueryRunner-bound session
repository for commit recording and edit-action deletion.

```typescript
export type ApplyChangesResult = {
  commitId: number;
  appliedEntityCount: number;
  appliedAggregateCount: number;
};

export interface ApplyChangesPort {
  apply(): Promise<ApplyChangesResult>;
}

export type DiscardChangesResult = {
  discardedEditActionCount: number;
};

export interface DiscardChangesPort {
  discard(): Promise<DiscardChangesResult>;
}
```

The active session ID is obtained from the `UnitOfWork` write context by each
persistence service. Neither command accepts an arbitrary session ID, an
aggregate subset, selective change IDs, or a caller-supplied commit message.

`UnitOfWork` exposes an `ISessionRepository` bound to the same QueryRunner used
by the command handler.

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
async function handleApplyChanges(uow: UnitOfWork): Promise<ApplyChangesResult> {
  await uow.startTransaction();

  try {
    const result = await uow.getApplyChangesPort().apply();
    await uow.commit();
    return result;
  } catch (error) {
    if (uow.isInTransaction()) {
      await uow.rollback();
    }
    throw error;
  }
}
```

`handleDiscardChanges` follows the same structure and invokes
`uow.getDiscardChangesPort().discard()`.

Permanent writes, schema-defined cascades, commit recording, and apply cleanup
all use the apply transaction. Discard uses the same transaction pattern but
only deletes edit-action rows. No collaborator commits or rolls back
independently.

## 6. Core Apply-Rule Model

### 6.1 Normalized action input

Persistence maps each `EditActionRow` to a framework-neutral core value.
`PendingApplyAction` is a transient in-memory object, not a new database row or
TypeORM schema. The mapping copies only the fields needed by core apply logic
and drops persistence-only fields such as `sessionId`, `changeStatus`,
`validUntil`, and relation metadata after the query has selected current staged
rows.

```typescript
// Plain core object mapped one-to-one from a current staged EditActionRow.
// It is never persisted back to the edit_actions table.
export type PendingApplyAction = {
  aggregateId: number;
  targetType: string;
  targetSystemId: number;
  operation: ChangeOperation;
  fieldPath: string | null;
  newValue: Readonly<Record<string, unknown>>;
};
```

`targetType` is an opaque logical identifier in core. The persistence adapter
maps it to the corresponding TypeORM entity name when executing a mutation.

### 6.2 Rule output

Rules return a persistence-neutral physical mutation. `criteria` contains the
complete key fields chosen by that rule; it is not a replacement identity
stored in `edit_actions`.

```typescript
export type MutationCriteria = Readonly<
  Record<string, string | number | boolean | null>
>;

export type PlannedMutation = {
  // Stable identity for one physical row within one target table.
  mutationKey: string;
  // Logical entity/table name resolved by the TypeORM adapter.
  targetType: string;
  aggregateId: number;
  operation: ChangeOperation;
  // Complete WHERE criteria for this row, such as {systemId: 50} or a
  // composite key. A mutation never addresses every row in the table.
  criteria: MutationCriteria;
  // Final column values after folding all staged field changes for this row.
  values?: Readonly<Record<string, unknown>>;
  // Source-defined merge phase and family step.
  executionSlot: ExecutionSlot;
};

export type ApplyRuleResult<T> = Result<T>;

export interface ApplyRule {
  readonly targetType: string;

  actionSlot(action: PendingApplyAction): ApplyRuleResult<string>;

  mutationKey(action: PendingApplyAction): ApplyRuleResult<string>;

  reduce(
    actions: readonly PendingApplyAction[],
  ): ApplyRuleResult<PlannedMutation | null>;

  dependencies(
    mutation: PlannedMutation,
    candidates: readonly PlannedMutation[],
  ): readonly OperationDependency[];
}
```

The actual implementation shall use the repository's existing `Result` and
issue-factory conventions rather than constructing issues inline.
Rules reject `CHANGE_OPERATION.None`; every emitted mutation is create, update,
or delete.

A mutation is scoped to one physical row in one table. For example, two staged
field updates for `SpfModule(50)` fold into one `SpfModule` mutation. A staged
update for `SpfModule(51)` remains a second mutation even though it targets the
same table. This preserves row-specific criteria.

### 6.3 Registry behavior

The registry is explicit and deterministic.

```typescript
export class ApplyRuleRegistry {
  constructor(
    genericTargetTypes: readonly string[],
    specialRules: readonly ApplyRule[],
  ) {}

  getRule(targetType: string): ApplyRule;
}
```

The registry shall not use the generic rule as an unrestricted fallback. A
target is accepted only when it is in the generic allowlist or has a dedicated
special rule. An unregistered target fails before permanent writes begin.

`ApplyRuleRegistry` and `ApplyTargetRegistry` are intentionally separate:

- `ApplyRuleRegistry` belongs to the apply semantic boundary. It dispatches
  target actions to core rules that validate payloads, group action slots,
  reduce mutations, and provide dependencies and execution slots.
- `ApplyTargetRegistry` belongs to the persistence boundary. It maps an
  already-prepared target type to its TypeORM entity target and value sanitizer.

The persistence adapter must not use target metadata to decide how edit actions
fold, and core rules must not know TypeORM entity schemas. Keeping these
registries separate makes that boundary explicit while allowing the persistence
composition root to register both from one target inventory.

### 6.4 Generic system-ID rule

For an allowlisted generic target:

- the action slot is `(targetType, targetSystemId, fieldPath)`;
- the mutation key is `(targetType, targetSystemId)`;
- actions are grouped by mutation key so separate field slots fold together;
- committed rows are loaded with `{systemId: targetSystemId}`;
- updates combine the current field deltas deterministically;
- a terminal delete suppresses earlier updates;
- create followed by delete produces no physical mutation;
- create, update, and delete mutations use `{systemId: targetSystemId}` as
  their physical criteria.

### 6.5 Special-target rule contract

A special rule defines the meaning of `targetSystemId`, the canonical action
slot, required payload fields, and final criteria for its target.

The initial composite-value rules use this contract:

| Target | `targetSystemId` anchor | Required key field in `newValue` | Physical criteria |
|---|---|---|---|
| `UsecaseGkvValues` | `usecaseSystemId` | `valueDefSystemId` | `{usecaseSystemId, valueDefSystemId}` |
| `CkvValues` | `ckvSystemId` | `valueDefSystemId` | `{ckvSystemId, valueDefSystemId}` |
| `TkvValues` | `tkvSystemId` | `valueDefSystemId` | `{tkvSystemId, valueDefSystemId}` |
| `SgkvValues` | `sgkvSystemId` | `valueDefSystemId` | `{sgkvSystemId, valueDefSystemId}` |
| `DkvValues` | `dkvSystemId` | `valueDefSystemId` | `{dkvSystemId, valueDefSystemId}` |
| `VcpmCkvValues` | `vcpmCkvSystemId` | `valueDefSystemId` | `{vcpmCkvSystemId, valueDefSystemId}` |

For these rules:

- the canonical `fieldPath` slot includes the secondary key, for example
  `$key:valueDefSystemId=300`;
- `newValue` carries all key fields for create and delete actions;
- the rule validates that the slot and payload describe the same key;
- the mutation key contains both physical key components;
- actions are grouped by mutation key;
- a delete mutation includes both components in its criteria.

These composite value relationship targets support `CREATE` and `DELETE` only.
An `UPDATE` action is invalid because the relationship row has no independent
mutable payload in v1.

`PendingChangeWriter` shall allow a special rule or repository adapter to
provide the canonical field-path slot and identity payload. This avoids a
schema change while allowing multiple composite rows under the same anchor ID.

### 6.6 Junction-table targets

A junction row is a physical target when an edit repository writes it. The rule
choice follows its identity:

- a junction with a `systemId`, such as `UseCaseSubgraph` or
  `UseCaseSubgraphPair`, uses the generic system-ID rule;
- a junction with only a composite identity requires a dedicated special rule
  whose canonical field path and mutation criteria contain every key column;
- an unregistered junction target is rejected before physical writes begin.

Apply does not derive junction changes from parent aggregate changes and does
not synthesize missing relationship rows. Registered dependency rules order
staged relationship creates and deletes around their staged endpoints; schema
cascades may remove additional junction rows when a parent is deleted.

## 7. Current-Action Slot Correction

Current action lookup and supersession must be table-qualified.

The existing signatures:

```typescript
findCurrentRow(sessionId, targetSystemId, fieldPath)
supersedeCurrent(sessionId, targetSystemId, fieldPath, manager)
```

are changed to:

```typescript
findCurrentRow(sessionId, targetTable, targetSystemId, fieldPath)
supersedeCurrent(
  sessionId,
  targetTable,
  targetSystemId,
  fieldPath,
  manager,
)
```

Both queries include `target_table = :targetTable`.

This is required because related rows can share a numeric ID. For example,
`SpfModule(50)` and `Node(50)` must retain separate accumulator slots even when
both use `fieldPath = NULL`.

Special-target slots also depend on the canonical `fieldPath`, so the complete
slot used by read and supersession is:

```text
(sessionId, targetTable, targetSystemId, fieldPath)
```

## 8. Action Selection and Reduction

### 8.1 Selection

The apply reader performs one explicit query:

```typescript
const rows = await editActionsQueryService.query({
  sessionId,
  changeStatus: CHANGE_STATUS.Staged,
});
```

`EditActionsQueryService` already applies `validUntil IS NULL`. Apply must not
load both statuses and filter them after reduction.

### 8.2 Rule dispatch and grouping

```typescript
function reduceCurrentActions(
  rows: readonly PendingApplyAction[],
  registry: ApplyRuleRegistry,
): EffectiveChangeSet {
  const groups = new Map<string, PendingApplyAction[]>();

  for (const row of rows) {
    const rule = registry.getRule(row.targetType);
    const keyResult = rule.mutationKey(row);
    if (keyResult.kind === RESULT_KIND.Fail) throw issueToException(keyResult.issues);

    // Group only actions that resolve to the same table and physical row.
    // Different rows in the same table remain separate mutation groups.
    addToRuleGroup(groups, rule.targetType, keyResult.data, row);
  }

  const mutations: PlannedMutation[] = [];

  for (const group of groups.values()) {
    const rule = registry.getRule(group[0].targetType);
    const result = rule.reduce(sortByStableActionSlot(group));

    if (result.kind === RESULT_KIND.Fail) throw issueToException(result.issues);
    if (result.data !== null) {
      mutations.push(result.data);
    }
  }

  return mutations;
}
```

The reduction result does not carry edit-action IDs. The persistence service
keeps the table-qualified action slots from the selected rows. After successful
physical writes and commit recording, it deletes those slots and their older
history rows in the same transaction. This also cleans actions that folded
together or reduced to no physical mutation.

The executor may later batch consecutive compatible mutations for the same
table as a performance optimization, provided it preserves the planned order,
row-specific criteria, and failure behavior. Batching does
not change the one-row-per-mutation contract.

## 9. Staged Mutation Ordering

`orderStagedMutations()` receives only mutations produced from current staged
actions. It does not load a complete aggregate or create missing mutation
nodes.

```typescript
/**
 * Orders only the supplied staged mutations using registered dependencies and
 * the fixed merge schedule. It does not query the database, discover impacted
 * rows, synthesize child mutations, or remove a staged mutation.
 */
function orderStagedMutations(
  mutations: readonly PlannedMutation[],
  registry: ApplyRuleRegistry,
): readonly PlannedMutation[];
```

### 9.1 Staged mutation preservation

After rule-specific folding for the same physical target, the ordering function
retains every mutation produced from a current staged action.

A staged aggregate-root delete does not remove a staged create, update, or
delete for another target in the same aggregate. Registered ownership metadata
is used only to add ordering edges between staged mutations. The ordering
function does not inspect unstaged actions or require actions for children that
will be affected by database cascade.

### 9.2 Fixed merge schedule

The registry assigns every supported `(targetType, operation)` pair an
execution slot consisting of a phase and an ordered step. The ordering function
uses the following schedule:

| Phase | Step | Staged operation group |
|---|---:|---|
| Miscellaneous deletes | 1 | `UseCaseCategory` delete |
| Miscellaneous deletes | 2 | `ModuleManagerData` delete |
| Miscellaneous deletes | 3 | Driver module-data family delete |
| Graph and runtime deletes | 1 | Data-link family delete |
| Graph and runtime deletes | 2 | Control-link family delete |
| Graph and runtime deletes | 3 | SPF module family delete |
| Graph and runtime deletes | 4 | Container family delete |
| Graph and runtime deletes | 5 | Subgraph family delete |
| Graph and runtime deletes | 6 | Subsystem family delete |
| Definition updates and creates | 1 | Graph key update, then create |
| Definition updates and creates | 2 | Calibration key update, then create |
| Definition updates and creates | 3 | Tag definition update, then create |
| Definition updates and creates | 4 | Property definition update, then create |
| Definition updates and creates | 5 | Supporting processor, container, subgraph, and VCPM definition update, then create |
| Definition updates and creates | 6 | SPF module-definition update, then create |
| Definition updates and creates | 7 | Driver module-definition update, then create |
| Graph and runtime updates and creates | 1 | SPF module family update |
| Graph and runtime updates and creates | 2 | Subgraph-property and SGKV/VCPM runtime update |
| Graph and runtime updates and creates | 3 | Data-link and control-link update |
| Graph and runtime updates and creates | 4 | Container update |
| Graph and runtime updates and creates | 5 | Subgraph create |
| Graph and runtime updates and creates | 6 | Container create |
| Graph and runtime updates and creates | 7 | SPF module family create |
| Graph and runtime updates and creates | 8 | Use-case update, then create |
| Graph and runtime updates and creates | 9 | Data-link create |
| Graph and runtime updates and creates | 10 | Control-link create |
| Graph and runtime updates and creates | 11 | Subsystem create, then update |
| Graph and runtime updates and creates | 12 | Subgraph metadata update |
| Graph and runtime updates and creates | 13 | Use-case membership and pair rows |
| Miscellaneous updates and creates | 1 | `UseCaseCategory` update, then create |
| Miscellaneous updates and creates | 2 | `ModuleManagerData` update, then create |
| Miscellaneous updates and creates | 3 | Driver module-data family update, then create |
| Definition deletes | 1 | Graph key delete |
| Definition deletes | 2 | Calibration key delete |
| Definition deletes | 3 | Tag definition delete |
| Definition deletes | 4 | Property definition delete |
| Definition deletes | 5 | Supporting definition delete |
| Definition deletes | 6 | SPF module-definition delete |
| Definition deletes | 7 | Driver module-definition delete |

The six phases execute in the table order. Steps within a phase also execute in
the table order. Empty phases and steps are skipped without changing the order
of the remaining staged mutations. `Sgkv` and `SgkvValues` are runtime targets;
`SgkvValues` uses its composite special rule but is not placed in the definition
phase.

Concepts without a registered backend target do not create placeholder
operations. A newly supported target must be assigned an execution slot before
its rule can be registered.

### 9.3 Dependency edges

Each rule may report dependencies against other staged mutations. The ordering
function adds an edge only when both mutations exist in the staged set.

Required ordering includes:

- staged definition or parent create before staged dependent create;
- staged endpoint create before staged relationship create;
- staged relationship delete before staged endpoint delete;
- staged owned-child create or update before a staged root delete;
- staged owned-child delete before staged root delete;
- SPF definition child ordering, including `ModulePropertyDefinition`, within
  the `SpfModuleDefinition` family.

An unstaged or absent dependency is not added to the graph. Its existence and
referential correctness are left to the current database state and constraints.

A dependency may point within the same execution step or from an earlier slot
to a later slot. A dependency that requires a later phase or step to execute
first conflicts with the fixed merge schedule and fails planning before writes.

### 9.4 Deterministic sort

The ordering function processes non-empty execution slots in ascending phase
and step order. It topologically sorts the mutations inside each slot. Ready
mutations use this tie-break order:

1. target type;
2. `mutationKey`.

A cycle between staged mutations fails before the first permanent write.

## 10. TypeORM Execution

`TypeOrmOperationExecutor` is the narrow TypeORM write adapter used by
`TypeOrmSessionRepository.applyChanges()` after rule reduction and mutation
ordering have completed successfully. It is constructed with the
QueryRunner-bound `EntityManager`, so every operation participates in the
handler-owned apply transaction.

For v1, this responsibility may remain a private collaborator or private method
inside `TypeOrmSessionRepository`. It should be extracted into a separate class
only when repository dispatch and physical write behavior require independent
testing or reuse.

```typescript
class TypeOrmOperationExecutor {
  // The manager belongs to the current UnitOfWork/QueryRunner transaction.
  constructor(private readonly manager: EntityManager) {}

  // Execute one mutation whose operation, criteria, values, and ordering have
  // already been decided by core rules and the ordering function.
  async execute(mutation: PlannedMutation): Promise<void> {
    const repository = this.getRepository(mutation.targetType);
    const operation = OPERATION_EXECUTORS.get(mutation.operation);
    if (operation === undefined) throw new Error('Unsupported operation');
    await operation(repository, mutation);
  }
}
```

`OPERATION_EXECUTORS` is a map from the operation vocabulary to the three
physical write functions. Unsupported operations fail before a write.

The executor:

- maps only registered target types to TypeORM entity schemas;
- is called once for each planned mutation, in plan order;
- does not start, commit, or roll back a transaction;
- does not inspect edit-session status, field paths, aggregate completeness, or
  versions;
- uses `{systemId}` criteria from the generic rule;
- uses complete multi-column criteria from special rules;
- allows configured database cascades and restrictions to execute normally.

`repository.save(aggregate)` is not used. The plan contains explicit physical
mutations, while additional physical changes may occur through database
cascades.

## 11. End-to-End Orchestration

```typescript
class TypeOrmApplyChangesService implements ApplyChangesPort {
  async apply(): Promise<ApplyChangesResult> {
    const sessionId = this.writeContext.session.sessionId;
    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });

    // Keep table-qualified slots for cleanup before mapping rows to core.
    const cleanupSlots = uniqueActionSlots(rows);
    const actions = rows.map(mapEditActionRow);
    const mutations = reduceCurrentActions(actions, this.ruleRegistry);

    // Pure ordering step: retain all supplied mutations, add dependencies only
    // between staged mutations, and return their deterministic execution order.
    const orderedMutations = orderStagedMutations(mutations, this.ruleRegistry);

    // Ordering is complete. Execute each prepared physical mutation through
    // the same transaction-bound EntityManager before commit and cleanup.
    for (const mutation of orderedMutations) {
      await this.operationExecutor.execute(mutation);
    }

    const commitId = await this.recordCommit({
      sessionId,
      changeCount: orderedMutations.length,
    });

    // Hard-delete selected slots and their older versions before the handler
    // commits. A cleanup failure must roll back the complete apply.
    await this.sessionRepository.deleteAppliedActionHistory(
      sessionId,
      cleanupSlots,
    );

    return {
      commitId,
      appliedEntityCount: orderedMutations.length,
      appliedAggregateCount: countDistinctAggregateIds(orderedMutations),
    };
  }
}
```

The service does not reread actions after cleanup and does not read or clean
`session_entity_versions`.

## 12. Module Property Definition Handling

`ModulePropertyDefinition` remains registered in the
`SpfModuleDefinition` aggregate family and definition ordering group.

`SpfModulePropertiesData` remains owned by its module and references the module
property definition. V1 does not load every consumer or reject a definition
delete before execution. The current TypeORM relationship behavior, including
its configured cascade, executes inside the apply transaction.

Any future semantic rule that requires consumer validation belongs to the
separate aggregate-validation service, not the v1 apply rule or executor.

## 13. Session Commit and Cleanup

`ISessionRepository` and `TypeOrmSessionRepository` expose operations equivalent
to:

```typescript
applyChanges(sessionId: number): Promise<Result<ApplyChangesResult>>;

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

`deleteAppliedActionHistory` hard-deletes each selected
`(targetTable, targetSystemId, fieldPath)` slot and its older rows where
`validUntil IS NOT NULL`. This includes actions folded into another mutation and
actions eliminated by create-then-delete reduction. It does not remove current
unstaged actions or stale history for unrelated slots.

`deleteAllEditActions` hard-deletes every edit-action row for the active session,
regardless of status, source, or `validUntil`. It is used only by discard.

No version rows are read, compared, or cleaned in v1.

`TypeOrmDiscardChangesService.discard()` calls `deleteAllEditActions(sessionId)`
through the transaction-bound session repository. It does not inspect operation,
status, source, or history state. The discard handler commits only after that
deletion succeeds; otherwise the handler rolls it back.

## 14. Error Model

The apply path uses project `Result` and issue factories. Failures carry the
action and target context available at the failure point.

| Error category | Trigger |
|---|---|
| Unsupported target | No generic allowlist entry or dedicated special rule exists. |
| Invalid action | Operation, field path, or payload does not satisfy the selected rule. |
| Invalid special key | A required composite-key field is absent or conflicts with the canonical slot. |
| Dependency cycle | The staged operation graph cannot be topologically sorted. |
| Persistence failure | TypeORM or SQLite rejects a prepared mutation. |
| Commit/cleanup failure | Commit recording or applied-action cleanup fails. |

All failures return to the command handler as `Result` failures or mapped
exceptions, and the handler rolls back the transaction. Logs include
`targetType`, `aggregateId`, and entity IDs in hexadecimal where applicable.

## 15. Tests

### 15.1 Current-action selection and slot isolation

- Verify stale and current `UNSTAGED` actions do not produce mutations.
- Verify current staged action slots and matching history are deleted only after
  successful writes and commit recording.
- Verify `SpfModule(50)` and `Node(50)` accumulator actions remain independent.
- Verify lookup and supersession include `targetTable`.

### 15.2 Special-rule criteria

- For each initial composite-value rule, verify all key components are required.
- Verify two values under the same anchor produce separate canonical slots.
- Verify create and delete mutations contain complete criteria.
- Verify composite value relationship `UPDATE` actions fail before any permanent
  write.
- Verify an unregistered special target fails before any permanent write.

### 15.3 Staged-only ordering

- Verify the ordering function adds edges only between staged mutations.
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
- Verify a dependency that contradicts the fixed phase order fails before any
  permanent write.
- Verify deterministic ordering and cycle failure.

### 15.4 Transaction rollback and cascades

- Verify a schema-defined cascade occurs when its staged parent delete executes.
- Force a later mutation failure and verify the parent delete and cascade roll
  back.
- Verify no commit row is retained and no action is cleaned after rollback.
- Verify retry reads the same current staged actions.

### 15.5 Discard

- Verify discard deletes current and stale actions from every source and status.
- Verify discard leaves permanent tables, `session_commits`, and
  `session_entity_versions` unchanged.
- Verify a discard failure rolls back the action deletion.

## 16. Requirements Traceability

| Requirement group | Design sections |
|---|---|
| FR-EDIT-01..07 | Sections 7, 8, 11, 13 |
| FR-RULE-01..04 | Sections 3, 6, 10 |
| FR-AGG-01..04 | Sections 6, 9, 12 |
| FR-PLAN-01..06 | Section 9 |
| FR-APPLY-01..07 | Sections 5, 10, 11, 13, 14 |
| FR-DISCARD-01..03 | Sections 4, 5, 13, 15.5 |
| I1..I10 | Sections 5 through 14 |
| NFR-APPLY-01..05 | Sections 3, 6, 8, 9, 14, 15 |

## 17. Future Validation Service Boundary

Aggregate completeness, ownership correctness, reverse-dependency analysis,
shared-reference safety, and optimistic concurrency are future work.

That work shall be specified as a separate service with its own requirements.
When integrated into apply, it may execute within the same handler-owned
transaction before commit so that a validation failure rolls back explicit
writes and database cascade effects. It shall not mutate edit actions to repair
the staged projection unless a later requirement explicitly adds that behavior.
