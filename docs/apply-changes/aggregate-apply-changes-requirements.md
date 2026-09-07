# Aggregate Apply-Changes Framework: Requirements

**Date:** 2026-09-14
**Status:** Frozen

## 1. Context

### 1.1 Problem statement

The system must apply the current staged changes from the active edit session to
the permanent SQLite tables.

The first implementation must:

- ignore stale and unstaged edit actions;
- combine the current changes for each supported target row;
- use explicit core-layer rules for targets that cannot be addressed by a
  single `systemId`;
- order the staged physical operations deterministically;
- execute permanent writes, commit recording, and action cleanup atomically;
- preserve all edit-session rows when apply fails.

V1 does not prove that the staged actions form a complete aggregate. Aggregate
completeness and broader semantic validation are responsibilities of a future
validation service.

### 1.2 Current data sources

The framework builds on:

- `project_sessions`;
- `edit_actions`;
- `session_commits`;
- current TypeORM entity schemas and their foreign-key behavior;
- `aggregateId`, `targetTable`, `targetSystemId`, `fieldPath`, `operation`,
  `changeStatus`, and `validUntil`.

`session_entity_versions` is not part of the v1 apply decision.

## 2. Definitions

| Term | Definition |
|---|---|
| Current edit action | An `edit_actions` row where `valid_until IS NULL`. |
| Stale edit action | An `edit_actions` row where `valid_until IS NOT NULL`. |
| Apply candidate | A current edit action whose `changeStatus` is `STAGED`. |
| Generic target | A target row that can be loaded and written using `systemId = targetSystemId`. |
| Special target | A target whose physical identity or merge behavior requires an explicit target-specific rule. |
| Apply rule | A core-layer rule that groups and reduces actions for one target type and produces a physical mutation description. |
| Apply decision | The final physical-row decision: `CREATE`, `UPDATE`, or `DELETE`. |
| Staged operation graph | A dependency graph containing only physical operations produced from current staged actions. |

## 3. Functional Requirements

### 3.1 Edit-action selection and folding

#### FR-EDIT-01: Ignore stale actions

Apply shall ignore every edit action where `valid_until IS NOT NULL`.

Stale rows shall not influence folding, operation ordering, permanent writes,
or successful cleanup.

#### FR-EDIT-02: Apply only current staged actions

Only current actions whose `changeStatus` is `STAGED` shall be applied to
permanent tables.

Current `UNSTAGED` actions shall remain unchanged and shall not produce an
apply operation.

#### FR-EDIT-03: Preserve table-qualified action slots

An edit slot shall include `targetTable` as well as `targetSystemId` and
`fieldPath`.

Reading or superseding a current action shall not match an action for another
target table merely because the numeric system ID and field path are equal.

#### FR-EDIT-04: Combine current changes deterministically

The registered apply rule shall combine all applicable current actions for one
physical target into one deterministic effective decision.

For generic targets, the grouping key is `(targetTable, targetSystemId)`. For a
special target, its registered rule defines the grouping key using the action's
existing target ID and payload contract.

A later update to one field shall not remove an earlier current update to a
different field.

#### FR-EDIT-05: Resolve terminal deletion

If the effective operation for a target is `DELETE`, earlier updates for that
same target shall not be applied separately.

A target created and then deleted in the same session shall produce no
permanent operation. Edit producers are responsible for assigning a new ID to
a replacement entity rather than recreating a deleted identity.

#### FR-EDIT-06: Preserve failed operations

If any part of apply fails, all permanent writes, cascade effects, commit
records, and cleanup changes shall roll back.

Current staged rows, current unstaged rows, and stale history shall remain
available for retry.

### 3.2 Apply-rule registration

#### FR-RULE-01: Keep merge policy in core

Rules that determine action grouping, reduction, required payload fields, and
physical mutation intent shall be defined in `@arc/core` without importing
TypeORM, NestJS, or Node.js APIs.

The persistence adapter shall execute the mutation produced by the rule; it
shall not independently reinterpret edit-session semantics.

#### FR-RULE-02: Support generic system-ID targets

A generic rule shall support entities whose TypeORM schema can be loaded,
updated, and deleted by `systemId = targetSystemId`.

#### FR-RULE-03: Use explicit rules for special targets

A target that cannot be safely addressed through `systemId` shall have a
dedicated rule before its edit actions can be applied.

The initial special-target set includes composite value relationships such as:

- `UsecaseGkvValues`;
- `CkvValues`;
- `TkvValues`;
- `SgkvValues`;
- `DkvValues`;
- any other registered edit target whose schema identity is not `systemId`.

Each special rule shall define:

- how its actions are grouped into one physical row decision;
- which action fields contain every required key component;
- how create and update values are formed;
- the complete criteria used to load, update, or delete the row;
- dependency edges to other staged operations when ordering is required.

### 3.3 Aggregate families and staged dependencies

#### FR-AGG-01: Use aggregate ownership as rule context

`aggregateId` shall be used to group, order, and log related staged actions.
It is not proof that all required aggregate children or relationships are
present in the staged action set.

#### FR-AGG-02: Cover supported aggregate families

The rule registry and staged dependency rules shall cover the target entities
currently supported by the edit repositories for these families:

- `UseCase` and its staged membership, pair, and GKV actions;
- `SpfModule`, node, port, intent, property, CKV, TKV, payload, value, and tag
  mapping actions;
- `Subgraph`, property, SGKV, and VCPM actions;
- `Container` and container-property actions;
- `Subsystem` and subsystem-link actions;
- `DataLink` and `ControlLink` actions;
- SPF and Driver definition actions;
- key, value, and tag definition actions.

#### FR-AGG-03: Keep ModulePropertyDefinition in the SPF definition family

`ModulePropertyDefinition` shall remain part of the
`SpfModuleDefinition` aggregate family.

`SpfModulePropertiesData` references that definition and remains module-owned
data. V1 apply shall not perform a separate preflight rejection when a staged
property-definition delete has consumers; the configured database foreign-key
behavior applies inside the transaction.

#### FR-AGG-04: Do not infer missing actions

Apply shall neither synthesize missing child or relationship actions nor fail
solely because an aggregate's staged action set is incomplete.

Only current staged actions produce explicit operations. Additional physical
effects caused by configured database cascades are permitted.

### 3.4 Planning and ordering

#### FR-PLAN-01: Build a staged operation graph

Apply shall build an operation graph from the physical mutations produced by
the registered rules for current staged actions.

Unchanged aggregate children, unstaged actions, and inferred relationship
changes shall not be added as operation nodes in v1.

#### FR-PLAN-02: Order staged dependencies

When two staged operations have a registered dependency, apply shall order
them as follows:

- create referenced parents or definitions before dependent rows;
- create endpoints before staged relationship rows;
- delete staged relationship or child rows before staged parent rows;
- process SPF definition children, including `ModulePropertyDefinition`, in
  the registered SPF definition order.

When a required row is not produced by a staged operation, apply shall
assume it is already present or will be handled by the database constraint or
cascade behavior.

#### FR-PLAN-03: Produce one operation per physical target

After rule-specific reduction, the plan shall contain at most one explicit
operation for each physical target identified by that rule.

#### FR-PLAN-04: Use deterministic ordering

The same current staged actions shall produce the same apply order.

The fixed execution phases in `FR-PLAN-06` take precedence. Dependencies and a
stable target/key tie-breaker determine order within a phase.

#### FR-PLAN-05: Preserve every staged physical target

After rule-specific folding for the same physical target, apply shall
retain every mutation produced from a current staged action.

A staged aggregate-root delete shall not suppress a staged `CREATE`, `UPDATE`,
or `DELETE` for a different physical target, including an owned child. Apply
shall order all such mutations using registered dependencies and allow database
constraints or cascades to determine the transaction outcome.

#### FR-PLAN-06: Follow the fixed merge phase order

Every mutation produced from a current staged action shall be assigned to one
of these phases and executed in this order:

| Phase | Ordered staged operation groups |
|---|---|
| 1. Graph and runtime deletes | Data-link deletes; control-link deletes; SPF module-family deletes; container-family deletes; subgraph-family deletes; subsystem-family deletes. |
| 2. Definition updates and creates | Graph key update then create; calibration key update then create; tag definition update then create; property definition update then create; supporting processor/container/subgraph/VCPM definition update then create; SPF module-definition update then create; Driver module-definition update then create. |
| 3. Graph and runtime updates and creates | SPF module-family updates; subgraph-property updates; link updates; container updates; subgraph creates; container creates; SPF module-family creates; use-case updates then creates; data-link creates; control-link creates; subsystem creates then updates; subgraph metadata updates; use-case deletes. |
| 4. Miscellaneous updates and creates | `UseCaseCategory` update then create; `ModuleManagerData` update then create; Driver module data update then create. |
| 5. Definition deletes | Graph key deletes; calibration key deletes; tag definition deletes; property definition deletes; supporting definition deletes; SPF module-definition deletes; Driver module-definition deletes. |

There is no standalone miscellaneous-delete phase. Staged deletes for
`UseCaseCategory`, `ModuleManagerData`, and Driver module data shall use the
execution slot of their owning aggregate family and be ordered with the other
staged mutations in that family.

An empty group or phase shall be skipped. A concept without a registered
backend target produces no operation. Within a family, its registered rule
shall provide the foreign-key-safe order for the staged physical rows.

The phase order shall never be used to omit or suppress a current staged
mutation. If a registered dependency conflicts with the fixed phase order,
ordering shall fail before permanent writes begin.

### 3.5 Persistence and transaction behavior

#### FR-APPLY-01: Validate supported action shape before writing

Before the first permanent write, apply shall validate that every candidate
has a registered rule and satisfies that rule's required operation and payload
shape.

Aggregate completeness, reverse-dependency correctness, and optimistic version
validation are not part of this v1 check.

#### FR-APPLY-02: Use native TypeORM writes

The persistence adapter shall use the QueryRunner-bound EntityManager and the
target's TypeORM repository or query builder.

Generic targets shall use `systemId` criteria. Special targets shall use the
complete criteria produced by their registered core rule.

#### FR-APPLY-03: Preserve database cascade behavior

Apply shall permit the current TypeORM schema's `CASCADE` and `RESTRICT`
behavior to take effect. It shall not require an explicit staged action for
every row affected by a cascade.

#### FR-APPLY-04: Apply atomically

All permanent writes, database cascade effects, the successful
`session_commits` record, and successful edit-action cleanup shall occur in one
handler-owned transaction.

Any rule, database, commit-record, or cleanup failure shall roll back the
complete transaction.

#### FR-APPLY-05: Clean up only after successful writes

After all physical operations succeed, applied current staged actions shall no
longer be eligible for re-application.

Current unstaged actions and stale history shall remain unchanged.

#### FR-APPLY-06: Report failures with action context

A failed apply shall identify the target table, target ID, aggregate ID, and
special-rule key fields when available.

The error shall distinguish unsupported targets, invalid action payloads,
invalid rule output, dependency cycles among staged operations, and database
failures.

## 4. Invariants

**I1 - Stale rows are ignored:** `valid_until IS NOT NULL` rows never
participate in apply.

**I2 - Only staged rows apply:** Current unstaged rows never produce permanent
operations.

**I3 - Action slots are table-qualified:** Current-row lookup and supersession
include `targetTable`.

**I4 - Core owns merge policy:** Persistence executes rule output and does not
invent target-specific merge behavior.

**I5 - One explicit operation per target:** Rule reduction emits at most one
explicit operation for each physical target.

**I6 - Apply is deterministic:** The same staged action set produces the same
operation set and order.

**I7 - Apply is atomic:** Any failure rolls back explicit writes, database
cascades, commit recording, and cleanup.

**I8 - Failed apply preserves session state:** Retry sees the same current
staged and unstaged actions.

**I9 - Successful actions are not reapplied:** Applied staged actions are
retired only after all writes succeed.

## 5. Non-functional Requirements

**NFR-APPLY-01:** Apply shall query current staged actions directly rather than
loading the entire file.

**NFR-APPLY-02:** Rule registration and operation ordering shall be
deterministic.

**NFR-APPLY-03:** Core apply rules shall remain free of TypeORM, NestJS, and
Node.js dependencies.

**NFR-APPLY-04:** Structured errors and logs shall include the target table,
aggregate ID, and entity identifiers. Entity IDs shall follow the repository's
hexadecimal logging convention.

**NFR-APPLY-05:** Apply shall be retry-safe after rollback without rebuilding
edit actions.

## 6. Out of Scope for V1

- Aggregate child-action completeness validation.
- Automatic generation of missing child or relationship actions.
- Reverse-dependency and shared-reference correctness validation beyond
  registered ordering rules and database constraints.
- Optimistic concurrency through entity `version` columns or
  `session_entity_versions`.
- Changing the `edit_actions` identity schema.
- Changing existing foreign-key cascade or restrict behavior.
- The diff comparison algorithm.
- New write APIs that create edit actions.
- Read-overlay behavior.
- Undo/redo behavior.
- Cross-file merge matching.
- Partial commit of successful operations.

## 7. Future Work

A separate aggregate-validation service may later inspect the staged projection
and committed state for completeness, ownership, shared-reference safety,
reverse dependencies, and semantic correctness.

If invoked within the apply transaction before commit, a validation failure
shall roll back all permanent writes and database cascade effects. That service
shall not be partially specified or implemented as an optional completion
service in v1.

Optimistic concurrency may be added later as a separate requirement. It must
define version ownership for both single-ID and composite-key targets before
`session_entity_versions` participates in apply.

## 8. Examples

### Example 1 - Current staged filtering

For one session:

- a current staged `SpfModule` alias update is applied;
- a current unstaged `DataPort` update is ignored and retained;
- a stale `CkvParameterPayload` update is ignored and retained as history.

### Example 2 - Same numeric ID in different tables

`SpfModule(50)` and `Node(50)` each have a current accumulator action.

The action slots remain independent because current-row lookup and
supersession include `targetTable`. Both actions can produce separate physical
operations.

### Example 3 - Composite value relationship

A `CkvValues` action uses the dedicated `CkvValues` rule. The rule obtains
`ckvSystemId` and `valueDefSystemId` from its defined action contract, groups
the action by that pair, and produces TypeORM criteria containing both values.

The generic `systemId` rule is not used for this target.

### Example 4 - Incomplete aggregate action set

A module update has only a current staged `SpfModule` action. Apply does not
require staged port, property, or calibration actions and does not synthesize
them. It applies the module operation if its registered rule and database
constraints permit it.

### Example 5 - Database cascade and rollback

A staged root delete causes schema-defined child cascades. If a later staged
operation fails, the handler rolls back the transaction, including the root
delete, cascaded child deletes, commit record, and edit-action cleanup.
