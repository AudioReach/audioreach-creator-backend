# 03: RoutingContext & Data Flow

`RoutingContext` contains immutable prepared input plus write-once phase outputs. The
handler-owned transaction and snapshot builder run before `RoutingEngine.run`.

## Prepared Input

| Field | Owner | Purpose |
|---|---|---|
| `fileSystemId` | Handler | File routing belongs to |
| `selectedUsecases` | Handler | Caller-selected effective-overlay UC snapshots |
| `requestPolicy` | Handler | Original requested SG IDs and explicit SG/link exclusions |
| `graphSnapshot` | Snapshot builder | One immutable graph view: routable subgraphs/links, complete overlay catalogs, committed UCs, and session edits |
| `manualTopology` | Manual discovery | Manual-only topology with borrowed snapshot link references |
| `activeManualUsecaseEdits` | Handler, both modes | Effective manual UC edits for Phase 1 dependency validation and same-UC MDF precedence |

`RoutingSubgraph` joins one persisted `Subgraph`, copied requested SGKV arrays, and one
MDF classification result. `graphSnapshot` arrays are copied/frozen containers over
borrowed domain entities. Derived exclusion sets are discarded after construction.

## Context Outputs

| Field | Owner | Purpose |
|---|---|---|
| `topologyChangeAnalysis` | Phase 2 | One finalized decision per impacted committed UC, including direct MDF substitutions and ordinary affected IDs |
| `islandTransitions` | Phase 3 | Complete island-transition descriptors |
| `kvResolutions` | Phase 4 | Resolved key-value pairs |
| `seeds` | Phase 5 | Routing seeds from session edits |
| `cones` | Phase 6 | Subgraph cones computed from seeds |
| `dfsPaths` | Phase 7 | Main DFS paths |
| `routingCandidates` | Phase 8 | Combinations and EC bridge candidates |
| `classifications` | Phase 9 | Created, updated, and no-op decisions |
| `orphanCandidates` | Phase 10 | Orphan validation results |
| `warnings` | Phases 1 and 10 | Non-fatal issues |
| `emittedChanges` | Phase 11 | Canonical change descriptors |
| `routingOutcome` | Phase 12 | Framework-free routing result |

## Read/Write Per Phase

| Phase | Reads | Writes |
|---|---|---|
| Handler preparation | Command, session edits, selected overlay UCs | `requestPolicy`, `graphSnapshot`, mode-specific input |
| Manual discovery | Snapshot subgraphs, selected UCs, routable links | `manualTopology` before engine execution |
| Phase 1 | `graphSnapshot.subgraphs`, `routableDataLinks`, active manual UC edits | `warnings` after integrity/MDF-value validation, or stale-manual failure |
| Phase 2 | `graphSnapshot.sessionEdits`, `committedUsecases`, overlay catalogs, request policy, valid active manual edits | `topologyChangeAnalysis` |
| Phase 3 | Snapshot graph and `topologyChangeAnalysis` | `islandTransitions` |
| Phase 4 | Snapshot subgraphs and selected UCs; SGKV baseline plus batched file-scoped Value Definition-to-Key mapping | content-only `kvResolutions` |
| Phase 5 | `sessionEdits`, snapshot subgraphs | `seeds` |
| Phase 6 | `seeds`, routable data links | `cones` |
| Phase 7 | `cones`, routable data links, deletion reconstruction paths | `dfsPaths` |
| Phase 8 | `dfsPaths`, `kvResolutions`, or manual topology | `routingCandidates` |
| Phase 9 | Candidates, selected UCs, committed UCs, Phase 2/3 outputs | `classifications` |
| Phase 10 | Classifications and routable graph | `orphanCandidates`, `warnings` |
| Phase 11 | Classification and Phase 2/3 outputs | `emittedChanges` only |
| Phase 12 | Changes, warnings, write-context group ID | `routingOutcome` |

Manual discovery and Phase 1 perform no graph repository reads. Phases 2–3 and 5–10 do
not reload graph catalogs or re-derive effective exclusions. Phase 2 may perform one
conditional legacy-EC SGKV baseline read, and Phase 4 owns all normal SGKV and
Value-Definition-to-Key reads; both receive only the narrow subgraph repository. Phase 11
is the only phase that receives `UnitOfWork` and the only write phase. Phase 12 receives
only the write-context group ID. The complete overlay catalogs remain available in the
snapshot for deletion-impact rules, while routable collections remain the only graph
inputs for routing algorithms.

## Deliberate Exclusions

`RoutingContext` does not contain repositories, a `UnitOfWork`, copied request policy,
mutable graph catalogs, or effective exclusion sets. Consumer-specific sets, maps, and
adjacency structures remain local to the phase that uses them. Manual topology pairs keep
borrowed `DataLink`/`ControlLink` references from the snapshot rather than clones.
