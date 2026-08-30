<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD4 — Deletion Scope & Disconnected Transition

**Status:** Draft
**Parent:** [`../overall-design.md`](../overall-design.md)
**Last updated:** 2026-08-10

---

## 1. Purpose & Scope

This LLD covers the two pipeline phases in Half A that resolve the fate of existing
UCs before the routing search runs:

| Phase | Service | Placement |
|---|---|---|
| 2 | `DeletionScopeService` | Half A — pre-routing |
| 3 | `DisconnectedTransitionSvc` | Half A |

By the end of Phase 3, the pipeline holds:
- The set of UCs marked for deletion (`markedForDeletion`)
- The set of Disconnected → Connected transitions (`disconnectedTransitions`)
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
| FR-VAL-04 | 2 | §5.2 (deletion UC-scope completeness) |
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

**Upstream (input to Phase 2):** `RoutingContext.input` fully built by handler:
- `input.graphEdits` — assembled from aggregate repos' `findManualEditsSinceLastRouting`
- `input.selectedUsecaseSystemIds` — client payload (for FR-DEL-02 gate)
- `input.staleUcs` — Disconnected UCs from prior sessions (used by Phase 3)

**Downstream (output after Phase 3):** `RoutingContext` populated with:
- `context.markedForDeletion` — UC identifiers pending deletion (from Phase 2)
- `context.reconstructionPaths` — bounded-DFS paths for single-path deleted UCs
  (from Phase 2; joined into `context.dfsPaths` before Phase 8)
- `context.deletionPreservedUCs` — multi-path UCs where all pairs survived (from
  Phase 2; SG-set trimming instructions for Phase 11)
- `context.degradedToDisconnected` — Connected UCs whose data-link was deleted but
  a control-link remains between the same SGs (from Phase 2; auto Connected →
  Disconnected transition per FR-STATUS-02(b))
- `context.disconnectedTransitions` — from Phase 3 (Disconnected → Connected)

**Repo dependencies:**
- `IUsecaseRepository.findAll(fileSystemId, {readMode: 'COMMITTED'})` — Phase 2 loads all UCs (pre-session state) into `context.allUcs`. Subsequent per-SG-deletion, per-link-deletion, per-UC lookups (findByContainingSg, findByContainingLink, findBySystemId) are performed as **in-memory filters** over `context.allUcs` — no additional repo calls. Committed readMode is essential: delete-crud handlers cascade to UC junctions, so overlay reads would hide the impacted rows.
- `IDataLinkRepository.findLinksByPair(sgA, sgB, fileSystemId, excludedIds)` — Phase 2 pair survival check, Phase 3 coverage check
- `IControlLinkRepository.findLinksByPair(sgA, sgB, fileSystemId, excludedIds)` — Phase 2 I7 pair-link presence, Phase 3 direction correction
- `IDataLinkRepository.findIntraUsecaseByFile(fileSystemId, excludedIds)` — Phase 2 bounded-DFS reconstruction

All repo calls go through the edit-crud overlay (committed + STAGED).

---

## 4. Data Structures

### 4.1 `MarkedForDeletion` (Phase 2 output)

```
MarkedForDeletion {
  ucSystemIds:  Set<UcSystemId>
  reasonPerUc:  Map<UcSystemId, DeletionReason>
}

DeletionReason =
  | { kind: 'component-deleted'; itemKind: 'subgraph' | 'data-link' | 'control-link'; itemSystemId: number }
  | { kind: 'pair-broken-single-path' }        // single-path UC, reconstruction failed
  | { kind: 'pair-broken-multi-path' }         // multi-path UC, some pairs broken
```

### 4.2 `DeletionPreservedUC` (Phase 2 output)

For multi-path UCs where all original pairs survive:

```
DeletionPreservedUC {
  ucSystemId:      UcSystemId
  droppedSgIds:    number[]     // SGs to remove from UC's SG set (isolated SG case)
}
```

### 4.3 `ReconstructionPath` (Phase 2 output)

For single-path UCs where bounded DFS finds an alternate route:

```
ReconstructionPath {
  originalUcSystemId:  UcSystemId
  path:                DfsPath   // same shape as LLD2's DfsPath; carries [startSg, ...intermediates, endSg]
}
```

Phase 2 pushes these into `context.dfsPaths` at the end of its run — the paths then
flow through Phase 8's Combination Expansion uniformly with main-DFS output.

### 4.4 `DegradedUc` (Phase 2 output — FR-STATUS-02(b))

For Connected UCs where a data-link deletion left the pair with only control-link
support:

```
DegradedUc {
  ucSystemId:      UcSystemId
  degradedPairs:   Array<{
    sourceSgSystemId: number;
    destSgSystemId:   number;
    deletedDataLinkId: number;
  }>
}
```

Phase 11 emits: `IUsecaseRepository.update(ucId, {status: 'Disconnected'})`. A single
`ARC-ROUTING-UC-AUTO-DISCONNECTED` warning is emitted per UC, carrying the list of
degraded pairs.

### 4.5 `DisconnectedTransition` (Phase 3 output — reverse direction)

```
DisconnectedTransition {
  ucSystemId:            UcSystemId
  directionCorrections:  DirectionCorrection[]     // Step 1 output
  transitioning:         boolean                   // Step 2 result: true = Disconnected → Connected
  addedSgSystemIds:      number[]                  // transparent-bridge SGs added by coverage paths
  addedPairs:            Pair[]                    // bridge-mediated pairs added
}

DirectionCorrection {
  pairSystemId:  number
  newDirection:  { sourceSgSystemId: number; destSgSystemId: number }
}
```

---

## 5. Phase 2 — DeletionScopeService

Runs after Phase 1 (PreValidation) and before Phase 3. Detects impacted UCs from the
deletion delta, fails fast on FR-DEL-02, then handles topology-aware reconstruction
per FR-DEL-06.

### 5.1 FR-DEL-01: Detect all impacted UCs

**Rule:** For each deleted component (SG or intra-usecase link), determine whether
the deletion actually breaks anything in a UC. Only breaking deletions add the UC to
`impactedUcIds`. Non-breaking cases either produce no output (fully covered) or a
warning + auto-transition (data-link deleted with only control-link left).

**Deletion precedence for `reasonPerUc`:** SG deletion > data-link deletion >
control-link deletion. Higher-precedence reasons are set first and not overwritten
by later, lower-precedence deletions on the same UC.

**Algorithm:**

```
impactedUcIds: Set<UcSystemId> := ∅
reasonPerUc:   Map<UcSystemId, DeletionReason> := empty

// Priority 1 (highest): SG deletions — always impacting
for each sg in input.graphEdits.deletedSgs:
  ucs := context.allUcs.filter(uc => uc.subgraphSystemIds.includes(sg.systemId))
  for each uc in ucs:
    if not impactedUcIds.has(uc.systemId):
      impactedUcIds.add(uc.systemId)
      reasonPerUc.set(uc.systemId, {kind: 'component-deleted', itemKind: 'subgraph', itemSystemId: sg.systemId})

// Priority 2: data-link deletions — impacting only if pair loses data-link coverage
for each dl in input.graphEdits.deletedDataLinks:
  survivingDataLinks := IDataLinkRepository.findLinksByPair(dl.sourceSg, dl.destSg, fileSystemId, excluded)
  survivingCtrlLinks := IControlLinkRepository.findLinksByPair(dl.sourceSg, dl.destSg, fileSystemId, excluded)

  if survivingDataLinks.length > 0:
    continue  // another data-link supports the pair; fully covered; no impact, no warning

  // NEW: Transparent bridge substitution check (MDF Scenario 4 — subgraph-boundary offload)
  // If a path from dl.sourceSg → dl.destSg exists through IsMdf-only intermediates,
  // this is a transparent topology change (MDF module offload with intermediate SG).
  // Do NOT impact UCs — the main pipeline discovers the new path via cone/DFS
  // and FR-DUP-03(b1) identity-preserving interior extension updates existing UCs to include the bridge.
  transparentBridgePath := findTransparentBridgePath(
                              from        = dl.sourceSg,
                              to          = dl.destSg,
                              adjacency   = intraUsecaseDataLinkAdjacency,   // post-overlay, minus excluded
                              isMdfFilter = intermediates must have IsMdf=true,
                              maxDepth    = NFR-PERF-01 cap,
                            )
  if transparentBridgePath is not null:
    continue  // transparent MDF substitution — no impact recorded; downstream phases handle the update

  if survivingCtrlLinks.length > 0:
    // Only control-link left — pair I7-supported but not data-link-covered.
    // Auto-transition Connected → Disconnected per FR-STATUS-02(b); warn user.
    ucs := context.allUcs.filter(uc => uc.subgraphPairs.some(p =>
             (p.sourceSubgraphSystemId == dl.sourceSg && p.destSubgraphSystemId == dl.destSg) ||
             (p.sourceSubgraphSystemId == dl.destSg && p.destSubgraphSystemId == dl.sourceSg)))
    for each uc in ucs:
      if uc.type == 'Connected':                  // only Connected UCs auto-transition
        addOrMerge(context.degradedToDisconnected, uc.systemId, {
          sourceSgSystemId: dl.sourceSg,
          destSgSystemId:   dl.destSg,
          deletedDataLinkId: dl.systemId,
        })
    continue

  // No surviving links between the pair — pair broken; UC impacted.
  ucs := IUsecaseRepository.findByContainingLink(dl.systemId, fileSystemId)
  for each uc in ucs:
    if not impactedUcIds.has(uc.systemId):
      impactedUcIds.add(uc.systemId)
      reasonPerUc.set(uc.systemId, {kind: 'component-deleted', itemKind: 'data-link', itemSystemId: dl.systemId})

// Priority 3 (lowest): control-link deletions — impacting only if pair loses all support
for each cl in input.graphEdits.deletedControlLinks:
  survivingDataLinks := IDataLinkRepository.findLinksByPair(cl.sourceSg, cl.destSg, fileSystemId, excluded)
  survivingCtrlLinks := IControlLinkRepository.findLinksByPair(cl.sourceSg, cl.destSg, fileSystemId, excluded)

  if survivingDataLinks.length > 0 or survivingCtrlLinks.length > 0:
    continue  // pair still supported (data or another control); deletion is benign; no impact

  // Pair loses all support (I7 broken) — UC impacted
  ucs := context.allUcs.filter(uc => uc.subgraphPairs.some(p =>
           (p.sourceSubgraphSystemId == cl.sourceSg && p.destSubgraphSystemId == cl.destSg) ||
           (p.sourceSubgraphSystemId == cl.destSg && p.destSubgraphSystemId == cl.sourceSg)))
  for each uc in ucs:
    if not impactedUcIds.has(uc.systemId):
      impactedUcIds.add(uc.systemId)
      reasonPerUc.set(uc.systemId, {kind: 'component-deleted', itemKind: 'control-link', itemSystemId: cl.systemId})

// End: emit warnings for auto-transition cases
for each entry in context.degradedToDisconnected:
  context.warnings.push({
    code: ARC-ROUTING-UC-AUTO-DISCONNECTED,
    impactedEntity: { kind: 'usecase', systemId: entry.ucSystemId },
    details: { degradedPairs: entry.degradedPairs }
  })
```

**Notes:**
- `findLinksByPair` uses the post-overlay effective state — STAGED deletions have
  already been applied, so "surviving" queries reflect the true post-deletion graph.
- `findTransparentBridgePath` runs bounded DFS from `sourceSg` to `destSg` in the
  post-deletion adjacency, only stepping through SGs where `isMdf=true`. Returns the
  full path (including endpoints) if found, null otherwise. Enables **MDF Scenario 4**
  transparent topology substitution: when the user offloads a module at a subgraph
  boundary, MDF inserts an intermediate `isMdf=true` SG plus IPC data-links; the
  deletion of the original direct link is not treated as impacting because a
  transparent bridge path exists. Phase 5–9 discover the new path naturally and
  FR-DUP-03(b1) identity-preserving interior extension updates the affected UC in
  place.
- `addOrMerge` is pseudocode for "add to the list, merging pairs if the UC already
  has an entry." One warning per UC, even if multiple pairs degraded in it.
- Disconnected UCs with data-link deletion + control-link left: no auto-transition
  needed (already Disconnected). No warning either — this is expected state churn on
  Disconnected UCs. If the pair loses all support, the UC does become impacted via
  the "no surviving links" branch above.

**Complexity:** O(deletions × avg-UCs-per-item + deletions × constant-link-lookup).
Repo methods use indexed lookups. Bounded by NFR-PERF-01.

**Edge cases:**
- **Same UC touched by multiple deletions:** precedence rule (SG > data-link >
  control-link) governs `reasonPerUc`. If a UC is also `degradedToDisconnected`
  AND `impactedUcIds`, the `impactedUcIds` marking wins — the UC goes to the
  deletion flow (topology detection + reconstruction attempt). Rationale: if a UC
  has both a broken pair (loss of all support) and a degraded pair (data-link gone,
  control-link left), the broken pair takes precedence — the UC needs the full
  deletion workflow.
- **Deleted control-link on a Disconnected UC:** control-link deletion where pair
  loses all support → UC impacted (marked for deletion). The UC was already
  Disconnected; deletion workflow decides its fate. No degradation transition.
- **UC that was already `changeStatus = UNSTAGED` from a prior session:** in the
  overlay; still detected via repo query.

### 5.2 FR-VAL-04 + FR-DEL-02: Deletion UC-scope completeness (fail-fast)

**Rule:** If any UC in `impactedUcIds` is absent from `input.selectedUsecaseSystemIds`,
return an error listing the **full impacted set** (both already selected and newly
identified). Routing does not proceed.

**Algorithm:**

```
missingUcs := impactedUcIds \ setOf(input.selectedUsecaseSystemIds)
if missingUcs is non-empty:
  return Result.fail([{
    code: ARC-ROUTING-DEL-02,
    details: {
      fullImpactedUcSet: Array.from(impactedUcIds),   // full set for UI to auto-select
      missingUcs: Array.from(missingUcs),             // subset the user didn't include
    }
  }])
```

**Blocking. Issue code:** `ARC-ROUTING-DEL-02`. HTTP 422.

**UI contract:** the response's `fullImpactedUcSet` lets the UI:
1. Auto-select all impacted UCs in `selectedUsecaseSystemIds`.
2. Load each SG's SGKV instances from DB (UC-filtered against the expanded selection).
3. Re-present the form for the user to adjust KVs.
4. User re-invokes `create-usecases` with the expanded selection and full SG map.

FR-API-03 (cone completeness) enforces the SG-map side of this contract on the
re-invocation; it runs at Phase 6 (LLD1).

**Edge case — empty impacted set.** No components deleted, or components deleted
that weren't in any UC. Nothing to check; Phase 2 short-circuits and proceeds. Phase
3 still runs (transitions are triggered by *additions* too, not just deletions).

### 5.3 FR-DEL-03: Mark UCs for deletion

**Rule:** Once FR-DEL-02 passes, every impacted UC is marked pending deletion.

**Algorithm:**

```
context.markedForDeletion.ucSystemIds := impactedUcIds
context.markedForDeletion.reasonPerUc := reasonPerUc
```

The mark is **provisional** — FR-DEL-06 (§5.4) may un-mark a multi-path UC whose
pairs all survive, and may add reconstruction candidates that Phase 9 later dedups
against.

### 5.4 FR-DEL-06: Topology detection + reconstruction

**Rule:** For each impacted UC, detect single-path vs multi-path topology, then apply
the appropriate reconstruction mode.

**Algorithm — topology detection per UC:**

```
for each ucId in impactedUcIds:
  uc := context.allUcs.find(u => u.systemId == ucId)
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
    hasDataLink := IDataLinkRepository.findLinksByPair(A, B, fileSystemId, excluded).length > 0
    hasCtrlLink := IControlLinkRepository.findLinksByPair(A, B, fileSystemId, excluded).length > 0
    if hasDataLink or hasCtrlLink:
      survivingPairs.push(pair)
    else:
      brokenPairs.push(pair)

  if brokenPairs.length == 0:
    // All pairs survive — deletion is a false-positive impact
    // (e.g., an isolated SG in uc.subgraphs was deleted, no pair broken)
    droppedSgIds := input.graphEdits.deletedSgs.filter(sg => sg ∈ uc.subgraphs).map(sg => sg.systemId)
    context.deletionPreservedUCs.push({ucSystemId: uc.systemId, droppedSgIds})
    context.markedForDeletion.ucSystemIds.delete(uc.systemId)   // un-mark
    context.markedForDeletion.reasonPerUc.delete(uc.systemId)
  else:
    // Stays marked for deletion; user decides preserve/accept via FR-DEL-05
    context.markedForDeletion.reasonPerUc.set(uc.systemId, {kind: 'pair-broken-multi-path'})
    // No reconstruction attempted
```

**Design rationale — multi-path UCs get no reconstruction.** These UCs were created
manually (auto-routing only produces single-path shape per FR-STATUS-01). Attempting
auto-reconstruction would produce a topologically-different UC — misleading to the
user. If the user wants a replacement, they use `create-manual-usecase`.

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
    context.markedForDeletion.reasonPerUc.set(uc.systemId, {kind: 'pair-broken-single-path'})
    continue

  // Steps 2, 3, 4: bounded DFS from startSg to endSg
  paths := boundedDfs(startSg, endSg, adjacency, maxDepth)

  // Step 7: no valid path found → UC stays marked for deletion
  if paths.length == 0:
    context.markedForDeletion.reasonPerUc.set(uc.systemId, {kind: 'pair-broken-single-path'})
    continue

  // Add paths to reconstructionPaths for Phase 8 Combination Expansion
  for each path in paths:
    context.reconstructionPaths.push({originalUcSystemId: uc.systemId, path})
```

**Bounded DFS specifics:**
- Uses `adjacency` built from all intra-usecase data-links in the file (post-overlay,
  minus `input.excludedDataLinkSystemIds`).
- **Not** restricted to the cone — the cone is computed later (Phase 6). The bounded
  DFS scope is the whole graph minus exclusions, but bounded by `endSg` as forced
  terminal.
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

  ucFilter := buildUcFilter(input.selectedUsecaseSystemIds)   # same shape as FR-KV-02
  bBaseline := applyUcFilterToSg(B, ucFilter, ISubgraphRepository)   # shared utility
  cBaseline := applyUcFilterToSg(C, ucFilter, ISubgraphRepository)
  bApi := input.activeSubgraphs[B]?.sgkvInstances ?? []
  cApi := input.activeSubgraphs[C]?.sgkvInstances ?? []
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

**Merge into main dfsPaths:**

```
// After all reconstruction paths are computed:
context.dfsPaths.push(...context.reconstructionPaths.map(rp => rp.path))
```

**Why merge into `dfsPaths`?** Phase 8 (Combination Expansion, LLD2) processes every
path uniformly. Reconstruction paths need KV combination expansion just like main
DFS paths. FR-DUP-03(a) exact-match no-op and FR-DUP-03(b1) identity-preserving
interior extension silent auto-update dedup reconstruction candidates at Phase 9
against the main DFS output and existing DB UCs; any other overlap or disjoint result
surfaces via FR-DUP-04.

**Phase 8 receives paths from two sources but doesn't care which is which.** Both are
`DfsPath` values.

**Design rationale — reconstruction DFS in Phase 2, not later.** The DFS is
self-contained (start→end bounded search); it doesn't need KV data from Phase 4 or
cone data from Phase 6. Doing it in Phase 2 keeps deletion-related graph traversal
in one place and gives Phase 8 a single unified path list to expand.

---

## 6. Phase 3 — DisconnectedTransitionSvc

Runs after Phase 2 (DeletionScope). Handles FR-STATUS-04: promote Disconnected UCs
to Connected when new links restore coverage, with control-link-guarded direction
correction as a preliminary step.

Manual mode: this phase is a no-op — manual UC creation doesn't scan existing
Disconnected UCs for transitions.

### 6.1 FR-STATUS-04 Step 1: Direction correction

**Rule:** For each pair `(A, B)` in a stale Disconnected UC, if a data-link exists
in direction `B → A` AND a control-link exists between A and B (the pair is
"control-link-held"), correct the stored pair to `(B, A)`.

**Algorithm — per pair in each stale Disconnected UC:**

```
for each uc in input.staleUcs where uc.status == Disconnected:
  transition := { ucSystemId: uc.systemId, directionCorrections: [], ... }

  for each pair (A, B) in uc.pairs:
    dataLinkAtoB := IDataLinkRepository.findLinksByPair(A, B, fileSystemId, excluded)
                     .filter(dl => dl.sourceSg == A and dl.destSg == B)
    dataLinkBtoA := IDataLinkRepository.findLinksByPair(A, B, fileSystemId, excluded)
                     .filter(dl => dl.sourceSg == B and dl.destSg == A)

    if dataLinkAtoB.length > 0:
      continue  // stored direction matches; no correction needed
    if dataLinkBtoA.length == 0:
      continue  // no data-link in either direction; no correction; Step 2 will find uncovered

    // Opposite-direction data-link exists. Is pair control-link-held?
    controlLinks := IControlLinkRepository.findLinksByPair(A, B, fileSystemId, excluded)
    if controlLinks.length == 0:
      continue  // no control-link → pair was originally data-link-derived and that
                // data-link was deleted (FR-DEL scenario, not this rule)

    // Control-link-held pair with opposite data-link → correct direction
    transition.directionCorrections.push({
      currentDirection: { sourceSgSystemId: A.systemId, destSgSystemId: B.systemId },
      newDirection: { sourceSgSystemId: B.systemId, destSgSystemId: A.systemId }
    })
```

**Why the control-link gate:** Control-links have no inherent direction. When
FR-UC-01 step 4 falls back to a control-link, the direction stored in the pair is
chosen arbitrarily by the smaller-SG-ID rule. That direction is not authoritative.
When a data-link later appears, its direction *is* authoritative and overrides the
pair. Pairs whose original data-link has been deleted follow the deletion scenario
(FR-DEL) — not this rule — because there's no data-link now to override anything.

**Applied vs recorded:** The direction correction is recorded in
`transition.directionCorrections` but *not applied* to the pair in memory yet.
Step 2 (§6.2) evaluates coverage using the corrected direction, and Phase 11
(RoutingChangeStager) emits the actual `edit_action` update.

**I7 preservation:** After correction, the pair is still supported by both the
control-link (still present) and the newly-appearing data-link. I7 (pair-link
presence) is preserved. Once the data-link is committed, the control-link becomes
redundant for pair support but stays in the UC as a separate link.

### 6.2 FR-STATUS-04 Step 2: Coverage check + status transition

**Rule:** For each pair (possibly corrected in Step 1), check if a traversable
intra-usecase data-link path exists from source SG to dest SG, using only:
- Direct intra-usecase data-links between them, OR
- Paths through transparent bridge SGs (`IsMdf=true`) as intermediate nodes.

If **all** pairs are covered, promote the UC to Connected.

**Algorithm:**

```
for each transition in [preliminary transitions from §6.1]:
  uc := findUcById(transition.ucSystemId)
  effectivePairs := applyDirectionCorrections(uc.pairs, transition.directionCorrections)

  allCovered := true
  addedSgs := new Set<number>()
  addedPairs := new Set<Pair>()

  for each pair (A, B) in effectivePairs:
    // Direct data-link check
    dl := IDataLinkRepository.findLinksByPair(A, B, fileSystemId, excluded)
           .filter(dl => dl.sourceSg == A and dl.destSg == B)
    if dl.length > 0:
      continue  // covered directly

    // Bridge-mediated coverage: bounded DFS from A to B, allowed intermediates = SGs with IsMdf=true
    bridgePath := boundedDfsThroughBridges(A, B, excluded, maxDepth)
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
    transition.transitioning := true
    transition.addedSgSystemIds := Array.from(addedSgs)
    transition.addedPairs := Array.from(addedPairs)
    context.disconnectedTransitions.push(transition)
  else:
    // Direction corrections don't apply if the UC doesn't transition
    // (per FR-STATUS-04: "Partial coverage does not trigger conversion")
    // Discard the transition entry entirely.
```

**Bridge SG rule (FR-MDF-01):** an SG with `IsMdf=true` acts as a transparent
intermediate. The path `A → bridge1 → bridge2 → B` is valid coverage if bridge1 and
bridge2 both have `IsMdf=true`.

**Not covered — regular SG intermediates:** a path `A → regularSg → B` where
`regularSg` is not in the UC's pair set does **not** count. FR-STATUS-04 Step 2
disallows this.

**Not covered — partial:** if some pairs cover and others don't, the UC stays
Disconnected. The partially-corrected direction is not persisted (rolled back
implicitly by discarding the transition).

**Complexity:** each pair does one direct data-link lookup + potentially one bounded
DFS through bridge SGs. Bounded by NFR-PERF-01.

**Output written to `context.disconnectedTransitions`.** Phase 11 emits:
- `IUsecaseRepository.update(ucId, {status: Connected, subgraphs: existing ∪ addedSgs, pairs: existing ∪ addedPairs})`
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
| 2 | `ARC-ROUTING-DEL-02` | Blocking (422) | Impacted UC absent from `selectedUsecaseSystemIds` (FR-DEL-02, FR-VAL-04) |
| 2 | `ARC-ROUTING-UC-AUTO-DISCONNECTED` | Warning (200) | Connected UC's data-link deleted but control-link remains between the same SGs (FR-STATUS-02(b) auto-transition) |

Phase 3 has no blocking codes — direction correction and transition are best-effort;
UCs that can't transition stay Disconnected without error.

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
- T-P2-d2: Data-link deleted, only control-link left between same SGs → NOT impacted, but Connected UC gets `ARC-ROUTING-UC-AUTO-DISCONNECTED` warning + status auto-transitions to Disconnected
- T-P2-d3: Data-link deleted, no other link → UC impacted (pair broken)
- T-P2-d4: Data-link deleted, only control-link left, UC is already Disconnected → no auto-transition (already Disconnected), no warning
- T-P2-mdf-a: **MDF Scenario 4 (single intermediate)** — direct L1(SG1→SG2) deleted; SG_INT (isMdf=true) added; L2(SG1→SG_INT) and L3(SG_INT→SG2) added → transparent bridge path found → UC-A NOT impacted → FR-DEL-02 not gated → downstream Phase 9 FR-DUP-03(b1) identity-preserving interior extension UPDATES UC-A to include SG_INT
- T-P2-mdf-b: **MDF Scenario 4 (chain of IsMdf bridges)** — L1(SG1→SG2) deleted; chain SG_INT1→SG_INT2 (both isMdf=true) inserted → transparent bridge path found via chain → UC-A NOT impacted → UC-A UPDATED to include both bridges
- T-P2-mdf-c: **Not MDF (non-IsMdf intermediate)** — L1(SG1→SG2) deleted; a regular SG (not isMdf) inserted between them → transparent bridge check fails → falls through to normal impact flow → FR-DEL-02 fires if UC-A unselected
- T-P2-mdf-d: **Mixed — some deletions transparent, some not** — two data-links deleted; one has transparent bridge substitution, other doesn't → transparent one skipped, other impacts UC → FR-DEL-02 fires for the non-transparent one
- T-P2-e: No deletions → Phase 2 short-circuits
- T-P2-f-precedence: Same UC touched by SG deletion AND data-link deletion → `reasonPerUc` = SG (higher precedence)
- T-P2-g-precedence: Same UC touched by data-link deletion AND control-link deletion (both breaking) → `reasonPerUc` = data-link
- T-P2-h: All impacted UCs already in `selectedUsecaseSystemIds` → no error; proceed
- T-P2-i: UC has one broken pair AND one degraded pair (data-link deleted, only control-link left) → UC goes to `impactedUcIds` (broken pair takes precedence); degradation entry NOT added

**Phase 2 — multi-path pair survival (FR-DEL-06 step 8):**
- T-P2-f: Multi-path UC, isolated SG (in SG set, no pairs) deleted → all pairs survive; UC un-marked; SG removed from UC's SG set (DeletionPreservedUC)
- T-P2-g: Multi-path UC, pair-bearing SG deleted → some pairs broken; UC stays marked
- T-P2-h: Multi-path UC, deleted data-link had ≥1 alternate link (data or control) between same pair → pair survives (I7)
- T-P2-i: Multi-path UC, deleted data-link was the only link between the pair → pair broken; UC stays marked

**Phase 2 — single-path reconstruction (FR-DEL-06 steps 1–7):**
- T-P2-j: Single-path UC [A → B → C], link B→C deleted, alternate B→X→C exists → reconstruction path [A, B, X, C] emitted
- T-P2-k: Single-path UC [A → B → C], start SG A deleted → no reconstruction; UC stays marked with reason `pair-broken-single-path`
- T-P2-l: Single-path UC [A → B → C], all intermediate paths lost (no alt route) → no reconstruction; UC stays marked
- T-P2-m: Single-path UC with cycle in graph (A → B → C, plus B → A) → bounded DFS terminates on cycle; no cyclic reconstruction path emitted
- T-P2-n: Reconstruction path duplicates a path from main DFS (later, Phase 7) → both in `dfsPaths`; FR-DUP-03(a)/(b1) silent branches dedup at Phase 9 (exact match → no-op; identity-preserving interior extension → silent auto-update). Any other overlap surfaces via FR-DUP-04.

**Phase 3 — direction correction (FR-STATUS-04 Step 1):**
- T-P3-a: Disconnected UC pair (A, B), data-link A→B appears, control-link present → no correction (matches direction)
- T-P3-b: Disconnected UC pair (A, B), data-link B→A appears, control-link present → correction to (B, A)
- T-P3-c: Disconnected UC pair (A, B), data-link B→A appears, no control-link → no correction (originally data-link derived; FR-DEL applies)
- T-P3-d: Disconnected UC pair (A, B), no data-link at all → no correction; Step 2 finds uncovered

**Phase 3 — coverage + transition (FR-STATUS-04 Step 2):**
- T-P3-e: All pairs data-link covered → transition to Connected
- T-P3-f: One pair covered via bridge SG `IsMdf=true` → transition; bridge SG + mediated pairs added to UC
- T-P3-g: One pair covered via non-bridge SG intermediate → pair not covered; UC stays Disconnected
- T-P3-h: Partial coverage (some pairs yes, some no) → UC stays Disconnected; direction corrections NOT persisted
- T-P3-i: Manual mode → Phase 3 runs but no-ops (input.staleUcs empty for manual)
- T-P3-j: Chain of bridge SGs A → br1 → br2 → B → transition with br1 and br2 both added

**Phase 2 + Phase 3 interaction:**
- T-P2P3-a: UC-A impacted by deletion; also a Disconnected UC transitions. Independent — both effects recorded.
- T-P2P3-b: UC-B is impacted (in `markedForDeletion`) AND also in `staleUcs` — Phase 3 skips it (only scans non-deleted Disconnected UCs). Add filter in Phase 3 to exclude `markedForDeletion`.

**Legacy test integration:** T-cases from
`C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md` covering
deletion and Disconnected-transition scenarios will be mapped into the implementation
plan's test suite. See task "Incorporate legacy tests into plan."

---

## 10. Open Questions / Assumptions

**D1 — Multi-path topology detection precision.** The `starts`/`ends` sets are
computed from stored pairs. If a UC has `pairs = [(A,B), (C,D)]` where A and C are
different roots, is this multi-path or two-single-paths? Per the FR text (`starts.size
== 1 and ends.size == 1` → single-path; else multi-path), this is multi-path. Design
assumption: **treat as multi-path**. Manual UCs with disjoint sub-topologies are rare
and multi-path pair-level survival semantics handle them safely.

**D2 — Reconstruction path filtering against cone.** Phase 2's bounded DFS runs on
the whole graph, not the cone. Phase 6 (LLD1) computes the cone with a scope
boundary. If the reconstruction path passes through SGs *outside* the cone (i.e., in
UCs not selected by the user), is it emitted? Design assumption: **yes, emit**. If
those SGs aren't in the API map, Phase 6's FR-API-03 will catch it at cone
completeness check and error out. This defers cone-scope enforcement to Phase 6
uniformly.

**D3 — Reconstruction path with new SGs.** If the reconstruction path passes through
a *new* SG (added in `graphEdits.addedSgs`), does the same FR-EXT-01 rule apply
(must be in API map)? Design assumption: yes; same as D2 — Phase 6 catches it.

**D4 — Multiple reconstruction paths per single-path UC.** If bounded DFS finds
multiple alternate routes (e.g., A→X→C and A→Y→C), do we emit all of them or just
one? Design assumption: **emit all**. Phase 8 expands each into UC candidates; Phase
9 dedups. Emitting all gives the user visibility into alternatives.

**D5 — Direction correction on unselected UCs.** FR-STATUS-04 scans `input.staleUcs`
(all Disconnected UCs in the DB). Do we correct pairs on Disconnected UCs that
weren't in `selectedUsecaseSystemIds`? Design assumption: **yes if they're in
scope**. `staleUcs` includes all Disconnected UCs; direction correction is a
lightweight in-scope UC repair, not "new routing," so it's safe to run broadly.
Alternative interpretation (restrict to selected UCs) would leave Disconnected UCs
in outdated state — worse UX. Final call: implementation plan.

---

## 11. References

- Overall Design: [`../overall-design.md`](../overall-design.md)
- LLD1 (upstream — `RoutingContext.input` fields including `graphEdits` and the effective exclusion set from §3.1): [`lld1-kv-resolution-cone.md`](./lld1-kv-resolution-cone.md)
- LLD2 (downstream — consumes reconstruction paths via `dfsPaths`): [`lld2-dfs-core.md`](./lld2-dfs-core.md)
- Requirements (core): [`../../2026-06-01-auto-usecase-routing-requirements.md`](../../2026-06-01-auto-usecase-routing-requirements.md) §3.9 (FR-DEL-*), §3.13 (FR-STATUS-*)
- Requirements (extended): [`../../2026-06-02-auto-usecase-routing-requirements-extended.md`](../../2026-06-02-auto-usecase-routing-requirements-extended.md) §3 (FR-DEL-06 detail)
- Legacy tests to fold into plan: `C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md`
