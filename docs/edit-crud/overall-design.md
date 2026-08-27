<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Modification Framework - Overall Design

**Status:** Draft
**Owner:** Nithin Simon

**Source of truth:** `docs/superpowers/specs/2026-07-04-modification-framework-requirements.md`

**Reader's map:**
- Start here. This doc establishes vocabulary, storage model, layering, and cross-cutting invariants that every downstream LLD references.
- Then read the LLD relevant to the change you are making. LLDs live in this same folder.
- Delete Module lives under `docs/module-write/` because it is part of the module write surface:
  - Requirements: `docs/module-write/requirements/delete-module-requirements.md`
  - Design: `docs/module-write/design/delete-module-design.md`

---

## 1. Purpose & Scope

This document is the shared architectural context for every LLD under `docs/edit-crud/`. It establishes the vocabulary, storage model, layering, and cross-cutting invariants that downstream LLDs reference without re-explaining.

### In scope

- Write path — user-manual (DESIGNER, DIFF_MERGE) and algorithm-driven (diff-tool, auto-routing).
- Read overlay — how committed data and pending changes merge into effective state.
- Commit — how STAGED pending changes apply to entity tables in dependency order.
- Stage / Unstage — how pending changes flip between STAGED and UNSTAGED.
- DiffMerge — three-way merge workflow, compare/stage split, change summary.
- Designer Visual Diff — `?includeDiff=true` and DTO shape.
- Cross-cutting invariants and their enforcement points.
- Phase split into LLDs — sequencing and dependencies.

### Out of scope

- Implementation details (folder-level code layout, class signatures, SQL, DTOs beyond overall shape) — those live in the LLDs.
- Undo/redo (deferred to a dedicated LLD; storage support is present).
- Delete-Module cascade design (covered by LLD5, referenced only at overall level here).
- Auto-routing integration (a separate LLD; overall level only mentions how stage/unstage supports it).
- Changes to `TUNING` or `DISCOVERY_WIZARD` mode behavior.

### Reader's map

- **First pass:** read §3 (Architecture Overview), §4 (Storage Model), §5 (Aggregate Registry). These anchor everything else.
- **Second pass:** read §7-12 (flows) for the operational picture.
- **Reference:** §13 (Invariants) and §15 (LLD Map) when writing or executing a plan.
- **Traceability:** §2 maps requirement codes to the LLD that owns their implementation.

---

## 2. Requirements Traceability

The source of truth is `docs/superpowers/specs/2026-07-04-modification-framework-requirements.md`. Every requirement code below is owned by one LLD; this section is the index.

| Requirement group | Codes | LLD |
|---|---|---|
| Session framework | REQ-SESS-01…12 | LLD1 (Foundation), LLD4 (end-session) |
| Edit-action core semantics | REQ-EA-01…14 | LLD1 (Foundation) |
| Aggregate scoping | REQ-AGG-01…03 | LLD1 (Foundation), LLD2 (Module Write Path) |
| API-call atomic groups | REQ-ATO-01…05 | LLD1 (Foundation) |
| Module modifications | REQ-MOD-01…04, REQ-PORT-01…03, REQ-ADD-01…08, REQ-VAL-01…02 | LLD2 (Module Write Path) |
| Delete Module cascade | REQ-DEL-01 | LLD5 (Delete Module; `docs/module-write/design/delete-module-design.md`) |
| Commit | REQ-CMT-01…07 | LLD4 (Commit + Stage/Unstage) |
| Undo / Redo | REQ-UNDO-01…05 | Deferred (Undo/Redo LLD) |
| DiffMerge workflow | REQ-TM-01…06 | LLD6a (DiffMerge Foundation) |
| DiffMerge granularity | REQ-CG-01…06 | LLD6a (comparer / stager encoding) |
| Cross-entity atomic groups | REQ-ACG-01…06 | LLD6a (server-enforced staging) |
| Stage / Unstage APIs | REQ-ST-01…07 | LLD4 (Commit + Stage/Unstage) |
| Change summary | REQ-CS-01…10 | LLD6a (DiffMerge Foundation) |
| Visual diff on GET | REQ-VD-01…09 | LLD3 (Read Overlay + Designer Visual Diff) |
| Designer pending changes | REQ-DM-01…04 | LLD3 (Read Overlay + Designer Visual Diff) |
| Canvas / tree-view selection | REQ-CV-01…07 | LLD6a (Change Summary) |
| DIFF_MERGE-exclusive writes | REQ-DEF-01…08 | LLD6b (DiffMerge Definitions), LLD6c (ParameterDefinition Elements) |
| Invariants | I1…I9 | Cross-cutting; enforcement points listed in §13 |
| Non-functional | NFR-CONSIST-01, NFR-STAT-01, NFR-INDEX-01, NFR-AUDIT-01 | LLD1 (indexes, transaction, session state), LLD4 (audit) |

Resolved open questions (from requirements §21):
- **OQ-7** (Designer accumulation vs DiffMerge field-level granularity) — resolved via `fieldPath` addressing scheme (§4).
- **OQ-8** (API-call tracking handle representation) — resolved: write API responses return `{ groupId }` (atomic-unit handle). `StageRequest` (§10) accepts `changeIds`, `groupIds`, or `linkedEntityGroupIds` as selectors — the `changeIds` selector lets clients target specific rows resolved by follow-up query on `edit_actions WHERE group_id = ?`.
- **OQ-4** (Manual STAGED overlapping tool UNSTAGED) — storage half resolved (distinct fieldPaths coexist); selection-panel semantics remain open for LLD6a.

Still open at the framework level:
- OQ-1, OQ-2, OQ-3, OQ-5, OQ-6 — each carries a note in the requirements doc naming the LLD that resolves it.

---

## 3. Architecture Overview

Three-layer hexagonal architecture (unchanged from the codebase's existing pattern). The dependency arrow always points inward — `@arc/api` and `@arc/persistence` depend on `@arc/core`; core has zero framework or infrastructure imports.

```
┌────────────────────────────────────────────────────────────────────────┐
│  @arc/api (NestJS)                                                     │
│                                                                        │
│    Controllers                                                         │
│    SessionGuard  ← resolves active session; attaches to UoW              │
│    DTOs + serialization                                                │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  @arc/core (application + domain — zero framework imports)             │
│                                                                        │
│    Command handlers, Query handlers, CQRS orchestration                │
│    Aggregate edit-repo interfaces (ports)                              │
│    Read-service interfaces (ports)                                     │
│    DiffCompareService orchestrator + per-aggregate comparers           │
│    DiffStager                                                          │
│    Domain entities (aggregates, value objects)                         │
│    Session lifecycle handlers (Start / End)                            │
│    change-vocabulary (ChangeOperation, ChangeStatus, Source)           │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │  port implementations (adapters)
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  @arc/infrastructure/persistence (TypeORM / SQLite)                    │
│                                                                        │
│    TypeORM schemas (entity_tables + edit_actions + session tables)     │
│    Edit-repo adapters — map domain → delta/payload → EntityStagingSvc  │
│    Read-service adapters — join committed + pending via OverlayMerge   │
│    EditActionsQueryService — raw pending-change queries                │
│    PendingChangeWriter — accumulator, per-slot, cached bulk           │
│    OverlayMerge — fold pending onto committed                          │
│    PendingChangeCache — UoW-scoped write buffer for bulk paths         │
└────────────────────────────────────────────────────────────────────────┘
```

### Key ports (interface in core, adapter in persistence)

- `IModuleEditRepository`, `ISubgraphEditRepository`, `IContainerEditRepository`, `IKeyDefinitionEditRepository`, `ISpfModuleDefinitionEditRepository` — one per aggregate root (§5).
- Read-service ports per aggregate (e.g., `ISpfModuleReadService`).
- `ICommitService` — commit orchestration.
- `IChangeStatusRepository` — stage / unstage.
- `UnitOfWork` — carries session context, transaction, cache.

### Cross-cutting services (all in persistence)

- `PendingChangeWriter` — the single place where accumulator merge, per-slot supersede, and cached bulk writes live. Shared across every aggregate edit repo (§7).
- `OverlayMerge` — pure in-memory fold algorithm invoked by every read-service adapter (§8).
- `EditActionsQueryService` — raw pending-change queries (fetch by aggregate, by session, by table, wipe by source).

### Where in-repo diff-tool lives

The diff-compare tool is in `@arc/core` (not an external component). It reads Reference and Base file data via read ports, computes changes, and stages via edit repos with `cache = true`. No wire format between the tool and any handler — the tool IS a core-layer service invoked by the apply-diff command handler (§11).

---

## 4. Storage Model

The pending-change store is the pivot of the whole framework. Every session's uncommitted work lives here until commit or session end. The read overlay merges this with committed data; commit applies from here to entity tables; undo/redo (deferred) operates on rows in this store.

The core table is `edit_actions`, retained by name from the current schema but reshaped structurally. `baseVersion` moves to a dedicated side-table so it can carry capture-once semantics (REQ-EA-13) without duplication across superseded rows.

### `edit_actions` — pending change rows

| Column | Type | Purpose |
|---|---|---|
| `changeId` | integer PK | Unique identifier for the pending change. Exposed as one of the stage/unstage handles. |
| `sessionId` | integer FK | Owning session. |
| `aggregateId` | integer | System ID of the aggregate root this change belongs to (§5). Enables single-scan reads across an aggregate. |
| `targetTable` | varchar | Entity kind being changed (canonical name from `ENTITY_NAMES`). Renamed from `tableName`. |
| `targetSystemId` | integer | System ID of the specific row being changed (or the row that will be created). Renamed from `systemId`. |
| `operation` | enum | `CREATE` / `UPDATE` / `DELETE`. |
| `fieldPath` | varchar nullable | Addressing target within the entity — see §4.1. |
| `newValue` | JSON | Replacement value for the addressed target. |
| `source` | enum | `MANUAL` / `DIFF_TOOL` / `AUTO_ROUTING` — writer provenance. Drives wipe-by-source on diff re-apply. |
| `changeStatus` | enum | `STAGED` / `UNSTAGED`. Only STAGED apply at commit. |
| `groupId` | varchar | UUID stamped per API call. Handle for atomic undo/redo/stage/unstage. |
| `linkedEntityGroupId` | varchar nullable | Groups rows across entities that must stage/unstage together (REQ-ACG-01). Server-enforced. |
| `createdAt` | datetime | Insertion time. Fold order key (tiebreak: `changeId`). |
| `validUntil` | datetime nullable | `NULL` = current row; set when superseded by a later write on the same slot. Retains history for undo/redo. |

**Changes from the current schema:**
- Rename `systemId` → `targetSystemId`, `tableName` → `targetTable` (columns identify the change's target, not the change row itself).
- Replace `payload` (JSON) with `fieldPath` + `newValue` (structured per-slot addressing).
- Remove `baseVersion` (moves to `session_entity_versions`).
- Add `source` and `linkedEntityGroupId`.

**Rationale (kept short — LLD1 carries the details):** the table's role is unchanged — record pending edits until commit/end. Renaming would only churn existing infrastructure code. The column reshape captures the new addressing model without changing the table's identity.

### `session_entity_versions` — side-table for baseVersion capture

| Column | Type | Purpose |
|---|---|---|
| `sessionId` | integer, PK part | Owning session. |
| `targetSystemId` | integer, PK part | Entity being modified. |
| `baseVersion` | integer | Committed `version` at first modification of this entity in this session. |

INSERT-IGNORE semantics — on the first modification the row is captured; subsequent modifications no-op via the composite PK. This delivers REQ-EA-13 capture-once mechanically. Entities created within the session have no row here (REQ-EA-12).

### `project_sessions` and `session_commits` — unchanged

`project_sessions` retains its current shape. The partial unique index `WHERE status = 'ACTIVE'` on `fileSystemId` enforces I1 (one active session per file).

`session_commits` retains its shape (message + timestamp + count per REQ-CMT-06).

### 4.1 `fieldPath` addressing scheme

Every pending change targets one atomic replacement slot, addressed by `fieldPath`:

| `fieldPath` value | Meaning | Typical use |
|---|---|---|
| `null` | Whole-entity accumulator | DESIGNER default — user-manual writes merge into a single row per entity. |
| `"$"` | Whole-entity replacement | CREATE, DELETE, whole-entity DIFF_MERGE atomic replacement (e.g., KeyDefinition replace). |
| Scalar column name (e.g., `"alias"`) | One column | DIFF_MERGE tool per-field independent slots. |
| Custom named group (e.g., `"identity"`) | Multi-column atomic group | DIFF_MERGE tool grouping several columns as one selectable unit. |
| Element path (e.g., `"elements[gain]"`, `"elements[stereoEq].elements[left]"`, `"elements[channels][0].doa"`) | Path into a serialized-string column addressing a node in a tree of typed elements (`ConfigElement` / `StructElement` / `ElementArray` / `StructArray` from `packages/core/.../param-parser/types/element-definition.ts`) | DIFF_MERGE tool changes to elements of `ParameterDefinition.elementsStructure`. Path syntax and depth are decided by the diff-tool + reducer contract; server treats the string as opaque (REQ-CG-03). |

The server treats `fieldPath` as an opaque string (REQ-CG-03). The commit reducer dispatches on `fieldPath` *shape* (scalar column vs `"$"` vs multi-key JSON vs element path), not on any interpretation of custom names. See §9.

### 4.2 Supersession

Key: `(sessionId, targetSystemId, fieldPath) WHERE validUntil IS NULL` — a partial unique index ensures one active row per slot per session. A new write on the same slot sets the current row's `validUntil = now` and inserts a new row.

For accumulator rows (`fieldPath = null`), the write handler does a read-modify-write: fetch the current row's payload, merge new keys, insert the merged row, supersede the old. For per-slot rows (scalar column / custom group / element path), it's a plain insert-and-supersede on that slot.

### 4.3 Indexes (NFR-INDEX-01)

| Index | Columns | Filter |
|---|---|---|
| `uniq_edit_actions_current` (unique) | `sessionId, targetSystemId, fieldPath` | `WHERE validUntil IS NULL` — supersession + reads |
| `idx_edit_actions_agg_active` | `sessionId, aggregateId` | `WHERE validUntil IS NULL` — aggregate-scoped overlay |
| `idx_edit_actions_table_active` | `sessionId, targetTable` | `WHERE validUntil IS NULL` — table-scoped queries |
| `idx_edit_actions_status_active` | `sessionId, changeStatus` | `WHERE validUntil IS NULL` — stage/commit filters |
| `idx_edit_actions_source_active` | `sessionId, source` | `WHERE validUntil IS NULL` — wipe-by-source on diff re-apply |
| `idx_edit_actions_linked_group_active` | `sessionId, linkedEntityGroupId` | `WHERE validUntil IS NULL AND linkedEntityGroupId IS NOT NULL` — cross-entity group expansion |

---

## 5. Aggregate Registry

An aggregate root is an entity whose `systemId` is the scoping key for a set of related pending changes. Every child entity's pending changes carry the root's system ID in the `aggregateId` column, enabling the read overlay to fetch all pending changes for an aggregate in a single indexed scan (REQ-AGG-01).

**Domain aggregate identification rule:** every folder directly under `packages/core/src/domain/entities/definitions/`, `usecase-data/`, `driver-module-data/`, and `module-manager/` (excluding `common`) declares a domain aggregate. The aggregate's root is the file directly under the folder; entities in nested `entities/` or `value-objects/` folders are owned by that aggregate.

### Aggregate roots directly in scope for this design

| Aggregate root | Owned children (edit-action scope) | Notes |
|---|---|---|
| `SpfModule` | `Node` (module type), `DataPort`, `ControlPort`, `Intent`, module CKV/TKV rows and their payload/value-association rows | Node has the same systemId as its module (1:1 relation). Ports, Intents, and module-owned CKV/TKV instance rows are the module's owned children for edit purposes. `spf_module_properties_data` is not part of new module-write behavior. |
| `Subgraph` | `SubgraphPropertyData` | Property data rows are the subgraph's owned children. |
| `Container` | `ContainerPropertyData` | Same pattern as Subgraph. |
| `UseCase` | UseCase GKV rows, `use_case_subgraphs`, `use_case_subgraph_pairs` | Relationship rows remain domain relationships in core. When those rows need edit-actions, persistence gives each relationship row a generated internal `system_id` while preserving natural uniqueness constraints. |
| `SpfModuleDefinition` | `SpfModuleParameterDefinition` (with its `elementsStructure` addressable via element-path fieldPaths), `DataPortDefinition`, `DataPortGroupDefinition`, `StaticControlPortDefinition`, `StaticIntentDefinition`, `DynamicIntentDefinition`, `ModuleAttribute`, `ModulePropertyDefinition`, `ModuleDefinitionMetaData` | DIFF_MERGE-only writes. ParameterDefinition is part of this aggregate; individual elements are addressed via element-path fieldPaths within the aggregate. |
| `KeyDefinition` | `ValueDefinition` | DIFF_MERGE-only writes. |

Other domain aggregates exist per the folder rule (`UseCase`, `DataLink`/`ControlLink`, `DriverModuleDefinition`, `TagDefinition`, `VcpmModuleDefinition`, `Project`, `DriverModule` under `driver-module-data`, `ModuleManagerData` under `module-manager`, Subsystem-type `Node`, etc.) and will be brought into edit scope as later design passes address them.

### Edit-action aggregate scoping (`aggregateId` in edit_actions)

Every pending change row carries `aggregateId` — the systemId of the aggregate root under which the change is scoped for read-overlay purposes. Usually this is the entity's own systemId. Some domain aggregates roll up to a supertype's aggregate for edit-action scoping when a 1:1 or strong-ownership relation makes it useful (e.g., the `Node` domain aggregate rolls up to `SpfModule` for module-type nodes — module edits span both tables).

### Aggregate write ownership (REQ-AGG-02)

Every aggregate has exactly one edit repo (e.g., `IModuleEditRepository`, `ISubgraphEditRepository`, `IContainerEditRepository`, `IKeyDefinitionEditRepository`, `ISpfModuleDefinitionEditRepository`). All pending-change writes for that aggregate's rows go through its edit repo. No other code path may write pending changes attributed to that aggregate.

Handlers that touch multiple aggregates in one API call (Add Module — creates Subgraph, Container, Module, Node, Ports) delegate to each aggregate's edit repo with a shared `groupId`. This satisfies REQ-AGG-03 — aggregate scoping and API-call atomicity are orthogonal mechanisms.

### `aggregateId` assignment examples

Every pending change carries the root's systemId in `aggregateId`, regardless of which child entity is being changed:
- Change on module M's `alias` → `aggregateId = M`, `targetTable = SpfModule`, `targetSystemId = M`.
- Change on module M's port P → `aggregateId = M`, `targetTable = DataPort`, `targetSystemId = P`.
- Change on subgraph S's property data row X → `aggregateId = S`, `targetTable = SubgraphPropertyData`, `targetSystemId = X`.
- Change on definition D's parameter PD's element `gain` → `aggregateId = D`, `targetTable = SpfModuleParameterDefinition`, `targetSystemId = PD`, `fieldPath = "elements[gain]"`. For a nested element (e.g., `left` inside a `stereoEq` struct), the path traverses the tree: `fieldPath = "elements[stereoEq].elements[left]"`. Path syntax is decided by LLD6c.

The read overlay uses `aggregateId` to fetch all pending changes for a given root in one indexed query (see §8).

### Relationship-row edit identity

Join tables that must be created, updated, or deleted through edit-actions need a concrete target identity. If the natural key is multi-column, persistence may add a generated `system_id` for edit addressing while keeping the natural uniqueness constraint as the domain invariant.

Example: Delete Module removes `use_case_subgraphs` and `use_case_subgraph_pairs` rows when it deletes an empty subgraph. Those relationship tables therefore need persistence-only generated `system_id` values for `edit_actions.targetSystemId`, base-version capture, and overlay processing. Core continues to expose relationships through domain IDs (`useCaseSystemId`, `subgraphSystemId`, source/destination subgraph IDs); it does not expose or reason about the generated row identity.

---

## 6. Session Gate & Mode Gating

Responsibility split — request-time gating vs command-time business logic:

**`SessionGuard` (in `@arc/api`) — active session resolution only, no DB writes:**
- Resolves the active session for the target project (REQ-SESS-01, REQ-SESS-05). URLs carry `{projectId}` per the codebase's existing pattern; the guard resolves `projectId → fileSystemId → active session` in one port call. No active session → `403 Forbidden`.
- Attaches the resolved session (including its mode) onto the request-scoped context (`UnitOfWork`) so downstream code reads it without duplicating the fetch.
- **Does not** check mode allow-lists. Mode enforcement moves to CommandBus (see below) so it applies uniformly to direct API dispatch and to dynamic dispatch paths (e.g., validation auto-fix routes commands through a single generic endpoint — a Nest guard on that endpoint cannot know the underlying command's mode requirements).

**`CommandBus` mode check (`@arc/core`) — enforces REQ-SESS-06:**
- Every command class declares its allowed modes as a plain static field: `static readonly allowedModes: readonly SessionMode[]`. Zero framework or reflect-metadata dependency — pure TS, safe for React Native consumers.
- Before starting a transaction and invoking the handler, `CommandBus.execute()` reads `command.constructor.allowedModes` and compares it against `uow.getWriteContext().session.mode`. Disallowed mode → throws `SessionModeNotAllowedError` (mapped to `403` at the api boundary).
- Applies uniformly to: direct API dispatch (controller builds command → bus checks), validation auto-fix dispatch (apply-fix controller uses `FixCommandDispatcher` to construct the command → bus checks), any future dynamic dispatch pattern.

**Command handlers — business logic:**
- End-session handler (`EndSessionHandler`) owns REQ-SESS-09 and REQ-SESS-10: discard UNSTAGED edit_actions, delete session record iff no commits were made in the session, else retain the session row as audit history. This involves DB writes and cannot live in the guard.
- Entity-existence and domain-state validations (REQ-VAL-01, REQ-VAL-02) live in the write handlers via read repos — they inspect domain state, not just session state.
- User-manual-edit staging in DIFF_MERGE mode (REQ-SESS-12): handler + write repo set `changeStatus = STAGED` regardless of mode.

**Mode allow-list examples** (declared on the command class as `static readonly allowedModes`):
- DESIGNER: SET module fields, add ports, Add Module, Delete Module (Phase 1), stage/unstage of auto-routing UNSTAGED rows.
- DIFF_MERGE: superset — plus manual writes (REQ-SESS-07, REQ-SESS-11), definition CREATE/UPDATE (REQ-DEF-04), reference-file import (REQ-DEF-01), tool apply (`POST /diff-merge/apply`), stage/unstage of tool-emitted UNSTAGED rows.
- TUNING, DISCOVERY_WIZARD: out of scope for this design.

Session context flow (Pattern A — explicit hand-off): SessionGuard resolves the active session once via a session-query port and attaches it to the request. Controller reads it and passes explicitly on `commandBus.execute(cmd, { session })`. CommandBus populates a `WriteContext = { sessionId, groupId, mode }` on the UoW. Downstream services (`PendingChangeWriter`, edit repos, `CommitService`) do not take `sessionId` as an explicit parameter — they read it from the UoW's `WriteContext`. No re-query. No request-scoped magic imported into core.

---

## 7. Write Flow

Every write API — user-manual (DESIGNER or DIFF_MERGE) and algorithm-driven (diff-tool apply, auto-routing) — flows through the same layered path. The differences between modes and callers are encoded in the write's `fieldPath` shape and `source` value, not in different code paths.

### Command-bus flow

```
HTTP request
  ↓
Controller (parses body → command)
  ↓
SessionGuard (resolves active session; attaches to UoW; no mode check here)
  ↓
CommandBus (checks command.allowedModes against session mode → 403 if disallowed;
             starts transaction; stamps groupId = UUID on the WriteContext)
  ↓
Command handler (@arc/core) — pure domain work: load domain objects, validate existence,
                              call domain-verb repo methods
  ↓
Aggregate edit repo (@arc/persistence) — maps domain args → delta/payload, assigns
                                          aggregateId + targetTable, chooses fieldGroup
                                          + source based on mode
  ↓
PendingChangeWriter (@arc/persistence) — accumulator merge OR per-slot supersede;
                                            baseVersion capture via INSERT-IGNORE on
                                            session_entity_versions
  ↓
edit_actions INSERT (single row, or bulk via PendingChangeCache)
```

The handler never sees row shape, `fieldPath`, or `aggregateId`. It calls domain-verb methods like `renameModule(moduleId, newAlias, uow)` and lets persistence translate. The `stage*` verb prefix is intentionally avoided — recording a pending change and staging it (flipping `changeStatus = STAGED`) are separate operations. Edit-repo methods record pending changes; whether those pending rows end up STAGED or UNSTAGED depends on `source` + mode.

For aggregate deletes, the same boundary applies. Core decides that an entity should be deleted and calls a domain operation such as `deleteModule(...)`, `deleteContainer(...)`, or `deleteSubgraph(...)`; the persistence adapter enumerates the concrete rows owned by that aggregate and records the corresponding edit-actions. Core must not know table names or persistence-only child-row identifiers.

### Options-bag repo API

Every write method on an edit repo has the same shape: positional required domain arguments, then the `UnitOfWork` (which carries the ambient WriteContext), then an optional options bag for extended metadata:

```
recordXxxChange(
  ...positional required domain args...,
  uow,
  options?: {
    fieldGroup?:          string    // null → accumulator; non-null → per-slot / whole-entity / element
    linkedEntityGroupId?:  string    // atomic cross-entity selection group
    cache?:               boolean   // buffer write instead of immediate INSERT
    source?:              SourceKind  // MANUAL (default) / DIFF_TOOL / AUTO_ROUTING
    changeStatus?:        "STAGED" | "UNSTAGED"   // honored only when source = DIFF_TOOL (REQ-EA-05 revised)
  }
)
```

Method names use domain verbs (`renameModule`, `changeContainer`, `addDataPort`, `createModule`, `deleteModule`, `updateElement`, …) rather than a `stage*` prefix. The repository type (`IModuleEditRepository`) already conveys the "pending edit" nature; the method describes the domain operation. Whether the recorded row ends up STAGED or UNSTAGED depends on `source` + mode, not on the method name.

`sessionId`, `mode`, and `groupId` are read from `uow.getWriteContext()` — not passed as parameters. DESIGNER callers typically omit the options bag entirely (mode-derived `fieldGroup = null` accumulator + default `source = MANUAL`). DIFF_MERGE tool callers (the diff-stager) pass `fieldGroup`, `linkedEntityGroupId?`, `cache: true`, `source: DIFF_TOOL`. DIFF_MERGE manual callers pass `fieldGroup` set to the scalar column. Auto-routing callers pass `source: AUTO_ROUTING`.

### `fieldGroup` selection rules

The write repo derives `fieldGroup` from session mode + explicit override:

| Session mode | Source | `fieldGroup` value |
|---|---|---|
| DESIGNER | MANUAL | `null` (accumulator — one row per entity accumulates all field changes) |
| DIFF_MERGE | MANUAL | The scalar column name for the field being changed (per-slot) |
| DIFF_MERGE | DIFF_TOOL | Whatever the diff-comparer/stager decided — scalar column, custom named group, `"$"`, or element path |
| DIFF_MERGE | AUTO_ROUTING | Per-slot (scalar column name) — auto-routing produces independently-selectable rows |

Explicit `options.fieldGroup` in the write call overrides the mode-derived default when the caller needs a specific addressing (e.g., diff-stager passing a custom named group).

### Accumulator merge (DESIGNER default)

The classic pattern from the reference schema, unchanged:

1. Look up current row for `(sessionId, targetSystemId, fieldGroup=null)`.
2. If found: merge the new delta keys into the existing payload → this is the accumulated payload.
3. If not found: capture `baseVersion` from the entity table's current `version` (unless CREATEing).
4. INSERT new row with the merged payload. UPDATE the prior row's `validUntil` = now.

Multiple field changes on the same entity in the same session accumulate to a single active row.

### Per-slot supersession

For non-null `fieldGroup` (DIFF_MERGE per-slot, whole-entity `"$"`, custom named groups, element paths):

1. Supersede the current row for `(sessionId, targetSystemId, fieldGroup)` by setting `validUntil = now`.
2. INSERT new row with the new payload.
3. `baseVersion` still captured on first modification of any given entity — regardless of which fieldGroup was written first — via the side-table's INSERT-IGNORE.

Two rows for the same entity on different fieldGroups coexist as active rows. The read overlay folds them in `createdAt` order (§8).

### CREATE-then-modify (REQ-EA-10c)

When an entity is created in the current session and then modified:
1. CREATE row: `fieldGroup = "$"`, `operation = CREATE`, `newValue` = full row payload.
2. Subsequent modifications write on other fieldPaths (or continue accumulating on `null` for DESIGNER).
3. Both rows coexist as active rows targeting the same entity.
4. Read overlay applies CREATE first, then folds subsequent rows on top.
5. Commit reduces the whole set to a single INSERT with the merged effective row.

Undo of the CREATE deactivates the CREATE row; subsequent modification rows become orphans (nothing to apply to) but stay retained for redo.

### `PendingChangeCache` and `applyCachedActions()`

For bulk writes (DiffMerge apply of thousands of change units; auto-routing bulk emit), individual INSERT-per-row is slow. The cache lets writes accumulate in an in-memory buffer scoped to the UoW:

1. Repo method called with `options.cache = true` → row is appended to the cache, not written to the DB.
2. Caller (typically the diff-stager or auto-routing runner) invokes `uow.applyCachedActions()` after all rows are queued.
3. `applyCachedActions()` performs one bulk baseVersion capture query + one batched multi-row INSERT.
4. Transaction commit/rollback disposes the cache automatically.

**Cache constraint:** `cache = true` is only valid for non-accumulator fieldGroups (`null` writes need read-modify-write on every SET and can't defer). DESIGNER writes always use `cache = false`.

### `groupId` and `source`

- **`groupId`** — stamped once per API call by the command bus onto the `WriteContext = { sessionId, groupId, mode }` held on the UoW. Every row produced within that call carries the same value. Atomic handle for undo/redo/stage/unstage of the whole call (REQ-ATO-01).
- **`source`** — passed per write via the options bag (not held on WriteContext, to avoid mid-request mutation when nested services need different sources):
  - User-manual writes (through handlers) → callers omit `source`; defaults to `MANUAL`.
  - Diff-stager writes → `source: DIFF_TOOL` passed explicitly on each edit-repo call.
  - Auto-routing writes → `source: AUTO_ROUTING` passed explicitly.
  Used at re-apply time (`WHERE source = 'DIFF_TOOL'` for REQ-TM-06 idempotent apply — status-agnostic; see §11).

---

## 8. Read Flow

Reads go through read-service ports whose implementations live in persistence. Every read that returns entity data merges committed rows with pending edit_actions to produce the effective state — this is the overlay. Callers never see raw pending rows or `fieldPath`.

### Layered flow

```
HTTP request
  ↓
Controller (parses query params — e.g., ?includeDiff=true)
  ↓
QueryHandler (@arc/core) — orchestrates one or more read-service ports
  ↓
Read-service port (interface in core; e.g., ISpfModuleReadService)
  ↓
Read-service adapter (@arc/persistence) — fetches committed rows,
                                            fetches active pending rows via
                                            EditActionsQueryService, folds via OverlayMerge
  ↓
Domain-shaped read model returned to handler
  ↓
Handler assembles response DTO (with pendingChangeStatus, optionally diffEntity)
```

### `OverlayMerge` algorithm

Given committed data for an aggregate + all active pending rows for that aggregate:

1. Start with committed rows as the effective state.
2. Fetch all pending rows for `(sessionId, aggregateId)` where `validUntil IS NULL`. Fold rows in `(createdAt, changeId)` order.
3. For each pending row, dispatch on `fieldPath` shape:
   - **Scalar column name** → set the addressed column on the effective row.
   - **`null` or a multi-key named group / `"$"`** → apply payload keys as columns (partial update).
   - **Element path (e.g., `"elements[gain]"` or `"elements[stereoEq].elements[left]"`)** → parse the serialized column into typed elements (`ConfigElement` / `StructElement` / `ElementArray` / `StructArray` per `element-definition.ts`), navigate the tree by the path, replace at the target node, re-serialize.
   - **`CREATE` operation** → create a new effective row for `targetSystemId` if none exists.
   - **`DELETE` operation** → tombstone the effective row.
4. Return the effective state along with a diff summary (per-field old/new pairs derived from committed vs pending) when the caller requested diff context.

Later rows win per addressed slot. `createdAt` order is the primary key for determinism; `changeId` breaks ties.

### `changeStatus` filter

**None — overlay always includes both `STAGED` and `UNSTAGED`** rows. Every diff entry in the response carries its own `status` and `source` so the client renders each appropriately (STAGED user-manual, UNSTAGED auto-routing proposal, UNSTAGED diff-tool proposal, etc.). Satisfies REQ-ST-06 literally; REQ-DM-02's "implicitly STAGED" governs write-side auto-stage behavior, not what the read overlay surfaces. Reversible — a future mode needing filtering can add a query param without redesigning the overlay.

### Aggregate composition

Multi-table aggregates (e.g., an SpfModule aggregate spans `spf_modules`, `nodes`, `data_ports`, `control_ports`, Intents, and module-owned CKV/TKV rows) are assembled inside the persistence read-service adapter. Core sees the domain-shaped snapshot — a typed aggregate object with owned children as arrays. The adapter fetches each child table, applies overlay, attaches children to the root.

Persistence adapter imports domain types (e.g., `DataPort`, `ControlPort`) from core for its return shape. Core does not see `targetTable` or row-level pending change structure.

### Entity-level `pendingChangeStatus`

Every entity DTO carries an optional `pendingChangeStatus: "STAGED" | "UNSTAGED" | "PARTIAL"` field, **always populated when the entity has any pending changes**, independent of `?includeDiff=true`. Absent when the entity has no pending changes.

Values:
- `STAGED` — all pending changes on this entity are staged.
- `UNSTAGED` — all pending changes on this entity are unstaged.
- `PARTIAL` — mix of staged and unstaged (common in DIFF_MERGE; possible in DESIGNER when auto-routing rows coexist with user-manual rows).

Cheap client hint: list views can render a "has edits" indicator without opting into the full diff payload.

### `?includeDiff=true`

Adds the optional `diffEntity` field to the entity DTO — see §12 for the full shape. Contains per-change-unit `operation`, `changeUnits[]` (with individual `status`, per-field old/new pairs), atomic-group markers, and identifiers for stage/unstage.

---

## 9. Commit Flow

Commit takes all STAGED rows in the active session, validates them, applies them to entity tables in a domain-aware order, records the commit, and cleans up. All in one transaction (REQ-CMT-01, NFR-CONSIST-01).

### Flow

```
CommitChangesHandler.handle(cmd, uow):
  return commitService.commit(cmd.message, uow)

CommitService.commit(message, uow):
  1. Snapshot STAGED rows for the session, folded per (targetTable, targetSystemId)
     via FieldPathReducer to per-entity effective payloads.
  2. Conflict detection — for every UPDATE/DELETE target:
        compare session_entity_versions.baseVersion with entity table's current version.
        Mismatch → collect as ARC-COMMIT-CONFLICT ValidationIssue.
     If any conflicts → return { kind: "rejected", report: ValidationReport(conflicts) }.
  3. Optional COMMIT-group validation (?enforceValidation=true) —
        ValidationEngine.run(context, VALIDATION_RULE_GROUP.Commit).
        Blocking issues → return { kind: "rejected", report }.
  4. Apply in domain-aware order — DELETE → UPDATE → CREATE per REQ-CMT-02,
     with entity-kind ordering hand-written by the commit service (see §9.1).
     On any DB-level failure, translate to a domain ValidationIssue with
     entity context (e.g., "Cannot delete module M — referenced by usecase U").
  5. INSERT session_commits row (REQ-CMT-06) — with an auto-generated
     description summarizing what was applied.
  6. DELETE applied STAGED rows and their superseded predecessors (REQ-CMT-05).
     Retain UNSTAGED rows (session stays active).
  7. Return { kind: "success", commitId, appliedCount }.
```

### `CommitResult`

```ts
type CommitResult =
  | { kind: "success",  commitId: number, appliedCount: number }
  | { kind: "rejected", report: ValidationReport }
```

The `rejected` case reuses the `ValidationReport` type from the validation framework. Reported issues include:
- `ARC-COMMIT-CONFLICT` — one per entity whose current version differs from the captured `baseVersion` (REQ-EA-14).
- Any BLOCKING issues from the COMMIT-group rules (validation framework rules with `groups: [VALIDATION_RULE_GROUP.Commit]`).
- Domain-shaped DB-error translations produced by the commit service — replacing raw FK-violation errors with domain-meaningful `ValidationIssue`s that carry `impactedEntity` context.

Unexpected internal errors that indicate framework bugs propagate as exceptions → 500. They are not modelled as `CommitResult` cases.

The API layer maps `CommitResult`:
- `success` → `200 OK` with commitId + appliedCount.
- `rejected` → `422 Unprocessable Entity` with the `ValidationReport` in the body.

### 9.1 Ordering, error mapping, and auto-description — hand-written, deferred to Commit LLD

Detailed apply-order per entity kind, per-entity dependency traversal, DB-error to `ValidationIssue` mapping, auto-generated commit description, and any partial-success vs full-rollback policy live in a dedicated **Commit LLD** (part of LLD4 or a subsequent doc). Not in scope for this Overall Design or LLD1.

Rationale for hand-written over a generic FK-graph topological sort:
- Domain-aware error messages give users actionable feedback instead of raw DB errors.
- Auto-generated commit descriptions ("Added 2 modules, updated 3 aliases, deleted 1 port") make `session_commits` audit trails readable.
- The commit service can decide per-entity failure handling (translate specific errors into specific ValidationIssue codes with fix options).

Trade-off: hand-maintained ordering must be updated when the schema evolves. Missing a dependency surfaces as an FK error at commit time rather than at boot. A **CI-time consistency check** (extracting FK graph from TypeORM metadata) can be added as a safety net — it inspects that the hand-written order respects every FK edge and warns otherwise. Not a runtime dispatcher; just a lint step. Details in the Commit LLD.

A key open decision the Commit LLD will settle:
- **REQ-CMT-01 interpretation** — strict all-or-nothing (any failure aborts the whole transaction) or per-entity partial-success (successful items commit, failed items report back). The latter would require a REQ-CMT-01 revision.

### Post-commit cleanup

Applied STAGED rows and their superseded predecessors are deleted (REQ-CMT-05). UNSTAGED rows for the still-active session remain (they weren't part of this commit). `session_entity_versions` rows for entities that were applied are cleared — next modification captures a fresh baseline.

The session record stays `ACTIVE` (REQ-SESS-04); only `EndSessionHandler` transitions it to `ENDED`.

---

## 10. Stage/Unstage Flow

Stage/unstage flips `changeStatus` on already-existing pending rows. Used by:
- DiffMerge UI, where the user reviews tool-emitted UNSTAGED proposals and selects a subset to stage before committing.
- Auto-routing UI, where auto-routing emits UNSTAGED changes and the user promotes them to STAGED for commit.
- Any future workflow producing UNSTAGED rows.

### Request shape — discriminated union

The stage/unstage API accepts one of three handle kinds at a time:

```ts
type StageRequest =
  | { by: "changeIds",           ids: number[] }
  | { by: "groupIds",            ids: string[] }
  | { by: "linkedEntityGroupIds", ids: string[] }
```

Server expands to a concrete row set based on `by`, then UPDATEs `changeStatus`. If the client needs to stage across both `changeIds` and `groupIds` in one atomic call, they issue two calls within the same UoW (transaction).

### Expansion rules

| `by` value | Row set fetched |
|---|---|
| `changeIds` | Direct: `WHERE changeId IN (?) AND validUntil IS NULL` |
| `groupIds` | `WHERE groupId IN (?) AND validUntil IS NULL` |
| `linkedEntityGroupIds` | `WHERE linkedEntityGroupId IN (?) AND validUntil IS NULL` |

### Directed selection dependencies

Some selectable changes are valid only when other changes are selected with them. The general rule is directed:

```text
A requires B
```

Staging A also stages B and its transitive requirements. Unstaging B also unstages A and its transitive dependents. The reverse operations are intentionally asymmetric: staging B does not stage A, and unstaging A does not unstage B.

Dependency discovery belongs in core services that operate on domain-shaped change descriptors. Persistence supplies pending-change snapshots, reconstructable before/after state, and bulk status updates. `IChangeStatusRepository` remains a generic status mutator for resolved `changeId` values; it has no entity-specific cascade logic.

Detailed design: `docs/edit-crud/design/change-selection-dependencies-design.md`.

### Cross-entity atomic group enforcement (I6, REQ-ACG-02)

For `by: "linkedEntityGroupIds"`:
1. Server expands each `linkedEntityGroupId` to its full row set.
2. Verifies the request would flip ALL rows for that group — not a strict subset.
3. If any group is partial, the whole call rejects with a validation error listing the incomplete groups.

`by: "changeIds"` and `by: "groupIds"` are *not* subject to this enforcement — a client using `changeIds` is asserting explicit per-row control. Cross-entity all-or-nothing is only invoked when the client explicitly addresses by group.

### Handler + API shape

```ts
// @arc/core port
interface IChangeStatusRepository {
  stage(request: StageRequest, uow: UnitOfWork): Promise<void>
  unstage(request: StageRequest, uow: UnitOfWork): Promise<void>
}

// @arc/core handlers — thin
class StageChangesHandler {
  async handle(cmd, uow) {
    await this.repo.stage(cmd.request, uow)
  }
}
```

`sessionId` is ambient via UoW — not a parameter on `stage` / `unstage`.

### Interaction with `groupId`

`groupId` and `linkedEntityGroupId` are orthogonal:
- `groupId` = API-call atomicity (all rows from one write API call move together for undo/redo/stage/unstage).
- `linkedEntityGroupId` = DiffMerge selection atomicity (rows across entities that the diff-tool decided must move together as one selectable unit).

A single row can carry both — e.g., a diff-tool-emitted row has both `groupId` (the apply-diff call's UUID) and `linkedEntityGroupId` (the tool's selection group).

---

## 11. DiffMerge Flow

DiffMerge is a three-way merge workflow: the user provides three files — Reference (original), Base (evolved from Reference), Target (destination for selected changes). The diff-compare tool computes what changed between Reference and Base and records the changes against Target's DIFF_MERGE session. The default is `changeStatus = UNSTAGED` — the user then selects which to apply via the change-summary panel. Per REQ-EA-05 (revised), the caller of `POST /diff-merge/apply` MAY configure the tool to write `STAGED` directly for workflows where up-front review is not required — those rows behave like user-manual STAGED writes and are picked up by the next commit without going through the selection panel.

### High-level flow

```
POST /diff-merge/apply { referenceFileId, baseFileId }
  ↓
ApplyDiffHandler (in @arc/core):
  groupId = uuid()
  compareResult = compareOrchestrator.compare(referenceFileId, baseFileId, uow)
  diffStager.stage(compareResult, sessionId, groupId, uow)
  await uow.applyCachedActions()
  return summaryService.buildForSession(sessionId)
```

The tool is in-repo (part of `@arc/core`). It compares files, decides granularity (independent field, atomic multi-field group, cross-entity atomic group, whole-entity replacement, element-in-serialized-column), and stages via the same repo methods user-manual writes use — with `cache = true` so writes accumulate in the UoW's `PendingChangeCache` and flush as one batch.

### Compare/Stage split

Two separate services in `@arc/core`, so pure comparison can be invoked without staging (compare-only endpoint):

```
diff-tool/
  compare/
    compare-result.ts                       — domain-shaped output type
    diff-compare-orchestrator.ts             — runs comparers, produces CompareResult
    spf-module-diff-comparer.ts              — per-aggregate comparers
    subgraph-diff-comparer.ts
    container-diff-comparer.ts
    key-definition-diff-comparer.ts
    spf-module-definition-diff-comparer.ts
    ...
  stage/
    diff-stager.ts                           — consumes CompareResult; dispatches to
                                              edit repos with cache=true
```

`CompareResult` is a persistence-agnostic domain type — a collection of typed change entries per aggregate kind, plus cross-entity group markers. `DiffStager` owns the field-to-method dispatch table: it knows, for each change entry, which repo method to call and with what `fieldGroup`.

### Compare-only endpoint

Same orchestrator, no stager. Returns `CompareResult` as a DTO. Used for previewing differences without committing to a DIFF_MERGE session or writing anything. Satisfies the revised REQ-TM-02.

### Idempotent re-apply within a session (REQ-TM-06)

If the client re-invokes `POST /diff-merge/apply` on the same active session before any commit (e.g., after adjusting the source files or changing the `changeStatus` mode), the framework wipes all prior tool-emitted rows before restaging — regardless of whether the earlier writes were STAGED or UNSTAGED. This makes the operation truly idempotent: the same inputs (files + configuration) produce the same result, even if a prior invocation used a different `changeStatus` configuration.

```
DELETE FROM edit_actions
WHERE sessionId = ?
  AND source = 'DIFF_TOOL'
  AND validUntil IS NULL
```

Manual STAGED rows (REQ-SESS-12) are preserved — they belong to the user, not the tool. Auto-routing rows are preserved (different `source`).

**End-to-end idempotency across commit cycles is deferred to the DiffMerge LLD.** The scenario — user commits part of a diff, then re-applies — needs the comparer to reason about Target's current committed state (which differs from Reference by whatever was already applied). Because systemIds are file-scoped and generated on entity creation, they do not match across Reference / Base / Target; the comparer needs a natural-key or content-based matching strategy to skip already-applied changes. That matching strategy is a DiffMerge-specific decision and lives in LLD6a rather than at the framework level.

### Cross-entity atomic groups

The comparer/tool decides which entities form an atomic selection unit; the stager sets `linkedEntityGroupId` on all rows within the group. The server enforces all-or-nothing at stage time (§10). Example: a diff might group a new CKV row with its parameter-payload rows so they stage together.

### Element paths for ParameterDefinition

The comparer emits `fieldPath` as a **path expression** through the `elementsStructure` tree, with `newValue` = the element (or subtree) DTO to be spliced in at that node. Examples:

- `elements[gain]` — top-level `ConfigElement`, replaced atomically.
- `elements[stereoEq]` — top-level `StructElement`, whole subtree replaced.
- `elements[stereoEq].elements[left]` — nested `ConfigElement` inside a struct.
- `elements[channels][0].doa` — nested field within an array item's struct.

The elements themselves are heterogeneous — `ConfigElement`, `StructElement`, `ElementArray`, `StructArray` (see `packages/core/src/application/usecase-designer/spf-module/param-parser/types/element-definition.ts`). Structs contain nested `elements[]`; arrays have a `template` and `arrayLength`.

On overlay, the read side parses the serialized `elementsStructure` column into the typed tree, navigates by the fieldPath, splices at the target node, and re-serializes. Commit does the same. Path syntax and reducer navigation logic are LLD6c-owned; server treats the string as opaque (REQ-CG-03).

Note: ParameterDefinition is part of the `SpfModuleDefinition` aggregate — `aggregateId` on these rows is the definition's systemId, not a separate ParameterDefinition ID.

### DIFF_MERGE manual write path (REQ-SESS-12)

Under DIFF_MERGE, the user can also perform manual edits (analogous to fixing conflicts during a git rebase). These go through the same edit repo methods as Designer writes; persistence sets `fieldGroup` to the per-slot column name and `changeStatus = STAGED` (per REQ-SESS-12). Manual STAGED rows coexist with tool-emitted rows (which are UNSTAGED by default, or STAGED if the tool was configured for auto-apply per REQ-EA-05) on the same entity — different fieldGroups keep them independent for selection purposes.

### Definition CREATE/UPDATE (REQ-DEF-04)

Definitions (`KeyDefinition`, `ValueDefinition`, `SpfModuleDefinition`, etc.) are read-only in DESIGNER. In DIFF_MERGE, dedicated edit repos (`IKeyDefinitionEditRepository`, `ISpfModuleDefinitionEditRepository`) permit CREATE and UPDATE. The tool uses these to import definitions from Reference into Target, or to update existing definitions.

### Reference-file definition import (REQ-DEF-01)

The tool can import module definitions from the Reference file into Target. A comparer variant reads definitions from Reference (via a read port), and stages CREATE rows on Target's definition tables.

### Change summary

The apply-diff response returns a `DiffMergeChangeSummaryDto` describing every proposed change hierarchically (REQ-CS-01…10). The client renders the selection panel from this summary. A separate `GET /diff-merge/changes` endpoint returns the current summary at any time (post-stage/unstage) without re-computing the diff.

---

## 12. Designer Visual Diff on GET

Entity GET endpoints support an optional `?includeDiff=true` query parameter that adds diff context to the response. Without the parameter, the response is identical to today's (REQ-VD-01) — clean effective-state data with no change metadata.

### DTO shape

Every entity DTO gains two optional fields:

```ts
interface SpfModuleDto {
  systemId: number
  alias: string
  containerSystemId: number
  // ... all other typed fields, returned as effective state (overlay applied) ...
  pendingChangeStatus?: "STAGED" | "UNSTAGED" | "PARTIAL"   // always populated when pending changes exist
  diffEntity?: DiffEntityBase                                 // only populated when ?includeDiff=true
}

interface DiffEntityBase {
  operation: "CREATE" | "UPDATE" | "DELETE"
  changeUnits: ChangeUnitDto[]
}

interface ChangeUnitDto {
  changeId: number
  status: "STAGED" | "UNSTAGED"
  source: "MANUAL" | "DIFF_TOOL" | "AUTO_ROUTING"
  linkedEntityGroupId?: string
  fields: FieldChangeDto[]
}

interface FieldChangeDto {
  fieldName: string
  oldValue: unknown | null   // null for CREATE
  newValue: unknown | null   // null for DELETE
}
```

`pendingChangeStatus` is always populated when the entity has pending changes — independent of `?includeDiff=true`. `diffEntity` is only present when opted in.

**`groupId` is not on `ChangeUnitDto` — it is returned in write API responses only** (OQ-8: `{ groupId }` from each write; row-level `changeIds` resolved by follow-up query on `edit_actions WHERE group_id = ?` when a client explicitly needs per-row handles for staging). Clients use the write response's `groupId` to update their client-side undo stack per REQ-UNDO-01. Read responses don't drive undo, so they omit `groupId` to save bandwidth on large GETs. Selection uses `changeId` (per unit) or `linkedEntityGroupId` (atomic group); provenance uses `source`.

### DESIGNER vs DIFF_MERGE — same DTO, different content

`DiffEntityBase` is identical in both modes (REQ-DM-04). The difference is how many `changeUnits` an entity has:

**DESIGNER** — the user's accumulator row surfaces as one `changeUnit` with all changed fields inside. Example: module M with `alias` and `containerSystemId` both changed via successive SET calls:

```json
{
  "systemId": 100,
  "alias": "Mod2",
  "containerSystemId": 200,
  "pendingChangeStatus": "STAGED",
  "diffEntity": {
    "operation": "UPDATE",
    "changeUnits": [
      {
        "changeId": 501,
        "status": "STAGED",
        "source": "MANUAL",
        "fields": [
          { "fieldName": "alias",             "oldValue": "Mod1", "newValue": "Mod2" },
          { "fieldName": "containerSystemId", "oldValue": 100,    "newValue": 200 }
        ]
      }
    ]
  }
}
```

**DIFF_MERGE** — the tool emitted per-slot rows; each independently-selectable change appears as its own `changeUnit`:

```json
{
  "systemId": 100,
  "alias": "Mod2",
  "containerSystemId": 100,
  "pendingChangeStatus": "PARTIAL",
  "diffEntity": {
    "operation": "UPDATE",
    "changeUnits": [
      { "changeId": 501, "status": "STAGED",   "source": "DIFF_TOOL",
        "fields": [{ "fieldName": "alias", "oldValue": "Mod1", "newValue": "Mod2" }] },
      { "changeId": 502, "status": "UNSTAGED", "source": "DIFF_TOOL",
        "fields": [{ "fieldName": "containerSystemId", "oldValue": 100, "newValue": 200 }] }
    ]
  }
}
```

### oldValue derivation

Every `oldValue` is derived server-side from the committed row at query time (REQ-VD-03). The diff-tool does not need to pass old values in its write requests. For `CREATE`, `oldValue` is `null` (entity did not exist committed). For `DELETE`, `newValue` is `null`.

### Children and embedded entities

When an entity DTO embeds children (e.g., a module response includes its ports), each child carries its own `pendingChangeStatus` and `diffEntity?` fields — every entity is independently self-describing (REQ-VD-07).

### Atomic-group markers

Rows belonging to a `linkedEntityGroupId` carry the identifier on their `changeUnit` (REQ-VD-08). The UI can use this to render the group as one selectable item across multiple entities' diff contexts.

### Client-side contract

When rendering diff context, the client should always inspect `status` and `source` per `changeUnit` before deciding how to display it. STAGED user-manual entries and UNSTAGED auto-routing entries have different semantics even though they appear in the same array.

---

## 13. Cross-Cutting Invariants

The framework preserves the invariants declared in the requirements document (I1…I9). Each is enforced at a specific mechanism; if any is violated the whole design's correctness collapses.

| Invariant | Enforced by |
|---|---|
| **I1** — Single active session per file | Partial unique index on `project_sessions(fileSystemId) WHERE status='ACTIVE'` (§4). |
| **I2** — Single-valued effective state per entity | Deterministic fold order in `OverlayMerge`: `(createdAt ASC, changeId ASC)` (§8). |
| **I3** — `baseVersion` capture-once per session-entity | `session_entity_versions` composite PK + INSERT-IGNORE semantics (§4). |
| **I4** — Aggregate scoping | `aggregateId` column on every pending change row + index `idx_edit_actions_agg_active` (§4, §5). |
| **I5** — API-call atomicity (undo/redo/stage/unstage move together) | `groupId` UUID stamped once per API call on the WriteContext by the CommandBus; every row produced within the call inherits it (§7). |
| **I6** — Cross-entity atomic group all-or-nothing | Server-side check in `IChangeStatusRepository.stage/unstage` when `by: "linkedEntityGroupIds"` (§10). |
| **I7** — Only STAGED applied at commit | Commit snapshot filters `WHERE changeStatus = 'STAGED'` (§9). |
| **I8** — Optimistic lock at commit | Version comparison between `session_entity_versions.baseVersion` and entity table's current `version`; any mismatch → `ARC-COMMIT-CONFLICT` (§9). |
| **I9** — Read-overlay parity | The change-summary API and entity-GET-with-diff-context are both built from the same `OverlayMerge` output — they cannot diverge because they share the row source (§8, §11). |

---

## 14. Undo / Redo — Deferred

Undo and redo are **out of scope for this design pass** and will be covered in a dedicated LLD later. The storage model already supports the required semantics:

- Every superseded row is retained (`validUntil` set to supersession time; not deleted mid-session).
- `groupId` provides API-call-atomic scoping — reactivating one row's ancestors will reactivate every row in that group.
- Undo is not supported in DIFF_MERGE mode per REQ-UNDO-05.

Open questions the undo/redo LLD will address:
- API surface (`activate-change` / `deactivate-change` endpoint shape, handle format).
- Cursor semantics — how activation/deactivation traverses the supersession chain.
- Out-of-order undo behavior (undoing an earlier call while later calls are still active).
- Redo stack ownership — client-side stack of `groupId`s (REQ-UNDO-01 places this responsibility with the client) with server-side row activation.
- Interaction between undo and post-commit cleanup.

Deferring keeps this design pass tractable — implementation of Phase 1 and Phase 2 does not require the undo/redo LLD to be complete, only its storage support to exist.

---

## 15. Phase Split & LLD Map

The design is delivered as one Overall Design (this doc) plus a series of LLDs, each sized for approximately one PR of implementation work with tests.

### Overall creation order

Sequential (each depends on the previous):
1. **Overall Design** (this doc).
2. **LLD1 — Foundation.**

Parallel-eligible drafting after LLD1 lands:
3. **LLD2 — Module Write Path.**
4. **LLD3 — Read Overlay + Designer Visual Diff.**

Sequential:
5. **LLD4 — Commit + Stage/Unstage.**
6. **LLD5 — Delete Module.**

Parallel-eligible drafting after LLD4 lands:
7. **LLD6a — DiffMerge Foundation.**
8. **LLD6b — DiffMerge Definitions.**
9. **LLD6c — ParameterDefinition Elements.**

### LLD table

| Doc | PR est. | Scope summary |
|---|---|---|
| **LLD1 — Foundation** | 1 PR | Schema + migration (`edit_actions` reshape + `session_entity_versions` side-table), `PendingChangeWriter`, `EditActionsQueryService`, `OverlayMerge`, `PendingChangeCache`, `SessionGuard`, session hand-off via `execute(cmd, {session})` (Pattern A), `WriteContext` on UoW + `groupId` stamping, `CommandBus` mode check. |
| **LLD2 — Module Write Path** | 1 PR | `IModuleEditRepository`, `ISubgraphEditRepository`, `IContainerEditRepository`, `IModuleDefinitionEditRepository`. SET / Add handlers (`SetModuleAlias`, `SetModuleContainer`, `AddDataPort`, `AddControlPort`). Add Module three variants with auto-created Subgraph and Container. Existence validation via read ports. |
| **LLD3 — Read Overlay + Designer Visual Diff** | 1 PR | Rewrite of `DbSpfModuleQueryService` and peer query services (Subgraph, Container, Node) to use the new `OverlayMerge`. `?includeDiff=true` support across entity GET endpoints. `pendingChangeStatus` on entity DTOs. `diffEntity` DTO. Designer-mode single accumulated `changeUnit` per entity. |
| **LLD4 — Commit + Stage/Unstage** | 1 PR (may split into 4a/4b if size warrants) | `ICommitService` + implementation — hand-written per-aggregate ordering, DB-error → `ValidationIssue` mapping, auto-generated `session_commits` description, partial-success vs full-rollback policy (may require REQ-CMT-01 revision). Optional CI-time FK-consistency check using TypeORM metadata as a safety net. Conflict detection → `ValidationReport`. Optional COMMIT-group validation gate. `IChangeStatusRepository`, `ChangeSelectionService`, directed dependency planning, Stage / Unstage handlers + APIs (needed by auto-routing and DiffMerge-dependent deletes). `session_commits` write. Post-commit cleanup. |
| **LLD5 — Delete Module** | 1 PR | `DeleteSpfModuleCommand` and controller stub replacement. Module aggregate delete by root ID. Connected DataLink / ControlLink cascade. Subsystem link cleanup without edit-time boundary port deletion. Stale routed-control intent cleanup. Empty Container/Subgraph cleanup, UseCase relationship removal, stack-size recalculation. Initial `Designer` mode only; `DiffMerge` enablement waits for change-selection dependencies. |
| **LLD6a — DiffMerge Foundation** | 1 PR | `DiffCompareService` orchestrator + per-aggregate comparers (Module / Subgraph / Container / Node). `DiffStager`. Apply-diff handler. Change summary DTO + API. Compare-only endpoint. Wipe-by-source on re-apply. DIFF_MERGE manual write path (REQ-SESS-12). Cross-entity atomic groups (server-enforced staging). |
| **LLD6b — DiffMerge Definitions** | 1 PR | `IKeyDefinitionEditRepository`, `IValueDefinitionEditRepository`, `ISpfModuleDefinitionEditRepository`. Definition-scoped comparers. Reference-file definition import (REQ-DEF-01…03). DIFF_MERGE definition CREATE/UPDATE (REQ-DEF-04…06). |
| **LLD6c — ParameterDefinition Elements** | 1 PR | Element-path fieldPath handling. `updateElement` (or equivalent) exposed under the `SpfModuleDefinition` aggregate's edit repo — ParameterDefinition is part of that aggregate. Element-splicing reducer at commit for `elementsStructure` (parse serialized column, replace element by ID, re-serialize). |

Deferred LLDs (not part of the current design pass):
- **Undo/Redo LLD** — server-passive versioned store, activation/deactivation semantics, out-of-order edge cases, redo-stack semantics.
- **Auto-Routing Integration LLD** — integrates auto-usecase-routing (see `2026-06-01-auto-usecase-routing-requirements.md`) with stage/unstage from LLD4.

---

*End of Outline*
