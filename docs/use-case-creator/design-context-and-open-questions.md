<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Auto Use-Case Creator — Design Context & Open Questions

**Purpose:** Session memory backup. Captures where the brainstorming/design conversation
left off, decisions already made, and every open item that needs user input before the
Overall Design can be written. If context is lost, load this file first.

**Owner:** Nithin Simon
**Last updated:** 2026-08-03

---

## 1. Where we are

Brainstorming skill workflow — **end of Phase 1 (requirements), pre-start of Phase 2 (design)**.

- ✅ Explored project context and existing docs
- ✅ Analyzed legacy tests (`C:\Workspaces\qact.win.8.3.qact_83_ref\SGKV-Routing-Tests-Design-Agnostic.md`)
- ✅ Requirements frozen — 4 contradictions found and resolved (see §3)
- ✅ Overall design structure agreed: **Overall Design + LLDs** (Option A)
- ✅ Algorithm architecture agreed: **Phased pipeline with RoutingContext** (Option 1)
- ⏸️ **BLOCKED** — user must resolve G1–G6 (see §7) before Overall Design writing begins

---

## 2. Source of truth documents

| Doc | Path | Status |
|---|---|---|
| Core requirements | `docs/use-case-creator/2026-06-01-auto-usecase-routing-requirements.md` | Frozen, updated for C2 + C3 |
| Extended requirements | `docs/use-case-creator/2026-06-02-auto-usecase-routing-requirements-extended.md` | Frozen, §8 table updated |
| Edit-CRUD overall design | `docs/edit-crud/overall-design.md` | Read for context |
| Edit-CRUD foundation (LLD1) | `docs/edit-crud/foundation.md` | Read for context |
| Edit-CRUD module write path (LLD2) | `docs/edit-crud/module-write-path.md` | Read for the write pattern this feature will follow |
| Existing swagger | `docs/swagger-api.json` | `/create-usecases` endpoint defined, controller stubbed |
| Existing controller stub | `packages/api/src/presentation/rest/modules/project/project.controller.ts:927` | `throw NotImplementedException('createUsecases is not implemented yet')` |
| Existing request DTO | `packages/api/src/presentation/rest/modules/project/dto/create-usecases-request.dto.ts` | Missing manual-mode fields; has legacy `excluded*` fields |
| Existing response DTO | `packages/api/src/presentation/rest/modules/project/dto/create-usecases-response.dto.ts` | Minimal — needs enrichment |
| CLAUDE.md (project rules) | `.ai/context/CLAUDE.md` | Architecture rules |
| Reference implementation | `packages/core/src/application/usecase-designer/spf-module/patch/patch-spf-module.handler.ts` | Read for handler/pattern reference |

---

## 3. Contradictions found (resolved)

| # | Topic | Legacy test says | Our requirement said | **Resolution** | Docs changed |
|---|---|---|---|---|---|
| C1 | Cycle detection | Blocking error (`CycleDetectedError`); no UCs emitted | Warning; path emitted as leaf (FR-DFS-04) | **Keep ours** | none |
| C2 | `ISLAND` → `LINKED` | Converts when link restored (T1-016, T2-036, T2-068) | Permanent `ISLAND` (§8 table) | **Take tests'** — conversion allowed | Added `FR-STATUS-04` in core; updated `FR-STATUS-02`, `FR-DUP-03`, `I1`; updated §8 table in extended reqs |
| C3 | `LINKED` + overlapping `ISLAND` same GKV | Blocking error (T1-035, T1-036) | Merge per FR-DUP-02 (type-agnostic) | **Superseded 2026-08-19 by FR-DUP-04** — same-GKV collisions surface user-choice, type does not matter | Historical: added `FR-DUP-TYPE-01`; updated `FR-DUP-02` with same-type constraint; updated `FR-DUP-03`. Now all replaced by FR-DUP-04 |
| C4 | Zero-KV head prepend (T2-047) | Adds new UC, existing unchanged | FR-DUP-03(b1) identity-preserving interior extension silent auto-update | **Keep ours** — GKV is UC identity; silent auto-update is correct | none |

---

## 4. Structural decisions already made

- **Design doc layout (Option A):**
  ```
  docs/use-case-creator/design/
  ├── overall-design.md
  ├── lld1-kv-resolution-cone.md
  ├── lld2-dfs-core.md
  ├── lld3-duplicate-orphan.md
  ├── lld4-deletion-extension.md
  ├── lld5-ec-mdf.md
  └── lld6-persistence-api.md
  ```

- **Feature folder:** `packages/core/src/application/usecase-designer/routing/` (renamed
  from `auto-routing`; serves both auto and manual UC creation).
- **Single public facade:** `RoutingEngine.run(routingInput, uow): Result<RoutingOutcome>`.
  Handlers depend only on this class; everything else in the folder is internal.
- **Algorithm architecture (Option 1) — phased pipeline of stateless services accumulating a `RoutingContext`. Handler-orchestrated pre-dependency runs before phase 1:**

  **Handler pre-step (both `create-usecases` and `create-manual-usecases`):**
  - Invoke `IChainResolver.resolveAllChains(uow)` — SLS + CSLS chain resolution per
    FR-PREVAL-03 (references subsystem-links spec FR-VL-26 / FR-VL-30). The resolver
    writes STAGED `data_link`/`control_link` `edit_actions` into the session and
    returns success/failure only. On failure → 422, routing aborts. On success →
    RoutingEngine.run is invoked. **RoutingEngine reads links via normal repos with
    the edit-crud overlay; it has no `resolvedChains` field and no coupling to the
    chain-resolution feature.** For raw-mode projects (common case) the resolver is
    a fast no-op.

  **Routing pipeline (after chain resolution, graph-edit/selected-UC snapshot loading,
  FR-API-07 addition-side closure, scope derivation, and FR-API-03 completeness
  validation succeed) — reorganized into three halves for fail-fast on FR-DEL-02:**

  **Half A — Resolve fate of existing UCs (pre-routing, cheap):**
  1. `PreValidationService` (FR-PREVAL-01/02)
  2. `DeletionScopeService` (FR-DEL-01/02/06) — discovers file-wide UCs requiring
     deletion, structural mutation, or type degradation; runs bounded-DFS multi-path
     checks within the effective routing scope; fails fast with full affected and
     missing ID sets, then enforces FR-API-07 deletion-side closure after FR-DEL-02
     passes. Populates `context.markedForDeletion`.
  3. `IslandTransitionService` (FR-STATUS-04) — `ISLAND` → `LINKED` transitions
     + direction correction.

  **Half B — Produce new UCs from input GKVs (routing proper):**
  4. `KvResolutionService` (FR-KV-01/02/03)
  5. `SeedDetectionService` (FR-CONE-01/02/03/05/06)
  6. `ConeComputationService` (FR-CONE-04/07)
  7. `DfsRoutingService` (FR-DFS-01..04)
  8. `CombinationExpansionSvc` (FR-DFS-05..09)
  9. `ClassificationService` (FR-DUP-03(a)/(b1), FR-DUP-04, FR-LIFE-01)

  **Half C — Validate and emit:**
  10. `OrphanValidationService` (FR-VAL-01/02/03)
  11. `RoutingChangeStager` (writes via LLD1 `PendingChangeWriter` through domain-verb
      edit-repo ports)
  12. `ResponseBuilder`

  **Rationale for the split:** Phases 2 and 3 (Half A) depend only on `graphEdits`,
  `islandUcs`, and existing UC/link state — no routing output needed. Running them
  first enables fail-fast on FR-DEL-02 (avoids ~60ms of wasted DFS) and cleanly
  separates "resolve existing" from "produce new."

  EC (FR-EC-*) and MDF (FR-MDF-01) slot in as additional phases in LLD5.

---

## 5. End-to-end workflow (agreed understanding)

```
1. POST /projects/{id}/start-session          { mode: DESIGNER }
2. Graph edit APIs (patch-module, add-module, delete link, …)
     → produces STAGED source=MANUAL edit_actions
3a. POST /projects/{id}/create-usecases                    ← AUTO ROUTING
     → handler pre-step: SLS/CSLS chain resolution (FR-PREVAL-03 → subsystem-links
       FR-VL-26/30). Incomplete chains → 422. Complete chains → resolved as
       MANUAL/STAGED data_link / control_link edit_actions.
     → reads effective state (committed + STAGED overlay)
     → runs pipeline; writes results:
        · New UCs: CREATE, source=AUTO_ROUTING, UNSTAGED
        · Marked-for-deletion UCs: DELETE, source=AUTO_ROUTING, UNSTAGED
        · `ISLAND`→`LINKED` transitions: UPDATE, source=AUTO_ROUTING, UNSTAGED
        · Direction corrections on `ISLAND` pairs (FR-STATUS-04 Step 1)
     → SGKVs from API input are used as **in-memory input only** during routing.
       Persistence to the `sgkv` table happens at commit time per FR-KV-COMMIT-01,
       not inside the routing transaction.
     → returns routing report + groupId
3b. POST /projects/{id}/create-manual-usecases             ← MANUAL UC (NEW ENDPOINT)
     → handler pre-step: SLS/CSLS chain resolution (same as 3a). Manual pair
       derivation depends on complete DataLinks / ControlLinks.
     → server discovers pairs by querying data-links / control-links in DB
     → creates one UC (`LINKED` if all pairs data-link-covered, else `ISLAND`)
     → returns UC identifier + groupId + warnings (isolated SGs, etc.)
4. POST /projects/{id}/stage-changes           { by, ids }
     → flips UNSTAGED → STAGED for selected UCs
5. (loop back to 2, 3a, or 3b as needed)
6. POST /projects/{id}/commit-changes
     → FR-COMMIT-01 safety net runs first:
        (a) direction correction on `ISLAND` UCs
        (b) path re-validation for newly staged UCs
        (c) orphan detection — orphan SG / link / subsystem → reject commit
     → applies STAGED rows in order (DELETE → UPDATE → CREATE per REQ-CMT-02)
7. POST /projects/{id}/end-session
```

Everything flows through `LLD1 PendingChangeWriter`. Nothing bypasses edit-crud.

---

## 6. Existing API DTO snapshot (for reference)

```ts
// CreateUsecasesRequestDto (current, stubbed):
{
  selectedUsecaseSystemIds:      string[]                       // FR-API-02 ✓
  activeSubgraphs:               SubgraphKvSelectionDto[]       // FR-API-01 ✓
  excludedDataLinkSystemIds?:    string[]                       // NOT IN REQS — see G2
  excludedControlLinkSystemIds?: string[]                       // NOT IN REQS — see G2
}

// SubgraphKvSelectionDto:
{
  systemId:       string
  valueSystemIds: string[][]     // outer = SGKV cases, inner = ValueDefinition IDs
}

// CreateUsecasesResponseDto (current, stubbed):
{
  created: UsecaseIdentifierDto[]
  updated: UsecaseIdentifierDto[]
  deleted: UsecaseIdentifierDto[]
  issues:  ApiIssueItem[]        // catch-all — see G3
}
```

Missing per our requirements:
- `manualDataLinkSystemIds` / `manualControlLinkSystemIds` (FR-API-04, manual mode)
- Explicit mode discriminator (FR-UC-01 vs FR-UC-02)
- Orphan report fields (FR-VAL-01/02/03)
- Warnings vs errors separation
- `groupId` for atomic undo/stage (REQ-ATO-02)

---

## 7. Open items — need user input to unblock design

### G1 — Add manual-mode link lists  ✅ RESOLVED

**Resolution:** Manual UC creation moved to a **separate endpoint** (`create-manual-usecases`).
Server discovers intra-usecase data-links (and control-link fallback) by querying the DB
between every pair in the effective routing scope — including selected-selected,
selected-out-of-selection, and out-of-selection pairs. The client no longer supplies
link IDs.

**Impact on requirements:**
- FR-API-04 rewritten — describes the new dedicated endpoint and server-side link discovery.
- FR-UC-01 step 4 rewritten — server queries DB. Control-link fallback direction: smaller
  SG ID first. Isolated SG (no data-link, no control-link) → include in UC with no pairs,
  emit warning.
- FR-STATUS-01 clarified — manual UC may start `LINKED` OR `ISLAND` depending on
  data-link coverage per pair.
- FR-STATUS-04 extended with **direction correction** — a data-link's direction is
  authoritative over the stored pair direction **only when the pair is currently
  held together by a control-link** (per FR-UC-01 step 4). Data-link vs data-link
  cases are outside Step 1's scope; original-data-link deletions follow the deletion
  scenario (FR-DEL-01..05). Rationale: control-link direction was chosen by the
  smaller-SG-ID rule and is arbitrary; data-link direction is not arbitrary.
- **I7 (new invariant): Pair-link presence.** An SG pair (A, B) may exist in a UC's
  pair set only if at least one intra-usecase link (data or control) is currently
  present between A and B. This is what makes the FR-STATUS-04 Step 1
  control-link-presence check meaningful.
- FR-COMMIT-01 extended with **safety-net checks (a)/(b)/(c)** — direction correction,
  path re-validation, and orphan detection. Orphan detection at commit time catches new
  SGs/links added without running create-usecases (throws error). Path re-validation
  is **type-aware**: `LINKED` UCs require data-link coverage per FR-STATUS-04;
  `ISLAND` UCs only require I7 pair-link presence (data-link OR control-link).
  This allows manual `ISLAND` UCs with control-link-only pairs to commit cleanly.
- I5 extended — orphan-free commit now covers SGs, data-links, and subsystems.

**Manual-UC clarifying questions answered (Q1–Q5):**

| Q | Answer |
|---|---|
| Q1 — KV accumulation | Cartesian product of SGKV instances (same as FR-DFS-05) |
| Q2 — KV conflict | Cartesian discard (FR-DFS-06). Error if no valid combination remains (FR-DFS-08) |
| Q3 — Manual UC type | `ISLAND` if any pair lacks direct data-link coverage; else `LINKED` |
| Q4 — Direction correction | **Option C** — in create-usecases (FR-STATUS-04 extension) AND at commit-time (FR-COMMIT-01 safety net). Commit safety net also enforces orphan detection |
| Q5 — SG with no data-link nor control-link | Warning + include in UC with no pairs |

### G2 — `excludedDataLinkSystemIds` / `excludedControlLinkSystemIds`  ✅ RESOLVED

**Resolution:** Keep both fields. They allow callers to include out-of-selection SGs,
discover all eligible intra-usecase links among effective-scope SGs, and selectively
exclude links from the current routing pass.

**Impact on requirements:**
- Added **FR-API-05** (Optional link exclusion for the current routing pass) after
  FR-API-04 in the core requirements doc.
- Added **FR-API-07** to prevent exclusions from suppressing current-session structural
  edits.

**Key rules (see FR-API-05 for full text):**
- Exclusion is session-scoped; no DB state change.
- Only unchanged entities may be excluded. Added/deleted SGs and links, plus required
  data-link endpoint SGs, are validated by FR-API-07 before routing.
- Excluded links do not participate in DFS traversal, cone expansion, or manual-mode
  pair discovery.
- FR-CONE-03 seed detection keys on actual edit_actions (not exclusion) — exclusion
  is not "deletion."
- Excluded links **remain subject to FR-VAL-03 orphan detection** and the FR-COMMIT-01(c)
  commit-time orphan safety net. Exclusion is a routing filter, not a bypass of I5.
- Both `create-usecases` (FR-UC-02) and `create-manual-usecases` (FR-UC-01) accept
  the exclusion lists.

### G3 — Response DTO for `create-usecases`  ✅ RESOLVED

**Resolution:** Keep the single flat `issues[]` bag consistent with the codebase's
existing SET/Result API convention. Use typed issue codes (with severity + auto-fix
hint) instead of separate top-level arrays for orphans / warnings.

Final response shape for `CreateUsecasesResponseDto`:

```ts
type UsecaseIdentifierDto = {
  systemId: string
  changeId: string
}

{
  created:           UsecaseIdentifierDto[]   // new UCs (source=AUTO_ROUTING, UNSTAGED)
  updated:           UsecaseIdentifierDto[]   // FR-STATUS-04 transitions + direction
                                              //   corrections + FR-DUP-03(b) merges
  markedForDeletion: UsecaseIdentifierDto[]   // FR-DEL-03 — pending deletion (renamed
                                              //   from `deleted` — routing doesn't
                                              //   actually delete UCs, only marks them)
  issues:            ApiIssueItem[]           // orphans + warnings, typed by code:
                                              //   · ARC-ROUTING-ORPHAN-SUBGRAPH   (WARN, autofix=delete)
                                              //   · ARC-ROUTING-ORPHAN-SUBSYSTEM  (WARN, autofix=delete)
                                              //   · ARC-ROUTING-ORPHAN-INTRA-LINK (WARN, autofix=delete)
                                              //   · ARC-ROUTING-CYCLE-DETECTED    (WARN)
                                              //   · ARC-ROUTING-ISLAND-DETECTED   (WARN)
  groupId:           string                    // REQ-ATO-02 atomic handle
}
```

On a **blocking error** (FR-DUP-04 / FR-DFS-08 / FR-EC-05 /
FR-PREVAL-01 / FR-MDF-01 KV-assigned / FR-DEL-02 affected-UC selection incomplete /
FR-API-03 selected-scope input incomplete / FR-API-07 structural-edit scope conflict):
`ApiResult.success = false`, errors surface via `ApiResult.errors[]` per
core-result-format. No `data` payload; no partial results.

**Rationale for typed issues over separate arrays:**
- Matches how every other Set/Result API in this codebase already returns data.
- Each orphan issue carries `impactedEntity` (SG/subsystem/link systemId) and an
  auto-fix action hint (delete) — clients wire the FR-VAL-01 "delete orphans /
  continue editing" dialog off the issue codes.
- No client-side severity filtering at the response level — the code namespace
  encodes intent (ORPHAN vs. CYCLE vs. ISLAND).

### G4 — Response missing `groupId`  ✅ RESOLVED

Included in the G3 response shape above. REQ-ATO-02 satisfied.

### G5 — Idempotency  ✅ RESOLVED

**Resolution:** No new FR needed. Idempotency emerges naturally from existing rules:

| Routing output | Idempotency mechanism |
|---|---|
| UC creation | FR-DUP-03(a) — exact-match no-op. Overlay includes UNSTAGED UCs from prior calls, so the second call recognizes them and doesn't duplicate. |
| SGKV writes from API input | FR-KV-COMMIT-01 — content-based dedup ("not already represented in that SG's SGKV DB records"). |
| UCs marked for deletion (FR-DEL-03) | Overlay tombstoning — first call stages DELETE, overlay hides the UC, second call's FR-DEL-01 sweep sees nothing to re-mark. |
| Direction corrections (FR-STATUS-04 Step 1) | Naturally stable — first call corrects direction to match data-link; second call reads the corrected pair, direction matches, no re-correction. |
| `ISLAND` → `LINKED` transitions (FR-STATUS-04) | Post-transition type is `LINKED`, so the UC falls out of the "each `ISLAND` UC" iteration scope on subsequent calls. |
| Orphan detection, warnings | Deterministic function of graph state — same inputs, same outputs. |

**Design note (to be included in the Overall Design):** The routing pipeline is idempotent
by construction. Do not add write side-effects that break this property (e.g., call-scoped
metrics rows keyed by timestamp inside the routing transaction). Any such logging goes
outside the routing transaction.

**No requirements changes.** Swagger's existing "idempotent" description remains accurate.

### G6 — Manual / Auto mode discriminator  ✅ RESOLVED

**Resolution:** Separate endpoints (`create-usecases` for auto, `create-manual-usecases`
for manual). No discriminator field needed. Each endpoint's DTO shape is tailored to
its mode.

---

## 8. What happens after G1–G6 are resolved

Once user answers all six:

1. Update `docs/use-case-creator/2026-06-01-auto-usecase-routing-requirements.md` with any
   new requirements arising from the answers (esp. G1 = FR-API-04 clarification if reworded,
   G3 = new response contract requirement, G5 = idempotency FR if added).
2. Create `docs/use-case-creator/design/` folder.
3. Write `overall-design.md` first — architecture, vocabulary, RoutingContext, phase list,
   ports, cross-cutting invariants, LLD map.
4. Once user approves overall design, write LLD1–LLD6 in the order set in §4.
5. Alignment check (requirements ↔ design) after each LLD.
6. Spec self-review after each LLD.
7. User review gate → then invoke `writing-plans` skill (via handoff file since spec is large).

---

## 9. Non-negotiable constraints to respect during design

From `CLAUDE.md` + edit-crud overall design:

- `@arc/core` must have **zero** framework imports (no NestJS, TypeORM, node APIs).
- `packages/core` depends only on `zod` and `uuid`.
- Ports in core, adapters in `@arc/persistence`.
- **Row shapes stay out of `@arc/core`.** `edit_actions` uses persistence-shaped
  `field_path`/`new_value`. Routing must not know this. Enforcement:
  - **Read side:** aggregate repos each expose a domain-shaped
    `findManualEditsSinceLastRouting(sessionId, fileSystemId)` returning
    `{added, deleted}`. Handler calls the three aggregate repos in parallel and
    assembles a `GraphEditSummary`. Adapters internally query `edit_actions` and
    translate. No routing-specific cross-aggregate repo needed.
  - **Write side:** RoutingEngine calls domain-verb methods on aggregate repos
    (`IUsecaseRepository.create`, `.update`, `.delete`, `.correctDirection`) — no
    `record*` prefix. `source=AUTO_ROUTING` and `changeStatus=UNSTAGED` come from
    `WriteContext` (stamped by `CommandBus`); adapters read them from
    `uow.getWriteContext()`, not from port parameters. Adapters translate to
    `PendingChangeWriter` with row-shaped `field_path`/`new_value`. RoutingEngine
    does NOT depend on `PendingChangeWriter` directly.
- **Repo convention:** one repo per aggregate; each handles both reads and writes for
  its aggregate. Cross-aggregate queries are stitched together by the handler from
  per-aggregate query methods — no dedicated cross-aggregate repos. Matches the
  pattern in `PatchSpfModuleHandler`.
- CQRS handlers: `Result<T>` for structured outcomes; exceptions only for infrastructure failures.
- `BaseCommand` static fields: `requiresSession = true`, `allowedModes = [DESIGNER, DIFF_MERGE]`
  for the create-usecases command.
- Handler owns transaction lifecycle (`uow.startTransaction/commit/rollback`).
- Writes go through `PendingChangeWriter` (LLD1). Domain-verb repo methods (`recordXxxChange`),
  never `stage*` prefix.
- Every pending change carries `aggregateId` — routing's UC-level rows use the new UC's
  systemId as aggregateId.
- `source = AUTO_ROUTING` for algorithm-generated pending changes; `changeStatus = UNSTAGED`
  by default (per FR-EA-05).
- `source = MANUAL, changeStatus = STAGED` for the API-input SGKV writes (they belong to the
  user, not the algorithm).
- All writes in one API call share the `groupId` stamped once by `CommandBus`.
- Migration workflow: regenerate `initial-create` migration (see CLAUDE.md § Database Migration Workflow).

---

## 10. Key requirement identifiers to have handy while designing

Use this cheat sheet when writing the LLDs.

| Group | FRs | LLD that owns them |
|---|---|---|
| Modes | FR-UC-01 (manual), FR-UC-02 (auto) | Overall + LLD6 |
| API input | FR-API-01/02/03/04 | LLD6 |
| KV pipeline | FR-KV-01/02/03 | LLD1 |
| Seed + cone | FR-CONE-01/02/03/04/05/06/07 | LLD1 |
| DFS | FR-DFS-01/02/03/04 | LLD2 |
| Combinations + conflicts | FR-DFS-05/06/07/08/09 | LLD2 |
| Duplicates | FR-DUP-03(a)/(b1), FR-DUP-04 | Phase 9 folded into plan |
| Orphans | FR-VAL-01/02/03/04 | LLD3 |
| UC lifecycle | FR-LIFE-01/02/03 | LLD3 |
| Deletion scenario | FR-DEL-01/02/03/04/05/06 | LLD4 |
| Extension scenario | FR-EXT-01/02/03 | LLD4 |
| Pre-validation | FR-PREVAL-01/02 | LLD1 |
| Commit re-validation | FR-COMMIT-01 | LLD6 (or Commit LLD in edit-crud) |
| Status | FR-STATUS-01/02/03/04 | LLD3 |
| Persistence | FR-KV-COMMIT-01/02/03 | LLD6 |
| Stage | FR-STAGE-01 | Uses edit-crud LLD4 |
| EC | FR-EC-01/02/03/04/05/06 | LLD5 |
| MDF | FR-MDF-01 | LLD5 |
| Invariants | I1–I6 | Overall |
| NFRs | NFR-PERF-01 (<100ms/30SG/50links), NFR-CONSIST-01 (one tx), NFR-STAT-01 (stateless) | Overall |

---

## 11. Recovering context if reloaded

If you're re-reading this file mid-session:

1. This file is the entry point. Read it first.
2. Then read the two frozen requirement docs (§2) — they are the sole source of truth.
3. Then read `docs/edit-crud/overall-design.md` and `docs/edit-crud/foundation.md` for the
   write path this feature layers on.
4. Then, if it exists, read `docs/use-case-creator/design/overall-design.md` — that's where
   design will land once G1–G6 are answered.
5. Check the answers to §7 (updated as user responds).
6. Resume at "§8. What happens after G1–G6 are resolved."

---

*End of context/open-questions doc.*
