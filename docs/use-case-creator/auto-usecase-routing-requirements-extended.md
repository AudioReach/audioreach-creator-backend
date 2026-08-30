
<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Auto-Usecase Routing: Extended Requirements

**Date:** 2026-06-02
**Status:** Draft — all contradictions resolved, pending user review
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
A routing path must contain at most one EC connection. If the DFS traversal encounters
a second EC connection on the same path, the system shall return an error identifying
the path and both EC connections. Multiple EC connections on a single path are not
valid.

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

When an EC bridge UC is DELETED due to structural component deletion, it follows the
same deletion workflow as any UC (core reqs FR-DEL-01 through FR-DEL-05): all UCs
containing the deleted component are identified, impacted UCs must be selected by the
user, and the user may choose to preserve the UC as Disconnected (FR-DEL-05).

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

Left and Right UC candidates (`type=Connected` in the new scheme) are **not** subject
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

A UC (legacy or new-scheme) shall contain at most **one** EC data-link in its pair
set. Exception: when a legacy EC UC has an isMdf-transparent-bridge substitution at
its EC boundary (per FR-MDF-01 "Transparent bridge substitution (MDF Scenario 4)"),
the resulting pair set may contain **two** `isEc=true` data-links flanking the
inserted isMdf SG in the specific pattern `B → SG_MDF → C`. Functionally, this
represents one EC crossing made transparent by MDF; both flanking data-links inherit
`isEc=true`.

Any other configuration with two or more EC data-links in a UC's pair set is a
pre-validation error (`ARC-ROUTING-EC-MULTIPLE-LINKS`).

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

A UC's `type` is derived from its pair set:
- `type = EC` iff the pair set contains at least one `isEc=true` data-link.
- `type = Disconnected` iff any pair in the pair set has no data-link coverage
  (only control-link support, per FR-STATUS-02 semantics).
- `type = Connected` otherwise.

When a routing operation adds or removes a supporting data-link, the affected UC's
`type` shall be updated at Phase 11 (RoutingChangeStager) based on the resulting
pair set. Examples:
- Legacy EC UC has its internal EC data-link deleted (with no MDF substitution) →
  type transitions to `Connected` (if all pairs data-link covered) or `Disconnected`
  (if any pair loses coverage).
- Non-EC Connected UC has an EC data-link added inside → not possible; adding an EC
  connection would trigger the new-scheme 3-UC generation, not modify an existing UC.

*Cross-references:* FR-MDF-01 (MDF transparent bridge substitution); FR-DUP-03(b1)
(identity-preserving interior extension — silent auto-update); LLD4 §5.4.b
(reconstruction algorithm); LLD5 §7.1 (classification Bridge dedup).

---

## 2. MDF V2 — Implicit Intermediate Subgraph Support

*Deferred in core reqs (Out of Scope). Captured here as the follow-on spec.*

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
- **API map exempt:** The subgraph is exempt from the mandatory API map rule (FR-API-03)
  and the scope boundary rule (FR-CONE-07) of core reqs. It participates in routing
  paths automatically without requiring a user-provided entry in the API's SG map.
  The routing engine auto-populates the SG's SGKV instance list with one empty
  instance during KV resolution (Phase 4).
- **No KVs allowed:** If the API input provides any SGKV instances for an IsMdf
  subgraph, the system shall return an error. Users must not assign KVs to MDF
  subgraphs (they are typically hidden in the UI for this reason).
- **Transparent bridge substitution (MDF Scenario 4):** When a user deletes a direct
  intra-usecase data-link between two SGs *and* adds one or more IsMdf SGs forming a
  bridge path between them (typical of MDF offloading at subgraph boundaries), the
  deletion shall NOT be treated as impacting any UC referencing the deleted pair.
  The routing algorithm detects the transparent-bridge alternate path in the
  deletion-scope phase and lets the normal pipeline discover the new path via cone
  and DFS traversal. FR-DUP-03(b1) identity-preserving interior extension then
  silently updates the existing UC in place — inserting the IsMdf SG(s) into the
  UC's SG set and rewriting the pair set accordingly. No FR-DEL-02 fail-fast fires,
  and no new UC is created.

*The mechanism for detecting and setting `IsMdf` (e.g., based on the presence of
IPC Tx and IPC Rx modules within the subgraph) is deferred to the MDF V2 feature
implementation. At that point, FR-API-03 and FR-CONE-07 in core requirements will be
formally updated to document this exception.*

---

## 3. Deletion Scenario Extension

*Extends core reqs §3.9 (FR-DEL-01 through FR-DEL-05).*

#### FR-DEL-06: Endpoint-anchored path reconstruction pass
After the main DFS (FR-DEL-04 of core reqs) completes, the system shall perform an
additional reconstruction pass for each UC marked for deletion. The pass has two
sub-modes depending on the UC's **topology** — single-path vs multi-path.

**Topology detection (cheap, per UC):**

For each UC marked for deletion, examine its stored pair set:
- Compute `starts` = the set of SGs in the UC's SG set with no incoming pair
- Compute `ends` = the set of SGs in the UC's SG set with no outgoing pair
- If `|starts| == 1` and `|ends| == 1` → **single-path** UC → apply the bounded-DFS
  reconstruction (steps 1–7 below).
- If `|starts| > 1` OR `|ends| > 1` → **multi-path** UC (auto-routing cannot reproduce
  this topology; only manual UC creation can) → skip the bounded-DFS reconstruction
  and apply pair-level survival semantics (step 8).

*Note on Disconnected UCs:* No explicit status-based branch is needed. Bounded DFS
traverses only intra-usecase data-links (FR-DFS-02), so pairs that are control-link-
only cannot be reconstructed. This is handled naturally by step 7 (no path found → no
reconstruction candidate). Disconnected UCs may still be single-path topologically,
in which case they go through the bounded DFS path — the DFS will either find no data-
link path (matching step 7) or find a data-link-only alternative path (which becomes a
new candidate, orthogonal to the original Disconnected UC's fate).

**Bounded-DFS reconstruction — for single-path UCs:**

1. Extract the deleted UC's **start SG** (root of its subgraph path) and **end SG**
   (leaf of its subgraph path).
2. If both start and end SGs are still present in the graph (neither was deleted as
   a component): run a bounded DFS from the start SG to the end SG, treating the end
   SG as a forced leaf boundary within this scoped pass.
3. The bounded DFS uses the same API map KVs already provided (mandatory via
   FR-DEL-02 and FR-API-03 of core reqs). No new API input is required.
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
   produces a KV conflict, OR the original UC was Disconnected and the required route
   passes through a control-link-only pair that DFS cannot traverse per FR-DFS-02),
   no additional UC candidate is emitted from this reconstruction pass. The UC
   remains in the `markedForDeletion` set from the main deletion scenario
   (FR-DEL-03). Its final fate is decided by the user via FR-DEL-05:
   - **Accept deletion:** UC is dropped at commit.
   - **Preserve as Disconnected (FR-DEL-05):** UC's SG set and pair set are updated to
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
     - **Preserve as Disconnected:** UC's SG set and pair set are trimmed to only
       surviving components. Auto-routing does not attempt to discover replacement
       paths — the user must manually re-declare via `create-manual-usecase` if they
       want a different topology.

*This enables the system to detect path transformations (e.g., `A→B` becoming
`A→X→B`) in the same API call, without requiring a second user-initiated call.*

*KV conflict limitation:* If the new SG's KVs conflict with a specific old combination,
that reconstruction is discarded (FR-DFS-06). The routing response (FR-IMPACT-03)
shall report which deleted UC GKVs could not be reconstructed. The user may then add
additional SGKV instances to the new SG and re-call the API.

---

## 4. Additional Pre-Validation Rules

*Core reqs have FR-API-03 (cone completeness). The following adds checks that run
before DFS begins.*

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
- After resolution, the routing algorithm reads the effective `data_links` and
  `control_links` overlay including the newly-resolved rows. The routing algorithm
  itself is unaware of SLS / CSLS (FR-VL-27 of the subsystem-links spec).

**Applies to both endpoints:**
- `create-usecases` (auto-routing, FR-UC-02) — routing depends on complete
  intra-usecase data-links.
- `create-manual-usecase` (manual, FR-UC-01) — manual pair derivation queries DB
  data-links and control-links (FR-UC-01 step 4); those queries also depend on
  chain resolution being complete.

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

**(a) Direction correction on Disconnected UCs (safety net for FR-STATUS-04):**

Apply FR-STATUS-04's Step 1 (direction correction) to every Disconnected UC in the
commit scope, whether or not `create-usecases` was called after the last graph edit. If
a data-link exists in the direction opposite to a stored pair, correct the pair to match
the data-link direction. Corrected pairs are staged as UPDATE edit-actions before the
commit proceeds. After correction, evaluate FR-STATUS-04 Step 2 (coverage) — a UC that
now has all pairs covered transitions to Connected as part of the same commit.

**(b) Path re-validation for newly staged UCs (original FR-COMMIT-01):**

For every newly created staged UC (regardless of Connected or Disconnected status):

- **SG existence:** All SGs in the UC's SG set must still exist in the effective
  post-commit graph.

- **Pair-link presence (I7 — applies to every UC):** For each pair `(A, B)` in the
  UC's pair set, at least one intra-usecase link (data-link OR control-link, either
  direction) must be present between A and B in the effective post-commit graph. A
  pair with no supporting link is dangling and invalid — commit rejected.

- **Connected-status coherence:** If the UC's status is **Connected**, every pair must
  additionally satisfy FR-STATUS-04's coverage rule — an intra-usecase data-link in
  the pair's stored direction, or a bridge-mediated path per FR-STATUS-04 Step 2.
  Control-link-only pairs are **not** sufficient for Connected status. A Connected UC
  with an uncovered pair at commit time indicates the graph drifted since routing
  last ran; either safety-net check (a) has already corrected the pair direction
  (rare), or the commit is rejected — the user must run auto-routing to normalize
  the UC's status (transition to Disconnected), delete the affected UC, or restore
  the missing data-link.

- **Disconnected-status validity:** If the UC's status is **Disconnected**, pair-link
  presence (I7) is the sole per-pair requirement. A pair with control-link coverage
  and no data-link is valid — manual Disconnected UCs may have control-link-only
  pairs per FR-UC-01 step 4. Data-link direction mismatch (data-link exists in the
  opposite direction) is handled by safety-net check (a) before (b) runs.

- **Isolated-SG members (Q5 case):** An SG that is a member of the UC's SG set but
  has no pair involving it (per FR-UC-01 step 4's isolated-SG rule) is valid — no
  per-pair check applies to such an SG. Existence check above still requires it to
  be present in the graph.

Any UC that fails path re-validation causes the commit to be rejected with an error
identifying the failing UCs and the offending pairs.

*Scope for (b):* Applies to staged UCs created in the current edit session. It does not
modify or validate existing committed UCs (governed by FR-LIFE-01 in the core reqs). It
catches the case where a structural change occurred between the routing call and the
commit call, breaking a newly staged UC's path.

**(c) Orphan detection safety net (enforces I5, FR-VAL-01, FR-VAL-02, FR-VAL-03):**

The system shall detect true orphans in the effective post-commit state. Orphans
typically arise when the user adds a new SG or a new intra-usecase link but does not
run `create-usecases` before attempting to commit — the new item is not a member of any
UC, violating the orphan-free invariant.

- **Orphan SG:** any SG present in the graph that is not a member of any UC (Connected
  or Disconnected). Enforces I5.
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
- Manual UC creation via `create-manual-usecase` (`operation = CREATE`).
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
recreate via `create-manual-usecase` or by re-running `create-usecases` and
re-selecting the collision option, if still wanted).

*Interaction with recreation:* if the user re-invokes `create-manual-usecase`
after the autofix, the new manual UC edit-action captures a fresh
`referencedComponents` reflecting the current graph state. Direction/component
drift is corrected implicitly at recreation.

**Rejection semantics:** Checks (a), (b), (c), (d) run in order. Any failure causes the
whole commit to be rejected — no partial commit. The response identifies which check
failed and which entities caused the failure. Autofix suggestions per check may be
combined by the client before retrying the commit.

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
contribution, no API map entry required (FR-MDF-01). The user does not need to
explicitly include or assign KVs to MDF bridge SGs; the system handles them
transparently.

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

### C-04: Disconnected UC Deletion Behavior — RESOLVED (core req correct)
**Resolution:** FR-DEL-01 through FR-DEL-05 apply to ALL UCs regardless of type.
A Disconnected UC containing a deleted component follows the same deletion workflow.
The user may choose to preserve it as Disconnected (FR-DEL-05).

### C-05: MDF Implicit Injection — RESOLVED (FR-MDF-01 exemption)
**Resolution:** MDF subgraphs (`IsMdf = true`) are exempt from FR-API-03 and
FR-CONE-07. They are pass-through nodes already present in the DB — DFS traverses
them naturally with no injection needed. Providing KVs for an IsMdf subgraph is an
error. See FR-MDF-01. FR-API-03 and FR-CONE-07 will be formally updated when MDF V2
is implemented.

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
| Connected/Disconnected UC status | FR-STATUS-01 through FR-STATUS-03 |
| Cycle detection → warning | FR-DFS-04 |
| Single-SG UC from leaf with KVs | FR-DFS-03, FR-DEL-04 |
| Cross-usecase links not traversed | FR-DFS-02 |
| Control links for Disconnected UC pair derivation | FR-UC-01 step 4, FR-API-04 |
| Disconnected UC transition to Connected | FR-STATUS-04 governs the Disconnected → Connected transition. Disconnected status is NOT permanent: when a routing session determines all pairs are covered, the UC converts in-place. New Connected UCs may also be created separately when the path structure differs. |
| KV-only changes preserve existing UCs | FR-LIFE-01 |
| Existing UC deletion only via structural change | FR-DEL-01 through FR-DEL-05 |
| End-to-end only in single routing pass | FR-DFS-03 (emit at leaf) |
| Sub-path UC lifecycle (preservation/deletion) | FR-LIFE-01, FR-DEL-01 through FR-DEL-05 |
