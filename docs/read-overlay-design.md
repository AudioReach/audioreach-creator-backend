<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Read-Overlay Design

**Related Documents:**
- `modification-framework-design.md` — Session lifecycle, `edit_actions` schema, payload strategy, `aggregate_id` semantics

---

## 1. Concept

The read-overlay pattern provides a **session-aware view** of project data. When a client reads any entity, the response reflects both committed data (actual tables) and pending changes (`edit_actions` for the active session), merged at query time.

```
Actual tables  (committed, permanent)
      +
edit_actions   (pending, session-scoped, valid_until IS NULL)
      =
Effective view (what the client sees)
```

If no active session exists for the file, the actual tables are returned as-is (READ-ONLY mode).

### Merge Rules

| `edit_actions.operation` | Entity in actual table? | Result |
|--------------------------|------------------------|--------|
| `CREATE` | No (new entity) | Deserialize full payload → include |
| `UPDATE` | Yes | Merge partial payload over base row |
| `DELETE` | Yes | Exclude from results |
| *(no action)* | Yes | Return base row as-is |

Only `STAGED` and `UNSTAGED` edit_actions are considered. `valid_until IS NULL` ensures only the current version of each pending change is used.

---

## 2. Shared Types

### `CHANGE_OPERATION` and `CHANGE_STATUS`

Defined in `packages/core/src/application/shared/change-vocabulary.ts`. Imported by infrastructure — not redefined.

```typescript
export const CHANGE_OPERATION = {
  None:   'NONE',
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;
export type ChangeOperation = (typeof CHANGE_OPERATION)[keyof typeof CHANGE_OPERATION];

export const CHANGE_STATUS = {
  Staged:   'STAGED',
  Unstaged: 'UNSTAGED',
} as const;
export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];
```

### `ENTITY_NAMES` and `EntityName`

Defined in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts`.

All entity names are centralised in a single `ENTITY_NAMES` const object. Values match the `name` property in each `EntitySchema` definition. TypeORM's `EntityManager` methods accept entity names directly, so `ENTITY_NAMES` values work wherever a table/entity target is required — including the `tableName` column of `edit_actions`.

`EntityName` is the derived union type of all valid entity name strings. `EditActionRow.tableName` is typed as `EntityName`.

Use `ENTITY_NAMES.<EntityKey>` at call sites instead of raw strings.

---

## 3. Building Blocks

Both utilities live in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/edit-session/`.

### `EditActionsQueryService`

Pure database query service for the `edit_actions` table. No merge logic.

```typescript
export interface EditActionsQueryOptions {
  operation?:    ChangeOperation | null;  // null/undefined → all operations
  changeStatus?: ChangeStatus    | null;  // null/undefined → all statuses
}

export class EditActionsQueryService {
  constructor(dataSource: DataSource) {}

  /** Resolve the active session for a file. Returns null in READ-ONLY mode. */
  findActiveSession(fileSystemId: number): Promise<ProjectSessionRow | null>;

  /** All active edit_actions for a session + aggregate root (and all its children). */
  getByAggregateId(sessionId: number, aggregateId: number, options?: EditActionsQueryOptions): Promise<EditActionRow[]>;

  /** Active edit_actions for a session + aggregate + specific entity name. */
  getByAggregateAndTable(sessionId: number, aggregateId: number, tableName: EntityName, options?: EditActionsQueryOptions): Promise<EditActionRow[]>;

  /** Active edit_actions for a session + entity name (across all aggregates). */
  getByTable(sessionId: number, tableName: EntityName, options?: EditActionsQueryOptions): Promise<EditActionRow[]>;
}
```

All queries filter `valid_until IS NULL` — only the current version of each pending change is returned.

**Session contract:** call `findActiveSession` once per service method, then pass `sessionId` to the query methods. This keeps DB round-trips to one session lookup per call.

### `OverlayMerge`

Pure in-memory merge utility. No database access.

```typescript
export interface EditActionForOverlay {
  systemId:  number;
  operation: ChangeOperation;
  payload:   unknown;
}

export class OverlayMerge {
  /** Merge a single pending change onto a base row. Returns null for DELETE. */
  static applyToSingle<T extends { systemId: number }>(
    baseRow:    T | null,
    editAction: EditActionForOverlay | null,
  ): T | null;

  /** Merge a set of pending changes onto a collection of base rows.
   *  CREATE actions for entities not yet in the actual table are appended. */
  static applyToCollection<T extends { systemId: number }>(
    baseRows:    T[],
    editActions: EditActionForOverlay[],
  ): T[];
}
```

---

## 4. Usage Pattern

Port implementations in `persistence` inject `EditActionsQueryService`, fetch base rows from actual tables, then use `OverlayMerge` to produce the merged result. The application layer in `core` calls the port and receives the merged view — it has no knowledge of the overlay mechanism.

### Recommended pattern: fetch aggregate actions once, split in memory

```typescript
// 1. Resolve session once
const session = await this.editActionsQueryService.findActiveSession(fileSystemId);

// 2. One indexed DB query covers the module and all its children
const editActions = session
  ? await this.editActionsQueryService.getByAggregateId(session.sessionId, moduleSystemId)
  : [];

// 3. Split by entity name in memory
const moduleActions  = editActions.filter(a => a.tableName === ENTITY_NAMES.SpfModule);
const portActions    = editActions.filter(a => a.tableName === ENTITY_NAMES.DataPort);
const ckvActions     = editActions.filter(a => a.tableName === ENTITY_NAMES.Ckv);
const payloadActions = editActions.filter(a => a.tableName === ENTITY_NAMES.CkvParameterPayload);

// 4. Apply overlay per entity type
const overlaidPorts = OverlayMerge.applyToCollection(basePorts, portActions);
const overlaidCkvs  = OverlayMerge.applyToCollection(baseCkvs, ckvActions);
```

Prefer `getByAggregateId` + in-memory split over multiple `getByAggregateAndTable` calls — one DB round-trip covers all entity types in the aggregate.

Use `getByAggregateAndTable` only when a single entity type is needed and the rest of the aggregate is not required.

### Cross-aggregate queries

For queries that span all aggregates (e.g. all modules added in a session), use `getByTable`:

```typescript
const addedModules = await this.editActionsQueryService.getByTable(
  session.sessionId,
  ENTITY_NAMES.SpfModule,
  { operation: CHANGE_OPERATION.Create },
);
```

---

## 5. Module Read Services

All module-related data (ports, properties, CKV, TKV, tag data) belongs to the **module aggregate**. `aggregateId = moduleSystemId` for all children. A single `getByAggregateId` call covers the entire aggregate.

### Folder Structure

```
packages/core/src/application/services/module/
  module-query-services.ts              ← ModuleQueryServices grouping interface
  summary/
    module-summary-read-service.ts      ← port interface
    module-summary-read-model.ts
  detail/
    module-detail-read-service.ts       ← port interface
    module-detail-read-model.ts
    module-detail-includes.ts           ← include spec
  calibration/
    module-calibration-read-service.ts  ← port interface
    module-calibration-read-model.ts

packages/infrastructure/persistence/src/.../queries/
  edit-session/
    edit-actions-query-service.ts       ← EditActionsQueryService
    overlay-merge.ts                    ← OverlayMerge
  module/
    db-module-summary-read-service.ts
    db-module-detail-read-service.ts
    db-module-calibration-read-service.ts
    module-query-mappers.ts
```

### Three Focused Services

| Service | Purpose |
|---------|---------|
| `ModuleSummaryReadService` | Basic module info: alias, ports, definition name |
| `ModuleDetailReadService` | Structural/config detail with optional includes (CKV config, parameter definitions, properties) |
| `ModuleCalibrationReadService` | Binary parameter payload data for a specific CKV |

`ModuleCalibrationReadService` is separate from `ModuleDetailReadService` because binary payload data is large and only needed for specific calibration workflows.

### `ModuleDetailIncludes`

```typescript
export interface ModuleDetailIncludes {
  ckvConfig?:   boolean;  // CKV list with key-vector info (no binary payloads)
  parameters?:  boolean;  // parameter definitions (metadata only)
  properties?:  boolean;  // module properties (binary blob data)
}
```

All fields default to `false`. Read model fields for non-requested includes are `undefined`.

### `ModuleQueryServices` Grouping

```typescript
export interface ModuleQueryServices {
  readonly summary:     ModuleSummaryReadService;
  readonly detail:      ModuleDetailReadService;
  readonly calibration: ModuleCalibrationReadService;
}
```

Added to `QueryServices`:

```typescript
export interface QueryServices {
  readonly module:              ModuleQueryServices;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
}
```

---

## 6. Extending to Other Aggregates

1. Define a read service port in `packages/core/src/application/services/<aggregate>/`
2. Implement in `packages/infrastructure/persistence/.../queries/<aggregate>/`
3. Inject `EditActionsQueryService` into the implementation
4. Use `getByAggregateId(sessionId, aggregateRootId)` as the primary query
5. Use `OverlayMerge.applyToCollection` / `applyToSingle` for merging

---

## 7. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `CHANGE_OPERATION` / `CHANGE_STATUS` in `packages/core` | Domain-level vocabulary — infrastructure imports from core |
| `ENTITY_NAMES` / `EntityName` in `entity-table-names.ts` | Prevents string typos; single place to update on rename; TypeORM manager methods accept entity names |
| `EditActionsQueryService` and `OverlayMerge` in infrastructure | Both depend on TypeORM row types — infrastructure concerns; no interface needed as they are not injected across package boundaries |
| `sessionId` passed by consumer, not resolved per query method | One session lookup per service call |
| `getByAggregateId` + in-memory entity split | One DB round-trip covers all entity types in the aggregate; in-memory split is O(n), n ≤ ~50 |
| `ModuleDetailIncludes` spec | Avoids loading relations the caller does not need |
| Three focused module services | Single responsibility; calibration (binary payloads) separated from structural detail |

---

*End of Document*