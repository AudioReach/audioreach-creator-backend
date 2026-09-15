# Persistence Read Overlay and MDF Refactor: Design

**Requirements:**
[`../requirements/persistence-overlay-and-mdf-refactor-requirements.md`](../requirements/persistence-overlay-and-mdf-refactor-requirements.md)  
**Date:** 2026-09-13  
**Status:** Approved

## 1. Decision Summary

Persistence fetchers will use one effective-collection overlay contract. During
an active session, SQL selects candidates inside immutable scope that either
match the caller filter or are targeted by an active action. Mutable caller
filters are re-evaluated after the complete session overlay is applied.

The shared overlay primitive will distinguish:

- whether an action-only CREATE belongs to the immutable query scope; and
- whether a completed effective row matches the caller's mutable filter.

MDF classification will move from the Subgraph persistence fetcher into a core
application service that orchestrates Subgraph, Module, and ModuleDefinition
repositories through the UnitOfWork.

## 2. Alternatives Considered

### 2.1 Selected: Shared effective-overlay primitive

Extend the existing `OverlayMergeImpl` contract and migrate every affected
fetcher to it. Fetchers continue owning their SQL and aggregate assembly.

This centralizes CREATE/UPDATE/DELETE, filtering, and deduplication semantics
without introducing database-specific overlay SQL.

### 2.2 Rejected: Fetcher-specific post-filtering

Adding independent post-overlay filters would minimize changes to the merge
primitive, but would retain duplicated behavior and make omissions likely.

### 2.3 Rejected: SQL/CTE effective views

Building effective rows in SQL could reduce rows loaded for highly selective
mutable filters, but would duplicate the field-path reducer and couple overlay
semantics to TypeORM and SQLite. The current scale does not justify this.

## 3. Shared Overlay Contract

### 3.1 Collection API

`OverlayMergeImpl.applyToCollection` will accept explicit options:

```typescript
interface CollectionOverlayOptions<T> {
  isCreateInScope?: (
    createdRow: Record<string, unknown>,
    createAction: EditActionRow,
  ) => boolean;
  matchesEffective?: (effectiveRow: T) => boolean;
}
```

The existing CREATE-only callback will be removed rather than retained as a
compatibility overload.

### 3.2 Collection algorithm

1. Deduplicate committed rows by `systemId`, preserving their stable input
   order.
2. Group actions by `targetSystemId`.
3. For each committed row, fold its actions in `(createdAt, changeId)` order.
4. Exclude a row if the fold encounters DELETE.
5. For an action target absent from committed rows:
   - require a CREATE action;
   - inject its `targetSystemId` into the CREATE payload;
   - reject it when `isCreateInScope` fails;
   - fold subsequent actions over the created row.
6. Apply `matchesEffective` to every completed row, regardless of whether it
   originated in the committed table or a CREATE action.
7. Return at most one row per `systemId`.

An UPDATE-only action whose target is absent from `baseRows` cannot construct a
complete entity and is ignored. Correct fetchers prevent valid in-scope UPDATEs
from reaching this case by augmenting SQL-filtered candidates with active action
target IDs.

### 3.3 Single-row API

`applyToSingle` will enforce the same invariants:

- a missing baseline requires a CREATE;
- CREATE scope can be validated;
- DELETE returns `null`;
- an optional effective predicate is evaluated after folding.

`applyTableOverlay` will either forward these options or be removed where a
direct `OverlayMergeImpl` call is clearer.

### 3.4 Filter utilities

`applyEntityFilters` remains the SQL predicate implementation.
`matchesEntityFilters` remains its in-memory equivalent, including scalar,
array, `$or`, and `null` equality behavior. Its documentation will describe
effective-row filtering rather than CREATE-only filtering.

Add a shared candidate-filter helper that groups the caller predicate and
action targets as:

```sql
immutable_scope
AND (caller_filter OR system_id IN (:...actionTargetIds))
```

The helper must correctly bracket nested `$or` filters and handle empty filter
or action-ID inputs without generating invalid SQL.

## 4. Fetcher Query Pattern

### 4.1 No active session

Apply immutable scope and all caller filters in SQL. No overlay query or
in-memory filtering is required.

### 4.2 Active session

1. Fetch active actions using the narrowest valid session/table/aggregate
   query.
2. Collect their distinct target system IDs.
3. Query committed candidates inside immutable scope where either:
   - the committed row currently matches the caller filter; or
   - its system ID is targeted by an active action.
4. Validate action-only CREATEs against immutable scope.
5. Apply the overlay.
6. Evaluate mutable filters against complete effective rows.
7. Assemble aggregate-owned children from effective parent IDs.

This candidate-augmentation pattern preserves selective SQL filtering while
ensuring every potentially changed committed row is available to the overlay.
Rows that match both branches are deduplicated by `systemId`.

### 4.3 Scope classification

Safe SQL predicates include:

- entity `systemId` or an explicit immutable ID set;
- project/file identity;
- aggregate ownership and contractually immutable parent ownership;
- immutable module-to-subgraph ownership.

Mutable predicates include:

- editable scalar fields such as aliases;
- mutable relationship fields such as module container assignment;
- canonical-link endpoints if represented by valid edit actions;
- nullable subsystem-link canonical FKs;
- any other persisted filter field addressable by a valid edit action.

Filter fields are considered mutable unless a documented domain/write
invariant guarantees otherwise. `SpfModule.subgraphSystemId` is immutable:
moving a module between subgraphs is represented as DELETE plus CREATE.
`SpfModule.containerSystemId` remains mutable.

When a filter contains mutable fields, its SQL predicate is ORed with the set
of active action target IDs inside the immutable scope. Mixed `$or`
expressions follow the same candidate-augmentation rule and are always
re-evaluated after overlay.

### 4.4 File and aggregate isolation

Action queries are session-scoped. Top-level CREATE payloads must additionally
match the requested file/project when that field is part of the persisted row.
Child CREATEs must match the requested aggregate or immutable parent through
their payload and/or action metadata. A scope predicate is not reused as a
mutable effective filter when doing so would permit an invalid ownership move.

## 5. Component Migration

### 5.1 Shared infrastructure

Update:

- `queries/edit-session/overlay-merge.ts`
- `queries/edit-session/overlay-utils.ts`
- `queries/shared/filter-utils.ts`

Retire deprecated collection-overlay shims after their callers migrate.

### 5.2 Flat and file-scoped fetchers

Re-evaluate mutable predicates through `matchesEffective`, while retaining
their SQL candidate predicate and immutable file/ID scope, in:

- `container-overlay-fetcher.ts`
- `spf-module-overlay-fetcher.ts`
- `link-overlay-fetcher.ts` for canonical DataLink and ControlLink rows
- `subgraph-overlay-fetcher.ts`
- `usecase-overlay-fetcher.ts`
- file-scoped property and definition fetchers

The already-correct Subgraph, Usecase, and subsystem-link post-filter paths
will migrate to the shared contract, removing their local filtering
workarounds.

### 5.3 Aggregate-child fetchers

Retain immutable aggregate/parent SQL scope and apply optional mutable filters
after overlay in:

- data/control ports and intents;
- container and subgraph property data;
- SGKV rows;
- CKV/TKV rows and parameter payloads;
- tag maps and tag/key/value relationships;
- module-definition child fetchers, including parameter definitions, data-port
  groups, static control ports, and dynamic intents.

Nested collections will be regrouped using effective parent IDs and only under
effective parents in the requested scope.

### 5.4 Single and natural-key reads

Exact-ID reads retain SQL identity filtering. They gain CREATE eligibility and
final scope validation where required. Natural/composite-key reads must search
the immutable candidate scope and apply their natural-key predicate after the
overlay so staged CREATE and UPDATE transitions are visible.

This includes the existing special handling around container property
definitions and module tag-map existence.

### 5.5 Derived link counts

`DbNodeQueryService.countDataLinksPerPort` and
`countControlLinksPerPort` will count corrected effective link rows. Their
baseline-count plus CREATE/DELETE arithmetic will be removed because it cannot
correctly model endpoint UPDATEs.

### 5.6 Intentionally separate paths

Added/deleted change reports and historical before/after reconstruction retain
their specialized semantics. They will receive scope corrections only if an
independent isolation defect is demonstrated; they will not be converted into
normal effective collection reads.

### 5.7 Audit disposition

The implementation audit and plan will explicitly classify all remaining
overlay paths:

- `NodeOverlayFetcher` and `SubsystemOverlayFetcher`: immutable-scope reads;
  migrate only shared CREATE/dedup semantics needed for consistency.
- Usecase membership/pair, category, and GKV association readers: retain their
  relationship-specific CREATE/DELETE semantics where UPDATE movement is not a
  valid operation; enforce effective parent scope.
- Container/Subgraph property-definition, key/value/tag-definition,
  processor/container-type, driver-definition, SPF-definition, and
  module-manager fetchers: migrate filtered collections and natural-key reads.
- Data-port-group, static/dynamic intent, parameter-definition, and other
  nested definition fetchers: apply candidate augmentation at the owning scope
  and regroup using effective parent IDs.
- `fetchChangedInSession`, changed-link readers, and usecase history readers:
  retain intentional change-report/history semantics.

No audited path may remain unclassified when implementation is complete.

## 6. Module Batch Read

Add:

```typescript
findModulesBySubgraphIds(
  subgraphSystemIds: readonly number[],
  fileSystemId: number,
): Promise<SpfModuleBase[]>;
```

The existing singular method remains as a convenience wrapper for
`SubgraphLifecycleService`. The plural operation:

- returns immediately for empty input;
- applies file and subgraph ownership in SQL;
- includes in-scope CREATEs;
- applies module UPDATEs;
- excludes SpfModule DELETEs;
- does not consult Node DELETE actions.

`SpfModuleOverlayFetcher.fetchEffectiveForSubgraphs` will be removed.

## 7. MDF Application Design

### 7.1 Repository contracts

Remove `SubgraphRepository.findIsMdfInScope`.

Add a lightweight committed projection to `ModuleDefinitionRepository`:

```typescript
interface ModuleDefinitionIdentity {
  readonly systemId: number;
  readonly moduleDefinitionId: number;
}

findCommittedIdentitiesBySystemIds(
  definitionSystemIds: readonly number[],
  fileSystemId: number,
): Promise<ModuleDefinitionIdentity[]>;
```

This query intentionally does not hydrate definition children or apply
definition edit actions.

### 7.2 Classification service

Add `MdfClassificationService` in the use-case-creator application services.
It receives candidate subgraph system IDs and a UnitOfWork, then:

1. returns immediately for empty input;
2. loads effective candidate Subgraphs with `findByIds`;
3. batch-loads their effective modules;
4. batch-loads distinct committed definition identities;
5. groups modules by subgraph;
6. returns IDs whose group has exactly two modules with natural definition IDs
   IPC_TX and IPC_RX.

Missing definition projections make that candidate non-MDF.

### 7.3 Routing integration

`KvResolutionService` invokes the classifier with the SG IDs derived from normalized
`context.input.activeSubgraphs` (the effective routing scope). `RoutingContext` gains:

```typescript
readonly mdfSubgraphSystemIds = new Set<number>();
```

The service populates this set for subsequent KV behavior. This refactor does
not implement deferred MDF KV normalization, rejection, or routing semantics.

`SubgraphOverlayFetcher.fetchMdfInScope` and its SpfModule/definition
dependencies are removed.

## 8. Testing Strategy

### 8.1 Shared overlay unit tests

Cover:

- committed UPDATE into and out of an effective filter;
- matching and non-matching CREATE;
- CREATE followed by UPDATE into and out of a filter;
- CREATE followed by DELETE;
- UPDATE-only action without a baseline;
- immutable CREATE-scope rejection;
- `(createdAt, changeId)` ordering;
- duplicate committed/action IDs producing one result.

### 8.2 Fetcher integration tests

Every affected fetcher/entity type receives regression coverage for UPDATE
movement across its mutable filters. Relevant suites additionally cover:

- matching and non-matching session CREATEs;
- DELETE exclusion;
- another session and file scope;
- aggregate/parent scope;
- deduplication;
- nested regrouping using effective parent IDs.

Subsystem data/control links explicitly cover both directions of
`null ↔ canonical FK` filtering.

### 8.3 Derived-read tests

Node data/control-link counts cover CREATE, DELETE, endpoint UPDATE,
CREATE→DELETE, and foreign-file exclusion using effective link rows.

### 8.4 MDF tests

Core unit tests cover empty candidates, exact IPC pair, reversed order,
missing/extra/duplicate modules, missing definitions, deduplicated batch IDs,
and repository failures.

Persistence integration tests cover plural module lookup and committed
definition identity projection. Routing tests verify that `KvResolutionService`
populates `RoutingContext.mdfSubgraphSystemIds`.

## 9. Documentation Updates

Update existing documentation where it describes CREATE-only filtering,
obsolete static overlay APIs, manual link-count arithmetic, or persistence-owned
MDF classification. Primary documents are:

- `docs/read-overlay-design.md`
- relevant current container/module/subsystem query LLDs
- use-case-creator MDF and KV-resolution design sections

Existing requirement documents are corrected in place only when their current
behavioral statements are no longer accurate. New requirements remain in the
linked requirements document.

## 10. Compatibility and Rollout

- No schema or migration changes.
- No public HTTP contract changes.
- Repository interface changes are internal and updated atomically.
- Migrate fetchers by category, with focused tests passing after each category.
- Remove old helpers only after all callers use the shared contract.
