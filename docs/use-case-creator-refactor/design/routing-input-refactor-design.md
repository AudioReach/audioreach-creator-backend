# Routing Input Refactor: Inclusion-Based API

## 1. Background

The current `create-usecases` and `create-manual-usecases` endpoints accept:

```typescript
{
  selectedUsecaseSystemIds: string[];       // existing usecases in scope
  activeSubgraphs: SubgraphKvSelectionDto[];
  excludedDataLinkSystemIds?: string[];
  excludedControlLinkSystemIds?: string[];
  excludedSubgraphSystemIds?: string[];
}
```

This contract has two problems for open-source and MCP usage:

1. **Client must know server state.** The caller must query existing usecases, determine which
   ones are affected, and pass their IDs. An MCP agent cannot do this without an extra round-trip.

2. **Exclusion semantics are overloaded.** `selectedUsecaseSystemIds` serves as scope
   authorization, deletion acknowledgement, KV baseline, and seed signal simultaneously. Exclusions
   invert the mental model: the caller lists what to remove rather than what to include.

This document describes the refactor to an **inclusion-based** contract that is simpler for MCP
clients while preserving full precision for UI clients through an optional parameter.

---

## 2. Requirements

### Functional

- **FR-01** Both endpoints accept an inclusion-based contract: `activeSubgraphs`,
  `includedDataLinkSystemIds`, and `includedControlLinkSystemIds`. No exclusion fields.
- **FR-02** The automatic endpoint accepts an optional `usecaseSystemIds`. When provided the
  engine uses incremental seed behavior. When omitted all provided subgraphs are seeds.
- **FR-03** The manual endpoint does **not** accept `usecaseSystemIds`. The supplied links are
  the complete topology for this call.
- **FR-04** The request declares the complete routing scope. `activeSubgraphs` is the positive
  subgraph allowlist; the included link arrays are positive link allowlists. Omitted subgraphs and
  links are excluded from that routing run. For automatic routing, effective session additions
  must also be present in this declared scope. Manual routing has no all-session addition-closure
  requirement because a session may span multiple separate manual creation calls.
- **FR-05** Automatic routing always validates deletion closure: every surviving item belonging
  to a deletion-impacted committed usecase must be present in the positive request scope. When
  `usecaseSystemIds` is provided, the server additionally requires every affected usecase ID to
  be present in that list before checking closure.
- **FR-06** `ManualPairDiscoveryService`, `ManualCandidateRelationshipBuilder`, and
  `ManualLinkSupportResolver` are removed. The server loads supplied links from the DB,
  validates them, and assembles `ManualTopology` directly.
- **FR-07** Both handlers are changed in a single refactor. No intermediate state where one
  handler uses the new contract and the other uses the old.
- **FR-08** Collision replay preserves the new input format exactly.
- **FR-09** The two included-link arrays accept canonical link IDs and subsystem segment IDs. A
  shared Phase 0 preprocessing step resolves all subsystem chains, maps each supplied ID to its
  canonical DataLink/ControlLink ID, removes duplicates, and exposes only canonical IDs to
  downstream routing.

### Non-Functional

- **NFR-01** The MCP-facing API never exposes `usecaseSystemIds`.
- **NFR-02** DFS, classification, and staging behavior remains unchanged; Phase 10 gains only the
  file-wide inter-usecase endpoint integrity check.
- **NFR-03** All breaking API changes happen in one release boundary.

---

## 3. Decisions

| Question | Decision |
|---|---|
| Input model | Inclusion-based; exclusions removed |
| Automatic `usecaseSystemIds` | Optional — UI passes it, MCP omits |
| Manual `usecaseSystemIds` | Not accepted |
| Manual topology source | Client-supplied links loaded from DB |
| Manual addition closure | Not required (session spans multiple calls) |
| Auto addition closure | Required — all effective session-added routing-eligible intra-usecase links |
| Link scope | Full positive allowlist, not only links added in the session |
| Eligible routing links | Intra-usecase data and control links only |
| Intra-subgraph and inter-usecase links | Do not participate in routing |
| Subsystem link input | Uses the same included-link arrays; resolved to canonical IDs in Phase 0 |
| Auto deletion gate (`usecaseSystemIds` provided) | Selection check then inclusion-closure check; MdfNormalization excluded from affected set |
| Auto deletion gate (`usecaseSystemIds` omitted) | Inclusion-closure check only; MdfNormalization excluded from affected set |
| Manual Phase 2 | Short-circuit unchanged — no deletion analysis |
| `ManualPairDiscoveryService` | Removed |
| Single vs. phased refactor | Single — avoids dual-contract maintenance |

---

## 4. New API Contracts

### 4.1 Automatic — `POST .../create-usecases`

```typescript
// CreateUsecasesRequestDto
{
  activeSubgraphs: Array<{
    systemId: string;
    valueSystemIds: string[][];
  }>; 
  usecaseSystemIds?: string[];             // optional; UI passes, MCP omits
  includedDataLinkSystemIds: string[];     // canonical or subsystem-segment IDs
  includedControlLinkSystemIds: string[];  // canonical or subsystem-segment IDs
}
```

The two arrays declare the complete link scope. Each ID may identify a canonical link or one of its
subsystem segments. Phase 0 normalizes both representations to canonical IDs before routing. An
intra-usecase link omitted from the normalized allowlists is excluded even when both endpoint
subgraphs are active.

Intra-subgraph and inter-usecase links do not participate in usecase route discovery and are not
required in these arrays.

### 4.2 Manual — `POST .../create-manual-usecases`

```typescript
// CreateManualUsecasesRequestDto
{
  activeSubgraphs: Array<{
    systemId: string;
    valueSystemIds: string[][];
  }>;
  // no usecaseSystemIds
  includedDataLinkSystemIds: string[];     // canonical or subsystem-segment IDs
  includedControlLinkSystemIds: string[];  // canonical or subsystem-segment IDs
}
```

The supplied canonical and subsystem link IDs together define the complete topology for this
single manual creation call. Multiple manual calls in the same session may each carry a different
subset of links.

---

## 5. Core Contract Changes

### 5.1 `RoutingCommandInput`

```typescript
// packages/core/src/application/usecase-designer/use-case-creator/contracts/routing-command-input.ts

// BEFORE
export interface RoutingCommandInput {
  readonly selectedUsecaseSystemIds: readonly string[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelectionInput[];
  readonly excludedDataLinkSystemIds?: readonly string[];
  readonly excludedControlLinkSystemIds?: readonly string[];
  readonly excludedSubgraphSystemIds?: readonly string[];
}

// AFTER
export interface RoutingCommandInput {
  readonly activeSubgraphs: readonly ActiveSubgraphSelectionInput[];
  readonly includedDataLinkSystemIds: readonly string[];
  readonly includedControlLinkSystemIds: readonly string[];
}

export interface AutoRoutingCommandInput extends RoutingCommandInput {
  readonly usecaseSystemIds?: readonly string[];        // optional
}
// Manual does not extend with usecaseSystemIds
// No intermediate parsed type — resolveRoutingLinkSelection converts raw
// strings to canonical RoutingSelection in one atomic step.
```

### 5.2 `RoutingSelection`

```typescript
// packages/core/src/application/usecase-designer/use-case-creator/contracts/routing-input.ts

// BEFORE
export interface RoutingSelection {
  readonly selectedUsecaseSystemIds: readonly number[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedSubgraphSystemIds: readonly number[];
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
}

// AFTER — canonical downstream representation after Phase 0 normalization
export interface RoutingSelection {
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly includedDataLinkSystemIds: readonly number[];
  readonly includedControlLinkSystemIds: readonly number[];
  readonly selectedUsecaseSystemIds?: readonly number[];   // auto only, optional
}
```

`excludedSubgraphSystemIds` is removed entirely. Subgraph scope is now purely
`activeSubgraphs`. There is no exclusion list.

Subsystem segment IDs intentionally do not appear in `RoutingSelection`. They exist only in the
raw command selection and are normalized to canonical IDs before snapshot preparation. This keeps
all engine phases independent of subsystem representation.

### 5.3 `parseRoutingCommandInput` — removed

`parseRoutingCommandInput` and the two split variants are **removed**. Commands store
`RoutingCommandInput` with raw string IDs. `resolveRoutingLinkSelection` (§6.1) does
both parsing and resolution in one atomic DB-backed step, returning a canonical
`RoutingSelection` directly.

Commands no longer own the parse step, keeping them as pure value objects with no
business logic in their constructors.

### 5.4 Collision Replay Schema (`fix-command-input.ts`)

```typescript
// BEFORE
const replayInputSchema = z.object({
  selectedUsecaseSystemIds: z.array(z.number().int()),
  activeSubgraphs: ...,
  excludedSubgraphSystemIds: ...,
  excludedDataLinkSystemIds: ...,
  excludedControlLinkSystemIds: ...,
});

// AFTER
const replayInputSchema = z.object({
  activeSubgraphs: ...,
  includedDataLinkSystemIds: z.array(z.number().int()),
  includedControlLinkSystemIds: z.array(z.number().int()),
  selectedUsecaseSystemIds: z.array(z.number().int()).optional(),
});
```

The replay payload stores the normalized canonical format, not subsystem segment IDs. This makes
replay independent of which subsystem segment the UI originally selected while preserving the
same topology and GKV context.

---

## 6. Preparation Layer

### 6.1 Phase 0: subsystem-link resolution and input normalization

Both handlers first call `SubsystemLinkResolutionService.resolveAllChains(uow)`. After
successful chain resolution, `resolveRoutingLinkSelection` parses raw string IDs and
resolves any subsystem segment IDs to canonical link IDs in one atomic step:

```typescript
export async function resolveRoutingLinkSelection(
  fileSystemId: number,
  input: RoutingCommandInput,   // raw strings from command — auto or manual
  uow: UnitOfWork,
): Promise<Result<RoutingSelection>> {
  // 1. parseId() each string to number.
  // 2. Resolve each numeric ID from the effective canonical-link or
  //    subsystem-segment view. Cross-table system IDs are globally unique per file.
  // 3. For a subsystem segment, require a non-null canonical parent ID.
  // 4. Verify the canonical DataLink/ControlLink exists in the effective overlay.
  // 5. Validate every canonical link is intra-usecase with two distinct SG endpoints.
  // 6. Deduplicate canonical IDs (Set).
  // 7. Return a RoutingSelection containing canonical IDs only.
}
```

Resolution order is mandatory:

```text
resolve all subsystem chains
  -> map supplied subsystem segment IDs to canonical link IDs
  -> validate canonical links in the effective DB overlay
  -> build the routing snapshot
```

An unknown or ambiguous ID, unresolved segment (`dataLinkSystemId`/`controlLinkSystemId` is
`null`), wrong-file entity, missing/deleted canonical parent, intra-subgraph link, or inter-usecase
link causes a domain validation failure before snapshot construction. Downstream code never
inspects subsystem IDs.

This normalization consumes the repository mapping APIs delivered by the deferred Phase 0/PR 9.5
work. It does not duplicate subsystem-chain discovery inside the routing-input refactor.

### 6.2 Effective subgraph filtering

`resolveActiveSubgraphSelection` and the `ActiveSubgraphResolution` return type are
**removed**. The duplicate-subgraph check already runs in both handlers before the
transaction opens (`findDuplicateActiveSubgraphSystemIds`). The only remaining work —
removing session-deleted subgraphs from scope — is inlined in `prepareRoutingSnapshot`:

```typescript
const deletedSgIds = new Set(
  graphEdits.deletedSgs.map(sg => sg.systemId),
);
const effectiveActiveSubgraphs = selection.activeSubgraphs.filter(
  sg => !deletedSgIds.has(sg.systemId),
);
```

`effectiveActiveSubgraphs` is passed directly to `RoutingGraphSnapshotBuilder.build()`.
No wrapper function or intermediate type is needed.

### 6.3 `validateRoutingAdditionClosure` — Auto Only

Renamed to `validateAutoRoutingAdditionClosure` to make the auto-only scope explicit.

```
Effective session additions =
  addedSubgraphs not deleted in same session
  + addedIntraUsecaseDataLinks not deleted in same session
  + addedIntraUsecaseControlLinks not deleted in same session

Rule:
  every effectiveAddedSubgraph ∈ activeSubgraphs
  every effectiveAddedIntraUsecaseDataLink ∈ includedDataLinkSystemIds
  every effectiveAddedIntraUsecaseControlLink ∈ includedControlLinkSystemIds
  every endpoint of each included link ∈ activeSubgraphs
```

The request arrays are the complete link scope, not only an additions list. This closure adds one
automatic-mode invariant: graph modifications made during the current session cannot be hidden by
omitting them. Intra-subgraph and inter-usecase links are outside usecase routing and are ignored by
this closure.

Manual routing does **not** call this function.

### 6.4 Phase 2 deletion gate — replaces `validateAutomaticRoutingSelectionsAndExclusions`

The existing gate has two independent concerns:

1. **Selection check** — every affected usecase must be in `selectedUsecaseSystemIds`.
2. **Exclusion-conflict check** — excluded items must not hide or conflict with deleted items.

In the new model, concern 2 disappears entirely — there are no exclusions.
Concern 1 becomes an inclusion-closure check: the client's declared scope must cover
every affected usecase's surviving topology so the router can make correct decisions.

The gate still runs inside Phase 2, **after decisions are built**, so it uses
`deriveAffectedUsecaseSystemIds` which already excludes `MdfNormalization` decisions.
MDF-normalized usecases remain automatically handled — no user acknowledgement required.

**New gate input:**

```typescript
interface AutoDeletionGateInput {
  readonly selectedUsecaseSystemIds?: ReadonlySet<number>;  // from usecaseSystemIds if provided
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;   // MdfNormalization excluded
  readonly affectedUsecases: readonly UseCase[];
  readonly activeSubgraphSystemIds: ReadonlySet<number>;
  readonly includedDataLinkSystemIds: ReadonlySet<number>;
  readonly includedControlLinkSystemIds: ReadonlySet<number>;
  readonly overlayDataLinks: readonly DataLink[];
  readonly overlayControlLinks: readonly ControlLink[];
  readonly deletedDataLinkSystemIds: ReadonlySet<number>;
  readonly deletedControlLinkSystemIds: ReadonlySet<number>;
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
}
```

**Gate logic (ordered):**

```
1. If selectedUsecaseSystemIds provided:
     missing = affectedUsecaseSystemIds - selectedUsecaseSystemIds
     if missing → deletionSelectionRequired  (precedence unchanged)

2. For each affected usecase:
     survivingSgs =
       usecase.subgraphSystemIds - deletedSubgraphSystemIds

     survivingDataLinks =
       overlayDataLinks
       where both endpoints ∈ usecase.subgraphSystemIds
       and systemId ∉ deletedDataLinkSystemIds

     survivingControlLinks =
       overlayControlLinks
       where both endpoints ∈ usecase.subgraphSystemIds
       and systemId ∉ deletedControlLinkSystemIds

3. Check:
     every survivingSg ∈ activeSubgraphSystemIds
     every survivingDataLink ∈ includedDataLinkSystemIds
     every survivingControlLink ∈ includedControlLinkSystemIds

4. If any required item is missing →
     DELETION_SCOPE_INCOMPLETE {
       affectedUsecaseSystemIds,
       missingSubgraphSystemIds,
       missingDataLinkSystemIds,
       missingControlLinkSystemIds,
     }
```

The check uses the final overlay once across all affected usecases — order-independent.
`validateAutomaticRoutingSelectionsAndExclusions` in `topology-gate-validator.ts` is
replaced by this gate; `editScopeConflict` (exclusion-conflict error code) is retired.

### 6.5 `prepareRoutingSnapshot`

```typescript
export interface PrepareRoutingSnapshotParams {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
  readonly selectedUsecases: readonly UseCase[];      // [] when usecaseSystemIds omitted
  readonly graphEdits: GraphEditSummary;
  readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[];
  readonly isManual: boolean;                         // skip addition closure when true
}
```

Steps:

1. Receive an already normalized `RoutingSelection` containing canonical link IDs only.
2. Filter session-deleted subgraphs from scope (inline, see §6.2).
3. If `!isManual`: call `validateAutoRoutingAdditionClosure`.
4. Build snapshot via `RoutingGraphSnapshotBuilder`.

Deletion gate runs later inside Phase 2 after decisions are built (see §6.4).

### 6.6 `RoutingGraphSnapshotBuilder`

Current routable-link filtering subtracts excluded IDs. New filtering uses positive allowlists:

```typescript
function isRoutable(
  link: DataLink | ControlLink,
  effectiveIds: ReadonlySet<number>,
  includedLinkIds: ReadonlySet<number>,
): boolean {
  return isInScope(link, effectiveIds) && includedLinkIds.has(link.systemId);
}
```

Only explicitly included intra-usecase links with both endpoints in `activeSubgraphs` are routable.
An existing DB link omitted by the client is excluded for this run. Complete overlay catalogs remain
available for deletion-impact and integrity analysis so omission is never confused with deletion.

Intra-subgraph and inter-usecase links do not enter usecase route discovery. The cone computation's
inter-usecase guard remains as a defensive invariant.

---

## 7. Automatic Routing Path

### 7.1 `AutoRoutingPreparationService`

```typescript
async prepare(command: AutoRoutingPreparationInput, uow: UnitOfWork) {
  const chainResolution = await subsystemLinkResolutionService.resolveAllChains(uow);
  // Parse string IDs + resolve subsystem segments to canonical link IDs in one step.
  const selectionResult = await resolveRoutingLinkSelection(
    command.fileSystemId,
    command.input,   // RoutingCommandInput with raw strings
    uow,
  );
  if (selectionResult.kind === RESULT_KIND.Fail)
    throw new DomainRuleViolationException(selectionResult.issues);
  const selection = selectionResult.data;  // canonical RoutingSelection
  const usecases = selection.selectedUsecaseSystemIds?.length
    ? await usecaseRepository.findBySystemIds(
        command.fileSystemId,
        selection.selectedUsecaseSystemIds,
      )
    : [];                                // empty → all-seeds path

  // rest unchanged: clear AUTO_ROUTING edits, read graph edits,
  // load manual edits, call prepareRoutingSnapshot with normalized selection
}
```

### 7.2 Seed behavior (no code change needed)

`SeedDetectionPhase` already handles both cases:

```typescript
// seed-detection.phase.ts:161-168 — unchanged
if (context.input.selectedUsecases.length === 0) {
  addNoUsecaseSeeds(accumulator, effectiveScope);   // all SGs seeded
} else {
  addKvChangeSeeds(...);                            // incremental seeds
  addNewSubgraphSeeds(...);
  addLinkSeeds(...);
  addOutOfSelectionSeeds(...);
}
```

No engine phase changes needed for this behavior.

---

## 8. Manual Routing Path

### 8.1 Handler changes

`CreateManualUsecasesHandler` drops `ManualPairDiscoveryService` and
calls a new `assembleManualTopology` function instead.

```typescript
// Replaces: pairDiscovery.discover(...)
const topology = await assembleManualTopology(
  command.fileSystemId,
  normalizedSelection.includedDataLinkSystemIds,
  normalizedSelection.includedControlLinkSystemIds,
  new Set(graphSnapshot.subgraphs.map(s => s.subgraph.systemId)),
  uow,
);
if (topology.kind === RESULT_KIND.Fail)
  throw new DomainRuleViolationException(topology.issues);
```

### 8.2 `assembleManualTopology` (new function, replaces discovery)

```typescript
export async function assembleManualTopology(
  fileSystemId: number,
  includedDataLinkSystemIds: readonly number[],
  includedControlLinkSystemIds: readonly number[],
  activeSubgraphSystemIds: ReadonlySet<number>,
  uow: UnitOfWork,
): Promise<Result<ManualTopology>> {
    // 1. Load data links by ID from DB overlay
    // 2. Load control links by ID from DB overlay
    // 3. Validate each link:
    //    - exists in this file
    //    - not session-deleted
    //    - is an intra-usecase link (not intra-subgraph or inter-usecase)
    //    - both endpoints ∈ activeSubgraphSystemIds
    // 4. Canonicalize control links (undirected: lower port ID first)
    // 5. Run DirectedCycleDetector on data links
    // 6. Build ManualTopologyPair[] from validated links
    // 7. Return Result<ManualTopology>
}

### 8.3 Removed components

The following are deleted:

- `ManualPairDiscoveryService`
- `ManualCandidateRelationshipBuilder`
- `ManualLinkSupportResolver`

Cycle detection (`DirectedCycleDetector`) is retained and called from `assembleManualTopology`.
The handler calls `resolveRoutingLinkSelection` before invoking the assembler function,
following the same Phase 0 flow as automatic routing.

### 8.4 Phase 2 short-circuit

Unchanged:

```typescript
// topology-change-analysis.phase.ts — unchanged
if (context.input.mode === ROUTING_MODE.Manual) {
  context.topologyChangeAnalysis = {
    affectedUsecaseSystemIds: new Set(),
    decisions: [],
  };
  return Result.ok();
}
```

---

## 9. Engine Phases: Impact Summary

| Phase | Change |
|---|---|
| Phase 1 — Pre-validation | None |
| Phase 2 — Topology change analysis | Gate replaced: inclusion-closure check (§6.4); MdfNormalization carve-out preserved; exclusion-conflict checks removed |
| Phase 3 — Island transition | None |
| Phase 4 — KV resolution | `ucFilteredBaseline` built from `selectedUsecases` (empty when omitted); `addNoUsecaseSeeds` path already handles empty |
| Phase 5 — Seed detection | None — existing branch handles empty `selectedUsecases` |
| Phase 6 — Cone computation | Uses only explicitly included intra-usecase data links; defensive inter-usecase skip remains |
| Phase 7 — DFS routing | None |
| Phase 8 — Combination expansion | None |
| Phase 9 — Classification | None — GKV bucket matching works with empty `selectedUsecases` |
| Phase 10 — Orphan validation | **Extended**: add inter-usecase endpoint coverage check (see §9.1) |
| Phase 11 — Routing change staging | None |
| Phase 12 — Response builder | None |

The engine changes are limited to one additional check in Phase 10. All other changes are in the
preparation layer and input contract.

### 9.1 Phase 10 — Inter-Usecase Endpoint Coverage Check

Inter-usecase links are not orphans — they do not belong to any single usecase. However, each
endpoint subgraph must be a member of at least one usecase in the committed result. If an
endpoint has no covering usecase the link becomes unresolvable.

**Check (applies to both auto and manual):**

```
finalUsecaseSubgraphIds =
  { sg.systemId | sg ∈ members of any classified or preserved usecase }

For each effective inter-usecase data or control link in the file-wide overlay:
  link.sourceSubgraphSystemId ∈ finalUsecaseSubgraphIds  →  pass
  link.destSubgraphSystemId   ∈ finalUsecaseSubgraphIds  →  pass
  otherwise → hard failure: interUsecaseEndpointUncovered {
    linkSystemId,
    uncoveredSubgraphSystemId,
  }
```

This is a **hard failure**, not a warning. An uncovered endpoint means the routing result is
incomplete in the projected file state. The caller must ensure both endpoint subgraphs are covered
by a preserved or newly created usecase before commit.

**Where it runs:** inside `OrphanValidationPhase.run`, as a second check after the existing
intra-usecase orphan scans. It scans the complete effective inter-usecase overlay rather than a
request list, and compares endpoints with the final usecase membership set derived from
`context.classifiedUcs` plus preserved and MDF-normalized decisions from
`context.topologyChangeAnalysis`.

---

## 10. Files Impacted

### Packages/api

| File | Change |
|---|---|
| `dto/create-usecases-request.dto.ts` | Remove excluded fields, add included fields, add optional `usecaseSystemIds` |
| `dto/create-manual-usecases-request.dto.ts` | Remove selected usecases and excluded fields, add included fields |
| `project.controller.ts` (two handlers) | Updated field mapping |

### Packages/core — contracts

| File | Change |
|---|---|
| `contracts/routing-command-input.ts` | New split interface; `parseRoutingCommandInput` removed — resolver handles parsing |
| `contracts/routing-input.ts` | `RoutingSelection` — remove excluded fields, add included, optional selected usecases; update `copyRoutingSelection`; remove `resolveActiveSubgraphSelection` and `ActiveSubgraphResolution` |
| `contracts/fix-command-input.ts` | Updated replay schema |

### Packages/core — services

| File | Change |
|---|---|
| `services/prepare-routing-snapshot.ts` | Updated params, conditional closure calls |
| `services/auto-routing-preparation.service.ts` | Conditional usecase load |
| `services/subsystem-link-resolution.service.ts` | Phase 0 chain resolution remains first preprocessing operation; consumes PR 9.5 repository APIs |
| `services/routing-link-selection-resolver.ts` | **New** — `resolveRoutingLinkSelection` function: parse string IDs and resolve subsystem segments to canonical link IDs |
| `services/routing-graph-snapshot-builder.ts` | Replace exclusion filtering with positive canonical link allowlists |
| `shared/validate-routing-addition-closure.ts` | Renamed; require session-added intra-usecase links in inclusion lists |

### Packages/core — manual handler

| File | Change |
|---|---|
| `create-manual-usecases/create-manual-usecases.handler.ts` | Drop discovery, call assembler |
| `create-manual-usecases/manual-topology-assembler.ts` | **New** — `assembleManualTopology` function |
| `create-manual-usecases/manual-pair-discovery.service.ts` | **Deleted** |
| `create-manual-usecases/manual-candidate-relationship-builder.ts` | **Deleted** |
| `create-manual-usecases/manual-link-support-resolver.ts` | **Deleted** |

### Packages/core — Phase 2

| File | Change |
|---|---|
| `phases/topology-change-analysis/topology-change-analysis.phase.ts` | Pass inclusion scope into new gate; remove exclusion-related inputs |
| `phases/topology-change-analysis/topology-gate-validator.ts` | Replace `validateAutomaticRoutingSelectionsAndExclusions` with inclusion-closure gate (§6.4); retire `editScopeConflict`; preserve `deletionSelectionRequired` and `deriveAffectedUsecaseSystemIds` |

### Packages/core — Phase 10

| File | Change |
|---|---|
| `phases/orphan-validation.phase.ts` | **Extended** — add inter-usecase endpoint coverage check after existing orphan scans |

### Packages/core — commands

| File | Change |
|---|---|
| `create-usecases/create-usecases.command.ts` | Updated selection type |
| `create-manual-usecases/create-manual-usecases.command.ts` | Updated selection type |

### Packages/core — registries

| File | Change |
|---|---|
| `orchestration/cqrs/registries/command-handler-registry.ts` | No structural change; handler constructors updated |

### Tests impacted

| Suite | Change |
|---|---|
| `create-usecases.handler.spec.ts` | Updated fixtures (no excluded, no selected usecases for MCP path) |
| `create-manual-usecases.handler.spec.ts` | Updated fixtures; remove discovery mocks; add assembler mocks |
| `project-create-usecases.controller.spec.ts` | Updated DTO field mapping |
| `create-manual-usecases.e2e-spec.ts` | Updated request shape |
| `routing-graph-snapshot-builder.spec.ts` | Remove exclusion test cases |
| `validate-routing-addition-closure.spec.ts` | Updated for inclusion semantics |
| `topology-change-analysis.phase.spec.ts` | Gate input updated; inclusion-closure cases added; exclusion-conflict cases removed |
| `manual-pair-discovery.service.spec.ts` | **Deleted** |
| `manual-candidate-relationship-builder.spec.ts` | **Deleted** |
| `manual-link-support-resolver.spec.ts` | **Deleted** |
| `manual-topology-assembler.spec.ts` | **New** |
| `orphan-validation.phase.spec.ts` | **Extended** — add inter-usecase endpoint coverage cases |
| All phase specs with `RoutingSelection` fixtures | Update to remove excluded fields |

---

## 11. Required Test Coverage

### `assembleManualTopology`
- Link exists and is valid → topology assembled
- Link not found in DB → rejected
- Link is session-deleted → rejected
- Link endpoint not in `activeSubgraphs` → rejected
- Control link canonicalization (both storage directions)
- Directed data cycle → `manualCycleDetected`
- Control-only topology (no data links)
- Mixed data and control links

### `resolveRoutingLinkSelection`
- Raw string IDs for canonical links only → parsed, deduplicated canonical selection
- String ID resolving to a data segment → parent `dataLinkSystemId` included
- String ID resolving to a control segment → parent `controlLinkSystemId` included
- Canonical and segment IDs resolving to the same canonical link → one canonical ID
- ID matching zero or multiple effective entities → rejected
- Wrong-file or deleted subsystem segment → rejected
- Segment with null parent after Phase 0 → rejected
- Missing canonical parent in effective overlay → rejected
- Intra-subgraph or inter-usecase canonical link → rejected as not routing-eligible

### `validateAutoRoutingAdditionClosure` (renamed)
- All effective additions included → passes
- Added intra-usecase data link missing → rejected with id
- Added intra-usecase control link missing → rejected with id
- Added subgraph missing → rejected with id
- Added-then-deleted link not required
- Manual mode never calls this (covered by handler spec)

### Phase 2 deletion gate (replaces `validateAutomaticRoutingSelectionsAndExclusions`)
- No session deletions → gate passes immediately
- MdfNormalization usecase deleted member SG → not in affected set; gate does not flag it
- `DeleteOrReconstruct` usecase with deleted SG, surviving SG in scope → passes
- `DeleteOrReconstruct` usecase with deleted SG, surviving SG missing → `DELETION_SCOPE_INCOMPLETE`
- `ControlPairRemoval` usecase, surviving member SGs in scope → passes
- `ControlPairRemoval` usecase, surviving member SG missing → `DELETION_SCOPE_INCOMPLETE`
- Surviving data link of affected usecase not in `includedDataLinkSystemIds` → `DELETION_SCOPE_INCOMPLETE`
- Multiple affected usecases, batch result (order-independent per usecase)
- `usecaseSystemIds` provided, affected ID missing → `deletionSelectionRequired` takes precedence
- `usecaseSystemIds` provided and complete → inclusion-closure check still runs

### Automatic routing with no `usecaseSystemIds`
- All SGs are seeds (confirmed via seed detection path)
- Deletion closure runs in Phase 2 after decisions are built
- Classification matches existing usecases by exact topology + GKV

### Collision replay
- Replay payload uses new format (inclusion-based)
- Optional `usecaseSystemIds` preserved when originally provided

### Phase 10 — Inter-usecase endpoint coverage
- Both endpoints of inter-usecase data/control links covered by committed usecases → passes
- Source/first endpoint SG has no covering usecase → hard failure with `linkSystemId` and `uncoveredSubgraphSystemId`
- Destination/second endpoint SG has no covering usecase → hard failure
- Both endpoints uncovered → two separate failures reported
- No effective inter-usecase data or control links → check skipped cleanly
- Applies in both auto and manual mode

---

## 12. Out of Scope

- Changes to the response contract (`RoutingOutcome`, `UsecaseChangeDetailsDto`).
- Changes to `GET` endpoints.
- Database schema changes.
- Subsystem chain-discovery algorithms and repository APIs (PR 9.5); this refactor consumes their
  output and performs request-ID normalization after they run.
- MDF expansion/collapse analysis.
- Same-GKV collision detection logic.
