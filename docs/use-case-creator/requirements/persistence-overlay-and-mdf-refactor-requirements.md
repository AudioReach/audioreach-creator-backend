# Persistence Read Overlay and MDF Refactor: Requirements

**Date:** 2026-09-13  
**Status:** Frozen

## 1. Context

Persistence reads combine committed rows with staged edit actions. Several
fetchers apply caller filters to committed SQL rows and then use a CREATE-only
filter while merging the overlay. That is incorrect whenever an UPDATE changes
a filtered field: a row moved into the filter is missing and a row moved out of
the filter remains. This refactor must establish one consistent effective-read
contract across the persistence fetcher/query layer.

The current MDF scope lookup also crosses aggregate boundaries inside
`SubgraphOverlayFetcher`. The routing-facing part of the refactor must build on
the corrected effective-read contract and move MDF policy into the application
layer.

## 2. Definitions

| Term | Definition |
| --- | --- |
| Effective module | A SpfModule row after active-session SpfModule CREATE, UPDATE, and DELETE actions are applied. |
| Effective row | A committed or session-created row after all active actions for its system ID have been folded in chronological order. |
| Immutable scope | A predicate that valid edit actions cannot change, such as an entity system ID or an aggregate/file boundary guaranteed by the write contract. |
| Mutable filter | Any caller-visible predicate whose field can change through an edit action, including nullable relationship fields. |
| Candidate augmentation | Adding committed rows targeted by active actions to the SQL-filtered baseline candidates before applying the overlay. |
| MDF predicate | A candidate subgraph has exactly two effective modules whose committed definition natural IDs are IPC_TX and IPC_RX. |
| Subgraph system ID | The database system ID of a Subgraph, not its natural `subgraphId`. |

## 3. Functional Requirements

### FR-OVR-01: Complete read-path audit

Every fetcher and read/query service under the persistence `fetchers/` and
`queries/` directories shall be classified as one of:

- an effective collection read requiring overlay-aware filtering;
- a safe immutable-scope or primary-key read;
- an intentional change-history/change-report read;
- a manual or arithmetic overlay projection requiring replacement or explicit
  proof of correctness.

Only paths with an effective-state correctness issue shall change.

### FR-OVR-02: Effective filtering

For an active session, mutable caller filters shall be evaluated against the
effective row after UPDATE actions are applied. A committed row moved into the
filter shall be returned, and a committed row moved out of the filter shall not
be returned.

### FR-OVR-03: Safe SQL filtering

SQL-level filtering shall be retained for immutable scope predicates and exact
primary-key lookups. When SQL also applies mutable caller filters, committed
rows targeted by active actions shall augment the baseline candidates before
overlay so UPDATEs can move rows into or out of the filter. The implementation
shall not broaden queries beyond the owning file, project, aggregate, or
immutable parent scope.

### FR-OVR-04: Session-created rows

A staged CREATE shall be included exactly once when its effective row matches
the caller's filter and immutable scope. A CREATE from another session, file,
project, aggregate, or immutable parent scope shall be excluded.

### FR-OVR-05: Session-deleted rows

A staged DELETE shall exclude the target from normal effective reads. Methods
whose explicit contract reports added/deleted changes may continue returning a
deleted baseline snapshot in their deleted collection.

### FR-OVR-06: Nullable relationship filters

In-memory effective filtering shall have the same semantics as SQL for nullable
fields. This includes `dataLinkSystemId: null` and
`controlLinkSystemId: null` on subsystem-link rows.

### FR-OVR-07: Stable deduplication

Every effective collection shall contain at most one row per system ID after
committed rows and action-only rows are combined. Deduplication order shall be
deterministic and shall not discard the final effective overlay for a target.

### FR-OVR-08: Derived reads

Counts, groupings, relationship maps, and nested projections derived from
overlay-managed entities shall be calculated from the effective entity set.
Manual baseline arithmetic that can diverge from effective UPDATE/CREATE/DELETE
semantics shall be replaced or brought under the same effective-read contract.

### FR-OVR-09: Minimal shared implementation

The correction shall use a small, consistent shared overlay/filtering pattern.
Fetcher-specific workarounds that duplicate the corrected shared behavior shall
be removed. Fetchers may retain specialized assembly needed for aggregate-owned
children.

### FR-MOD-01: Batch subgraph module lookup

The ModuleRepository shall provide a batch lookup for a readonly collection of
subgraph system IDs. It shall return only effective modules belonging to that
scope. An empty input shall return an empty collection without querying all
modules. The existing singular operation may remain as a convenience wrapper
for its current single-subgraph caller.

### FR-MOD-02: Overlay-aware scope membership

The batch lookup shall include matching session-created modules, apply valid
module UPDATEs, and exclude SpfModule DELETE actions. Its SQL query shall remain
scoped by subgraph system IDs because module-to-subgraph ownership is immutable
under the write contract. Relocating a module between subgraphs is represented
as deletion of the original module and creation of a module in the destination
subgraph, not as an UPDATE to `subgraphSystemId`. Module `containerSystemId`
remains a mutable relationship field.

### FR-MOD-03: Module deletion invariant

For supported module deletion, a module shall become absent from effective
module reads through its SpfModule DELETE action. The coupled Node DELETE
action is topology cleanup and shall not be a special, MDF-only visibility
filter. A Node-only tombstone is not a supported module-deletion state.

### FR-MDF-01: Aggregate-local fetchers

SubgraphOverlayFetcher shall fetch only Subgraph data and Subgraph-owned child
data. It shall not construct SpfModuleOverlayFetcher, directly query
SpfModuleDefinition, or implement MDF classification.

### FR-MDF-02: Application-level MDF classification

The use-case-creator application layer shall classify MDF candidates by
orchestrating explicit Subgraph, Module, and ModuleDefinition repository
operations through the UnitOfWork. The existing exact-two-module IPC_TX plus
IPC_RX predicate shall be preserved. Persistence fetchers and query services
shall not own this business rule.

### FR-MDF-03: Definition consistency

MDF classification shall use committed SpfModuleDefinition natural IDs,
matching current behavior. In-session SpfModuleDefinition edits shall not
change MDF classification in this refactor.

### FR-MDF-04: Batched definition projection

The ModuleDefinitionRepository shall provide a batch, lightweight projection
from definition system ID to committed module-definition natural ID. MDF
classification shall not hydrate full SpfModuleDefinition aggregates or make
one definition lookup per module.

### FR-MDF-05: Contract cleanup

The SubgraphRepository shall not expose the cross-aggregate
`findIsMdfInScope` operation after MDF classification moves to the application
layer. The legacy specialized module fetcher operation shall be removed.

## 4. Invariants

**I1 — Aggregate ownership:** A persistence fetcher composes only data owned by
its aggregate; cross-aggregate rules are orchestrated above repository
adapters.

**I2 — Scoped-read correctness:** Scope filters are evaluated against an
entity's effective state, not only its committed baseline state.

**I3 — Scope isolation:** An edit action cannot make a row visible outside the
file/project/aggregate scope established by its valid session and owner.

**I4 — Query efficiency:** Multi-subgraph MDF evaluation performs a scoped
module query and batched definition lookup; it must not intentionally load all
file modules and filter in memory.

**I5 — Valid-action robustness:** Every filterable persisted field that a valid
edit action can change is treated as mutable, including fields populated by a
future DIFF_TOOL workflow rather than today's repository methods. Exact-ID and
contractually immutable owner/file scope remain eligible for SQL prefiltering.

**I6 — Conservative mutability:** A filter field is treated as mutable unless a
documented domain/write invariant explicitly guarantees immutability.
`SpfModule.subgraphSystemId` is immutable under the module-relocation contract;
`SpfModule.containerSystemId` is mutable.

## 5. Non-Functional Requirements

**NFR-MOD-01:** No database migration, public HTTP API, or persisted data shape
shall change.

**NFR-MOD-02:** Regression tests shall be added for every affected entity or
fetcher type. At minimum they shall cover UPDATE into and out of a filter,
matching and non-matching CREATEs, DELETE exclusion, nullable FKs, scope
isolation, and deduplication where applicable.

**NFR-MOD-03:** Existing public HTTP contracts and unrelated repository/query
behavior shall remain unchanged.

**NFR-MOD-04:** Existing overlay and routing documentation shall be corrected
where it describes superseded behavior. New requirements belong in this
document rather than being appended as revisions to unrelated requirements.

## 6. Out of Scope

- Changing the IPC_TX/IPC_RX MDF predicate or its routing behavior.
- Supporting Node-only deletion as an alternate module deletion workflow.
- Applying session overlays to SpfModuleDefinition during MDF classification.
- Adding a new API endpoint, database schema, or migration.
- Redesigning intentional edit-history or added/deleted reporting semantics.
- Defining recovery behavior for malformed raw `edit_actions` that violate
  primary-key, aggregate-ownership, or session/file invariants.

## 7. Open Questions

None. The implementation covers every filterable field addressable by a valid
edit action, retains committed-only definition classification, and treats
Node-only module tombstones as unsupported.
