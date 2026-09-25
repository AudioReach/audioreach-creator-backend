<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD1 — Pre-Validation, KV Resolution, Seed & Cone

## Current Snapshot Boundary

This refactor supersedes the former per-phase scope/exclusion derivation described below.
Handlers pass the original `requestPolicy` and effective active selections to one shared
`RoutingGraphSnapshotBuilder`. The builder reads overlay subgraphs, overlay data/control
links, committed UseCases, and MDF metadata once, applies exclusions once, and publishes
`graphSnapshot` with `RoutingSubgraph.requestedSgkvs`, routable links, complete overlay
catalogs, committed UseCases, and `sessionEdits`.

Phase 1 validates `graphSnapshot.subgraphs` against
`graphSnapshot.routableDataLinks` and emits island warnings without repository reads.
Phase 4 no longer re-runs MDF classification. It reads persisted SGKVs for the comparison
baseline and performs one batched, effective-overlay, file-scoped Value Definition-to-Key
lookup to normalize arbitrary valid API selections.
Phases 5–6 consume `graphSnapshot.sessionEdits` and routable links. No phase recreates
effective exclusion sets, and no phase reloads graph catalogs.

**Status:** Draft
**Parent:** [`../overall-design.md`](../overall-design.md)
**Last updated:** 2026-09-25

The algorithmic pseudocode in later sections predates the snapshot boundary. In that
pseudocode, `input.activeSubgraphs` means `input.graphSnapshot.subgraphs`,
`input.scopePolicy` means `input.requestPolicy`, and `input.graphEdits` means
`input.graphSnapshot.sessionEdits`. These are conceptual mappings only; implementations
must use the current contracts above and must not add the legacy fields back to input or
context.

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
| FR-API-07 (addition-side closure) | Handler pre-step | §5.1 |
| FR-API-03 | Handler pre-step | §5.2 |
| FR-PREVAL-01 | 1 | §5.3 |
| FR-PREVAL-02 | 1 | §5.4 |
| FR-MDF-01 (no MDF values) | 1 | §5.5 |
| Stale active manual dependency check | 1 | §5.6 |
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

FR-VAL-04 (deletion UC-scope completeness) is enforced at Phase 2 (Topology Change
Analysis) — see LLD4. It's not part of Phase 1 because it depends on impacted-UC
detection.

---

## 3. Position in Pipeline

**Upstream (input to Phase 1):** `RoutingContext.input` fully built by the handler:
- `input.selectedUsecases` — UCs loaded once from the effective overlay
- `input.requestPolicy` — immutable client request intent and explicit exclusions
- `input.graphSnapshot` — immutable routable subgraphs/links, complete overlay catalogs,
  committed UCs, session edits, and MDF flags

**Downstream (output after Phase 6):** `RoutingContext` populated with:
- `context.kvResolutions` — per-SG resolved SGKV instances (from Phase 4)
- `context.seeds` — list of seed SG systemIds (from Phase 5)
- `context.cones` — set of SG systemIds forming the routing cone (from Phase 6)

Phase 7 (DFS, LLD2) reads `cones` and `kvResolutions`.

**Repo dependencies:**
- SGKV baseline and Value Definition-to-Key resolution remain Phase 4 dependencies only.
- The mapping read is independent of existing SGKV membership: users may select any
  Value Definition owned by a Key Definition in the same file.
- Graph and MDF repositories are not Phase 1–6 dependencies; those reads belong to the
  shared snapshot builder.

## 3.1 Snapshot authority (FR-API-05 + FR-API-06)

Before phase algorithms run, `RoutingGraphSnapshotBuilder` applies request policy and
produces the effective scope and link exclusions. SG-level exclusion automatically
extends to incident intra-usecase links. Phase services consume
`graphSnapshot.subgraphs`, `graphSnapshot.routableDataLinks`,
`graphSnapshot.routableControlLinks`, and `graphSnapshot.sessionEdits`; they do not
recreate exclusion sets or call graph repositories.

---

## 4. Data Structures

### 4.1 `SgkvInstance` (domain, `@arc/core`)

```
SgkvInstance {
  keyValues: KeyValue[]  // canonical (keyDefSystemId, valueDefSystemId) pairs
}

KeyValue {
  keyDefSystemId:    number   // KeyDefinition systemId
  valueDefSystemId:  number   // ValueDefinition systemId
}
```

Two instances are **equal** iff `keyValues` are set-equal by
`(keyDefSystemId, valueDefSystemId)`. Routing instances are deliberately content-only:
Phase 4 does not expose, reserve, or reuse `sgkv.system_id`. The commit path resolves an
existing ID by exact content or creates a new SGKV atomically under FR-KV-COMMIT-01.

**Note on client input:** the API DTO sends `valueSystemIds[][]` only (Values, no
Keys) — each Value belongs to exactly one Key Definition, so `keyDefSystemId` is
derivable. Phase 4 (KvResolution) resolves all requested Value IDs once through
`SubgraphRepository.resolveKeyValues(fileSystemId, valueDefSystemIds)`. The repository
uses the effective definition overlay, constrains parent Keys to the file, and does not
require the Values to appear in an existing SGKV. Phase 4 then populates the full
`(keyDefSystemId, valueDefSystemId)` pair in
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

SeedReason = 'kv-changed' | 'new-sg' | 'link-added' | 'link-deleted' | 'no-uc-context' | 'out-of-selection'
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

The handler completes §5.1 and §5.2 before manual pair discovery or engine invocation.
Phase 1 then performs the structural, MDF-value, and dependency checks in §5.3 through
§5.6. These
checks are fast and run before expensive work.

### 5.1 FR-API-07: Addition-side structural-edit closure

**Rule:** Current-session additions cannot be suppressed by request exclusions. Added
SGs and both endpoints of added intra-usecase data-links must be explicit, non-excluded
routing input. Added control-links cannot be explicitly excluded but do not force their
endpoint SGs into automatic routing scope. Deletion-side closure is deferred to Phase 2
so FR-DEL-02 can return the full affected-UC set first (LLD4 §5.2).

```
deletedSgIds := set(input.graphEdits.deletedSgs[*].systemId)
addedSgIds   := set(input.graphEdits.addedSgs[*].systemId)
addedDlIds   := system IDs of intra-usecase links in input.graphEdits.addedDataLinks
addedClIds   := system IDs in input.graphEdits.addedControlLinks

requiredEndpointSgIds := ∅
for each dl in input.graphEdits.addedDataLinks where dl.linkScope == 'intra_usecase':
  requiredEndpointSgIds.add(dl.sourceSgId)
  requiredEndpointSgIds.add(dl.destSgId)

excludedAddedSgIds := addedSgIds ∩ input.scopePolicy.excludedSubgraphSystemIds
excludedAddedDlIds := addedDlIds ∩ input.excludedDataLinkSystemIds
excludedAddedClIds := addedClIds ∩ input.excludedControlLinkSystemIds

missingAddedSgs := addedSgIds \ input.scopePolicy.requestedSubgraphSystemIds
missingRequiredEndpoints := requiredEndpointSgIds \ input.scopePolicy.requestedSubgraphSystemIds
excludedRequiredEndpoints := requiredEndpointSgIds ∩ input.scopePolicy.excludedSubgraphSystemIds
deletedAddedLinkEndpoints := endpoints(input.graphEdits.addedDataLinks) ∩ deletedSgIds

if any set above is non-empty:
  return Result.fail([{
    code: ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT,
    details: all non-empty conflict sets
  }])
```

After this validation, session-deleted SGs are removed from `effectiveRoutingScope`
even if stale client input includes them. They and all deleted link edits remain in
`graphEdits` for Phase 2's FR-DEL-02-first deletion-side closure. Added control-link
endpoints are deliberately absent from `requiredEndpointSgIds`.

**Blocking. Issue code:** `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`. HTTP 422.

### 5.2 FR-API-03: Selected-scope input completeness

**Rule:** Before KV resolution, seed detection, or manual pair discovery, every
non-excluded, non-deleted selected-scope SG must appear in `activeSubgraphs`.

```
requiredSelectedSubgraphs := selectedScopeSubgraphs
                             \ effectiveExcludedSgIds
                             \ set(input.graphEdits.deletedSgs[*].systemId)
missing := requiredSelectedSubgraphs \ input.scopePolicy.requestedSubgraphSystemIds

if missing is non-empty:
  return Result.fail([{
    code: ARC-ROUTING-PREVAL-SCOPE-INCOMPLETE,
    impactedEntities: missing.map(sg => ({kind: 'subgraph', systemId: sg}))
  }])
```

An excluded selected-scope SG may be absent only if FR-API-07 does not require it as an
added SG or data-link endpoint. A session-deleted selected-scope SG may be absent. If an
eligible excluded or deleted SG is also present in `activeSubgraphs`, it is silently
omitted from `effectiveRoutingScope`. The deleted SG remains in
`input.graphEdits.deletedSgs` for Phase 2 impact analysis; removing it from routing scope
does not discard deletion evidence. After this check, the API map is the sole SGKV source
for every SG routing may use.

### 5.3 FR-PREVAL-01: Data link integrity

**Rule:** Every intra-usecase data-link in the effective routing scope must reference two
subgraphs that exist in the DB.

**Algorithm:**

```
sgIds := effectiveRoutingScope

validSgIds := ISubgraphRepository.findByIds(fileSystemId, sgIds).map(sg => sg.systemId)

for each intra-usecase data-link L whose endpoints are in sgIds
    (post-overlay, minus effective exclusions):
  if L.sourceSgId ∉ validSgIds or L.destSgId ∉ validSgIds:
    context.warnings.push(nothing)  // no — this is BLOCKING per FR-PREVAL-01
    issues.push(ARC-ROUTING-PREVAL-DATALINK-INTEGRITY, impactedEntity=L.systemId)

if issues.length > 0: return Result.fail(issues)
```

**Blocking. Issue code:** `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY`. HTTP 422.

**Edge cases:**
- Excluded data-links (`input.excludedDataLinkSystemIds`) are skipped — they're not
  part of the effective routing scope.
- SLS-resolved data-links (staged by the handler pre-step) are included via overlay.
- Control-links are not checked here — FR-PREVAL-01 is data-link-specific.

### 5.4 FR-PREVAL-02: Disconnected subgraph island detection

**Rule:** SGs in the effective routing scope with no intra-usecase data-link to any other SG in
the scope are "islands." Report as **warning**; routing continues.

**Algorithm:**

```
routingScopeSgs := effectiveRoutingScope

adjacency := build undirected adjacency from intra-usecase data-links between
             routingScopeSgs (post-overlay, minus excluded)

for each sg in routingScopeSgs:
  if adjacency[sg] is empty:
    context.warnings.push({
      code: ARC-ROUTING-ISLAND-DETECTED,
      impactedEntity: { kind: 'subgraph', systemId: sg }
    })
```

**Non-blocking.** Islands remain in the effective routing scope; downstream phases handle them
as SGs with no pair (they'll become orphans per FR-VAL-01 if not absorbed into any
UC via control-link fallback in manual mode).

**Edge case:** If an effective-scope SG has intra-usecase control-links but no data-links,
it's still an island for FR-PREVAL-02 (rule is data-link-specific). Manual mode may
still route it via FR-UC-01 step 4.

### 5.5 FR-MDF-01: MDF values are invalid

**Rule:** Every `RoutingSubgraph` with `isMdf=true` must have only empty requested SGKV
instances. If any requested instance contains a Value Definition ID, Phase 1 returns the
blocking `ARC-ROUTING-MDF-01` issue.

This check runs before Phase 2 topology analysis. Downstream MDF substitution logic may
therefore rely on the invariant that an in-scope MDF SG contributes no values.

### 5.6 Active manual dependency validation

In both routing modes, Phase 1 validates active manual UC edit references against the
graph snapshot before Phase 2 builds the affected set. A manual update that still
references a deleted SG/link returns `ARC-ROUTING-MANUAL-UC-BROKEN-DEPS` immediately.

A valid active manual update remains authoritative for its target UC. Phase 2 may inspect
its projected topology to suppress a duplicate MDF update, but the manual edit does not
exempt an ordinary deletion impact from FR-DEL-02.

---

## 6. Phase 4 — KvResolutionService

Runs after Half A's Phases 1–3 (PreValidation, Topology Change Analysis, and the
legacy-named `IslandTransitionService` for `ISLAND` → `LINKED`).
Prepares the SGKV data that Phase 8 (Combination Expansion) will consume.

Implements the three-step KV pipeline (FR-KV-01/02/03) exactly as specified.

### 6.1 FR-KV-01: Step 1 — Load SGKV from DB

**Rule:** For every SG in local `effectiveRoutingScope`, load complete SGKV records
from DB for baseline comparison only.

**Algorithm:**

```
sgIdsToLoad := effectiveRoutingScope

dbSgkvs: Map<SgSystemId, SgkvEntry[]>
       := ISubgraphRepository.getSgkvs(fileSystemId, sgIdsToLoad)
```

`dbSgkvs` is a scratch value used only for FR-KV-02. Nothing else reads it.

**Edge case:** SGs new to the routing session (not yet in DB) return empty from the
repo. That's fine — FR-KV-02 will produce an empty baseline for them; FR-KV-03 will
replace it with the API input.

### 6.2 FR-KV-02: Step 2 — Apply UC filter

**Rule:** Build a filter map from every initially selected UC's `gkv_entries`, including
UCs that Phase 2 later marks for deletion, then retain only KV pairs whose
`(keyDefSystemId, valueDefSystemId)` appears in the filter. Instances
left with zero KVs are dropped.

**Algorithm:**

```
if input.selectedUsecases is empty:
  ucFilteredBaseline := empty map (per FR-CONE-05)
else:
  ucFilter: Map<KeyDefId, Set<ValueDefId>> := empty
  for each uc in input.selectedUsecases:
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
        filteredInstances.push({keyValues: filteredKVs})
    ucFilteredBaseline[sgId] := filteredInstances

```

**Result:** the UC-filtered SGKV instance set per SG. **Used solely for seed
detection in Phase 5** (FR-CONE-01). Never a routing KV source.

**Rationale:** prevents KVs from unrelated UCs (Instance keys, sample rates from
other UCs) from generating irrelevant new GKV combinations later.

### 6.3 FR-KV-03: Step 3 — Apply API input

**Rule:** For each SG in local `effectiveRoutingScope`, discard the Step-2 result and
replace it entirely with the API-provided SGKV instances. Handler-level FR-API-03
validation has already guaranteed explicit input for every selected-scope SG that may
route.

Before constructing `perSg`, collect every requested Value Definition ID and call
`ISubgraphRepository.resolveKeyValues(fileSystemId, requestedValueIds)` once. The lookup
is independent of `dbSgkvs`: a valid same-file Value may be selected even when it has
never appeared in a persisted SGKV for that SG. If any requested ID is missing or belongs
to another file, fail with `ARC-ROUTING-SGKV-VALUE-NOT-FOUND`. Use the resulting Key
mapping to enforce I6.

**Algorithm:**

```
perSg: Map<SgSystemId, SgkvInstance[]> := empty
for each entry in input.graphSnapshot.subgraphs:
  // Snapshot preparation has already removed excluded/deleted SGs.
  perSg[entry.subgraph.systemId] := entry.requestedSgkvs is empty
    ? [{keyValues: []}]
    : entry.requestedSgkvs.map(values => ({keyValues: resolve(values)}))
context.kvResolutions := {perSg, ucFilteredBaseline}
```

`resolve(values)` maps each Value ID to its owning Key, sorts pairs canonically, and
returns content only. It performs no existing-SGKV identity lookup. Phase 4 publishes
the complete grouped result only after every requested SGKV passes missing-value and I6
validation.

**Edge cases:**
- **Empty list `[]` for a user-provided SG** — the SG contributes one empty SGKV instance. Valid; means "user
  declares no KV contribution for this SG."
- **Selected-scope SG missing from the API map** — already rejected by handler-level
  FR-API-03 before this phase.
- **IsMdf SG present in `activeSubgraphs` with non-empty KVs** — already rejected by
  Phase 1 under FR-MDF-01. Phase 4 never receives this input.
- **IsMdf SG omitted from `activeSubgraphs`** — it is not part of the effective routing
  scope. If it is a non-excluded selected-scope SG, FR-API-03 rejects the request. If it
  is a current-session added SG or a required data-link endpoint, FR-API-07 rejects the
  omission independently.

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
  if graphSnapshot.subgraphsById[sgId].isMdf:
    continue  // normalized empty MDF membership is not a KV change
  apiSet := setOf(kvResolutions.perSg[sgId])
  baselineSet := setOf(kvResolutions.ucFilteredBaseline[sgId] ?? [])
  if !setEqual(apiSet, baselineSet):
    seeds.add(sgId, reason='kv-changed')
```

Set equality: compare `keyValues` as sorted `(keyDefSystemId, valueDefSystemId)` lists. Order-free.

MDF SGs are excluded only from the `kv-changed` reason. Existing `new-sg`, link-edit,
and out-of-selection seed rules still apply to MDF topology.

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

**Rule:** A newly-added intra-usecase link seeds both endpoints. FR-API-07 has already
guaranteed that both are in the effective routing scope. A deleted intra-usecase link
seeds each surviving endpoint independently; an endpoint SG deleted in the same session
is absent from the effective routing scope.

**Algorithm:**

```
for each dl in input.graphEdits.addedDataLinks:
  if dl.linkScope == 'intra_usecase'
      and dl.sourceSgId ∈ effectiveRoutingScope
      and dl.destSgId ∈ effectiveRoutingScope:
    seeds.add(dl.sourceSgId, reason='link-added')
    seeds.add(dl.destSgId,   reason='link-added')

for each dl in input.graphEdits.deletedDataLinks:
  if dl.linkScope == 'intra_usecase':
    if dl.sourceSgId ∈ effectiveRoutingScope:
      seeds.add(dl.sourceSgId, reason='link-deleted')
    if dl.destSgId ∈ effectiveRoutingScope:
      seeds.add(dl.destSgId, reason='link-deleted')

// Control-link edits: NOT seeds for the DFS cone.
// DFS is data-link driven per FR-DFS-02; control-link edits do not trigger re-routing.
// Exception: manual UC mode uses control-links for pair discovery, but that runs in
// the create-manual-usecases handler, not via seed-driven routing.
```

The asymmetric rule is intentional. FR-API-07 rejects a new link whose endpoints are not
both routable. A deleted link can leave a valid multi-SG fragment on either surviving
side. Seeding each surviving endpoint ensures those fragments reach cone computation
even when the other endpoint SG was deleted and no KV-change seed is available. The
deleted endpoint never enters the cone; excluding a surviving endpoint is a
pre-validation error rather than a no-seed case.

**Edge case — pair already exists.** If a "new" data-link connects two SGs that
already share a `use_case_subgraph_pairs` entry, is it still a seed? Per FR-CONE-03
literal reading: yes, both endpoints are seeds because the link is "new" (not
previously in the graph). The downstream classifier (Phase 9) will detect that no
new UC results and no-op via FR-DUP-03(a). Design choice: don't optimize seed
detection to filter these out — it complicates FR-CONE-03 and the cost is trivial.

### 7.4 FR-CONE-05: Empty selected UC list → all effective-scope SGs are seeds

**Rule:** When `input.selectedUsecases` is empty, every SG in
local `effectiveRoutingScope` is an out-of-selection SG and is a seed.

**Algorithm:**

Add every effective-scope SG with reason `no-uc-context`. This explicit rule also covers
an SG whose intentional empty API contribution is set-equal to its empty baseline.

An empty API SGKV contribution does not suppress this seed rule.

### 7.5 FR-CONE-06: Out-of-selection SG → automatic seed

**Rule:** Every SG in local `outOfSelectionSubgraphs` is an automatic seed, whether it
is new or belongs to a non-selected UC.

**Algorithm:**

```
for each sgId in outOfSelectionSubgraphs:
  if sgId ∈ effectiveRoutingScope:
    seeds.add(sgId, reason='out-of-selection')
```

For these SGs, Step 2 may produce a DB-derived baseline filtered by the selected UCs'
GKV values. Step 3 still replaces that baseline with API input. FR-CONE-06 seeds the SG
independently, so its classification does not depend on whether the two sets happen to
match.

---

## 8. Phase 6 — ConeComputationService

Expands the seed set into a bounded cone via bidirectional traversal. Feeds Phase 7
(DFS). FR-API-03 and FR-API-07 addition-side validation have already completed in the
handler pre-step; FR-API-07 deletion-side validation completed in Phase 2 after the
FR-DEL-02 gate.

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
  if sg ∉ effectiveRoutingScope: continue
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

**Rule:** Cone expansion does not cross outside local `effectiveRoutingScope`.

**Algorithm — the "within scope" predicate:**

```
isWithinScope(sg) := sg ∈ effectiveRoutingScope
```

Phase 2 (DeletionScope, LLD4) uses a bounded DFS existence check per impacted pair
(FR-DEL-06 multi-path survival), not the cone. Phase 6's cone covers the routing
region for Phase 7's path-enumeration DFS — including post-deletion fragments, because
each surviving in-scope endpoint of a deleted link is a seed via FR-CONE-03. Both DFSes
operate on the same post-deletion graph state; they answer different questions:

- **Phase 2 DFS:** "does *any* path between A and B still exist?" — bounded
  existence check per impacted pair.
- **Phase 7 DFS:** "enumerate *all* paths from root SGs through the cone" — path
  enumeration for new UC candidates (FR-DEL-04 broken-path replacement, plus
  extension/creation).

### 8.3 Cone root identification

After the cone is finalized:

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
| 1 | `ARC-ROUTING-MDF-01` | Blocking (422) | MDF SG contains a requested KV value |
| 1 | `ARC-ROUTING-MANUAL-UC-BROKEN-DEPS` | Blocking (422) | Active manual UC edit references a deleted dependency |
| Handler pre-step | `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT` | Blocking (422) | Current-session added entity is explicitly excluded, or an added SG/data-link endpoint is missing, excluded, or deleted |
| Handler pre-step | `ARC-ROUTING-PREVAL-SCOPE-INCOMPLETE` | Blocking (422) | Non-excluded selected-scope SG missing from `activeSubgraphs` |
| 4 | `ARC-ROUTING-SGKV-MALFORMED` | Blocking (422) | SGKV instance has 2+ values for same Key (I6) |
| 4 | `ARC-ROUTING-SGKV-VALUE-NOT-FOUND` | Blocking (422) | Requested Value Definition is missing or belongs to another file |

All blocking codes trigger `Result.fail`; orchestrator halts; handler rolls back tx.

---

## 10. Test Scenarios (design-level)

Concrete test cases come in the implementation plan. These scenarios ensure the LLD
covers all requirement branches.

**Phase 1:**
- T-P1-edit-a: Added SG is absent from `activeSubgraphs` or explicitly excluded → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P1-edit-b: Added data-link ID is explicitly excluded → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P1-edit-c: Added data-link has a missing, excluded, or deleted endpoint SG → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P1-edit-d: Added control-link ID is explicitly excluded → `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT`
- T-P1-edit-e: Added control-link endpoint is outside auto effective scope → no edit-scope error; link remains visible to integrity/orphan checks but does not seed DFS
- T-P1-scope-a: Every non-excluded selected-scope SG is in `activeSubgraphs` → proceed
- T-P1-scope-b: A required selected-scope SG is missing → `ARC-ROUTING-PREVAL-SCOPE-INCOMPLETE`
- T-P1-scope-c: An unchanged, non-required selected-scope SG is explicitly excluded and absent → proceed
- T-P1-scope-d: A session-deleted SG is absent from `activeSubgraphs` → proceed; DELETE remains in `graphEdits`
- T-P1-scope-e: Stale client input includes a session-deleted SG → silently omit it from `effectiveRoutingScope`
- T-P1-a: All data-links have valid SG references → no issues
- T-P1-b: One data-link points to deleted SG → `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY`
- T-P1-c: SG in scope with zero intra-usecase data-links → `ARC-ROUTING-ISLAND-DETECTED` warning
- T-P1-d: SG has control-link only (no data-link) → still counts as island (data-link specific)
- T-P1-mdf: IsMdf SG has a user-provided non-empty KV → `ARC-ROUTING-MDF-01` blocking before topology analysis
- T-P1-manual-a: Active manual update retains the deleted direct pair/link → `ARC-ROUTING-MANUAL-UC-BROKEN-DEPS` before Phase 2
- T-P1-manual-b: Active manual update already contains the effective MDF chain → validation succeeds; Phase 2 suppresses only the duplicate automatic MDF write

**Phase 4 (KV):**
- T-P4-a: Empty selected UCs → baseline is `∅`; every effective-scope SG becomes seed
- T-P4-b: SGKV instance filtered to zero KVs → dropped from baseline
- T-P4-c: API replaces DB entirely; DB not used as routing source
- T-P4-d: Empty API list `[]` → one empty SGKV instance in `perSg`
- T-P4-e: SGKV with 2 Values for same Key → `ARC-ROUTING-SGKV-MALFORMED`
- T-P4-f: **IsMdf SG with explicit empty contribution** → normalized to one empty SGKV instance
- T-P4-g: **Selected IsMdf SG omitted from input** → handler-level `ARC-ROUTING-PREVAL-SCOPE-INCOMPLETE`
- T-P4-h: **IsMdf SG with user-provided non-empty KV** → unreachable; rejected by T-P1-mdf
- T-P4-i: **Eligible unchanged excluded SG in activeSubgraphs (FR-API-06)** — user includes an unchanged, non-required SG in `activeSubgraphs` and `excludedSubgraphSystemIds` → silently dropped from `perSg`; no error
- T-P4-j: **Eligible excluded SG's unchanged incident links auto-excluded** — unchanged SG-X in `excludedSubgraphSystemIds`; unchanged data-links L1(X→Y) and L2(Z→X) → both L1 and L2 in `effectiveExcludedDlIds`, treated as excluded even without being listed in `excludedDataLinkSystemIds`
- T-P4-k: **Valid same-file Value absent from the SG's persisted SGKVs** → accepted and resolved to its owning Key; output remains content-only
- T-P4-l: **Missing or out-of-file Value Definition** → `ARC-ROUTING-SGKV-VALUE-NOT-FOUND`; no partial `kvResolutions` publication

**Phase 5 (Seeds):**
- T-P5-a: API SGKV differs from UC-filtered baseline → seed (FR-CONE-01)
- T-P5-b: Brand new SG (not in any UC) → seed (FR-CONE-02)
- T-P5-c: New intra-usecase data-link → both endpoints are seeds
- T-P5-d: Deleted intra-usecase data-link with both endpoints in scope → both endpoints are seeds
- T-P5-e1: Deleted intra-usecase data-link with one deleted endpoint → only the surviving in-scope endpoint is a seed
- T-P5-f: Deleted intra-usecase data-link whose endpoint SGs were both deleted → no seed
- T-P5-g: New control-link → NOT seed (data-link-only rule)
- T-P5-h: Out-of-selection SG in effective scope → seed (FR-CONE-06)
- T-P5-i: New data-link between already-paired SGs → still seed (design choice per §7.3)
- T-P5-mdf: Normalized empty MDF instance differs from an empty persisted baseline → not a `kv-changed` seed; independent topology reasons may still seed it

**Phase 6 (Cone):**
- T-P6-a: Bidirectional expansion from single seed
- T-P6-b: Two seeds with overlapping cones → union
- T-P6-c: Cone stops at `effectiveRoutingScope` boundary
- T-P6-d: Adjacency reaches an SG outside `effectiveRoutingScope` → traversal does not cross boundary
- T-P6-e: Cycle in data-link graph → no infinite expansion; visited set bounds it
- T-P6-f: SG deletion removes an incident data-link → cone expands from the surviving endpoint through its post-deletion fragment without entering the deleted SG

---

## 11. Open Questions / Assumptions

**A1 — SGKV identity across sessions (resolved).** Phase 4 carries no SGKV persistence
ID. Routing and staging identify an SGKV only by canonical Key/Value content. At commit,
the write path rechecks the target SG for an exact order-independent Value set, reuses an
existing `system_id` when found, and otherwise allocates and inserts a new SGKV in the
same transaction. Phase 8/9 preserve the selected per-SG assignment and Phase 11 stages
`{subgraphSystemId, valueDefinitionSystemIds[]}` with each relevant UC change; the union
GKV alone is not sufficient to reconstruct SG ownership. Only accepted/staged UC actions
are materialized. This is the authoritative FR-KV-COMMIT-01 behavior.

**A2 — SGKV identity within a call (resolved).** Each SG's `sgkvInstances[]` is
independent. Equal content on two SGs is not deduplicated across SGs because SGKV rows are
owned by their target SG. Only Key/Value content matters for FR-DFS-06 conflict detection.

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
