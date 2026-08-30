<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Auto-Usecase Routing: Requirements

**Date:** 2026-06-01  
**Status:** Frozen  
**Owner:** Nithin Simon

---

## 1. Context

### 1.1 Problem Statement

Manually creating usecases is error-prone and time-consuming when the graph has many
subgraphs with complex connectivity. Users need a way to automatically discover all valid
audio-processing paths (usecases) from a Subgraph graph using a DFS-based routing
algorithm, with the discovered usecases identified by a canonical key-value identifier
(GKV).

### 1.2 What This Builds On

- **UseCase + SubgraphPair schema redesign** (`2026-05-18-usecase-subgraph-schema-redesign.md`):
  A UseCase is a set of Subgraphs + a set of directed subgraph pairs
  (`use_case_subgraph_pairs`). This is the write target for the routing algorithm.
- **SGKV design** (`2026-05-29-sgkv-design.md`): Each Subgraph has zero or more
  SGKV records (`sgkv` table). Each SGKV is a set of ValueDefinition references.
  SGKVs are the source of per-subgraph KV data for the routing algorithm.
- **Edit-session / edit_actions framework**: Pending KV changes (staged or unstaged) are
  tracked in `edit_actions`. The routing algorithm reads these as overlays during the
  session.

### 1.3 Key Decisions Already Made

- Usecase identity = GKV (the union of all KV pairs contributed by each SG in the path).
- The algorithm only **creates** new UCs. It does not delete UCs unless a structural
  component (SG or intra-usecase link) is deleted.
- KV writes to DB (SGKV table) are **additive-only** at commit time; cleanup of
  unreferenced KVs is deferred to download-file time.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| **Subgraph (SG)** | Routing node; logical container of modules. The atomic unit of path construction. |
| **SGKV** | A named set of ValueDefinitions attached to a Subgraph. One SG can have zero or more SGKVs. Source of per-SG KV data. |
| **KV** | A single (Key, Value) pair — i.e., one `ValueDefinition` reference. |
| **KV list** | The set of KV pairs belonging to one SGKV instance. Each Key appears at most once per KV list (enforced by I6). |
| **GKV** | Graph Key-Vector. An unordered set of (Key, Value) pairs where each Key appears exactly once. Derived from one valid SGKV combination across all SGs in a path. Uniquely identifies a UC. |
| **SGKV combination** | An assignment of exactly one SGKV instance per SG in a path. A combination is valid if no Key appears with two different Values across the assigned instances. Each valid combination produces exactly one UC candidate. |
| **UC** | UseCase. A record in `use_cases` consisting of: a GKV, a set of SGs, a set of directed SG pairs, and a connectivity status (Connected or Disconnected). |
| **UC filter** | A map of `Key → Set<Value>` derived from the selected usecases. Used to strip irrelevant KV pairs from SG SGKV data before routing. |
| **Intra-usecase link** | A data link between two different SGs that are both members of the same UC (`link_scope = intra_usecase`). Traversable by the routing algorithm. |
| **Inter-usecase link** | A data link between SGs that belong to different UCs (`link_scope = inter_usecase`). Not traversed by the routing algorithm. |
| **Seed SG** | A SG whose API-input SGKV instances differ from its UC-filtered DB SGKV instances, or which is newly added to the graph, or which has a new or deleted intra-usecase link. Starting point for bidirectional cone identification. |
| **Cone** | The set of SGs reachable from any seed SG via both forward traversal (following intra-usecase link direction) and reverse traversal (against link direction), bounded by the routing scope (FR-CONE-07). Defines which paths the DFS re-evaluates in this session. |
| **Staged / Unstaged** | Edit-session states. New UCs begin as Unstaged. User explicitly stages them before commit. Unstaged UCs are discarded when the edit session ends without a commit. |
| **Connected** | UC status: all SG pairs in the UC have corresponding intra-usecase links present in the graph. |
| **Disconnected** | UC status: one or more SG pairs in the UC no longer have intra-usecase links (e.g., a link was deleted and the user chose to preserve the UC). |
| **Orphan SG** | A SG that is not a member of any UC (Connected, Disconnected, or newly staged). Orphan SGs are an error condition. |
| **Orphan subsystem** | A subsystem that contains no SG that is a member of any valid UC. |

---

## 3. Functional Requirements

### 3.1 Usecase Creation Modes

#### FR-UC-01: Manual UC creation
When a user provides a set of SGs with their SGKV instances (via the dedicated
`create-manual-usecase` endpoint) and requests manual UC creation, the system shall:

1. Apply the same 3-step KV resolution pipeline (FR-KV-01–03) using the provided
   SG→KV map and selected UCs.
2. Apply the same SGKV combination expansion (FR-DFS-05) and conflict detection
   (FR-DFS-06–09) on the user-provided SG set.
3. Create one UC per valid SGKV combination found across the selected SGs. If no valid
   combination exists (all combinations produce Key conflicts), return an error per
   FR-DFS-08.
4. Derive the UC's subgraph-pair set by querying the DB for links between the provided
   SGs (the client does not supply link IDs — see FR-API-04):
   - **Primary (data-link discovery):** For every pair of SGs in the provided set, query
     the DB for intra-usecase data-links between them. For each data-link found, create
     a directed pair `(source_sg, dest_sg)` matching the link's direction. This pair is
     "data-link covered".
   - **Control-link fallback:** For any SG in the provided set that has no intra-usecase
     data-links to any other SG in the set, query the DB for intra-usecase control-links
     between that SG and any other SG in the set. For each control-link found, create a
     directed pair with direction `(smaller_sg_id, larger_sg_id)` — the SG with the
     smaller system ID is the source. This pair is "control-link only".
   - **Isolated SG (Q5):** If an SG in the provided set has neither an intra-usecase
     data-link nor an intra-usecase control-link to any other SG in the set, the SG is
     included in the UC's SG set with no pairs involving it. The system shall emit a
     warning identifying such SGs. The UC is still created (as Disconnected — see the
     status paragraph below).
   - Record unique pairs in `use_case_subgraph_pairs`. Every `intra_usecase` link in DB
     whose `(source_sg, dest_sg)` matches a declared pair is automatically part of the
     UC — no per-link explicit assignment is needed.

**Manual UC initial status:**
- The UC is created as **Connected** if every pair in its pair set is data-link covered.
- The UC is created as **Disconnected** if any pair is control-link only, or if any SG
  was included via the isolated-SG rule (no pairs involving it).

Manual mode skips DFS path discovery — the system uses the provided SG set plus DB link
information (rather than a user-supplied link list) to derive pairs. Everything from
SG-set-known onward (KV resolution, combination expansion, validation) is identical to
auto-routing.

#### FR-UC-02: Auto-routing UC creation
When a user provides an SG→KV map and a set of selected UCs and requests auto-routing,
the system shall run the DFS-based routing algorithm (§3.3) to discover all valid paths,
compute GKVs, and create new UCs for each unique valid path.

---

### 3.2 CreateUCs API Input

#### FR-API-01: SG→SGKV-instances map
The API input shall include a map from SG system-ID to an ordered list of zero or more
SGKV instances. Each SGKV instance is a flat KV list (zero or more (Key, Value) pairs;
each Key appears at most once per instance per I6). A SG mapped to an empty list is
valid and means that SG contributes one empty SGKV instance to routing (no KV pairs
contributed to any path's GKV).

#### FR-API-02: Selected usecase list
The API input shall include a list of existing UC system-IDs that represent the user's
active session context. This list is used to build the UC filter (§3.2) and to determine
which existing UC data to load from DB.

#### FR-API-03: Cone completeness pre-validation
After computing the cone (§3.4), the system shall verify that every SG in the cone is
present in the API's SG map. If any cone SG is absent, the system shall return a
pre-validation error listing the missing SGs. The caller must re-invoke the API with
those SGs included (with KVs or `[]`). This rule applies in all scenarios — there are
no exceptions and no DB fallback.

*Rationale:* The system never uses DB KVs as a routing KV source. The API map is the
sole KV source for routing. A SG absent from the map has no KV data for the algorithm
to use. Providing `[]` is the deliberate way to declare "no KV contribution."

#### FR-API-04: Manual mode uses a dedicated endpoint; server discovers links
Manual UC creation (FR-UC-01) is served by a dedicated endpoint (`create-manual-usecase`)
separate from the auto-routing endpoint (`create-usecases` for FR-UC-02).

The manual endpoint's request body includes only:
- The set of SGs with their SGKV instances (SG→SGKV map, same shape as FR-API-01).
- The `selectedUsecaseSystemIds` list (FR-API-02) for UC filter derivation.

**Link system IDs are NOT required in the request.** The server discovers intra-usecase
data-links and (as fallback) intra-usecase control-links between the provided SGs by
querying the DB (per FR-UC-01 step 4). This differs from auto-routing, where link
discovery is performed via DFS traversal of the cone.

#### FR-API-05: Optional link exclusion for the current routing pass
The API input may optionally include two lists of intra-usecase link system IDs to
**exclude** from the current routing pass:
- `excludedDataLinkSystemIds` — intra-usecase data-links to omit
- `excludedControlLinkSystemIds` — intra-usecase control-links to omit

**Purpose:** UX affordance for drag-and-drop workflows where the user drags SGs from
other UCs onto the routing canvas. The UI automatically surfaces every intra-usecase
link that connects the dragged SGs to the selected UCs' SGs (and to each other). The
user may choose to exclude specific such links from this routing pass without
deleting them from the DB.

**Scope of exclusion:**
- Applies only to the current API call. Excluded links are not persisted; no DB state
  change occurs.
- Applies to both endpoints: `create-usecases` (FR-UC-02) and `create-manual-usecase`
  (FR-UC-01).
- Only intra-usecase links are meaningful. Non-intra-usecase link IDs in the exclusion
  lists are silently ignored (they were not going to be traversed anyway).

**Effect on routing:**
- **Cone computation (FR-CONE-04):** excluded links are not traversed in forward or
  reverse direction.
- **DFS (FR-DFS-01/02/03):** excluded links are treated as absent during path
  discovery.
- **New/deleted intra-usecase link seed detection (FR-CONE-03):** an excluded link is
  NOT treated as "deleted" — the DB link still exists; exclusion is session-scoped
  only. FR-CONE-03 continues to key on actual create/delete edit_actions.
- **Manual UC creation (FR-UC-01 step 4):** excluded links are filtered out of the
  server's DB link-discovery result before pair derivation.

**Effect on validation:**
- Excluded links **remain subject to FR-VAL-03 orphan detection**. If no UC's pair
  set covers an excluded link's `(source_sg, dest_sg)`, the link appears as an
  `ARC-ROUTING-ORPHAN-INTRA-LINK` issue in the response with auto-fix=delete. This
  is intentional: exclusion is a routing-time filter, not a way to bypass the orphan-
  free invariant (I5).
- FR-COMMIT-01(c) safety-net orphan detection enforces the same rule at commit time.
- FR-DEL-01 deletion scenario is **not** triggered by exclusion — no component has
  been deleted.

*Rationale:* This supports the "drag SGs, tune links per-session" UX without polluting
requirements with implicit filters. The user retains full control over which links
participate in each routing pass, while orphan detection and the commit safety net
prevent the exclusion feature from being used to sneak inconsistent state past the DB.

#### FR-API-06: Optional subgraph exclusion for the current routing pass
The API input may optionally include a list of subgraph system IDs to **exclude**
from the current routing pass:
- `excludedSubgraphSystemIds` — subgraphs to omit

**Purpose:** UX affordance analogous to FR-API-05, but at subgraph granularity. When
a user drops SGs onto the routing canvas and wants to temporarily omit some from the
current routing pass without deleting them from the DB.

**Scope of exclusion:**
- Applies only to the current API call. Excluded SGs are not persisted; no DB state
  change occurs.
- Applies to both endpoints: `create-usecases` (FR-UC-02) and `create-manual-usecase`
  (FR-UC-01).

**Effect on routing (SG removed from the routing context):**
- **KV resolution (FR-KV-01/02/03):** excluded SGs do not have entries in
  `kvResolutions.perSg`. If the user erroneously included an excluded SG in the API's
  SG map (`activeSubgraphs`), the SG's entry is silently dropped.
- **Seed detection (FR-CONE-01/02/03/05/06):** excluded SGs are not seeds regardless
  of their edit status. Additions or deletions involving an excluded SG do not
  trigger seed emission.
- **Cone computation (FR-CONE-04):** excluded SGs are not added to the cone. Their
  presence in the adjacency graph is suppressed.
- **DFS (FR-DFS-01/02/03):** excluded SGs are treated as absent during path
  discovery. Traversal skips them entirely.
- **Manual UC creation (FR-UC-01 step 4):** excluded SGs are dropped from the
  server's pair-derivation set.
- **Incident links:** all intra-usecase data-links and control-links incident to an
  excluded SG (either endpoint) are effectively excluded too — they behave as if
  present in `excludedDataLinkSystemIds` / `excludedControlLinkSystemIds`. No explicit
  client-side listing is required.

**Effect on validation:**
- Excluded SGs **remain subject to FR-VAL-01 orphan detection**. If an excluded SG
  is not a member of any existing UC (Connected, Disconnected, or EC bridge), the SG
  appears as an `ARC-ROUTING-ORPHAN-SUBGRAPH` warning in the response with
  auto-fix=delete. Exclusion is a routing-time filter, not a way to bypass the
  orphan-free invariant (I5).
- Incident links of excluded SGs remain subject to FR-VAL-03 orphan detection
  (checked against the effective post-exclusion UC pair sets).
- FR-COMMIT-01(c) safety-net orphan detection enforces the same rules at commit time.
- FR-DEL-01 deletion scenario is **not** triggered by exclusion — no component has
  been deleted.
- FR-DEL-02 fail-fast **does not fire** solely because a SG is excluded. If a UC
  contains an excluded SG, the UC is not automatically considered impacted — the
  underlying components (data-links, control-links, other SGs) determine impact per
  their own deletion status.

*Rationale:* Complements FR-API-05 for scenarios where the user wants to omit an
entire SG rather than specific links. Especially useful for MDF or subsystem-scope
edits where the user's mental model is "route the visible canvas" and some canvas
SGs are temporarily out of scope for the current pass.

This section defines how the algorithm derives the effective KV list for each SG before
DFS begins.

#### FR-KV-01: Step 1 — Load SGKV from DB
For every SG referenced in the selected UCs (and for every SG in the API's SG map),
the system shall query the `sgkv` and `sgkv_values` tables to obtain the complete set of
SGKV records. This data is used solely for the seed-detection comparison in Step 2;
it is never used as a routing KV source.

#### FR-KV-02: Step 2 — Apply UC filter
The system shall build a UC filter from the **selected UCs that are not marked for
deletion in the current routing session**: for each such UC, extract every (Key,
Value) pair from the UC's `gkv_entries`. Build a map `Key → Set<Value>`. Then, for
each SGKV instance of each SG, retain only the KV pairs where both the Key and the
specific Value appear in the UC filter map. Discard non-matching KV pairs from each
instance. If an SGKV instance has no remaining KV pairs after filtering, that
instance is dropped. The result is the **UC-filtered SGKV instance set** for each SG
— zero or more instances, each trimmed to only relevant KV pairs.

**UCs marked for deletion are excluded from the filter build** (an implementation
detail owned by the routing engine — reads `context.markedForDeletion` from Phase 2).
Rationale: those UCs are being discarded, so their GKV entries should not participate
in defining a "valid KV" set for surviving SGs. This causes SGs that were only part
of a deleted UC to have an empty UC-filtered baseline — surfacing as orphans in
Phase 10 if the user provides no replacement KVs in the API input.

*Rationale:* This prevents KVs from unrelated usecases (e.g., `Instance` keys, sample
rates from un-selected UCs) from generating irrelevant new GKV combinations.

The result of this step (the UC-filtered SGKV instance set) is used **solely for seed
detection** in FR-CONE-01. It is never used as a routing KV source.

*Edge case — no selected UCs:* If the selected UC list is empty, no filter is applied.
Step 2 produces an empty baseline for every SG (nothing to filter against). As a result,
every SG in the API map differs from its empty baseline and becomes a seed via
FR-CONE-01. See FR-CONE-05.

#### FR-KV-03: Step 3 — Apply API input (universally mandatory)
For each SG present in the API's SG map, the system shall discard the Step-2 result and
replace it entirely with the SGKV instances from the API input. A SG mapped to an empty
list (`[]`) contributes one empty SGKV instance — the user explicitly declares no KV
contribution for it.

Every SG in the routing scope must appear in the API map. SGs absent from the map are
a pre-validation error (FR-API-03). There is no DB fallback in any scenario. DB KVs
(Steps 1–2) are used only for seed detection comparison — never as a routing KV source.

*Rationale:* The algorithm must know the user's explicit KV intent for every SG it
routes. Absence is ambiguous; `[]` is the intentional "no contribution" signal.

---

### 3.4 Seed and Cone Detection

#### FR-CONE-01: Changed SGs as seeds
After Steps 1–3, a SG is classified as a seed if its Step-3 SGKV instance set (the
API-provided set) differs from its Step-2 UC-filtered instance set (the DB-derived
baseline). The comparison is set-based: if the sets are not equal (by KV content), the
SG is a seed. FR-API-03 guarantees all SGs in the routing scope are in the API input,
so this comparison is always available.

#### FR-CONE-02: New SGs as seeds
A SG that does not appear in any existing UC in the DB is a new SG and is automatically
a seed.

#### FR-CONE-03: New or deleted intra-usecase links as seeds
A new intra-usecase link (a data link with `link_scope = intra_usecase` between two SGs
that do not yet share a `use_case_subgraph_pairs` entry in any UC) acts as a seed for
the cone. A deleted intra-usecase link also acts as a seed. Both the source and
destination SGs of the new or deleted link are treated as seeds.

#### FR-CONE-04: Cone scope — bidirectional
The cone is computed by traversing **both directions** from each seed SG:
- **Forward** — follow intra-usecase links in their declared direction to reach downstream SGs.
- **Reverse** — follow intra-usecase links in reverse to reach upstream SGs.

All SGs reachable in either direction from any seed form the cone. DFS for new UC
discovery (§3.5) runs within the cone only. Existing UCs whose SGs are entirely outside
the cone are not re-evaluated in this routing session.

*Rationale:* A changed SG can be in the middle of a path. The cone must include
upstream SGs (so DFS can traverse through the change) and downstream SGs (so all
paths passing through the change are re-routed).

#### FR-CONE-05: No selected UCs → all API-provided SGs are seeds
When the selected UC list is empty, there is no reference UC to build a UC filter from.
Step 2 therefore produces an empty baseline for every SG. Because every SG in the API
map differs from its empty baseline, FR-CONE-01 classifies every API-provided SG as a
seed. The routing scope is exactly the SGs present in the API map.

This is the empty-canvas case: the user has no prior UC context and is building from
scratch by dragging SGs onto the canvas and adding connections. All SGs they provide
participate in routing as seeds. The same mandatory-API-map rule (FR-API-03) still
applies — a SG absent from the API map is still an error.

*"Full-graph" routing simply means the user selects all existing UCs. That follows the
normal selected-UCs flow with the full UC set — it is not a separate mode.*

#### FR-CONE-06: Out-of-selected-UC-context SG → automatic seed
When the API input includes a SG that is not a member of any selected UC, that SG is
automatically a seed. There is no UC-filtered baseline to compare against for such
SGs; the API-provided SGKV instances are used directly (FR-KV-03 total replace applies,
with an empty UC-filtered set as the replaced value). The SG participates in
bidirectional cone expansion (FR-CONE-04).

*Example: user drags an existing SG from the palette onto the routing canvas. That SG
exists in the DB (possibly in other non-selected UCs) but is not in any selected UC.
The API must include this SG in the SG map (with at least an empty SGKV list). An
empty list is valid; the orphan check (FR-VAL-01) will surface errors if the resulting
paths produce no valid UCs for that SG.*

#### FR-CONE-07: Routing scope boundary — non-deletion scenarios only
In non-deletion scenarios, the routing scope is strictly bounded by:
- The SGs of the selected UCs (loaded from DB via FR-KV-01), and
- Any SGs explicitly present in the API's SG map (including out-of-context SGs per
  FR-CONE-06).

The bidirectional cone expansion (FR-CONE-04) **does not cross this boundary** into SGs
that belong only to non-selected UCs and are absent from the API input. The system does
not proactively scan non-selected UCs for impact.

The algorithm operates only on what the user has selected and explicitly provided.
Impact on unseen items is only surfaced in deletion scenarios (FR-DEL-01), where
deleted components can affect UCs the user has not selected.

*This boundary also means FR-API-03 only checks cone SGs within this bounded scope —
it does not require SGs from non-selected, non-provided UCs.*

---

### 3.5 DFS Routing Algorithm

#### FR-DFS-01: Traversal
The algorithm shall perform DFS from each root SG in the cone. Root SGs are SGs in the
cone with no incoming intra-usecase links from other SGs also in the cone.

#### FR-DFS-02: Traversable links
Only `intra_usecase` data links are traversed. `intra_subgraph` and `inter_usecase` links
are ignored by the traversal. The algorithm stops at any SG connected only via
`inter_usecase` links.

#### FR-DFS-03: Path emission
A new UC candidate is emitted for each path that terminates at a **leaf SG** — a SG with
no outgoing intra-usecase links within the cone. Paths that end at a cycle-detection
point are also emitted as leaf paths.

#### FR-DFS-04: Cycle detection
If the DFS visits a SG already in the current traversal stack (cycle), the path
terminates at that point. The cycle is logged as a warning and the path is emitted as
if the repeated SG were a leaf.

#### FR-DFS-05: SGKV combination expansion
When a SG in the path has multiple SGKV instances available (from DB after UC filter, or
from the API input for SGs covered by FR-KV-03 or FR-CONE-06), the algorithm generates
one UC candidate per valid SGKV combination across the path. A combination assigns
exactly one SGKV instance per SG in the path.

*Example:* Path A→B→C where A has 2 SGKVs (A1, A2) and C has 2 SGKVs (C1, C2), B has
1 SGKV (B1). The algorithm evaluates all 4 combinations: (A1,B1,C1), (A1,B1,C2),
(A2,B1,C1), (A2,B1,C2). Valid ones produce UC candidates.

#### FR-DFS-06: SGKV conflict detection
A SGKV combination is invalid if any Key appears with two **different** Values across
the assigned SGKV instances (from different SGs in the path). Invalid combinations are
silently discarded. A combination where two SGs contribute the **same** (Key, Value)
pair is valid — the pair appears exactly once in the GKV.

*Example:* A has {Kx:Vx1}, C has {Kx:Vx2} → same Key, different Values → conflict,
combination discarded. A has {Kx:Vx1}, C has {Kx:Vx1} → same Key, same Value → valid,
GKV includes {Kx:Vx1} once.

#### FR-DFS-07: GKV aggregation from a valid combination
For each valid combination, the GKV is the union of all KV pairs from each assigned
SGKV instance. Because the combination is conflict-free, each Key appears exactly once
in the resulting GKV.

#### FR-DFS-08: Path-level conflict error
If **all** SGKV combinations for a path produce Key conflicts (no valid combination
exists), the system shall return an error identifying the conflicting SGs and the Key(s)
that cannot be resolved. Routing results are not presented until the user resolves the
conflict (by adjusting SGKV assignments on the conflicting SGs).

#### FR-DFS-09: Empty GKV rejection
A SGKV combination whose resulting GKV is empty (every assigned SGKV instance has an
empty KV list) does not produce a valid UC and is discarded. The path's SGs may become
orphans (see FR-VAL-01).

---

### 3.6 Duplicate GKV Handling

Same-GKV collisions are handled by two silent branches (FR-DUP-03) and a user-choice
umbrella (FR-DUP-04). Silent branches cover exact match and identity-preserving
interior extension. Every other collision defers to the user.

#### FR-DUP-03: New path vs existing UC — silent branches only

Two silent (no-user-prompt) branches remain. All other overlap/disjoint cases between
a new path and an existing DB UC are governed by FR-DUP-04.

**(a) Exact match — no-op.**
If a newly routed path has identical GKV, identical SG set, and identical pair set as
an existing DB UC, no new UC is created and no issue is emitted. If the existing UC is
Disconnected, FR-STATUS-04 is evaluated independently (at Phase 3, before Phase 9) and
may transition it to Connected.

**(b1) Identity-preserving interior extension — silent auto-update.**
If a newly routed path satisfies **all** of:

- Same GKV as an existing DB UC, AND
- Same set of start SGs (SGs with no incoming pair) AND same set of end SGs (SGs with
  no outgoing pair) as the existing UC, AND
- New SG set is a **strict superset** of the existing UC's SG set (interior grew,
  nothing removed), AND
- Every added interior SG (new SG set minus existing SG set) contributes an **empty
  SGKV KV list**. This holds when the added SG satisfies one of:
  1. `IsMdf=true` — auto-populated with an empty SGKV instance at Phase 4 per
     FR-MDF-01;
  2. User-supplied empty list `[]` in the API input — the explicit "no KV
     contribution" declaration per FR-KV-03; OR
  3. The SG was added by Phase 2 bounded-DFS reconstruction (FR-DEL-06) or by
     FR-EC-07 Rule D reconstruction, and neither Phase 3 nor Phase 4 assigned any KV
     to it —

then the existing UC is **updated in place**: SG set is replaced with the new (larger)
set and pair set is replaced with the new pair set. The UPDATE is staged as a
`source=AUTO_ROUTING` edit-action (subject to FR-LIFE-04 wipe on the next
`create-usecases` invocation). The routing result reports the affected UC as an
*updated* UC — same identity, not deleted and recreated.

This branch covers three design use cases that intentionally preserve UC identity
through transparent structural change:
- MDF Scenario 4 transparent bridge substitution (FR-MDF-01);
- FR-EC-07 Rule D legacy EC UC reconstruction with added empty-KV SG;
- FR-DEL-06 bounded-DFS reconstruction for single-path deletion-marked UCs.

**Phase attribution.** Both (a) and (b1) are evaluated at Phase 9 (Classification).
FR-STATUS-04 has already run at Phase 3 (Half A) by that point — Phase 9 sees the
post-transition UC type.

**All other overlap or disjoint cases → FR-DUP-04.**

#### FR-DUP-04: Same-GKV collision resolution — user choice

Whenever the routing pipeline detects two candidates with the same GKV that do NOT
match FR-DUP-03(a) or (b1), the system shall NOT auto-merge or auto-error. Instead,
the collision is surfaced as a blocking issue with FixOptions letting the user choose
which candidate becomes the UC of record.

**Scope — all UC types.**
This rule applies to candidates whose `type` is `Connected`, `Disconnected`, or `EC`.
There is no type-based exemption. Same-GKV collisions involving EC UCs — whether an
EC Bridge candidate collides with a Connected/Disconnected UC, or two EC Bridges from
different EC connections happen to produce the same GKV — surface as FR-DUP-04
user-choice issues just like non-EC collisions. FR-EC-07 Rule A (Bridge suppression
against legacy EC UCs) and LLD5 §7.1 remain in force for EC-specific dedup that
precedes FR-DUP-04 evaluation.

**Collision classification and options offered:**

| Candidate pair | Overlap | Options offered |
|---|---|---|
| Two new paths in the same routing pass | share ≥ 1 SG | `Path A` / `Path B` / `Merge` |
| Two new paths in the same routing pass | no shared SG | `Path A` / `Path B` (no `Merge`) |
| New path vs existing DB UC, not (a)/(b1) | share ≥ 1 SG | `Keep existing` / `Replace with new` / `Merge` |
| New path vs existing DB UC | no shared SG | `Keep existing` / `Create new UC` (no `Merge`) |

The UC type distinction (`Connected`, `Disconnected`, or `EC`) is **irrelevant** to
the collision rule — a candidate of any type and an existing UC of any type with the
same GKV are handled symmetrically. FR-STATUS-04 (Disconnected → Connected automatic
conversion) runs independently at Phase 3 and is NOT tied to collision handling.

**Issue emission:**

- Code: `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED`
- Severity: `ERROR` (blocking)
- `impactedEntity`: one entry per involved UC/path candidate (full details in
  the fix option payload)
- `fixOptions`: 2 or 3 `FixOption` entries per the table above. Each `FixOption`
  carries `commandType = 'ResolveSameGkvCollisionCommand'` with payload
  `{mode: 'PATH_A' | 'PATH_B' | 'MERGE' | 'KEEP_EXISTING' | 'REPLACE_WITH_NEW',
  collisionId: string}`. `collisionId` is a server-computed stable identifier
  for the specific collision (derived from GKV + involved candidate SG sets); it
  enables the apply-fix call to re-locate the exact collision.

**Apply-fix behavior:**

1. Server re-runs routing against the current effective graph state to confirm the
   user's chosen option is still generateable by the algorithm.
2. If the chosen option is no longer generateable (graph changed since the FixOption
   was issued), apply-fix returns issue code `ARC-ROUTING-SAME-GKV-CHOICE-STALE`. The
   user must re-invoke `create-usecases` to obtain fresh FixOptions. No edit-action is
   written.
3. If still valid, the server materializes the choice as staged edit-actions with
   `source = MANUAL`:
   - **`PATH_A` / `PATH_B`** (two new paths): one `CREATE` edit-action on `UseCase`.
     Pair set is derived from the algorithm's DFS path directly, NOT re-derived via
     FR-UC-01 step-4 DB link discovery.
   - **`MERGE`** (two new paths, overlapping): one `CREATE` edit-action on `UseCase`
     with the union of both paths' SG sets and pair sets.
   - **`KEEP_EXISTING`**: no edit-action (discard the new candidate). Any SGs unique
     to the discarded candidate become orphans — see below.
   - **`REPLACE_WITH_NEW`**: one `DELETE` edit-action on the existing UC's
     `system_id` plus one `CREATE` edit-action for the new UC (pair set from the DFS
     path).
   - **`MERGE`** (new path vs existing DB UC): one `UPDATE` edit-action on the
     existing UC's `system_id`. Payload lists the new SGs added and new pairs added
     by the merge.
4. All `CREATE` and `UPDATE` edit-actions carry a `referencedComponents` payload
   (`sgSystemIds`, `dataLinkSystemIds`, `controlLinkSystemIds`) listing the components
   introduced by that edit-action. FR-COMMIT-01(d) validates them at commit time.

**Re-run recognition (idempotency after user choice):**

FR-LIFE-04 wipes `source=AUTO_ROUTING` edit-actions on every `create-usecases`
invocation but preserves `source=MANUAL`. On subsequent runs the same collision will
typically re-appear from the deterministic algorithm. Before emitting a blocking
`ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` issue, the routing pipeline shall inspect
existing `source=MANUAL` edit-actions and check whether one resolves the current
collision:

- Match criterion: **GKV + SG set + pair set** must be identical to one of the
  offered options (Path A, Path B, Merge result, or Replace-with-new resulting UC).
- If a matching `source=MANUAL` edit-action exists, the routing pipeline silently
  applies that resolution — no issue is emitted.
- If no matching `source=MANUAL` edit-action exists, the blocking issue is emitted
  with fresh FixOptions.

Because FR-LIFE-04 wipes all prior `AUTO_ROUTING` output at the start of every call,
the only edit-actions surviving across `create-usecases` invocations are
`source=MANUAL`. There is no ambiguity from prior UNSTAGED overlay entries.

**Stale MANUAL edit-action detection at Phase 9 (early pre-check):**

Before Phase 9 Classification's collision detection runs, the routing pipeline shall
validate every edit-action where `source=MANUAL AND target_table='UseCase' AND
operation IN ('CREATE','UPDATE')` against the effective post-edit graph: every
component in `referencedComponents` must still exist AND not be marked for deletion.

Any edit-action failing this check → blocking issue
`ARC-ROUTING-MANUAL-UC-BROKEN-DEPS` with `impactedEntity` = the manual UC's
`systemId` (for CREATE) or the target UC's `systemId` (for UPDATE), and `fixOptions`
= one option to remove the stale edit-action row(s). Routing pipeline halts before
Phase 9 Classification runs. The user must resolve (delete stale rows or restore
missing components) and re-invoke `create-usecases`.

**Rationale:** detect broken user choices as early as possible so the user gets
immediate feedback during routing rather than discovering the same broken state at
commit. FR-COMMIT-01(d) remains the final safety net (for the case where the user
attempts to commit without a preceding `create-usecases` call, or has edited the
graph after routing).

**Orphan consequences:**

Any SG that becomes uniquely owned by a discarded candidate (per `KEEP_EXISTING` or
`PATH_A`-vs-`PATH_B` choice) is surfaced by FR-VAL-01 at routing time (warning +
delete-orphans autofix) and becomes a hard block at commit time via FR-COMMIT-01(c).
This is the same deferred-feedback behavior common to all orphan detection in this
feature.

**Supersedes:** FR-DUP-01, FR-DUP-02, FR-DUP-TYPE-01 in full. FR-DUP-03 retains only
branches (a) and (b1); its historical non-(b1) overlap-merge and (c) disjoint-error
branches are replaced by this rule.

---

### 3.7 Validation

#### FR-VAL-01: Orphan SG detection and resolution
After routing, the system shall identify every SG in the routing scope that is not a
member of any UC. Such SGs are orphan SGs. The system shall include all orphan SGs in
the routing result payload so the UI can inform the user.

When a UC discard or stage operation would leave one or more orphan SGs, the operation
is **not blocked**. The system reports the would-be orphan components to the UI, which
presents the user two options:

- **Delete orphans:** Schedule deletion of all components that would become orphaned —
  the orphan SGs, their intra-usecase links, and any subsystems that contain only
  orphaned SGs.
  - For committed components (present in actual DB tables): record a STAGED DELETE in
    `edit_actions`. Applied at commit.
  - For new components (only in `edit_actions`, never committed): remove their
    `edit_actions` entries directly.
- **Decline and continue editing:** Do not delete the orphan components. The user
  continues working in the same edit session — adding connections, assigning KVs, or
  building new UCs — and calls `create-usecases` again once the graph is corrected.
  The commit-time orphan check (I5) is the final hard gate: commit is rejected if any
  orphan components still exist at that point.

*Examples of orphan SGs:*
- A new SG with no KVs assigned in a path that produces no valid UC (empty GKV or
  all-conflict) — no UC was ever created for it.
- A SG that was only part of one newly created UC which the user then discarded.
- After a UC deletion in the auto workflow, an SG that was only part of the deleted
  UC and has a non-empty effective KV instance set from the API input — surfaces
  with the additional hint code below.

**Additional hint for orphan SGs with non-empty effective KVs:** when an orphan SG
carries a non-empty `perSg` (from FR-KV-03 API-supplied SGKV instances), the routing
result shall include an `ARC-ROUTING-ORPHAN-SG-HAS-KVS` warning in addition to the
standard orphan warning. This hint informs the user that if a stand-alone UC around
that SG is intended, they may create it via the manual workflow
(`create-manual-usecase` — FR-UC-01) rather than deleting the SG. The hint is
non-blocking; the user may still accept the orphan as-is or delete it via
FR-VAL-01's standard orphan workflow.

#### FR-VAL-02: Orphan subsystem check
After routing, any subsystem that contains no SG that is a member of at least one UC
(per the membership definition in FR-VAL-01) is an orphan subsystem. The system shall
return an error listing all orphan subsystems.

#### FR-VAL-03: Orphan intra-usecase link check
After routing, any intra-usecase link (data-link OR control-link) whose source SG and
destination SG do not share a `use_case_subgraph_pairs` entry in at least one UC is an
orphan link. The system shall return an error listing all orphan intra-usecase links.
Orphan links arise when their source or destination SG is an orphan SG, or when two SGs
have an intra-usecase link between them but no routing session has yet created a UC
containing both.

#### FR-VAL-04: Pre-validation — deletion UC-scope completeness
When a deletion scenario is detected (see §3.9), the backend checks that every UC
impacted by the deleted component is present in the `selectedUsecases` list. This is
the UC-selection level check. The SG-presence level check is handled by FR-API-03
(cone completeness), which runs only after this UC check passes.

---

### 3.8 UC Lifecycle — Creation and Preservation

#### FR-LIFE-01: Old UCs preserved on KV-only changes
If the only change in a routing session is KV modifications (no SG additions/deletions,
no link additions/deletions), existing **committed** UCs in the DB shall not be modified
or deleted. New UCs are created for newly discovered GKV combinations; existing
committed UCs remain in their current state.

*Scope clarification:* this preservation applies to **committed** UCs only. In-session
algorithm output (edit_actions with `source=AUTO_ROUTING`) is wiped at the start of
every `create-usecases` call per FR-LIFE-04.

#### FR-LIFE-02: New UCs are Unstaged by default
All UCs created by the routing algorithm begin with `changeStatus = UNSTAGED` in the
edit-session framework. They are not committed until the user explicitly stages them.

#### FR-LIFE-03: Unstaged UCs are discarded on session end
When an edit session ends without a commit (e.g., session timeout), all UNSTAGED UCs
created during that session are discarded automatically.

#### FR-LIFE-04: Fresh routing state per create-usecases call
At the start of every `create-usecases` invocation (immediately after the chain-resolver
pre-step, before Phase 1), the system shall delete all `edit_actions` in the current
session with `source = AUTO_ROUTING`, regardless of `changeStatus` (STAGED or UNSTAGED).
The routing pipeline then runs on the resulting state (committed + user's MANUAL edits).

**Rationale:** the routing algorithm is idempotent — a fresh run on unchanged graph state
produces the same output. Wiping prior algorithm output ensures each `create-usecases`
invocation reflects the current graph state cleanly, and eliminates stale suggestions
when the user's mental model shifts between calls.

**Trade-off:** users must re-stage any auto-generated UCs they want to keep after each
`create-usecases` call. Staging is intended as the final approval step immediately before
`commit-changes`, not mid-iteration checkpointing.

**Scope:**
- Applies to `create-usecases` (auto routing) only.
- Does NOT apply to `create-manual-usecase` — manual UC edit-actions use
  `source = MANUAL` and are not wiped.
- Does NOT affect `source = MANUAL` edits (user's graph modifications and manual
  UC creations both use MANUAL) — they survive.

**Interaction with idempotency (G5):** idempotency now derives from wipe + deterministic
algorithm — same graph state produces the same routing output on every invocation. The
previous "overlay includes UNSTAGED UCs from prior calls" mechanism is superseded.

---

### 3.9 Deletion Scenario

#### FR-DEL-01: Detect all impacted UCs
When one or more components (SG or intra-usecase link) are deleted, the system shall
loop through **all UCs in the DB** and identify every UC that contains the deleted
component. The result is the complete set of impacted UCs.

#### FR-DEL-02: All impacted UCs must be selected — error if not
If any UC in the impacted set is absent from the `selectedUsecases` list, the system
shall return an error listing the **full set of impacted UCs** (both those already
selected and those newly identified). No routing proceeds until all impacted UCs are
selected.

*UI behaviour:* On receiving this error, the UI auto-selects all impacted UCs,
pre-populates each SG's KV instances from DB (UC-filtered for the expanded selection),
and re-presents them to the user. The user may adjust KVs or leave them as-is, then
re-calls the same create-usecases API with the expanded `selectedUsecases` list and all
SGs from all impacted UCs present in the SG map (each with KVs or `[]`).

At all times, every SG in the routing scope must appear in the API's SG map with KVs
or an empty array before routing can begin (FR-API-03).

#### FR-DEL-03: Affected UCs marked for deletion
Once FR-DEL-02 and FR-API-03 both pass, the system shall mark every UC that contained
the deleted component as **pending deletion**. These are presented to the user as "UCs
to be deleted."

#### FR-DEL-04: New UCs created from broken paths
After marking affected UCs for deletion, the routing algorithm runs DFS on the
remaining graph (after the component is removed). New UCs are created for each valid
multi-SG path in the resulting broken graph.

**Single-SG UCs are NOT created by the auto workflow.** If a broken path produces
an isolated SG that still carries a non-empty effective KV instance set (from the
API input), the SG shall surface as an orphan warning in Phase 10 with a hint
suggesting the user create a single-SG UC via the manual workflow
(`create-manual-usecase`). See FR-VAL-01 for the hint code
`ARC-ROUTING-ORPHAN-SG-HAS-KVS`.

**Rationale:** auto workflow always produces multi-SG paths that represent a
routing chain. A single-SG "path" has no routing meaning at algorithm level. The
manual workflow exists precisely to let the user declare a stand-alone UC around
one SG when that is the intent.

#### FR-DEL-05: User option to keep a deletion-marked UC
The user may choose to preserve a UC that is pending deletion. When preserved, the
system shall update that UC's SG set and subgraph-pair set to contain only the
components that still exist in the graph (removing the deleted component's pair entry
and any SGs that became unreachable). The UC's status shall be set to **Disconnected**.

---

### 3.10 Extension Scenario (New SGs/Links)

#### FR-EXT-01: New SGs are seeds and require API map entry
New SGs — those present in the DB but not yet a member of any UC — are identified when
they appear in the API's SG map. The system queries the DB for those SGs' intra-usecase
links to enable DFS traversal. A new SG is automatically a seed (FR-CONE-02). Its
KV instances come from the API input (mandatory per FR-KV-03); no SGKV DB fallback.

#### FR-EXT-02: New paths discovered and presented as Unstaged
The DFS algorithm traverses through new SGs and any new links to discover new paths
that include previously-unrouted SGs. Each discovered path is created as an UNSTAGED
UC and presented to the user for review.

#### FR-EXT-03: User selects which new UCs to stage
After reviewing the discovered Unstaged UCs, the user may stage any subset of them for
commit. The remainder are discarded. If discarding a UC would leave orphan SGs, the
system warns the user per FR-VAL-01 (warn + delete-orphans option, not a block).

---

### 3.11 Stage API — Orphan Handling

#### FR-STAGE-01: Orphan detection after staging
When the user calls the stage API and selects a subset of UCs to keep, the remaining
unstaged UCs are removed from `edit_actions`. If any SG, intra-usecase link, or
subsystem is now **unique to the removed unstaged UCs** (i.e., not referenced by any
committed UC or remaining staged UC), it becomes orphaned.

The system shall detect all such orphaned components and return them to the UI
immediately. The UI presents the same two options as FR-VAL-01:

- **Delete orphans:** Apply FR-VAL-01's deletion mechanism (STAGED DELETE for committed
  components; remove `edit_actions` entry for new components).
- **Decline and continue editing:** Leave the orphaned components in place. The user
  continues in the same edit session — making graph changes, re-calling
  `create-usecases`, staging new UCs — until the issue is resolved. The commit-time
  check (I5) is the final gate.

---

### 3.12 KV Persistence at Commit Time

#### FR-KV-COMMIT-01: New KVs added to SGKV at commit
When a routing session is committed, the system shall write any SGKV instances from the
API input that are not already represented in that SG's SGKV DB records as new SGKV
entries.

#### FR-KV-COMMIT-02: Existing SGKVs are not deleted at commit
Existing SGKV records are never deleted at commit time. Another UC (not selected in the
current session) may depend on them. *Rationale:* Consistency across sessions.

#### FR-KV-COMMIT-03: KV cleanup at download-file time
During the download-file workflow, the system shall validate that every SGKV record for
every SG is referenced by at least one committed UC's GKV. SGKV records not referenced
by any UC are removed at this stage.

---

### 3.13 UC Connectivity Status

#### FR-STATUS-01: Connected is the default for auto-routing
Every UC created by the auto-routing algorithm (FR-UC-02) begins with status
**Connected**.

Manual UCs (FR-UC-01) may begin with status **Connected** or **Disconnected** depending
on whether every pair in the UC has data-link coverage — see FR-UC-01's "Manual UC
initial status" paragraph.

#### FR-STATUS-02: Disconnected UC transitions

A UC transitions to **Disconnected** in either of these cases:

(a) The user explicitly chooses to preserve it after a link or SG deletion broke one
    or more of its pairs (FR-DEL-05).

(b) A data-link supporting one of the UC's pairs is deleted **while a control-link
    between the same SGs remains** — the pair is downgraded from data-link-covered
    to control-link-only. This transition is **automatic**; a warning is emitted so
    the user can review and, if the control-link retention was unintended, also
    remove it. This case typically occurs only when the user forgot to delete the
    control-link alongside the data-link.

Disconnected UCs satisfy the orphan check (FR-VAL-01) for their member SGs — those
SGs are considered "in a valid UC."

For the reverse transition (Disconnected → Connected), see FR-STATUS-04.

#### FR-STATUS-03: Disconnected UCs cannot be created by routing
The routing algorithm never directly creates a Disconnected UC. Disconnected UCs arise
only from user preservation of deletion-affected UCs (FR-DEL-05), or from manual
UC creation (FR-UC-01) when the user explicitly constructs a UC with missing links.

#### FR-STATUS-04: Disconnected UC transition to Connected
During a routing session, after DFS path discovery completes, the system shall evaluate
each Disconnected UC whose SG members are within the routing scope. Evaluation runs in
two steps: (1) direction correction, then (2) coverage check.

**Step 1 — Direction correction (control-link-held pairs only):**

For each pair `(A, B)` in the Disconnected UC's pair set:

- If an intra-usecase data-link exists in direction A→B → the stored pair matches;
  no correction. Proceed to coverage check.

- If an intra-usecase data-link exists in direction B→A (opposite of the stored pair)
  **AND** an intra-usecase control-link is currently present between A and B (i.e.,
  the pair is currently held together by the control-link fallback per FR-UC-01
  step 4) → the stored pair shall be **corrected** to `(B, A)`:
  - Recorded as an UPDATE to the UC's pair set (source=AUTO_ROUTING).
  - The control-link that was holding the pair is reassociated with the corrected pair
    — same UC, same link, updated pair direction.
  - After correction the pair is data-link covered in Step 2.

- Otherwise (no data-link at all in either direction, OR opposite-direction data-link
  exists but no control-link is present) → **no correction**. The pair's stored
  direction is left as-is; Step 2 will find it uncovered by data-link and the UC will
  remain Disconnected.

*Why control-link presence gates the correction:* A control-link has no inherent
direction — the direction stored in the pair set was chosen by the smaller-SG-ID rule
at pair-creation time (FR-UC-01 step 4). That choice is arbitrary. A data-link's
direction is not arbitrary. When a data-link appears alongside a control-link-held
pair, the data-link's direction becomes authoritative and the pair is corrected.
Pairs originally derived from a data-link that has since been deleted follow the
deletion scenario (FR-DEL-01..05), not this rule.

**Step 2 — Coverage check:**

A pair `(A, B)` (possibly corrected in step 1) is **covered** if a traversable intra-
usecase path exists from A to B using only direct intra-usecase data-links, or passing
exclusively through transparent bridge SGs (IsMdf=true per FR-MDF-01) as intermediate
nodes.

- A path from A to B that traverses regular non-bridge SGs not present in the UC's
  existing pair set does **not** count as coverage.
- Partial coverage (some pairs covered, others not) does **not** trigger conversion;
  the UC remains Disconnected.

If **all** pairs in the Disconnected UC are covered, the system shall:
1. Transition the UC's status from Disconnected to **Connected**.
2. Update the UC's SG set to include any transparent bridge SGs that participated in
   the newly covered paths.
3. Update the UC's pair set to include any new (source_sg, dest_sg) pairs introduced by
   those bridge-mediated traversals.
4. Report this UC in the routing session result as an **updated** UC (same identity;
   not deleted and recreated).

*This rule runs at Phase 3 (Half A) independently of collision handling. By the time
Phase 9 Classification evaluates FR-DUP-03(a)/(b1) and FR-DUP-04, any Disconnected →
Connected transitions have already been applied — Phase 9 sees the post-transition
`type` when classifying candidates.*

---

## 4. Invariants

**I1 — GKV uniqueness:** No two UCs in the same file may have identical GKVs, regardless
of `type`. Same-GKV collisions between candidates (whether two new paths in the same
routing pass, or a new path vs an existing DB UC) are resolved via FR-DUP-03(a)
exact-match no-op, FR-DUP-03(b1) identity-preserving interior extension silent
auto-update, or FR-DUP-04 user-choice. In manual mode the collision rule is
suppressed — manual creation emits one UC at a time and hits FR-DUP-03(a) exact-match
no-op if the same GKV already exists. **EC UCs (`type=EC`) are subject to the same
uniqueness rule** as Connected/Disconnected UCs — a coincidental same-GKV collision
between an EC UC and a Connected/Disconnected UC (or between two EC Bridges from
different EC connections) surfaces via FR-DUP-04. Bridge UC identity keys off `gkv`
for uniqueness; `(ecConnectionLinkId, leftSg, rightSg)` remains as metadata for the
FR-EC-06 deletion cascade but does not grant uniqueness independence.

**I2 — Subgraph-pair completeness:** Every SG pair (A, B) recorded in a UC's
`use_case_subgraph_pairs` must also have both A and B present in the UC's
`use_case_subgraphs`. (Inherited from schema redesign invariant I1.)

**I3 — GKV derivation:** The GKV stored on a UC equals the union of all KV pairs from
the specific SGKV combination that was active at the time the UC was created or last
re-routed. (Historical record; does not auto-update if SGKVs change after the UC is
created.)

**I4 — No structural deletion for KV changes:** A KV-only change in a routing session
never deletes or modifies an existing UC record.

**I5 — Orphan-free commit:** A commit is invalid if any SG in the file is not a member
of at least one UC (Connected or Disconnected) with a non-empty GKV, or if any intra-
usecase link (data-link OR control-link) is not present in any UC's pair set, or if
any subsystem contains no SG that is a member of any UC. Enforced at commit time by
FR-COMMIT-01(c) — the orphan-detection safety net.

**I6 — SGKV internal consistency:** Each SGKV instance (from DB or from the API input)
must contain at most one KV pair per Key Definition. An SGKV with two Values for the
same Key is malformed and shall be rejected at write time.

**I7 — Pair-link presence:** An SG pair `(A, B)` in a UC's `use_case_subgraph_pairs`
may exist only if at least one intra-usecase link (data-link or control-link) is
currently present between A and B in the graph. When the last link between A and B is
deleted, the pair entry is removed as part of the deletion scenario (FR-DEL-01..05).
This invariant underpins the FR-STATUS-04 Step 1 direction-correction rule — the
control-link-presence check is a state-based test that the pair is currently held
together by a control-link, at which point the pair's direction is not authoritative
and may be corrected by an appearing data-link.

---

## 5. Non-Functional Requirements

**NFR-PERF-01:** The routing algorithm shall complete in under 100ms for a graph of up
to 30 subgraphs with up to 50 intra-usecase links.

**NFR-CONSIST-01:** All UC creation, deletion, and staging writes within a routing
session shall occur within a single database transaction (provided by the edit-session
UnitOfWork).

**NFR-STAT-01:** The routing API is stateless at the HTTP layer. All session state is
held in the `edit_actions` / edit-session tables.

---

## 6. Out of Scope

- **Nested usecase preservation** across sessions — deferred.
- **MDF V2 implicit intermediate subgraphs** — deferred.
- **UI/UX implementation details** — not part of this spec.
- **Concurrent routing sessions on the same file** — out of scope; single-session model.
- **Control links** — DFS routing is driven by data links only; control links are not
  traversed by the routing algorithm. Their presence in a UC follows the same
  subgraph-pair ownership model. Exception: in manual UC creation (FR-UC-01 step 4),
  control links may be used to derive SG pairs for SGs that have no intra-usecase data
  links.

---

## 7. Open Questions

**OQ-1 — Multi-KV expansion: RESOLVED (2026-06-01)**
Cartesian product model with conflict detection applies (FR-DFS-05 through FR-DFS-09).
GKV cannot contain multiple values for the same Key. Multi-SGKV SGs produce multiple UC
candidates; combinations where any Key has different Values from different SGs are
discarded. If no valid combination exists for a path, it is a path-level conflict error.

**OQ-2 — Routing scope for KV-only changes: RESOLVED (2026-06-01)**
Cone-based DFS (option a). The cone is bidirectional from seed SGs (FR-CONE-04).
DFS runs within the cone only; existing UCs outside the cone are untouched (FR-LIFE-01).
Decision rationale: better performance at scale, clear separation of concerns between
change detection and routing, aligns with NFR-PERF-01, and the user's description of
seed + cone as distinct concepts maps naturally to two separate services.

**OQ-3 — Disconnected UCs and orphan check: RESOLVED (2026-06-01)**
A SG that is a member of any UC — including Disconnected UCs — is not an orphan.
FR-VAL-01 has been updated to explicitly state this. A Disconnected UC satisfies
orphan membership for its SGs.
