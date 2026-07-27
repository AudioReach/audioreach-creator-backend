<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Query Service Overlay Pattern

**Related Documents:**
- `read-overlay-design.md` — Current building blocks: `EditActionsQueryService`, `OverlayMerge`, merge rules
- `modification-framework-design.md` — Current session lifecycle, `edit_actions` schema
- `edit-crud/overall-design.md` — **Future design** — schema reshape, DiffInfo DTO, `pendingChangeStatus`, visual diff, per-slot fieldPath model

> **Note on future design:** `edit-crud/overall-design.md` describes the target architecture for the modification framework. The pattern in this document is written so that current code can adopt that design with minimal refactoring. Where the two designs differ, the future shape is called out explicitly.

---

## 1. The Three Layers

Every query service that reads session-aware data is composed of three independent layers:

```
Layer 1 — DB Query     fetch raw rows from actual tables (QueryBuilder / JOIN)
Layer 2 — Overlay      merge edit_actions onto raw rows → still raw row types + change metadata
Layer 3 — Mapping      map raw row types → read model types
```

**Each layer has exactly one reason to change:**

| Layer | Changes when |
|-------|-------------|
| DB Query | DB schema changes, new relations needed, JOIN strategy changes |
| Overlay | Overlay merge rules change, new child tables added to aggregate, fieldPath model changes |
| Mapping | Read model shape changes, new fields added to response |

Keeping them separate means a read model rename never touches overlay code, and a schema change never touches mapping code. This separation is also what makes adding DiffInfo (`?includeDiff=true`) a new function rather than a rewrite — see §4.

---

## 2. Generic Structure for Any Query Service

### 2.1 Public method — owns DB query + session/actions fetch

```typescript
async getSomething(aggregateId: number, fileSystemId: number): Promise<SomeReadModel> {
  // Layer 1 — DB query (narrow or full JOIN, depending on what this method needs)
  const baseRow = await this.dataSource
    .getRepository(ENTITY_NAMES.SomeRoot)
    .createQueryBuilder('root')
    .leftJoinAndSelect('root.children', 'child')
    .where('root.systemId = :id', { id: aggregateId })
    .getOne();

  // Session + actions fetched ONCE at this level, passed down — never re-fetched inside helpers
  const session = await this.editActionsSvc.findActiveSession(fileSystemId);
  const actions = session
    ? await this.editActionsSvc.getEditActionsByAggregateId(session.sessionId, aggregateId)
    : [];

  // Layer 2 — overlay helpers (pure, no DB)
  const overlaidRoot     = this.overlayRoot(baseRow, actions);
  const overlaidChildren = this.overlayChildren(baseRow?.children ?? [], actions);

  // Layer 3 — mapping helpers (pure, no DB, no overlay)
  return this.mapToReadModel(overlaidRoot, overlaidChildren);
}
```

### 2.2 Overlay helpers — pure, no DB access

```typescript
// Returns raw row type — not the read model
private overlayChildren(
  rows: ChildRow[],
  actions: EditActionRow[],
): ChildRow[] {
  return applyToCollection(
    rows,
    actions.filter(a => a.tableName === ENTITY_NAMES.SomeChild),
  );
}
```

> **Future schema note:** `edit_actions.tableName` is renamed to `targetTable` in the future design (`edit-crud/overall-design.md` §4). Filtering inside overlay helpers (rather than at the call site) means this rename touches one place per helper, not every call site.

Rules:
- Accept `rows` and `actions` as parameters — never call `getEditActionsByAggregateId` inside
- Filter `actions` by table name in-memory — one DB call at the top covers all tables in the aggregate
- For nested collections (parent → children → grandchildren), iterate the overlaid parent and apply a second `applyToCollection` on each child's collection
- Return the raw row type, not the read model — mapping is a separate concern

### 2.3 Mapping helpers — pure, no DB, no overlay

```typescript
private mapChildren(rows: ChildRow[]): ChildReadModel[] {
  return rows.map(r => ({
    systemId: r.systemId,
    name: r.name ?? '',
    // ... field selection and renaming
  }));
}
```

Rules:
- Accept only row types as parameters — no `actions`, no session
- No conditional logic based on session state
- Only field selection, renaming, and type coercion

### 2.4 Focused public methods — reuse overlay + mapping helpers

When a caller needs only part of the aggregate (e.g. ports only, not the full definition):

```typescript
async getChildrenOnly(aggregateId: number, fileSystemId: number): Promise<ChildReadModel[]> {
  // Layer 1 — narrow query, only joins what this method needs
  const row = await this.dataSource
    .getRepository(ENTITY_NAMES.SomeRoot)
    .createQueryBuilder('root')
    .leftJoinAndSelect('root.children', 'child')  // only this relation
    .where('root.systemId = :id', { id: aggregateId })
    .getOne();

  // Same session/actions pattern
  const session = await this.editActionsSvc.findActiveSession(fileSystemId);
  const actions = session
    ? await this.editActionsSvc.getEditActionsByAggregateId(session.sessionId, aggregateId)
    : [];

  // Reuse the same overlay and mapping helpers — no duplication
  const overlaid = this.overlayChildren(row?.children ?? [], actions);
  return this.mapChildren(overlaid);
}
```

The DB query is always new per method (layer 1 is not shared). The overlay and mapping logic is shared (layers 2 and 3).

---

## 3. Session and Actions Threading Rules

```
findActiveSession           — called ONCE per public method, never inside a helper
getEditActionsByAggregateId — called ONCE per public method, never inside a helper
actions                     — passed as a parameter into every overlay helper
```

`getEditActionsByAggregateId` always returns the full set of edit actions for the aggregate — all tables, all children. In-memory `.filter(a => a.tableName === ...)` inside each helper is O(n), n ≤ ~50. There is no performance reason to make per-table DB calls (`getEditActionsByAggregateAndTable`) inside a service method that is already fetching the full aggregate set.

---

## 4. Future: DiffInfo and `pendingChangeStatus`

The future design (`edit-crud/overall-design.md` §8, §12) adds two things to every entity GET response:

1. **`pendingChangeStatus`** — always present when the entity has pending changes, independent of any query parameter. Values: `"STAGED"` / `"UNSTAGED"` / `"PARTIAL"`.
2. **`diffEntity`** — present only when the caller passes `?includeDiff=true`. Contains per-change-unit field-level old/new pairs.

Both are derived from the same `edit_actions` rows the overlay already fetches. This is the core reason overlay and mapping must be separate layers — the overlay output feeds three consumers: (a) the merged effective row, (b) `pendingChangeStatus`, (c) `diffEntity`.

### 4.1 `Overlaid<T>` — the overlay output type

To carry enough information for all three consumers, overlay helpers will return `Overlaid<T>[]` instead of `T[]`:

```typescript
interface Overlaid<T> {
  row: T;                        // effective merged row (after overlay applied)
  baseRow: T | null;             // committed row before overlay (null for CREATE)
  operation: ChangeOperation;    // CREATE | UPDATE | DELETE | NONE
  changeUnits: PendingChangeUnit[];
}

interface PendingChangeUnit {
  changeId: number;
  status: ChangeStatus;          // STAGED | UNSTAGED
  source: ChangeSource;          // MANUAL | DIFF_TOOL | AUTO_ROUTING
  linkedEntityGroupId?: string;
  changedFields: ChangedField[];
}

interface ChangedField {
  fieldName: string;
  oldValue: unknown | null;      // derived from baseRow at query time (REQ-VD-03)
  newValue: unknown | null;
}
```

`baseRow` is needed so `oldValue` can be derived server-side at query time without the diff tool needing to record it.

### 4.2 Three consumers of the same overlay output

```typescript
// Consumer 1 — effective merged row (current behavior)
private mapChildren(overlaid: Overlaid<ChildRow>[]): ChildReadModel[] {
  return overlaid
    .filter(o => o.operation !== CHANGE_OPERATION.Delete)
    .map(o => this.toChildReadModel(o.row));
}

// Consumer 2 — pendingChangeStatus (always computed when pending changes exist)
private computePendingStatus(overlaid: Overlaid<ChildRow>): PendingChangeStatus | undefined {
  if (overlaid.changeUnits.length === 0) return undefined;
  const statuses = new Set(overlaid.changeUnits.map(u => u.status));
  if (statuses.size > 1) return 'PARTIAL';
  return statuses.has('STAGED') ? 'STAGED' : 'UNSTAGED';
}

// Consumer 3 — diffEntity (only when ?includeDiff=true)
private toDiffEntity(overlaid: Overlaid<ChildRow>): DiffEntityBase {
  return {
    operation: overlaid.operation,
    changeUnits: overlaid.changeUnits,
  };
}
```

The public method assembles what it needs:

```typescript
async getSomething(aggregateId, fileSystemId, includeDiff = false) {
  // ... DB query + actions fetch (unchanged) ...
  const overlaid = this.overlayChildren(baseRow?.children ?? [], actions);

  return overlaid
    .filter(o => o.operation !== CHANGE_OPERATION.Delete)
    .map(o => ({
      ...this.toChildReadModel(o.row),
      pendingChangeStatus: this.computePendingStatus(o),
      diffEntity: includeDiff ? this.toDiffEntity(o) : undefined,
    }));
}
```

If overlay and mapping were combined into one function, adding DiffInfo would require either duplicating overlay logic or adding a flag parameter — both degrade over time. The separation makes this a new consumer function plugged onto existing overlay output.

### 4.3 `pendingChangeStatus` is always computed — not opt-in

Unlike `diffEntity`, `pendingChangeStatus` is always populated when pending changes exist (REQ-DM-02, `edit-crud/overall-design.md` §8). It is a cheap client hint: list views render a "has edits" indicator without needing `?includeDiff=true`. The overlay helper already has all the information needed — no extra DB call.

### 4.4 Multi-slot folding (DIFF_MERGE)

In the future design, multiple `edit_actions` rows can coexist for the same entity when they target different `fieldPath` slots (e.g., per-column slots in DIFF_MERGE mode). The overlay fold processes rows in `(createdAt, changeId)` order. Each row contributes one `PendingChangeUnit`. `OverlayMerge` will be updated to handle this; overlay helpers do not need to change — they still pass `actions` to `OverlayMerge` and receive `Overlaid<T>[]` back.

### 4.5 Element-path overlay (ParameterDefinition)

`SpfModuleParameterDefinition.elementsStructure` is a serialized column whose individual elements are addressable via element-path `fieldPath` values (e.g. `elements[gain]`, `elements[stereoEq].elements[left]`). The overlay for this column is handled entirely inside `OverlayMerge` — it parses the serialized structure, navigates by path, splices the new value, and re-serializes. The overlay helper for `parameterDefinitions` does not need to know about this; it passes actions to `OverlayMerge` as usual. The path syntax and reducer logic are owned by LLD6c.

---

## 5. Applied to `DbSpfModuleDefinitionQueryService`

### 5.1 Aggregate tree

```
SpfModuleDefinition  (aggregateId = defSystemId)
├── dataPortGroups   (DataPortGroup table)
│   └── ports        (DataPortDefinition table)
├── staticPorts      (StaticControlPortDefinition table)
│   └── staticIntents (StaticIntentDefinition table)
├── dynamicIntents   (DynamicIntentDefinition table)
└── parameterDefinitions (SpfModuleParameterDefinition table)
    └── elementsStructure (serialized column — element-path addressed, handled by OverlayMerge)
```

All tables share `aggregateId = defSystemId`. One `getEditActionsByAggregateId(session, defSystemId)` call covers every table in this tree, including parameter elements addressed via fieldPath.

### 5.2 Target structure

```typescript
// Overlay helpers — pure, take rows + actions
// Currently return T[] — will return Overlaid<T>[] when DiffInfo is implemented
private overlayPortGroups(rows, actions, includePortDetails): DataPortGroupRow[]
private overlayStaticPorts(rows, actions, includePortDetails): StaticControlPortRow[]
private overlayDynamicIntents(rows, actions): DynamicIntentDefinitionRow[]
private overlayParameterDefs(rows, actions): SpfModuleParameterDefinitionRow[]

// Mapping helpers — pure, take rows only
private mapPortGroups(rows): DataPortGroupReadModel[]
private mapStaticPorts(rows): ControlPortDefinitionReadModel[]
private mapDynamicIntents(rows): DynamicIntentDefinitionReadModel[]
private mapParameterDefs(rows): ParameterDefinitionReadModel[]
```

`getDefinition` fetches session and actions once and passes them to all overlay helpers:

```typescript
async getDefinition(defSystemId, fileSystemId, includes) {
  // Layer 1 — one JOIN query (relations driven by includes)
  const row = await qb.getOne();

  // Session + actions fetched ONCE — passed to every overlay helper
  const session = await this.editActionsSvc.findActiveSession(fileSystemId);
  const actions = session
    ? await this.editActionsSvc.getEditActionsByAggregateId(session.sessionId, defSystemId)
    : [];

  // Layer 2 — overlay (all helpers share the same actions array)
  const overlaidPortGroups     = this.overlayPortGroups(row.dataPortGroups, actions, fullDetails);
  const overlaidStaticPorts    = this.overlayStaticPorts(row.staticPorts, actions, fullDetails);
  const overlaidDynamicIntents = fullDetails
    ? this.overlayDynamicIntents(row.dynamicIntents, actions) : [];
  const overlaidParamDefs      = fullDetails
    ? this.overlayParameterDefs(row.parameterDefinitions, actions) : [];

  // Layer 3 — mapping
  return {
    systemId: row.systemId,
    name: row.name,
    ...this.computeSummaryCounts(overlaidPortGroups, overlaidStaticPorts),
    dataPortGroups:       fullDetails ? this.mapPortGroups(overlaidPortGroups) : null,
    staticControlPorts:   fullDetails ? this.mapStaticPorts(overlaidStaticPorts) : null,
    dynamicIntents:       fullDetails ? this.mapDynamicIntents(overlaidDynamicIntents) : null,
    parameterDefinitions: fullDetails ? this.mapParameterDefs(overlaidParamDefs) : null,
  };
}
```

Focused method reuses helpers without re-fetching actions:

```typescript
async getDataPortsForDefinition(defSystemId, fileSystemId) {
  // Layer 1 — narrow query
  const row = await this.dataSource
    .getRepository(ENTITY_NAMES.SpfModuleDefinition)
    .createQueryBuilder('def')
    .leftJoinAndSelect('def.dataPortGroups', 'group')
    .leftJoinAndSelect('group.ports', 'port')
    .where('def.systemId = :id', { id: defSystemId })
    .getOne();

  const session = await this.editActionsSvc.findActiveSession(fileSystemId);
  const actions = session
    ? await this.editActionsSvc.getEditActionsByAggregateId(session.sessionId, defSystemId)
    : [];

  // Reuse — no duplication of overlay or mapping logic
  const overlaid = this.overlayPortGroups(row?.dataPortGroups ?? [], actions, true);
  return this.mapPortGroups(overlaid);
}
```

### 5.3 Migration path to future design

When LLD3 (Read Overlay + Designer Visual Diff) is implemented:

| What changes | Impact on this service |
|---|---|
| `edit_actions.tableName` → `targetTable` | Change filter inside each overlay helper — one line per helper |
| `edit_actions.payload` → `fieldPath` + `newValue` | `OverlayMerge` internals change; overlay helpers are unaffected |
| Overlay helpers return `Overlaid<T>[]` instead of `T[]` | Change return type + update map helpers to accept `Overlaid<T>[]` |
| Add `pendingChangeStatus` to read models | Add `computePendingStatus()` — new function, no existing code modified |
| Add `diffEntity` for `?includeDiff=true` | Add `toDiffEntity()` — new function, no existing code modified |

The three-layer separation means each of these changes is localized. No change requires touching more than one layer.

### 5.4 Issues in current implementation

**Bug — `paramSystemIds` filter lost when session is active** (`queryParameterDefinitions`, line 428–448)

```typescript
// computed but not used when session is active
const filtered = paramSystemIds?.length > 0
  ? rows.filter(r => paramSystemIds.includes(r.systemId))
  : rows;

if (!session) return filtered.map(...);  // filter applied here

// BUG: `rows` passed instead of `filtered` — paramSystemIds ignored
const overlaid = applyToCollection(rows, paramActions);
```

Fix: pass `filtered` to `applyToCollection`, not `rows`.

---

**Performance — double `findActiveSession` inside `getDefinition`**

`getDefinition` calls `findActiveSession` at line 118. Then `queryParameterDefinitions` calls it again at line 434 — two DB round-trips for the same session row in one public method call.

Fix: resolve session once in `getDefinition`, pass it into `queryParameterDefinitions` as a parameter.

---

**Performance — double `getEditActionsByAggregateId` for the same `defSystemId`**

`applyDefinitionOverlay` calls `getEditActionsByAggregateId(session, defSystemId)` — this already fetches all actions for the aggregate including `SpfModuleParameterDefinition` rows. Then `queryParameterDefinitions` makes an identical call for the same `aggregateId`. The same DB query runs twice.

Fix: fetch actions once in `getDefinition`, pass the array into both the overlay and parameter definition methods.

---

**Design — `queryParameterDefinitions` is public**

This method is an internal implementation detail and is not part of the `SpfModuleDefinitionQueryService` port interface. Mark it `private`.

---

**Misleading comment — "separate aggregate"** (`queryParameterDefinitions`, line 413)

The comment says "Parameters are keyed by moduleDefSystemId — **separate aggregate** from the definition" but `moduleDefSystemId === defSystemId` — it is the same `aggregateId`. The comment should say "loaded separately" not "separate aggregate".

---

*End of Document*
