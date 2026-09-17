# Routing Contract and UseCase Change-Details Requirements

## 1. Purpose

Remove redundant routing state and replace the storage-oriented UseCase change snapshot
with an internal client-oriented read model. This work builds on the approved manual
topology contract in
[`manual-topology-discovery-requirements.md`](./manual-topology-discovery-requirements.md).

## 2. Scope

This change covers:

- `RoutingInput` normalization;
- duplicate state in `RoutingContext`;
- the core `UsecaseChangeDetails` read model;
- persistence reconstruction of before/after UseCase snapshots; and
- the create-usecases and create-manual-usecases response contracts; and
- associated unit and persistence integration tests.

This change does not add another REST endpoint. The existing create-usecases and
create-manual-usecases endpoints shall return the revised rich change details.

## 3. Terminology

- **Effective active subgraphs:** caller selections remaining after excluded and
  session-deleted subgraphs have been removed.
- **Selected UseCase snapshot:** the effective-overlay `UseCase` entities loaded once by
  the handler for the selected UseCase IDs.
- **Committed baseline:** persisted file state without the active session overlay.
- **Latest session overlay:** committed state plus all currently effective edit actions
  in the one active edit session.
- **Supporting link:** an effective link whose subgraph endpoints match a stored UseCase
  subgraph pair at the applicable change boundary.
- **Change source:** the `edit_actions.source` provenance of the UseCase change, using
  `MANUAL`, `AUTO_ROUTING`, or `DIFF_TOOL`.

## 4. Routing Input Requirements

### RI-01: Execution-only boundary

`RoutingInput` shall contain immutable normalized execution information plus only the
minimum original-request policy facts required by routing-phase validation. Other
request-correlation and pre-normalization values remain local to the handler.

### RI-02: Shared fields

The shared routing input shall retain:

- `mode`;
- `activeSubgraphs`, containing only effective active subgraphs;
- `scopePolicy.requestedSubgraphSystemIds`, containing the SG IDs from the original
  `activeSubgraphs` request before filtering;
- `scopePolicy.excludedSubgraphSystemIds`, preserving explicit SG-exclusion intent;
- `selectedUsecases`, loaded once from the effective overlay;
- `excludedDataLinkSystemIds`;
- `excludedControlLinkSystemIds`; and
- `graphEdits`.

### RI-03: Removed fields

The shared routing input shall not contain:

- `selectedUsecaseSystemIds`, because `selectedUsecases` carries the resolved selection;
- `selectedScopeSubgraphs`, because it is derived from `selectedUsecases`;
- the ambiguously named `inputSubgraphs`; its irreducible original-request meaning is
  retained as `scopePolicy.requestedSubgraphSystemIds`;
- `outOfSelectionSubgraphs`, because it is needed only during pre-engine scope/manual
  topology derivation;
- `effectiveRoutingScope`, because it duplicates the system IDs in normalized
  `activeSubgraphs`; and
- top-level `excludedSubgraphSystemIds`, replaced by the scoped policy field.

The explicit SG exclusion set is not discarded: it remains under `scopePolicy` because
deletion-side validation must distinguish an omitted endpoint from one the client
explicitly excluded.

### RI-04: Handler-local scope derivation

The handler may derive selected, out-of-selection, effective, and missing scope sets while
validating the request and preparing manual topology. Those temporary values shall not be
copied into `RoutingInput`. Later phases derive them from `selectedUsecases`, normalized
`activeSubgraphs`, and the minimal `scopePolicy` facts.

### RI-05: Mode-specific fields

- Automatic input shall retain the committed pre-run `islandUcs` catalog.
- Manual input shall retain the approved pair-local `manualTopology` containing
  supporting `DataLink` or `ControlLink` entities.

## 5. Routing Context Requirements

### RC-01: Single source of input truth

Routing phases shall read immutable request and exclusion data through `context.input`.

### RC-02: Removed exclusion copies

`RoutingContext` shall not copy these input arrays into mutable sets:

- `excludedDataLinkSystemIds`;
- `excludedControlLinkSystemIds`; and
- `excludedSubgraphSystemIds`.

If a phase needs set-based lookup, it may create a private local set or use a shared
immutable helper without storing a second authoritative value in the context.

### RC-03: Phase state

Distinct phase outputs shall remain in `RoutingContext` even when their implementations
are currently stubbed. A field shall not be removed merely because its owning PR has not
yet been implemented.

### RC-04: Context exclusions

`RoutingContext` shall not contain repositories, a `UnitOfWork`, ORM rows, request-only
validation data, or a complete graph/link cache. The approved normalized manual topology
is the limited exception for pair-supporting domain links.

## 6. Change-Details Contract Requirements

### CD-01: Details envelope

`UsecaseChangeDetails` shall contain:

```typescript
interface UsecaseChangeDetails {
  readonly systemId: number;
  readonly changeId: number;
  readonly operation: ChangeOperation;
  readonly source: Source;
  readonly before: UsecaseChangeSnapshot | null;
  readonly after: UsecaseChangeSnapshot | null;
}
```

`source` shall use the existing `edit_actions.source` vocabulary unchanged:
`MANUAL`, `AUTO_ROUTING`, or `DIFF_TOOL`. It describes the displayed change, not an
intrinsic column on the persisted UseCase.

### CD-02: Snapshot shape

Each non-null `UsecaseChangeSnapshot` shall contain only state that can differ across the
change boundary:

```typescript
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

The existing full link read models are reused because they contain the component and port
identifiers required to draw links. No duplicate snapshot-specific link model is added.

### CD-03: Snapshot topology and excluded fields

The snapshot shall expose `subgraphSystemIds` so clients can reconstruct the UseCase
topology at each side of the change boundary. The snapshot shall not expose:

- `systemId`, because it is already present on the details envelope;
- `type`, because clients only need EC classification;
- `subgraphPairs`.

Subgraph pairs remain an internal persistence structure used to reconstruct supporting
links.

### CD-04: EC projection

`isEc` shall be a non-null boolean. It is `true` only when the reconstructed UseCase type
is `EC`; `LINKED`, `ISLAND`, and a missing/null stored type project to `false`.

The per-data-link `isEc` field remains available in `DataLinkReadModel`; it describes the
individual link, while snapshot `isEc` describes the UseCase classification.

### CD-05: Source projection

The routing stager shall return one `UsecaseChangeDescriptor` per changed UseCase containing
the authoritative `systemId`, canonical `changeId`, `operation`, and `source`. Snapshot
projection shall consume this metadata directly and shall not rediscover it by querying
all actions for `groupId`.

### CD-06: Before/after semantics

- `before` represents the committed UseCase and supporting links without any active
  session actions.
- `after` represents the complete latest session overlay, including all currently
  effective actions in the active session.
- The supplied `UsecaseChangeDescriptor` values select the affected UseCases and supply
  operation metadata and source.
- `groupId` remains response and edit-action correlation metadata only.
- `CREATE` requires `before = null` and a non-null `after`.
- `UPDATE` requires non-null `before` and `after`.
- `DELETE` requires a non-null `before` and `after = null`.
- Any other operation/snapshot combination is a projection invariant failure.

### CD-07: Link membership

For each non-null snapshot, the query shall return every effective data link and control
link whose subgraph endpoints match one of that snapshot's stored UseCase pairs.

- Data-link matching respects stored pair direction.
- Control-link matching treats pair endpoints as an unordered relationship.
- Multiple links supporting one pair are all returned.
- Duplicate links are returned once by `systemId`.
- Link arrays use deterministic ascending `systemId` order.

The query shall resolve `before` links from committed rows and `after` links from the
latest effective session overlay. It shall not apply a partial historical action replay
bounded by the requested group.

### CD-08: Storage independence

No new UseCase-to-link membership table or `use_cases.source` column shall be added.
Stored subgraph pairs remain the internal association mechanism, and edit-action source
remains the provenance mechanism.

## 7. Compatibility and Quality Requirements

### CQ-01: Unified create response

Both create-usecases and create-manual-usecases shall return the same application response
shape:

```typescript
interface CreateUsecasesResponse {
  readonly changes: readonly UsecaseChangeDetails[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}
```

The previous `created`, `updated`, and `markedForDeletion` collections shall be removed.
`UsecaseChangeDetails.operation` provides the non-redundant operation discriminator.

### CQ-02: Command/query orchestration

The routing command result shall contain:

```typescript
interface RoutingOutcome {
  readonly emittedChanges: readonly UsecaseChangeDescriptor[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}
```

The API controller shall dispatch the routing command through `CommandBus`, then dispatch
`GetUsecaseChangeDetailsQuery` through `QueryBus` using `projectId`, `clientId`, and the
returned `emittedChanges`. The query handler resolves and authorizes the current file,
then calls the persistence query service with `fileId` and `emittedChanges`. The
controller shall combine the projected details with command issues and `groupId`. It
shall not call a persistence query service directly.

If the command succeeds but snapshot projection fails, the API orchestration shall perform
one bounded retry only for an explicitly classified transient persistence/read failure.
Authorization, validation, invariant, and other permanent failures are not retryable. If
projection still fails, the successful edit actions shall not be deleted or compensated.
The API shall return a server error containing the `groupId` and an explicit issue stating
that routing succeeded but response projection failed. The client may explicitly discard
the group/session; the server shall not destroy accepted work because response projection
failed.

### CQ-03: Architecture boundaries

- Core read models shall remain framework- and TypeORM-independent.
- Persistence shall map rows/domain data to core read models.
- Routing shall continue through CQRS handlers and the existing 12-phase engine.
- Routing shall not retain alias/category/display metadata solely for response mapping.

### CQ-04: Query behavior

The change-details query shall avoid per-UseCase and per-pair N+1 link queries. It shall
batch committed and latest-overlay reconstruction for the UseCases identified by the
supplied emitted changes.

Mutating requests for one active edit session are assumed to execute sequentially. This
change does not add a session revision check or cross-request locking around the
command-then-query response flow.

### CQ-05: Tests

Minor routing-contract cleanup shall update existing tests to match the normalized
structure; it shall not introduce new test files or redundant test cases solely for
field removal. Existing change-details integration tests shall be expanded for the new
read behavior.

Updated tests shall cover:

- normalized routing input without removed fields;
- context initialization without copied exclusion sets;
- `MANUAL`, `AUTO_ROUTING`, and `DIFF_TOOL` source projection;
- create, update, and delete before/after nullability;
- EC and non-EC snapshot projection;
- data-link direction and control-link unordered matching;
- multiple links per pair and deduplication;
- links added or deleted anywhere in the active session;
- committed-baseline versus latest-session-overlay behavior when multiple groups exist;
- absence of system ID, type, SG membership, and SG pairs from snapshots; and
- unified rich responses from both existing create endpoints.

### CQ-06: Temporary design artifacts

This requirements document and its corresponding design document shall remain until
implementation is complete and the user explicitly approves their deletion.

## 8. Out of Scope

- A new REST endpoint for `GetUsecaseChangeDetailsQuery`.
- Changing the persisted `UseCase` schema solely to store source.
- Replacing persisted UseCase subgraph pairs with direct link membership.
- Implementing currently stubbed routing phases beyond changes required by the contract
  cleanup.
