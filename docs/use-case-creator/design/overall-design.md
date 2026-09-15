<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Auto Use-Case Creator — Overall Design

**Status:** Draft
**Owner:** Nithin Simon
**Last updated:** 2026-09-15

**Requirements:**
- Core: [`../2026-06-01-auto-usecase-routing-requirements.md`](../2026-06-01-auto-usecase-routing-requirements.md)
- Extended: [`../2026-06-02-auto-usecase-routing-requirements-extended.md`](../2026-06-02-auto-usecase-routing-requirements-extended.md)

**Diagrams:** [`./diagrams/`](./diagrams/) — supplementary flowcharts and tables referenced from this document.

---

## 1. Purpose & Scope

This document is the overall design for the **auto use-case creator** feature. It fixes
the module boundaries, pipeline shape, data flow, port contracts, and cross-cutting
invariants for two HTTP endpoints:

- `POST /arc-api/v1/projects/:projectId/create-usecases` — auto routing (FR-UC-02)
- `POST /arc-api/v1/projects/:projectId/create-manual-usecases` — manual UC creation (FR-UC-01)

Detailed algorithm design, DTOs, and repository method signatures are deferred to the
LLDs listed in §12.

**Non-goals** for this document:
- Specific DFS/cone algorithm mechanics — LLD1, LLD2.
- Duplicate merge rule details — LLD3.
- Deletion/extension scenarios — LLD4.
- EC and MDF hooks — LLD5.
- Persistence method signatures and API DTOs — LLD6.
- Commit-time validation implementation — belongs to the edit-crud commit LLD; this
  document only defines the *contract* it must uphold (FR-COMMIT-01).

---

## 2. Feature Context & Module Boundaries

See diagram [`diagrams/01-context-and-module-boundaries.md`](./diagrams/01-context-and-module-boundaries.md)
for the layered flow.

**Two entry points, one pipeline.** Both endpoints delegate to a single facade,
`RoutingEngine.run(routingInput, uow)`, which drives the same phased pipeline. Mode
differences are handled inside the pipeline (some phases no-op in manual mode), not
by duplicating the orchestrator.

**Module placement.** The feature lives at
`packages/core/src/application/usecase-designer/use-case-creator/`. It sits alongside the
existing `spf-module/`, `container/`, etc. Domain entities (`Usecase`, `Subgraph`,
`DataLink`, `ControlLink`) already exist in `packages/core/src/domain/`; this feature
consumes them and does not introduce new aggregates.

**Public API of the routing subfolder:** exactly one class — `RoutingEngine`. Handlers
depend only on this facade. All other classes (pipeline services, `RoutingContext`,
phase implementations) are internal.

**Upstream dependency: subsystem-links.** SLS/CSLS chain resolution is a hard
prerequisite for routing (FR-PREVAL-03). Both handlers invoke
`IChainResolver.resolveAllChains(uow)` as a pre-step. The chain resolver writes STAGED
`data_link`/`control_link` `edit_actions` into the session and returns success/failure
only — no data is returned to the handler. `RoutingEngine` then reads links through
the normal repositories with the edit-crud overlay; it has **no concept** of chain
resolution.

For raw-mode projects (the common case), the chain resolver is a fast no-op.

**Framework glue is inherited.** `CommandBus`, `SessionGuard`, `UnitOfWork`,
`PendingChangeWriter` are pre-existing edit-crud primitives. Handlers follow the same
shape as `PatchSpfModuleHandler` (constructor takes `UnitOfWork` + `IdGenerationPort`,
`handle()` calls `startTransaction()` → work → `commit()`). Routing handlers return
`RoutingOutcome {emittedChanges, issues, groupId}`; simpler handlers may return only
their operation-specific IDs and `groupId`.

**Boundary invariants (from CLAUDE.md):**
- `@arc/core` has zero framework imports (no NestJS, TypeORM, node APIs).
- Ports in core, adapters in `@arc/persistence`. Row shapes stay out of `@arc/core`.
- CQRS: handlers are the only mutation entry points.
- Edit-mode enforced by `SessionGuard` before command dispatch.

---

## 3. Phased Pipeline Overview

See diagram [`diagrams/02-phased-pipeline-overview.md`](./diagrams/02-phased-pipeline-overview.md)
for the full lifecycle and auto/manual mode phase applicability.

**Handler pre-step (before Phase 1).** Both handlers call
`IChainResolver.resolveAllChains(uow)`. Failure → handler throws → HTTP 422; routing
pipeline never starts, no side effects. Success → resolver has written STAGED link
edits into the session. Each handler then loads the UCs named by
`selectedUsecaseSystemIds` once from the effective session overlay and preserves that
snapshot as `selectedUsecases` in `RoutingInput`. It derives `selectedScopeSubgraphs`,
`inputSubgraphs`, `outOfSelectionSubgraphs`, and `effectiveRoutingScope`, and rejects
before KV resolution, seed detection, or manual pair discovery if FR-API-07 addition-
side closure fails: added SGs and added data-link endpoints must be active and
non-excluded, and no current-session added SG/link may be explicitly excluded. Added
control-links are checked for direct exclusion but do not force their endpoints into
auto scope. The handler then enforces
`selectedScopeSubgraphs − excludedSubgraphSystemIds − deletedSubgraphSystemIds ⊆
inputSubgraphs`. Session-deleted SGs are silently removed from stale client input and
from `effectiveRoutingScope`, while their DELETE records remain in `graphEdits`. The
handler then invokes `RoutingEngine.run`. Those names describe handler-local derivations,
not four stored input fields. The engine receives normalized `activeSubgraphs` plus a
minimal `scopePolicy`: original requested SG IDs and explicit SG exclusions. This retains
the request intent required by Phase 2 without duplicating every derived set.

**Routing pipeline — 12 sequential phases in three halves:**

The pipeline is organized to resolve fate of existing UCs *before* running the expensive
routing search. This enables fail-fast behavior for FR-DEL-02 and moves work that
depends only on graph state ahead of work that depends on user-provided GKVs.

**Half A — Resolve fate of existing UCs (pre-routing):**

| # | Phase | Responsibility | LLD |
|---|---|---|---|
| 1 | PreValidationService | Input shape and referential integrity checks after handler-level FR-API-07 addition-side and FR-API-03 selected-scope validation (FR-PREVAL-01/02) | LLD1 |
| 2 | DeletionScopeService | Discover file-wide UCs requiring deletion, structural mutation, or type degradation; fail-fast with full affected and missing ID sets; after FR-DEL-02 passes, enforce FR-API-07 deletion-side closure and run FR-DEL-06 pair survival (FR-DEL-01/02/06) | LLD4 |
| 3 | `IslandTransitionService` | `ISLAND` → `LINKED` transitions + direction correction (FR-STATUS-04) | LLD4 |

**Half B — Produce new UCs from input GKVs (routing proper):**

| # | Phase | Responsibility | LLD |
|---|---|---|---|
| 4 | KvResolutionService | Turn client-supplied `GKV`s into concrete `SGKV` instances (FR-KV-01/02/03) | LLD1 |
| 5 | SeedDetectionService | Identify seed SGs from graph edits (FR-CONE-01/02/03/05/06) | LLD1 |
| 6 | ConeComputationService | Bidirectional cone expansion around each seed (FR-CONE-04/07) | LLD1 |
| 7 | DfsRoutingService | Bounded DFS to enumerate SG paths (FR-DFS-01..04) | LLD2 |
| 8 | CombinationExpansionSvc | Cartesian product of KV instances per path; conflict pruning (FR-DFS-05..09) | LLD2 |
| 9 | ClassificationService | New UC / silent auto-update / user-choice — FR-DUP-03(a)/(b1), FR-DUP-04, FR-LIFE-01 | LLD3 |

**Half C — Validate and emit:**

| # | Phase | Responsibility | LLD |
|---|---|---|---|
| 10 | OrphanValidationService | FR-VAL-01/02/03 orphan sweep | LLD3 |
| 11 | RoutingChangeStager | Emit `edit_actions` via domain-verb edit-repo ports; source=AUTO_ROUTING, UNSTAGED | LLD6 |
| 12 | ResponseBuilder | Assemble the framework-free `RoutingOutcome` containing emitted change descriptors, issues, and `groupId` | LLD6 |

**Rationale for the split.** Phases 2 and 3 (Half A) depend only on `graphEdits`,
`islandUcs`, and existing UC/link state — none of them need routing output. Running them
first has two payoffs:
- **Fail-fast on FR-DEL-02** — if the caller omitted an affected UC from the selected UC
  snapshots, the automatic pipeline rejects before spending ~60ms of DFS work.
- **Cleaner mental model** — "resolve existing" and "produce new" are separate
  concerns; the split makes that legible.

**Stateless services.** Each phase is a stateless service; all mutable state lives in
`RoutingContext` (per-request) and `UnitOfWork` (per-tx). Same instance can serve N
parallel requests for different files.

**Error propagation.** Any phase can return `Result.fail(issues[])`. On fail:
orchestrator halts, handler rolls back the transaction, no `edit_actions` persist. On
success: orchestrator continues. Non-blocking issues (warnings, orphans) are collected
in `RoutingContext.warnings` and surface in the response's `issues[]` — they do not
halt the pipeline.

**Auto vs Manual mode.** Manual mode runs the same orchestrator with the same phase
list, but Phase 2 performs no file-wide affected-UC discovery, FR-DEL-02 gate,
reconstruction, degradation, or existing-UC mutation. Commit-time validation protects
existing UCs from unresolved structural damage. Phases 3, 5, 6, and 7 are no-ops. Phase
4 resolves the provided GKVs. Phase 8 expands the ordered
effective-routing-scope synthetic path so every valid SGKV Cartesian combination becomes
a candidate UC. Phase 9 runs partial (idempotency check only). This avoids two divergent
code paths while keeping manual topology explicit.

**Commit safety-net is separate.** FR-COMMIT-01 checks (a)/(b1)/(b2)/(c)/(d) —
direction correction, staged-UC validation, existing-UC invalidation after structural
deletion, orphan detection, and manual UC referential integrity — run at
`POST /commit-changes`, NOT inside the routing pipeline. Design ownership: edit-crud
commit LLD; this feature only defines the contract.

**Handler pre-step for `create-usecases` — FR-LIFE-04 wipe.** Before invoking
`RoutingEngine.run`, and immediately after the chain-resolver pre-step, the
`create-usecases` handler deletes all `edit_actions` in the current session where
`source = AUTO_ROUTING`. The deletion covers active and superseded rows, every operation,
and UC base and relationship actions. It affects uncommitted current-session actions
only; committed data and other sources are preserved. This ensures each auto-routing
invocation reflects the current graph state cleanly. `create-manual-usecases` does not
perform this wipe — manual UC output uses `source = MANUAL` (same as graph edits) and is
preserved across auto-routing calls.

**Source enum values used by this feature:**

| Value | Emitted by | Wiped by `create-usecases` FR-LIFE-04? |
|---|---|---|
| `MANUAL` | User's graph editing endpoints (add SG, add link, patch, etc.); chain resolver; `create-manual-usecases` handler | No |
| `AUTO_ROUTING` | `create-usecases` handler (auto-routing pipeline output) | **Yes** |
| `DIFF_TOOL` | Diff-merge tooling (out of scope for this feature) | No |

Manual UC creation uses `source = MANUAL` — the same value as graph edits. It is
distinguished from graph edits where needed (e.g., FR-COMMIT-01(d) referential integrity
check) via `target_table = 'UseCase' AND operation = 'CREATE'`, not via a separate source
value. This keeps the source enum minimal and avoids adding a transient `MANUAL_UC` value
that carries no behavioral difference from `MANUAL`.

---

## 4. RoutingContext & Data Flow

See [`diagrams/03-routing-context-data-flow.md`](./diagrams/03-routing-context-data-flow.md)
for the field layout and per-phase read/write table.

**RoutingContext** is a mutable data container threaded through all 12 phases.
`RoutingEngine.run` constructs it from `input` and `mode`, then invokes its fixed phase
sequence.
Each phase writes its owned field once; downstream phases read. The only exception is
`warnings` — appendable by any phase.

**Input structure.** `input` is immutable after the handler builds it. Scope derivation
names remain useful algorithm vocabulary, but only the irreducible fields below cross the
engine boundary. Contents by
mode:

| Field | Auto | Manual | Source |
|---|---|---|---|
| `mode` | ✓ | ✓ | handler |
| `activeSubgraphs` (normalized SG + SGKV selections after excluded/deleted SG removal) | ✓ | ✓ | handler from client payload |
| `selectedUsecases` (single effective-overlay snapshot) | ✓ | ✓ | handler |
| `scopePolicy.requestedSubgraphSystemIds` (SG IDs in original `activeSubgraphs`) | ✓ | ✓ | handler from client payload |
| `scopePolicy.excludedSubgraphSystemIds` | ✓ | ✓ | handler from client payload |
| `excludedDataLinkSystemIds` | ✓ | ✓ | client payload |
| `excludedControlLinkSystemIds` | ✓ | ✓ | client payload |
| `graphEdits` (added/deleted SGs, data-links, control-links since last routing) | ✓ | ✓ | handler (assembled from aggregate repo `findManualEditsSinceLastRouting` calls) |
| `islandUcs` (committed `ISLAND` UCs present before the run) | ✓ | — | handler (repo query) |
| `manualTopology` (pairs with pair-local supporting data/control links; isolated SGs derived from scope) | — | ✓ | `ManualPairDiscoveryService` after chain resolution |

`selectedUsecases`, `graphEdits`, and `islandUcs` are handler-derived. Downstream phases
reuse `selectedUsecases`; they do not reload selected UCs and risk observing a different
overlay snapshot. When a phase needs selected scope, out-of-selection scope, or effective
routing IDs, it derives them from `selectedUsecases`, normalized `activeSubgraphs`, and
`scopePolicy`. `selectedUsecaseSystemIds` are similarly recoverable from the snapshots.

In manual mode, the SGs forming the new UC are the IDs in normalized `activeSubgraphs`
(the effective routing scope). Pair
derivation happens server-side (FR-UC-01) via data-link query with control-link fallback.
`ManualPairDiscoveryService` examines every unordered relationship involving an
out-of-selection SG. A selected-selected relationship is eligible only when at least one
selected UC already contains that relationship. Discovery applies explicit link
exclusions, data-first direction, per-relationship control fallback, and cycle rejection.
Phase 8 consumes the same ordered effective-scope selection.
Request order is retained only for deterministic combination expansion and does not
define topology.

**Why `graphEdits`:** Phase 5 (SeedDetection) needs to know *what the user just changed*
so it can focus routing on those SGs rather than re-scan the whole graph. Phase 2
(DeletionScope) uses the deletion entries to find impacted UCs. Without this delta,
routing would be O(graph) instead of O(edits) — blowing NFR-PERF-01.

**Why `islandUcs`:** Phase 3 (`IslandTransitionService`) has to scan current `ISLAND` UCs for eligibility to promote to
`LINKED`. Not derivable from edit deltas — it's a
"which past UCs are still incomplete" catalog. Auto mode only; manual mode never
transitions UCs.

**Not in `RoutingContext`:** link data, subgraph definitions, `UnitOfWork`,
chain-resolution outcome. Phases that need those read from repositories directly (which
return the edit-crud overlay — committed state + STAGED edits).

`RoutingContext` also does not copy input exclusions into mutable sets. Phases read
exclusions from immutable `context.input` and create private local lookup sets when
needed.

**Command and API results.** Phase 11 emits one descriptor per changed UC:
`{systemId, changeId, operation, source}`. `RoutingOutcome` contains those descriptors,
issues, and `groupId`; it does not contain operation-grouped arrays. Each create controller
then dispatches `GetUsecaseChangeDetailsQuery(projectId, clientId, emittedChanges)`. Its
handler resolves the file and the persistence query projects committed `before` and
complete latest-session-overlay `after` snapshots. Both create endpoints return
`{changes, issues, groupId}`. Snapshot pairs and SG membership remain persistence
details; clients receive `isEc` and full data/control-link read models. A transient
projection read is retried once; a final failure returns an error containing `groupId`
while preserving the successful edit actions. Routing is neither rerun nor compensated.

**Phase return semantics.** Each phase returns `Result<void>`. On `Result.fail`, the
orchestrator halts and the handler rolls back. Warnings are non-blocking; they're
appended to `context.warnings` and the pipeline continues.

---

## 5. Session, Transaction & Idempotency

**Session model.** Routing runs *inside* an existing edit session opened by
`POST /start-session`. It does not open its own session; if no session exists,
`SessionGuard` rejects the request before the handler runs. Enforced by
`BaseCommand.requiresSession = true`. `allowedModes = [DESIGNER, DIFF_MERGE]` for the
create-usecases command.

**Transaction boundary.** The handler owns the tx — same shape as
`PatchSpfModuleHandler`. `startTransaction()` → chain resolver pre-step → build
`RoutingInput` → `RoutingEngine.run(input, uow)` → `commit()`. For automatic routing,
the source-scoped cleanup occurs after chain resolution and before input construction.
On any thrown exception: rollback and rethrow. Exact signature and try/catch structure
is in the LLD6 handler section — this doc only fixes the shape.

**One tx covers everything** — chain resolver writes, all AUTO_ROUTING `edit_actions`
from the pipeline, and any repository mutations that happen along the way. Any failure
at any point rolls back the whole tx. This is NFR-CONSIST-01.

**Note on SGKV persistence:** SGKV instances from the API input are used as **in-memory
input only** during routing. Persistence to the `sgkv` table happens at commit time per
FR-KV-COMMIT-01, not inside the routing transaction.

**Write path — all routing writes carry:**

| Attribute | Value |
|---|---|
| `aggregateId` | UC's `systemId` |
| `source` | `AUTO_ROUTING` |
| `changeStatus` | `UNSTAGED` (per FR-EA-05) |
| `groupId` | stamped once by `CommandBus` per API call |

Direct repo mutations are forbidden. Writes go through domain-verb edit-repo port
methods; adapters translate to `PendingChangeWriter` (see §6).

**Read path.** Repos return the edit-crud overlay — `committed + STAGED`. This is what
makes the chain-resolver pre-step work — its STAGED link writes are visible to routing
immediately, no re-fetch needed.

**Idempotency (G5) — how it works without a dedicated FR.** Three properties combine:

1. **Seed filter uses `source=MANUAL`.** Each aggregate repo's
   `findManualEditsSinceLastRouting` adapter filters `edit_actions` by
   `source=MANUAL` internally — Phase 5 receives only user-authored changes. Prior
   AUTO_ROUTING output is invisible; a second call with no new manual edits finds
   zero seeds → pipeline no-ops.
2. **UNSTAGED UCs are in the overlay.** A second call sees prior UNSTAGED UCs and hits
   FR-DUP-03(a) exact-match no-op if it would emit the same GKV.
3. **Pipeline is deterministic.** Same graph state + same input → same output.

**Design note:** Do not add write side-effects inside the routing tx that would break
idempotency (e.g., metrics rows keyed by timestamp, external event bus publications).
Any such logging goes outside the routing tx or async after commit.

**One deliberate ordering:** the handler builds `RoutingInput` *after* the chain
resolver runs. This ensures `graphEdits` includes the STAGED link edits the chain
resolver just wrote — otherwise Phase 5 would miss them.

---

## 6. Ports & Adapters

**Boundary rule.** `@arc/core` has zero framework imports and only depends on `zod` and
`uuid`. Ports (interfaces) are defined in `@arc/core`. Adapters (implementations) live
in `@arc/persistence`. **Row shapes stay out of `@arc/core`** — `edit_actions` use
persistence-shaped `field_path`/`new_value`; routing must not know this.

**UseCase relationship identity.** `use_case_subgraphs` and
`use_case_subgraph_pairs` have persistence-owned `system_id` primary keys allocated
through `IIdGenerationPort`. Their natural tuples remain unique. Core continues to
represent memberships as SG system IDs and pairs as source/destination values; the
`IUsecaseRepository` adapter resolves those values to relationship-row IDs when
writing `edit_actions`.

**Ports this feature depends on:**

| Port | Owner | Status | Consumed by |
|---|---|---|---|
| `IChainResolver` | subsystem-links module | Existing (external) | Handler pre-step |
| `IUsecaseRepository` | existing (extended) | Existing + new methods (see below) | Handler, Phase 2, Phase 3, Phase 9, Phase 10, Phase 11 |
| `ISubgraphRepository` | existing (extended) | Existing + SGKV read + manual-edits query | Handler, Phase 1, Phase 4, Phase 5, Phase 6 |
| `IDataLinkRepository` | existing (extended) | Existing + pair-existence + manual-edits query | Handler, Phase 1, Phase 2, Phase 7, Phase 10 |
| `IControlLinkRepository` | existing (extended) | Existing + pair-existence + manual-edits query | Handler, Phase 2, Phase 10 |
| `IIdGenerationPort` | existing | Existing | Handler (new UC systemIds passed to Phase 11) |
| `IUnitOfWork` | edit-crud LLD1 | Existing | Handler (tx boundary) |

**Repository convention (from CLAUDE.md + existing handlers).** One repo per aggregate;
each repo handles both reads and writes for its own aggregate. Reads that require
cross-aggregate assembly (like the graph-edit delta) are split into per-aggregate
queries and stitched together by the handler. This matches the pattern in
`PatchSpfModuleHandler` where `moduleRepo` handles both `findModuleForPatch` and
`renameModule`, and there is no cross-aggregate "module change" repo.

**New methods added to existing repos:**

| Repo | New method | Purpose |
|---|---|---|
| `IUsecaseRepository` | `findAll(fileSystemId, {readMode?})` | Phase 2 — load all UCs (readMode=Committed for pre-session impact detection). Consumers filter in memory over `context.allUcs`. |
| | `findBySystemIds(fileSystemId, ucSystemIds, {readMode?})` | Handler — batch load specific UCs. |
| | `findWithActiveManualEdits(fileSystemId)` | Phase 9 — active MANUAL CREATE/UPDATE records with `changeId`, effective UC, operation, and nullable dependency payload for stale-edit validation/autofix. |
| | `create(uc, options?, referencedComponents?)` | Phase 11 |
| | `applyStructuralChange(uc, delta, options?, referencedComponents?)` | Phase 11 — atomic add/remove SGs+pairs+type update; also FR-EC-07 Rule D un-mark. |
| | `changeType(uc, newType, options?)` | Phase 11 — type-only mutation (FR-STATUS-02(b), pure Rule E). |
| | `reverseDirection(uc, currentSourceSg, currentDestSg, options?)` | Phase 11 — FR-STATUS-04 Step 1 flip. |
| | `delete(uc, options?)` | Phase 11 |
| `ISubgraphRepository` | `getSgkvsBySgIds(sgIds, fileSystemId)` | Phase 4 — SGKV is child of SG aggregate |
| | `findManualEditsSinceLastRouting(sessionId, fileSystemId)` | Handler — SGs added/deleted this session |
| `IDataLinkRepository` | `findIntraUsecaseByFile(fileSystemId, excludedIds)` | Phases 1, 6, 7 |
| | `findLinksByPair(sgA, sgB, fileSystemId, excludedIds)` | Phase 2 — FR-DEL-06 multi-path existence check |
| | `findManualEditsSinceLastRouting(sessionId, fileSystemId)` | Handler — data-links added/deleted this session |
| `IControlLinkRepository` | `findIntraUsecaseByFile(fileSystemId, excludedIds)` | Phase 10 — I5 orphan check |
| | `findLinksByPair(sgA, sgB, fileSystemId, excludedIds)` | Phase 2 — I7 pair-link presence via control-link |
| | `findManualEditsSinceLastRouting(sessionId, fileSystemId)` | Handler — control-links added/deleted this session |

**Write-side convention.** Domain verbs, no `record*` prefix. `source=AUTO_ROUTING` and
`changeStatus=UNSTAGED` come from the `WriteContext` (stamped by `CommandBus` on
command dispatch); adapters read them from `uow.getWriteContext()` — the port
signature does not carry them. Matches `renameModule` / `addDataPort` in the
reference handler.

**Read-side write assembly (handler).** Handler builds `graphEdits` by calling the
three aggregate repos' `findManualEditsSinceLastRouting` in parallel and merging into
a `GraphEditSummary`:

```ts
const [sgEdits, dlEdits, clEdits] = await Promise.all([
  subgraphRepo.findManualEditsSinceLastRouting(sessionId, fileSystemId),
  dataLinkRepo.findManualEditsSinceLastRouting(sessionId, fileSystemId),
  controlLinkRepo.findManualEditsSinceLastRouting(sessionId, fileSystemId),
]);
const graphEdits: GraphEditSummary = {
  addedSgs: sgEdits.added,           deletedSgs: sgEdits.deleted,
  addedDataLinks: dlEdits.added,     deletedDataLinks: dlEdits.deleted,
  addedControlLinks: clEdits.added,  deletedControlLinks: clEdits.deleted,
};
```

Each adapter filters `edit_actions` by `source=MANUAL` internally. The three adapters
share a private helper in `@arc/persistence` to avoid duplicating the `edit_actions`
query pattern — that helper is not a public port.

**RoutingEngine constructor (indicative; final in the implementation plan):**

```ts
class RoutingEngine {
  constructor(
    private readonly repos: {
      usecase:     IUsecaseRepository;
      subgraph:    ISubgraphRepository;
      dataLink:    IDataLinkRepository;
      controlLink: IControlLinkRepository;
    },
    private readonly idGeneration: IIdGenerationPort,
  ) {}

  async run(input: RoutingInput, uow: IUnitOfWork): Promise<Result<RoutingOutcome>>;
}
```

**Read-side query — assembled from aggregate repos:**

```ts
type GraphEditSummary = {
  addedSgs:            SgIdentifier[];
  deletedSgs:          SgIdentifier[];
  addedDataLinks:      DataLinkIdentifier[];
  deletedDataLinks:    DataLinkIdentifier[];
  addedControlLinks:   ControlLinkIdentifier[];
  deletedControlLinks: ControlLinkIdentifier[];
};

// Each aggregate repo returns its own delta:
interface ISubgraphRepository {
  // ... existing ...
  findManualEditsSinceLastRouting(sessionId, fileSystemId): Promise<{added: SgIdentifier[]; deleted: SgIdentifier[]}>;
}
// Similar shape on IDataLinkRepository and IControlLinkRepository.
```

Adapters filter `edit_actions` by `source=MANUAL` internally — the port contract does
not surface a `source` parameter. Routing sees only user-authored changes.

**Write-side on `IUsecaseRepository` — domain verbs, no `record*` prefix:**

```ts
interface IUsecaseRepository {
  // ... existing find methods ...
  findAll(fileSystemId: string, options?: ReadOptions): Promise<Usecase[]>;
  findBySystemIds(fileSystemId: string, ucSystemIds: readonly number[], options?: ReadOptions): Promise<Usecase[]>;
  findWithActiveManualEdits(fileSystemId: string): Promise<ActiveManualUsecaseEdit[]>;

  create(uc: Usecase, options?: EditOptions, referencedComponents?: ReferencedComponents): Promise<UsecaseChangeRef | null>;
  applyStructuralChange(ucSystemId: number, delta: StructuralDelta, options?: EditOptions, referencedComponents?: ReferencedComponents): Promise<UsecaseChangeRef | null>;
  changeType(ucSystemId: number, newType: UsecaseType, options?: EditOptions): Promise<UsecaseChangeRef | null>;
  reverseSgPairDirection(ucSystemId: number, currentSourceSgSystemId: number, currentDestSgSystemId: number, options?: EditOptions): Promise<UsecaseChangeRef | null>;
  delete(ucSystemId: number, options?: EditOptions): Promise<UsecaseChangeRef | null>;
}
```

`UsecaseChangeRef` is the canonical root `UseCase` edit-action reference
`{systemId, changeId}`. Structural-only and direction-only writes add an empty root
UPDATE marker after their relation edits so the reference always identifies the UseCase
aggregate. `null` means that no immediate edit action was emitted, either because the
request was a no-op or because it was deferred to the pending-change cache.

`ActiveManualUsecaseEdit` preserves invalid rows for Phase 9 reporting instead of
silently dropping them:

```ts
interface ActiveManualUsecaseEdit {
  changeId: number;
  usecase: Usecase | null;
  operation: 'CREATE' | 'UPDATE';
  referencedComponents: ReferencedComponents | null;
}
```

Adapters (in `@arc/persistence`) translate each write call into `PendingChangeWriter`
writes with the appropriate `field_path`/`new_value`. Source and changeStatus come
from `uow.getWriteContext()` — not port parameters. `RoutingEngine` does **not**
depend on `PendingChangeWriter` directly.

**Handler wiring.** Same pattern as existing handlers. Composition root registers the
new handler + engine + adapters.

**What this feature does NOT own:**
- Chain resolution logic (subsystem-links module).
- SGKV commit-time persistence (edit-crud commit path / LLD6).
- The `sgkv` table shape (already exists).
- The `edit_actions` table shape (edit-crud LLD1).

---

## 7. Cross-Cutting Invariants

| # | Invariant | Enforced by |
|---|---|---|
| **I1** | GKV uniqueness — no two UCs in a file share the same GKV, regardless of `type`. Same-GKV collisions resolve via FR-DUP-03(a) exact-match no-op, FR-DUP-03(b1) identity-preserving interior extension silent auto-update, or FR-DUP-04 user-choice. In manual mode the collision rule is suppressed — manual creation emits one UC at a time and hits FR-DUP-03(a) exact-match no-op if the same GKV already exists. EC UCs (`type=EC`) are subject to this rule; a coincidental same-GKV collision between an EC UC and a `LINKED`/`ISLAND` UC (or between two EC Bridges from different EC connections) surfaces via FR-DUP-04. | Phase 9 (Classification) |
| **I2** | Subgraph-pair completeness — every pair `(A, B)` in a UC's `use_case_subgraph_pairs` must have both `A` and `B` in the UC's `use_case_subgraphs`. | Phase 9 (Classification) — pair emission always adds both endpoints |
| **I3** | GKV derivation — a UC's stored GKV equals the union of KVs from the SGKV combination active at creation or last re-routing. Historical record. | Phase 9 (Classification) — GKV computed from `combinations` snapshot, not re-derived on read |
| **I4** | No structural deletion for KV changes — a KV-only change never deletes or modifies a UC record. | Phase 2 (DeletionScope) — deletion triggers only on link/SG removal |
| **I5** | Orphan-free commit — every SG must be a member of ≥1 UC with non-empty GKV; every intra-usecase link (data-link OR control-link) must be in ≥1 UC's pair set; every subsystem must contain ≥1 SG that is a member of some UC. | Phase 10 (OrphanValidation) as warning + FR-COMMIT-01(c) as blocking safety net |
| **I6** | SGKV internal consistency — at most one KV pair per Key Definition per SGKV. | Phase 4 (KvResolution) — rejects malformed SGKVs |
| **I7** | Pair-link presence — an SG pair `(A, B)` may exist in a UC's pair set only if ≥1 intra-usecase link (data or control) is currently present between A and B. Underpins FR-STATUS-04 direction correction. | Phase 7 (DFS) at creation; Phase 2 (DeletionScope) at removal; FR-COMMIT-01 at commit |

**Two invariants worth emphasizing:**

**I5** is enforced twice — Phase 10 flags orphans as warnings so the UI can offer
autofix (delete); FR-COMMIT-01(c) at commit time makes it blocking. Two defenses
because a user can add graph elements between routing and commit without re-running
routing; the commit safety net is the only guard against that gap.

**I7** is what makes FR-STATUS-04 Step 1 direction correction sound. A pair *held only
by a control-link* has an arbitrary stored direction (smaller-SG-ID rule). When a
data-link later appears, its direction is authoritative and overrides the pair.
Without I7, we couldn't distinguish "held by control-link" (correctable) from
"orphaned pair" (impossible).

**Invariant vs FR.** Invariants are contracts on the persisted state. FRs are behaviors
that produce state consistent with those invariants. Every FR-DUP / FR-STATUS / FR-DEL
rule traces to at least one invariant.

**External invariants routing relies on (enforced upstream, not by routing):**

- **Link-type uniformity between SG pairs.** Between any two SGs, all links are of
  one type — either all `intra_usecase` OR all `inter_usecase`, never mixed. Enforced
  at link creation by the link-creation endpoint. Routing depends on this to simplify
  DFS traversal (Phase 7) and pair-existence checks (Phase 2 FR-DEL-06 multi-path)
  — it never has to handle mixed-type link sets between the same pair.

**Domain model — `Usecase.type`:** a single enum field on the `Usecase` entity with
three mutually exclusive values, **computed from the UC's pair set**:

- **`EC`** — pair set contains ≥1 `isEc=true` intra-usecase data-link. Applies to
  both new-scheme Bridge UCs (2-SG, one EC link) and legacy EC UCs (multi-SG, one
  EC link inside the path — plus the MDF-substituted exception with two flanking
  EC links surrounding an isMdf SG, per FR-EC-07 Rule C).
- **`ISLAND`** — pair set contains at least one pair with no data-link support
  (only a control-link, or created via manual UC with data-link fallback per FR-UC-01).
  Overrides `LINKED` when both conditions apply.
- **`LINKED`** — otherwise (all pairs data-link supported, no EC links).

**Terminology:** the canonical `Usecase.type` values are `LINKED`, `ISLAND`, and `EC`.
Older `Connected`/`Disconnected` labels are not valid use-case type values.

`type` transitions when the pair set changes: e.g., a legacy EC UC whose internal EC
link is deleted (and not MDF-substituted) transitions to `LINKED` (or
`ISLAND` if coverage breaks). Phase 11 (RoutingChangeStager) writes the
recomputed type as part of the UC update.

I1's uniqueness rule applies across all UC types — no two UCs in a file may share the
same GKV, whether `LINKED`, `ISLAND`, or `EC`. Bridge UC identity keys off
`gkv` for uniqueness; `(ecLinkId, leftSg, rightSg)` remains as metadata for the
FR-EC-06 deletion cascade but does not grant uniqueness independence. Same-GKV
collisions between an EC UC and a `LINKED`/`ISLAND` UC (or between two EC
Bridges from different EC connections) surface via FR-DUP-04 user-choice — see LLD5
§7.1 for the full dedup rules and FR-EC-07 for legacy EC UC interaction details.

---

## 8. Failure Modes & Error Contract

**Two axes:** *blocking vs non-blocking* (does the tx commit?) and *domain vs
infrastructure* (rule violation or systems failure?).

| Category | Trigger | HTTP | `ApiResult` shape | Transaction |
|---|---|---|---|---|
| Infrastructure | DB timeout, unexpected exception | 500 | `success=false, errors=[Internal]` | rollback |
| Session/mode | No active session, wrong mode | 400 / 403 | `success=false, errors=[SessionMissing]` | never opened |
| Chain resolver failure | Incomplete SLS/CSLS chain | 422 | `success=false, errors=[ChainIncomplete]` | rollback |
| Pre-validation blocking | FR-API-03, FR-API-07 addition side, FR-PREVAL-01/02 | 422 | `success=false, errors=[issue codes]` | rollback |
| Mid-pipeline blocking | FR-DEL-02, FR-API-07 deletion side, FR-DUP-04 (same-GKV user choice), FR-DFS-08, FR-EC-05, FR-MDF-01, stale MANUAL edit-action (see mode note below) | 422 | `success=false, errors=[issue codes]` | rollback |
| Warnings (routing time) | Orphans, cycles, islands | 200 | `success=true, data.issues=[WARN…]` | commit |
| Commit-time orphans | Any orphan detected at commit | 422 | `success=false, errors=[ARC-COMMIT-ORPHAN-*]` | commit rejected |

**Two-tier orphan handling.** At routing time, orphans are warnings — surfaced with
autofix hints so the user can act. At commit time, orphans are blocking (FR-COMMIT-01(c))
— persisting them would violate I5 permanently.

**Mode note on mid-pipeline errors.** Phases skipped in manual mode (2, 3, 5, 6, and 7)
cannot produce their error codes. Manual Phase 2 is a complete no-op and cannot produce
`ARC-ROUTING-DEL-02`. Phase 8 runs in manual mode, so
`ARC-ROUTING-DFS-08` remains possible when no valid KV combination exists.
`ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` (FR-DUP-04 same-GKV collision) can occur in
manual mode only via Phase 9's idempotency-only path when the newly created manual UC
collides with an existing DB UC by GKV without exact match — but in practice manual UC
creation is a single-UC event so this is rare. The stale MANUAL edit-action check
(`ARC-ROUTING-MANUAL-UC-BROKEN-DEPS`) is auto-mode only.

**Result<T> flow.**

1. Every phase returns `Result<void>`.
2. On `Result.fail(issues[])`, orchestrator halts — no downstream phase runs.
3. `RoutingEngine.run` returns fail up.
4. Handler catches, calls `uow.rollback()`, maps to `DomainRuleViolationException`.
5. Framework serializes to `ApiResult<never>` with codes in `errors[]`.

Warnings never fail the pipeline — they're appended to `context.warnings` and land in
`data.issues[]` on success.

**Issue code namespace.**

Blocking (surface in `errors[]`, HTTP 422):

- `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` — same-GKV collision requires user choice
  (FR-DUP-04). Detected at Phase 9 when two candidates share a GKV and do not match
  FR-DUP-03(a) exact-match or FR-DUP-03(b1) identity-preserving interior extension.
  Payload: `fixOptions` array with `ResolveSameGkvCollisionCommand` entries carrying
  `{mode, collisionId}`. Applies to all UC types (`LINKED`, `ISLAND`, `EC`)
  — no type-based exemption; EC-vs-`LINKED` coincidental collisions and EC-vs-EC
  (different connections) surface through the same rule.
- `ARC-ROUTING-SAME-GKV-CHOICE-STALE` — user's chosen fix option is no longer
  algorithm-generateable against the current graph state. Returned by the apply-fix
  handler for `ResolveSameGkvCollisionCommand` when the chosen path can no longer be
  reproduced. User must re-invoke `create-usecases` to obtain fresh FixOptions.
- `ARC-ROUTING-MANUAL-UC-BROKEN-DEPS` — routing-time stale-manual-UC pre-check
  detected at least one `source=MANUAL AND target_table='UseCase' AND operation IN
  ('CREATE','UPDATE')` edit-action whose `referencedComponents` are absent from the
  effective graph. Runs before Phase 9 Classification. Autofix: remove the flagged
  edit-action rows. Mirrors `ARC-COMMIT-MANUAL-UC-BROKEN-DEPS` at routing time.
- `ARC-ROUTING-DFS-08` — no valid KV combinations
- `ARC-ROUTING-EC-05` — EC violation
- `ARC-ROUTING-MDF-01` — MDF KV-assigned conflict
- `ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT` — a current-session added/deleted SG or
  link was explicitly excluded, or an added/deleted data-link lacks a required active,
  non-excluded endpoint SG (FR-API-07)
- `ARC-ROUTING-PREVAL-*` — pre-validation
- `ARC-ROUTING-DEL-02` — full affected-UC set is not selected; payload includes the
  full affected set and missing subset
- `ARC-ROUTING-CHAIN-INCOMPLETE` — SLS/CSLS pre-step
- `ARC-COMMIT-ORPHAN-*` — commit-time orphan rejection
- `ARC-COMMIT-MANUAL-UC-BROKEN-DEPS` — commit-time manual UC referential integrity
  failure (FR-COMMIT-01(d)); autofix hint = "delete the manual UC edit-action rows."
  Detection query: `source = 'MANUAL' AND target_table = 'UseCase' AND operation IN
  ('CREATE','UPDATE')`; each matching edit-action carries a
  `referencedComponents: {sgSystemIds, dataLinkSystemIds, controlLinkSystemIds}`
  payload populated at edit-action creation time — all listed components must still
  exist post-commit. `operation='DELETE'` edit-actions are not subject to this check
  (a DELETE targeting an already-absent UC is silently a no-op).

Warnings (surface in `data.issues[]`, HTTP 200):

- `ARC-ROUTING-ORPHAN-SUBGRAPH` (autofix=delete)
- `ARC-ROUTING-ORPHAN-SUBSYSTEM` (autofix=delete)
- `ARC-ROUTING-ORPHAN-INTRA-LINK` (autofix=delete) — data-link and control-link;
  `impactedEntity.linkKind` distinguishes
- `ARC-ROUTING-ORPHAN-SG-HAS-KVS` (hint=create-manual-usecases) — an orphan SG with
  non-empty effective SGKV instances after auto routing. Suggests the user create a
  stand-alone UC via the manual workflow (FR-UC-01) rather than deleting the SG.
  Non-blocking; user may still accept the orphan or use the standard delete flow.
- `ARC-ROUTING-CYCLE-DETECTED`
- `ARC-ROUTING-ISLAND-DETECTED`
- `ARC-ROUTING-UC-AUTO-ISLAND` — `LINKED` UC auto-transitioned to `ISLAND`
  because a data-link was deleted while a control-link remained between the same SGs
  (FR-STATUS-02(b)); payload lists degraded pairs so the user can decide whether to
  also remove the control-link.

Every issue carries an `impactedEntity` payload (SG / subsystem / link systemId + kind,
or UC systemId) so the client can wire the FR-VAL-01 dialog off code + entity.

**Three design guarantees.**

1. **No partial results.** On blocking failure, no `edit_actions` persist. Client sees
   full success DTO or failure envelope — never half-built.
2. **Rollback covers the pre-step.** Chain resolver's staged link writes are in the
   same tx. Failure mid-pipeline rolls those back too.
3. **Infra exceptions never leak.** Uncaught `Error` → `ARC-INTERNAL` at framework
   layer. Stack traces log server-side; client sees only opaque code.

**Deliberate choice — cycles and islands are warnings, not blockers.** FR-DFS-04 keeps
the "warn + emit path as leaf" behavior. Blocking on cycle kills discoverability
during design.

---

## 9. Performance & Concurrency

**Target (NFR-PERF-01):** <100ms for 30 SGs / 50 intra-usecase links. Beyond that
scale, graceful degradation — no explicit target.

**Budget shape.** Phases 7 (DFS) and 8 (Combination Expansion) dominate. Everything
else is under 10ms per phase in aggregate. Half A (Phases 1–3, pre-routing) is
particularly cheap — its cost is bounded by `graphEdits` size and impacted-UC count,
not by graph size. LLD2 will refine the DFS budget with measurements.

**Four bounding levers stop worst-case blowup:**

1. **Cone bound (Phase 6)** — DFS searches only within the cone around a seed.
2. **DFS depth cap (Phase 7)** — hard limit per FR-DFS-01; cycles emit-as-leaf.
3. **Combination prune (Phase 8)** — reject conflicting KVs at earliest point of
   conflict, not after enumeration.
4. **Session-scope edits (Phase 5)** — `graphEdits` bounded by edit count, not graph
   size.

**Fail-fast lever.** Phase 2 (DeletionScope) rejects FR-DEL-02 violations before Half B
runs. If the caller omitted any UC requiring deletion, structural mutation, or type
degradation from `selectedUsecaseSystemIds`, the call returns HTTP 422 with the full
affected set and missing subset instead of running full DFS first.

**Concurrency model:**

- **Single session per file.** Enforced by session table + `SessionGuard`.
- **No concurrent mutations in the same active file session.** Calls are assumed
  sequential through command completion and the immediate change-details projection;
  this design adds no revision check or fine-grained lock.
- **Different files in parallel** — fine, no shared state.
- **Session-mode gating** — `BaseCommand.allowedModes` restricts to `[DESIGNER, DIFF_MERGE]`.

**RoutingContext memory footprint** at target scale is approximately 150 KB per
request. Dominant field is `combinations` (~100 KB worst case).

**Statelessness (NFR-STAT-01).** `RoutingEngine` and its phase services hold no
long-lived state. Same process handles N parallel requests for different files with
zero cross-request coupling.

**Design levers deliberately NOT pulled:**

- Caching cones between calls — would break statelessness and idempotency.
- Background/async phases — would change error semantics (partial commits).
- Cross-file batching — no use case; each file is user-scoped.

Revisit these only if real workloads consistently exceed 30/50 and 100ms.

---

## 10. Non-Functional Requirements Summary

| NFR | Requirement | How the design meets it |
|---|---|---|
| NFR-PERF-01 | <100ms for 30 SGs / 50 links | Bounded cones, capped DFS depth, combination pruning, session-scoped edit delta |
| NFR-CONSIST-01 | All writes in a single tx | Handler owns tx boundary; chain resolver + pipeline share the same UoW |
| NFR-STAT-01 | Stateless HTTP layer | RoutingEngine holds no long-lived state; all request state in `RoutingContext` and `UnitOfWork` |

---

## 11. Out of Scope

Per the frozen requirements §6:

- **Nested usecase preservation** across sessions — deferred.
- **MDF V2 implicit intermediate subgraphs** — deferred.
- **UI/UX implementation details** — not part of this spec.
- **Concurrent routing sessions on the same file** — out of scope; single-session model.
- **Control links as DFS traversal targets** — DFS is data-link driven. Control links
  hold pairs only in manual UC creation (FR-UC-01 step 4).

**In scope for this delivery** (previously listed here as out-of-scope; corrected 2026-08-10):
- EC (Echo Cancellation) routing — 3-UC generation for Rx/Tx domain bridges. Owned by LLD5.
- MDF single-rule support (FR-MDF-01 IsMdf attribute) — folded into plan.
- Structural UC replacement (FR-UC-UPDATE-01) — delivered as a separate write API
  after the routing and commit-safety chapters. It reuses manual SGKV/GKV validation
  but is not a third mode of the 12-phase routing pipeline.

---

## 12. LLD Map

Selective LLD strategy: only the algorithm-heavy phases get their own LLD. Rule-driven
phases (Classification, OrphanValidation, EC/MDF, DTO/adapter shapes) fold directly
into the implementation plan.

| LLD | File | Owns |
|---|---|---|
| — (handler pre-step) | see §2, §3 | FR-PREVAL-03 (SLS/CSLS chain resolution). Consumed via `IChainResolver` port; owned by the subsystem-links module. |
| LLD1 | `lld1-kv-resolution-cone.md` | Handler addition-side closure plus Phases 1, 4, 5, 6: PreValidation, KvResolution, SeedDetection, ConeComputation. FR-PREVAL-01/02, FR-API-03, FR-API-07 addition side, FR-KV-01/02/03, FR-CONE-01..07 |
| LLD2 | `lld2-dfs-core.md` | Phases 7–8: DFS routing and combination expansion. FR-DFS-01..09 |
| LLD4 | `lld4-deletion-transition.md` | Phases 2–3: DeletionScope and `IslandTransitionService` (`ISLAND` → `LINKED`). FR-DEL-01..06, FR-VAL-04, FR-API-07 deletion side with FR-DEL-02 precedence, FR-STATUS-04, FR-EXT-01..03 |
| LLD5 | `lld5-ec-routing.md` | EC (Echo Cancellation) routing: detection, DFS boundary override, 3-UC generation, Bridge KV compatibility, single-EC-per-path, EC bridge lifecycle, legacy EC UC compatibility (Bridge suppression, cross-EC reconstruction delegation, max-1-EC-per-UC with MDF exception, type recomputation). FR-EC-01..07 |
| — (folded into plan) | — | Phase 9 Classification + Phase 10 OrphanValidation: FR-DUP-03(a) exact-match no-op + FR-DUP-03(b1) identity-preserving interior extension silent auto-update + FR-DUP-04 same-GKV user-choice collision handling (including `ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED` issue emission, apply-fix command, re-run recognition via GKV+SG+pair match against `source=MANUAL` edit-actions, Phase 9 pre-check for stale MANUAL edit-actions emitting `ARC-ROUTING-MANUAL-UC-BROKEN-DEPS`), FR-VAL-01/02/03, FR-LIFE-01/02/03, FR-STATUS-01/02/03. Rule-driven; the plan carries the rule table directly. Also folds in FR-EC-07 Rule D (Phase 11 emission of reconstruction-updated UCs and un-marking from `markedForDeletion` on FR-DUP-03(b1) match) and FR-EC-07 Rule E (recomputing `Usecase.type` from pair set at Phase 11 stager). |
| — (folded into plan) | — | Phase 11 RoutingChangeStager + Phase 12 ResponseBuilder + DTO/adapter shapes: FR-KV-COMMIT-01/02/03. MDF single rule (FR-MDF-01). Manual UC creation flow (FR-UC-01) including server-side pair discovery via `IDataLinkRepository.findLinksByPair` + control-link fallback per FR-UC-01 step 4 with smaller-SG-ID direction rule and isolated-SG warning. `degradedToIsland` UC updates from FR-STATUS-02(b) emit `usecaseRepo.update(uc, {type: 'ISLAND'})` plus the `ARC-ROUTING-UC-AUTO-ISLAND` warning. |
| — (folded into plan) | — | Structural UC replacement API (FR-UC-UPDATE-01): separate PUT handler; shared manual SGKV/GKV validation; atomic GKV + SG + pair replacement; no new routing-engine mode. |
| — (not owned by this feature) | — | `FR-STAGE-01` (orphan handling on stage API) is owned by the edit-crud stage-changes handler, not this feature. Same for `FR-COMMIT-01` — commit safety-net contract, including (b2) affected-existing-UC validation after staged deletion; enforced at `POST /commit-changes` by the edit-crud commit LLD. This feature only defines the contract those handlers must uphold. |

Commit-time safety net (FR-COMMIT-01) is not owned by this feature's LLDs — it's a
contract on the edit-crud commit LLD.

---

## 13. References

**Diagrams:**
- [`diagrams/01-context-and-module-boundaries.md`](./diagrams/01-context-and-module-boundaries.md)
- [`diagrams/02-phased-pipeline-overview.md`](./diagrams/02-phased-pipeline-overview.md)
- [`diagrams/03-routing-context-data-flow.md`](./diagrams/03-routing-context-data-flow.md)

**Requirements:**
- [`../2026-06-01-auto-usecase-routing-requirements.md`](../2026-06-01-auto-usecase-routing-requirements.md)
- [`../2026-06-02-auto-usecase-routing-requirements-extended.md`](../2026-06-02-auto-usecase-routing-requirements-extended.md)

**Edit-CRUD framework (referenced throughout):**
- [`../../edit-crud/overall-design.md`](../../edit-crud/overall-design.md)
- [`../../edit-crud/foundation.md`](../../edit-crud/foundation.md)
- [`../../edit-crud/module-write-path.md`](../../edit-crud/module-write-path.md)

**Reference implementation pattern:**
- `packages/core/src/application/usecase-designer/spf-module/patch/patch-spf-module.handler.ts`
