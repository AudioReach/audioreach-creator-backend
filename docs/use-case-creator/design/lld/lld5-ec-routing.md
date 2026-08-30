<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD5 — EC (Echo Cancellation) Routing

**Status:** Draft
**Parent:** [`../overall-design.md`](../overall-design.md)
**Last updated:** 2026-08-10

---

## 1. Purpose & Scope

This LLD covers EC (Echo Cancellation) routing behavior — an override on the main
DFS pipeline that produces exactly three UCs per EC connection (Left / Bridge /
Right) instead of a single through-path.

EC routing doesn't add new pipeline phases. Instead, it overrides behavior inside
existing phases:

| Phase | Modification for EC |
|---|---|
| 6 (ConeComputation) | Cone-scope treatment unchanged; EC connections stay inside the cone. |
| 7 (DfsRouting) | EC connections act as forced path boundary (FR-EC-02). Single-EC-per-path check (FR-EC-05). |
| 8 (CombinationExpansion) | Bridge UC candidate emitted per EC connection (FR-EC-03/04). |
| 9 (Classification, plan-folded) | EC UCs carry a distinct type flag; EC bridge lifecycle differs from regular UCs (FR-EC-06). |

The overall pipeline (12 phases in three halves) is unchanged. EC is a set of
per-phase overrides, not a separate pipeline branch.

---

## 2. Requirements Owned

| Requirement | Section |
|---|---|
| FR-EC-01 | §5.1 |
| FR-EC-02 | §5.2 |
| FR-EC-03 | §6.1 |
| FR-EC-04 | §6.2 |
| FR-EC-05 | §5.3 |
| FR-EC-06 | §7.1 |
| FR-EC-07 Rule A (Bridge suppression against legacy) | §7.1 |
| FR-EC-07 Rule B (cross-EC reconstruction for legacy) | LLD4 §5.4.b (delegated) |
| FR-EC-07 Rule C (max-1-EC-per-UC + MDF exception) | §5.4 (new) |
| FR-EC-07 Rule D (reconstruction outcomes; type recomputation on merge) | LLD4 §5.4.b + LLD5 §7.1 (delegated) |
| FR-EC-07 Rule E (Usecase.type is computed from pair set) | LLD5 §4.3, overall-design §7 (informative) |

**Assumption:** `DataLink.isEc` boolean already exists on the domain entity, populated
from `is_ec` column on the `data_links` table. This LLD does not introduce the schema
change; it consumes the existing attribute.

---

## 3. Position in Pipeline

**Upstream inputs used:**
- `context.cones.sgSystemIds` — from Phase 6 (unchanged, includes EC-adjacent SGs)
- `context.kvResolutions.perSg` — from Phase 4 (unchanged)
- Existing UCs — for Phase 9 lifecycle handling (via `IUsecaseRepository`)

**Downstream outputs added to `RoutingContext`:**
- `context.dfsPaths` — extended with EC boundary flags (see §4.1)
- `context.ecBridgeCandidates` — separate list of Bridge UC candidates (§4.2)
- `context.classified` — Phase 9 emits UCs typed as `Connected` (regular routed paths AND EC Left/Right paths) or `EC` (Bridge UC only)

**No new port dependencies.** `IDataLinkRepository` already provides the `isEc`
attribute. Existing repos suffice.

---

## 4. Data Structures

### 4.1 `DfsPath` (extended)

LLD2 §4.1 defines the shared `DfsPath` shape (with `termination` values `'natural-leaf'`,
`'cycle'`, `'ec-boundary'` and the `ecBoundaryLinkId` field). This section documents
how EC routing uses those fields — no shape modification is introduced by LLD5.

```
type PathTermination = 'natural-leaf' | 'cycle' | 'ec-boundary';

DfsPath {
  sgSystemIds:       number[];
  termination:       PathTermination;
  ecBoundaryLinkId:  number | null;    // non-null iff termination === 'ec-boundary'
}
```

**Reading rules:**
- `termination === 'natural-leaf'` — DFS terminated at a leaf SG (no outgoing intra-usecase data-links within the cone). `ecBoundaryLinkId` is `null`.
- `termination === 'cycle'` — DFS terminated because the next SG was already in the current traversal stack. Warning `ARC-ROUTING-CYCLE-DETECTED` was emitted at Phase 7 detection time. `ecBoundaryLinkId` is `null`.
- `termination === 'ec-boundary'` — DFS terminated because the next edge was an EC data-link. `ecBoundaryLinkId` is set to that EC data-link's systemId. The path's last SG is the left SG of the EC connection. Phase 8 uses this to schedule a Bridge candidate.

**Invariant** (documented, not type-enforced): `termination === 'ec-boundary'` ↔ `ecBoundaryLinkId !== null`.

**Right-side traversal paths:** right-side DFS (started from the right SG of an EC connection) emits paths just like the main DFS — they terminate as `'natural-leaf'` or `'cycle'` with `ecBoundaryLinkId === null`. Phase 8 treats them as ordinary paths; Phase 9 classifies them as `Connected` UCs. No distinguishing field is needed on `DfsPath` because no downstream phase branches on right-side vs. main-DFS origin.

**Rationale for dropping LLD2's separate cycle boolean:** cycle handling was already a
warning-only case, not a code-path branch. Collapsing three booleans into one enum
removes sentinel-value handling and makes the mutually-exclusive termination reasons
explicit.

### 4.2 `EcBridgeCandidate` (Phase 8 output)

```
EcBridgeCandidate {
  ecConnectionLinkId:  number
  leftSgSystemId:      number
  rightSgSystemId:     number
  sgkvAssignment:      Map<SgSystemId, SgkvInstance>
  gkv:                 KeyValue[]      // sorted; may be empty if Bridge is invalid (FR-EC-04)
  compatible:          boolean         // FR-EC-04 result: false if KV conflict between left/right
}
```

Bridge UC is a two-node UC containing only the immediate left and right SGs of the
EC connection. Phase 9 classifies as `EC`.

If `compatible=false` (FR-EC-04 KV conflict): the Bridge UC is NOT emitted, but a
warning surfaces (see §8). Left and Right UCs are still emitted normally — the EC
connection produces 2 valid UCs in this case, not 3.

### 4.3 UC type tag (extends `Usecase` domain entity)

```
UsecaseType = 'Connected' | 'Disconnected' | 'EC'
```

Semantics:
- **`Connected`** — regular routed UC with full data-link pair coverage. Includes UCs generated at EC boundaries (Left/Right) because they behave identically to regular routed UCs post-generation.
- **`Disconnected`** — UC with pair coverage gaps (at least one pair supported only by a control-link, or created via manual UC with data-link fallback per FR-UC-01).
- **`EC`** — EC Bridge UC only. Two-SG UC connecting the endpoints of an EC connection. Distinct because FR-EC-06 gives it a specific lifecycle (deleted when EC link or endpoints go away).

`type` is a single field on `Usecase`; there is no separate `status` field. FR-STATUS-01/02/03/04 language uses "status" as terminology for domain-level discussion, but the technical field is `type`.

**Sticky rule:** `EC` UCs never transition to `Connected` or `Disconnected` — they exist as EC bridges until deleted. `Connected` ↔ `Disconnected` transitions per FR-STATUS-04 and FR-STATUS-02(b). EC UCs are subject to the file-wide GKV uniqueness rule (I1) just like Connected/Disconnected UCs — see §7.1.

---

## 5. Phase 7 · DfsRoutingService — EC modifications

Additions to LLD2 §5 behavior. Baseline traversal, root selection, and cycle
detection are unchanged.

### 5.1 FR-EC-01: EC connection identification

**Rule:** During adjacency construction, mark data-links with `isEc = true` as EC
connections. They still create edges in `adjacency` (unlike `inter_usecase` links),
but the traversal treats them specially.

**Algorithm — adjacency construction addition:**

```
for each dl in intraUsecaseDataLinks:
  if dl in excludedDataLinkSystemIds: skip
  adjacency[dl.sourceSg].push({to: dl.destSg, linkId: dl.systemId, isEc: dl.isEc ?? false})
```

Edges now carry an `isEc` flag. Non-EC edges behave exactly as in LLD2. EC edges
trigger §5.2 behavior when reached.

### 5.2 FR-EC-02: EC connection as path boundary

**Rule:** When DFS reaches an EC edge `(currentSg, nextSg, isEc=true)`, terminate
the current path at `currentSg` (the "left" SG). Emit as a Left UC candidate.
Separately start a new traversal from `nextSg` (the "right" SG) as if it were a
root; emit its traversal as a Right UC candidate.

**Algorithm — `dfsVisit` modification:**

```
dfsVisit(current, currentPath, stack, ecEncounteredInPath):
  outgoing := adjacency[current] ∩ cones.sgSystemIds

  ecEdges := outgoing.filter(e => e.isEc)
  regularEdges := outgoing.filter(e => !e.isEc)

  // FR-EC-05: Single EC connection per path check
  if ecEdges.length > 0 and ecEncounteredInPath:
    return Result.fail(FR-EC-05 error, path = currentPath, secondEc = ecEdges[0].linkId)

  // Handle regular outgoing edges as before (§5.3 in LLD2)
  ...

  // NEW: Handle EC outgoing edges
  for each ecEdge in ecEdges:
    // Emit Left UC candidate — path terminates at currentSg
    if currentPath.length >= 1:
      paths.push({
        sgSystemIds:      currentPath.copy(),
        termination:      'ec-boundary',
        ecBoundaryLinkId: ecEdge.linkId,
      })

    // Start a new right-side traversal from ecEdge.to
    // Right-side traversal is a fresh DFS from ecEdge.to as if it were a root
    dfsVisitRightSide(ecEdge.to, [ecEdge.to], new Set{ecEdge.to}, ecEdge.linkId)

// Right-side traversal — same as regular dfsVisit but tracks that current DFS is
// scoped to a right side (for FR-EC-05 single-EC-per-path enforcement). Emitted
// paths are indistinguishable from main-DFS paths by shape.
dfsVisitRightSide(current, currentPath, stack, ecLinkId):
  outgoing := adjacency[current] ∩ cones.sgSystemIds
  ecEdges := outgoing.filter(e => e.isEc)

  // FR-EC-05 — no second EC allowed
  if ecEdges.length > 0:
    return Result.fail(FR-EC-05 error, ...)

  if outgoing.filter(e => !e.isEc).length == 0:
    // Natural leaf on right side — emit as regular natural-leaf path
    paths.push({
      sgSystemIds:      currentPath.copy(),
      termination:      'natural-leaf',
      ecBoundaryLinkId: null,
    })
    return

  for each next in outgoing.filter(e => !e.isEc):
    if next.to ∈ stack:
      // cycle — emit with termination='cycle' (as in LLD2)
      paths.push({
        sgSystemIds:      currentPath.concat(next.to),
        termination:      'cycle',
        ecBoundaryLinkId: null,
      })
      context.warnings.push({ code: ARC-ROUTING-CYCLE-DETECTED, ... })
      continue
    currentPath.push(next.to)
    stack.add(next.to)
    dfsVisitRightSide(next.to, currentPath, stack, ecLinkId)
    currentPath.pop()
    stack.delete(next.to)
```

**Notes:**
- The right-side traversal is a standalone DFS from the right SG of the EC
  connection. It emits Right UC candidates for each right-side leaf.
- Multiple root SGs might reach the same EC connection through different paths.
  Each traversal produces its own Left UC candidate at the boundary; they may
  differ in path SGs (and thus GKVs).
- **Deduplication of right-side traversals:** if the same EC's right SG is
  encountered via multiple left paths, we don't want N × M Right UCs. Design
  choice: right-side DFS runs once per EC-right SG, regardless of how many left
  paths reach it. Cache right-side results by `ecLinkId + rightSgSystemId`.
  **Cache safety note:** right-side path outputs depend only on the graph
  adjacency downstream of the EC right SG, not on any KV — different left paths
  reaching the same EC right cannot produce different right paths. Caching by
  `(ecLinkId, rightSgSystemId)` is therefore correct and does not suppress
  legitimate variants.

### 5.3 FR-EC-05: Single EC connection per path

**Rule:** A routing path must contain at most one EC connection. Two ECs on the
same path → blocking error.

**Enforcement:** covered inline in §5.2 — the `ecEncounteredInPath` flag on the
left side and the equivalent check on the right side. Any second EC encountered
returns `Result.fail`.

**Blocking. Issue code:** `ARC-ROUTING-EC-05`. HTTP 422.

**Error payload:**

```
{
  code: ARC-ROUTING-EC-05,
  details: {
    pathSgIds: [...],
    firstEcLinkId: number,
    secondEcLinkId: number,
  }
}
```

### 5.4 FR-EC-07 Rule C: Max-1-EC-per-UC (with MDF exception)

**Rule:** A UC's pair set may contain at most **one** `isEc=true` data-link.
Exception: the specific MDF-substituted pattern `B → SG_MDF → C` where both flanking
data-links are `isEc=true` and SG_MDF is `isMdf=true` counts as one logical EC
crossing and is permitted.

**Enforcement:** Phase 1 (PreValidationService, LLD1 §5) — added as a new
pre-validation check FR-EC-07-C. Runs on every UC in the file's effective overlay
(including UCs marked for deletion, since violations should be caught even for
about-to-be-deleted UCs). Blocking; issue code `ARC-ROUTING-EC-MULTIPLE-LINKS`.

**Algorithm:**

```
for each uc in IUsecaseRepository.findAll(fileSystemId):
  ecLinks := uc.pairs
              .map(pair => pair.supportingDataLink)
              .filter(link => link is not null and link.isEc == true)
              .distinctBy(link.systemId)

  if ecLinks.length <= 1:
    continue   // OK

  // More than one EC data-link in this UC — check MDF exception
  isMdfException := (ecLinks.length == 2) and matchesMdfPattern(uc, ecLinks)
  if isMdfException:
    continue   // OK per Rule C exception

  return Result.fail([{
    code: ARC-ROUTING-EC-MULTIPLE-LINKS,
    impactedEntity: { kind: 'usecase', systemId: uc.systemId },
    details: {
      ecLinkSystemIds: ecLinks.map(l => l.systemId),
      pairCount: uc.pairs.length,
    },
  }])
```

Where `matchesMdfPattern(uc, [ec1, ec2])` returns true iff:
- `ec1` and `ec2` share exactly one endpoint SG,
- The shared SG has `isMdf=true`,
- The three SGs involved (`ec1.sourceSg`, sharedSg, `ec2.destSg` — or the mirror
  arrangement depending on direction) form a chain `B → SG_MDF → C` where B is the
  original left endpoint of the EC boundary and C is the original right endpoint,
  and both `ec1` and `ec2` are in the UC's pair set.

**Design note:** the check runs on every UC (not just legacy ones) because a
new-scheme Bridge UC has exactly 2 SGs and exactly 1 EC data-link — it never fires.
Only multi-SG UCs with legacy EC shape or MDF-modified shape are affected.

---

## 6. Phase 8 · CombinationExpansionSvc — EC modifications

Additions to LLD2 §6 behavior. Non-EC paths process exactly as before.

### 6.1 FR-EC-03: Three-UC generation per EC connection

**Rule:** For each EC connection encountered during traversal, generate three UC
candidates:
- **Left UC:** Cartesian expansion over the Left path (from root to left SG,
  inclusive). Emitted via the same LLD2 §6.1 mechanism; the underlying `DfsPath`
  has `termination: 'ec-boundary'`.
- **Right UC:** Cartesian expansion over the Right path (from right SG to leaf,
  inclusive). Same mechanism; the underlying `DfsPath` has `termination:
  'natural-leaf'` or `'cycle'` — no field distinguishes it from a regular path.
- **Bridge UC:** Two-SG path `[leftSg, rightSg]`. Combination expansion over their
  KVs only. See §6.2 for KV compatibility.

**Algorithm — Phase 8 post-processing for EC:**

```
// After LLD2 §6.1 loop over context.dfsPaths:

// Left paths — any path terminating at an EC boundary
ecLeftPaths := context.dfsPaths.filter(p => p.termination == 'ec-boundary')

for each leftPath in ecLeftPaths:
  ecLinkId := leftPath.ecBoundaryLinkId    // non-null by invariant
  leftSg   := leftPath.sgSystemIds.last()
  rightSg  := findRightSgForEcLink(ecLinkId)

  // Generate Bridge candidate — two-SG UC with only leftSg and rightSg
  bridgePath := {
    sgSystemIds:      [leftSg, rightSg],
    termination:      'natural-leaf',
    ecBoundaryLinkId: null,
  }

  // Run standard combination expansion on the bridge path (§6.2 handles KV compatibility)
  bridgeCandidates := expandWithConflictPruning([leftSg, rightSg], perSgOptions)

  if bridgeCandidates is empty:
    context.warnings.push(FR-EC-04 warning; see §6.2)
  else:
    for each candidate in bridgeCandidates:
      context.ecBridgeCandidates.push({
        ecConnectionLinkId: ecLinkId,
        leftSgSystemId:     leftSg,
        rightSgSystemId:    rightSg,
        sgkvAssignment:     candidate.assignment,
        gkv:                candidate.gkv,
        compatible:         true,
      })
```

**Left UC and Right UC are emitted as regular `Connected` UC candidates** via LLD2
§6.1's normal path. There is no per-path field distinguishing right-side traversal
paths from main-DFS paths — Phase 9 classifies both as `Connected`.

### 6.2 FR-EC-04: Bridge KV compatibility

**Rule:** Bridge UC is created only if the KV combinations of the left and right
SGs are compatible (no Key conflict per FR-DFS-06). If they conflict, the EC
connection produces no valid Bridge UC — this is a warning, not a blocker.

**Algorithm — inherited from LLD2 §6.2 conflict detection.** The
`expandWithConflictPruning` function returns empty candidate list if all
combinations conflict. When this happens for a Bridge:

```
if bridgeCandidates is empty:
  context.warnings.push({
    code: ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE,
    impactedEntity: { kind: 'data-link', systemId: ecLinkId },
    details: {
      leftSg: leftSg,
      rightSg: rightSg,
      conflictingKeys: analyzeConflicts([leftSg, rightSg], perSgOptions).keyDefSystemIds,
    }
  })
  // Bridge NOT emitted; but Left and Right UCs still produced normally.
```

**Non-blocking.** The user can resolve by adjusting SGKV on left or right SG. Left
and Right UCs remain valid — the EC connection produces 2 UCs instead of 3.

**Design rationale — why non-blocking vs FR-DFS-08:** FR-DFS-08 is blocking because
"no valid combination for this path" means the path can never produce a UC — user
must fix. FR-EC-04 is warning because the Left and Right UCs are still valid — the
Bridge is an optional extra. Not seeing a Bridge is degradation, not failure.

---

## 7. Phase 9 · Classification — EC modifications

Classification is folded into the implementation plan (not its own LLD). EC-specific
rules that Phase 9 must apply:

### 7.1 FR-EC-06: EC bridge UC lifecycle

**Rule:** EC bridge UCs have distinct lifecycle rules — they aren't merged with
regular UCs even if the GKV happens to overlap.

**Detection during Classification (Phase 9):**

```
for each candidate in [context.combinations.candidates, context.ecBridgeCandidates]:
  // FR-EC-07 Rule A — Bridge suppression against legacy EC UCs
  if candidate is EcBridgeCandidate:
    B := candidate.leftSgSystemId
    C := candidate.rightSgSystemId
    bKvChanged := context.seeds.reasons.get(B) == 'kv-changed'
    cKvChanged := context.seeds.reasons.get(C) == 'kv-changed'
    if not (bKvChanged or cKvChanged):
      # neither endpoint is a KV-changed seed → check for covering legacy EC UC
      coveringLegacy := context.allUcs.filter(uc =>
                          uc.type == USECASE_TYPE.Ec
                          and uc.subgraphSystemIds.length > 2
                          and uc.subgraphSystemIds.includes(B)
                          and uc.subgraphSystemIds.includes(C))
                          .filter(uc => not context.markedForDeletion.ucSystemIds.has(uc.systemId))
      if coveringLegacy.length > 0:
        continue   # suppress this Bridge candidate (redundant with legacy)

  // Existing UC lookup — I1 GKV uniqueness applies across all types (no EC exemption)
  existingUcs := context.allUcs.filter(uc =>
                   setEqual(sortedGkv(uc), sortedGkv(candidate)))

  if existingUcs.length == 0:
    # No UC in the file has this GKV — emit new UC candidate
    ucTypeForNewCandidate := candidate is EcBridgeCandidate ? 'EC' :
                             (pair set fully data-link covered ? 'Connected' : 'Disconnected')
    emit new UC candidate
    continue

  if candidate is EcBridgeCandidate:
    # FR-DUP-03(a) exact-match: same EC connection → preserve existing (FR-EC-06 "GKV unchanged, topology intact")
    exactBridgeMatch := existingUcs.find(uc => uc.type == 'EC'
                                             and uc.ecConnectionLinkId == candidate.ecConnectionLinkId)
    if exactBridgeMatch:
      continue   # no-op
    # Otherwise GKV clash with a non-matching UC (non-EC OR different EC connection)
    # → FR-DUP-04 user-choice; materialized new UC's type is 'EC'
    emit FR-DUP-04 collision(candidate, existingUcs, newCandidateType='EC')
    continue
  else:
    # Connected/Disconnected candidate — try silent branches first
    exactMatch := existingUcs.find(uc => sameSgSet(uc, candidate) and samePairSet(uc, candidate))
    if exactMatch:
      continue   # FR-DUP-03(a) exact-match no-op (may trigger FR-STATUS-04 upstream)

    b1Match := existingUcs.find(uc => satisfiesB1Conditions(candidate, uc))
    if b1Match:
      apply FR-DUP-03(b1) silent auto-update(candidate, b1Match)   # preserves b1Match.type
      continue

    # Neither silent branch fits — FR-DUP-04 user-choice
    # New candidate's type: Connected iff every pair has data-link coverage, else Disconnected
    newType := candidate.pairSet fully data-link covered ? 'Connected' : 'Disconnected'
    emit FR-DUP-04 collision(candidate, existingUcs, newCandidateType=newType)
```
```

**Legacy EC UC detection (in-memory filter over `context.allUcs`):** filter for `type=USECASE_TYPE.Ec` AND `SG count > 2` AND `{B, C} ⊆ uc.subgraphSystemIds`. `context.allUcs` is populated by Phase 2 via `IUsecaseRepository.findAll(fileSystemId, {readMode: 'COMMITTED'})`
returns UCs where `type=EC` AND SG count > 2 AND `{B, C} ⊆ uc.subgraphSystemIds`. In
the general case, at most one UC matches; for the multi-SGKV case (Gap 4 in FR-EC-07
discussion), multiple may match. Suppression fires if **any** qualifying legacy exists.

**Type-based dedup rules (unified — no EC exemption):**
- `Connected` / `Disconnected` candidate matching any existing UC (`Connected` / `Disconnected` / `EC`) → FR-DUP-03(a) exact-match no-op, FR-DUP-03(b1) identity-preserving interior extension silent auto-update, or FR-DUP-04 user-choice (all other overlap/disjoint cases). When the match is an EC UC and (b1) applies (legacy EC UC reconstruction per FR-EC-07 Rule D), the silent auto-update preserves `type=EC`.
- `Connected` candidate matching `Disconnected` existing → FR-STATUS-04 has already run at Phase 3; if the collision persists at Phase 9, FR-DUP-03(a)/(b1) silent branches or FR-DUP-04 user-choice applies (type does not matter to the collision rule).
- `EC` (Bridge) candidate matching `EC` existing with **same `ecConnectionLinkId` and same `gkv`** → FR-DUP-03(a) exact-match no-op (this is the "GKV unchanged, topology intact" preservation case per FR-EC-06).
- `EC` (Bridge) candidate matching `EC` existing with **different `ecConnectionLinkId` but same `gkv`** → FR-DUP-04 user-choice (two EC bridges from different EC connections coincidentally sharing a GKV — highly unusual but not exempt).
- `EC` (Bridge) candidate matching `Connected` / `Disconnected` existing with same `gkv` → FR-DUP-04 user-choice (coincidental cross-type same-GKV — user chooses which UC survives).

**Bridge UC identity key:** GKV is the file-wide identity per I1 — two Bridges with
different GKVs are automatically different UCs (no clash). Two Bridges with the same
`ecConnectionLinkId` and same GKV → FR-DUP-03(a) exact-match no-op (matches FR-EC-06
"GKV unchanged, topology intact → existing preserved"). Two Bridges with different
`ecConnectionLinkId` but same GKV → FR-DUP-04 user-choice per the unified GKV
uniqueness rule. Two Bridges with same `ecConnectionLinkId` but different GKVs
coexist as separate UCs (matches FR-EC-06 "GKV changed but topology intact → both
coexist" — different GKVs means no clash).

### 7.2 FR-EC-06: EC bridge deletion cascade

**Rule from FR-EC-06 detail:** If the immediate left or right SG is deleted, or the
EC connection link is deleted → the EC bridge UC is marked DELETED, following the
same deletion workflow as any UC (FR-DEL-01..05).

**Enforcement:** this is a Phase 2 (DeletionScope, LLD4) concern. LLD4 §5.1 already
uses `findByContainingSg` / `findByContainingLink` to identify impacted UCs — EC
bridge UCs are included because they reference the SGs and the EC link. No LLD4
change needed; the queries transparently include EC UCs.

**Design note — impact detection for EC connection deletion:** the `is_ec` attribute
is on the data-link, so a deleted EC connection appears as a deleted data-link in
`input.graphEdits.deletedDataLinks`. LLD4 §5.1's data-link deletion branch handles
it. UCs referencing the deleted EC link (all three: Left / Right / Bridge) are
impacted. FR-DEL-02 fail-fast requires all three in `selectedUsecaseSystemIds`.

---

## 8. Error Handling & Issue Codes

| Phase | Code | Severity | Trigger |
|---|---|---|---|
| 7 | `ARC-ROUTING-EC-05` | Blocking (422) | Two EC connections on the same path (FR-EC-05) |
| 8 | `ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE` | Warning (200) | Bridge UC's left and right SGs have KV conflict (FR-EC-04); Left and Right UCs still emitted |

`ARC-ROUTING-EC-05` already listed in overall-design §8 issue namespace. Adding
`ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE` there is a follow-on.

---

## 9. Test Scenarios (design-level)

**Phase 7 — EC DFS behavior:**
- T-EC-a: Single EC in linear path A→B→[EC]→C→D → 3 paths emitted: Left [A,B] (`termination='ec-boundary'`, `ecBoundaryLinkId=ecLink`), Right [C,D] (`termination='natural-leaf'`), Bridge produced separately in Phase 8
- T-EC-b: EC connection at a fan-out: A→B→[EC]→C and A→B→D → Left [A,B] emitted twice? No — same left, once. Right traversal from C. Regular path [A,B,D] emitted normally.
- T-EC-c: Two EC connections on same path A→B→[EC]→C→[EC]→D → `ARC-ROUTING-EC-05` blocking
- T-EC-d: EC connection cycles A→B→[EC]→C→A → cycle detected on right-side traversal; warning per FR-DFS-04
- T-EC-e: Right side of EC has multiple leaves → multiple Right UCs
- T-EC-f: Multiple left paths reach same EC → deduplication cache prevents re-running right-side DFS

**Phase 8 — Bridge and 3-UC generation:**
- T-EC-g: EC with compatible left/right KVs → 3 UCs emitted (Left, Bridge, Right)
- T-EC-h: EC with conflicting left/right KVs → 2 UCs emitted (Left, Right); warning `ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE`; no Bridge
- T-EC-i: EC where left SG has multiple SGKV instances → multiple Bridge candidates (one per compatible combination), one per Left UC variant

**Phase 9 — EC lifecycle:**
- T-EC-j: EC bridge UC exists; user changes KV on left SG → new Bridge UC created; existing preserved (FR-EC-06)
- T-EC-k: EC connection deleted → Bridge UC marked for deletion; Left and Right UCs also impacted per FR-DEL-01
- T-EC-l: EC left SG deleted → all 3 EC UCs impacted; FR-DEL-02 fail-fast requires all selected

**Legacy EC UC scenarios (FR-EC-07):**

| # | Scenario | B or C is FR-CONE-01 seed? | Reconstruction crosses EC? | Bridge emitted? | Outcome |
|---|---|---|---|---|---|
| T-EC-legacy-a | No user edits; endpoint KVs unchanged from legacy | No | (no deletion → no reconstruction) | Not emitted (no seeds) | Legacy [A, B, C, D, E] preserved |
| T-EC-legacy-b | Only B's SGKV changed (endpoint KV changed) | Yes (B) | (no deletion) | Emitted (R1 doesn't fire) | Legacy preserved + new Left/Bridge/Right coexist |
| T-EC-legacy-c | Only A's SGKV changed (non-endpoint) | No | (no deletion) | Suppressed (R1) | Legacy preserved; new Left [A, B] + Right [C, D, E]; Bridge suppressed |
| T-EC-legacy-d | X inserted between A and B; X has no SGKV; endpoint KVs unchanged | No | Yes (R2 narrow check passes) | Suppressed (R1) | Legacy **UPDATED** (X added, un-marked from deletion via FR-DUP-03(b1) identity-preserving interior extension); Left/Right emit |
| T-EC-legacy-e | X inserted; X has SGKV; endpoint KVs unchanged | No | Yes (R2 narrow check passes) | Suppressed (R1) | Legacy deleted; new legacy-shape UC created (`type=EC`, 6 SGs, different GKV); Left/Right emit |
| T-EC-legacy-f | X inserted; B or C SGKV changed (endpoint KV changed) | Yes | No (R2 narrow check falls through — EC treated as boundary) | Emitted (R1 doesn't fire) | Reconstruction fails → legacy deleted; Phase 7 main DFS produces new 3-UC set with changed KVs |
| T-EC-legacy-g | isMdf `SG_MDF` inserted at EC boundary (replaces B-eclink-C with B→SG_MDF→C, both `isEc=true`) | No | (Phase 2 transparent-bridge check fires per FR-MDF-01 → legacy not impacted) | Not applicable (no new EC connection introduced) | Legacy **UPDATED** with SG_MDF added; `type` stays `EC` (FR-EC-07 Rule C MDF exception applies) |
| T-EC-legacy-h | B-eclink-C link deleted entirely (no MDF substitution) | Depends on other KVs | Depends | Not applicable (EC gone) | Legacy's pair set loses all EC links → after reconstruction, `type` recomputed to `Connected` (or `Disconnected` if coverage breaks) |
| T-EC-legacy-i | UC contains 2 EC links (not via MDF pattern) — pre-existing or constructed via edits | N/A | N/A | N/A | Blocking pre-validation error `ARC-ROUTING-EC-MULTIPLE-LINKS` (FR-EC-07 Rule C) |
| T-EC-legacy-j | Internal SG D deleted | N/A | Depends on availability of alternate A→E path | Suppressed if reconstruction succeeds; otherwise emitted from main DFS | Standard deletion flow: legacy `updated` (if reconstruction finds path) or `deleted` per FR-DEL-05 (if it doesn't) |

**Legacy tests to fold in** (previously "excluded", now in scope):
T1-017, T1-018, T2-037, T2-038, T2-039, T2-040, T2-041, T2-042, T2-043, T2-044, T2-045, T2-065.

---

## 10. Open Questions / Assumptions

**E1 — `isEc` on domain entity.** Assumption: `DataLink.isEc: boolean` exists on
the domain entity, populated from the `is_ec` column. If not, add it — trivial
domain model change, not owned by LLD5.

**E2 — Right-side traversal deduplication.** Design: cache Right UC results by
`(ecLinkId, rightSgSystemId)` so multiple left paths reaching the same EC don't
trigger repeated right-side DFS. Verify performance benefit is significant enough
to justify the cache; alternative is to accept N×M cost if right-side is small.

**E3 — Bridge UC vs Connected UC identity clash. SUPERSEDED 2026-08-19.** Previously
resolved as "coexist because type differs." Under the unified I1 GKV uniqueness rule
(no per-type exemption), a Bridge UC and a Connected UC with the same GKV surface as
an FR-DUP-04 user-choice collision — user picks which UC survives (or resolves by
adjusting KVs on one side). Same treatment for Bridge-vs-Disconnected same-GKV and
Bridge-vs-Bridge (different EC connections) same-GKV.

**E4 — Empty Left path.** What if root SG *is* the left SG of the EC (i.e., EC
starts at root)? Left path is `[rootSg]`, one SG. Design: emit as valid Left UC
per FR-EC-02 "even though that SG is not a leaf in the graph." Verify this matches
legacy tests (T1-017's shape may clarify).

**E5 — EC bridge UC merges.** Do EC bridge UCs participate in FR-DUP-04 user-choice
collision handling? Design decision (2026-08-19): YES — EC bridges are subject to
the unified I1 GKV uniqueness rule and FR-DUP-04. Two EC bridges from different EC
connections coincidentally producing identical GKVs (highly unusual) surface as
FR-DUP-04 user-choice, same as any other same-GKV collision. Two EC bridges from the
same EC connection with same GKV hit FR-DUP-03(a) exact-match no-op.

---

## 11. References

- Overall Design: [`../overall-design.md`](../overall-design.md)
- LLD1 (upstream — provides cone): [`lld1-kv-resolution-cone.md`](./lld1-kv-resolution-cone.md)
- LLD2 (extended by this LLD — DFS + Combination): [`lld2-dfs-core.md`](./lld2-dfs-core.md)
- LLD4 (interacts via deletion cascade): [`lld4-deletion-transition.md`](./lld4-deletion-transition.md)
- Requirements (extended): [`../../2026-06-02-auto-usecase-routing-requirements-extended.md`](../../2026-06-02-auto-usecase-routing-requirements-extended.md) §1 (FR-EC-01..06)
