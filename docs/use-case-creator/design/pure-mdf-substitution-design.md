<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Pure MDF Substitution Design

**Status:** Approved
**Last updated:** 2026-09-25

**Requirements:**
- [`../auto-usecase-routing-requirements.md`](../auto-usecase-routing-requirements.md)
- [`../auto-usecase-routing-requirements-extended.md`](../auto-usecase-routing-requirements-extended.md)

## 1. Decision Summary

Pure MDF substitution is a topology-maintenance operation on an existing UseCase. It is
not deletion/reconstruction and does not require the UseCase to be selected.

When a committed UseCase contains a directed pair `A -> B`, that supporting data-link is
deleted, and the effective graph replaces it with one strict directed MDF chain such as
`A -> MDF1 -> MDF2 -> B`, the routing workflow shall:

1. Preserve the UseCase identity, GKV, metadata, and unrelated topology.
2. Remove pair `A -> B`.
3. Add the MDF members and each adjacent replacement pair.
4. Preserve link semantics and UseCase type.
5. Emit one `UPDATE` without requiring UC selection or DFS reconstruction.

The implementation shall redesign Phase 2 around aggregate-first topology decisions.
This avoids adding a special-case patch to the current mark-delete-reconstruct flow.

## 2. Goals

- Make one authoritative decision per committed UseCase after considering every session
  graph edit that affects it.
- Keep pure MDF substitutions outside the FR-DEL-02 affected-UC selection gate.
- Apply all substitutions for one UseCase atomically or apply none of them directly.
- Make MDF eligibility independent of cone traversal, DFS, combination expansion, and
  FR-DUP-03(b1).
- Give classification, orphan validation, and staging one shared interpretation of the
  scheduled topology.
- Preserve normal deletion, degradation, preservation, and reconstruction behavior for
  every non-MDF topology change.
- Keep `packages/core` independent of NestJS, TypeORM, and Node.js APIs.

## 3. Non-Goals

- Changing the HTTP request or response schema.
- Changing MDF classification from module content.
- Changing ordinary DFS path discovery or GKV combination rules.
- Adding a database schema or migration.
- Automatically rewriting newly staged manual or automatic UseCases. Stale staged
  topology remains a commit-validation concern.

## 4. Current Design Problem

The current Phase 2 implementation decides each deleted component independently. Its MDF
check returns only a boolean and immediately marks matching UseCases for deletion. Later
phases must rediscover the MDF path, classify it as `INTERIOR_EXTENSION`, cancel the
pending delete, and stage additions. This has four structural problems:

1. The UC incorrectly enters the affected-selection gate.
2. Correctness depends on DFS rediscovering the path.
3. The old direct pair is not part of the extension delta and can remain stored.
4. Multiple edits affecting one UC are not finalized as one all-or-nothing decision.

Phase 2 is also responsible for inventory construction, selection gating, deletion
classification, MDF path checks, EC reconstruction, and topology reconstruction in one
large service. Adding another conditional branch would preserve the underlying coupling.

## 5. Architecture

### 5.1 Phase Boundary

Rename the Phase 2 implementation boundary from `DeletionScopeService` to
`TopologyChangeAnalysisService`. It remains in the same pipeline position and remains
the sole owner of file-wide committed-UC impact discovery and FR-DEL-02 gating.

The phase uses two focused application services:

| Component | Responsibility |
|---|---|
| `TopologyChangeAnalysisService` | Build inventory, aggregate per-UC impacts, finalize decisions, enforce gates, and publish analysis |
| `MdfSubstitutionAnalyzer` | Recognize one strict MDF replacement chain and return its exact structural substitution |
| `DeletionReconstructionService` | Run existing bounded reconstruction only for finalized ordinary deletion decisions |

The service split is internal to `packages/core`. It does not add a CQRS operation or a
new persistence dependency.

### 5.2 Decision Model

Replace the deletion-only context name with a topology-change analysis:

```typescript
interface TopologyChangeAnalysis {
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
  readonly decisions: readonly UsecaseTopologyDecision[];
}

type UsecaseTopologyDecision =
  | MdfSubstitutionDecision
  | PreserveUsecaseDecision
  | TransitionToIslandDecision
  | DeleteOrReconstructDecision;
```

Exactly one finalized decision exists for each impacted committed UC. A pure MDF decision
is a topology decision but is not a member of `affectedUsecaseSystemIds`.

```typescript
interface MdfPairSubstitution {
  readonly removedPair: SubgraphPair;
  readonly replacementSubgraphSystemIds: readonly number[];
  readonly replacementPairs: readonly SubgraphPair[];
}

interface UsecaseStructuralChange {
  readonly addedSubgraphSystemIds: readonly number[];
  readonly removedSubgraphSystemIds: readonly number[];
  readonly addedPairs: readonly SubgraphPair[];
  readonly removedPairs: readonly SubgraphPair[];
  readonly resultingSubgraphSystemIds: readonly number[];
  readonly resultingPairs: readonly SubgraphPair[];
  readonly resultingType: UsecaseType;
  readonly sgkvAssignments: readonly UsecaseSgkvAssignment[];
}

interface MdfSubstitutionDecision {
  readonly kind: 'MDF_SUBSTITUTION';
  readonly usecase: UseCase;
  readonly substitutions: readonly MdfPairSubstitution[];
  readonly structuralChange: UsecaseStructuralChange;
}

interface TransitionToIslandDecision {
  readonly kind: 'TRANSITION_TO_ISLAND';
  readonly usecase: UseCase;
  readonly dataLinkLossPairs: readonly DataLinkLossPair[];
  readonly droppedSubgraphSystemIds: readonly number[];
}

When island degradation and safe removal of isolated members affect the same committed
UC, Phase 2 publishes one `TRANSITION_TO_ISLAND` decision carrying both effects. `PRESERVE`
is not also published. Projected topology and staging apply both effects atomically.
```

The structural change contains both the persistence delta and the complete resulting topology.
Downstream consumers do not reconstruct either representation independently.

## 6. Read-Only Impact Inventory

Phase 2 derives one read-only inventory from `RoutingGraphSnapshot`:

```typescript
interface TopologyImpactInventory {
  readonly committedUsecasesByDirectedPair: ReadonlyMap<
    string,
    readonly UseCase[]
  >;
  readonly committedUsecasesBySubgraph: ReadonlyMap<
    number,
    readonly UseCase[]
  >;
  readonly deletedDataLinks: readonly DataLink[];
  readonly deletedControlLinks: readonly ControlLink[];
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
  readonly survivingDataLinkPairKeys: ReadonlySet<string>;
  readonly survivingControlLinkPairKeys: ReadonlySet<string>;
  readonly routableAdjacency: ReadonlyMap<number, readonly DirectedEdge[]>;
  readonly routingSubgraphsById: ReadonlyMap<number, RoutingSubgraph>;
}
```

Directed and unordered indexes remain distinct:

- MDF replacement uses the exact stored direction.
- General I7 support and control-link fallback remain unordered.

The inventory is constructed once and never published in a partially modified state.
Local mutable maps may be used while building it, but all exposed contracts are readonly.

## 7. Phase 1 MDF Invariant

Before topology-change analysis, `PreValidationService` shall reject every MDF SG whose
request selection contains any KV value. The existing `ARC-ROUTING-MDF-01` issue is the
blocking result.

After Phase 1 succeeds:

- Every in-scope MDF SG has no KV contribution.
- `KvResolutionService` may normalize it to one empty routing instance.
- `MdfSubstitutionAnalyzer` does not need a non-empty-MDF branch.
- An empty MDF assignment is membership metadata, not a GKV change.

## 8. MDF Substitution Analysis

### 8.1 Analyzer Contract

```typescript
interface MdfSubstitutionAnalyzer {
  analyze(
    deletedDataLink: DataLink,
    inventory: TopologyImpactInventory,
  ): MdfPairSubstitution | null;
}
```

The public result is binary: the deleted pair is replaced by one strict MDF chain, or it
is not an MDF substitution. Branching is not exposed as a separate business outcome.

### 8.2 Strict-Chain Rules

For deleted data-link `A -> B`, the analyzer returns a substitution only when:

1. No surviving direct intra-usecase data-link or control-link in either direction
   supports the stored pair.
2. The effective routable graph contains one directed replacement chain from A to B
   with at least one intermediate SG.
3. Every intermediate SG is in scope and has `IsMdf = true`.
4. The replacement topology does not branch into multiple A-to-B MDF chains.
5. A normal deleted link is replaced only by normal links.
6. An EC deleted link is replaced only by EC links.

MDF-ALIGN-01: Parallel physical links with the same source, destination, and semantic
are one logical hop for strict-path counting. MDF-ALIGN-02: Parallel links with the same
source and destination but different normal/EC semantics make that hop ambiguous and
ineligible for pure MDF substitution. Physical link system-ID order must not change the
result.

Only multiple complete A-to-B MDF chains constitute branching for this rule. An
unrelated edge incident to a chain node does not invalidate the substitution when it
cannot form another A-to-B replacement path. Explicitly excluded SGs or links are absent
from the effective routable graph and therefore cannot participate in the substitution.

Support and replacement scope use different snapshot views intentionally. The analyzer
first checks the complete post-overlay link catalogs without request exclusions. Any
physically surviving direct support prevents MDF substitution even when that support is
excluded from this routing request. Only after direct support is absent does the analyzer
search the request-scoped routable graph for the MDF chain. Excluding a chain member or
chain link therefore prevents the direct MDF decision.

The implementation uses sorted cycle-safe traversal and stops as soon as the strict
single-chain rule can no longer hold. It never selects an arbitrary first path.

### 8.3 Per-UC Aggregation

Phase 2 first records provisional effects by UC identity. It does not mark, publish, or
stage a UC while individual edits are still being visited.

After all deleted SGs and links have been considered, one UC becomes
`MDF_SUBSTITUTION` only when:

- Every deleted stored pair requiring topology replacement has an MDF substitution.
- No deleted SG, degradation, unsupported pair, or other ordinary deletion impact
  affects the UC.
- Multiple substitutions have compatible set operations.

Substitutions conflict when the same removed pair maps to different chains, one
substitution adds a pair another removes, or the merged result violates UC topology or EC
invariants. Shared endpoints or MDF members alone are not conflicts.

Eligibility is complete before a structural change is published. If any condition
fails, every provisional MDF substitution for that UC is discarded and the UC follows
the existing ordinary deletion workflow. No partial direct update is possible.

Finalization validates the complete aggregate in this order: build the resulting pair set;
validate every replacement chain's exact link semantics; count one logical EC crossing
for each EC replacement chain and one for each unchanged EC-supported pair; reject more
than one logical crossing; and require the computed resulting type to equal the committed
`UseCase.type`. A type mismatch or excess logical EC crossing returns `null` from MDF
finalization, leaves the deletion mark and affected-UC entry intact, and uses ordinary
fallback behavior.

## 9. Affected-UC Gate And Routing Modes

`affectedUsecaseSystemIds` is derived from finalized decisions:

- `MDF_SUBSTITUTION`: excluded.
- `PRESERVE`: included when existing FR-DEL rules require selection.
- `TRANSITION_TO_ISLAND`: included.
- `DELETE_OR_RECONSTRUCT`: included.

FR-DEL-02 and deletion-side FR-API-07 retain their existing ordering and payloads.

Pure MDF updates are system-owned structural maintenance in both automatic and manual
routing modes. Manual mode still skips ordinary automatic reconstruction, but it does
not discard a finalized MDF decision.

## 10. Shared Structural Change Application

The committed snapshot remains immutable. A shared pure helper applies a finalized
structural change to a cloned UseCase:

```typescript
function projectUsecaseStructure(
  usecase: UseCase,
  structuralChange: UsecaseStructuralChange,
): UseCase;
```

For example:

```text
Committed UC:       SGs [A, B], pairs [A->B]
MDF change:         remove A->B, add M, add A->M and M->B
Projected UC view:  SGs [A, M, B], pairs [A->M, M->B]
```

Consumers use this helper as follows:

- `ClassificationService` compares candidates with committed UCs after applying only
  finalized MDF structural changes. A DFS candidate for the same chain becomes an exact match
  against the already scheduled topology. A legitimately broader candidate compares
  against the MDF-updated shape.
- `buildProjectedUsecaseTopology` applies MDF and other finalized decisions before
  orphan checks. MDF members and replacement links are therefore represented even when
  DFS emits no candidate.
- For a combined `TRANSITION_TO_ISLAND` decision, the projected session view removes every dropped member
  and pair incident to it, then applies the `ISLAND` type while retaining unrelated
  topology.
- `RoutingChangeStager` uses the structural change's delta fields for the actual write.

An exact classification does not own the MDF update. It only suppresses duplicate work.
The Phase 2 decision remains authoritative and is always staged in Phase 11.

## 11. Seed And GKV Semantics

An MDF SG contributes no values to a UseCase GKV.

`SeedDetectionService.addKvChangeSeeds` shall skip MDF routing subgraphs. Comparing one
normalized empty MDF instance with an empty persisted baseline must not produce a
`KV_CHANGED` seed.

MDF topology may still participate in routing because:

- Added or deleted normal data-links create link seeds.
- A genuinely new SG or out-of-selection SG may create its existing topology seed.
- EC substitution does not need a DFS seed because its direct update is a Phase 2
  decision.

If normal routing discovers a genuinely different path containing MDF, it may create a
new UC. That UC includes MDF membership and empty assignment metadata, but its GKV is
derived only from non-MDF SGs. The pure replacement path itself updates the existing UC
and does not create another UC.

## 12. Type And EC Semantics

The structural change computes type from the complete resulting pair set and
effective routable links.

Type precedence remains `EC`, then `ISLAND`, then `LINKED`: any logical EC connection
makes the UC `EC`; otherwise an unsupported pair makes it `ISLAND`.

For a valid pure substitution, link semantics are preserved, so type is expected to be
unchanged:

- Normal replacement: `LINKED` remains `LINKED` unless unrelated existing topology was
  already `ISLAND`.
- EC replacement: `EC` remains `EC`.
- Existing unrelated unsupported pairs continue to produce `ISLAND` where applicable.

An EC replacement chain has `isEc = true` on every adjacent link. The contiguous chain
through MDF intermediates counts as one logical EC crossing. A second logical EC
crossing or mixed EC/non-EC replacement is not a pure MDF substitution.

Finalization independently rejects unsupported, mixed, or internally inconsistent
replacement-chain semantics. It also rejects any computed type different from the
committed type and any result with more than one logical EC crossing; each rejection
falls back to ordinary deletion handling before the MDF decision or affected-set gate is
published.

`newType` is included in the persistence delta only when the computed result differs
from the stored type. A mismatch caused by invalid replacement semantics prevents direct
MDF finalization rather than silently changing type.

## 13. Persistence And Response

`UsecaseRepository.applyStructuralChange` remains the persistence boundary. One MDF
decision maps to one call with:

```typescript
{
  removedPairs,
  addedSgSystemIds,
  addedPairs,
  newType, // omitted when unchanged
}
```

New MDF members also supply `UsecaseSgkvAssignment` entries with an empty
`valueDefinitionSystemIds` array. This records no GKV contribution.

A combined `TRANSITION_TO_ISLAND` decision maps to one structural call containing the
dropped membership IDs, every pair incident to those members, and `newType: ISLAND`.
It produces one response descriptor and retains all unrelated members and pairs.

The existing TypeORM adapter already writes pair deletes, membership creates, pair
creates, optional type replacement, and root edit metadata under one group ID. No new
repository method or schema migration is required.

Phase 11 processes finalized MDF decisions before candidate classifications. It records
one `UPDATE` descriptor for the existing UC identity. A later exact candidate is skipped;
descriptor coalescing prevents duplicate response entries.

## 14. Staged UseCases And Commit Validation

Direct MDF rewriting applies only to committed pre-session UCs. Newly staged automatic
or manual UCs are not silently rewritten.

Commit validation rejects a staged UC that retains the superseded direct pair or
references the deleted direct link. The caller must rerun automatic routing or restage
the manual UC from the effective graph. This keeps staged user intent explicit and
avoids rewriting manual edit payloads inside automatic topology analysis.

Both routing modes load and validate active manual dependencies in Phase 1 before
topology analysis. An active manual update targeting the same committed UC then takes
precedence over a system-owned MDF write. If its projected topology already removes the
direct pair and contains the strict MDF chain, no additional MDF update is emitted,
including when the UC is unselected. If it retains the deleted reference, Phase 1 fails
before the affected set is built. A valid manual update suppresses only duplicate MDF
maintenance; any ordinary deletion impact on the UC still participates in FR-DEL-02.
Phase 2 never stages a competing edit for the same aggregate.

## 15. Collision Replay

`RoutingEngine.resolveCollision()` runs Phase 1 and Phase 2 with the same contracts as a
normal routing run. It consumes the complete `TopologyChangeAnalysis` so classification
sees MDF-projected committed UCs and applies the same active-manual precedence.

Collision lookup does not invoke Phase 11. MDF decisions remain in-memory projections
and are not staged while resolving a collision ID. The later normal/apply-fix routing run
recomputes the same decisions and owns all writes.

## 16. Determinism And Performance

- Build all pair, subgraph, support, and adjacency indexes once per routing call.
- Sort deleted components, UC decisions, replacement paths, SG IDs, and pairs by stable
  numeric keys before publication.
- Use cycle-safe bounded traversal over the effective routing scope.
- Stop strict-chain traversal once branching proves the MDF shape invalid.
- Compute each UC's merged structural change once.
- Do not add repository reads to Phase 2 beyond the existing legacy EC SGKV baseline
  lookup; graph and UC evidence comes from `RoutingGraphSnapshot`.

## 17. Error Handling

Pure-MDF recognition introduces no new fallback error:

- Valid MDF substitution: direct update, no FR-DEL-02 selection error.
- Topology that does not match the strict MDF rule: existing ordinary deletion handling.
- MDF selection containing values: blocking `ARC-ROUTING-MDF-01` in Phase 1.
- Missing/excluded deletion-side scope: existing FR-API-07 issue after FR-DEL-02.
- Stale newly staged UC: existing commit-routing-required/manual-reference validation.

## 18. Test Strategy

### 18.1 Unit Tests

`MdfSubstitutionAnalyzer`:

- One MDF intermediate.
- Multiple MDF intermediates.
- Normal and EC chains.
- Non-MDF intermediate.
- Wrong direction.
- Mixed EC classification.
- Surviving data or control support.
- Branching MDF topology.
- Cycles and depth bound.

`TopologyChangeAnalysisService`:

- Pure MDF UC is not in the affected set.
- Unselected pure MDF UC succeeds.
- Multiple UCs sharing one pair receive independent decisions.
- Multiple compatible substitutions merge into one decision.
- One ordinary deletion impact discards all provisional MDF substitutions for that UC.
- Manual mode retains MDF decisions but skips ordinary reconstruction.
- An active manual update that already materializes the MDF chain prevents a duplicate
  automatic edit; a stale manual update fails before staging.
- A valid manual update on an unselected UC suppresses only the duplicate MDF write.
- The same active-manual precedence and stale-reference failure apply in manual routing
  mode.
- An ordinary impact on that same UC still triggers FR-DEL-02.
- Stale manual validation runs before FR-DEL-02 and topology decision publication.
- An excluded but physically surviving direct support link prevents MDF substitution.
- An excluded MDF chain member/link prevents MDF substitution but is not mistaken for
  deletion of the physically surviving direct support.

Structural change and classification:

- MDF structural change removes the old pair and adds every chain pair.
- A rediscovered DFS candidate is exact against projected topology.
- A broader candidate is compared with the projected UC.
- Orphan projection includes MDF members and replacement links without DFS output.

Seed detection and staging:

- Empty MDF normalization does not create a `KV_CHANGED` seed.
- Link/new-topology seeds retain existing behavior.
- Phase 11 stages one atomic delta and one `UPDATE` descriptor.
- Existing GKV and identity are preserved.
- EC type is preserved.
- EC precedence over an unrelated unsupported pair remains deterministic.

### 18.2 Persistence Integration Tests

- The old pair receives a staged delete.
- MDF memberships and replacement pairs receive staged creates.
- Empty MDF assignment metadata is present on the root UC update.
- All actions share the expected group and aggregate identity.
- Overlay hydration returns the replacement topology and no old direct pair.
- Repeating automatic routing after wipe produces the same result.

### 18.3 Routing-Chain Tests

- The direct update succeeds when DFS emits no candidate.
- DFS rediscovery does not create a second UC or second update.
- Normal fallback still enforces selection and reconstruction behavior.
- `resolveCollision()` prerequisite replay uses the same MDF structural change as a normal run.
- Collision replay does not stage the in-memory MDF decision.
- Phase 2 performs no graph/UC repository reads; only the documented legacy-EC SGKV
  lookup remains conditional.

### 18.4 Cross-Phase Implementation Mapping

| ID | Scenario | Owning test |
|---|---|---|
| MDF-XP-01 | Single-hop direct substitution with no DFS candidate | `engine/pure-mdf-routing-chain.spec.ts` |
| MDF-XP-02 | Multi-hop substitution staged as one update | `engine/pure-mdf-routing-chain.spec.ts` |
| MDF-XP-03 | Mixed MDF/ordinary impact falls back for the whole UC | `engine/pure-mdf-fallback-routing-chain.spec.ts` |
| MDF-XP-04 | Phase 2 analyzes committed UCs only | `engine/pure-mdf-fallback-routing-chain.spec.ts` |
| MDF-XP-05 | Active manual precedence and stale-reference failure in both modes | `engine/pure-mdf-manual-routing-chain.spec.ts` |
| MDF-XP-06 | Collision replay uses projection without staging | `engine/pure-mdf-replay-routing-chain.spec.ts` |
| MDF-XP-07 | Repeat-run stability and pre-staging failure atomicity | `engine/pure-mdf-replay-routing-chain.spec.ts` |
| MDF-XP-08 | Grouped persistence delta, overlay hydration, rollback, and repeat after wipe | `use-case.mdf-substitution.integration.spec.ts` |
| MDF-XP-09 | Ordinary deletion and parallel-support regression | `engine/deletion-ec-regression-chain.spec.ts` |
| MDF-XP-10 | Legacy EC deletion and MDF-right-domain regression | `engine/deletion-ec-regression-chain.spec.ts` |
| MDF-XP-11 | Parallel mixed semantics and aggregate type/EC invariants use ordinary fallback | `phases/topology-change-analysis.service.spec.ts`; `services/mdf-substitution-analyzer.spec.ts`; `engine/deletion-ec-regression-chain.spec.ts` |
| MDF-XP-12 | Isolated-member removal plus data-link degradation produces one combined decision and write | `phases/topology-change-analysis.service.spec.ts`; `shared/projected-usecase-topology.spec.ts`; `phases/routing-change-stager.spec.ts` |
| MDF-XP-13 | Collision replay resolves the unchanged production-generated collision ID without staging | `engine/pure-mdf-replay-routing-chain.spec.ts` |
| MDF-XP-14 | Unchanged MDF type is omitted from the persisted root delta | `use-case.mdf-substitution.integration.spec.ts` |

## 19. Implementation Surface

Expected production changes:

- `contracts/routing-state.ts`: topology decision contracts.
- `contracts/routing-context.ts`: `topologyChangeAnalysis` state.
- `contracts/routing-input.ts`: active manual edits move to the shared routing input so
  both modes enforce the same dependency and precedence rules.
- `phases/topology-change-analysis.service.ts`: aggregate-first Phase 2
  orchestration and finalized topology decisions.
- `services/mdf-substitution-analyzer.ts`: strict MDF matcher.
- `services/deletion-reconstruction.service.ts`: extracted ordinary reconstruction.
- `phases/pre-validation.service.ts`: MDF non-empty-value invariant.
- `phases/pre-validation/manual-usecase-dependency-validator.ts`: invoked from Phase 1 in automatic
  mode so stale manual edits fail before topology decisions.
- `phases/seed-detection.service.ts`: no MDF `KV_CHANGED` seeds.
- `phases/classification.service.ts`: compare against MDF-projected committed UCs.
- `shared/projected-usecase-topology.ts`: shared structural change application and session projection.
- `phases/routing-change-stager.ts`: stage authoritative MDF decisions.
- Routing engine construction/provider wiring and focused tests for renamed services.

Persistence production code is expected to remain unchanged unless integration tests
expose a missing atomic-delta behavior.

### 19.1 Contract Migration

This redesign intentionally replaces, rather than wraps, the old Phase 2 contract:

- Rename `RoutingContext.deletionAnalysis` to `topologyChangeAnalysis`.
- Replace the parallel `DeletionAnalysis` arrays with the decision union while retaining
  equivalent payload detail inside ordinary decision variants.
- Rename the engine dependency and provider wiring from `DeletionScopeService` to
  `TopologyChangeAnalysisService`.
- Update `RoutingEngine.run()` and `resolveCollision()` to execute the same renamed phase
  and consume the same MDF structural change through `ClassificationService`.
- Update Phase 3, Phase 7/8 reconstruction input, Phase 10 projection, Phase 11 staging,
  response construction, and tests to consume decision kinds rather than old arrays.
- Do not add a temporary compatibility alias for `deletionAnalysis`; all internal
  consumers migrate together.

### 19.2 Persistence and Compatibility Verification

The topology-decision contract is an internal replacement: all consumers migrate together
and no `deletionAnalysis` compatibility alias is retained. Pure MDF substitution uses the
existing aggregate edit-action model, so no TypeORM entity schema, migration, or migration
index changes are required. Persistence integration coverage verifies the root update,
membership/link child actions, shared group and aggregate identity, overlay hydration,
repeat-after-wipe stability, and transaction rollback with the current schema.

## 20. Requirements Alignment

| Requirement | Design coverage |
|---|---|
| FR-MDF-01 strict substitution | Sections 7-8 |
| Direct identity-preserving rewrite | Sections 10 and 13 |
| No affected-UC selection solely for MDF | Section 9 |
| No DFS/reconstruction dependency | Sections 8, 10, and 18.3 |
| Multiple substitutions are atomic | Section 8.3 |
| Preserve GKV and MDF empty contribution | Sections 7, 11, and 13 |
| Preserve EC as one logical crossing | Section 12 |
| Normal fallback | Sections 8.3 and 17 |
| Stale staged UC behavior | Section 14 |
| FR-DUP-03(b1) is not MDF owner | Section 10 |

## 21. Rejected Alternatives

### Dedicated MDF Pipeline Phase

Rejected because MDF eligibility and FR-DEL-02 affected-set construction must consider
the same complete set of UC impacts. A separate phase would introduce ordering and state
coupling without creating an independent business boundary.

### Repair Existing Delete/Reconstruct Flow

Rejected because adding old-pair removal to `INTERIOR_EXTENSION` would still require UC
selection and DFS rediscovery. It would fix the final shape while preserving incorrect
ownership and failure behavior.

### Infer MDF Changes In Phase 11

Rejected because staging is too late to correct FR-DEL-02, classification, and orphan
projection. Phase 11 must consume decisions, not discover topology semantics.
