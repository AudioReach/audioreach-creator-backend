# 03: RoutingContext & Data Flow

`RoutingContext` is the single shared data container that `RoutingEngine.run` creates before Phase 1 and threads through all twelve pipeline phases; each phase reads the fields it needs and writes exactly the fields it owns.

## Field layout

| Field | Owner (phase that writes it) | Purpose |
|---|---|---|
| `input` | Handler, preserved by Phase 0 | Immutable core input containing normalized `activeSubgraphs`, one effective-overlay `selectedUsecases` snapshot, minimal original-request `scopePolicy`, link exclusions, and graph edits |
| `allUcs` | Phase 2 (auto only) | Committed pre-session UCs used for file-wide affected-UC detection and in-memory reverse lookups |
| `affectedUcSystemIds` | Phase 2 | Full file-wide set requiring deletion, structural mutation, or type degradation |
| `markedForDeletion` | Phase 2 | Use-cases flagged for removal |
| `deletionPreservedUcs` | Phase 2 | Multi-path UCs retained after surviving-path analysis |
| `degradedToIsland` | Phase 2 | `LINKED` UCs requiring an `ISLAND` transition |
| `reconstructionPaths` | Phase 2 | Reconstructed paths appended to `dfsPaths` |
| `islandTransitions` | Phase 3 | `ISLAND` UCs transitioning to `LINKED` |
| `kvResolutions` | Phase 4 | Resolved key-value pairs for use-case expansion |
| `seeds` | Phase 5 | Anchor use-cases detected from edit actions |
| `cones` | Phase 6 | Subgraph cones computed from seeds |
| `dfsPaths` | Phase 7 (appended); automatic Phase 2 may pre-populate reconstruction paths | DFS-traversed routing paths through cones. Automatic Phase 2 initializes the list as empty and appends bounded-DFS reconstruction paths for single-path or legacy EC UCs (per LLD4 §5.4.b); Phase 7 then appends main-DFS paths. Manual Phase 2 is a no-op. |
| `combinations` | Phase 8 | Expanded path×kv combinations |
| `ecBridgeCandidates` | Phase 8 (PR 8) | EC bridge candidates kept separate until classification |
| `classified` (created · updated · noop) | Phase 9 | Combinations sorted by change type |
| `orphans` | Phase 10 | Use-cases with no remaining valid link |
| `warnings` | Phases 1, 10 (appendable) | Non-fatal validation messages accumulated across phases |
| `emittedChanges` | Phase 11 | Canonical `{systemId, changeId, operation, source}` descriptors |
| `response` | Phase 12 | Framework-free `RoutingOutcome {emittedChanges, issues, groupId}`; rich API snapshots are query-side |

## Read/write per phase

| Phase | Reads from RoutingContext | Writes to RoutingContext |
|---|---|---|
| Phase 0 · RoutingEngine initialization | — | `input`, empty defaults |
| Handler scope pre-step | client input, graph edits, effective-overlay selected UCs | normalized `activeSubgraphs`, `scopePolicy`, immutable input; FR-API-07 addition-side and FR-API-03 rejection occurs before manual discovery or engine execution |
| Phase 1 · PreValidationService | SG IDs derived from normalized `input.activeSubgraphs` | may append `warnings` |
| Phase 2 · DeletionScopeService | Auto: `input.graphEdits`, IDs derived from `input.selectedUsecases` and normalized `activeSubgraphs`, `input.scopePolicy`; links from repos. Manual: no-op. | Auto writes `allUcs`, full affected set; FR-DEL-02 failure takes precedence, then FR-API-07 deletion-side closure; on success writes `markedForDeletion`, `deletionPreservedUcs`, `degradedToIsland`, `reconstructionPaths` and appends reconstruction paths to `dfsPaths` |
| Phase 3 · `IslandTransitionService` | Auto: `input.islandUcs`; links from repos. Manual: no-op. | Auto writes `islandTransitions` (`ISLAND` → `LINKED`) |
| Phase 4 · KvResolutionService | `input.selectedUsecases`, normalized `input.activeSubgraphs` | `kvResolutions` |
| Phase 5 · SeedDetectionService | `input.graphEdits`, out-of-selection IDs derived locally | `seeds` |
| Phase 6 · ConeComputationService | `seeds`, SG IDs derived from normalized `input.activeSubgraphs` | `cones` |
| Phase 7 · DfsRoutingService | `cones` | appends to `dfsPaths` (which may already contain Phase 2's reconstruction paths) |
| Phase 8 · CombinationExpansionSvc | Auto: `dfsPaths`, `kvResolutions`; Manual: ordered effective-scope input, `input.manualTopology`, `kvResolutions` | `combinations`; later PR 8 also writes `ecBridgeCandidates` |
| Phase 9 · ClassificationService | `combinations`; selected-UC semantics use `input.selectedUsecases`; file-wide dedup may use `allUcs` or a supplemental effective-UC catalog without replacing the snapshot | `classified` (created · updated · noop) |
| Phase 10 · OrphanValidationService | `classified`, `markedForDeletion`, `islandTransitions`; links from repos | `orphans`; appends `warnings` |
| Phase 11 · RoutingChangeStager | `classified`, `markedForDeletion`, `islandTransitions` | `emittedChanges` |
| Phase 12 · ResponseBuilder | `warnings`, `emittedChanges`; `groupId` from UoW write context | `RoutingOutcome` |

## What is deliberately NOT in RoutingContext

- **Complete graph link data** — queried from repositories per-phase; not cached on the
  context to avoid stale reads. Manual input may carry only the data/control links that
  support its finalized topology pairs.
- **Subgraph definitions** — owned by the graph store; phases receive them via injected services, not the context.
- **UnitOfWork** — managed by the persistence layer and passed separately to the stager; keeping it off the context enforces the boundary between routing logic and persistence.
- **Chain-resolution outcome** — resolved before the pipeline starts and stored in the session, not re-derived inside the context.

## Notes

`RoutingContext` is a plain data class in the application layer with no framework decorators and no ORM annotations. It is constructed by `RoutingEngine.run` before the pipeline starts and threaded as a single mutable object through all twelve phases. `warnings` is the only field that multiple phases may append to; all other fields are written exactly once by their owning phase.

`markedForDeletion` (Phase 2) and `islandTransitions` (Phase 3) are populated in the pre-routing half of the pipeline (Half A), before the DFS-based routing computation begins. All routing-derived fields — `seeds`, `cones`, `dfsPaths`, `combinations`, `classified`, and `orphans` — are produced in the routing half (Half B, Phases 5–10). This split allows deletion and island-transition scope to be resolved early and referenced cheaply by both the routing half and the downstream stager and response builder.
