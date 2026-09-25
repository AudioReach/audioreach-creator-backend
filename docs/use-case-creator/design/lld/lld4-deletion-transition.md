<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD4 — Topology Change Analysis & `ISLAND` → `LINKED` Transition

## Current Snapshot Boundary

This refactor supersedes the former flat `RoutingInput` and duplicate graph-read
descriptions in this LLD. Deletion phases consume
`input.graphSnapshot.sessionEdits`, `input.graphSnapshot.committedUsecases`, and the
prepared overlay/routable link collections. The snapshot builder owns the one committed
UC catalog read, overlay graph reads, MDF classification, and construction-local
exclusion filtering. Phase 2 publishes one finalized per-UC decision inside
`topologyChangeAnalysis`; Phase 7 produces `dfsPaths` and must not duplicate Phase 2
reconstruction paths. Manual discovery and Phase 1 do not access repositories.

**Status:** Draft
**Parent:** [`../overall-design.md`](../overall-design.md)
**Last updated:** 2026-09-25

The algorithmic pseudocode in later sections predates the snapshot boundary. In that
pseudocode, `input.graphEdits` means `input.graphSnapshot.sessionEdits`,
`input.activeSubgraphs` means `input.graphSnapshot.subgraphs`,
`input.scopePolicy` means `input.requestPolicy`, and `context.allUcs` means
`input.graphSnapshot.committedUsecases`. These are conceptual mappings only;
implementations must use the current grouped context outputs and must not restore the
legacy fields or duplicate graph reads.

---

## 1. Purpose & Scope

This LLD covers the two pipeline phases in Half A that resolve the fate of existing
UCs before the routing search runs:

| Phase | Service | Placement |
|---|---|---|
| 2 | `TopologyChangeAnalysisService` | Half A — pre-routing |
| 3 | `IslandTransitionService` | Half A |

By the end of Phase 3, the pipeline holds:
- Direct pure-MDF structural updates that bypass deletion selection and reconstruction
- The set of UCs marked for deletion (`markedForDeletion`)
- The set of `ISLAND` → `LINKED` transitions (`islandTransitions`)
- Any direction corrections on control-link-held pairs
- Reconstruction path candidates for single-path deleted UCs (fed into Phase 8's
  Combination Expansion via `dfsPaths`)

These outputs join the main DFS output at Phase 9 (Classification, folded into
implementation plan) where FR-DUP-03(a)/(b1) silent branches and FR-DUP-04 user-choice
collision handling apply.

---

## 2. Requirements Owned

| Requirement | Phase | Section |
|---|---|---|
| FR-DEL-01 | 2 | §5.1 |
| FR-DEL-02 | 2 | §5.2 (fail-fast) |
| FR-DEL-03 | 2 | §5.3 (marking) |
| FR-DEL-06 | 2 | §5.4 (topology + reconstruction) |
| FR-VAL-04 | 2 | §5.2 (affected UC-scope completeness) |
| FR-API-07 (deletion-side closure) | 2 | §5.2 (after FR-DEL-02) |
| FR-MDF-01 (pure substitution) | 1, 2, 11 | §4.1, §5.1 |
| FR-STATUS-04 Step 1 | 3 | §6.1 (direction correction) |
| FR-STATUS-04 Step 2 | 3 | §6.2 (coverage + transition) |
| FR-EXT-01/02/03 | — | §7 (context only — cone + main DFS own these) |

**Not owned by this LLD:**
- FR-DEL-04 (New UCs from broken paths) — main DFS (Phase 7, LLD2) does this
  naturally by traversing the cone that includes the deletion region.
- FR-DEL-05 (User option to keep a deletion-marked UC) — user-driven decision made
  via a subsequent API call (e.g., `/stage-changes` selection). Not a routing-pipeline
  concern.

---

## 3. Position in Pipeline

**Upstream (input to Phase 2):** `RoutingContext.input` fully built by the handler:
- `input.requestPolicy` — explicit request intent and exclusions for closure checks
- `input.selectedUsecases` — effective overlay snapshots for selected-UC gates
- `input.graphSnapshot.sessionEdits` — session graph changes
- `input.graphSnapshot.committedUsecases` — complete pre-run UC catalog
- `input.graphSnapshot.subgraphs` and complete overlay link catalogs — deletion and
  reconstruction topology
- routable snapshot links and MDF flags — request-scoped traversal inputs

Phase 2 derives local selected IDs and scope membership from these immutable collections;
they are not stored as separate input/context fields.

In both modes, Phase 1 has already validated `activeManualUsecaseEdits`. Phase 2 uses
valid manual projections only to prevent a competing MDF update for the same UC; an
ordinary deletion impact remains subject to FR-DEL-02.

**Downstream (output after Phase 3):** `RoutingContext` is populated with grouped
`topologyChangeAnalysis` and `islandTransitions` descriptors. Reconstruction paths join
the shared `routingCandidates` state before Phase 8; no parallel legacy output arrays
are retained.

**Repo dependencies:** Phase 2 and Phase 3 do not read graph or UC repositories. Their
request-scoped reads are completed by the snapshot builder, which uses the committed UC
read to retain deletion evidence hidden by overlay cascades. Phase 2 retains one narrow
`SubgraphRepository` dependency solely for the existing legacy-EC endpoint SGKV baseline
comparison; it does not reload topology. After ordinary decisions are finalized and
before bounded legacy reconstruction, `DeletionReconstructionService` may call
`getSgkvs(fileSystemId, legacyEcEndpointSystemIds)` once. No MDF, gate, preservation,
degradation, or other Phase 2 consumer may use this repository.

---

## 4. Data Structures

### 4.1 `TopologyChangeAnalysis` (Phase 2 output)

Phase 2 publishes exactly one finalized decision for every impacted committed UC:

```
TopologyChangeAnalysis {
  affectedUsecaseSystemIds: Set<UcSystemId>
  decisions: UsecaseTopologyDecision[]
}

UsecaseTopologyDecision :=
    MdfSubstitution
  | PreserveUsecase
  | DegradeToIsland
  | DeleteOrReconstruct
```

`MdfSubstitution` contains all pair replacements and one complete structural projection:
removed pairs, added MDF members, added chain pairs, resulting topology/type, and empty
MDF assignment metadata. It is intentionally excluded from
`affectedUsecaseSystemIds`. All other decision kinds retain their existing FR-DEL-02
selection semantics.

The implementation details and downstream projection contract are defined in
[`../pure-mdf-substitution-design.md`](../pure-mdf-substitution-design.md).

### 4.2 Affected UC Set (Phase 2 output)

The union of UCs requiring ordinary deletion handling, selected reconstruction or
preservation, or type degradation. This is the set gated by FR-DEL-02 and returned in
full when any member is unselected. A pure MDF structural update is recorded separately
and is not a member of this set.

### 4.3 `MarkedForDeletion` (`DeleteOrReconstruct` detail)

```
MarkedForDeletion {
  ucSystemIds:             Set<UcSystemId>
  deletedComponentPerUc:   Map<UcSystemId, DeletedComponent>
}

DeletedComponent {
  type:      'SUBGRAPH' | 'DATA_LINK' | 'CONTROL_LINK'
  systemId:  number
}
```

Every final deletion mark retains only its deleted-component cause. Single-path and
multi-path analysis determine whether a mark is preserved, unmarked, or reconstructed;
they are internal routing behavior and are not part of the mark contract or issue
payload. When several components affect the same UC, the deterministic cause precedence
is subgraph, then data link, then control link.

### 4.4 `DeletionPreservedUC` (`PreserveUsecase` detail)

For multi-path UCs where all original pairs survive:

```
DeletionPreservedUC {
  ucSystemId:      UcSystemId
  droppedSgIds:    number[]     // SGs to remove from UC's SG set (isolated SG case)
}
```

### 4.5 `ReconstructionPath` (`DeleteOrReconstruct` detail)

For single-path UCs where bounded DFS finds an alternate route:

```
ReconstructionPath {
  originalUcSystemId:  UcSystemId
  path:                DfsPath   // same shape as LLD2's DfsPath; carries [startSg, ...intermediates, endSg]
}
```

Phase 2 stores these under the matching `DELETE_OR_RECONSTRUCT` decision. Combination
Expansion consumes them alongside Phase 7 `dfsPaths` without duplicating them in both
collections.

### 4.6 `IslandUseCaseCandidate` (`DegradeToIsland` detail)

For `LINKED` UCs where a data-link deletion left the pair with only control-link
support:

```
IslandUseCaseCandidate {
  usecase:              UseCase
  dataLinkLossPairs:    DataLinkLossPair[]
}

DataLinkLossPair {
  sourceSubgraphSystemId:    number
  destSubgraphSystemId:      number
  deletedDataLinkSystemId:   number
}
```

Phase 11 emits: `IUsecaseRepository.update(ucId, {type: 'ISLAND'})`. A single
`ARC-ROUTING-UC-AUTO-ISLAND` warning is emitted per UC,
carrying the list of data-link-loss pairs.

### 4.7 `IslandTransition` (Phase 3 `ISLAND` → `LINKED` output)

```
IslandTransition {
  usecase:                    UseCase
  directionCorrections:       DirectionCorrection[] // Step 1 output
  addedSubgraphSystemIds:     number[]              // transparent-bridge SGs added by coverage paths
  addedPairs:                 SubgraphPair[]         // bridge-mediated directed pairs
}

DirectionCorrection {
  currentSourceSubgraphSystemId: number
  currentDestSubgraphSystemId:   number
  newSourceSubgraphSystemId:     number
  newDestSubgraphSystemId:       number
}
```

Only fully covered UCs receive an `IslandTransition`, so a separate `transitioning`
flag is unnecessary. The descriptor carries the immutable committed `UseCase`; Phase 11
uses its `systemId` when staging the update. Pair relationship-row identifiers remain a
persistence concern and do not enter the core contract.

---

## 5. Phase 2 — TopologyChangeAnalysisService

Runs after Phase 1 (PreValidation) and before Phase 3. It examines the file-wide
committed pre-session UC set, aggregates all topology effects per UC, publishes one
finalized decision, fails fast on FR-DEL-02 for ordinary affected UCs, then handles
topology-aware reconstruction per FR-DEL-06.

Manual mode still performs file-wide impact discovery and both deletion-side gates. It
does not run ordinary automatic reconstruction, degradation, or preservation. A pure MDF
substitution remains a system-owned direct structural update in either routing mode
because it is not deletion reconstruction. Manual pair discovery remains limited to the
explicitly supplied effective routing scope; commit-time validation protects staged UCs
from stale references.

### 5.1 FR-DEL-01: Detect all affected UCs

**Rule:** Build a read-only snapshot-derived inventory, aggregate every component effect
by UC identity, and finalize each UC once. Pure MDF substitutions publish a direct update
and are excluded from the affected set. Ordinary deletion, preservation, degradation,
and reconstruction decisions form the file-wide affected set used by FR-DEL-02. Fully
covered link deletions that require no UC mutation produce no output.

**Deletion precedence for `deletedComponentPerUc`:** SG deletion > data-link deletion >
control-link deletion. Higher-precedence reasons are set first and not overwritten
by later, lower-precedence deletions on the same UC.

**Algorithm:**

```
inventory := buildTopologyImpactInventory(input.graphSnapshot)
drafts := Map<UcSystemId, UsecaseImpactDraft>()

for each deleted subgraph in stable ID order:
  record ordinary deletion impact for every committed UC containing it

for each deleted data-link in stable ID order:
  if another direct data-link survives:
    continue

  if a direct control-link survives:
    record LINKED-to-ISLAND degradation where applicable
    continue

  substitution := mdfSubstitutionAnalyzer.analyze(deletedDataLink, inventory)
  for each committed UC containing the exact directed deleted pair:
    if substitution exists:
      record provisional MDF substitution in that UC's draft
    else:
      record ordinary data-link deletion impact

for each deleted control-link in stable ID order:
  if no direct data-link or control-link survives:
    record ordinary control-link deletion impact for every UC containing the pair

decisions := []
for each UC draft in stable UC ID order:
  if every topology-changing deletion is a compatible MDF substitution
     and the draft contains no ordinary deletion impact:
    decisions.push(buildAtomicMdfSubstitutionDecision(draft))
  else:
    discard every provisional MDF substitution
    decisions.push(finalizeOrdinaryDeletionDecision(draft))

affectedUcIds := set(decisions excluding MDF_SUBSTITUTION by UC system ID)
context.topologyChangeAnalysis := {affectedUsecaseSystemIds: affectedUcIds, decisions}
```

**Notes:**
- Deletion-impact `findLinksByPair` calls use the post-overlay state after STAGED
  deletions but deliberately ignore request-only routing exclusions. Therefore
  "surviving" means present in the actual post-deletion graph.
- `MdfSubstitutionAnalyzer` returns a complete substitution or `null`. A complete
  substitution requires one strict directed chain with MDF-only intermediates, matching
  EC semantics, explicit scope, and no surviving direct support.
- Direct support is checked against complete post-overlay catalogs before request
  exclusions. An excluded but physically surviving direct link still prevents MDF
  substitution. Replacement-chain discovery then uses only routable, non-excluded scope;
  excluding a chain member/link makes the strict substitution unavailable.
- Pure MDF decisions do not enter FR-DEL-02 and do not depend on Phase 5–9 discovery.
  Phase 11 applies their authoritative structural projection directly.
- Classification and orphan validation consume an in-memory projection of the finalized
  MDF topology so DFS rediscovery cannot create duplicate work.
- `addOrMerge` is pseudocode for "add a candidate, merging data-link-loss pairs if the UC
  already has an entry." One warning per UC, even if multiple pairs lost data-link support.
- `ISLAND` UCs with data-link deletion + control-link left: no auto-transition
  needed (already `ISLAND`). No warning either — this is expected state churn on
  `ISLAND` UCs. If the pair loses all support, the UC does become impacted via
  the "no surviving links" branch above.

**Complexity:** indexes are built once. Impact aggregation is O(deletions ×
avg-UCs-per-item); MDF checks use cycle-safe bounded traversal over request-scoped
adjacency. No per-deletion repository reads are introduced.

**Edge cases:**
- **Same UC touched by multiple deletions:** precedence rule (SG > data-link >
  control-link) governs the retained ordinary deleted-component cause. If a UC has both
  a broken pair and a degraded pair, the final decision is `DELETE_OR_RECONSTRUCT`; the
  broken pair takes precedence over degradation.
- **Deleted control-link on an `ISLAND` UC:** control-link deletion where pair
  loses all support → UC impacted (marked for deletion). The UC was already
  `ISLAND`; deletion workflow decides its fate. No degradation transition.
- **UC that was already `changeStatus = UNSTAGED` from a prior session:** in the
  overlay; still detected via repo query.

### 5.2 FR-VAL-04 + FR-DEL-02: Affected UC-scope completeness (fail-fast)

**Rule:** If any UC in `affectedUcIds` is absent from the IDs derived from
`input.selectedUsecases`, return an error containing the **full affected set**
and the missing subset. Routing does not proceed. This includes UCs that would be
deleted, ordinarily reconstructed/preserved, or selected as a `LINKED` to `ISLAND`
candidate. A UC whose only decision is `MDF_SUBSTITUTION` is not in `affectedUcIds` and
does not require UC selection. Its MDF members remain subject to explicit routing-scope
validation.

**Algorithm:**

```
selectedUsecaseIds := set(input.selectedUsecases[*].systemId)
missingUcs := affectedUcIds \ selectedUsecaseIds
if missingUcs is non-empty:
  return Result.fail([{
    code: ARC-ROUTING-DEL-02,
    details: {
      fullAffectedUcSet: Array.from(affectedUcIds),
      missingUcs: Array.from(missingUcs),
    }
  }])
```

**Blocking. Issue code:** `ARC-ROUTING-DEL-02`. HTTP 422.

**Client contract:** the response's `fullAffectedUcSet` lets the client:
1. Include all affected UCs in `selectedUsecaseSystemIds`.
2. Load each SG's SGKV instances from DB (UC-filtered against the expanded selection).
3. Re-present the form for the user to adjust KVs.
4. User re-invokes `create-usecases` with the expanded selection and full SG map.

FR-API-03 enforces the selected-scope SG-map side of this contract on the re-invocation.
After the affected-UC gate succeeds, FR-API-07 enforces deletion-side closure:

```
deletedSgIds := set(input.graphEdits.deletedSgs[*].systemId)
deletedDlIds := system IDs of intra-usecase links in input.graphEdits.deletedDataLinks
deletedClIds := system IDs in input.graphEdits.deletedControlLinks

requiredSurvivingEndpointSgIds := ∅
for each dl in input.graphEdits.deletedDataLinks where dl.linkScope == 'intra_usecase':
  if dl.sourceSgId ∉ deletedSgIds:
    requiredSurvivingEndpointSgIds.add(dl.sourceSgId)
  if dl.destSgId ∉ deletedSgIds:
    requiredSurvivingEndpointSgIds.add(dl.destSgId)

excludedDeletedSgIds := deletedSgIds ∩ input.scopePolicy.excludedSubgraphSystemIds
excludedDeletedDlIds := deletedDlIds ∩ input.excludedDataLinkSystemIds
excludedDeletedClIds := deletedClIds ∩ input.excludedControlLinkSystemIds
missingSurvivingEndpointSgIds :=
  requiredSurvivingEndpointSgIds \ input.scopePolicy.requestedSubgraphSystemIds
excludedSurvivingEndpointSgIds :=
  requiredSurvivingEndpointSgIds ∩ input.scopePolicy.excludedSubgraphSystemIds

if any deletion-side conflict set is non-empty:
  return Result.fail([{
    code: ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT,
    details: all non-empty deletion-side conflict sets
  }])
```

Deleted control-link endpoints are deliberately absent from
`requiredSurvivingEndpointSgIds`: they do not force automatic routing scope. The control
link remains visible to the Phase 2 support/impact checks above and to downstream orphan
validation. In manual mode, it participates in fallback only when its endpoints are
already in manual effective scope.

**Error precedence:** when `missingUcs` is non-empty, return only `ARC-ROUTING-DEL-02`
for this pass. Deletion-side `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT` is evaluated after
the client retries with the full affected UC selection. This preserves the client
workflow that first learns every UC and SG it must add.

**Edge case — empty affected set.** No components were deleted, the deletions require no
ordinary UC handling, or every resulting decision is a pure MDF substitution. FR-DEL-02
has nothing to check, but deletion-side FR-API-07 still runs because an orphan deleted
link may have no affected UC. Pure MDF decisions remain available for Phase 11. Phase 3
still runs (transitions are triggered by *additions* too, not just deletions).

### 5.3 FR-DEL-03: Mark UCs for deletion

**Rule:** Once FR-DEL-02 passes, every finalized `DELETE_OR_RECONSTRUCT` decision is
marked pending deletion. `MDF_SUBSTITUTION`, `PRESERVE`, and `DEGRADE_TO_ISLAND`
decisions are never marked pending deletion.

**Algorithm:**

```
context.topologyChangeAnalysis.decisions
  .filter(decision => decision.kind == 'DELETE_OR_RECONSTRUCT')
  .forEach(decision => stage provisional deletion mark from decision.deletedComponent)
```

The mark is **provisional** — FR-DEL-06 (§5.4) may un-mark a multi-path UC whose
pairs all survive, and may add reconstruction candidates that Phase 9 later dedups
against.

### 5.4 FR-DEL-06: Topology detection + reconstruction

**Rule:** For each impacted UC, detect single-path vs multi-path topology, then apply
the appropriate reconstruction mode.

**Algorithm — topology detection per UC:**

```
for each decision where decision.kind == 'DELETE_OR_RECONSTRUCT':
  uc := decision.usecase
  starts := SGs in uc.subgraphs with no incoming pair (in uc.pairs)
  ends   := SGs in uc.subgraphs with no outgoing pair
  if starts.size == 1 and ends.size == 1:
    singlePathUcs.push({uc, startSg: starts[0], endSg: ends[0]})
  else:
    multiPathUcs.push(uc)
```

**Complexity:** O(pairs) per UC. Trivial.

#### 5.4.a Multi-path branch (FR-DEL-06 step 8)

**Rule:** For multi-path UCs, no bounded-DFS reconstruction — auto-routing cannot
reproduce multi-path topology. Instead, compute the surviving pair set.

**Algorithm:**

```
for each uc in multiPathUcs:
  survivingPairs := []
  brokenPairs := []
  for each pair (A, B) in uc.pairs:
    // Endpoints still exist?
    aExists := A.systemId not in input.graphEdits.deletedSgs
    bExists := B.systemId not in input.graphEdits.deletedSgs
    if not (aExists and bExists):
      brokenPairs.push(pair)
      continue
    // Supporting link (data or control) still present? (I7)
    hasDataLink := inventory.survivingDataLinkPairKeys.has(unorderedPairKey(A, B))
    hasCtrlLink := inventory.survivingControlLinkPairKeys.has(unorderedPairKey(A, B))
    if hasDataLink or hasCtrlLink:
      survivingPairs.push(pair)
    else:
      brokenPairs.push(pair)

  if brokenPairs.length == 0:
    // All pairs survive — deletion is a false-positive impact
    // (e.g., an isolated SG in uc.subgraphs was deleted, no pair broken)
    droppedSgIds := input.graphEdits.deletedSgs.filter(sg => sg ∈ uc.subgraphs).map(sg => sg.systemId)
    replace decision with PRESERVE {usecase: uc, droppedSgIds}
  else:
    // Stays marked for deletion; user decides preserve/accept via FR-DEL-05
    // Keep the existing deleted-component cause. No reconstruction is attempted.
```

**Design rationale — multi-path UCs get no reconstruction.** These UCs were created
manually (auto-routing only produces single-path shape per FR-STATUS-01). Attempting
auto-reconstruction would produce a topologically-different UC — misleading to the
user. If the user wants a replacement, they use `create-manual-usecases`.

#### 5.4.b Single-path branch (FR-DEL-06 steps 1–7)

**Rule:** For single-path UCs, run a bounded DFS from the UC's start SG to its end
SG on the current graph (post-deletion, overlay-aware). Discovered paths become
reconstruction candidates.

**Algorithm:**

```
for each {uc, startSg, endSg} in singlePathUcs:
  // Step 6: If start or end SG was deleted, no reconstruction possible
  if startSg ∈ input.graphEdits.deletedSgs or endSg ∈ input.graphEdits.deletedSgs:
    // UC stays marked for deletion; no reconstruction
    // Keep the existing deleted-component cause.
    continue

  // Steps 2, 3, 4: bounded DFS from startSg to endSg
  paths := boundedDfs(startSg, endSg, adjacency, maxDepth)

  // Step 7: no valid path found → UC stays marked for deletion
  if paths.length == 0:
    // Keep the existing deleted-component cause.
    continue

  // Add paths to reconstructionPaths for Phase 8 Combination Expansion
  for each path in paths:
    decision.reconstructionPaths.push({originalUcSystemId: uc.systemId, path})
```

Skipping endpoint-anchored reconstruction does not suppress normal routing of the
surviving graph. Deleting an SG also deletes its incident intra-usecase data-links;
under FR-CONE-03, Phase 5 seeds each surviving in-scope endpoint of those links
independently. FR-API-07 guarantees that each surviving endpoint is active and
non-excluded. Phases 6 and 7 can therefore discover valid multi-SG fragments on either
side of the deletion. The deleted endpoint is not seeded or traversed, and single-SG
fragments remain subject to FR-DEL-04's manual-only rule.

**Bounded DFS specifics:**
- Uses `adjacency` built from post-overlay intra-usecase data-links whose endpoints are
  both in local `effectiveRoutingScope`, minus effective data-link exclusions.
- It is **not** restricted to the cone, which is computed later, but it is restricted to
  the same effective routing graph and bounded by `endSg` as forced terminal.
- `maxDepth` from NFR-PERF-01 — same cap as Phase 7's main DFS.
- **Cycle handling:** if DFS visits an SG already in the current stack, terminate
  that branch (do not emit — a cyclic reconstruction path doesn't make sense as a
  replacement UC). Warnings are not emitted here; Phase 7 will surface cycles from
  the main traversal.
- **EC handling for legacy EC UCs (FR-EC-07 Rule B):** if the UC being reconstructed
  is a legacy EC UC (`type=EC` AND SG count > 2 AND pair set contains one `isEc=true`
  data-link), compute the "narrow FR-CONE-01 check" for the internal EC endpoints
  (B, C) before running reconstruction DFS:

  ```
  # Legacy EC UC preamble — narrow FR-CONE-01 check for {B, C}
  ecLink := find(uc.pairs where supportingDataLink.isEc == true).link
  B := ecLink.sourceSg
  C := ecLink.destSg

  ucFilter := buildUcFilter(input.selectedUsecases)   # same request-start comparison frame as FR-KV-02
  bBaseline := applyUcFilterToSg(B, ucFilter, ISubgraphRepository)   # shared utility
  cBaseline := applyUcFilterToSg(C, ucFilter, ISubgraphRepository)
  bApi := input.activeSubgraphs.find(entry => entry.systemId == B).sgkvs
  cApi := input.activeSubgraphs.find(entry => entry.systemId == C).sgkvs
  bKvChanged := not setEqual(bApi, bBaseline)
  cKvChanged := not setEqual(cApi, cBaseline)

  if bKvChanged or cKvChanged:
    ecTreatment := 'boundary'   # standard Phase 7 behavior; reconstruction likely fails
  else:
    ecTreatment := 'regular'    # cross the EC boundary as if it were a normal data-link
  ```

  The `applyUcFilterToSg(sgId, ucFilter, subgraphRepo)` helper lives in
  `@arc/core/application/routing/shared/kv-filter.ts` and is also used by Phase 4
  (LLD1 §6.2 FR-KV-02) to avoid duplicating the filter logic. For non-legacy UCs,
  the reconstruction DFS uses the default `ecTreatment = 'boundary'` (standard
  behavior).

**Phase 8 path input:**

```
reconstructionPaths := context.topologyChangeAnalysis.decisions
  .filter(decision => decision.kind == 'DELETE_OR_RECONSTRUCT')
  .flatMap(decision => decision.reconstructionPaths.map(item => item.path))

pathsForExpansion := [...context.dfsPaths, ...reconstructionPaths]
```

**Why merge into `dfsPaths`?** Phase 8 (Combination Expansion, LLD2) processes every
path uniformly. Reconstruction paths need KV combination expansion just like main
DFS paths. FR-DUP-03(a) exact-match no-op and FR-DUP-03(b1) identity-preserving
interior extension silent auto-update dedup reconstruction candidates at Phase 9
against the main DFS output and existing DB UCs; any other overlap or disjoint result
surfaces via FR-DUP-04.

**Phase 8 receives paths from two sources but doesn't care which is which.** Main DFS
paths come from `context.dfsPaths`; reconstruction paths come from the matching topology
decisions. Both carry `DfsPath` values.

**Design rationale — reconstruction DFS in Phase 2, not later.** The DFS is
self-contained (start→end bounded search); it doesn't need KV data from Phase 4 or
cone data from Phase 6. Doing it in Phase 2 keeps deletion-related graph traversal
in one place and gives Phase 8 a single unified path list to expand.

---

## 6. Phase 3 — `IslandTransitionService`

Runs after Phase 2 (Topology Change Analysis). Handles FR-STATUS-04: promote `ISLAND` UCs
to `LINKED` when new links restore coverage, with control-link-guarded direction
correction as a preliminary step.

Manual mode: this phase is a no-op — manual UC creation doesn't scan existing
`ISLAND` UCs for transitions.

Phase 3 is snapshot-only. It reads committed UCs and the prepared routable graph from
`input.graphSnapshot`; it does not query UC or link repositories. Eligible UCs are
committed pre-run `ISLAND` UCs whose SG members and pair endpoints are all in the
effective snapshot scope and which Phase 2 did not mark for deletion.

### 6.1 FR-STATUS-04 Step 1: Direction correction

**Rule:** For each pair `(A, B)` in an `ISLAND` UC present before the run, if a data-link exists
in direction `B → A` AND a control-link exists between A and B (the pair is
"control-link-held"), correct the stored pair to `(B, A)`.

**Algorithm — per pair in each eligible pre-existing `ISLAND` UC:**

```
scopeSgIds := set(input.graphSnapshot.subgraphs[*].subgraph.systemId)
markedUcIds := set(context.topologyChangeAnalysis.decisions
  .filter(decision => decision.kind == 'DELETE_OR_RECONSTRUCT')[*].usecase.systemId)
islandUcs := input.graphSnapshot.committedUsecases
  .filter(uc => uc.type == 'ISLAND')
  .filter(uc => every UC SG member and pair endpoint is in scopeSgIds)
  .filter(uc => uc.systemId not in markedUcIds)

for each uc in islandUcs ordered by uc.systemId:
  provisionalCorrections := []

  for each pair (A, B) in uc.pairs:
    dataLinkAtoB := input.graphSnapshot.routableDataLinks
      .filter(dl => dl.sourceSg == A and dl.destSg == B)
    dataLinkBtoA := input.graphSnapshot.routableDataLinks
      .filter(dl => dl.sourceSg == B and dl.destSg == A)

    if dataLinkAtoB.length > 0:
      continue  // stored direction matches; no correction needed
    if dataLinkBtoA.length == 0:
      continue  // no data-link in either direction; no correction; Step 2 will find uncovered

    // Opposite-direction data-link exists. Is pair control-link-held?
    controlLinks := input.graphSnapshot.routableControlLinks
      .filter(cl => cl connects A and B in either direction)
    if controlLinks.length == 0:
      continue  // no control-link → pair was originally data-link-derived and that
                // data-link was deleted (FR-DEL scenario, not this rule)

    // Control-link-held pair with opposite data-link → correct direction
    provisionalCorrections.push({
      currentSourceSubgraphSystemId: A.systemId,
      currentDestSubgraphSystemId: B.systemId,
      newSourceSubgraphSystemId: B.systemId,
      newDestSubgraphSystemId: A.systemId
    })
```

**Why the control-link gate:** Control-links have no inherent direction. When
FR-UC-01 step 4 falls back to a control-link, the direction stored in the pair is
chosen arbitrarily by the smaller-SG-ID rule. That direction is not authoritative.
When a data-link later appears, its direction *is* authoritative and overrides the
pair. Pairs whose original data-link has been deleted follow the deletion scenario
(FR-DEL) — not this rule — because there's no data-link now to override anything.

**Applied vs recorded:** Direction corrections remain provisional and do not mutate the
committed `UseCase`. Step 2 (§6.2) evaluates a local pair view with those corrections
applied. Only a fully covered UC publishes them in its `IslandTransition`; Phase 11
(RoutingChangeStager) emits the actual `edit_action` update.

**I7 preservation:** After correction, the pair is still supported by both the
control-link (still present) and the newly-appearing data-link. I7 (pair-link
presence) is preserved. Once the data-link is committed, the control-link becomes
redundant for pair support but stays in the UC as a separate link.

### 6.2 FR-STATUS-04 Step 2: Coverage check + type transition

**Rule:** For each pair (possibly corrected in Step 1), check if a traversable
intra-usecase data-link path exists from source SG to dest SG, using only:
- Direct intra-usecase data-links between them, OR
- Paths through transparent bridge SGs (`IsMdf=true`) as intermediate nodes.

If **all** pairs are covered, promote the UC to `LINKED`.

**Algorithm:**

```
for each uc and provisionalCorrections from §6.1:
  effectivePairs := applyDirectionCorrections(uc.pairs, provisionalCorrections)

  allCovered := true
  addedSgs := new Set<number>()
  addedPairs := new Set<Pair>()

  for each pair (A, B) in effectivePairs:
    // Direct data-link check
    dl := input.graphSnapshot.routableDataLinks
      .filter(dl => dl.sourceSg == A and dl.destSg == B)
    if dl.length > 0:
      continue  // covered directly

    // Bridge-mediated coverage: deterministic bounded DFS over routableDataLinks.
    // Every intermediate must be in snapshot scope and have IsMdf=true.
    bridgePath := boundedDfsThroughBridges(
      A, B, input.graphSnapshot.routableDataLinks,
      input.graphSnapshot.subgraphs, maxDepth = scopeSgIds.size)
    if bridgePath is null:
      allCovered := false
      break

    // Record bridge SGs and mediated pairs
    for each intermediate in bridgePath.intermediates:
      addedSgs.add(intermediate.systemId)
    // e.g., A → bridge X → B produces pairs (A,X) and (X,B)
    for each edge in bridgePath.edges:
      addedPairs.add({sourceSg: edge.from, destSg: edge.to})

  if allCovered:
    context.islandTransitions.push({
      usecase: uc,
      directionCorrections: sort(provisionalCorrections),
      addedSubgraphSystemIds: sort(Array.from(addedSgs)),
      addedPairs: sort(Array.from(addedPairs))
    })
  else:
    // Direction corrections don't apply if the UC doesn't transition
    // (per FR-STATUS-04: "Partial coverage does not trigger conversion")
    // Discard the transition entry entirely.
```

**Bridge SG rule (FR-MDF-01):** an SG with `IsMdf=true` acts as a transparent
intermediate. The path `A → bridge1 → bridge2 → B` is valid coverage if bridge1 and
bridge2 both have `IsMdf=true` and every SG in the path belongs to
local `effectiveRoutingScope`.

**Not covered — regular SG intermediates:** a path `A → regularSg → B` where
`regularSg` is not in the UC's pair set does **not** count. FR-STATUS-04 Step 2
disallows this.

**Not covered — partial:** if some pairs cover and others don't, the UC stays
`ISLAND`. The partially-corrected direction is not persisted (rolled back
implicitly by discarding the transition).

**Complexity:** each pair does one in-memory direct data-link lookup and potentially one
bounded DFS through bridge SGs. Bounded by NFR-PERF-01.

Output publication is atomic per UC and deterministic: Phase 3 builds provisional
corrections/additions locally, publishes only fully covered descriptors, deduplicates
bridge additions, and orders descriptors and nested collections by numeric IDs.

**Output written to `context.islandTransitions`.** Phase 11 consumes each descriptor and emits:
- `IUsecaseRepository.update(ucId, {type: 'LINKED', subgraphs: existing ∪ addedSgs, pairs: existing ∪ addedPairs})`
- One `reverseDirection(ucId, currentSourceSgSystemId, currentDestSgSystemId)` per
  entry in `directionCorrections`. The persistence adapter resolves the relationship
  row's internal `system_id`; that identifier does not enter the core model.

---

## 7. Extension Scenarios (FR-EXT-01/02/03)

**Not owned by this LLD — covered by LLD1 + LLD2 phases.** Extension is the case
where the user adds new SGs and/or new intra-usecase links to build additional UCs:

- **FR-EXT-01** (New SGs are seeds, require API map entry): handled by LLD1 Phase 5
  seed detection (FR-CONE-02) + Phase 4 KV resolution (FR-KV-03 API-mandatory).
- **FR-EXT-02** (New paths discovered and presented as Unstaged): handled by LLD1
  Phase 6 (cone) + LLD2 Phase 7 (main DFS). New paths become UC candidates via
  FR-LIFE-01/02 (UNSTAGED by default).
- **FR-EXT-03** (User selects which new UCs to stage): out-of-scope for routing —
  handled by `/stage-changes` endpoint downstream.

Listed here only for completeness; nothing in Phase 2 or Phase 3 is extension-specific.

---

## 8. Error Handling & Issue Codes

| Phase | Code | Severity | Trigger |
|---|---|---|---|
| 2 | `ARC-ROUTING-DEL-02` | Blocking (422) | A UC requiring deletion, structural mutation, or type degradation is absent from `selectedUsecaseSystemIds` (FR-DEL-02, FR-VAL-04) |
| 2 | `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT` | Blocking (422) | After FR-DEL-02 passes, a deleted SG/link is explicitly excluded or a surviving deleted-data-link endpoint is missing/excluded (FR-API-07) |
| 2 | `ARC-ROUTING-UC-AUTO-ISLAND` | Warning (200) | `LINKED` UC's data-link deleted but control-link remains between the same SGs (FR-STATUS-02(b) auto-transition to `ISLAND`) |

Phase 3 has no blocking codes — direction correction and transition are best-effort;
UCs that can't transition stay `ISLAND` without error.

**Silent behaviors** (no issue emitted):
- Control-link deletion where another link (data or control) still supports the pair
  — benign; UC not touched.
- Data-link deletion where another data-link still supports the pair — benign; UC not
  touched.
- Reconstruction failure (single-path DFS finds no path) — UC just stays in
  `markedForDeletion`; user decides via FR-DEL-05 downstream.

---

## 9. Test Scenarios (design-level)

Concrete tests come in the implementation plan. These scenarios cover all requirement
branches.

**Phase 2 — impact detection + fail-fast:**
- T-P2-a: Data-link L1 deleted, L1 was the only link between (A,B) in UC-A → UC-A impacted; if unselected → 422
- T-P2-b: SG deleted, SG in UC-A and UC-B → both impacted
- T-P2-c1: Control-link deleted, data-link exists between same SGs → NOT impacted (benign)
- T-P2-c2: Control-link deleted, another control-link exists between same SGs → NOT impacted (benign)
- T-P2-c3: Control-link deleted, no other link between same SGs → UC impacted (pair loses I7 support)
- T-P2-d1: Data-link deleted, another data-link between same SGs → NOT impacted, no warning
- T-P2-d2: Data-link deleted, only control-link left between same SGs → UC is affected by type degradation, gets `ARC-ROUTING-UC-AUTO-ISLAND`, and transitions to `ISLAND` when selected
- T-P2-d2-selection: The island-use-case candidate is absent from `selectedUsecaseSystemIds` → 422 with full affected and missing sets
- T-P2-d3: Data-link deleted, no other link → UC impacted (pair broken)
- T-P2-d4: Data-link deleted, only control-link left, UC is already `ISLAND` → no auto-transition (already `ISLAND`), no warning
- T-P2-exclusion: A surviving support link is request-excluded but not deleted → it
  still prevents a false file-wide deletion impact
- T-P2-mdf-a: **MDF Scenario 4 (single intermediate)** — direct L1(SG1→SG2) deleted; SG_INT (`IsMdf=true`) and links SG1→SG_INT→SG2 form one strict chain → Phase 2 emits `MDF_SUBSTITUTION`; UC-A is not in FR-DEL-02 and Phase 11 removes the old pair and adds the MDF topology
- T-P2-mdf-selection: UC-A is absent from `selectedUsecaseSystemIds` but has only a pure MDF substitution → no FR-DEL-02 error; the direct update still occurs
- T-P2-mdf-b: **MDF Scenario 4 (MDF chain)** — SG1→SG_INT1→SG_INT2→SG2 replaces the direct pair → one atomic UC-A update adds both MDF members and all chain pairs
- T-P2-mdf-c: **Not MDF (non-MDF intermediate)** — a regular SG replaces the direct link → analyzer returns no substitution and normal FR-DEL-02 handling applies
- T-P2-mdf-d: **Mixed UC impacts** — one deleted pair has an MDF chain and another has an ordinary deletion impact → all provisional MDF substitutions for that UC are discarded and FR-DEL-02 applies to the UC
- T-P2-mdf-e: Replacement topology branches into multiple MDF chains → not the strict MDF scenario; normal FR-DEL-02 handling applies
- T-P2-mdf-f: Direct control/data support remains on the original pair → not an MDF substitution; existing benign/degradation rules take precedence
- T-P2-mdf-g: MDF chain replaces an EC link and every chain link is EC → direct update preserves one logical EC crossing and `type=EC`
- T-P2-mdf-h: A physically surviving direct support link is request-excluded → it still prevents MDF substitution; request exclusions do not manufacture deletion impact
- T-P2-mdf-i: An MDF chain SG/link is request-excluded → the chain is unavailable and normal deletion handling applies
- T-P2-mdf-j: Valid active manual update already contains the MDF chain for an unselected UC → no duplicate auto update and no FR-DEL-02 error solely for that substitution
- T-P2-mdf-k: The same manually updated UC has another ordinary deletion impact → FR-DEL-02 still requires that UC
- T-P2-e: No deletions → Phase 2 short-circuits
- T-P2-f-precedence: Same UC touched by SG deletion AND data-link deletion → deleted-component cause = SG (higher precedence)
- T-P2-g-precedence: Same UC touched by data-link deletion AND control-link deletion (both breaking) → deleted-component cause = data-link
- T-P2-h: All affected UCs already in `selectedUsecaseSystemIds` → no error; proceed
- T-P2-i: UC has one broken pair AND one data-link-loss pair (data-link deleted, only control-link left) → final decision is `DELETE_OR_RECONSTRUCT` (broken pair takes precedence); degradation decision is not emitted

**Phase 2 — deletion-side structural-edit closure (FR-API-07):**
- T-P2-edit-a: A deletion affects an unselected UC and also has a missing/excluded surviving endpoint → return only `ARC-ROUTING-DEL-02` on the first pass
- T-P2-edit-b: Client retries with every affected UC selected but a deleted SG is explicitly excluded → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P2-edit-c: Deleted data-link or control-link ID is explicitly excluded → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P2-edit-d: Deleted data-link has a surviving endpoint missing from `activeSubgraphs` or explicitly excluded → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P2-edit-e: Deleted data-link endpoint SG is also deleted → that endpoint is not required; every surviving endpoint remains required
- T-P2-edit-f: Deleted control-link endpoint is outside auto effective scope → no edit-scope error; link still participates in Phase 2 support/impact checks and downstream orphan validation
- T-P2-edit-g: Deleted orphan link has no affected UC but is explicitly excluded → FR-DEL-02 passes with an empty set, then `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`

**Phase 2 — multi-path pair survival (FR-DEL-06 step 8):**
- T-P2-f: Multi-path UC, isolated SG (in SG set, no pairs) deleted → all pairs survive; UC un-marked; SG removed from UC's SG set (DeletionPreservedUC)
- T-P2-g: Multi-path UC, pair-bearing SG deleted → some pairs broken; UC stays marked
- T-P2-h: Multi-path UC, deleted data-link had ≥1 alternate link (data or control) between same pair → pair survives (I7)
- T-P2-i: Multi-path UC, deleted data-link was the only link between the pair → pair broken; UC stays marked

**Phase 2 — single-path reconstruction (FR-DEL-06 steps 1–7):**
- T-P2-j: Single-path UC [A → B → C], link B→C deleted, alternate B→X→C exists → reconstruction path [A, B, X, C] emitted
- T-P2-k: Single-path UC [A → B → C], start SG A deleted → no reconstruction; UC stays marked with deleted-component cause SG A
- T-P2-l: Single-path UC [A → B → C], all intermediate paths lost (no alt route) → no reconstruction; UC stays marked
- T-P2-m: Single-path UC with cycle in graph (A → B → C, plus B → A) → bounded DFS terminates on cycle; no cyclic reconstruction path emitted
- T-P2-n: Reconstruction path duplicates a path from main DFS (later, Phase 7) → both in `dfsPaths`; FR-DUP-03(a)/(b1) silent branches dedup at Phase 9 (exact match → no-op; identity-preserving interior extension → silent auto-update). Any other overlap surfaces via FR-DUP-04.

**Phase 2 + Phase 5–7 deletion-fragment interaction:**
- T-P2P5-a: Single-path UC [A → B → C → D → E], SG C and incident links B→C/C→D deleted, no alternate A→E path → reconstruction emits nothing; B and D are independently seeded by the deleted links, and main DFS evaluates surviving multi-SG fragments [A, B] and [D, E]

**Phase 3 — direction correction (FR-STATUS-04 Step 1):**
- T-P3-a: `ISLAND` UC pair (A, B), data-link A→B appears, control-link present → no correction (matches direction)
- T-P3-b: `ISLAND` UC pair (A, B), data-link B→A appears, control-link present → correction to (B, A)
- T-P3-c: `ISLAND` UC pair (A, B), data-link B→A appears, no control-link → no correction (originally data-link derived; FR-DEL applies)
- T-P3-d: `ISLAND` UC pair (A, B), no data-link at all → no correction; Step 2 finds uncovered

**Phase 3 — coverage + transition (FR-STATUS-04 Step 2):**
- T-P3-e: All pairs data-link covered → transition to `LINKED`
- T-P3-f: One pair covered via bridge SG `IsMdf=true` → transition; bridge SG + mediated pairs added to UC
- T-P3-g: One pair covered via non-bridge SG intermediate → pair not covered; UC stays `ISLAND`
- T-P3-h: Partial coverage (some pairs yes, some no) → UC stays `ISLAND`; direction corrections NOT persisted
- T-P3-i: Manual mode → Phase 3 returns success without scanning committed `ISLAND` UCs
- T-P3-j: Chain of bridge SGs A → br1 → br2 → B → transition with br1 and br2 both added

**Phase 2 + Phase 3 interaction:**
- T-P2P3-a: UC-A impacted by deletion; also an `ISLAND` UC transitions. Independent — both effects recorded.
- T-P2P3-b: UC-B is impacted (in `markedForDeletion`) and is also a committed
  `ISLAND` UC — Phase 3 skips it

**Legacy test integration:** T-cases from
`C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md` covering
deletion and `ISLAND`-transition scenarios will be mapped into the implementation
plan's test suite. See task "Incorporate legacy tests into plan."

---

## 10. Open Questions / Assumptions

**D1 — Multi-path topology detection precision.** The `starts`/`ends` sets are
computed from stored pairs. If a UC has `pairs = [(A,B), (C,D)]` where A and C are
different roots, is this multi-path or two-single-paths? Per the FR text (`starts.size
== 1 and ends.size == 1` → single-path; else multi-path), this is multi-path. Design
assumption: **treat as multi-path**. Manual UCs with disjoint sub-topologies are rare
and multi-path pair-level survival semantics handle them safely.

**D2 — Reconstruction path scope.** File-wide traversal is used only to discover the
complete affected-UC set. Phase 2's reconstruction DFS is bounded by
local `effectiveRoutingScope`, the same graph available to automatic seed/cone/DFS
routing. A reconstruction path cannot import an SG merely because it exists in the DB.

**D3 — Reconstruction path with new SGs.** A new SG participates only when it is an
explicit, non-excluded member of `activeSubgraphs`, and therefore of
`effectiveRoutingScope`.

**D4 — Multiple reconstruction paths per single-path UC.** If bounded DFS finds
multiple alternate routes (e.g., A→X→C and A→Y→C), do we emit all of them or just
one? Design assumption: **emit all**. Phase 8 expands each into UC candidates; Phase
9 dedups. Emitting all gives the user visibility into alternatives.

**D5 — Direction correction on unselected UCs.** FR-STATUS-04 scans committed
`ISLAND` UCs from `input.graphSnapshot.committedUsecases`. The implemented decision is
to evaluate them even when they are absent from `selectedUsecases`, provided all their SG
members and pair endpoints are in effective snapshot scope and Phase 2 did not mark them
for deletion. Direction correction is a lightweight in-scope UC repair rather than new
routing; restricting it to selected UCs would leave eligible `ISLAND` UCs outdated.

---

## 11. References

- Overall Design: [`../overall-design.md`](../overall-design.md)
- LLD1 (upstream — `RoutingContext.input` fields including `graphEdits` and the effective exclusion set from §3.1): [`lld1-kv-resolution-cone.md`](./lld1-kv-resolution-cone.md)
- LLD2 (downstream — consumes reconstruction paths via `dfsPaths`): [`lld2-dfs-core.md`](./lld2-dfs-core.md)
- Requirements (core): [`../../2026-06-01-auto-usecase-routing-requirements.md`](../../2026-06-01-auto-usecase-routing-requirements.md) §3.9 (FR-DEL-*), §3.13 (FR-STATUS-*)
- Requirements (extended): [`../../2026-06-02-auto-usecase-routing-requirements-extended.md`](../../2026-06-02-auto-usecase-routing-requirements-extended.md) §3 (FR-DEL-06 detail)
- Legacy tests to fold into plan: `C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md`
