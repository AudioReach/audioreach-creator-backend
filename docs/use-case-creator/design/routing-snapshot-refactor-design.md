# Routing Snapshot Refactor Design

**Status:** Implementation design. After implementation, synchronize the authoritative
routing documents listed in §10. Delete this document or its dedicated implementation plan
only with explicit user approval.

## 1. Requirements

1. Preserve the existing API contract and routing exclusion semantics.
2. Preserve explicit caller exclusions for validation and diagnostics.
3. Derive routability from request exclusions at most once per routing request.
4. Read overlay data-link and control-link catalogs at most once per routing request.
5. Share one immutable prepared graph snapshot across manual discovery and routing phases.
6. Use the same preparation model for automatic and manual routing where practical.
7. Do not maintain mutable or competing authoritative graph/exclusion representations.
8. Preserve handler-owned transactions, rollback behavior, blocking validation, and
   warning behavior.
9. Every active subgraph that remains after explicit exclusion and session deletion must
   resolve to exactly one effective-overlay `Subgraph` entity.
10. Keep phase-private indexes, sets, adjacency maps, and traversal state local to the
    phase that uses them.
11. Update the authoritative requirements and design documents before requesting approval
    to delete this design or its implementation plan. Never delete either without explicit
    user approval.
12. Reject duplicate active-subgraph selections as one blocking validation error before
    starting a transaction or performing repository reads. Never merge SGKVs or silently
    retain only one duplicate selection.

## 2. Decision

Both command handlers will use a shared `RoutingGraphSnapshotBuilder` after subsystem-link
resolution, graph-edit loading, scope derivation, and handler-level closure validation.
The builder will load the request-scoped graph data once and return an immutable
`RoutingGraphSnapshot`.

`RoutingInput` remains a discriminated union with a shared base and mode-specific data.
It contains explicit caller policy and the prepared snapshot in clearly separated fields.
Derived exclusion sets are construction-only and are not retained in `RoutingInput` or
`RoutingContext`.

`RoutingContext` remains the mutable phase-result carrier. It does not copy graph catalogs
or request policy from `RoutingInput`.

## 3. Routing Input

```typescript
interface RoutingRequestPolicy {
  readonly requestedSubgraphSystemIds: ReadonlySet<number>;
  readonly explicitlyExcludedSubgraphSystemIds: ReadonlySet<number>;
  readonly explicitlyExcludedDataLinkSystemIds: ReadonlySet<number>;
  readonly explicitlyExcludedControlLinkSystemIds: ReadonlySet<number>;
}

interface RoutingSubgraph {
  /** Effective-overlay domain entity used for structural graph operations. */
  readonly subgraph: Subgraph;
  /** Caller-provided routing-time SGKV selections; not persisted entity state. */
  readonly requestedSgkvs: readonly (readonly number[])[];
  /** Structural MDF classification prepared once for all consumers. */
  readonly isMdf: boolean;
}

interface RoutingGraphSnapshot {
  /** Final subgraphs authorized for this routing run. */
  readonly subgraphs: readonly RoutingSubgraph[];
  /** Final data links available to routing algorithms. */
  readonly routableDataLinks: readonly DataLink[];
  /** Final control links available as routing support. */
  readonly routableControlLinks: readonly ControlLink[];
  /** Complete post-overlay data-link catalog, ignoring request-only exclusions. */
  readonly overlayDataLinks: readonly DataLink[];
  /** Complete post-overlay control-link catalog, ignoring request-only exclusions. */
  readonly overlayControlLinks: readonly ControlLink[];
  /** Complete pre-session UC catalog required for impact and lifecycle rules. */
  readonly committedUsecases: readonly UseCase[];
  /** Added/deleted entities visible in the active session. */
  readonly sessionEdits: GraphEditSummary;
}

interface RoutingInputBase {
  readonly mode: RoutingMode;
  readonly fileSystemId: number;
  /** Effective-overlay snapshots for the use cases explicitly selected by the caller. */
  readonly selectedUsecases: readonly UseCase[];
  /** Original caller intent retained for validation and diagnostics. */
  readonly requestPolicy: RoutingRequestPolicy;
  /** Immutable server-prepared state shared by discovery and all routing phases. */
  readonly graphSnapshot: RoutingGraphSnapshot;
}

interface AutoRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Auto;
}

interface ManualRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Manual;
  readonly manualTopology: ManualTopology;
}
```

The discriminated union prevents automatic routing from carrying irrelevant manual data
without duplicating common fields in two unrelated contracts.

The factories defensively copy collection containers. Domain entities inside those
collections are borrowed immutable references for the lifetime of the routing request;
they are not deep-cloned or frozen, and handlers, discovery services, and phases must not
mutate them. `selectedUsecases` is the caller-selected overlay snapshot, while
`graphSnapshot` is the complete prepared graph snapshot. Neither view may be reloaded
during the run.

### 3.1 Deliberately distinct views

- `selectedUsecases` are effective-overlay snapshots of caller-selected UCs.
- `graphSnapshot.committedUsecases` is the complete pre-session UC catalog.
- `RoutingSubgraph.subgraph` is persisted graph structure.
- `RoutingSubgraph.requestedSgkvs` is transient routing input and must not be written into
  the domain entity.
- Overlay links represent surviving edited-file structure.
- Routable links represent the subset permitted by this request.

These views must not be merged because their state source or business meaning differs.

## 4. Snapshot Construction

The builder receives the normalized command data, selected UC snapshots, derived scope,
session edits, and the handler-owned `UnitOfWork`. Within that transaction it:

1. Defensively rejects duplicate effective active IDs before any builder repository read.
2. Loads effective-session-overlay subgraphs for the effective active IDs.
3. Loads complete effective-session-overlay intra-usecase data and control links.
4. Loads the complete pre-session UC catalog with committed read mode once.
5. Classifies effective active subgraphs as MDF once.
6. Validates that every effective active ID resolved to a subgraph.
7. Creates one `RoutingSubgraph` per effective active selection by joining the persisted
   entity, request SGKVs, and MDF classification.
8. Temporarily derives effective link exclusions as:
   - explicit link exclusions; plus
   - links incident to explicitly excluded subgraphs.
9. Builds routable link lists by applying effective scope and temporary exclusions to the
   overlay catalogs.
10. Returns copied readonly collections; no consumer may mutate contained entities.

Derived exclusion sets are discarded after step 8. The snapshot is the sole authority for
which links routing algorithms may consume.

No handler, discovery service, or routing phase may reload the snapshot's subgraph/link/UC
catalogs, re-derive effective scope, or re-derive effective exclusions. A consumer may
create cheap local lookup sets or maps from the immutable snapshot.

Missing active subgraphs are reported together during preparation. Phase 1 retains its
separate data-link integrity check against the prepared snapshot. Although successful
active-subgraph validation normally guarantees those endpoints, the Phase 1 check protects
the routing boundary from malformed link data and preserves its more specific link-level
diagnostics. It performs no repository reads or exclusion derivation. Warnings are emitted
only after this blocking integrity check succeeds.

## 5. Handler Flow

Both handlers retain transaction ownership.

### 5.1 Shared sequence

1. Reject duplicate active-subgraph IDs with one deterministic issue.
2. Start transaction.
3. Resolve subsystem-link chains.
4. In automatic mode only, remove prior `AUTO_ROUTING` edit actions.
5. Read session graph edits and selected effective-overlay use cases.
6. Derive request scope.
7. Run addition-side closure validation.
8. Validate selected-usecase scope completeness.
9. Build the immutable graph snapshot once.
10. Construct the mode-specific routing input.
11. Execute the routing engine.
12. Commit on success; roll back on every thrown or failed result.

### 5.2 Manual-only preparation

Manual pair discovery runs after snapshot construction and before engine execution. It
receives the snapshot's routable links and subgraphs and performs no graph repository
reads or exclusion derivation.

`ManualTopologyPair` retains immutable `DataLink` or `ControlLink` references from the
snapshot. They are borrowed references, not clones or an independently authoritative
catalog. Contract factories verify that every support link belongs to the relevant
routable snapshot and matches the pair's direction or unordered endpoints.

## 6. Routing Context

The context contains the immutable input and write-once phase outputs:

```typescript
class RoutingContext {
  readonly input: RoutingInput;
  topologyChangeAnalysis: TopologyChangeAnalysis | null;
  readonly islandTransitions: IslandTransition[];
  readonly kvResolutions: KvResolution[];
  readonly seeds: RoutingSeed[];
  readonly cones: RoutingCone[];
  readonly dfsPaths: DfsPath[];
  readonly routingCandidates: RoutingCandidates;
  readonly classifications: ClassifiedUsecase[];
  readonly orphanCandidates: OrphanCandidate[];
  readonly warnings: Issue[];
  readonly emittedChanges: UsecaseChangeDescriptor[];
  routingOutcome: RoutingOutcome | null;
}
```

Remove these independent fields:

- `allUcs`: use `input.graphSnapshot.committedUsecases`.
- `affectedUcSystemIds`, MDF substitutions, deletion marks, preserved UCs,
  island-use-case candidates, and deletion reconstruction paths: group them under
  `topologyChangeAnalysis` as finalized per-UC decisions.
- `islandUcsToLinked`: replace it with complete `islandTransitions` descriptors.
- `mdfSubgraphSystemIds`: use `RoutingSubgraph.isMdf`.
- `routingCombinations` and `ecBridgeCandidates`: group them under
  `routingCandidates`.

Phase 2 keeps direct MDF structural changes and reconstruction paths inside
`topologyChangeAnalysis`. Phase 7 consumes reconstruction paths and produces `dfsPaths`;
Phase 2 must not append the same paths to both collections.

`input` is immutable run input. Every other context member is a phase output. Context must
not contain repository objects, copied request policy, copied graph catalogs, or derived
exclusion state. A phase builds its output locally and publishes it once after its blocking
checks pass. Descriptor ordering remains deterministic and follows the owning phase's
documented ordering rules.

## 7. Phase Responsibilities

| Phase | Snapshot/input views | Local derivations | Repository access |
|---|---|---|---|
| Preparation | Command, selected UCs, derived scope, edits | Temporary exclusions and snapshot assembly | Subgraphs, overlay links, committed UCs, MDF metadata |
| Manual discovery | Snapshot routable graph, selected UCs | Candidate pairs, support selection, cycle detection | None |
| 1. Pre-validation | Snapshot routing subgraphs and routable data links | Endpoint ID set and undirected adjacency | None |
| 2. Deletion scope | Session edits, committed UCs, overlay links, explicit policy | Impact indexes, gates, support and reconstruction analysis | Conditional SGKV endpoint-baseline read for legacy EC reconstruction |
| 3. Island transition | Routing subgraphs, routable links, committed UCs, Phase 2 output | Island subset, direction and coverage calculations | None |
| 4. KV resolution | Routing subgraphs and selected UCs | Content-only KV interpretation and comparison maps | SGKV baseline + one batched, file-scoped Value Definition-to-Key mapping |
| 5. Seed detection | Session edits, routing subgraphs, KV results | Membership indexes and seeds | None |
| 6. Cone computation | Seeds and routable data links | Adjacency and cones | None |
| 7. DFS routing | Cones, routable data links, Phase 2 reconstruction paths | Adjacency, visited sets, final paths | None |
| 8. Combination expansion | DFS/KV results or manual topology | Candidate products | None |
| 9. Classification | Candidates, selected UCs, committed UCs, Phase 2/3 outputs | Matching indexes and classifications | None |
| 10. Orphan validation | Classifications and routable graph | Orphan indexes and warnings | None |
| 11. Change staging | Classification and Phase 2/3 outputs | Change descriptors | Writes only |
| 12. Response building | Changes, warnings, write-context group ID | Final outcome | No graph reads |

Cheap, consumer-specific sets and maps stay local. Examples include adjacency maps,
selected-ID sets, pair indexes, DFS visited sets, and temporary classification maps.

`RoutingEngine.run(input, uow)` remains the public facade, but there is no generalized
`RoutingPhase` contract. The engine stores the concrete phase services and creates the
ordered zero-argument phase closures for each run. Pure phases receive only
`RoutingContext`; Phases 2 and 4 receive `SubgraphRepository`; Phase 11 receives the
request `UnitOfWork`; and Phase 12 receives only the write-context `groupId`. This keeps
fail-fast ordering centralized without exposing broad persistence access to every phase.

## 8. Error and Warning Behavior

- Error precedence is: duplicate active-subgraph selection; chain resolution;
  addition-side closure; selected-scope
  completeness; snapshot active-subgraph validation; manual topology validation; Phase 1
  data-link integrity; Phase 2 affected-selection gate; Phase 2 deletion-side closure;
  later phase failures.
- Each validation stage aggregates all issues owned by that stage, then stops before the
  next stage when any blocking issue exists.
- Missing effective active subgraphs are blocking errors.
- Duplicate active-subgraph selections are reported together in sorted ID order and stop
  processing before transaction or repository work begins.
- Data-link integrity remains blocking.
- Island detection remains non-blocking and emits one warning per routing subgraph without
  routable data-link adjacency.
- Island warnings are computed only after snapshot validation and manual topology
  validation succeed. Later blocking phases may still stop the run.
- Any failure follows the existing handler rollback path.

## 9. Migration Strategy

1. Add snapshot contracts and builder tests.
2. Make both handlers build the same snapshot.
3. Update manual discovery to consume snapshot data without repository reads.
4. Update Phase 1 to consume the snapshot without repository reads or exclusion
   derivation.
5. Remove `islandUcs`, `allUcs`, and context MDF duplication as their consumers migrate.
6. Group Phase 2 and Phase 8 outputs together with their implementations; do not retain
   compatibility arrays that would create two mutable representations.
7. Replace the temporary generalized phase interface with concrete service contracts and
   engine-owned ordered closures. Keep each phase's promise-based `Result<void>` return
   contract unchanged.

Each migration step must preserve compiling intermediate states and focused unit tests.

## 10. Authoritative Documentation Updates

Before deleting this temporary design and its implementation plan, update:

- `docs/use-case-creator/auto-usecase-routing-requirements.md`
- `docs/use-case-creator/auto-usecase-routing-requirements-extended.md`
- `docs/use-case-creator/requirements/routing-contract-and-change-details-requirements.md`
- `docs/use-case-creator/requirements/manual-topology-discovery-requirements.md`
- `docs/use-case-creator/design/overall-design.md`
- `docs/use-case-creator/design/routing-contract-and-change-details-design.md`
- `docs/use-case-creator/design/manual-topology-discovery-design.md`
- `docs/use-case-creator/design/lld/lld1-kv-resolution-cone.md`
- `docs/use-case-creator/design/lld/lld4-deletion-transition.md`
- `docs/use-case-creator/design/diagrams/03-routing-context-data-flow.md`
- `docs/use-case-creator/plans/pr-03/pr-03-half-a-implementation-plan.md`
- `docs/use-case-creator/plans/pr-03/pr-03-half-a-handoff.md`

The updates must replace the prior local-rederivation decision, clarify explicit policy
versus prepared graph state, and assign each phase the shared snapshot view appropriate to
its rules.

After implementation and synchronization are verified, these artifacts may be deleted only
with explicit user approval:

- `docs/use-case-creator/design/routing-snapshot-refactor-design.md`
- `docs/use-case-creator/plans/routing-snapshot-refactor-plan.md`

## 11. Verification

- Unit-test duplicate selection rejection, snapshot construction, missing active
  subgraphs, effective filtering, and MDF annotation.
- Assert one overlay data-link read and one overlay control-link read per handler run.
- Assert one committed-UC catalog read and one MDF classification pass per run.
- Verify requested SGKVs remain separate from persisted `Subgraph` state and that neither
  snapshot construction nor later phases mutate domain entities.
- Verify each `RoutingSubgraph` receives exactly one MDF classification result.
- Verify manual topology holds the same borrowed link object references as the snapshot,
  without cloning or repository reads.
- Verify manual discovery and Phase 1 perform no graph repository reads.
- Preserve existing addition-closure, selected-scope, integrity, island-warning,
  transaction, and engine short-circuit tests.
- Run all use-case-creator unit tests and the core build.
- Confirm no NestJS, TypeORM, or Node.js imports enter `@arc/core`.
