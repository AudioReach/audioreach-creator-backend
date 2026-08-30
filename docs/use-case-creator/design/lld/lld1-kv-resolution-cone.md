<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD1 — Pre-Validation, KV Resolution, Seed & Cone

**Status:** Draft
**Parent:** [`../overall-design.md`](../overall-design.md)
**Last updated:** 2026-08-08

---

## 1. Purpose & Scope

This LLD covers the four pipeline phases that prepare the routing search space:

| Phase | Service | Placement |
|---|---|---|
| 1 | `PreValidationService` | Half A — pre-routing |
| 4 | `KvResolutionService` | Half B — routing proper |
| 5 | `SeedDetectionService` | Half B |
| 6 | `ConeComputationService` | Half B |

By the end of Phase 6, the pipeline holds a bounded set of SGs (the *cone*) with a
resolved SGKV set per SG. Phase 7 (DFS routing, LLD2) then operates only within this
cone.

---

## 2. Requirements Owned

| Requirement | Phase | Section |
|---|---|---|
| FR-PREVAL-01 | 1 | §5.1 |
| FR-PREVAL-02 | 1 | §5.2 |
| FR-KV-01 | 4 | §6.1 |
| FR-KV-02 | 4 | §6.2 |
| FR-KV-03 | 4 | §6.3 |
| FR-CONE-01 | 5 | §7.1 |
| FR-CONE-02 | 5 | §7.2 |
| FR-CONE-03 | 5 | §7.3 |
| FR-CONE-05 | 5 | §7.4 |
| FR-CONE-06 | 5 | §7.5 |
| FR-CONE-04 | 6 | §8.1 |
| FR-CONE-07 | 6 | §8.2 |
| FR-API-03 | 6 | §8.3 |

FR-VAL-04 (deletion UC-scope completeness) is enforced at Phase 2 (DeletionScope) —
see LLD4. It's not part of Phase 1 because it depends on impacted-UC detection.

---

## 3. Position in Pipeline

**Upstream (input to Phase 1):** `RoutingContext.input` fully built by handler:
- `input.selectedUsecaseSystemIds` — client payload
- `input.activeSubgraphs` — `[{sgSystemId, sgkvInstances[]}]` from client
- `input.graphEdits` — `GraphEditSummary` assembled by the handler from `findManualEditsSinceLastRouting` on subgraph/data-link/control-link repos
- `input.excludedDataLinkSystemIds`, `input.excludedControlLinkSystemIds`, `input.excludedSubgraphSystemIds` (FR-API-05/06)

**Downstream (output after Phase 6):** `RoutingContext` populated with:
- `context.kvResolutions` — per-SG resolved SGKV instances (from Phase 4)
- `context.seeds` — list of seed SG systemIds (from Phase 5)
- `context.cones` — set of SG systemIds forming the routing cone (from Phase 6)

Phase 7 (DFS, LLD2) reads `cones` and `kvResolutions`.

**Repo dependencies:**
- `ISubgraphRepository.getSgkvsBySgIds(fileSystemId, sgSystemIds)` — Phase 4 (SGKV is child of Subgraph aggregate)
- `IUsecaseRepository.findBySystemIds(fileSystemId, ids)` — Phase 4 (UC filter)
- `IUsecaseRepository.findAll(fileSystemId)` — Phase 5 (FR-CONE-02 new-SG detection)
## 3.1 Effective exclusion set (FR-API-05 + FR-API-06)

Before phase algorithms run, the routing engine derives an **effective exclusion set**
from the client payload:

```
effectiveExcludedSgIds   := set(input.excludedSubgraphSystemIds)
effectiveExcludedDlIds   := set(input.excludedDataLinkSystemIds)
                              ∪ { dl.systemId : dl is intra-usecase data-link where
                                                dl.sourceSg ∈ effectiveExcludedSgIds
                                                OR dl.destSg ∈ effectiveExcludedSgIds }
effectiveExcludedClIds   := set(input.excludedControlLinkSystemIds)
                              ∪ { cl.systemId : cl is intra-usecase control-link where
                                                cl.sourceSg ∈ effectiveExcludedSgIds
                                                OR cl.destSg ∈ effectiveExcludedSgIds }
```

Every repo call that takes an `excludedIds` parameter passes the corresponding
`effectiveExcluded*` set. SG-level exclusion automatically extends to incident links —
callers don't need to enumerate them client-side.

**Data structure additions to `RoutingContext.input`:**
- `excludedSubgraphSystemIds: number[]` (from client, may be empty)
- Derived (not part of client payload; computed by handler and stored for reuse):
  `effectiveExcludedSgIds`, `effectiveExcludedDlIds`, `effectiveExcludedClIds`

---

## 4. Data Structures

### 4.1 `SgkvInstance` (domain, `@arc/core`)

```
SgkvInstance {
  sgkvSystemId:  number | null   // null for API-provided instances not yet in DB
  keyValues:     KeyValue[]      // (keyDefSystemId, valueDefSystemId) pairs
}

KeyValue {
  keyDefSystemId:    number   // KeyDefinition systemId
  valueDefSystemId:  number   // ValueDefinition systemId
}
```

Two instances are **equal** iff `keyValues` are set-equal by `(keyDefSystemId, valueDefSystemId)`.
`sgkvSystemId` is not part of equality — an API-provided instance may match a DB
instance even if the client didn't supply the ID.

**Note on client input:** the API DTO sends `valueSystemIds[][]` only (Values, no
Keys) — each Value belongs to exactly one Key Definition, so `keyDefSystemId` is
derivable. Phase 4 (KvResolution) does this lookup once (via subgraph/definition
repo) and populates the full `(keyDefSystemId, valueDefSystemId)` pair in
`SgkvInstance` so downstream conflict detection (FR-DFS-06) can key on
`keyDefSystemId` directly without repeated lookups.

### 4.2 `KvResolutions` (Phase 4 output)

```
KvResolutions {
  perSg: Map<SgSystemId, SgkvInstance[]>   // resolved API-input SGKVs per SG
  ucFilteredBaseline: Map<SgSystemId, SgkvInstance[]>   // Step-2 result, used only for FR-CONE-01
}
```

`perSg` is what Phase 8 (Combination Expansion, LLD2) reads.
`ucFilteredBaseline` is used only by Phase 5 for seed comparison; it's never a routing
KV source.

### 4.3 `Seeds` (Phase 5 output)

```
Seeds {
  sgSystemIds:  Set<SgSystemId>
  reasons:      Map<SgSystemId, SeedReason>   // for diagnostics / logging
}

SeedReason = 'kv-changed' | 'new-sg' | 'link-added' | 'link-deleted' | 'no-uc-context' | 'out-of-uc-context'
```

Only `sgSystemIds` drives Phase 6; `reasons` is informational.

### 4.4 `Cones` (Phase 6 output)

```
Cones {
  sgSystemIds:  Set<SgSystemId>   // union of forward + reverse reachable from any seed
  rootSgs:      Set<SgSystemId>   // subset with no incoming intra-usecase link from another cone SG
}
```

`rootSgs` is computed by Phase 6 and consumed by Phase 7 as DFS start points (FR-DFS-01).

---

## 5. Phase 1 — PreValidationService

Runs first in the pipeline. Fast, cheap, catches structural issues before any
expensive work.

### 5.1 FR-PREVAL-01: Data link integrity

**Rule:** Every intra-usecase data-link in the routing scope must reference two
subgraphs that exist in the DB.

**Algorithm:**

```
sgIds := union of:
  - all SG ids in selected UCs (from repo)
  - all SG ids in input.activeSubgraphs
  - all SG ids referenced by intra-usecase data-links in the file (post-overlay)

validSgIds := ISubgraphRepository.findByIds(fileSystemId, sgIds).map(sg => sg.systemId)

for each intra-usecase data-link L in the file (post-overlay, minus excluded ids):
  if L.sourceSgId ∉ validSgIds or L.destSgId ∉ validSgIds:
    context.warnings.push(nothing)  // no — this is BLOCKING per FR-PREVAL-01
    issues.push(ARC-ROUTING-PREVAL-DATALINK-INTEGRITY, impactedEntity=L.systemId)

if issues.length > 0: return Result.fail(issues)
```

**Blocking. Issue code:** `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY`. HTTP 422.

**Edge cases:**
- Excluded data-links (`input.excludedDataLinkSystemIds`) are skipped — they're not
  part of routing scope.
- SLS-resolved data-links (staged by the handler pre-step) are included via overlay.
- Control-links are not checked here — FR-PREVAL-01 is data-link-specific.

### 5.2 FR-PREVAL-02: Disconnected subgraph island detection

**Rule:** SGs in the routing scope with no intra-usecase data-link to any other SG in
the scope are "islands." Report as **warning**; routing continues.

**Algorithm:**

```
routingScopeSgs := union of:
  - all SG ids in selected UCs
  - all SG ids in input.activeSubgraphs

adjacency := build undirected adjacency from intra-usecase data-links between
             routingScopeSgs (post-overlay, minus excluded)

for each sg in routingScopeSgs:
  if adjacency[sg] is empty:
    context.warnings.push({
      code: ARC-ROUTING-ISLAND-DETECTED,
      impactedEntity: { kind: 'subgraph', systemId: sg }
    })
```

**Non-blocking.** Islands remain in the routing scope; downstream phases handle them
as SGs with no pair (they'll become orphans per FR-VAL-01 if not absorbed into any
UC via control-link fallback in manual mode).

**Edge case:** If a routing scope SG has intra-usecase control-links but no data-links,
it's still an island for FR-PREVAL-02 (rule is data-link-specific). Manual mode may
still route it via FR-UC-01 step 4.

---

## 6. Phase 4 — KvResolutionService

Runs after Halves A's Phases 1–3 (PreValidation, DeletionScope, DisconnectedTransition).
Prepares the SGKV data that Phase 8 (Combination Expansion) will consume.

Implements the three-step KV pipeline (FR-KV-01/02/03) exactly as specified.

### 6.1 FR-KV-01: Step 1 — Load SGKV from DB

**Rule:** For every SG referenced (via selected UCs or API input), load complete
SGKV records from DB.

**Algorithm:**

```
sgIdsToLoad := union of:
  - all SG ids in selected UCs (from IUsecaseRepository)
  - all SG ids in input.activeSubgraphs

dbSgkvs: Map<SgSystemId, SgkvInstance[]>
       := ISubgraphRepository.getSgkvsBySgIds(fileSystemId, sgIdsToLoad)
```

`dbSgkvs` is a scratch value used only for FR-KV-02. Nothing else reads it.

**Edge case:** SGs new to the routing session (not yet in DB) return empty from the
repo. That's fine — FR-KV-02 will produce an empty baseline for them; FR-KV-03 will
replace it with the API input.

### 6.2 FR-KV-02: Step 2 — Apply UC filter

**Rule:** Build a filter map from the selected UCs' `gkv_entries` — **excluding UCs
that are in `context.markedForDeletion`** (per revised FR-KV-02) — then retain only
KV pairs whose `(keyDefSystemId, valueDefSystemId)` appears in the filter. Instances
left with zero KVs are dropped.

**Algorithm:**

```
if input.selectedUsecaseSystemIds is empty:
  ucFilteredBaseline := empty map (per FR-CONE-05)
else:
  // Exclude UCs marked for deletion by Phase 2 (FR-KV-02 revised)
  filteringUcIds := setOf(input.selectedUsecaseSystemIds) \ context.markedForDeletion.ucSystemIds
  filteringUcs   := IUsecaseRepository.findBySystemIds(fileSystemId, filteringUcIds)

  ucFilter: Map<KeyDefId, Set<ValueDefId>> := empty
  for each uc in filteringUcs:
    for each (keyDefSystemId, valueDefSystemId) in uc.gkv:
      ucFilter[keyDefSystemId].add(valueDefSystemId)

  ucFilteredBaseline := empty map
  for each (sgId, sgkvs) in dbSgkvs:
    filteredInstances := []
    for each instance in sgkvs:
      filteredKVs := instance.keyValues.filter(kv =>
        ucFilter[kv.keyDefSystemId]?.has(kv.valueDefSystemId)
      )
      if filteredKVs.length > 0:
        filteredInstances.push({sgkvSystemId: instance.sgkvSystemId, keyValues: filteredKVs})
    ucFilteredBaseline[sgId] := filteredInstances

context.kvResolutions.ucFilteredBaseline := ucFilteredBaseline
```

**Result:** the UC-filtered SGKV instance set per SG. **Used solely for seed
detection in Phase 5** (FR-CONE-01). Never a routing KV source.

**Rationale:** prevents KVs from unrelated UCs (Instance keys, sample rates from
other UCs) from generating irrelevant new GKV combinations later.

### 6.3 FR-KV-03: Step 3 — Apply API input

**Rule:** For each SG in `input.activeSubgraphs`, discard the Step-2 result and
replace it entirely with the API-provided SGKV instances. Every SG in routing scope
must be present in the API map; missing SGs → FR-API-03 error at Phase 6.

**Algorithm:**

```
perSg: Map<SgSystemId, SgkvInstance[]> := empty
for each entry in input.activeSubgraphs:
  // FR-API-06: silently drop excluded SGs from the API map
  if entry.sgSystemId ∈ effectiveExcludedSgIds:
    continue
  perSg[entry.sgSystemId] := entry.sgkvInstances

// IsMdf auto-population — FR-MDF-01 exempts IsMdf SGs from the API map;
// they contribute one empty SGKV instance to every routing path through them.
// Populate for both newly-added IsMdf SGs and any pre-existing IsMdf SGs
// that end up in the routing scope (e.g., inherited from a selected UC).
// Excluded SGs (FR-API-06) are omitted.
isMdfSgIds := ISubgraphRepository.findIsMdfInScope(
                fileSystemId,
                allScopeSgIds = union(selectedUcSgIds, activeSubgraphs.map(s=>s.sgSystemId), graphEdits.addedSgs)
                                  \ effectiveExcludedSgIds,
              )
for each sgId in isMdfSgIds:
  if perSg does not have sgId:
    perSg[sgId] := [{sgkvSystemId: null, keyValues: []}]

// Sanity: non-IsMdf routing-scope SGs not in the API map are FR-API-03 errors (caught in Phase 6)
context.kvResolutions.perSg := perSg
```

**Edge cases:**
- **Empty list `[]` for a user-provided SG** — the SG contributes one empty SGKV instance. Valid; means "user
  declares no KV contribution for this SG."
- **API map missing a non-IsMdf SG in routing scope** — deferred error, caught by FR-API-03
  after cone is computed.
- **IsMdf SG present in `activeSubgraphs` with KVs** — malformed input; per FR-MDF-01 users must not assign KVs to IsMdf SGs. Blocking `ARC-ROUTING-MDF-01` (owned by plan-folded FR-MDF-01 handling, but Phase 4 is the natural detection point).
- **IsMdf SG NOT in `activeSubgraphs`** — normal case; auto-populated with empty SGKV instance per above.

**Invariant enforced:** I6 (SGKV internal consistency). Each SGKV instance must have
at most one `KeyValue` per `keyDefSystemId`. Malformed instances → issue code
`ARC-ROUTING-SGKV-MALFORMED` (blocking, HTTP 422).

---

## 7. Phase 5 — SeedDetectionService

Identifies which SGs are "seeds" — starting points for cone expansion. Reads
`kvResolutions` (both `perSg` and `ucFilteredBaseline`) plus `input.graphEdits` and
existing UC state.

### 7.1 FR-CONE-01: Changed SGs as seeds

**Rule:** An SG is a seed if its Step-3 SGKV set (API input) differs from its Step-2
UC-filtered baseline. Set-based equality (by KV content).

**Algorithm:**

```
for each sgId in kvResolutions.perSg.keys():
  apiSet := setOf(kvResolutions.perSg[sgId])
  baselineSet := setOf(kvResolutions.ucFilteredBaseline[sgId] ?? [])
  if !setEqual(apiSet, baselineSet):
    seeds.add(sgId, reason='kv-changed')
```

Set equality: compare `keyValues` as sorted `(keyDefSystemId, valueDefSystemId)` lists. Order-free.

### 7.2 FR-CONE-02: New SGs as seeds

**Rule:** An SG that appears in `input.activeSubgraphs` but doesn't appear in any UC
in the DB (regardless of selected/unselected) is a "new SG" — automatic seed.

**Algorithm:**

```
allUcSgIds := union of all sgs across all UCs in file (via IUsecaseRepository.findAllInFile)
for each sgId in kvResolutions.perSg.keys():
  if sgId ∉ allUcSgIds:
    seeds.add(sgId, reason='new-sg')
```

This is a set difference — O(SGs in file). Cached once per pipeline invocation.

### 7.3 FR-CONE-03: New or deleted intra-usecase links as seeds

**Rule:** Both endpoints of a newly-added or deleted intra-usecase link are seeds.

**Algorithm:**

```
for each dl in input.graphEdits.addedDataLinks:
  if dl.linkScope == 'intra_usecase':
    seeds.add(dl.sourceSgId, reason='link-added')
    seeds.add(dl.destSgId,   reason='link-added')

for each dl in input.graphEdits.deletedDataLinks:
  if dl.linkScope == 'intra_usecase':
    seeds.add(dl.sourceSgId, reason='link-deleted')
    seeds.add(dl.destSgId,   reason='link-deleted')

// Control-link edits: NOT seeds for the DFS cone.
// DFS is data-link driven per FR-DFS-02; control-link edits do not trigger re-routing.
// Exception: manual UC mode uses control-links for pair discovery, but that runs in
// the create-manual-usecase handler, not via seed-driven routing.
```

**Edge case — pair already exists.** If a "new" data-link connects two SGs that
already share a `use_case_subgraph_pairs` entry, is it still a seed? Per FR-CONE-03
literal reading: yes, both endpoints are seeds because the link is "new" (not
previously in the graph). The downstream classifier (Phase 9) will detect that no
new UC results and no-op via FR-DUP-03(a). Design choice: don't optimize seed
detection to filter these out — it complicates FR-CONE-03 and the cost is trivial.

### 7.4 FR-CONE-05: Empty selected UC list → all API SGs are seeds

**Rule:** When `input.selectedUsecaseSystemIds` is empty, every SG in the API map is
a seed.

**Algorithm:**

Emerges automatically from FR-CONE-01: with `ucFilteredBaseline` empty (Phase 4 §6.2
short-circuit), every API SG's baseline is `[]` and its API set is non-empty (or empty
but different from "no entry" — see below), so every SG becomes a seed via FR-CONE-01.

**Edge case — empty API SGKV list `[]` with empty baseline.** An SG with `perSg[sg] =
[]` (empty list) has API-set `∅`. Its baseline is also `∅` (no UCs selected). Sets
are equal → NOT a seed per FR-CONE-01.

This is fine when the empty-list SG is completely disconnected from the rest of the
graph (nothing to route). If it *is* connected (e.g., via a new data-link), FR-CONE-03
picks it up anyway.

### 7.5 FR-CONE-06: Out-of-selected-UC-context SG → automatic seed

**Rule:** An SG in the API input that is a member of some non-selected UC (i.e.,
exists in DB but not in any selected UC) is an automatic seed.

**Algorithm:**

```
selectedUcSgIds := union of sgs across selectedUcs
for each sgId in kvResolutions.perSg.keys():
  if sgId ∈ allUcSgIds and sgId ∉ selectedUcSgIds:
    seeds.add(sgId, reason='out-of-uc-context')
```

For these SGs: `ucFilteredBaseline[sg]` is `∅` (Step 2 has no reference to filter
against), Step 3 replaces with API input. FR-CONE-01 usually catches it, but
FR-CONE-06 is explicit for clarity.

---

## 8. Phase 6 — ConeComputationService

Expands the seed set into a bounded cone via bidirectional traversal. Feeds Phase 7
(DFS). Ends with FR-API-03 completeness check.

### 8.1 FR-CONE-04: Bidirectional expansion

**Rule:** From each seed, follow intra-usecase data-links in both directions to
reach all reachable SGs. Union across seeds = the cone.

**Algorithm:**

```
adjacency := build directed adjacency from intra-usecase data-links (post-overlay,
             minus excluded ids)
reverse   := reverse adjacency

visited: Set<SgSystemId> := ∅
queue: Queue<SgSystemId> := seeds.sgSystemIds.copy()

while queue not empty:
  sg := queue.dequeue()
  if sg ∈ visited: continue
  visited.add(sg)
  for each neighbor in (adjacency[sg] ∪ reverse[sg]):
    if neighbor is within scope boundary (FR-CONE-07):
      queue.enqueue(neighbor)

cones.sgSystemIds := visited
```

**Complexity:** O(E) where E = intra-usecase data-links in scope. For NFR-PERF-01
targets (50 links), this is <5ms.

**Edge case — cycle in adjacency.** Handled by `visited` set. No stack overflow risk;
using iterative queue.

### 8.2 FR-CONE-07: Scope boundary (non-deletion)

**Rule:** Cone expansion does not cross into SGs that (a) belong only to non-selected
UCs AND (b) are not in the API input.

**Algorithm — the "within scope" predicate:**

```
scopeBoundarySgs := union of:
  - all sgs in selectedUcs (from repo)
  - all sgs in input.activeSubgraphs (i.e., kvResolutions.perSg.keys)

isWithinScope(sg) := sg ∈ scopeBoundarySgs
```

Phase 2 (DeletionScope, LLD4) uses a bounded DFS existence check per impacted pair
(FR-DEL-06 multi-path survival), not the cone. Phase 6's cone covers the routing
region for Phase 7's path-enumeration DFS — including deletion-affected SGs, because
deleted-link endpoints are seeds via FR-CONE-03. Both DFSes operate on the same
post-deletion graph state; they answer different questions:

- **Phase 2 DFS:** "does *any* path between A and B still exist?" — bounded
  existence check per impacted pair.
- **Phase 7 DFS:** "enumerate *all* paths from root SGs through the cone" — path
  enumeration for new UC candidates (FR-DEL-04 broken-path replacement, plus
  extension/creation).

### 8.3 FR-API-03: Cone completeness pre-validation

**Rule:** After the cone is computed, every SG in the cone must appear in the API's
SG map. Missing SGs → blocking error listing them.

**Algorithm:**

```
apiSgIds := set(kvResolutions.perSg.keys())
missing: SgSystemId[] := []
for each sg in cones.sgSystemIds:
  if sg ∉ apiSgIds:
    missing.push(sg)

if missing.length > 0:
  return Result.fail([{
    code: ARC-ROUTING-PREVAL-CONE-INCOMPLETE,
    impactedEntities: missing.map(sg => ({kind: 'subgraph', systemId: sg}))
  }])
```

**Design note:** because FR-CONE-07 bounds expansion to SGs already in the API map or
selected-UC scope, this check should almost always pass. It's a safety net for the
edge case where a cone reaches an SG that's in a selected UC but not in the API map
— the caller must re-invoke with that SG included.

**Deferred cone-root identification.** After the cone is finalized:

```
cones.rootSgs := { sg ∈ cones.sgSystemIds
                   | no intra-usecase data-link enters sg from another sg in
                     cones.sgSystemIds (post-overlay, minus excluded) }
```

Roots are FR-DFS-01's DFS starting points. Computed here to keep Phase 7 focused on
traversal.

---

## 9. Error Handling & Issue Codes

| Phase | Code | Severity | Trigger |
|---|---|---|---|
| 1 | `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY` | Blocking (422) | Data-link references non-existent SG |
| 1 | `ARC-ROUTING-ISLAND-DETECTED` | Warning (200) | SG has no intra-usecase data-link |
| 4 | `ARC-ROUTING-SGKV-MALFORMED` | Blocking (422) | SGKV instance has 2+ values for same Key (I6) |
| 6 | `ARC-ROUTING-PREVAL-CONE-INCOMPLETE` | Blocking (422) | Cone SG missing from API map |

All blocking codes trigger `Result.fail`; orchestrator halts; handler rolls back tx.

---

## 10. Test Scenarios (design-level)

Concrete test cases come in the implementation plan. These scenarios ensure the LLD
covers all requirement branches.

**Phase 1:**
- T-P1-a: All data-links have valid SG references → no issues
- T-P1-b: One data-link points to deleted SG → `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY`
- T-P1-c: SG in scope with zero intra-usecase data-links → `ARC-ROUTING-ISLAND-DETECTED` warning
- T-P1-d: SG has control-link only (no data-link) → still counts as island (data-link specific)

**Phase 4 (KV):**
- T-P4-a: Empty selected UCs → baseline is `∅` for all SGs; every API SG becomes seed
- T-P4-b: SGKV instance filtered to zero KVs → dropped from baseline
- T-P4-c: API replaces DB entirely; DB not used as routing source
- T-P4-d: Empty API list `[]` → one empty SGKV instance in `perSg`
- T-P4-e: SGKV with 2 Values for same Key → `ARC-ROUTING-SGKV-MALFORMED`
- T-P4-f: **IsMdf SG auto-population** — SG_INT (isMdf=true) in `graphEdits.addedSgs` but NOT in `activeSubgraphs` → `perSg[SG_INT] = [{sgkvSystemId: null, keyValues: []}]` (one empty instance)
- T-P4-g: **IsMdf SG from prior UC in scope** — an existing UC in `selectedUsecaseSystemIds` already contains an isMdf SG → auto-populated too (defensive: covers inherited scope)
- T-P4-h: **IsMdf SG with user-provided KV** — user erroneously included isMdf SG in `activeSubgraphs` with non-empty SGKV instances → `ARC-ROUTING-MDF-01` blocking (FR-MDF-01 "No KVs allowed")
- T-P4-i: **Excluded SG in activeSubgraphs (FR-API-06)** — user includes an SG in `activeSubgraphs` that is also in `excludedSubgraphSystemIds` → silently dropped from `perSg`; no error
- T-P4-j: **Excluded SG's incident links auto-excluded** — SG-X in `excludedSubgraphSystemIds`; data-links L1(X→Y) and L2(Z→X) → both L1 and L2 in `effectiveExcludedDlIds`, treated as excluded even without being listed in `excludedDataLinkSystemIds`

**Phase 5 (Seeds):**
- T-P5-a: API SGKV differs from UC-filtered baseline → seed (FR-CONE-01)
- T-P5-b: Brand new SG (not in any UC) → seed (FR-CONE-02)
- T-P5-c: New intra-usecase data-link → both endpoints are seeds
- T-P5-d: Deleted intra-usecase data-link → both endpoints are seeds
- T-P5-e: New control-link → NOT seed (data-link-only rule)
- T-P5-f: SG in non-selected UC but in API → seed (FR-CONE-06)
- T-P5-g: New data-link between already-paired SGs → still seed (design choice per §7.3)

**Phase 6 (Cone):**
- T-P6-a: Bidirectional expansion from single seed
- T-P6-b: Two seeds with overlapping cones → union
- T-P6-c: Cone stops at scope boundary (SG in non-selected UC not in API)
- T-P6-d: Cone SG missing from API map → `ARC-ROUTING-PREVAL-CONE-INCOMPLETE`
- T-P6-e: Cycle in data-link graph → no infinite expansion; visited set bounds it

---

## 11. Open Questions / Assumptions

**A1 — SGKV identity across sessions.** An API-provided instance whose KVs match a
DB SGKV — do we treat them as the same instance (reuse `sgkvSystemId`) or as
distinct (new instance, `sgkvSystemId = null`)? Assumption: match by content, reuse
`sgkvSystemId` when possible. Confirms with FR-KV-COMMIT-01's "not already
represented" language. Final call: LLD6 / implementation plan.

**A2 — SGKV identity within a call.** If two SGs in `input.activeSubgraphs` reference
the same SGKV DB record (rare but possible), do we dedupe or treat as two separate
instances? Assumption: each SG's `sgkvInstances[]` is independent — no cross-SG
identity. Only the SGKV values matter for FR-DFS-06 conflict detection.

**A3 — `graphEdits` freshness.** The handler builds `graphEdits` via
the three aggregate repos' `findManualEditsSinceLastRouting` methods before invoking `RoutingEngine`. If the chain-resolver pre-step
adds STAGED data-links, are those included in `graphEdits.addedDataLinks`? Yes —
handler order in overall design §5 has `graphEdits` built *after* chain resolution.
No open question; explicit in overall design.

---

## 12. References

- Overall Design: [`../overall-design.md`](../overall-design.md)
- Requirements (core): [`../../2026-06-01-auto-usecase-routing-requirements.md`](../../2026-06-01-auto-usecase-routing-requirements.md) §3.3, §3.4
- Requirements (extended): [`../../2026-06-02-auto-usecase-routing-requirements-extended.md`](../../2026-06-02-auto-usecase-routing-requirements-extended.md) §3 (FR-PREVAL-01/02)
- Next in pipeline: LLD2 (`lld2-dfs-core.md`) — DFS + combination expansion
