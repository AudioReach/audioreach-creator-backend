<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Legacy Test Mapping — SGKV-Routing-Tests-Design-Agnostic

**Purpose:** Map each test in `C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md` to a target phase / LLD in the new design. Used by the implementation plan's test suite to guarantee coverage of scenarios validated by the legacy tool.

**Source:** 71 tests total (T1-001 through T1-036 minus T1-028; T2-001 through T2-068 minus T2-054/55/56/63/64).

**Terminology bridge:**
- Legacy "SG" → New "Subgraph" (unchanged conceptually)
- Legacy "GKV / KvSet" → New "GKV (union of KVs from SGKV combinations)"
- Legacy "SelectedKvs" filtering → New "API-provided `activeSubgraphs.sgkvInstances`" + FR-KV-02/03 flow
- Legacy "manual usecase" → New "Disconnected UC (FR-UC-01 or FR-STATUS-02)"
- Legacy "auto-fix" → New "FR-VAL-01 delete-orphans workflow" (client-side; not routing-owned)
- Legacy "MDF / transparent bridge" → New "IsMdf SG (FR-MDF-01)"
- Legacy "EC / edge-connection" → New "EC routing (LLD5, FR-EC-01..06)"

---

## 1. Contradictions already resolved (adapt tests before folding in)

| # | Legacy behavior | Our resolution | Affected tests |
|---|---|---|---|
| C1 | Cycle → blocking `CycleDetectedError` | Warning (`ARC-ROUTING-CYCLE-DETECTED`); path emitted as leaf per FR-DFS-04 | T1-004, T2-014, T2-015 |
| C2 | Disconnected → Connected on link addition | Kept legacy behavior (FR-STATUS-04) — conversion allowed | T1-016, T2-036, T2-068 (tests remain valid) |
| C3 | Regular + overlapping Disconnected same GKV → blocking error | Superseded by C5 (2026-08-19) — no auto-block; user chooses via FR-DUP-04 | T1-035, T1-036 (now under C5) |
| C4 | Zero-KV head prepend adds new UC, existing unchanged | Merge per FR-DUP-03(b1) identity-preserving interior extension — **contradiction retained; T2-047 needs adaptation** | T2-047 |
| C5 | Same-GKV collisions auto-merge or auto-error | Superseded by FR-DUP-04 (2026-08-19): all same-GKV collisions (except FR-DUP-03(a) exact-match no-op and FR-DUP-03(b1) identity-preserving interior extension silent auto-update) require user choice via `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` blocking issue with FixOptions | T1-008, T1-012, T1-029, T1-030, T1-031, T1-032, T1-033, T1-034, T1-035, T1-036, T2-002, T2-018, T2-023, T2-024, T2-025, T2-026, T2-027, T2-028, T2-033, T2-040, T2-043, T2-048, T2-049, T2-050 |

**Adaptation summary:**
- **C1 tests:** re-express as `expect: warning ARC-ROUTING-CYCLE-DETECTED, path emitted as leaf, HTTP 200`. Do NOT expect blocking.
- **C4 test (T2-047):** re-express as `expect: existing full-span UC UPDATED with new head SG (FR-DUP-03(b1) identity-preserving interior extension)`. Do NOT expect a new separate UC.
- **C5 tests:** re-express as two-step tests. Step 1: `create-usecases` returns `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` (HTTP 422) with the appropriate FixOptions (`Path A`/`Path B`/`Merge` for two new paths, `Keep existing`/`Replace with new`/`Merge` for new-vs-existing, no `Merge` for disjoint variants). Step 2: user applies the fix option matching the legacy expected outcome (e.g., `Merge` reproduces the legacy auto-merge; the individual `Path A`/`Path B` options were never legacy-testable). For the tests that legacy blocked (T1-012, T1-029, T1-030, T1-033, T1-034, T1-035, T1-036, T2-023, T2-024, T2-025, T2-040, T2-043): step 2 uses a specific user choice; the blocking-error assertion in the legacy test becomes an assertion on the blocking issue emitted at step 1.

---

## 2. Scope decisions

**In scope:**
- All T1 tests
- All T2 tests except skipped numbers
- EC tests (were previously excluded; brought back in scope 2026-08-10 — see LLD5)

**Out of scope (deferred per overall-design §11):**
- None. EC was previously excluded but is now in scope with LLD5 (`lld5-ec-routing.md`).
- MDF single-rule (FR-MDF-01) is in scope; folded into plan. MDF V2 implicit
  intermediates are still deferred.

**Skipped in source file** (numbers absent from legacy catalogue):
T1-028, T2-054, T2-055, T2-056, T2-063, T2-064 — no test content to map.

**Total in initial delivery: 65 tests** (71 total − 6 source-skipped).

**Legacy features requiring adaptation:**
- **Auto-fix workflow** (T1-020, T1-024, T2-029, T2-030, T2-031, T2-032): our design surfaces autofix hints via warning codes (`ARC-ROUTING-ORPHAN-*`), but the *actual delete-orphan action* is a separate client-driven API call, not called by routing. Tests should split into (a) routing call returns correct warnings, (b) subsequent delete-orphan call clears them. The second half is out of routing's scope.

---

## 3. Test → Phase mapping

### 3.1 Phase 1 · PreValidationService (LLD1)

Legacy validation and structural checks that run before any routing.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-007 | Island node → non-blocking warning | FR-PREVAL-02 | Rename error → `ARC-ROUTING-ISLAND-DETECTED` |
| T1-011 | Orphan nodes inside subsystem (per-node) | FR-VAL-01 (Phase 10) | Note: per-node reporting matches Phase 10 semantics |
| T1-020 | Empty subsystem blocks + auto-fix | FR-VAL-02 (Phase 10) | Split into: (a) routing returns `ARC-ROUTING-ORPHAN-SUBSYSTEM` warning; (b) delete-orphan flow (out of routing scope) |
| T1-024 | Stale intra-usecase link (link references deleted SG) | FR-PREVAL-01 | Blocking `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY`; auto-fix out of routing scope |
| T2-019 | Multiple isolated nodes + inter-usecase link not traversable | FR-PREVAL-02 + FR-DFS-02 | Island warnings + inter-usecase link excluded from adjacency |
| T2-020 | Island nodes non-blocking warnings | FR-PREVAL-02 | **Adaptation required:** legacy expects 3 UCs including 2 single-SG UCs `{A:1}[SG1]` and `{B:2}[SG2]`. Per updated FR-DEL-04, auto workflow does NOT create single-SG UCs. Adapted expected result: 1 UC `{C:3}[SG3, SG4]` + 2 `ARC-ROUTING-ISLAND-DETECTED` warnings + 2 `ARC-ROUTING-ORPHAN-SG-HAS-KVS` hints (one per isolated SG with KVs). User must invoke `create-manual-usecase` to create the two single-SG UCs. |
| T2-022 | Orphaned pass-through after link deletion | FR-VAL-01 (Phase 10) | Blocking at commit (I5), warning at routing time |
| T2-031 | Delete hub node → 4 stale links | FR-PREVAL-01 | Each stale link → `ARC-ROUTING-PREVAL-DATALINK-INTEGRITY` per FR-PREVAL-01 |
| T2-032 | Container boundary meta-links → 7 stale links | FR-PREVAL-01 | Same treatment; adapt to our subsystem-link model (chain resolver runs first) |
| T2-051 | Two transparent-bridge KV violations → collateral blocking | FR-MDF-01 (folded into plan) | Blocking `ARC-ROUTING-MDF-01` |

### 3.2 Phase 4 · KvResolutionService (LLD1)

KV-driven routing key selection, filtering, and API-input override.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-002 | KV conflict same key blocks | FR-DFS-06 (Phase 8) | Actually enforced at Phase 8; Phase 4 just carries multiple SGKV instances forward |
| T1-003 | Multi-KV Cartesian → 2 UCs | FR-DFS-05 (Phase 8) | Same |
| T1-013 | Add new SGKV → Cartesian expansion, prior UC unchanged | FR-KV-03 + FR-DFS-05 | Prior UC stays UNCHANGED per FR-LIFE-01 |
| T1-025 | Inactive KV excluded via SelectedKvs | FR-KV-03 | API-input replaces DB baseline; excluded KVs simply not in `activeSubgraphs` payload |
| T2-004 | Cartesian 2×2, inactive KV filtered | FR-KV-03 + FR-DFS-05 | As-is |
| T2-005 | Cartesian dedup + session KV addition | FR-KV-03 + FR-DFS-05 + FR-LIFE-01 | Existing UCs UNCHANGED where structurally compatible |
| T2-006 | SelectedKvs contracts Cartesian | FR-KV-03 | As-is |
| T2-007 | Multi-key tuples fan-out fan-in → 11 UCs | FR-DFS-05 | Cartesian across multi-tuple SGKV instances |
| T2-008 | Three heads + KV modification | FR-KV-03 + FR-LIFE-01 | Existing survives per FR-LIFE-01 |
| T2-013 | Session overlay 3 KV edits transform all UCs | FR-KV-03 + FR-LIFE-01 | KV-only session; existing survives |

### 3.3 Phase 5 · SeedDetectionService (LLD1)

Seed identification from graph edits and API input.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-009 | Session KV addition visible to routing | FR-CONE-01 | KV differs from baseline → SG becomes seed |
| T1-026 | Isolated scope, no UC selection, scoped nodes as seeds | FR-CONE-05 (empty selected UCs → all API SGs seeds) | As-is |
| T2-058 | Isolated scope with auto-exposed links + KV deselection | FR-CONE-01/05/06 | Combined seed scenarios |
| T2-059 | Isolated scope, auto-exposed link → nested sub-path | FR-CONE-03 + FR-CONE-06 | Out-of-context SG in API → seed |
| T2-060 | Isolated scope, delete shared link, 3 impacted unselected UCs | FR-DEL-02 (Phase 2) | Actually a Phase 2 test; FR-DEL-02 fail-fast |

### 3.4 Phase 6 · ConeComputationService (LLD1)

Bidirectional cone expansion, scope boundary, cone completeness.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-021 | Missing KV selection entry (SG in cone but not in API map) | FR-API-03 | Blocking `ARC-ROUTING-PREVAL-CONE-INCOMPLETE` |
| T1-022 | Unselected UC impacted by modification | FR-DEL-02 (Phase 2) | Cross-reference — this fits DeletionScope, not Cone |

### 3.5 Phase 7 · DfsRoutingService (LLD2)

Path enumeration via DFS.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-001 | Minimal 2-node linear path → 1 UC | FR-DFS-01/03 | As-is |
| T1-004 | Cycle → error | FR-DFS-04 | **C1 adaptation:** WARNING not blocking |
| T1-005 | Fan-out → 2 UCs | FR-DFS-01/03 | As-is |
| T1-006 | Inter-usecase link excluded → 2 independent scopes | FR-DFS-02 | As-is |
| T2-001 | Two-head shared fork, GKV dedup → 4 UCs | FR-DFS-01 + FR-DFS-05 | Multiple root SGs, fan-in |
| T2-002 | Diamond, existing updated, new branch added | FR-DFS-01 + FR-DUP-04 (Phase 9) | **C5:** Diamond → user-choice with `Keep existing` / `Replace with new` / `Merge`; user picks `Merge` to reproduce legacy behavior |
| T2-014 | 4-node cycle at depth | FR-DFS-04 | **C1:** WARNING not blocking |
| T2-015 | Session adds link creating 4-node cycle | FR-DFS-04 | **C1:** WARNING not blocking; existing UC survives |
| T2-016 | Three scopes, two inter-usecase links, head/tail detection | FR-DFS-02 + FR-CONE-07 | Inter-usecase link bounds scope |
| T2-017 | Replace intra-usecase with inter-usecase link → scope splits | FR-DFS-02 + FR-DEL-04 | Combined with deletion scenario |
| T2-018 | Add intra-usecase link across inter-usecase boundary | FR-DFS-02 + FR-DUP-04 | **C5:** scopes merge, nested sub-paths preserved; overlapping candidates → user-choice |

### 3.6 Phase 8 · CombinationExpansionSvc (LLD2)

Cartesian expansion, conflict detection, GKV aggregation.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-002 | KV conflict same key blocks entire routing | FR-DFS-08 | All combos conflict → blocking |
| T1-003 | Multi-KV Cartesian → 2 UCs | FR-DFS-05 | As-is |
| T2-009 | Cartesian conflict, existing survives | FR-DFS-08 + FR-LIFE-01 | Blocking; existing preserved |
| T2-010 | Deep conflict, partial multi-key | FR-DFS-08 | As-is |
| T2-011 | Modification causes previously compatible KV to conflict | FR-DFS-06/08 | Blocking |
| T2-012 | Link addition connects chains, causes conflict | FR-DFS-06/08 | Blocking |
| T2-023 | Cartesian branch matches unmodified existing UC on disjoint path | FR-DUP-04 (Phase 9) | **C5:** was blocking `ARC-ROUTING-DUP-01`; now blocking `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` with `Keep existing` / `Create new UC` options (disjoint) |
| T2-024 | Composite path duplicating existing key set | FR-DUP-04 | **C5:** same treatment as T2-023 |
| T2-025 | KV deselection collapses key set → duplicates existing | FR-DUP-04 | **C5:** same treatment as T2-023 |
| T2-046 | KV addition to intermediate node, existing unchanged | FR-DFS-05 + FR-LIFE-01 | Structure intact → existing preserved |

### 3.7 Phase 2 · DeletionScopeService (LLD4)

Impact detection, fail-fast, multi-path pair survival, single-path reconstruction.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-014 | Link deletion breaks path → old UC removed, 2 new UCs | FR-DEL-01/03 + FR-DEL-04 (main DFS) | Existing UC marked for deletion; reconstruction DFS may find alternate, else main DFS produces sub-path UCs |
| T1-022 | Unselected UC impacted → error | FR-DEL-02 / FR-VAL-04 | Blocking `ARC-ROUTING-DEL-02` |
| T2-003 | Deletion + addition mixed result → 3 scopes | FR-DEL-01/03 | Multiple deletions and additions in one session |
| T2-030 | Session cascade deletes → empty container | FR-VAL-02 (Phase 10) | Delete flow orphans surface as warnings |
| T2-033 | Insert + bypass, shared hub → two UCs updated | FR-DEL-01/06 + FR-DUP-04 | **C5:** multi-path reconstruction; overlapping same-GKV candidates → user-choice for non-identity-preserving cases |
| T2-034 | Disconnected UC — SG deleted, link deleted, 3 impacts | FR-DEL-01/03 | Applies to Disconnected UCs equally (per requirements) |
| T2-060 | Isolated scope, delete shared link, 3 impacted unselected | FR-DEL-02 | Fail-fast on unselected impacted UCs |
| T2-061 | Multi-module port reroute → FR-41 gate | FR-DEL-02 | Blocking on unselected impacted UC |
| T2-062 | Bridge cascade delete → orphans | FR-DEL-01 + FR-VAL-01 | Cascading deletion + orphan warnings |
| T2-067 | Parallel transparent bridges, delete-one preserves UC | FR-DEL-06 multi-path survival | Two bridge paths → pair survives when one deleted (multi-path UC) |

### 3.8 Phase 3 · DisconnectedTransitionSvc (LLD4)

Direction correction + Disconnected → Connected transition.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-015 | Disconnected UC unchanged when new routed path discovered | FR-STATUS-04 (no transition applicable) + FR-LIFE-01 | As-is |
| T1-016 | Disconnected UC becomes Connected on link addition | FR-STATUS-04 Step 2 | As-is (C2 kept legacy behavior) |
| T2-036 | Partial/full/indirect connection scenarios | FR-STATUS-04 Step 2 | Partial and indirect don't trigger; full via bridge does |
| T2-068 | Bridge connects Disconnected → Connected → bridge removed → cascade | FR-STATUS-04 + FR-DEL-01 | As-is |

### 3.9 Phase 9 · Classification (folded into plan)

Duplicate detection, merge, no-op, and type conflicts.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-008 | Existing UC becomes nested sub-path (unchanged) | FR-LIFE-01 + FR-DUP-03(b1) or FR-DUP-04 depending on endpoints | **C5:** if new path endpoints match existing UC and interior grows with empty-KV SGs → FR-DUP-03(b1) silent auto-update (matches legacy "unchanged sub-path" if interior is empty-KV). Otherwise → FR-DUP-04 user-choice with `Keep existing` / `Replace with new` / `Merge`. |
| T1-012 | Duplicate GKV, disjoint paths → error | FR-DUP-04 | **C5:** blocking `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` with `Path A` / `Path B` (no Merge) |
| T1-029 | Two disjoint Disconnected UCs, same GKV → error | FR-DUP-04 | **C5:** same treatment as T1-012 (type does not matter) |
| T1-030 | Committed Disconnected + new disjoint Disconnected, same GKV → error | FR-DUP-04 | **C5:** blocking with `Keep existing` / `Create new UC` (disjoint, new-vs-existing) |
| T1-031 | Two overlapping Disconnected UCs, same GKV → merged | FR-DUP-04 | **C5:** user-choice with `Path A` / `Path B` / `Merge`; legacy auto-merge → user picks `Merge` |
| T1-032 | Existing Disconnected extended by overlapping Disconnected | FR-DUP-04 | **C5:** user-choice with `Keep existing` / `Replace with new` / `Merge`; legacy auto-extend → user picks `Merge` |
| T1-033 | Regular + disjoint Disconnected, same GKV → error | FR-DUP-04 | **C5:** blocking with `Keep existing` / `Create new UC` (disjoint, no Merge) |
| T1-034 | Existing regular + new disjoint Disconnected, same GKV → error | FR-DUP-04 | **C5:** same treatment as T1-033 |
| T1-035 | Regular + overlapping Disconnected, same GKV → type conflict | FR-DUP-04 | **C5:** was blocking `ARC-ROUTING-DUP-TYPE-01`; now user-choice with `Keep existing` / `Replace with new` / `Merge` (type does not matter to collision rule) |
| T1-036 | Existing regular + new overlapping Disconnected → type conflict | FR-DUP-04 | **C5:** same treatment as T1-035 |
| T2-002 | Diamond, existing updated + new branch | FR-DUP-04 | **C5:** legacy auto-merge → user-choice with `Keep existing` / `Replace with new` / `Merge`; user picks `Merge` |
| T2-021 | Deselect head KV, existing survives, new UC created | FR-LIFE-01 + FR-DFS-09 | Existing UC UNCHANGED |
| T2-026 | Diamond link addition, two paths same key set → merge (Case A) | FR-DUP-04 | **C5:** two new paths with overlap → user-choice with `Path A` / `Path B` / `Merge`; user picks `Merge` |
| T2-027 | KV deselection fan-out GKV collapse → Case A | FR-DUP-04 | **C5:** same treatment as T2-026 |
| T2-028 | KV modification, two branches same GKV → Case A | FR-DUP-04 | **C5:** same treatment as T2-026 |
| T2-046 | KV addition to intermediate node, existing unchanged | FR-LIFE-01 | Structure intact |
| T2-047 | Zero-KV head prepend | **C4 adaptation** — FR-DUP-03(b1) identity-preserving interior extension | **New UC NOT added; existing UC UPDATED with new head SG (silent auto-update)** |
| T2-048 | KV expand + node insert → 4 nested UC outcomes | FR-DUP-04 + FR-LIFE-01 + bounded-DFS reconstruction | **C5:** overlapping paths where identity-preserving conditions don't hold → user-choice; some paths may resolve via silent FR-DUP-03(b1) |
| T2-049 | Two node insertions → nested UCs updated/unchanged | FR-DUP-04 + FR-LIFE-01 | **C5:** endpoint-anchored bounded DFS + user-choice for overlaps that break identity |
| T2-050 | Chain connect + Cartesian expansion → asymmetric nested fate | FR-DUP-04 + FR-LIFE-01 | **C5:** new UCs added, existing sub-paths preserved; overlaps require user-choice |

### 3.10 Phase 10 · OrphanValidation (folded into plan)

Orphan SGs, subsystems, and intra-usecase links.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-010 | Zero-KV path → orphan errors | FR-VAL-01 + FR-DFS-09 | Empty-GKV combinations discarded; SGs become orphans; warning |
| T1-011 | Orphan nodes inside subsystem, per-node reporting | FR-VAL-01/02 | As-is |

### 3.11 Phase 11+12 · Stager + ResponseBuilder (folded into plan)

Response shape, freshness, staleness prevention.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-027 | Three-phase path update, no accumulation | FR-LIFE-* | Each pipeline call produces fresh result; no historical accumulation |
| T2-057 | Anti-staleness across 8 sessions | Idempotency (G5) | Each session independent; discard/empty don't carry over |

---

### 3.12 EC Routing (LLD5)

EC connection detection, DFS boundary override, 3-UC generation, Bridge KV compatibility, EC bridge lifecycle. Previously excluded, brought back in scope 2026-08-10.

| Legacy test | Description | Target FR | Adaptation |
|---|---|---|---|
| T1-017 | EC generates 3 UCs (Left, Bridge, Right) | FR-EC-02/03 | As-is |
| T1-018 | EC bridge unchanged after left-domain KV addition | FR-EC-06 + FR-LIFE-01 | Existing bridge preserved; new left UC added |
| T2-037 | EC multi-KV upstream, SGR fan-out → 8 UCs | FR-EC-03 + FR-DFS-05 | Cartesian in left + bridge + fan-out on right |
| T2-038 | EC Cartesian conflict in bridge — routing halted | FR-EC-04 + FR-DFS-08 | **Adaptation required:** our LLD5 §6.2 treats Bridge KV incompatibility as a WARNING (Left/Right UCs still emit). Legacy blocked all routing. Confirm behavioral change at plan review, or update FR-EC-04 to blocking. |
| T2-039 | Two EC connections in same path → routing halted | FR-EC-05 | Blocking `ARC-ROUTING-EC-05` |
| T2-040 | EC left/right GKV collision (Case B) | FR-DUP-04 | **C5:** was blocking `ARC-ROUTING-DUP-01`; now blocking `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` with `Path A` (Left) / `Path B` (Right) / `Merge` if overlapping; disjoint variant offers `Path A` / `Path B`. EC UCs subject to unified I1 GKV uniqueness rule — no type-based exemption. |
| T2-041 | EC link deleted, right domain independent | FR-EC-06 + FR-DEL-01 | Bridge removed; left/right respond independently |
| T2-042 | EC legacy — link deletion + SG insertion coexistence | FR-EC-06 + FR-DEL-04 | Combined |
| T2-043 | EC bridge GKV equals left GKV — duplicate error | FR-DUP-04 | **C5:** was blocking `ARC-ROUTING-DUP-01`; now FR-DUP-04 user-choice per unified I1 GKV uniqueness rule (no EC exemption). Options: `Keep existing` / `Replace with new` / `Merge` if overlapping SGs; `Keep existing` / `Create new UC` if disjoint. |
| T2-044 | EC bridge SG deleted + legacy EC tail deleted | FR-DEL-01 + FR-EC-06 | Bridge/right removed on left SG deletion; right path shortens on tail deletion |
| T2-045 | EC left dual-outgoing (EC + traversable) → cross-chain regular UC | FR-EC-02 + FR-DFS-01 | Traversable branch produces regular UC; EC branch produces 3-UC set |
| T2-065 | EC right domain with transparent bridge | FR-EC-03 + FR-MDF-01 | Right path builder honors bridge transparency |

---

## 4. Tests requiring further design work (flag for plan)

These tests uncover behaviors not fully specified in the current design. They should be surfaced during plan writing.

| Legacy test | Uncovered concern |
|---|---|
| T1-007 | "Isolated scope" nomenclature — how does drag-drop UX map to routing input structure? Assumed via `activeSubgraphs` scope. |
| T2-019 | Single-node UC — does routing emit a UC for a single isolated SG with non-empty SGKV? LLD2 §5.3 says "single-SG paths not emitted." Legacy expects it. Requires plan-level decision. |
| T2-020 | Same as T2-019 — single-node UC emission when other SGs orphaned. |
| T2-030 | Cascading empty subsystem detection — is this per-call or only at commit? |
| T2-052 | Bridge insertion transparency — display path hidden vs stored path. FR-MDF-01 covers the definition but not the UI-vs-storage distinction. Add to plan. |
| T2-053 | Bridge removal + direct link restoration → 0 changes reported. Storage-path update but no UI change. |
| T2-066 | Bridge Cartesian slot semantics — one slot per bridge SG. Confirms FR-MDF-01. |
| T2-058, T2-059 | Auto-exposed links in isolated scope — is this a client-side or server-side behavior? Likely client-side pre-population of `graphEdits.addedDataLinks`. |

---

## 5. Excluded tests (source-skipped)

Not in the initial delivery because the source catalogue never defined them.

**Skipped in source file** (numbers absent):
T1-028, T2-054, T2-055, T2-056, T2-063, T2-064

**Total in initial delivery:** 71 tests total − 6 source-skipped = **65 tests to fold in**.

---

## 6. Consolidated coverage per phase (feed into plan)

| Phase | Legacy test IDs | Count |
|---|---|---|
| Phase 1 (PreValidation) | T1-007, T1-024, T2-019, T2-020, T2-022, T2-031, T2-032, T2-051 | 8 |
| Phase 4 (KvResolution) | T1-009, T1-013, T1-025, T2-004, T2-005, T2-006, T2-007, T2-008, T2-013 | 9 |
| Phase 5 (SeedDetection) | T1-009, T1-026, T2-058, T2-059 | 4 (some overlap) |
| Phase 6 (Cone) | T1-021, T1-022 | 2 |
| Phase 7 (DFS) | T1-001, T1-004, T1-005, T1-006, T2-001, T2-002, T2-014, T2-015, T2-016, T2-017, T2-018 | 11 |
| Phase 8 (CombinationExpansion) | T1-002, T1-003, T2-009, T2-010, T2-011, T2-012, T2-023, T2-024, T2-025, T2-046 | 10 |
| Phase 2 (DeletionScope) | T1-014, T1-022, T2-003, T2-030, T2-033, T2-034, T2-060, T2-061, T2-062, T2-067 | 10 |
| Phase 3 (DisconnectedTransition) | T1-015, T1-016, T2-036, T2-068 | 4 |
| Phase 9 (Classification) | T1-008, T1-012, T1-029, T1-030, T1-031, T1-032, T1-033, T1-034, T1-035, T1-036, T2-002, T2-021, T2-026, T2-027, T2-028, T2-046, T2-047, T2-048, T2-049, T2-050 | 20 |
| Phase 10 (OrphanValidation) | T1-010, T1-011, T1-020, T2-029, T2-030 | 5 |
| Phase 11+12 (Stager + Response) | T1-027, T2-057 | 2 |
| MDF bridge (folded into plan under FR-MDF-01) | T1-019, T1-023, T2-052, T2-053, T2-066 | 5 |
| EC routing (LLD5) | T1-017, T1-018, T2-037, T2-038, T2-039, T2-040, T2-041, T2-042, T2-043, T2-044, T2-045, T2-065 | 12 |

Numbers sum to more than 65 because several tests exercise multiple phases (e.g., T2-034 covers DeletionScope + OrphanValidation + Classification).

---

## 7. Handoff notes for writing-plans skill

- The test-writing tasks in the plan should cite legacy test IDs where they correspond, so implementation reviewers can verify legacy behavior is preserved.
- For contradiction-affected tests (C1, C4), the plan MUST cite the resolution in the task description so the test author writes the *adapted* expectation, not the legacy one.
- Tests flagged in §4 need small design decisions before implementation. Plan should either surface them as open questions or defer to implementation review.
- Source-skipped tests (§5) are absent from the legacy catalogue — nothing to implement.
- **T2-038 (EC Bridge KV conflict semantics)**: legacy behavior is blocking; LLD5 §6.2 makes it a warning. Confirm at plan review or update FR-EC-04.
