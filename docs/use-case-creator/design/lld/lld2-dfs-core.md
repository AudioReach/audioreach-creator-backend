<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD2 — DFS Core Routing & Combination Expansion

**Status:** Draft
**Parent:** [`../overall-design.md`](../overall-design.md)
**Last updated:** 2026-08-10

---

## 1. Purpose & Scope

This LLD covers the two pipeline phases that turn a bounded cone into UC candidates:

| Phase | Service | Placement |
|---|---|---|
| 7 | `DfsRoutingService` | Half B — routing proper |
| 8 | `CombinationExpansionSvc` | Half B |

By the end of Phase 8, the pipeline holds a set of valid UC candidates — each with a
GKV and a path of SGs — ready for Phase 9 (Classification, folded into implementation
plan).

---

## 2. Requirements Owned

| Requirement | Phase | Section |
|---|---|---|
| FR-DFS-01 | 7 | §5.1 |
| FR-DFS-02 | 7 | §5.2 |
| FR-DFS-03 | 7 | §5.3 |
| FR-DFS-04 | 7 | §5.4 |
| FR-DFS-05 | 8 | §6.1 |
| FR-DFS-06 | 8 | §6.2 |
| FR-DFS-07 | 8 | §6.3 |
| FR-DFS-08 | 8 | §6.4 |
| FR-DFS-09 | 8 | §6.5 |

---

## 3. Position in Pipeline

**Upstream (input to Phase 7):** `RoutingContext` populated by LLD1's phases:
- `context.cones.sgSystemIds` — Set of SGs in the cone (Phase 6 output)
- `context.cones.rootSgs` — Set of DFS start points (Phase 6 output)
- `context.kvResolutions.perSg` — SGKV instances per SG (Phase 4 output)

**Downstream (output after Phase 8):** `RoutingContext` populated with:
- `context.dfsPaths` — enumerated paths from Phase 7
- `context.combinations` — valid UC candidates from Phase 8

Phase 9 (Classification, folded into plan) reads `combinations`.

**Repo dependencies:**
- `IDataLinkRepository.findIntraUsecaseByFile(fileSystemId, excludedIds)` — Phase 7
  DFS reads intra-usecase data-links (cached from Phase 6 if possible)

No writes in these phases. Writing is deferred to Phase 11.

---

## 4. Data Structures

### 4.1 `DfsPath` (Phase 7 output)

```
type PathTermination = 'natural-leaf' | 'cycle' | 'ec-boundary';

DfsPath {
  sgSystemIds:       number[];          // ordered SGs from a root to termination point
  termination:       PathTermination;
  ecBoundaryLinkId:  number | null;     // non-null iff termination === 'ec-boundary' (LLD5)
}
```

**Termination values:**
- `'natural-leaf'` — DFS terminated at a leaf SG (no outgoing intra-usecase data-links within the cone).
- `'cycle'` — DFS terminated because the next SG was already in the current traversal stack. Warning `ARC-ROUTING-CYCLE-DETECTED` was emitted at the detection point (§5.4).
- `'ec-boundary'` — DFS terminated at an EC connection. Only produced when EC is in scope; LLD5 owns the semantics. `ecBoundaryLinkId` is set to the EC data-link's systemId.

**Invariant** (documented, not type-enforced): `termination === 'ec-boundary'` ↔ `ecBoundaryLinkId !== null`.

`sgSystemIds.length ≥ 2` for `'natural-leaf'` and `'cycle'` terminations — a single-SG "path" isn't emitted (no pair to route). For `'ec-boundary'`, the path may have `sgSystemIds.length == 1` if the root SG *is* the left SG of the EC connection.

### 4.2 `UcCombination` (Phase 8 output)

```
UcCombination {
  path:          DfsPath
  sgkvAssignment: Map<SgSystemId, SgkvInstance>  // one SGKV per SG in the path
  gkv:           KeyValue[]                       // union across the assignment, conflict-free
}
```

`gkv` is sorted by `keyDefSystemId` for stable comparison in Phase 9.

### 4.3 `Combinations` (RoutingContext field)

```
Combinations {
  candidates:    UcCombination[]
  pathsWithNoValidCombo: DfsPath[]   // FR-DFS-08 fodder — paths where every combo conflicts
}
```

Empty candidates + non-empty `pathsWithNoValidCombo` → FR-DFS-08 blocking error at
Phase 8's end. Both empty → no new UCs to create; that's fine (may still have
deletions / transitions from Phases 2 / 3).

---

## 5. Phase 7 — DfsRoutingService

Enumerates all paths through the cone, one path per root-to-leaf traversal. No KV
work here; combination expansion is deferred to Phase 8 so DFS remains O(paths) not
O(paths × combinations).

### 5.1 FR-DFS-01: Traversal from root SGs

**Rule:** DFS from each SG in `cones.rootSgs`. Root SGs have no incoming
intra-usecase data-link *from another SG in the cone*.

**Algorithm:**

```
paths: DfsPath[] := []
adjacency := build directed adjacency from intra-usecase data-links restricted
             to cones.sgSystemIds (post-overlay, minus excluded)

for each root in cones.rootSgs:
  dfsVisit(root, currentPath=[root], stack=Set{root})
```

`dfsVisit` writes into `paths`. Stack is per-traversal; cleared between roots.

### 5.2 FR-DFS-02: Traversable links

**Rule:** Only `intra_usecase` data-links are traversed. `intra_subgraph` and
`inter_usecase` links are ignored. Control-links are ignored (data-link-driven DFS).

**Algorithm consequence:** the `adjacency` map above is built only from data-links
with `linkScope = intra_usecase`. Nothing else needed downstream — the map is the
enforcement point.

**Domain assumption (enforced upstream at link creation):** between any two SGs, all
links are of one type — either all `intra_usecase` OR all `inter_usecase`, never
mixed. The link-creation endpoint rejects attempts that would violate this. Routing
relies on the invariant and does not re-check.

**Edge case:** a cone SG may have `inter_usecase` links to non-cone SGs (those SGs
are outside the routing scope by FR-CONE-07's cone boundary). Those `inter_usecase`
links simply don't create edges in `adjacency` — DFS never reaches beyond them.

### 5.3 FR-DFS-03: Path emission

**Rule:** Emit a `DfsPath` for each traversal that terminates at a leaf SG (no
outgoing intra-usecase data-links within the cone).

**Algorithm — `dfsVisit(current, currentPath, stack)`:**

```
outgoing := adjacency[current] ∩ cones.sgSystemIds
if outgoing is empty:
  // natural leaf — emit
  if currentPath.length ≥ 2:
    paths.push({sgSystemIds: currentPath.copy(), termination: 'natural-leaf', ecBoundaryLinkId: null})
  return

for each next in outgoing:
  if next ∈ stack:
    // cycle — emit path as leaf and continue with siblings (FR-DFS-04)
    if currentPath.length ≥ 2:
      paths.push({sgSystemIds: currentPath.concat(next), termination: 'cycle', ecBoundaryLinkId: null})
    context.warnings.push({
      code: ARC-ROUTING-CYCLE-DETECTED,
      impactedEntity: { kind: 'subgraph', systemId: next }
    })
    continue

  currentPath.push(next)
  stack.add(next)
  dfsVisit(next, currentPath, stack)
  currentPath.pop()
  stack.delete(next)
```

**Complexity:** O(paths × depth). For NFR-PERF-01 (30 SGs / 50 links), bounded ~200
paths × ~10 depth = ~2000 operations. Sub-millisecond.

**Edge cases:**
- Single-SG paths (`currentPath.length < 2`) not emitted — no pair to route.
  Isolated SGs handled by FR-VAL-01 orphan detection (Phase 10) or manual UC creation.
- Diamond patterns: A → B → D and A → C → D produce two distinct paths [A,B,D] and
  [A,C,D]. Both emitted; Phase 9 classifier decides merge or separate UCs.

### 5.4 FR-DFS-04: Cycle detection

**Rule:** If DFS visits an SG already in the current traversal stack, terminate the
branch, emit the truncated path (including the repeated SG as leaf), and log a
warning. Do not throw or halt.

**Algorithm:** covered inline in §5.3 — the `if next ∈ stack` branch.

**Semantic clarification:** we emit `[…, cycleSg]` including the repeated SG at the
end. This makes the cycle visible to downstream phases (classifier can see the leaf
is `cycleSg`) and to the user (the warning's `impactedEntity` names the cycle point).

**Design choice — cycle path is not a blocker:** matches FR-DFS-04. Legacy tool
raised `CycleDetectedError`; we deliberately don't. Rationale: during design, users
often need to *see* the cycle to fix it. Blocking hides discoverability.

---

## 6. Phase 8 — CombinationExpansionSvc

Takes each path and produces UC candidates — one per valid SGKV combination. Handles
conflict detection, empty-GKV rejection, and path-level error surfacing.

### 6.1 FR-DFS-05: SGKV combination expansion

**Rule:** For each path, generate one UC candidate per valid SGKV combination across
the path. A combination assigns exactly one SGKV instance per SG in the path.

**Algorithm — early-prune combinatorial expansion:**

```
for each path in context.dfsPaths:
  perSgOptions := path.sgSystemIds.map(sg => kvResolutions.perSg[sg] ?? [{keyValues: []}])
  // perSgOptions is an array-of-arrays: SG[0] options × SG[1] options × …

  validAssignments := expandWithConflictPruning(path.sgSystemIds, perSgOptions)

  if validAssignments is empty:
    // FR-DFS-08 candidate — every combo had a conflict
    combinations.pathsWithNoValidCombo.push(path)
    continue

  for each assignment in validAssignments:
    gkv := aggregateGkv(assignment)              // FR-DFS-07
    if gkv is empty:
      continue                                    // FR-DFS-09 empty-GKV rejection
    combinations.candidates.push({
      path,
      sgkvAssignment: assignment,
      gkv,
    })
```

**Key data structure — the assignment builder.** `expandWithConflictPruning` builds
combinations SG-by-SG, maintaining a running `assignedKvs: Map<keyDefSystemId, valueDefSystemId>`.
For each new SG, try each of its SGKV options; skip options that conflict with the
running map. Backtrack on failure. This is depth-first over the option-tree; conflict
pruning cuts the branch as soon as a conflict appears, not after full enumeration.

**Complexity intuition.** Worst-case Cartesian: product of `|perSgOptions[i]|`. For
NFR-PERF-01, with ~4 SGs/path × ~3 options each = 81 combos × ~5ms conflict-check =
~400ms per path. That's too slow if we naively enumerate. Early pruning drops most
branches at the first conflict, bringing typical cost to under 1ms/path.

### 6.2 FR-DFS-06: SGKV conflict detection

**Rule:** A combination is invalid if any Key has two *different* Values across the
assigned SGKV instances. Same Key + same Value across SGs → valid, appears once in
the GKV.

**Algorithm — inside `expandWithConflictPruning`, per-SG option check:**

```
tryAssign(sg, sgkvOption, assignedKvs):
  for each kv in sgkvOption.keyValues:
    existing := assignedKvs.get(kv.keyDefSystemId)
    if existing is defined and existing !== kv.valueDefSystemId:
      return { conflict: true, conflictingKey: kv.keyDefSystemId }
    // else: either not assigned yet, or matches — both fine
  return { conflict: false }

if conflict: skip this option, try next.
else: apply the option to assignedKvs, recurse to next SG, pop on backtrack.
```

**Example (from FR-DFS-06):**
- A: `{Kx: Vx1}`, C: `{Kx: Vx2}` → conflict at `Kx` when C tries to assign.
  Combination pruned; if C has another option without `Kx`, that branch survives.
- A: `{Kx: Vx1}`, C: `{Kx: Vx1}` → same Key + same Value → valid; `Kx=Vx1` appears
  once in the GKV.

### 6.3 FR-DFS-07: GKV aggregation

**Rule:** For each valid combination, the GKV is the union of all KV pairs across
the assigned SGKV instances. Because the combination is conflict-free, each Key
appears exactly once.

**Algorithm — `aggregateGkv(assignment)`:**

```
gkvMap := new Map<keyDefSystemId, valueDefSystemId>()
for each (sg, sgkvOption) in assignment:
  for each kv in sgkvOption.keyValues:
    gkvMap.set(kv.keyDefSystemId, kv.valueDefSystemId)   // safe: assignment is conflict-free
return gkvMap.entries().sort(by keyDefSystemId)
              .map(([k, v]) => ({keyDefSystemId: k, valueDefSystemId: v}))
```

Sorted output enables stable equality checks in Phase 9 (Classification) via string
join or tuple compare.

### 6.4 FR-DFS-08: Path-level conflict error

**Rule:** If **all** SGKV combinations for a path produce Key conflicts (no valid
combination exists), return an error identifying the conflicting SGs and Keys.
Routing does not present partial results.

**Algorithm — post-expansion sweep:**

```
if combinations.pathsWithNoValidCombo.length > 0:
  issues := []
  for each path in combinations.pathsWithNoValidCombo:
    // Compute the specific conflicts for the diagnostic message
    conflicts := analyzeConflicts(path, kvResolutions.perSg)
    issues.push({
      code: ARC-ROUTING-DFS-08,
      impactedEntities: path.sgSystemIds.map(sg => ({kind: 'subgraph', systemId: sg})),
      details: {
        conflictingKeys: conflicts.keyDefSystemIds,
        conflictingSgPairs: conflicts.sgPairs,   // pairs of SGs contributing conflicting Values
      },
    })
  return Result.fail(issues)
```

**Blocking. Issue code:** `ARC-ROUTING-DFS-08`. HTTP 422.

**Diagnostic detail — why worth the extra pass:** the user needs to know *which*
SGs to fix. "Key K has Value V1 in SG-A and Value V2 in SG-B; both are on the same
path" is actionable. Just "no valid combination" isn't. LLD5 (folded into plan) may
augment with UI-friendly formatting.

**Edge case — path with only conflicts on one Key across many SGs:** report each
conflicting SG pair separately; the user can pick which SG's SGKV to change.

### 6.5 FR-DFS-09: Empty GKV rejection

**Rule:** A combination whose GKV is empty (every assigned SGKV has empty KV list)
does not produce a UC candidate. The path's SGs may become orphans (detected by
Phase 10, FR-VAL-01).

**Algorithm:** covered inline in §6.1 — the `if gkv is empty: continue` check.

**Edge case — mixed empty and non-empty on the same path:** If path is A→B→C with
A:`{Kx:V1}`, B:`{}` (empty option), C:`{}` (empty option), the combined GKV is
`{Kx:V1}` — non-empty, valid. Only fully-empty combinations are rejected.

**Edge case — every SG has empty option only:** every combination produces empty
GKV. Path yields no candidates but is *not* an FR-DFS-08 error (no conflicts, just
no content). Path silently discarded; SGs become orphans (Phase 10).

---

## 7. Error Handling & Issue Codes

| Phase | Code | Severity | Trigger |
|---|---|---|---|
| 7 | `ARC-ROUTING-CYCLE-DETECTED` | Warning (200) | DFS revisits an SG in current stack (FR-DFS-04) |
| 8 | `ARC-ROUTING-DFS-08` | Blocking (422) | All combinations for a path conflict on Key values |

FR-DFS-09 (empty GKV) is a silent discard, not an issue. Orphan detection at Phase
10 surfaces the consequence if it matters.

---

## 8. Test Scenarios (design-level)

Concrete test cases come in the implementation plan. These scenarios cover all
requirement branches.

**Phase 7 (DFS):**
- T-P7-a: Linear path A→B→C→D → one DfsPath `[A,B,C,D]`
- T-P7-b: Two paths from same root A→B→D, A→C→D → two DfsPaths
- T-P7-c: Cycle A→B→C→A → path emitted as `[A,B,C,A]`; warning `ARC-ROUTING-CYCLE-DETECTED` at A
- T-P7-d: Diamond A→B→D, A→C→D → two paths `[A,B,D]` and `[A,C,D]`
- T-P7-e: Root SG with no outgoing links (isolated in cone) → no DfsPath emitted
- T-P7-f: `intra_subgraph` and `inter_usecase` links in the graph → not traversed
- T-P7-g: Control-links between cone SGs → not traversed
- T-P7-h: Multiple roots → separate traversals; paths merged into single `dfsPaths`
- T-P7-i: Very deep chain (10+ SGs) → single deep path; depth bounded by cone size

**Phase 8 (Combination Expansion):**
- T-P8-a: Path A→B, A has `{Kx:V1}`, B has `{Ky:V2}` → one candidate, GKV `{Kx:V1, Ky:V2}`
- T-P8-b: Path A→B, A has `{Kx:V1}`, B has `{Kx:V1}` → one candidate, GKV `{Kx:V1}` (dedup)
- T-P8-c: Path A→B, A has `{Kx:V1}`, B has `{Kx:V2}` → no candidate (conflict); path listed in `pathsWithNoValidCombo`
- T-P8-d: Path A→B→C, all three have empty SGKV `[]` → no candidate (FR-DFS-09); path silently dropped
- T-P8-e: Path A→B, A has 2 options `[{Kx:V1}, {Kx:V2}]`, B has `{Ky:V3}` → 2 candidates
- T-P8-f: Path A→B, A has `{Kx:V1}` and B has `{Kx:V2}` → both options conflict; if this is the only path with no valid combo, `ARC-ROUTING-DFS-08` returned
- T-P8-g: Path A→B, A has 2 options `[{Kx:V1}, {Kx:V2}]`, B has `{Kx:V1}` → one candidate (A picks `{Kx:V1}`), other pruned early
- T-P8-h: Two paths, one valid + one invalid → both processed; if the invalid path has no valid combo → FR-DFS-08 fires; valid path's candidates NOT presented (all-or-nothing per FR-DFS-08)
- T-P8-i: Mixed empty and non-empty options on same path → non-empty GKV emitted; empty-only combination silently dropped

**Cycle × conflict interactions:**
- T-P7P8-a: Cyclic path A→B→A → path `[A,B,A]` emitted; combination expansion runs
  on the SG list. Note: A appears twice — this is a subtle question about whether
  Phase 8 counts A once or twice. **Design decision:** treat the cyclic SG list as a
  set for Phase 8's purposes (dedup by systemId when assembling `perSgOptions`).
  Effectively, cyclic paths are treated as their unique-SG version for combination
  purposes.

**Legacy test integration:** T-cases from
`C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md` covering
DFS/routing scenarios will be mapped into the implementation plan's test suite. See
the task list item "Incorporate legacy tests into plan."

---

## 9. Open Questions / Assumptions

**B1 — Cyclic SG dedup in Phase 8.** For a cyclic path `[A, B, A]`, does Phase 8
enumerate combinations over `[A, B]` (dedup) or `[A, B, A]` (repeat, A must pick the
same SGKV both times)? Design assumption: **dedup by systemId** — A picks one SGKV;
if A appears twice, that's a topological accident, not a semantic constraint.
Confirms with FR-DFS-05's "one SGKV instance per SG" phrasing (per SG, not per
occurrence). Final call: implementation plan.

**B2 — Diamond-pattern classification.** For paths `[A,B,D]` and `[A,C,D]` with the
same GKV, does Phase 9 (Classification) emit two UCs or one merged UC with pair
set `{(A,B), (B,D), (A,C), (C,D)}`? This is a Phase 9 (LLD3 → plan) question, not
LLD2's. LLD2 emits both as separate candidates; Phase 9 decides.

**B3 — Cycle in combination-expansion cost.** A cycle path `[A, B, C, A]` treated as
`[A, B, C]` (per B1) has 3 SGs; combinatorics unchanged from a non-cyclic 3-SG path.
No special cost.

**B4 — All-conflict paths + valid paths in same run.** FR-DFS-08 says "return an
error" when a path has no valid combo. Interpretation: **the whole call fails** —
we do not emit the valid paths' candidates partially. Matches "routing results are
not presented until the user resolves the conflict." Alternative interpretation
(emit valid, warn on invalid) rejected — FR text is explicit.

---

## 10. References

- Overall Design: [`../overall-design.md`](../overall-design.md)
- LLD1 (upstream — provides `cones` and `kvResolutions`): [`lld1-kv-resolution-cone.md`](./lld1-kv-resolution-cone.md)
- Requirements (core): [`../../2026-06-01-auto-usecase-routing-requirements.md`](../../2026-06-01-auto-usecase-routing-requirements.md) §3.5 (FR-DFS-*)
- Next in pipeline: LLD4 (`lld4-deletion-transition.md`) — Phases 2 and 3, which run *before* LLD1/LLD2 phases but are documented after them in LLD numbering
- Legacy tests to fold into plan: `C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md`
