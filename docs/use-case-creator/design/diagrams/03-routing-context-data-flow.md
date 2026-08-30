# 03: RoutingContext & Data Flow

`RoutingContext` is the single shared data container that the handler creates before Phase 1 and threads through all twelve pipeline phases; each phase reads the fields it needs and writes exactly the fields it owns.

## Field layout

| Field | Owner (phase that writes it) | Purpose |
|---|---|---|
| `input` | Phase 0 (handler) | Raw request payload passed to the pipeline |
| `mode` | Phase 0 (handler) | Routing mode derived from the request |
| `markedForDeletion` | Phase 2 | Use-cases flagged for removal |
| `disconnectedTransitions` | Phase 3 | UC transitions disconnected from prior sessions |
| `kvResolutions` | Phase 4 | Resolved key-value pairs for use-case expansion |
| `seeds` | Phase 5 | Anchor use-cases detected from edit actions |
| `cones` | Phase 6 | Subgraph cones computed from seeds |
| `dfsPaths` | Phase 7 (appended); Phase 2 pre-populates reconstruction paths | DFS-traversed routing paths through cones. Phase 2 initializes the list as empty and appends bounded-DFS reconstruction paths for single-path or legacy EC UCs (per LLD4 §5.4.b); Phase 7 then appends main-DFS paths. |
| `combinations` | Phase 8 | Expanded path×kv combinations |
| `classified` (created · updated · noop) | Phase 9 | Combinations sorted by change type |
| `orphans` | Phase 10 | Use-cases with no remaining valid link |
| `warnings` | Phases 1, 10 (appendable) | Non-fatal validation messages accumulated across phases |
| `stagedChanges` | Phase 11 | Consolidated change set ready to persist |
| `response` | Phase 12 | Final API response built from all prior fields |

## Read/write per phase

| Phase | Reads from RoutingContext | Writes to RoutingContext |
|---|---|---|
| Phase 0 · Handler pre-step | — | `input`, `mode` |
| Phase 1 · PreValidationService | `input` | may append `warnings` |
| Phase 2 · DeletionScopeService | `input.graphEdits`, `input.selectedUsecaseSystemIds`; links from repos | `markedForDeletion`; initializes and appends to `dfsPaths` (reconstruction paths) |
| Phase 3 · DisconnectedTransitionSvc | `input.staleUcs`; links from repos | `disconnectedTransitions` |
| Phase 4 · KvResolutionService | `input` | `kvResolutions` |
| Phase 5 · SeedDetectionService | `input.graphEdits` | `seeds` |
| Phase 6 · ConeComputationService | `seeds` | `cones` |
| Phase 7 · DfsRoutingService | `cones` | appends to `dfsPaths` (which may already contain Phase 2's reconstruction paths) |
| Phase 8 · CombinationExpansionSvc | `dfsPaths`, `kvResolutions` | `combinations` |
| Phase 9 · ClassificationService | `combinations`, `classified` from prior overlay | `classified` (created · updated · noop) |
| Phase 10 · OrphanValidationService | `classified`, `markedForDeletion`, `disconnectedTransitions`; links from repos | `orphans`; appends `warnings` |
| Phase 11 · RoutingChangeStager | `classified`, `markedForDeletion`, `disconnectedTransitions` | `stagedChanges` |
| Phase 12 · ResponseBuilder | `classified`, `markedForDeletion`, `disconnectedTransitions`, `orphans`, `warnings`, `stagedChanges` | `response` |

## What is deliberately NOT in RoutingContext

- **Link data** — queried from repositories per-phase; not cached on the context to avoid stale reads.
- **Subgraph definitions** — owned by the graph store; phases receive them via injected services, not the context.
- **UnitOfWork** — managed by the persistence layer and passed separately to the stager; keeping it off the context enforces the boundary between routing logic and persistence.
- **Chain-resolution outcome** — resolved before the pipeline starts and stored in the session, not re-derived inside the context.

## Notes

`RoutingContext` is a plain data class in the application layer with no framework decorators and no ORM annotations. It is constructed by the handler before the pipeline starts and threaded as a single mutable object through all twelve phases. `warnings` is the only field that multiple phases may append to; all other fields are written exactly once by their owning phase.

`markedForDeletion` (Phase 2) and `disconnectedTransitions` (Phase 3) are populated in the pre-routing half of the pipeline (Half A), before the DFS-based routing computation begins. All routing-derived fields — `seeds`, `cones`, `dfsPaths`, `combinations`, `classified`, and `orphans` — are produced in the routing half (Half B, Phases 5–10). This split allows deletion and disconnection scope to be resolved early and referenced cheaply by both the routing half and the downstream stager and response builder.
