# Routing Contract and UseCase Change-Details Design

**Requirements:**
[`../requirements/routing-contract-and-change-details-requirements.md`](../requirements/routing-contract-and-change-details-requirements.md)

## 1. Decision Summary

1. Keep pre-engine scope derivation in the handlers, but pass only normalized execution
   data into `RoutingEngine`.
2. Remove mutable exclusion copies from `RoutingContext`; `context.input` is the single
   immutable source.
3. Have the routing command return explicit `UsecaseChangeDescriptor` values rather
   than client-facing snapshots.
4. Have each API controller pass those descriptors through `QueryBus` to the existing
   change-details query.
5. Reconstruct `before` from committed state and `after` from the complete latest active
   session overlay.
6. Return one unified `{changes, issues, groupId}` response from both create endpoints.
7. Preserve successful edit actions if response projection fails after one retry.
8. Assume mutating calls in one active edit session execute sequentially.

## 2. Alternatives

### 2.1 Build rich snapshots inside the routing engine

The engine could carry aliases, categories, resolved GKV display values, and complete
link read models through its phases.

Rejected because these are presentation concerns that routing does not otherwise need.
They would enlarge `RoutingContext`, couple algorithm state to client contracts, and
reintroduce the redundancy this change removes.

### 2.2 Query change details by `groupId`

The controller could run the command and then ask the query service to rediscover changed
UseCases from all actions sharing the returned group.

Rejected for the create responses because the routing stager already knows the exact
changed UseCases, operations, sources, and canonical change IDs. Rediscovery is indirect
and could include unrelated UseCase actions sharing the group.

`groupId` remains edit-action and response correlation metadata.

### 2.3 Project emitted changes through the query path

The handler returns explicit change descriptors. The controller sends them through
`QueryBus`; persistence loads the committed and latest-overlay representations and maps
the rich read model.

Selected. This retains one snapshot projection path without polluting routing state or
rediscovering command results.

### 2.4 Compensate if response projection fails

The API could delete every edit action in the group after a post-command read failure.

Rejected. That would be a second, fallible compensating transaction and could destroy
valid accepted work because a read failed. If strict all-or-nothing projection were ever
required, projection would need to move inside the command transaction so ordinary
rollback—not compensation—provides atomicity.

## 3. Routing Input

### 3.1 Final shared contract

```typescript
interface RoutingRequestPolicy {
  readonly requestedSubgraphSystemIds: ReadonlySet<number>;
  readonly explicitlyExcludedSubgraphSystemIds: ReadonlySet<number>;
  readonly explicitlyExcludedDataLinkSystemIds: ReadonlySet<number>;
  readonly explicitlyExcludedControlLinkSystemIds: ReadonlySet<number>;
}

interface RoutingSubgraph {
  readonly subgraph: Subgraph;
  readonly requestedSgkvs: readonly (readonly number[])[];
  readonly isMdf: boolean;
}

interface RoutingGraphSnapshot {
  readonly subgraphs: readonly RoutingSubgraph[];
  readonly routableDataLinks: readonly DataLink[];
  readonly routableControlLinks: readonly ControlLink[];
  readonly overlayDataLinks: readonly DataLink[];
  readonly overlayControlLinks: readonly ControlLink[];
  readonly committedUsecases: readonly UseCase[];
  readonly sessionEdits: GraphEditSummary;
}

interface RoutingInputBase {
  readonly selectedUsecases: readonly UseCase[];
  readonly requestPolicy: RoutingRequestPolicy;
  readonly graphSnapshot: RoutingGraphSnapshot;
  readonly fileSystemId: number;
}
```

`requestPolicy` retains explicit caller intent. The builder applies that policy once to
the effective overlay and returns the sole routability authority in `graphSnapshot`.
Snapshot arrays and nested SGKV arrays are copied/frozen containers while domain entities
remain borrowed immutable references.

Automatic and manual variants retain their existing discriminator and mode-specific
data:

```typescript
interface AutoRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Auto;
}

interface ManualRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Manual;
  readonly manualTopology: ManualTopology;
}
```

`ManualTopology` uses the separately approved pair-local support contract.

`RoutingGraphSnapshotBuilder` performs one overlay subgraph read, one overlay data-link
read, one overlay control-link read, one committed UseCase read, and one MDF classification
pass. `ManualPairDiscoveryService` and `PreValidationService` consume the prepared data
without repository access.

### 3.2 Removed fields

Remove these fields from `RoutingInputBase`, `RoutingInputInit`, and input-copy helpers:

- `selectedUsecaseSystemIds`;
- `selectedScopeSubgraphs`;
- the ambiguously named `inputSubgraphs` field;
- `outOfSelectionSubgraphs`;
- `effectiveRoutingScope`; and
- the top-level `excludedSubgraphSystemIds` field.

The selected IDs have already been resolved into `selectedUsecases`. Derived scope and
effective exclusion sets are construction-local. The original requested-ID and explicit
exclusion facts survive only in `requestPolicy`; consumers use `graphSnapshot` rather than
reconstructing routability.

### 3.3 Handler-local derivation

`deriveRoutingScope()` remains a pure pre-engine helper. Its complete result is available
to handlers for:

- selected-scope completeness validation;
- missing-SG errors;
- manual selected/out-of-selection candidate authorization;
- explicit and session-deleted SG removal; and
- passing effective active selections to `RoutingGraphSnapshotBuilder`.

The handler passes effective active selections and session edits to the shared snapshot
builder. Only `requestPolicy`, `selectedUsecases`, and the resulting `graphSnapshot` cross
the engine boundary. Manual discovery receives snapshot-owned subgraphs and routable links
directly.

Phases that need the effective SG ID set derive it locally from
`context.input.graphSnapshot.subgraphs` rather than receiving a second stored set.

## 4. Routing Context

Remove these members and their constructor copies:

```typescript
excludedDataLinkSystemIds: Set<number>
excludedControlLinkSystemIds: Set<number>
excludedSubgraphSystemIds: Set<number>
```

Phases read request policy and prepared routable collections from `context.input`. A phase
that needs constant-time membership may create a private local set. There is no
context-level second source of truth or mutable graph cache.

All distinct phase outputs remain. Stubbed fields are not deleted merely because their
owning phase has not yet been implemented.

## 5. Command Result

### 5.1 Emitted change descriptor

Phase 11 records one descriptor per changed UseCase:

```typescript
interface UsecaseChangeDescriptor extends UsecaseChangeRef {
  readonly operation: Exclude<
    ChangeOperation,
    typeof CHANGE_OPERATION.None
  >;
  readonly source: Source;
}
```

The descriptor contains:

- `systemId`: changed UseCase ID;
- `changeId`: canonical root/aggregate change ID returned by staging;
- `operation`: `CREATE`, `UPDATE`, or `DELETE`; and
- `source`: `MANUAL`, `AUTO_ROUTING`, or `DIFF_TOOL`, exactly as written.

The stager—not the query—owns these values. It must emit exactly one descriptor per
changed UseCase and preserve deterministic routing order.

### 5.2 Internal routing outcome

```typescript
interface RoutingOutcome {
  readonly emittedChanges: readonly UsecaseChangeDescriptor[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}
```

Remove `created`, `updated`, and `markedForDeletion`. Those collections redundantly encode
the operation now carried by each descriptor.

`ResponseBuilder` returns the emitted descriptors collected by Phase 11 plus warnings and
the command write-context `groupId`. It does not build client snapshots.

## 6. Change-Details Contract

The core query read model becomes:

```typescript
interface UsecaseChangeDetails {
  readonly systemId: number;
  readonly changeId: number;
  readonly operation: ChangeOperation;
  readonly source: Source;
  readonly before: UsecaseChangeSnapshot | null;
  readonly after: UsecaseChangeSnapshot | null;
}

interface UsecaseChangeSnapshot {
  readonly isEc: boolean;
  readonly gkv: readonly KeyValuePairReadModel[];
  readonly alias: string | null;
  readonly aliasId: number | null;
  readonly categories: readonly string[];
  readonly subgraphSystemIds: readonly number[];
  readonly dataLinks: readonly DataLinkReadModel[];
  readonly controlLinks: readonly ControlLinkReadModel[];
}
```

Remove snapshot `systemId`, `type`, and `subgraphPairs`. Retain `subgraphSystemIds` so
clients can reconstruct the UseCase topology represented by each snapshot.

Snapshot `isEc` is `usecase.type === USECASE_TYPE.Ec`. A null stored type projects to
`false`. Per-link EC state remains in `DataLinkReadModel` because it describes a different
level of classification.

The existing data/control link read models are reused. They already provide component,
port, link-type, EC, and control heap information required by a drawing client.

## 7. Query Contract and Data Flow

### 7.1 Query input

Replace the query's `groupId` input with emitted descriptors:

```typescript
class GetUsecaseChangeDetailsQuery extends BaseQuery {
  constructor(
    readonly projectId: string,
    readonly clientId: string,
    readonly emittedChanges: readonly UsecaseChangeDescriptor[],
  ) {}
}
```

The handler continues resolving the current file and authorization context. It calls:

```typescript
usecaseQueryService.getChangeDetails(fileId, emittedChanges)
```

The query rejects duplicate UseCase IDs in its trusted internal input as an invariant
failure rather than silently returning duplicate snapshots.

### 7.2 Batched reconstruction

For the unique emitted UseCase IDs, persistence performs these batched reads:

1. Load committed UseCases without applying the active session.
2. Load the complete latest UseCase overlay from the active session.
3. Collect internal subgraph pairs independently from each view.
4. Load committed data/control links needed by the committed pair set.
5. Load latest-overlay data/control links needed by the overlay pair set.
6. Resolve all distinct GKV value IDs for both views in bulk.
7. Project one details record per emitted descriptor, preserving descriptor order.

The implementation may over-fetch link candidates in a bounded batched query and then
apply exact pair matching in memory. It must not issue one query per UseCase or per pair.

### 7.3 Snapshot semantics

For each emitted descriptor:

- `before` is projected from committed state only;
- `after` is projected from the complete latest session overlay;
- `CREATE` requires `before === null` and a non-null `after`;
- `UPDATE` requires non-null `before` and `after`; and
- `DELETE` requires a non-null `before` and `after === null`.

An inconsistent operation/view combination is a projection failure. The query does not
repair or reinterpret the stager's operation.

### 7.4 Supporting-link matching

Pairs remain private reconstruction data:

- A data link supports a pair only when source and destination SG IDs match direction.
- A control link supports a pair when its SG endpoints match in either order.
- Every matching effective link is returned, including multiple links per pair.
- Results are deduplicated by link `systemId` and sorted by ascending `systemId`.

The mapping removes SG IDs/pairs from the public snapshot after selecting links.

### 7.5 Source and metadata

`systemId`, `changeId`, `operation`, and `source` come from the emitted descriptor. The
query does not inspect action history to rediscover these values. Persistence reads are
only for committed/latest entity state and display projection.

## 8. API Orchestration

Both existing controller methods use the same orchestration:

```text
dispatch routing command
  -> RoutingOutcome
dispatch GetUsecaseChangeDetailsQuery with outcome.emittedChanges
  -> UsecaseChangeDetails[]
return {changes, issues: outcome.issues, groupId: outcome.groupId}
```

The API layer dispatches through `CommandBus` and `QueryBus`; it never calls a persistence
query service directly. A shared private helper or small API-layer collaborator prevents
the auto and manual methods from duplicating retry and response composition logic.

The response contract for both endpoints is:

```typescript
interface CreateUsecasesResponse {
  readonly changes: readonly UsecaseChangeDetails[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}
```

The API DTO owns public ID serialization and Swagger decoration. Core remains independent
of NestJS and Swagger.

## 9. Failure and Concurrency Behavior

If the command fails, the controller does not dispatch the details query.

If the command succeeds and the first details query fails with an explicitly classified
transient persistence/read error, the API orchestration retries the identical query once.
It does not rerun routing. Authorization, validation, invariant, and other permanent
failures are not retryable. The API mapping uses one explicit retryability predicate/error
classification rather than retrying every failed `Result`.

If the retry fails:

- preserve the successful edit actions;
- return a server error containing `groupId`;
- include an explicit issue saying routing succeeded but response projection failed; and
- do not automatically delete or compensate the command group.

The client can choose an explicit session/group recovery action. A read failure does not
silently destroy accepted work.

Mutating requests for one active edit session are assumed sequential. This design adds no
session mutex, revision token, or optimistic check around the command-then-query window.

## 10. Testing

### 10.1 Routing contract tests

Update the existing routing-contract unit test to:

- construct the lean input;
- stop asserting removed scope fields;
- stop asserting copied context exclusion sets; and
- assert emitted descriptors and operation/source preservation where the existing test
  already covers outcomes.

Do not add a new test file solely for these field removals.

### 10.2 Persistence integration tests

Expand the existing `db-usecase-query-service.spec.ts` suite to cover:

- emitted-descriptor input and order preservation;
- committed `before` versus latest-overlay `after` with multiple action groups;
- create/update/delete nullability;
- all three source values;
- EC/non-EC projection;
- directed data-link and unordered control-link matching;
- multiple supporting links, deduplication, and deterministic ordering; and
- links added/deleted anywhere in the active session.

### 10.3 API tests

Update existing endpoint/Swagger tests if present. Because the rich response is behavioral
API work rather than a minor field cleanup, add one focused contract/e2e suite if no
existing suite covers these currently stubbed endpoints. Verify both endpoints expose
`{changes, issues, groupId}` and no longer declare operation-grouped arrays.

### 10.4 Failure tests

Verify that:

- a command failure skips projection;
- one retry occurs for a retryable projection failure;
- a second failure returns the projection issue and `groupId`; and
- no compensation command or group deletion is dispatched.

## 11. Documentation Updates

Integrate this design into the durable project documentation:

- `design/overall-design.md`;
- `plans/pr-02/pr-02-scaffolding-design.md`;
- `plans/pr-02/pr-02-scaffolding-implementation-plan.md`;
- `design/diagrams/03-routing-context-data-flow.md`;
- `design/lld/lld1-kv-resolution-cone.md`;
- `design/lld/lld4-deletion-transition.md`;
- `design/persistence-overlay-and-mdf-refactor-design.md`;
- `auto-usecase-routing-requirements.md`;
- `auto-usecase-routing-requirements-extended.md`; and
- the manual topology documents where old scope-storage wording remains.

Historical legacy-test mapping remains unchanged. The structural-update API keeps its own
separate response contract; only comparisons claiming create endpoints return compact
references need correction.

This requirements document and design remain in the repository until implementation is
complete and the user explicitly approves their deletion.
