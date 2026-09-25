
<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Auto-Usecase Routing: Extended Requirements

**Date:** 2026-06-02
**Last updated:** 2026-09-25
**Status:** Frozen
**Owner:** Nithin Simon
**Source docs:** `docs/subgraph-kv-usecase-creation/subgraph-routing-requirements.md`,
`docs/subgraph-kv-usecase-creation/subgraph-routing-lld.md`

**Core requirements:** `docs/superpowers/specs/2026-06-01-auto-usecase-routing-requirements.md`

---

## Purpose

This document extends the frozen core requirements. It captures requirements found in
the source docs that are either:
- **New** — not addressed in core requirements at all (added here as extension FRs)
- **Contradicting** — directly conflicting with a core requirement (all 5 resolved in §10)

Requirements already fully captured in core requirements are omitted (see §11).

## 0. Routing Snapshot Authority

Both create handlers use one shared `RoutingGraphSnapshotBuilder` after chain resolution,
session-edit loading, selected-UC loading, and request validation. `requestPolicy` keeps
explicit caller intent separate from `graphSnapshot`, which contains routable subgraphs,
requested SGKVs, MDF classification, routable links, complete overlay link catalogs,
committed UCs, and session edits. The builder performs one read of each graph catalog and
one MDF pass, then discards derived exclusion sets.

`ManualPairDiscoveryService` and `PreValidationService` are pure snapshot consumers and
perform no repository reads. Phases 2–3 and 5–10 consume the snapshot without duplicate
graph reads. Phase 2 has one narrow exception: after impact aggregation and before legacy
EC reconstruction, `DeletionReconstructionService` may call
`SubgraphRepository.getSgkvs(fileSystemId, legacyEcEndpointSystemIds)` once for the
legacy-EC endpoint baseline comparison; no other Phase 2 consumer may use that repository.
Phase 4 may read SGKV baselines plus one batched, effective-overlay, file-scoped Value
Definition-to-Key mapping for request normalization; Phase 11 writes only. This section
supersedes earlier statements in this document that assign link discovery or MDF
classification to individual consumers.

---

## 1. EC (Echo Cancellation) Routing

*In scope for this delivery. Requirements captured here to keep the extended-detail
requirements together.*

### 1.1 EC Connection Detection

#### FR-EC-01: EC connection identification
The system shall identify intra-usecase data links with `isEc = true` as EC
connections. The `isEc` property already exists on the `DataLink` entity in the DB
schema (`is_ec` column, nullable — set only on `intra_usecase` links). An EC connection
is a distinct link type that triggers special 3-usecase generation (FR-EC-03) rather
than normal DFS continuation.

An **MDF-transparent EC chain** is the specific directed pattern
`A → MDF₁ → ... → MDFₙ → B`, where `n >= 1`, every intermediate SG has
`IsMdf = true`, and every adjacent intra-usecase data-link has `isEc = true`. This
maximal contiguous chain represents one logical EC connection with endpoints A and B.
For FR-EC-05 path validation, FR-EC-07 UC validation, and UC type recomputation after
an FR-MDF-01 direct rewrite, the chain shall be evaluated as one EC connection rather
than as independent EC links. FR-MDF-01 direct rewriting does not invoke FR-EC-02 or
FR-EC-03 candidate generation.

#### FR-EC-02: EC connection as path boundary
When the DFS traversal encounters an EC connection, it shall treat that connection as a
path boundary: the current path terminates at the left-side SG of the EC connection
(emitting a Left UC candidate even though that SG is not a leaf in the graph), and a
separate EC-specific emission is triggered (FR-EC-03).

*This is an explicit exception to FR-DFS-03's leaf-only emission rule: EC boundaries
trigger intermediate emission. FR-DFS-03 governs all non-EC paths; FR-EC-02 overrides
it at EC connection points.*

### 1.2 Three-Usecase Generation

#### FR-EC-03: Exactly three UCs per EC connection
For each valid EC connection encountered during routing, the system shall generate
exactly three usecases:
- **Left UC (Rx path):** The path from the root subgraph to the subgraph on the left
  side of the EC connection (inclusive).
- **Right UC (Tx path):** The path from the subgraph on the right side of the EC
  connection (inclusive) to the path's leaf subgraph.
- **Bridge UC:** A two-node path containing only the immediate left and right subgraphs
  of the EC connection.

#### FR-EC-04: Bridge UC KV compatibility requirement
A Bridge UC shall only be created if the KV combinations of the left and right
subgraphs are compatible (no Key conflict per FR-DFS-06 of core reqs). If the left
and right subgraphs have conflicting KVs, the EC connection produces no valid Bridge
UC. This is a **non-blocking warning** (`ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE`) —
the user resolves by adjusting SGKV assignments on the conflicting subgraphs.
Left and Right UCs are still emitted for the same EC connection; only the Bridge
is skipped. This differs from FR-DFS-08 (which is blocking when no valid combination
exists for a routing path); FR-EC-04's warning-only stance reflects that Left and
Right paths remain valid routing candidates independent of Bridge validity.

#### FR-EC-05: Single EC connection per path
A routing path must contain at most one logical EC connection. An MDF-transparent EC
chain defined by FR-EC-01 consumes one EC-connection slot regardless of its physical
link count. If the DFS traversal encounters a second logical EC connection on the same
path, the system shall return an error identifying the path and both EC connections.
Multiple logical EC connections on a single path are not valid.

### 1.3 EC Usecase Lifecycle

#### FR-EC-06: EC bridge usecase mutation on topology change
When graph changes are evaluated against existing EC bridge UCs:
- If the immediate left and right subgraphs still exist AND the EC connection link
  still exists AND the GKV is unchanged → mark as **UNCHANGED**.
- If the GKV changed but topology is intact → per FR-LIFE-01 (core), the existing EC
  bridge UC is **preserved**. The routing session creates a new EC bridge UC with the
  updated GKV. Both UCs coexist **because their GKVs differ** — I1's uniqueness rule
  is not violated. If the new Bridge's GKV happens to equal any existing UC's GKV
  (an unusual coincidence), FR-DUP-04 user-choice applies per the unified rule.
- If the left or right subgraph is deleted, or the EC connection link is deleted →
  mark as **DELETED**.

The final case excludes a confirmed pure MDF substitution under FR-MDF-01. When the
deleted EC link is replaced by one eligible MDF-transparent EC chain, the existing EC UC
is updated directly, retains its identity and `EC` type, and is not marked deleted.

When an EC bridge UC is DELETED due to structural component deletion, it follows the
same deletion workflow as any UC (core reqs FR-DEL-01 through FR-DEL-05): all UCs
requiring deletion, structural mutation, or type degradation are identified file-wide,
all affected UCs must be selected by the caller, and the caller may choose to preserve
the UC as `ISLAND` (FR-DEL-05).

### 1.4 Legacy EC UC compatibility

#### FR-EC-07: Legacy EC UC — Bridge suppression and cross-EC reconstruction

A **legacy EC UC** is a pre-existing UC with `type=EC` and SG count > 2, containing
one internal EC data-link inside its pair set (created by an older tool before the
new-scheme 3-UC generation). These UCs must be preserved as first-class citizens
without producing redundant new-scheme UCs.

**Definitions:**

- **Legacy EC UC identification:** `type=EC` AND SG count > 2 AND the UC's pair set
  contains an `isEc=true` data-link.
- **KV-changed endpoint (per FR-CONE-01):** an SG whose SGKV in `activeSubgraphs`
  differs from its UC-filtered baseline (using selected UCs' `gkv_entries` to build
  the filter, per FR-KV-02). Available as `context.seeds.reasons[sg] = 'kv-changed'`
  after Phase 5; for Phase 2 use a narrow inline check on the EC endpoints only.

**Rule A — Bridge suppression at classification:**

When Phase 8 produces a new-scheme Bridge UC candidate for an EC data-link L
(endpoints B, C):

- The Bridge candidate shall be **suppressed** iff **both**:
  1. Neither B nor C is a KV-changed endpoint (FR-CONE-01), AND
  2. A legacy EC UC exists whose SG set contains both B and C, **and that legacy UC
     is not in `context.markedForDeletion`**.
- Otherwise the Bridge candidate is emitted normally.

Left and Right UC candidates (`type=LINKED` in the new scheme) are **not** subject
to this suppression — SG-set overlap with an existing legacy EC UC alone does not
suppress them. However, same-GKV collisions between a Left/Right candidate and any
existing UC (including the legacy EC UC) are still governed by the unified I1 GKV
uniqueness rule: FR-DUP-03(a) exact-match no-op, FR-DUP-03(b1) identity-preserving
interior extension silent auto-update, or FR-DUP-04 user-choice, as applicable.

**Rule B — Cross-EC reconstruction for legacy EC UCs:**

When Phase 2's single-path bounded-DFS reconstruction runs for a legacy EC UC, the
reconstruction DFS behavior depends on whether the EC endpoints are KV-changed:

- If neither B (left endpoint of the internal EC) nor C (right endpoint) is a
  KV-changed endpoint → reconstruction DFS treats EC data-links as **regular**
  data-links (crosses the EC boundary as if it were a normal edge). Reconstruction
  can therefore find a start-to-end path across the EC.
- Otherwise → reconstruction DFS respects the EC boundary (same behavior as Phase 7
  main DFS per LLD5 §5.2). Reconstruction typically fails, causing the legacy UC to
  be actually deleted; Phase 7's main DFS produces the new-scheme 3-UC set with the
  updated KVs.

**Rule C — Max EC-links-per-UC:**

A UC (legacy or new-scheme) shall contain at most **one logical EC connection** in its
pair set. Its physical representation is normally one `isEc = true` data-link. When a
pure MDF substitution occurs at that boundary, the representation may instead be the
MDF-transparent EC chain defined by FR-EC-01, with every physical link in the chain
retaining `isEc = true`. The entire chain counts as one logical EC crossing.

Any configuration containing two or more `isEc = true` data-links that do not form one
such maximal contiguous MDF-transparent EC chain, or containing that chain plus another
EC link, is a pre-validation error (`ARC-ROUTING-EC-MULTIPLE-LINKS`).

**Rule D — Reconstruction outcomes for legacy EC UCs:**

When an SG X is inserted inside a legacy EC UC's path (adding a data-link on the
non-EC side of the path, e.g., between A and the EC's left endpoint B):

- If X has no SGKV assigned (empty KV list) AND endpoint KVs unchanged →
  reconstruction (Rule B) crosses EC → path has same GKV as legacy → FR-DUP-03(b1)
  identity-preserving interior extension → legacy UC **UPDATED** in place (X added
  to SG set; legacy un-marked from `markedForDeletion` per LLD4 §5.4.b handling).
- If X has SGKV assigned (contributing new KV pairs) AND endpoint KVs unchanged →
  reconstruction crosses EC → path has different GKV than legacy → new legacy-shape
  UC created (`type=EC`, multi-SG, single internal EC link); legacy UC deleted.
- If endpoint KVs are changed → reconstruction respects EC boundary (Rule B falls
  through) → reconstruction typically fails → legacy UC deleted; Phase 7 main DFS
  produces new-scheme Left/Bridge/Right UCs with the changed KVs.

**Rule E — `Usecase.type` is a computed property:**

A UC's `type` is derived from its pair set with precedence `EC`, then `ISLAND`, then
`LINKED`:
- `type = EC` iff the pair set contains at least one logical EC connection. This takes
  precedence even when another pair lacks data-link coverage.
- Otherwise, `type = ISLAND` iff any pair in the pair set has no data-link coverage
  (only control-link support, per FR-STATUS-02 semantics).
- Otherwise, `type = LINKED`.

When a routing operation adds or removes a supporting data-link, the affected UC's
`type` shall be updated at Phase 11 (RoutingChangeStager) based on the resulting
pair set. Examples:
- Legacy EC UC has its internal EC data-link deleted (with no MDF substitution) →
  type transitions to `LINKED` (if all pairs data-link covered) or `ISLAND`
  (if any pair loses coverage).
- Non-EC `LINKED` UC has an EC data-link added inside → not possible; adding an EC
  connection would trigger the new-scheme 3-UC generation, not modify an existing UC.

*Cross-references:* FR-MDF-01 (MDF transparent bridge substitution); FR-DUP-03(b1)
(identity-preserving interior extension — silent auto-update); LLD4 §5.4.b
(reconstruction algorithm); LLD5 §7.1 (classification Bridge dedup).

---

## 2. MDF V2 — Explicit MDF Routing And Pure Substitution

*In scope: explicit MDF pass-through behavior and pure MDF substitution. Still deferred:
implicitly injecting an MDF SG that the caller omitted from `activeSubgraphs`.*

MDF bridge subgraphs already exist in the DB as real subgraphs. The routing algorithm
traverses paths like `SG_A → MDF_Bridge_SG → SG_C` naturally. The core routing
requirements handle all traversal and pair derivation. The only additional requirement
is how the system treats an `IsMdf = true` subgraph when it appears in a path.

#### FR-MDF-01: IsMdf subgraph attribute and routing behavior
The Subgraph entity shall have a boolean attribute `IsMdf`. When `IsMdf = true` for a
subgraph:

- **Pass-through:** The subgraph contributes one empty SGKV instance (no KV pairs) to
  all routing paths through it. It does not affect the path's GKV. In the SGKV
  combination expansion (FR-DFS-05 of core reqs), the MDF slot has exactly one choice
  (the empty instance) and therefore does not multiply the number of UC candidates —
  the total combination count equals the product of only the non-MDF SGs' instance
  counts.
- **Explicit scope entry:** The subgraph follows FR-API-03 and FR-CONE-07 like every
  other SG. If it is a non-excluded selected-scope SG or is intended to participate as
  an out-of-selection SG, it must appear in `activeSubgraphs` with an intentional empty
  SGKV contribution. It never enters routing solely because it is present in the DB.
- **No KVs allowed:** If the API input assigns any non-empty SGKV values to an IsMdf
  subgraph, the system shall return an error. The empty contribution is normalized to
  one empty SGKV instance during KV resolution (Phase 4).
- **Transparent bridge substitution (MDF Scenario 4):** A pure MDF substitution is
  transparent structural maintenance of an existing UC, not deletion impact. The
  system shall recognize a pure substitution only when all of the following hold:
  1. One direct intra-usecase data-link from SG A to SG B is deleted in the current
     session, and no surviving direct intra-usecase data-link or control-link in either
     direction continues to support the stored `(A, B)` pair. A surviving support link
     instead invokes the normal direction-correction or type-degradation rules.
  2. The effective post-edit data-link overlay contains exactly one simple directed,
     traversable intra-usecase replacement path from A to B with at least one
     intermediate SG.
  3. Every intermediate SG on that path has `IsMdf = true`, is present in the effective
     routing scope, appears explicitly in `activeSubgraphs`, and has an intentional
     empty SGKV contribution.
  4. The replacement path preserves the deleted link's routing semantics. A non-EC
     link (`isEc` is false or unset) is replaced only by non-EC links. An EC link is
     replaced only by an MDF-transparent EC chain under FR-EC-01, whose links all retain
     `isEc = true` and together represent one logical EC crossing.
  5. For a UC referencing the deleted directed pair, no other deleted component or
     unsupported pair independently requires that UC's deletion, degradation, or
     user-selected reconstruction.
- **Multiple substitutions and UC-level atomicity:** Eligibility is evaluated per
  deleted pair. If one committed UC contains multiple deleted pairs, the direct-update
  exception applies only when every deletion impact on that UC is an independently
  valid pure MDF substitution and their combined pair/SG rewrite is deterministic and
  non-conflicting. Rewrites conflict if the same deleted pair maps to different
  replacement chains, one rewrite adds a pair that another removes, or their union
  violates UC topology or EC invariants. Shared endpoints or MDF members alone are not
  conflicts when the resulting SG and pair sets are otherwise deterministic. All
  substitutions are then applied in one atomic UC update. The system shall complete
  eligibility for every impacted pair before staging any part of the direct update. If
  any impact fails eligibility or the rewrites conflict, no partial MDF rewrite is
  staged; the entire UC follows the normal affected-selection and reconstruction
  workflow.
- **Direct structural rewrite:** For every committed pre-session UC containing one or
  more eligible deleted directed pairs, the system shall atomically stage one
  identity-preserving `source=AUTO_ROUTING` update that, for every substitution:
  1. Preserves the UC `systemId`, GKV, alias, category, and unrelated topology.
  2. Removes the original `(A, B)` pair.
  3. Adds every intermediate MDF SG to the UC's SG set, without duplicating existing
     membership.
  4. Adds each directed adjacent pair from the replacement path, without duplicating
     existing pairs.
  5. Records an empty SGKV contribution for each newly added MDF SG where the
     persistence contract requires assignment metadata.
  6. Recomputes the UC type from the resulting complete pair set. In particular, an EC
     substitution remains `EC` and its MDF chain is treated as one EC crossing.
  7. Reports the same UC identity as updated; it shall not delete and recreate the UC.
     No new UC shall be created for the substitution.
  This system-owned maintenance applies to both automatic and manual create-usecase
  routing calls; manual mode still does not run ordinary automatic reconstruction.
- **Deletion-gate exception:** A UC shall not enter the FR-DEL-01/02 affected set solely
  because of a confirmed pure MDF substitution. The system shall not mark that UC for
  deletion, require it in `selectedUsecaseSystemIds`, create a reconstruction candidate,
  or depend on cone traversal, DFS, SGKV combination expansion, or FR-DUP-03(b1) to
  preserve it. The selection exemption does not relax routing-scope validation: MDF SGs
  remain subject to FR-API-03 and FR-CONE-07 explicit-scope requirements.
- **Active manual-update precedence:** When an active manual update targets the same
  committed UC, the system shall not stage a competing automatic MDF update. If the
  manual update's effective topology already removes the direct pair and contains the
  strict MDF chain, the manual update remains authoritative. If it retains the deleted
  link or superseded direct pair, existing manual-dependency validation shall reject the
  routing operation before topology-change analysis. A valid manual update suppresses
  only the duplicate automatic MDF write; it does not exempt any ordinary deletion
  impact on the same UC from FR-DEL-01/02.
- **Fallback:** If any pure-substitution condition is not proven, including zero or
  multiple eligible replacement paths, a non-MDF intermediate, a non-empty MDF SGKV,
  surviving direct support, incompatible direction or EC classification, conflicting
  substitutions, or another broken component in the same UC, the system shall not
  apply the transparent-update exception. It shall use normal FR-DEL-01 through
  FR-DEL-06 affected-UC selection and reconstruction behavior.

*The mechanism for detecting and setting `IsMdf` (e.g., based on the presence of
IPC Tx and IPC Rx modules within the subgraph) is deferred to the MDF V2 feature
implementation. MDF changes KV contribution behavior, not routing-scope membership.*

---

## 3. Deletion Scenario Extension

*Extends core reqs §3.9 (FR-DEL-01 through FR-DEL-05).*

#### FR-DEL-06: Endpoint-anchored path reconstruction pass
Pure MDF substitutions confirmed under FR-MDF-01 bypass this reconstruction pass and
are staged as direct structural updates. For all other deletion impacts, after the main
DFS (FR-DEL-04 of core reqs) completes, the system shall perform an additional
reconstruction pass for each UC marked for deletion. The pass has two sub-modes
depending on the UC's **topology** — single-path vs multi-path.

**Topology detection (cheap, per UC):**

For each UC marked for deletion, examine its stored pair set:
- Compute `starts` = the set of SGs in the UC's SG set with no incoming pair
- Compute `ends` = the set of SGs in the UC's SG set with no outgoing pair
- If `|starts| == 1` and `|ends| == 1` → **single-path** UC → apply the bounded-DFS
  reconstruction (steps 1–7 below).
- If `|starts| > 1` OR `|ends| > 1` → **multi-path** UC (auto-routing cannot reproduce
  this topology; only manual UC creation can) → skip the bounded-DFS reconstruction
  and apply pair-level survival semantics (step 8).

*Note on `ISLAND` UCs:* No explicit type-based branch is needed. Bounded DFS
traverses only intra-usecase data-links (FR-DFS-02), so pairs that are control-link-
only cannot be reconstructed. This is handled naturally by step 7 (no path found → no
reconstruction candidate). `ISLAND` UCs may still be single-path topologically,
in which case they go through the bounded DFS path — the DFS will either find no data-
link path (matching step 7) or find a data-link-only alternative path (which becomes a
new candidate, orthogonal to the original `ISLAND` UC's fate).

**Bounded-DFS reconstruction — for single-path UCs:**

1. Extract the deleted UC's **start SG** (root of its subgraph path) and **end SG**
   (leaf of its subgraph path).
2. If both start and end SGs are still present in the effective routing scope (neither
   was deleted or excluded), run a bounded DFS from the start SG to the end SG within
   that same scope, treating the end SG as a forced leaf boundary.
3. The bounded DFS uses the same API map KVs already provided. FR-DEL-02 ensures every
   affected UC is selected, and FR-API-03/07 ensure every required non-excluded,
   non-deleted selected-scope SG is explicit input before reconstruction runs. The DFS
   cannot import additional SGs from the DB.
4. FR-DFS-05 (Cartesian product expansion) and FR-DFS-06 (conflict detection) of
   core reqs apply. Combinations where new SGs' KVs conflict with a required
   combination are silently discarded.
5. Paths discovered in this pass produce additional unstaged UC candidates. FR-DUP-03(a)
   exact-match no-op and FR-DUP-03(b1) identity-preserving interior extension apply
   to reconstruction candidates against the main DFS results and existing DB UCs;
   any other overlap or disjoint result surfaces via FR-DUP-04.
6. If start or end SG was deleted, skip the reconstruction for that UC.
7. **If both start and end SGs are still present but the bounded DFS finds no valid
   path from start to end** (e.g., intermediate SGs or links were deleted and no
   alternative route exists in the current graph, OR every candidate combination
   produces a KV conflict, OR the original UC was `ISLAND` and the required route
   passes through a control-link-only pair that DFS cannot traverse per FR-DFS-02),
   no additional UC candidate is emitted from this reconstruction pass. The UC
   remains in the `markedForDeletion` set from the main deletion scenario
   (FR-DEL-03). Its final fate is decided by the user via FR-DEL-05:
   - **Accept deletion:** UC is dropped at commit.
   - **Preserve as `ISLAND` (FR-DEL-05):** UC's SG set and pair set are updated to
     drop the deleted-component's pair entries and any SGs that became unreachable
     within the UC. The stub may end up with an SG set that includes SGs with no
     surviving pairs — those SGs are candidates for the orphan check (FR-VAL-01) if
     they don't get covered by a new main-DFS UC.

**Pair-level survival — for multi-path UCs (step 8):**

8. For a multi-path UC, no bounded-DFS reconstruction is attempted (auto-routing cannot
   reproduce a multi-path topology in a single UC). Instead:
   - Compute the **surviving pair set**: pairs in the UC whose endpoints still exist
     AND whose supporting link (data or control) is still present per I7.
   - If **all** original pairs survive → the UC is not actually broken by the deletion.
     This can happen if the deleted component is an SG that was a member of the UC's
     SG set but had no pair involving it (the isolated-SG case per FR-UC-01 step 4).
     Update the UC's SG set to drop the deleted SG; keep the pair set intact; status
     unchanged. The UC does not need to be marked for deletion in this case (FR-DEL-01
     may have marked it incorrectly; this step reconsiders).
   - If **some pairs broken** → UC stays in `markedForDeletion`. User decides via
     FR-DEL-05:
     - **Accept deletion:** UC dropped at commit.
      - **Preserve as `ISLAND`:** UC's SG set and pair set are trimmed to only
       surviving components. Auto-routing does not attempt to discover replacement
       paths — the user must manually re-declare via `create-manual-usecases` if they
       want a different topology.

*This enables the system to detect path transformations (e.g., `A→B` becoming
`A→X→B`) in the same API call, without requiring a second user-initiated call.*

*KV conflict limitation:* If the new SG's KVs conflict with a specific old combination,
that reconstruction is discarded (FR-DFS-06). The routing response (FR-IMPACT-03)
shall report which deleted UC GKVs could not be reconstructed. The user may then add
additional SGKV instances to the new SG and re-call the API.

---

## 4. Additional Pre-Validation Rules

*Core reqs have FR-API-03 (selected-scope input completeness before KV resolution or
seed detection). The following adds checks that run before DFS begins.*

#### FR-PREVAL-03: SLS / CSLS chain resolution runs before routing
Before any routing pre-validation (FR-PREVAL-01, FR-PREVAL-02) or routing phase runs,
the system shall complete resolution of SubsystemLinkSegments (SLS) and Control
SubsystemLinkSegments (CSLS) per the authoritative subsystem-links spec
(`docs/subsystem-links/2026-05-30-subsystem-links-requirements.md`, FR-VL-26 for SLS
data-link resolution and FR-VL-30 for CSLS control-link resolution).

**Ordering:**
Phase 0 (this rule — chain resolution) → Phase 1 (FR-PREVAL-01, FR-PREVAL-02, other
pre-validation) → routing pipeline (KV resolution, cone, DFS, etc.).

**Behaviour:**
- If **incomplete chains** exist (either SLS or CSLS) → **422**. Routing does not
  proceed. The response identifies the incomplete chains per the subsystem-links spec.
- If **all chains are complete** → the system resolves them: new DataLinks /
  ControlLinks are created and matching SLS / CSLS rows updated to point at them.
  These writes are staged as `edit_actions` with `source = MANUAL` and
  `changeStatus = STAGED` — they represent user intent expressed by drawing the
  subsystem chains, not algorithm output.
- After resolution, the handlers build one `graphSnapshot` from the effective `data_links`
  and `control_links` overlay including the newly-resolved rows. The routing algorithm
  itself is unaware of SLS / CSLS (FR-VL-27 of the subsystem-links spec), and no phase
  reloads those catalogs.

**Applies to both endpoints:**
- `create-usecases` (auto-routing, FR-UC-02) — routing depends on complete
  intra-usecase data-links.
- `create-manual-usecases` (manual, FR-UC-01) — snapshot preparation reads data-links
  and control-links once; manual pair derivation consumes the prepared links.

**Handler orchestration note (design-level):** Chain resolution runs at the top of
the handler, before the routing pipeline begins. It is not part of the routing
pipeline itself. Handler pattern:
```
handle(cmd, uow):
  await uow.startTransaction()
  chainResult = await chainResolver.resolveAllChains(uow)
  if (chainResult.isFail()) → rollback + return 422
  ... invoke routing pipeline ...
  await uow.commit()
```

The `IChainResolver` port is owned by the subsystem-links module; this feature only
consumes it.

#### FR-PREVAL-01: Data link integrity check
Before routing begins, the system shall verify that all intra-usecase data links in the
routing scope reference subgraphs that exist in the DB. A data link pointing to a
non-existent subgraph is a pre-validation ERROR. Routing shall not proceed until the
integrity error is resolved.

#### FR-PREVAL-02: Disconnected subgraph island detection
Before routing begins, the system shall detect subgraphs in the routing scope that
have no intra-usecase data links to any other subgraph in the scope (isolated
subgraphs, or "islands"). Islands shall be reported as a **WARNING**. Routing shall
continue despite this warning. Island subgraphs will subsequently be evaluated by the
orphan check (FR-VAL-01 of core reqs): if an island SG is not a member of any UC
after routing, the system will flag it as an orphan and present the user with the
delete-or-continue-editing option.

---

## 5. Commit Re-Validation

*Core reqs have I5 (orphan-free commit gate). The following adds path re-validation.*

#### FR-COMMIT-01: Pre-commit re-validation and safety-net checks
Before committing staged changes, the system shall perform pre-commit re-validation on
the effective post-commit state (committed + STAGED), applying the following checks in
order. This runs whether or not the user called `create-usecases` after the last graph
edit — it is the last line of defense against inconsistent state hitting the DB.

**(a) Direction correction on `ISLAND` UCs (safety net for FR-STATUS-04):**

Apply FR-STATUS-04's Step 1 (direction correction) to every `ISLAND` UC in the
commit scope, whether or not `create-usecases` was called after the last graph edit. If
a data-link exists in the direction opposite to a stored pair, correct the pair to match
the data-link direction. Corrected pairs are staged as UPDATE edit-actions before the
commit proceeds. After correction, evaluate FR-STATUS-04 Step 2 (coverage) — a UC that
now has all pairs covered transitions to `LINKED` as part of the same commit.

**(b1) Path re-validation for newly staged UCs (original FR-COMMIT-01):**

For every newly created staged UC (regardless of `LINKED` or `ISLAND` type):

- **SG existence:** All SGs in the UC's SG set must still exist in the effective
  post-commit graph.

- **Pair-link presence (I7 — applies to every UC):** For each pair `(A, B)` in the
  UC's pair set, at least one intra-usecase link (data-link OR control-link, either
  direction) must be present between A and B in the effective post-commit graph. A
  pair with no supporting link is dangling and invalid — commit rejected.

- **`LINKED`-type coherence:** If the UC's type is **`LINKED`**, every pair must
  additionally satisfy FR-STATUS-04's coverage rule — an intra-usecase data-link in
  the pair's stored direction, or a bridge-mediated path per FR-STATUS-04 Step 2.
  Control-link-only pairs are **not** sufficient for `LINKED` type. A `LINKED` UC
  with an uncovered pair at commit time indicates the graph drifted since routing
  last ran; either safety-net check (a) has already corrected the pair direction
  (rare), or the commit is rejected — the user must run auto-routing to normalize
  the UC's type (transition to `ISLAND`), delete the affected UC, or restore
  the missing data-link.

- **Stale pair after pure MDF substitution:** FR-MDF-01's direct structural rewrite
  applies to committed pre-session UCs, not newly created staged UCs. This exclusion is
  intentional and applies to both automatic and manual staged creations. A newly staged
  UC that still contains the superseded direct pair `(A, B)` after that pair is replaced
  by an MDF path shall fail re-validation even if bridge-mediated coverage could
  otherwise satisfy `LINKED` coherence. A manual action that references the deleted link
  also fails check (d). The user must rerun routing or restage the manual UC so it is
  derived from the effective graph and contains the MDF chain explicitly.

- **`ISLAND`-type validity:** If the UC's type is **`ISLAND`**, pair-link
  presence (I7) is the sole per-pair requirement. A pair with control-link coverage
  and no data-link is valid — manual `ISLAND` UCs may have control-link-only
  pairs per FR-UC-01 step 4. Data-link direction mismatch (data-link exists in the
  opposite direction) is handled by safety-net check (a) before (b) runs.

- **Isolated-SG members (Q5 case):** An SG that is a member of the UC's SG set but
  has no pair involving it (per FR-UC-01 step 4's isolated-SG rule) is valid — no
  per-pair check applies to such an SG. Existence check above still requires it to
  be present in the graph.

Any UC that fails path re-validation causes the commit to be rejected with an error
identifying the failing UCs and the offending pairs.

*Scope for (b1):* Applies to staged UCs created in the current edit session. It catches
the case where a structural change occurred between the routing call and the commit
call, breaking a newly staged UC's path.

**(b2) Existing-UC invalidation after staged structural deletion:**

When the commit scope contains a staged DELETE for an SG, data-link, or control-link,
the system shall identify existing committed UCs that referenced the deleted SG or the
deleted link's SG pair in the committed pre-session state. This lookup must not rely
only on the session overlay because the overlay can already hide the deleted component
or cascaded UC junction rows.

Each affected UC shall then be re-validated against the effective post-commit state:

- Every SG still referenced by the UC must exist.
- Every stored pair must retain at least one supporting intra-usecase data-link or
  control-link in either direction (I7).
- A `LINKED` UC must still satisfy the `LINKED`-type coverage rule from (b1).
- If another surviving link still supports the pair, the link deletion alone does not
  invalidate the UC.
- If staged routing output, a structural UC update, or a staged UC deletion has already
  normalized the affected UC, that UC passes this check.

The check is state-based: it does not track whether `create-usecases` was called. If an
affected UC remains stale, reject the entire commit with HTTP 422 and issue code
`ARC-COMMIT-ROUTING-REQUIRED`. The issue shall identify the affected UC system IDs,
offending SGs/pairs, and triggering deleted component IDs, and direct the client to call
`POST /arc-api/v1/projects/:projectId/create-usecases` with the affected UCs selected
before retrying commit. The user may instead explicitly update/delete the affected UC
or restore the deleted component; any remediation is accepted when the resulting
effective post-commit state satisfies this check.

This closes the direct-commit gap: deleting the only link supporting an existing UC
pair cannot pass merely because the deleted link is no longer present to be reported as
an orphan by check (c).

**(c) Orphan detection safety net (enforces I5, FR-VAL-01, FR-VAL-02, FR-VAL-03):**

The system shall detect true orphans in the effective post-commit state. Orphans
typically arise when the user adds a new SG or a new intra-usecase link but does not
run `create-usecases` before attempting to commit — the new item is not a member of any
UC, violating the orphan-free invariant.

- **Orphan SG:** any SG present in the graph that is not a member of any UC (`LINKED`,
  `ISLAND`, or `EC`). Enforces I5.
- **Orphan intra-usecase link:** any intra-usecase link (data-link OR control-link)
  whose `(source_sg, dest_sg)` is not present in at least one UC's pair set. Enforces
  FR-VAL-03.
- **Orphan subsystem:** any subsystem containing no SG that is a member of any UC.
  Enforces FR-VAL-02.

If any orphan exists at commit time, the commit shall be rejected with an error
identifying the orphaned entities. The user must either delete the orphans (via the
FR-VAL-01 delete-orphans workflow) or run auto-routing / manual UC creation to include
the orphans in a UC before retrying the commit.

**(d) Manual UC referential integrity (enforces I7 for user-authored UC edit-actions):**

For every staged edit-action in the commit scope where `source = MANUAL` AND
`target_table = 'UseCase'` AND `operation IN ('CREATE', 'UPDATE')`, the system shall
validate that every component listed in the edit-action's `referencedComponents`
field (`sgSystemIds`, `dataLinkSystemIds`, `controlLinkSystemIds` captured at the
edit-action's creation time) still exists in the effective post-commit graph AND is
not marked for deletion.

**Applies to:**
- Manual UC creation via `create-manual-usecases` (`operation = CREATE`).
- FR-DUP-04 user-choice materializations:
  - `CREATE` edit-actions from `PATH_A` / `PATH_B` / `MERGE` (two new paths) or
    `REPLACE_WITH_NEW` (new vs existing DB UC);
  - `UPDATE` edit-actions from `MERGE` (new vs existing DB UC).

**DELETE edit-actions** (`source = MANUAL AND target_table = 'UseCase' AND
operation = 'DELETE'`) are not subject to `referencedComponents` validation — the
edit-action's intent is to remove the UC, so component existence is not required.
If the DELETE targets a UC that no longer exists in the effective graph (e.g., the
UC was already deleted by a subsequent action), the DELETE is silently a no-op —
the intent (remove the UC) is already satisfied. This is not a failure and does
not contradict the "no partial commit" rule.

**On failure:** commit is rejected with issue code `ARC-COMMIT-MANUAL-UC-BROKEN-DEPS`.
Response lists each broken manual UC edit-action with its `impactedEntity` (the
manual UC's `systemId` for CREATE, or the target UC's `systemId` for UPDATE) and
the specific missing/deleted components in the failure detail. Autofix hint is
"delete the manual UC edit-action rows" — the user's client invokes the
edit-actions autofix endpoint (existing pattern per FR-VAL-01) which bulk-removes
the flagged manual UC edit-actions. Commit is then retried.

**Relationship to routing-time detection.** FR-DUP-04's Phase 9 pre-check
(`ARC-ROUTING-MANUAL-UC-BROKEN-DEPS`) runs the same integrity check at routing
time to give the user immediate feedback. Both checks share the same
`referencedComponents` payload and the same autofix mechanism. FR-COMMIT-01(d)
remains the final safety net for the case where the user attempts to commit
without a preceding `create-usecases` run, or the graph is edited between
routing and commit.

*Rationale:* manual UCs reference specific SGs and links by systemId. Between
creation and commit, the user may have edited or deleted those references. Rather
than adding cross-edit-action integrity checks at delete time (which would be
expensive across many handlers), the commit-time gate catches the inconsistency
uniformly. The autofix mechanism preserves the user's ability to still commit
their other staged edits — they just lose the broken manual UC (which they can
recreate via `create-manual-usecases` or by re-running `create-usecases` and
re-selecting the collision option, if still wanted).

*Interaction with recreation:* if the user re-invokes `create-manual-usecases`
after the autofix, the new manual UC edit-action captures a fresh
`referencedComponents` reflecting the current graph state. Direction/component
drift is corrected implicitly at recreation.

**Rejection semantics:** Checks (a), (b1), (b2), (c), (d) run in order. Any failure
causes the whole commit to be rejected — no partial commit. The response identifies
which check failed and which entities caused the failure. Autofix suggestions per check
may be combined by the client before retrying the commit.

---

## 6. New Workflows Identified

These workflows are implied by the extended requirements but not explicitly described
in the core requirements. They need to be validated and potentially reflected in the
API design phase.

### W3: EC Connection Routing Trigger
When a user adds an EC connection link (`isEc = true`) between two subgraph domains,
the next `create-usecases` call detects it (FR-EC-01) and generates 3 UCs (Left,
Bridge, Right) instead of a single through-path (FR-EC-03). The user stages the 3 UCs.
Future routing sessions that include those subgraphs treat the EC connection as a path
boundary (FR-EC-02).

### W4: MDF V2 Path Traversal
MDF bridge subgraphs (`IsMdf = true`) already exist in the DB. When routing traverses
a path that includes an MDF bridge SG, it is treated as pass-through — no KV
contribution. It must nevertheless be an explicit member of `activeSubgraphs` when it
is in the effective routing scope, using an empty SGKV contribution (FR-MDF-01).

MDF Scenario 4 does not rely on this general traversal to preserve a UC. When one
deleted direct pair has one unambiguous MDF-only replacement path, the routing workflow
stages the pair-local structural rewrite defined by FR-MDF-01. The UC is not added to
the affected-selection gate solely for that substitution. General traversal remains
responsible for all non-transparent and ambiguous topology changes.

### W5 / FR-UC-UPDATE-01: Replace an existing UC's structure

The system shall expose
`PUT /arc-api/v1/projects/:projectId/usecases/:usecaseSystemId/structure` to replace one
existing UC's GKV, SG membership, and SG-pair set atomically. This is a new structural
write API; it does not extend the existing alias-only `PATCH /usecases/:usecaseSystemId`.

**Request:**

```typescript
{
  activeSubgraphs: Array<{
    systemId: string;
    valueSystemIds: string[]; // exactly one selected SGKV case
  }>;
  dataLinkSystemIds: string[]; // exact selected data links; may be empty
}
```

**Validation and behavior:**

- The target UC, every selected SG, every selected SGKV, and every selected data-link
  must exist in the same file's effective session overlay.
- `activeSubgraphs` must be non-empty and contain unique SG IDs. Each entry selects
  exactly one SGKV case. The selected SGKVs must combine into exactly one internally
  consistent, non-empty UC GKV using the same pure GKV validation rules as manual UC
  creation.
- `dataLinkSystemIds` is the complete desired data-link selection. Every selected link
  must have both endpoint SGs in `activeSubgraphs`. The server derives directed SG pairs
  from those links and deduplicates repeated SG pairs.
- Control-link IDs are not accepted or auto-discovered by this API.
- Disconnected structures and isolated selected SGs are valid. An empty data-link list
  is therefore allowed.
- If another effective UC already owns the resulting GKV, reject with HTTP 409 and
  identify the conflicting UC. The target UC itself is excluded from this comparison.
- Replace the target UC's GKV rows, SG membership rows, and SG-pair rows as one
  handler-owned transaction. Any failure rolls back the complete replacement.
- Recompute the resulting internal UC type from the replacement topology using the
  existing `LINKED` / `ISLAND` / `EC` classification rules. Emit
  `source = MANUAL` edit-actions using the shared MANUAL staging policy; edit source
  records provenance and is not a UC type.
- Store `referencedComponents = {sgSystemIds, dataLinkSystemIds,
  controlLinkSystemIds: []}` on the UC UPDATE edit-action so FR-COMMIT-01(d) can validate
  it at stage/commit time.
- Allow only active `DESIGNER` and `DIFF_MERGE` sessions.

**Response:** HTTP 200 with the effective updated UC plus the ambient edit-action
`groupId`, nested so operation metadata is separate from entity data:

```typescript
{
  usecase: {
    systemId: string;
    keyValuePairs: KeyValuePairDto[];
    usecaseAliasId?: number;
    usecaseAliasName?: string;
    usecaseCategory?: string;
    changeId: string;
    subgraphSystemIds: string[];
    subgraphPairs: Array<{
      sourceSubgraphSystemId: string;
      destSubgraphSystemId: string;
    }>;
  };
  groupId: string;
}
```

The structural-update endpoint owns this dedicated rich UC schema. The create-usecases
and create-manual-usecases endpoints use their separate before/after change-details
schema. The structural response does not expose the internal UC type; the implementation
recomputes that type from the resulting topology for internal routing behavior.

**Implementation boundary:** reuse the pure SGKV/GKV validation extracted for manual
UC creation, but do not add an Update mode to the 12-phase auto-routing pipeline. The
handler computes a delta from the current overlay UC and extends the existing atomic
`UsecaseRepository.applyStructuralChange` capability to replace GKV relationships in
the same edit-action group.

---

## 7. Contradiction Resolutions

All five contradictions identified during this exercise have been resolved in favour of
the frozen core requirements or through explicit user decisions.

### C-01: GKV Change — RESOLVED (core req correct)
**Resolution:** FR-LIFE-01 applies. When KVs change, the existing UC is **preserved**
alongside the newly created UC. The old UC remains as a historical record.

### C-02: Orphan Intra-Usecase Links — RESOLVED (core req correct)
**Resolution:** FR-VAL-03 applies. Orphan intra-usecase links are an **ERROR**. The
user-facing workflow follows FR-VAL-01: report orphans, offer delete-or-continue.

### C-03: Duplicate Disjoint GKV — SUPERSEDED (2026-08-19)
**Resolution:** FR-DUP-04 supersedes FR-DUP-01. Disjoint same-GKV candidates are no
longer a blocking error — they surface as an `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED`
issue with `Path A` / `Path B` (two new paths) or `Keep existing` / `Create new UC`
(new vs existing DB UC) options. See core requirements §3.6 FR-DUP-04.

### C-04: `ISLAND` UC Deletion Behavior — RESOLVED (core req correct)
**Resolution:** FR-DEL-01 through FR-DEL-05 apply to ALL UCs regardless of type.
An `ISLAND` UC containing a deleted component follows the same deletion workflow.
The user may choose to preserve it as `ISLAND` (FR-DEL-05).

### C-05: MDF Implicit Injection — RESOLVED (scope remains explicit)
**Resolution:** MDF subgraphs (`IsMdf = true`) are pass-through nodes but are not exempt
from FR-API-03 or FR-CONE-07. An MDF SG in the effective routing scope must be explicit
in `activeSubgraphs` with an empty contribution; assigning non-empty KVs is an error.
A confirmed pure MDF substitution is separately exempt from the FR-DEL-02 affected-UC
selection gate because it is a deterministic identity-preserving structural rewrite,
not deletion or reconstruction. Failure to prove every FR-MDF-01 condition restores the
normal deletion-impact and selection rules.

---

## 8. Already Captured in Core Requirements (Skipped)

| Source Doc Topic | Core Requirement |
|---|---|
| DFS traversal from root SGs to leaves | FR-DFS-01 through FR-DFS-04 |
| UC-filtered KV selection (pair-level) | FR-KV-01, FR-KV-02 |
| Cartesian product / multi-KV expansion | FR-DFS-05 |
| KV conflict detection and pruning | FR-DFS-06, FR-DFS-07, FR-DFS-08 |
| Empty GKV path rejection | FR-DFS-09 |
| Duplicate GKV — overlapping paths merge | FR-DUP-04 (superseded FR-DUP-02) |
| Duplicate GKV — disjoint paths error | FR-DUP-04 (superseded FR-DUP-01) |
| Orphan SG detection and resolution | FR-VAL-01 |
| Orphan subsystem detection | FR-VAL-02 |
| Deletion scenario (all modes) | FR-DEL-01 through FR-DEL-05 |
| Cone computation (bidirectional) | FR-CONE-04 |
| Seed identification | FR-CONE-01 through FR-CONE-06 |
| Stage/reject workflow | FR-STAGE-01, FR-EXT-03 |
| New UCs start unstaged | FR-LIFE-02 |
| Commit orphan-free gate | I5 |
| `LINKED`/`ISLAND` UC type | FR-STATUS-01 through FR-STATUS-03 |
| Cycle detection → warning | FR-DFS-04 |
| Single-SG UC from leaf with KVs | FR-DFS-03, FR-DEL-04 |
| Cross-usecase links not traversed | FR-DFS-02 |
| Control links for `ISLAND` UC pair derivation | FR-UC-01 step 4, FR-API-04 |
| `ISLAND` UC transition to `LINKED` | FR-STATUS-04 governs the `ISLAND` → `LINKED` transition. `ISLAND` type is NOT permanent: when a routing session determines all pairs are covered, the UC converts in-place. New `LINKED` UCs may also be created separately when the path structure differs. |
| KV-only changes preserve existing UCs | FR-LIFE-01 |
| Existing UC deletion only via structural change | FR-DEL-01 through FR-DEL-05 |
| End-to-end only in single routing pass | FR-DFS-03 (emit at leaf) |
| Sub-path UC lifecycle (preservation/deletion) | FR-LIFE-01, FR-DEL-01 through FR-DEL-05 |
