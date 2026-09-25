<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Manual Usecase Topology Discovery Design

**Requirements:**
[`../requirements/manual-topology-discovery-requirements.md`](../requirements/manual-topology-discovery-requirements.md)

**Status:** Approved design

## 1. Purpose

This design defines how `create-manual-usecases` discovers topology for a new manual
usecase without importing unrelated topology from unselected usecases.

The design keeps policy inside `ManualPairDiscoveryService`, returns a normalized final
topology, and prevents downstream phases from repeating or changing pair eligibility.
It also removes automatic deletion reconciliation from the manual workflow; unresolved
existing-usecase damage remains protected by commit-time validation.

## 2. Decision Summary

1. Selected-to-selected SG relationships are eligible only when represented by a pair
   in a selected usecase.
2. Every relationship involving an out-of-selection SG is eligible for discovery.
3. Latest effective data links determine final pair direction.
4. Control-link fallback is per relationship and uses canonical direction.
5. Excluding all data links for a relationship suppresses control fallback.
6. The final data-derived graph must be acyclic.
7. Discovery returns each pair with its supporting domain link objects, not parallel
   global pair/link arrays.
8. Isolated SGs and referenced link IDs are derived from the normalized result.
9. Manual creation does not run existing-usecase deletion expansion.

## 3. Alternatives Considered

### 3.1 Flat topology result

The existing scaffold returns separate arrays for pairs, supporting data-link IDs,
supporting control-link IDs, and isolated SG IDs.

This is simple but loses which links support which pair and stores values that can be
derived. It also makes pair-specific validation difficult. Rejected.

### 3.2 Normalized final pair support

Return one final record per materialized directed pair, using the existing `DataLink`
and `ControlLink` domain concepts for pair support. Keep rejected candidates and raw
discovery evidence private to the discovery service.

This preserves essential pair-to-link association without introducing support-kind
types or exposing discovery policy to downstream phases. Selected.

### 3.3 Public graph/adjacency result

A graph is convenient for cycle detection, but no downstream consumer requires a graph
API. It also makes canonical control-link direction appear semantically directed.

Adjacency remains a private cycle-detection representation. Rejected as a public
contract.

## 4. Core Contracts

All contracts remain in `@arc/core` and contain no framework, persistence, or Node.js
types.

```typescript
export interface ManualTopologyPair {
  readonly pair: SubgraphPair;
  /** All effective, non-excluded data links supporting pair direction. */
  readonly dataLinks: readonly DataLink[];
  /** All effective, non-excluded control links supporting pair endpoints. */
  readonly controlLinks: readonly ControlLink[];
}

export interface ManualTopology {
  readonly pairs: readonly ManualTopologyPair[];
}
```

Every `ManualTopologyPair` must satisfy these invariants:

- exactly one of `dataLinks` and `controlLinks` is non-empty;
- every data link matches `pair` direction;
- every control link matches the pair's unordered endpoints;
- a control-supported pair uses canonical endpoint ordering; and
- a pair with neither support type is not constructed.

A pair cannot be constructed directly outside the contract module. Two factory
functions—one for data-supported pairs and one for control-supported pairs—validate
non-empty support, endpoint/direction consistency, and canonical control ordering. They
defensively copy and freeze the pair value and support arrays before returning a
`ManualTopologyPair`. Invalid construction is an internal invariant failure, not a new
client validation error.

The factories do not mutate or deep-clone `DataLink`/`ControlLink` entities. Repository
results are treated as read-only snapshots for the lifetime of the routing request; no
routing component may mutate them.

For control-supported pairs, `pair` contains canonical endpoint ordering only; it does
not give a control link routing direction.

Keeping domain link objects makes `isEc`, referenced link IDs, and diagnostics directly
derivable without additional support-kind types or repository queries. The topology
contains only links supporting final pairs, not a cache of the complete file graph.

The discovery input is explicit:

```typescript
export interface ManualTopologyDiscoveryInput {
  /** Handler-preserved effective-overlay UseCase snapshots. */
  readonly selectedUsecases: readonly UseCase[];
  /** Prepared effective-overlay subgraphs with request SGKV selections and MDF state. */
  readonly subgraphs: readonly RoutingSubgraph[];
  /** Final routable links from the shared graph snapshot. */
  readonly dataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}
```

## 5. Component Responsibilities

### 5.1 `ManualCandidateRelationshipBuilder`

A pure application service that:

1. Builds the selected SG set from selected-usecase memberships.
2. Builds an unordered selected-relationship whitelist from selected-usecase pairs.
3. Classifies each effective-scope SG as selected or out-of-selection.
4. Iterates each unordered effective-scope combination once.
5. Retains selected-selected combinations only when whitelisted.
6. Retains every combination with at least one out-of-selection endpoint.

An unordered key uses `(minSgSystemId, maxSgSystemId)`. The direction of the selected
pair is deliberately not retained as final topology direction.

### 5.2 `ManualLinkSupportResolver`

An application service that resolves authorized candidates against the already-prepared
routable data-link and control-link collections in `ManualTopologyDiscoveryInput` and
produces invariant-checked `ManualTopologyPair` values. It performs no repository reads
and does not reapply exclusions.

It owns all fallback and suppression policy. Downstream phases must not re-query links
or filter the result against selected usecases.

### 5.3 `DirectedCycleDetector`

A pure utility that receives data-derived topology pairs. It constructs directed
adjacency, performs deterministic cycle detection, and returns either no cycle or the
ordered cycle SGs and supporting data-link IDs.

Control-supported pairs are excluded because their canonical direction is not graph
semantics.

### 5.4 `ManualPairDiscoveryService`

The orchestration service:

```typescript
discover(
  input: ManualTopologyDiscoveryInput,
): Result<ManualTopology>;
```

It invokes candidate building, support resolution, cycle validation, and final
normalization. It emits no edit actions.

## 6. Discovery Algorithm

### 6.1 Build candidates

For each unordered pair `(A, B)` in effective `activeSubgraphs`:

| A | B | Candidate rule |
|---|---|---|
| Selected | Selected | Keep only if the selected-relationship whitelist contains `(A, B)` |
| Selected | Out-of-selection | Keep |
| Out-of-selection | Selected | Keep |
| Out-of-selection | Out-of-selection | Keep |

The result is a deduplicated unordered candidate list.

### 6.2 Resolve data links

The shared `RoutingGraphSnapshotBuilder` loads all effective intra-usecase links once and
applies request policy. Discovery receives only final routable links, so it performs no
repository lookup, exclusion derivation, or selected-usecase filtering. The builder keeps
complete overlay catalogs separately so it can distinguish these states:

1. no data link exists;
2. data links exist and at least one remains eligible;
3. data links exist but all were explicitly excluded.

For each candidate:

- If at least one non-excluded data link remains, group links by direction and emit one
  pair per unique direction with those links in `dataLinks` and an empty `controlLinks`.
- If data links exist but all are excluded, emit no pair and do not perform control
  fallback.
- If no effective data link exists, queue the candidate for control fallback.

Multiple same-direction links remain associated with the one emitted pair. EC support
is derived with `pair.dataLinks.some(link => link.isEc === true)`.

### 6.3 Resolve control fallback

Use the prepared routable control-link collection only for queued candidates. Explicit
control-link exclusions have already been applied by the builder.

If support remains, emit one pair with the links in `controlLinks`, an empty
`dataLinks`, and direction:

```text
source = min(A, B)
destination = max(A, B)
```

If no support remains, emit no pair.

### 6.4 Detect cycles

Build adjacency from final pairs whose `dataLinks` are non-empty. Reject any directed cycle,
including two-node cycles formed by opposite-direction pairs.

Cycle detection occurs before combination expansion and before edit-action emission.
Iteration order is deterministic so tests and error payloads are stable.

### 6.5 Return final topology

On success, return only normalized materialized pairs. Candidate relationships that did
not retain support are not exposed.

## 7. Repository Ports

The snapshot builder reads session-overlay entities without applying request-only filters
in persistence. TypeORM rows remain inside persistence.

Chain resolution, selected-usecase loading, and snapshot construction execute through the
same handler-owned UoW transaction. No graph mutation occurs between snapshot reads and
topology completion. The topology therefore represents one consistent post-chain-resolution
overlay snapshot. Discovery performs no repository reads.

## 8. Downstream Consumption

### 8.1 Combination expansion

Manual Phase 8 uses the ordered snapshot `subgraphs` and their requested SGKVs for GKV Cartesian expansion
and applies the same `ManualTopology` to every generated candidate.

### 8.2 Isolated SGs

Isolated SG IDs are derived as:

```text
effective scope SG IDs − all materialized pair endpoints
```

They are not stored separately in `ManualTopology`. Isolated SGs remain members of each
generated usecase.

### 8.3 Type computation

The resulting internal type follows existing rules:

1. Any pair containing an EC data link produces `EC` for the whole generated usecase.
2. Otherwise, any pair with control links or any isolated SG produces `ISLAND`.
3. Otherwise the result is `LINKED`.

The explicit precedence is therefore `EC` > `ISLAND` > `LINKED`.

### 8.4 Referenced components

Phase 11 derives referenced link IDs by flattening the pair link arrays:

- `pair.dataLinks` populate `dataLinkSystemIds`;
- `pair.controlLinks` populate `controlLinkSystemIds`.

The effective active SG IDs populate `sgSystemIds`. All lists are deduplicated before
being stored in `referencedComponents`.

Discovery itself is source-neutral and emits no edit actions. The manual command's
Phase 11 stager assigns `source = MANUAL` to every emitted usecase and relationship edit
action through the handler/UoW write context.

## 9. Existing Usecases and Deletion Reconciliation

Manual creation uses selected usecases only for:

- selected SG and relationship eligibility;
- KV filtering; and
- duplicate/idempotency checks.

It does not update selected usecases merely because their stored pair direction differs
from current data links. The new usecase follows current topology; existing usecases
retain their own topology.

Manual mode does not run file-wide affected-UC discovery, FR-DEL-02 selection gating,
bounded-DFS reconstruction, deletion staging, or type degradation. Its deletion phase
is a complete no-op.

`create-usecases` remains responsible for automatic deletion reconciliation.
`commit-changes` remains the final safety net: FR-COMMIT-01(b2) rejects unresolved stale
existing usecases and directs the caller to automatic routing, explicit update/delete,
or component restoration.

The existing commit validator remains responsible for this check. For every committed
usecase affected by a staged SG/data-link/control-link deletion, it validates the
effective post-commit SG membership, pair-link presence, and `LINKED` data coverage. It
ignores request-only routing exclusions. A stale result maps to
`ARC-COMMIT-ROUTING-REQUIRED`; this design adds no second commit validator.

## 10. Failure Contract

A data-derived cycle returns a blocking issue:

```text
code: ARC-ROUTING-MANUAL-CYCLE
HTTP status: 422
details:
  subgraphSystemIds: ordered cycle SG IDs
  dataLinkSystemIds: supporting links for the cycle edges
```

Failure occurs before any usecase edit action is emitted. The handler-owned transaction
rolls back normally.

No materialized pairs is not an error. The effective SGs become isolated members and
produce an `ISLAND` manual usecase under existing validation rules.

## 11. Complexity

Candidate generation is `O(n²)` in the effective SG count because out-of-selection
semantics intentionally consider every relationship involving those SGs.

Repository lookups must be batched/set-based. Batching removes N+1 round trips but does
not remove the intentional quadratic candidate set. Existing request-size and routing
performance limits should bound the effective scope.

## 12. Verification

### 12.1 Unit tests

- selected-selected whitelist and unselected-UC non-leakage;
- selected/out and out/out candidate generation;
- current data-link direction replacing selected stored direction;
- same-direction link grouping and domain-link preservation;
- rejection of pair values with empty or mixed support arrays;
- defensive-copy behavior for pair/support arrays and read-only treatment of links;
- automatic control suppression when all data links are excluded;
- per-relationship control fallback and canonical direction;
- isolated SG derivation;
- two-node and longer data-cycle rejection;
- control-only pairs excluded from cycle detection.

### 12.2 Persistence integration tests

- effective overlay after staged link creates and deletes;
- data lookup in both directions;
- unordered control lookup;
- application-layer exclusions after overlay reconstruction;
- batched query behavior without N+1 calls.

### 12.3 Workflow tests

- one topology reused for every GKV candidate;
- only `MANUAL` edit actions emitted;
- existing UCs never mutated by manual creation;
- no manual affected-UC or deletion expansion;
- unresolved existing UCs rejected by commit through FR-COMMIT-01(b2).

## 13. Required Existing-Document Updates

Implementation planning must update the broader requirements, overall design, routing
data-flow diagram, deletion LLD, PR plans, and handler comments so they no longer claim:

- every selected-selected mathematical SG combination is examined;
- control fallback is per SG;
- selected-usecase filtering occurs after discovery; or
- deletion expansion and FR-DEL-02 run during manual creation.

Until those documents are updated, the approved manual-topology requirements linked at
the top of this design are normative for `create-manual-usecases` and supersede the
conflicting statements listed above.
