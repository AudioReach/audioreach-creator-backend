<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Usecase Query APIs — Low-Level Design

## Document Information

- **Version**: 2.0
- **Date**: July 2026
- **Status**: Implemented
- **Endpoints**:
  - `GET  /arc-api/v1/projects/{projectId}/usecases`
  - `POST /arc-api/v1/projects/{projectId}/usecases/components/query`
  - `POST /arc-api/v1/projects/{projectId}/usecases/components/query-with-subsystems`
  - `GET  /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/components`
- **Related Documents**:
  - `docs/usecase-apis/requirements/usecase-component-apis-requirements.md`
  - `docs/superpowers/specs/recursive-overlay-engine-design.md`
  - `docs/superpowers/specs/core-result-format-design.md`

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Architecture Overview](#2-architecture-overview)
3. [Result\<T\> Pattern](#3-resultt-pattern)
4. [Filter Expression Design](#4-filter-expression-design)
5. [Read Models](#5-read-models)
6. [CQRS — Queries and Handlers](#6-cqrs--queries-and-handlers)
7. [ComponentQueryService Port](#7-componentqueryservice-port)
8. [Edit-Session Overlay Per Service Method](#8-edit-session-overlay-per-service-method)
9. [GET /usecases — Call Flow](#9-get-usecases--call-flow)
10. [POST /usecases/components/query — Call Flow](#10-post-usecasescomponentsquery--call-flow)
11. [Persistence Layer](#11-persistence-layer)
12. [Folder Structure](#12-folder-structure)

---

## 1. Requirements

### 1.1 Shared

**SH-01 — Result\<T\>:** All query service methods return the new `Result<T>` discriminated
union (`kind: 'ok' | 'partial' | 'fail'`). Handlers propagate without re-wrapping.
Controllers use `throwIfFailed()` + `toApiResult()`.

**SH-02 — Edit-session overlay mandatory:** Every API applies STAGED-only overlay
(`change_status = 'STAGED' AND valid_until IS NULL`) via `RecursiveOverlayEngine`.
No API reads baseline tables without overlay consideration.

**SH-03 — Overlay in a separate service:** `RecursiveOverlayEngine` + `EditActionsQueryService`
are injected into query services. Query services call the engine — they do not implement
overlay logic themselves.

**SH-04 — Filter architecture:** `FilterExpression` (tree AST) and `FilterParser` live in
`@arc/core` with no TypeORM dependency. `FilterSchema<T>` lives in `@arc/persistence` and
adapts `FilterExpression` → TypeORM `WhereExpressionBuilder` via `EXISTS` subqueries.
Field validation happens in the controller (throws 400).

### 1.2 GET /usecases

**UC-01:** Returns `UseCaseReadModel[]` (systemId, alias, aliasId, gkv, categories)
for the resolved fileSystemId.

**UC-02:** Resolves `projectId` → `fileSystemId`. Not found → 404.

**UC-03:** Optional `?filter=` query string. Absent → all usecases returned.

**UC-04:** Filter fields: `spfModuleInstanceId` (hex/decimal), `subgraphId` (number),
`containerId` (number). Unknown field or type mismatch → 400.

**UC-05:** Filter applied at DB level — `USECASE_PARAM_FILTER.apply()` adds TypeORM
EXISTS subqueries. Only matching usecases returned from DB.

**UC-05a — Filter applies pre-overlay:** The filter is applied to the baseline DB query before
overlay runs. A usecase that matches the filter but has a pending `DELETE` in the edit session
will be returned by Q1 and then removed during overlay (Step 3). This is correct behaviour —
`filtered count = N, final count ≤ N` is expected and not a bug.

**UC-06:** Filter parsed by controller → `FilterExpression`. Carried by
`GetAllUseCasesQuery`. Handler passes through. Service applies.

**UC-07:** Edit-session overlay applied to `use_cases`, `usecase_gkv_values`,
`value_definitions`, `key_definitions` via `RecursiveOverlayEngine`.

**UC-08:** HTTP 200 success, HTTP 207 partial, HTTP 4xx/5xx failure.

### 1.3 POST /usecases/components/query

**COMP-01:** Body `{ systemIds: string[] }`. Empty/missing → 400.

**COMP-02:** Returns flat `ComponentsReadModel`: `modules[]`, `dataLinks[]`, `controlLinks[]`.

**COMP-03:** Modules via `use_case_subgraphs` → `spf_modules.subgraph_system_id`.
A module belongs to a usecase because its subgraph is in the usecase's subgraph set.

**COMP-04:** Links: INTRA_SUBGRAPH + INTRA_USECASE. Deduped across requested usecases.

**COMP-05:** Edit-session overlay applied to `nodes`, `spf_modules`, `data_ports`,
`control_ports`, `intents`, `data_links`, `control_links` via `RecursiveOverlayEngine`.

**COMP-06:** HTTP 200 success, HTTP 207 partial, HTTP 4xx/5xx failure.

### 1.4 POST /usecases/components/query-with-subsystems

**QWS-01:** Body `{ systemIds: string[] }`. Empty/missing → 400.

**QWS-02:** Returns `ComponentsWithSubsystemsReadModel` — a recursive subsystem tree.
The root level holds modules and links not inside any subsystem (`parentId = undefined`),
and zero or more root-level subsystem nodes. Each subsystem node recursively holds its
direct-child modules, links, and child subsystems.

**QWS-03:** Module scoping is identical to the flat `/query` endpoint —
via `use_case_subgraphs → spf_modules.subgraph_system_id`.

**QWS-04 — Virtual links:** The hierarchy endpoint uses `subsystem_control_links` /
`subsystem_data_links` (virtual segments) when the file has a subsystem context, and falls back
to `control_links` / `data_links` (raw links) when no subsystems exist. Virtual segments carry
pre-computed boundary information required for correct placement in the subsystem tree. Raw links
are used as fallback because virtual tables contain no rows when there are no subsystem boundaries.

**QWS-05 — Virtual link scoping:** Virtual segments are filtered by the given usecaseIds
using the same join chain as the raw link query
(`subsystem_control_links → control_links → use_case_subgraph_pairs`).
Only segments for links reachable from the requested usecases are loaded.

**QWS-06 — Inside / outside segments:** A boundary-crossing link that crosses a subsystem
boundary SS produces two virtual segment rows sharing the same `controlLinkSystemId`
(confirmed by the `many-to-one` relation in `subsystem-control-link.schema.ts`):
- **Outside segment** (`peerNodeA=M1, peerNodeB=SS.systemId`): placed at the level where
  both M1 and SS are direct children (e.g. SS2 level).
- **Inside segment** (`peerNodeA=SS.systemId, peerNodeB=M2`): placed at the SS level itself,
  where SS.systemId represents the subsystem's own boundary node.

**QWS-07 — Non-boundary links:** A link whose both endpoint modules are direct children of
the same subsystem (no boundary crossing) produces a single virtual segment with
`peerNodeA=M3, peerNodeB=M4` placed at that subsystem's level.

**QWS-08 — Pruning:** A subsystem node is omitted from the tree if no in-scope module
exists at or beneath it. Ancestor subsystems that are purely on the path to in-scope modules
appear with `modules: []` and `controlLinks: []` / `dataLinks: []`.

**QWS-09 — Overlay on virtual segments:** Edit-session overlay is applied to virtual link
segments using the same pattern as raw links (`applyLinkOverlayAndMap`). When a raw link is
deleted in an edit session, its corresponding virtual segments in `subsystem_control_links` /
`subsystem_data_links` are also marked as deleted via `edit_actions`. The virtual segment
query applies `getEditActionsByTable('SubsystemControlLink')` /
`getEditActionsByTable('SubsystemDataLink')` to remove session-deleted segments before
returning results. Module overlay follows the same rules as the flat `/query` endpoint.

**QWS-10:** HTTP 200 success, HTTP 207 partial, HTTP 4xx/5xx failure.

---

## 2. Architecture Overview

```
@arc/api  (NestJS)
  UseCaseController
    ├── GET  /usecases           → FilterParser → GetAllUseCasesQuery
    └── POST /components/query   → GetComponentsQuery (scope: usecase, flat)

@arc/core  (zero framework deps)
  FilterExpression              pure tree AST — no imports
  FilterParser                  string → FilterExpression
  GetAllUseCasesQuery           carries FilterExpression | undefined
  GetAllUseCasesHandler         resolves fileId, passes filter through
  GetComponentsQuery            carries ComponentFlatScope
  GetComponentsHandler          dispatches flat: usecase or subgraph
  GetComponentsWithSubsystemsQuery   carries ComponentSubsystemScope (usecase scope only)
  GetComponentsWithSubsystemsHandler dispatches hierarchical: usecase scope
  UseCaseQueryService (port)    getAllUseCases(fileId, filter?)
  DataLinkQueryService (port)   findByUsecaseIds / findBySubgraphId
  ControlLinkQueryService (port)findByUsecaseIds / findBySubgraphId
  SubsystemQueryService (port)  findAll / findControlLinkSegmentsByUsecaseIds
                                           / findDataLinkSegmentsByUsecaseIds

@arc/persistence  (TypeORM)
  DbUseCaseQueryService         implements UseCaseQueryService
                                  overlay: three-tier pattern (applyToCollection +
                                           getEditActionsByTable / getEditActionsByAggregateId)
  DbSpfModuleQueryService       findByUsecaseIds / findBySubgraphId — overlay-aware
  DbDataLinkQueryService        implements DataLinkQueryService — overlay via applyLinkOverlayAndMap
  DbControlLinkQueryService     implements ControlLinkQueryService — same pattern
  DbSubsystemQueryService       implements SubsystemQueryService — overlay + Node.parentId JOIN
  USECASE_PARAM_FILTER          ParamFilter<UseCaseRow>
  EditActionsQueryService       fetches edit actions
```

**Rules:**
1. `@arc/core` never imports TypeORM — `FilterExpression` has zero framework deps.
2. `FilterSchema` (TypeORM) lives only in `@arc/persistence`.
3. `RecursiveOverlayEngine` is **not used** in this implementation — existing three-tier
   overlay pattern applies throughout.

**Link type rule:**
```
Flat  /query                     → raw links   (control_links / data_links)
Hierarchy /query-with-subsystems → virtual links (subsystem_control_links / subsystem_data_links)

Virtual links store pre-computed boundary segments. A boundary-crossing link produces two rows
(many-to-one to the same ControlLink, confirmed by subsystem-control-link.schema.ts):
  Outside segment: peerNodeA=M1,          peerNodeB=SS.systemId  (placed at outer level)
  Inside  segment: peerNodeA=SS.systemId, peerNodeB=M2           (placed inside SS)
Both rows share controlLinkSystemId / dataLinkSystemId referencing the original raw link.
```

---

## 3. Result\<T\> Pattern

```typescript
type Result<T> =
  | {kind: RESULT_KIND.Ok;      data: T;  issues?: readonly Issue[]}
  | {kind: RESULT_KIND.Partial; data: T;  issues:  readonly Issue[]}
  | {kind: RESULT_KIND.Fail;              issues:  readonly Issue[]};
```

**Query service:** `Result.ok(data)` | `Result.partial(data, issues)` |
`Result.fail(IssueFactory.dbError(...))`

**Handler chain:**
```typescript
if (result.kind === RESULT_KIND.Fail) return result;  // propagate — no re-wrapping
const data = result.data;                             // TS narrowed to Ok | Partial
```

**Controller boundary:**
```typescript
const result = await this.queryBus.execute(...);
throwIfFailed(result);        // HttpException if kind='fail'
return toApiResult(result);   // {data, issues?}
```

---

## 4. Filter Expression Design

### 4.1 FilterExpression — `@arc/core`

```typescript
// packages/core/src/shared/filter/filter-expression.ts

export type FilterValue = number | string | boolean;

export type FilterExpression =
  | {readonly type: 'AND';       readonly left:  FilterExpression; readonly right: FilterExpression}
  | {readonly type: 'OR';        readonly left:  FilterExpression; readonly right: FilterExpression}
  | {readonly type: 'condition'; readonly field: string;           readonly value: FilterValue};
```

Tree structure — handles arbitrary nesting and parentheses. No imports.

### 4.2 FilterParser — `@arc/core`

Parses raw filter string → `FilterExpression` tree. Value type resolution:

```
'0x...'        → parseInt(v, 16)  → number
all digits     → parseInt(v, 10)  → number
'true'/'false' → boolean
anything else  → string
```

### 4.3 ParamFilter\<T\> — `@arc/persistence`

```typescript
// packages/infrastructure/persistence/.../queries/shared/param-filter.ts

interface ParamFilterField<TEntity = unknown> {
  name:         string;
  valueType:    'number' | 'string' | 'boolean';
  addCondition: (qb: WhereExpressionBuilder, value: FilterValue, paramKey: string, alias: string) => void;
  evaluate:     (entity: TEntity, value: FilterValue) => boolean;
}
```

`ParamFilter.apply(qb, expression, alias)` walks the tree recursively:

- `AND` node → `qb.andWhere(new Brackets(inner => { walkApply(inner, left); walkApply(inner, right); }))`
- `OR` node → `qb.andWhere(new Brackets(inner => { walkApply(inner, left); inner.orWhere(new Brackets(b => walkApply(b, right))); }))`
  Note: `walkApply(inner, left)` binds against `inner` (the Brackets builder), not the outer `qb`.
  All recursive calls pass the current `WhereExpressionBuilder` explicitly — the builder reference never escapes its bracket scope.
- `condition` node → `field.addCondition(qb, value, paramKey, alias)`

A private `{n: number}` counter generates unique parameter names (`p0`, `p1`, `p2`...)
across the entire tree walk, preventing TypeORM parameter collisions when the same field
appears multiple times (e.g. `subgraphId:X OR subgraphId:Y`).

**`validate(expression: FilterExpression): void`**

Walks the full AND/OR tree recursively. For every `condition` node:
- Throws `Error` if `node.field` is not in the registered fields map → caller converts to HTTP 400.
- Throws `Error` if `typeof node.value !== field.valueType` → caller converts to HTTP 400.

The controller calls `validateFilterFields(expression, allowedFieldsSet)` from `@arc/core`
(a thin wrapper over `ParamFilter.validate`) before building the query — errors become `BadRequestException`.

Also provides `validateFilterFields(expression, allowedFields)` in `@arc/core` — the controller
calls this to throw `400` on unknown fields before the query is built.

### 4.4 USECASE_PARAM_FILTER — `@arc/persistence`

`addCondition` uses TypeORM's `qb.andWhere()` with parameterized queries and
`ENTITY_NAMES` constants for all table references. `subQuery()` is available only
on `SelectQueryBuilder` — since `addCondition` receives `WhereExpressionBuilder`
(to work inside `Brackets` for AND/OR nesting), parameterized `andWhere` is the
correct TypeORM QueryBuilder approach for EXISTS conditions in all contexts.

```typescript
// packages/infrastructure/persistence/.../queries/usecase/usecase-param-filter.ts

export const USECASE_PARAM_FILTER = new ParamFilter<UseCaseRow>()
  .register({
    name: 'spfModuleInstanceId', valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM ${ENTITY_NAMES.UseCaseSubgraph} ucs
          JOIN ${ENTITY_NAMES.SpfModule} sm
            ON sm.subgraph_system_id = ucs.subgraph_system_id
          JOIN ${ENTITY_NAMES.Node} n
            ON n.system_id = sm.system_id
          WHERE ucs.usecase_system_id = ${alias}.system_id
            AND n.module_id = :${key}
        )`,
        {[key]: value},
      );
    },
    evaluate: (uc, value) => uc.modules?.some(m => m.moduleId === value) ?? false,
  })
  .register({
    name: 'subgraphId', valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM ${ENTITY_NAMES.UseCaseSubgraph} ucs
          WHERE ucs.usecase_system_id = ${alias}.system_id
            AND ucs.subgraph_system_id = :${key}
        )`,
        {[key]: value},
      );
    },
    evaluate: (uc, value) => uc.subgraphs?.some(s => s.systemId === value) ?? false,
  })
  .register({
    name: 'containerId', valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM ${ENTITY_NAMES.UseCaseSubgraph} ucs
          JOIN ${ENTITY_NAMES.SpfModule} sm
            ON sm.subgraph_system_id = ucs.subgraph_system_id
          WHERE ucs.usecase_system_id = ${alias}.system_id
            AND sm.container_system_id = :${key}
        )`,
        {[key]: value},
      );
    },
    evaluate: (uc, value) => uc.modules?.some(m => m.containerId === value) ?? false,
  });
  // New field → one .register() call, no other changes
```

---

## 5. Read Models

### 5.1 UseCaseReadModel

```typescript
export class UseCaseReadModel {
  constructor(
    public readonly systemId:    number,
    public readonly gkv:         KeyValuePairReadModel[],
    public readonly alias?:      string,
    public readonly aliasId?:    number,
    public readonly categories?: string[],
  ) {}
}
```

### 5.2 ComponentsReadModel — flat

```typescript
// packages/core/.../query-services/component/components-read-model.ts

export interface ComponentsReadModel {
  readonly modules:      SpfModuleReadModel[];    // current — from spf-module/spf-module-read-model.ts
  readonly dataLinks:    DataLinkReadModel[];     // extended — adds sourceSubgraphSystemId, destSubgraphSystemId
  readonly controlLinks: ControlLinkReadModel[];  // extended — adds sourceSubgraphSystemId, destSubgraphSystemId
}
```

`DataLinkReadModel` and `ControlLinkReadModel` in `component/` **extend** the old read models
from `usecase/query-models/` — they add `sourceSubgraphSystemId` and `destSubgraphSystemId`
without modifying the base. Old code still imports from `usecase/query-models/`; new code
imports the extended versions from `component/`.

Used by: `POST /usecases/components/query`, `GET /subgraphs/{id}/components`.

### 5.3 ComponentsWithSubsystemsReadModel — recursive

```typescript
// Extends flat model — adds subsystems[] only
export interface ComponentsWithSubsystemsReadModel extends ComponentsReadModel {
  subsystems: SubsystemNodeReadModel[];
}

export interface SubsystemNodeReadModel {
  systemId:     number;
  name:         string;
  filteredKeys: KeyDefinitionReadModel[];
  children:     ComponentsWithSubsystemsReadModel;   // same shape — recurses to leaf
}
```

Every level (root and each subsystem) holds its **direct-child** modules, links,
and child subsystems. The tree is built in-memory from batch-loaded flat data.

Used by: `POST /usecases/components/query-with-subsystems`, subsystem endpoint.

---

## 6. CQRS — Queries and Handlers

### 6.1 GetAllUseCasesQuery

```typescript
export class GetAllUseCasesQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly filter?:   FilterExpression,
    clientId: string,
  ) { super(clientId); }
}
```

### 6.2 GetAllUseCasesHandler

```typescript
export class GetAllUseCasesHandler
  implements QueryHandler<GetAllUseCasesQuery, Promise<Result<UseCaseReadModel[]>>>
{
  async handle(query: GetAllUseCasesQuery): Promise<Result<UseCaseReadModel[]>> {
    const fileId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);
    // getFileIdByProjectId throws a DomainException (not-found) if the project
    // does not exist — this surfaces as a 404 via AllExceptionsFilter.
    // The handler does not need an explicit null-check.
    return this.queryServices.useCaseQueryService
      .getAllUseCases(fileId, query.filter);
  }
}
```

The same not-found contract applies to `GetComponentsHandler` and
`GetComponentsWithSubsystemsHandler` — both call `getFileIdByProjectId` which throws.

### 6.3 GetComponentsQuery — flat scope

```typescript
// packages/core/src/application/usecase-designer/usecase/get-components/
//   component-scope-type.ts

export const COMPONENT_SCOPE_TYPE = {
  Usecase:   'usecase',
  Subgraph:  'subgraph',
  Subsystem: 'subsystem',
} as const;

export type ComponentScopeType =
  (typeof COMPONENT_SCOPE_TYPE)[keyof typeof COMPONENT_SCOPE_TYPE];

// Flat scope — COMPONENT_SCOPE_TYPE.Usecase includes INTRA_SUBGRAPH + INTRA_USECASE links
//              COMPONENT_SCOPE_TYPE.Subgraph includes INTRA_SUBGRAPH links only
type ComponentFlatScope =
  | {type: typeof COMPONENT_SCOPE_TYPE.Usecase;  systemIds: number[]}
  | {type: typeof COMPONENT_SCOPE_TYPE.Subgraph; systemId:  number};

export class GetComponentsQuery extends BaseQuery {
  constructor(
    public readonly scope:     ComponentFlatScope,
    public readonly projectId: number,
    clientId: string,
  ) { super(clientId); }
}
```

### 6.4 GetComponentsHandler — flat

```typescript
export class GetComponentsHandler implements QueryHandler<
  GetComponentsQuery,
  Promise<Result<ComponentsReadModel>>
> {
  async handle(query: GetComponentsQuery): Promise<Result<ComponentsReadModel>> {
    const fileId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    if (query.scope.type === COMPONENT_SCOPE_TYPE.Usecase) {
      const invalidResult = await this.findInvalidUsecaseId(query.scope.systemIds, fileId);
      if (invalidResult.kind === RESULT_KIND.Fail) return invalidResult;
      if (invalidResult.data !== undefined)
        return Result.fail(IssueFactory.notFound(ISSUE_ENTITY_TYPE.UseCase, invalidResult.data));
    }

    const svc = this.queryServices;

    switch (query.scope.type) {
      case COMPONENT_SCOPE_TYPE.Usecase:
        return this.loadComponents(
          svc.spfModuleQueryService.findByUsecaseIds(query.scope.systemIds, fileId),
          svc.dataLinkQueryService.findByUsecaseIds(query.scope.systemIds, fileId),
          svc.controlLinkQueryService.findByUsecaseIds(query.scope.systemIds, fileId),
        );
      case COMPONENT_SCOPE_TYPE.Subgraph:
        return this.loadComponents(
          svc.spfModuleQueryService.findBySubgraphId(query.scope.systemId, fileId),
          svc.dataLinkQueryService.findBySubgraphId(query.scope.systemId, fileId),
          svc.controlLinkQueryService.findBySubgraphId(query.scope.systemId, fileId),
        );
    }
  }

  // Returns the first systemId not found in DB/session, or undefined if all valid.
  // Returns Result.fail if getAllUseCases itself fails (propagates the DB error).
  private async findInvalidUsecaseId(
    systemIds: number[], fileId: number,
  ): Promise<Result<number | undefined>> {
    const allResult = await this.queryServices.useCaseQueryService.getAllUseCases(fileId);
    if (allResult.kind === RESULT_KIND.Fail) return allResult;
    const knownIds = new Set(allResult.data.map(uc => uc.systemId));
    return Result.ok(systemIds.find(id => !knownIds.has(id)));
  }
}
```

### 6.5 GetComponentsWithSubsystemsQuery — hierarchical scope

```typescript
// Hierarchical scope — usecase only in this implementation
// Subsystem-scoped variant deferred to a future phase
type ComponentSubsystemScope =
  | {type: typeof COMPONENT_SCOPE_TYPE.Usecase; systemIds: number[]};

export class GetComponentsWithSubsystemsQuery extends BaseQuery {
  constructor(
    public readonly scope:     ComponentSubsystemScope,
    public readonly projectId: number,
    clientId: string,
  ) { super(clientId); }
}
```

### 6.6 GetComponentsWithSubsystemsHandler — hierarchical

```typescript
export class GetComponentsWithSubsystemsHandler implements QueryHandler<
  GetComponentsWithSubsystemsQuery,
  Promise<Result<ComponentsWithSubsystemsReadModel>>
> {
  async handle(query: GetComponentsWithSubsystemsQuery) {
    const fileId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // Validate usecase IDs (DB + session-created usecases via getAllUseCases overlay)
    const allUsecasesResult =
      await this.queryServices.useCaseQueryService.getAllUseCases(fileId);
    if (allUsecasesResult.kind === RESULT_KIND.Fail) return allUsecasesResult;
    const knownIds = new Set(allUsecasesResult.data.map(uc => uc.systemId));
    const invalidId = query.scope.systemIds.find(id => !knownIds.has(id));
    if (invalidId !== undefined)
      return Result.fail(IssueFactory.notFound(ISSUE_ENTITY_TYPE.UseCase, invalidId));

    const svc = this.queryServices;
    const systemIds = query.scope.systemIds;

    // Pass 1: load modules and subsystems in parallel to determine which link strategy to use.
    // Virtual segments (subsystem_control_links) cover all link placements when subsystems exist.
    // Raw links are used when the file has no subsystem context at all.
    const [modulesResult, subsystemsResult] = await Promise.all([
      svc.spfModuleQueryService.findByUsecaseIds(systemIds, fileId),
      svc.subsystemQueryService.findAll(fileId),
    ]);

    if (modulesResult.kind  === RESULT_KIND.Fail) return modulesResult;
    if (subsystemsResult.kind === RESULT_KIND.Fail) return subsystemsResult;

    // Pass 2: choose link source based on subsystem presence (QWS-04).
    //   Has subsystems → virtual segments carry pre-computed boundary information
    //   No subsystems  → all links are raw module-to-module connections
    const hasSubsystems = subsystemsResult.data.length > 0;
    const [dataLinksResult, controlLinksResult] = await Promise.all(
      hasSubsystems
        ? [
            svc.subsystemQueryService.findDataLinkSegmentsByUsecaseIds(systemIds, fileId),
            svc.subsystemQueryService.findControlLinkSegmentsByUsecaseIds(systemIds, fileId),
          ]
        : [
            svc.dataLinkQueryService.findByUsecaseIds(systemIds, fileId),
            svc.controlLinkQueryService.findByUsecaseIds(systemIds, fileId),
          ],
    );

    if (dataLinksResult.kind    === RESULT_KIND.Fail) return dataLinksResult;
    if (controlLinksResult.kind === RESULT_KIND.Fail) return controlLinksResult;

    const tree = buildSubsystemTree(
      {
        modules:      modulesResult.data,
        dataLinks:    dataLinksResult.data,
        controlLinks: controlLinksResult.data,
      },
      subsystemsResult.data,
    );
    return Result.ok(tree);
  }
}
```

All handlers are thin — no scoping, no overlay, no mapping. Single responsibility.

---

## 7. Individual Query Services

`ComponentQueryService` was **removed**. Each entity type has its own query service
following the existing codebase pattern (`SpfModuleQueryService`, `SubgraphQueryService`, etc.).

### 7.1 SpfModuleQueryService — extended (existing port)

```typescript
// New methods added — existing findOne/findMany unchanged
findByUsecaseIds(usecaseSystemIds, fileSystemId): Promise<Result<SpfModuleReadModel[]>>
  // Scoped via use_case_subgraphs → spf_modules.subgraph_system_id
  // Overlay: use_case_subgraphs CREATE/DELETE (session) + SpfModule CREATE + Node DELETE
  // Deduplicated by systemId — same module reachable from multiple usecases appears once
  // Delegates detail loading (ports, definition caps, module-level overlay) to findMany()

findBySubgraphId(subgraphId, fileSystemId): Promise<Result<SpfModuleReadModel[]>>
  // Direct spf_modules.subgraph_system_id lookup + SpfModule CREATE overlay
```

### 7.2 DataLinkQueryService — new port

```typescript
findByUsecaseIds(usecaseSystemIds, fileSystemId): Promise<Result<DataLinkReadModel[]>>
  // INTRA_SUBGRAPH (via use_case_subgraphs) + INTRA_USECASE (via use_case_subgraph_pairs)
  // Overlay via getEditActionsByTable('DataLink'). Deduplicated.

findBySubgraphId(subgraphId, fileSystemId): Promise<Result<DataLinkReadModel[]>>
  // INTRA_SUBGRAPH only — cross-subgraph links excluded. Overlay applied.
```

### 7.3 ControlLinkQueryService — new port

```typescript
// Same method signatures and scoping rules as DataLinkQueryService
findByUsecaseIds(usecaseSystemIds, fileSystemId): Promise<Result<ControlLinkReadModel[]>>
findBySubgraphId(subgraphId, fileSystemId): Promise<Result<ControlLinkReadModel[]>>
```

### 7.4 SubsystemQueryService — new port

```typescript
findAll(fileSystemId): Promise<Result<SubsystemReadModel[]>>
  // Returns ALL subsystems for the file with parentId from nodes.parent_id
  // and filteredKeys. Used by buildSubsystemTree() and filtered-by-subsystem endpoint.
  // Overlay applied (subsystem name updates, CREATE/DELETE).

findControlLinkSegmentsByUsecaseIds(usecaseSystemIds, fileSystemId): Promise<Result<ControlLinkReadModel[]>>
  // Returns subsystem_control_links segments for the given usecases.
  // JOIN: subsystem_control_links → control_links (heapId, linkType, ports)
  //       → use_case_subgraph_pairs (usecase scoping, same chain as raw link query).
  // peerNodeASystemId / peerNodeBSystemId may be a module ID or a subsystem node ID.
  // Overlay: getEditActionsByTable('SubsystemControlLink') → applyToCollection removes
  //   session-deleted segments (session deletes virtual segments when raw link is deleted).
  // Returns the same ControlLinkReadModel DTO — no new type needed.

findDataLinkSegmentsByUsecaseIds(usecaseSystemIds, fileSystemId): Promise<Result<DataLinkReadModel[]>>
  // Same pattern as findControlLinkSegmentsByUsecaseIds against subsystem_data_links.
  // Overlay: getEditActionsByTable('SubsystemDataLink') → applyToCollection.
```

### 7.5 Handler Composition

**Flat — `POST /usecases/components/query` and `GET /subgraphs/{id}/components`:**

```typescript
// Step 1: Validate usecase IDs (usecase scope only)
const allUsecases = await useCaseQueryService.getAllUseCases(fileId);
// getAllUseCases returns DB + session-created usecases via overlay
// → find(id => !knownIds.has(id)) → Result.fail(notFound) if any missing

// Step 2: Load components in parallel
const [modules, dataLinks, controlLinks] = await Promise.all([
  spfModuleQueryService.findByUsecaseIds(systemIds, fileId),
  dataLinkQueryService.findByUsecaseIds(systemIds, fileId),
  controlLinkQueryService.findByUsecaseIds(systemIds, fileId),
]);
return Result.ok({modules, dataLinks, controlLinks});
```

**Hierarchical — `POST /usecases/components/query-with-subsystems`:**

```typescript
// Pass 1: modules + subsystems (determines link strategy)
const [modules, subsystems] = await Promise.all([
  spfModuleQueryService.findByUsecaseIds(systemIds, fileId),
  subsystemQueryService.findAll(fileId),
]);

// Pass 2: virtual segments when subsystems exist, raw links when not (QWS-04)
const [dataLinks, controlLinks] = await Promise.all(
  subsystems.length > 0
    ? [
        subsystemQueryService.findDataLinkSegmentsByUsecaseIds(systemIds, fileId),     // virtual
        subsystemQueryService.findControlLinkSegmentsByUsecaseIds(systemIds, fileId),  // virtual
      ]
    : [
        dataLinkQueryService.findByUsecaseIds(systemIds, fileId),     // raw
        controlLinkQueryService.findByUsecaseIds(systemIds, fileId),  // raw
      ],
);
const tree = buildSubsystemTree({modules, dataLinks, controlLinks}, subsystems);
return Result.ok(tree);
```

### 7.6 `buildSubsystemTree` — pure function in `@arc/core`

**Source file:** `packages/core/src/application/usecase-designer/usecase/get-component-with-subsystem/build-subsystem-tree.ts`

#### Overview

`buildSubsystemTree` is the only logic that is unique to the hierarchical endpoint.
It takes flat, already-loaded data from the persistence layer and rearranges it into a
recursive read model that the client can walk level by level.

It performs **no DB access** — it is a pure function that is fully unit-testable without mocks.

```typescript
export function buildSubsystemTree(
  flat:       ComponentsReadModel,
  subsystems: SubsystemReadModel[],
): ComponentsWithSubsystemsReadModel
```

---

#### Input data structures

**`ComponentsReadModel` (flat)**
The handler loads this in two parallel passes before calling `buildSubsystemTree`:

| Field | Type | Key property used |
|---|---|---|
| `modules` | `SpfModuleReadModel[]` | `systemId`, `parentId?` — `parentId` is the subsystem this module lives in (`undefined` = top-level) |
| `dataLinks` | `DataLinkReadModel[]` | `sourceNodeSystemId`, `destinationNodeSystemId` — may be module IDs **or subsystem IDs** (virtual segments) |
| `controlLinks` | `ControlLinkReadModel[]` | `peerNodeASystemId`, `peerNodeBSystemId` — same |

When subsystems exist, the handler passes **virtual link segments** (from `subsystem_control_links` /
`subsystem_data_links`) combined with the remaining raw links. Virtual segments carry pre-computed
boundary information — one or both endpoint IDs may refer to a subsystem node, not a module.

**`SubsystemReadModel[]`**
ALL subsystems for the file (not filtered by usecase scope). `buildSubsystemTree` will prune
the ones that have no in-scope module beneath them.

| Field | Meaning |
|---|---|
| `systemId` | ID of this subsystem node |
| `parentId?` | ID of the parent subsystem; `undefined` for root subsystems |
| `name` | Display name |
| `filteredKeys` | Key definitions this subsystem declares as its key-value filter set |

---

#### Output data structure

The output is `ComponentsWithSubsystemsReadModel`, which is recursive:

```typescript
interface ComponentsWithSubsystemsReadModel {
  modules:      SpfModuleReadModel[];
  dataLinks:    DataLinkReadModel[];
  controlLinks: ControlLinkReadModel[];
  subsystems:   SubsystemNodeReadModel[];   // ← added vs flat model
}

interface SubsystemNodeReadModel {
  systemId:     number;
  name:         string;
  filteredKeys: KeyDefinitionSummaryReadModel[];
  children:     ComponentsWithSubsystemsReadModel;  // ← same shape, recurses to leaf
}
```

Every level (root and each subsystem node's `children`) holds exactly:
- The **direct-child modules** belonging to that level
- The **links** whose both endpoint node IDs are "visible" at that level
- The **direct-child subsystems** (each with the same shape recursively)

---

#### Algorithm — step by step

##### Step 1: Build O(1) lookup maps

```typescript
const subsystemById = new Map(subsystems.map(s => [s.systemId, s]));

const childrenOf = new Map<number | undefined, number[]>();
for (const sub of subsystems) {
  const key = sub.parentId;
  const siblings = childrenOf.get(key) ?? [];
  siblings.push(sub.systemId);
  childrenOf.set(key, siblings);
}
```

Two maps are built once, before any recursion:

- **`subsystemById`** (`systemId → SubsystemReadModel`): fast lookup when building a tree node
- **`childrenOf`** (`parentId → [child systemId, ...]`): maps each parent to its direct subsystem children.
  `childrenOf.get(undefined)` returns root subsystem IDs (those with no parent).

These maps replace the flat array with O(1) random-access, so recursion never re-scans the full array.

---

##### Step 2: Pruning predicate — `hasInScopeDescendant`

```typescript
const hasInScopeDescendant = (subsystemId: number, visited = new Set<number>()): boolean => {
  if (visited.has(subsystemId)) return false;   // cycle guard
  visited.add(subsystemId);
  if (modules.some(m => m.parentId === subsystemId)) return true;
  return (childrenOf.get(subsystemId) ?? []).some(c => hasInScopeDescendant(c, visited));
};
```

This DFS answers: *"does this subsystem, or any subsystem beneath it, contain at least one module
from the requested usecase scope?"*

**Why is pruning needed?**
`subsystems` is loaded with `findAll(fileId)` — ALL subsystems in the file. The `modules` array
is already usecase-scoped, but subsystems are not. Many subsystems may exist in the file that
have zero relation to the queried usecases. Without pruning, the tree would include empty branches.

**The prune rule (QWS-08):** A subsystem is omitted if no in-scope module exists at **or beneath** it.
Ancestor subsystems that lie on the path *to* in-scope modules appear in the output but with
`modules: []` and empty links at their own level — they are structural containers for in-scope subtrees.

**Cycle guard:** The `visited` set prevents infinite recursion if `parentId` references form a cycle
in the data (defensive; should not happen in valid data).

---

##### Step 3: `buildLevel` — the recursive core

```typescript
const buildLevel = (
  parentId?: number,
  visited = new Set<number>(),
): ComponentsWithSubsystemsReadModel => { ... }
```

Called initially as `buildLevel()` (no `parentId`) for the root level.
For each child subsystem, called recursively as `buildLevel(sub.systemId, nextVisited)`.

---

**3a — Collect direct-child modules:**

```typescript
const levelModules = modules.filter(m => m.parentId === parentId);
```

Selects only the modules whose `parentId` exactly matches this level's ID:
- At root (`parentId = undefined`): top-level modules not inside any subsystem
- Inside SS_A (`parentId = SS_A.systemId`): modules directly owned by SS_A (not its deeper descendants)

---

**3b — Find pruned direct-child subsystems:**

```typescript
const directChildIds = (childrenOf.get(parentId) ?? []).filter(id =>
  hasInScopeDescendant(id),
);
```

Reads the direct-child subsystem IDs from the map, then prunes to only those that have at least
one in-scope module at or beneath them. Subsystems with no in-scope descendants are dropped here —
they will not appear anywhere in the output tree.

---

**3c — Build `levelNodeIds` — the link-placement predicate:**

```typescript
const levelNodeIds = new Set<number>([
  ...levelModules.map(m => m.systemId),                   // category 1
  ...directChildIds,                                       // category 2
  ...(parentId !== undefined ? [parentId] : []),           // category 3
]);
```

This set defines which node IDs are "visible" at this level for the purpose of link placement.
Three categories:

| Category | What is included | Why |
|---|---|---|
| **1 — direct module children** | `systemId` of every module directly inside this level | Non-boundary links (`M3↔M4`, both direct modules) are placed here |
| **2 — direct child subsystem IDs** | `systemId` of each pruned direct-child subsystem | **Outside boundary segment** (`M1↔SS.systemId`): SS is a direct child at this level, M1 is a module at this level — both are visible, so the segment is placed here |
| **3 — this subsystem's own ID** (`parentId`) | The current subsystem's `systemId` when recursing inside it | **Inside boundary segment** (`SS.systemId↔M2`): SS.systemId is the boundary entry-node representing the "entry into SS from the parent", M2 is a direct module inside SS — both are visible **at SS's own level**, so the segment is placed here |

Category 3 is only meaningful when `parentId !== undefined` (i.e., inside a subsystem). At root
level there is no entry boundary node concept, so the third category contributes nothing.

---

**3d — Filter links to this level:**

```typescript
const levelDataLinks = dataLinks.filter(
  dl => levelNodeIds.has(dl.sourceNodeSystemId) && levelNodeIds.has(dl.destinationNodeSystemId),
);
const levelControlLinks = controlLinks.filter(
  cl => levelNodeIds.has(cl.peerNodeASystemId) && levelNodeIds.has(cl.peerNodeBSystemId),
);
```

A link segment is placed at this level iff **both** its endpoint node IDs appear in `levelNodeIds`.
This single filter handles all three segment types with no conditional branching:

| Segment type | Endpoint A | Endpoint B | Placed at level where... |
|---|---|---|---|
| Non-boundary | module M3 (direct child) | module M4 (direct child) | Both in category 1 |
| Outside boundary | module M1 (direct child) | subsystem SS.systemId | M1 in category 1, SS in category 2 |
| Inside boundary | SS.systemId | module M2 (direct child) | SS in category 3, M2 in category 1 |

Boundary-crossing raw links (where one endpoint is a subsystem) are naturally dropped by this
filter when raw links are loaded as fallback (no-subsystem case), because a subsystem ID would
not appear in any category. Raw links are always module↔module, so they are placed only at the
level where both modules are direct children.

---

**3e — Recurse into child subsystems:**

```typescript
const subsystemNodes = directChildIds.flatMap(id => {
  if (visited.has(id)) return [];          // skip cycles
  const sub = subsystemById.get(id);
  if (!sub) return [];                     // skip orphaned IDs
  const nextVisited = new Set(visited);
  nextVisited.add(id);
  return [{
    systemId:     sub.systemId,
    name:         sub.name,
    filteredKeys: sub.filteredKeys,
    children:     buildLevel(sub.systemId, nextVisited),   // recurse
  }];
});
```

For each direct child subsystem that survived pruning:
- Guard against revisiting the same node ID (cycle protection propagated down)
- Guard against orphaned IDs (subsystem ID referenced in `childrenOf` but not in `subsystemById` — defensive)
- Recurse: `buildLevel(sub.systemId, ...)` builds the full `ComponentsWithSubsystemsReadModel`
  for that subsystem's interior and returns it as `children`

`nextVisited` is a new `Set` that includes the current `id`, ensuring the cycle guard travels
down the recursion path without sharing mutable state across siblings.

---

**3f — Return the assembled level:**

```typescript
return {
  modules:      levelModules,
  dataLinks:    levelDataLinks,
  controlLinks: levelControlLinks,
  subsystems:   subsystemNodes,
};
```

---

#### Concrete worked example

Given the following data (simplified, systemIds are plain numbers):

```
Subsystems (all subsystems for file):
  SS_A  systemId=100  parentId=undefined   (root)
    SS_B  systemId=200  parentId=100       (child of A)

Modules in scope (from requested usecases):
  M1  systemId=10  parentId=undefined      (top-level, no subsystem)
  M2  systemId=20  parentId=100            (directly inside SS_A)
  M3  systemId=30  parentId=200            (directly inside SS_B)

Virtual link segments loaded:
  L1 (data): source=10 (M1),     dest=100 (SS_A)  ← outside segment: M1 → SS_A boundary
  L2 (data): source=100 (SS_A),  dest=20 (M2)     ← inside segment:  SS_A boundary → M2
  L3 (data): source=20 (M2),     dest=200 (SS_B)  ← outside segment: M2 → SS_B boundary
  L4 (data): source=200 (SS_B),  dest=30 (M3)     ← inside segment:  SS_B boundary → M3
```

**Step 1:** Maps built:
```
subsystemById: {100→SS_A, 200→SS_B}
childrenOf:    {undefined→[100], 100→[200]}
```

**Step 2:** Pruning:
- `hasInScopeDescendant(100)`: modules.some(m=>m.parentId===100) → M2 found → `true`
- `hasInScopeDescendant(200)`: modules.some(m=>m.parentId===200) → M3 found → `true`

**`buildLevel(undefined)` — root:**
```
levelModules    = [M1]
directChildIds  = [100]  (SS_A has in-scope descendants)
levelNodeIds    = {10, 100}  (M1.systemId, SS_A.systemId; parentId=undefined adds nothing)
levelDataLinks  = [L1]       (10∈set ✓, 100∈set ✓)
                  L2 dropped (20∉set)
                  L3 dropped (200∉set)
                  L4 dropped (200∉set, 30∉set)
subsystems      = [{SS_A, children: buildLevel(100,...)}]
```

**`buildLevel(100)` — inside SS_A:**
```
levelModules    = [M2]
directChildIds  = [200]  (SS_B has in-scope descendants)
levelNodeIds    = {20, 200, 100}  (M2.systemId, SS_B.systemId, parentId=100)
levelDataLinks  = [L2, L3]
                  L1 dropped (10∉set)
                  L2: (100∈set ✓, 20∈set ✓)
                  L3: (20∈set ✓, 200∈set ✓)
                  L4 dropped (30∉set)
subsystems      = [{SS_B, children: buildLevel(200,...)}]
```

**`buildLevel(200)` — inside SS_B:**
```
levelModules    = [M3]
directChildIds  = []     (SS_B has no children)
levelNodeIds    = {30, 200}  (M3.systemId, parentId=200)
levelDataLinks  = [L4]       (200∈set ✓, 30∈set ✓)
subsystems      = []
```

**Final output shape:**
```
{
  modules:   [M1],
  dataLinks: [L1],
  subsystems: [{
    systemId: 100, name: 'SS_A',
    children: {
      modules:   [M2],
      dataLinks: [L2, L3],
      subsystems: [{
        systemId: 200, name: 'SS_B',
        children: {
          modules:   [M3],
          dataLinks: [L4],
          subsystems: []
        }
      }]
    }
  }]
}
```

Key observations:
- **L1** (outside into SS_A) lives at root — M1 and SS_A's boundary node are both visible there
- **L2** (inside SS_A entry) lives at SS_A level — SS_A boundary (100) is in category 3 and M2 is in category 1
- **L3** (outside into SS_B from inside SS_A) lives at SS_A level — M2 is in category 1 and SS_B (200) is in category 2
- **L4** (inside SS_B entry) lives at SS_B level — SS_B boundary (200) is in category 3 and M3 is in category 1

---

#### Design properties

| Property | Detail |
|---|---|
| **Pure function** | No DB access, no side effects. Fully unit-testable without mocks or stubs. |
| **O(n) maps** | `subsystemById` and `childrenOf` are built once in O(n). Every recursive call does O(1) lookups — the flat arrays are never re-scanned for tree structure. |
| **Bounded query count** | The handler makes a fixed number of DB queries (Pass 1 + Pass 2a + optional Pass 2b) regardless of tree depth. `buildSubsystemTree` adds zero queries — see also `docs/usecase-apis/tree-traversal-decision.md`. |
| **Pruning** | Subsystems with no in-scope modules are excluded from the output. The DFS prune check is called once per candidate child per level; total work is bounded by the number of subsystem nodes. |
| **Link placement** | The `levelNodeIds` 3-category set is the single placement predicate. No conditional branching per link type — the same `has(source) && has(dest)` filter routes all segment types correctly to exactly one level. |
| **Cycle safety** | `visited` set propagates through every level and sibling branch. Both `hasInScopeDescendant` and `buildLevel` guard independently against cycles. |

---

## 8. Edit-Session Overlay Per Service Method

**`RecursiveOverlayEngine` is NOT used.** All overlay uses the existing three-tier
pattern: `applyToCollection` + `getEditActionsByTable` / `getEditActionsByAggregateId`.
Edit actions are loaded once per service method — never per entity or per row.

### 8.1 getAllUseCases (DbUseCaseQueryService)

**Entities overlaid:** `use_cases`, `usecase_gkv_values`, `use_case_categories`,
`value_definitions`, `key_definitions`

**Pattern:** Three-tier. `RecursiveOverlayEngine` is **not** used.

```typescript
// Tier 1 — no session
const session = await editActionsQueryService.findActiveSession(fileSystemId);
if (!session) return Result.ok(baseRows.map(mapToReadModel));

// Always apply applyToCollection — handles CREATE-injected usecases
// not yet in the main table (even if usecaseActions is empty)
const usecaseActions = await editActionsQueryService.getEditActionsByTable(
  session.sessionId, ENTITY_NAMES.UseCase,
);
rows = applyToCollection(baseRows, usecaseActions) as UseCaseRow[];

// Per-usecase: overlay GKV bins + categories
// Both can change independently of the usecase row itself
for (const row of rows) {
  const aggActions = await editActionsQueryService.getEditActionsByAggregateId(
    session.sessionId, row.systemId,
  );

  if (aggActions.length === 0) continue;  // no changes for this usecase

  // Overlay GKV bin rows (CREATE/DELETE of individual key-value bins)
  const gkvActions = aggActions.filter(a => a.tableName === ENTITY_NAMES.UsecaseGkvValues);
  if (gkvActions.length > 0 && row.gkvEntries) {
    row.gkvEntries = applyToCollection(row.gkvEntries, gkvActions);
  }

  // Overlay category rows (CREATE/DELETE of category assignments)
  const categoryActions = aggActions.filter(a => a.tableName === ENTITY_NAMES.UseCaseCategory);
  if (categoryActions.length > 0 && row.categories) {
    row.categories = applyToCollection(row.categories, categoryActions);
  }
}

// ONE batched call for value/key definition resolution + overlay across all usecases
// KeyValueDefQueryService.getKeyValueSummaryForGivenValues applies
// ValueDefinition + KeyDefinition overlay internally
const allValueDefIds = rows.flatMap(r =>
  (r.gkvEntries ?? []).map(e => e.valueDefSystemId),
);
const pairsResult = await keyValueDefQuerySvc.getKeyValueSummaryForGivenValues(
  allValueDefIds, fileId,
);
const pairsMap = new Map(
  pairsResult.kind !== RESULT_KIND.Fail
    ? pairsResult.data.map(pair => [pair.value.systemId, pair])
    : [],
);
// Map each usecase using the lookup — no per-usecase DB call
return Result.ok(rows.map(row => buildReadModel(row, pairsMap)));
```

### 8.2 findByUsecaseIds / findBySubgraphId (DbSpfModuleQueryService, DbDataLinkQueryService, DbControlLinkQueryService)

`DbComponentQueryService` was **deleted**. Component overlay is distributed across the
three individual services. Each service follows the same three-tier pattern as §8.1.

**DbSpfModuleQueryService.findByUsecaseIds** — entities overlaid:
`nodes`, `spf_modules`, `data_ports`, `control_ports`, `intents`

```typescript
// Tier 1 — no session
const session = await editActionsQueryService.findActiveSession(fileSystemId);

// Tier 2 — table-wide per entity type (parallel)
const [nodeActions, spfModuleActions, portActions, ctrlPortActions] =
  await Promise.all([
    editActionsQueryService.getEditActionsByTable(sessionId, ENTITY_NAMES.Node),
    editActionsQueryService.getEditActionsByTable(sessionId, ENTITY_NAMES.SpfModule),
    editActionsQueryService.getEditActionsByTable(sessionId, ENTITY_NAMES.DataPort),
    editActionsQueryService.getEditActionsByTable(sessionId, ENTITY_NAMES.ControlPort),
  ]);

// Tier 3 — apply per node
overlaidNodes = applyToCollection(baseNodes, nodeActions);
for (const node of overlaidNodes) {
  // overlay spfModule sub-row
  const smActions = spfModuleActions.filter(a => a.systemId === node.systemId);
  if (smActions.length > 0) { ... }
  // overlay ports (filtered by aggregateId = node.systemId)
  node.dataPorts    = applyToCollection(node.dataPorts,    portActions.filter(...));
  node.controlPorts = applyToCollection(node.controlPorts, ctrlPortActions.filter(...));
}
```

**DbDataLinkQueryService / DbControlLinkQueryService** — uses `applyLinkOverlayAndMap`
from `queries/shared/link-overlay-utils.ts`:

```typescript
// session resolved once by the caller and passed in
return applyLinkOverlayAndMap(baseLinks, ENTITY_NAMES.DataLink, session, editActionsQuerySvc, mapper);
// internally: getEditActionsByTable → applyToCollection → dedup by systemId → map
```

---

## 9. GET /usecases — Call Flow

```
GET /arc-api/v1/projects/{projectId}/usecases?filter=spfModuleInstanceId:0x7656 AND subgraphId:0x8978

──────────────────────────────────────────────────────
@arc/api  UseCaseController.getAllUsecases()
──────────────────────────────────────────────────────
1. parseInt(projectId) — invalid → 400
2. If filterExpression:
   a. FilterParser.parse(filterExpression) → FilterExpression
      Syntax error → 400
   b. USECASE_FILTER_SCHEMA.validate(expression)
      Unknown field / type mismatch → 400
3. new GetAllUseCasesQuery(projectId, expression | undefined, clientId)
4. queryBus.execute(query) → Result<UseCaseReadModel[]>
5. throwIfFailed(result)
6. return toApiResult(result)   → {data: UsecaseDto[], issues?}

──────────────────────────────────────────────────────
@arc/core  GetAllUseCasesHandler.handle()
──────────────────────────────────────────────────────
1. getFileIdByProjectId(projectId) → fileId
2. useCaseQueryService.getAllUseCases(fileId, query.filter)
3. return result as-is

──────────────────────────────────────────────────────
@arc/persistence  DbUseCaseQueryService.getAllUseCases()
──────────────────────────────────────────────────────
try {
  Step 1 — Build QueryBuilder:
    qb = createQueryBuilder('uc')
         .where('uc.fileSystemId = :fileId')
         .leftJoinAndSelect('uc.gkvEntries', 'gkv')
         .leftJoinAndSelect('gkv.valueDef', 'v')
         .leftJoinAndSelect('v.keys', 'k')
         .leftJoinAndSelect('uc.categories', 'cat')

  Step 2 — Apply filter:
    if filter: USECASE_FILTER_SCHEMA.apply(qb, filter, 'uc')
    → adds EXISTS subquery WHERE clauses

  Step 3 — Baseline load:
    joinedFields = getJoinedFieldNames(qb)
    baseRows     = await qb.getMany() as UseCaseRow[]

  Step 4 — Overlay (§8.1 three-tier pattern):
    session = findActiveSession(fileSystemId)             // tier 1
    if !session → return Result.ok(baseRows.map(mapToReadModel))

    usecaseActions = getEditActionsByTable(session.sessionId, ENTITY_NAMES.UseCase)
    if usecaseActions.length === 0                        // tier 2
      → return Result.ok(baseRows.map(mapToReadModel))

    overlaidRows = applyToCollection(baseRows, usecaseActions)  // tier 3
    for each row in overlaidRows:
      aggActions = getEditActionsByAggregateId(session.sessionId, row.systemId)
      gkvActions = aggActions.filter(tableName === ENTITY_NAMES.UsecaseGkvValues)
      if gkvActions.length > 0:
        row.gkvEntries = applyToCollection(row.gkvEntries, gkvActions)

    // overlay value_definitions + key_definitions via applyBatchOverlay
    allValueDefIds = overlaidRows.flatMap(r => r.gkvEntries.map(g => g.valueDefSystemId))
    if allValueDefIds.length > 0:
      overlaidRows = applyBatchOverlay(overlaidRows, allValueDefIds, session)

  Step 5 — Map + return:
    return Result.ok(overlaidRows.map(r => mapToReadModel(r)))

} catch (err) {
  return Result.fail(IssueFactory.dbError(err.message))
}
```

**DB queries issued:**
```
Q1 (always):     UseCase LEFT JOIN UsecaseGkvValues LEFT JOIN ValueDefinition
                   LEFT JOIN KeyDefinition LEFT JOIN UseCaseCategory
                   WHERE file_system_id = ?
                   [AND EXISTS (...)]   ← filter conditions if present
Q2 (always):     project_sessions WHERE file_system_id = ?
Q3 (if session): edit_actions WHERE session_id = ? AND valid_until IS NULL
```

---

## 10. POST /usecases/components/query — Call Flow

```
POST /arc-api/v1/projects/{projectId}/usecases/components/query
  Body: { systemIds: ["8388613", "8388614"] }

──────────────────────────────────────────────────────
@arc/api  UseCaseController.getComponents()
──────────────────────────────────────────────────────
1. body.systemIds empty/missing → 400
2. body.systemIds.map(parseInt) — NaN → 400
3. parseInt(projectId) — invalid → 400
4. new GetComponentsQuery(
     scope: {type: 'usecase', systemIds},
     projectId, clientId)
5. queryBus.execute(query) → Result<ComponentsReadModel>
6. throwIfFailed(result)
7. return toApiResult(result)   → {data: ComponentCollectionDto, issues?}

──────────────────────────────────────────────────────
@arc/core  GetComponentsHandler.handle()
──────────────────────────────────────────────────────
1. getFileIdByProjectId(projectId) → fileId
2. scope.type = 'usecase' → findInvalidUsecaseId(systemIds, fileId)
   → Result.fail if getAllUseCases fails
   → Result.fail(notFound) if any systemId is unknown
3. loadComponents() — composes individual services:
   spfModuleQueryService.findByUsecaseIds(systemIds, fileId)
   dataLinkQueryService.findByUsecaseIds(systemIds, fileId)
   controlLinkQueryService.findByUsecaseIds(systemIds, fileId)
4. return result as-is

──────────────────────────────────────────────────────
@arc/persistence  Individual query services
──────────────────────────────────────────────────────
DbSpfModuleQueryService.findByUsecaseIds():
  Step 1 — Baseline: Node INNER JOIN SpfModule
             INNER JOIN UseCaseSubgraph ON subgraph_system_id + usecase_system_id IN (?ids)
             LEFT JOIN ports + intents
  Step 2 — Overlay (§8.2 three-tier): nodeActions, spfModuleActions, portActions in parallel
  Step 3 — Dedup + map → SpfModuleReadModel[]

DbDataLinkQueryService.findByUsecaseIds():
  Step 1 — Baseline (parallel):
    DataLink INNER JOIN UseCaseSubgraph WHERE linkType = INTRA_SUBGRAPH
    DataLink INNER JOIN UseCaseSubgraphPair WHERE linkType = INTRA_USECASE
  Step 2 — applyLinkOverlayAndMap (§8.2)
  Step 3 — Dedup + map → DataLinkReadModel[]

DbControlLinkQueryService.findByUsecaseIds():
  Same pattern as DbDataLinkQueryService → ControlLinkReadModel[]
```

**DB queries issued (Q3–Q7 run in parallel):**
```
Q1 (always):     project_sessions WHERE file_system_id = ?
Q2 (if session): edit_actions WHERE session_id = ? AND valid_until IS NULL
Q3 (always):     Node INNER JOIN SpfModule
                   INNER JOIN UseCaseSubgraph ON subgraph_system_id + usecase_system_id IN (?)
                   LEFT JOIN ports + intents
Q4 (always):     DataLink INNER JOIN UseCaseSubgraph
                   WHERE linkType = INTRA_SUBGRAPH
Q5 (always):     DataLink INNER JOIN UseCaseSubgraphPair
                   WHERE linkType = INTRA_USECASE
Q6 (always):     ControlLink INNER JOIN UseCaseSubgraph
                   WHERE linkType = INTRA_SUBGRAPH
Q7 (always):     ControlLink INNER JOIN UseCaseSubgraphPair
                   WHERE linkType = INTRA_USECASE
```

---

## 11. Persistence Layer

### 11.1 DbUseCaseQueryService — changes

| | Before | After |
|---|---|---|
| `getAllUseCases` return | `Promise<UseCaseReadModel[]>` | `Promise<Result<UseCaseReadModel[]>>` |
| Filter | not supported | `filter?: FilterExpression` → applied via `USECASE_PARAM_FILTER` |
| Overlay entities | none | `use_cases`, `usecase_gkv_values`, `use_case_categories` (§8.1) |
| Key-value resolution | direct row mapping | ONE batched `keyValueDefQuerySvc.getKeyValueSummaryForGivenValues` call across all usecases |
| Constructor | `(dataSource)` | `(dataSource, editActionsQueryService, keyValueDefQueryService)` |
| `getAllComponentsForUseCases` | on this service | **deprecated** — kept for backward compat; new callers use individual services via the handlers |

**Overlay entities added during implementation (not in original design):**
- `use_case_categories` — category assignments can change per usecase in a session;
  overlaid via `getEditActionsByAggregateId(usecaseSystemId)` filtered to `ENTITY_NAMES.UseCaseCategory`

**Batched key-value resolution (implementation decision):**
- Instead of calling `getKeyValueSummaryForGivenValues` once per usecase (N calls),
  all `valueDefSystemIds` across all usecases are collected first, then ONE call is made.
  A lookup map is built from the result and each usecase resolves its GKV from the map.
  This follows the same batch pattern used by `DbSubgraphQueryService`.

### 11.2 Individual Link + Subsystem Services — new

| Service | File | What |
|---|---|---|
| `DbDataLinkQueryService` | `queries/link/db-data-link-query-service.ts` | `findByUsecaseIds` + `findBySubgraphId` with `applyOverlayAndMap` |
| `DbControlLinkQueryService` | `queries/link/db-control-link-query-service.ts` | same pattern as data links |
| `DbSubsystemQueryService` | `queries/subsystem/db-subsystem-query-service.ts` | `findAll` — subsystems + Node.parentId + filteredKeys + overlay |
| | | `findControlLinkSegmentsByUsecaseIds` — `subsystem_control_links` JOIN `control_links` + usecase scoping via `use_case_subgraph_pairs` + overlay via `getEditActionsByTable('SubsystemControlLink')` |
| | | `findDataLinkSegmentsByUsecaseIds` — same pattern against `subsystem_data_links` + overlay via `getEditActionsByTable('SubsystemDataLink')` |

`applyOverlayAndMap` private helper on each link service: applies `getEditActionsByTable` overlay,
deduplicates by `systemId`, maps row → read model.

### 11.2a DbComponentQueryService — **deleted**

`DbComponentQueryService` was deleted. All scoped loading is handled by the individual
services above. `buildSubsystemTree` moved to `@arc/core` as a pure function.

### 11.3 USECASE_PARAM_FILTER — new

`queries/usecase/usecase-param-filter.ts` — three registered fields
(`spfModuleInstanceId`, `subgraphId`, `containerId`).
Adding a new filterable field: one `.register()` call, no other changes.

**Naming note:** Originally called `USECASE_FILTER_SCHEMA` / `FilterSchema<T>` in the design.
Renamed during implementation:
- `FilterSchema<T>` → `ParamFilter<T>` (avoids confusion with TypeORM entity schema files)
- `FilterFieldDefinition` → `ParamFilterField`
- `USECASE_FILTER_SCHEMA` → `USECASE_PARAM_FILTER`
- File `filter-schema.ts` → `param-filter.ts`
- File `usecase-filter-schema.ts` → `usecase-param-filter.ts`

### 11.4 QueryServices wiring

```typescript
// typeorm-query-services.ts
this.useCaseQueryService     = new DbUseCaseQueryService(
  dataSource, editActionsQueryService, this.keyValueDefQueryService,
);
this.dataLinkQueryService    = new DbDataLinkQueryService(dataSource, editActionsQueryService);
this.controlLinkQueryService = new DbControlLinkQueryService(dataSource, editActionsQueryService);
this.subsystemQueryService   = new DbSubsystemQueryService(dataSource, editActionsQueryService);
// componentQueryService removed — replaced by the three individual services above
```

`DbUseCaseQueryService` receives `keyValueDefQueryService` to delegate GKV key-value
resolution + overlay. No RecursiveOverlayEngine — both services use `EditActionsQueryService`
directly with `applyToCollection` from `overlay-merge.ts`.

---

## 12. Folder Structure

```
packages/core/src/

  shared/
    filter/                                    ← new (alongside shared/issues/, shared/errors/)
      filter-expression.ts                     FilterExpression type + FilterValue union
      filter-parser.ts                         FilterParser — string → FilterExpression
      index.ts

  application/
    ports/persistence/query-services/

    component/                               ← read models only (ComponentQueryService removed)
        components-read-model.ts               ComponentsReadModel
        components-with-subsystems-read-model.ts  ComponentsWithSubsystemsReadModel + SubsystemNodeReadModel
        data-link-read-model.ts               extends base + subgraph fields
        control-link-read-model.ts            extends base + subgraph fields

      link/                                    ← new (alongside usecase/, spf-module/)
        data-link-query-service.ts             DataLinkQueryService port
        control-link-query-service.ts          ControlLinkQueryService port

      subsystem/                               ← new
        subsystem-query-service.ts             SubsystemQueryService port
        subsystem-read-model.ts               SubsystemReadModel (systemId, name, parentId?, filteredKeys[])

      usecase/
        usecase-query-service.ts              updated — filter?: FilterExpression, Result<T> return

    usecase-designer/usecase/
      get-all/
        get-all-usecases.query.ts             updated — filter?: FilterExpression
        get-all-usecases.handler.ts           updated — pass filter through, explicit return type
      get-components/
        component-scope-type.ts               COMPONENT_SCOPE_TYPE const + ComponentScopeType
        get-components.query.ts               updated — ComponentFlatScope
        get-components.handler.ts             updated — validates usecase IDs, composes 3 services
        get-components-with-subsystems.query.ts   ComponentSubsystemScope (usecase only)
        get-components-with-subsystems.handler.ts validates IDs, composes 4 services + buildSubsystemTree
        build-subsystem-tree.ts               NEW — pure function, no DB access


packages/infrastructure/persistence/src/.../

  queries/
    shared/
      param-filter.ts                          ParamFilter<T> + ParamFilterField
      link-overlay-utils.ts                    applyLinkOverlayAndMap + deduplicateAndMap
                                               (shared by DbDataLinkQueryService and
                                               DbControlLinkQueryService to avoid duplicating
                                               overlay + dedup + map pattern)

    usecase/
      db-usecase-query-service.ts              updated — Result<T>, filter, overlay (usecase + GKV + categories)
      usecase-param-filter.ts                  USECASE_PARAM_FILTER
      usecase-query-mappers.ts                 updated — new mappers for SpfModuleReadModel + link models

    link/                                      ← new
      db-data-link-query-service.ts            findByUsecaseIds + findBySubgraphId + applyOverlayAndMap
      db-control-link-query-service.ts         same pattern

    subsystem/                                 ← new
      db-subsystem-query-service.ts            findAll + overlay + Node.parentId lookup

    spf-module/
      db-spf-module-query-service.ts           extended — findByUsecaseIds (overlay-aware), findBySubgraphId

    component/                                 ← db service deleted
      (db-component-query-service.ts deleted)

    typeorm-query-services.ts                  added dataLinkQueryService, controlLinkQueryService,
                                               subsystemQueryService; removed componentQueryService


packages/api/src/presentation/rest/modules/
  usecase/
    usecase.controller.ts                      updated — FilterParser, COMPONENT_SCOPE_TYPE,
                                               GetComponentsWithSubsystemsQuery, recursive DTO mapper
  subgraph/
    subgraph.controller.ts                     updated — QueryBus injected,
                                               getComponentsForSubgraph implemented
```

### Implementation Notes

The following were added or changed during implementation relative to the original design,
or are noted here to address reviewer questions on the initial draft.

**1. Category overlay** — `use_case_categories` overlay was missing from the original §8.1 design.
Added to the per-usecase loop alongside GKV overlay using `ENTITY_NAMES.UseCaseCategory`.

**2. Batched GKV resolution** — Original design called `getKeyValueSummaryForGivenValues` once per usecase.
Implementation collects all `valueDefSystemIds` across all usecases first, makes ONE call, builds
a lookup map, and resolves per usecase from the map — no N+1.

**3. `SpfModuleReadModel` not `ModuleReadModel`** — `DbSpfModuleQueryService` uses the current
`SpfModuleReadModel` (has `subgraphId`, `containerId` as direct scalars). The old `ModuleReadModel`
in `usecase/query-models/` has nested `subgraph.systemId` / `container.systemId` — kept only
for backward compat in the deprecated `getAllComponentsForUseCases`.

**4. Extended link read models** — `DataLinkReadModel` and `ControlLinkReadModel` in `component/`
extend the old base models by adding `sourceSubgraphSystemId` + `destSubgraphSystemId`. Old models
in `usecase/query-models/` are unchanged.

**5. `RecursiveOverlayEngine` not used** — Confirmed during implementation. All overlay uses
`applyToCollection`, `getEditActionsByTable`, `getEditActionsByAggregateId` from existing utilities.

**6. Parallel execution (review comment #3)** — Module and link QueryBuilders in `getComponentsForUsecases`
run inside `Promise.all([loadModules(...), loadDataLinks(...), loadControlLinks(...)])`. The DB queries
section description "Q3–Q7 run in parallel" is correct — the pseudocode steps are logically sequential
but the actual implementation wraps them in a single `Promise.all`.

**7. Port migration — `getAllComponentsForUseCases` (review comment #6)** — The method is marked
`@deprecated` on `UseCaseQueryService` and its implementation kept for backward compat. Migration path:
(a) all new callers use `ComponentQueryService.getComponentsForUsecases`; (b) once no callers remain,
delete `getAllComponentsForUseCases` from both the port interface and `DbUseCaseQueryService`.

**8. `GetComponentsQuery` breaking change (review comment #7)** — Constructor changed from
`(useCaseSystemIds, clientId, projectId?)` to `(scope: ComponentFlatScope, projectId, clientId)`.
All call sites updated: `usecase.controller.ts` is the only caller and was updated in this LLD.

**9. `UseCaseComponentsReadModel` → `ComponentsReadModel` (review comment #8)** — The old class-based
`UseCaseComponentsReadModel` is replaced by the `ComponentsReadModel` interface from `component/`.
Affected files updated: `GetComponentsHandler`, `GetComponentsQuery`, `usecase.controller.ts`,
`usecase-query-mappers.ts`. `UseCaseComponentsReadModel` retained only in the deprecated
`getAllComponentsForUseCases` path.

**10. STAGED-only filter (review comment #9)** — `EditActionsQueryService.getEditActionsByTable` and
`getEditActionsByAggregateId` both filter `valid_until IS NULL`. The `STAGED` constraint
(`change_status = 'STAGED'`) can be passed via `EditActionsQueryOptions.changeStatus`. In the current
implementation the overlay methods do not pass an explicit `changeStatus` option — they rely on
the application invariant that only `STAGED` actions exist for active sessions. If `UNSTAGED` actions
are introduced in future, an explicit `{changeStatus: 'STAGED'}` option must be added to all
`getEditActions*` calls in the overlay flow.

**11. fileSystemId in component QueryBuilders (review comment #11)** — Module QueryBuilders join
through `use_case_subgraphs WHERE usecase_system_id IN (ids)`. The `usecase_system_id` values come
from the request body which is project-scoped (the handler first resolves `projectId → fileSystemId`).
usecase `systemId` values are globally unique across the installation (auto-incremented DB PK) — no
two files share the same usecase `systemId`. A redundant `file_system_id` guard on the UseCase entity
would be technically safe but is not required for correctness.

**13. Code review simplifications (post-implementation)**

- `applyLinkOverlayAndMap` + `deduplicateAndMap` extracted to `queries/shared/link-overlay-utils.ts`,
  eliminating copy-pasted overlay+dedup+map in `DbDataLinkQueryService` and `DbControlLinkQueryService`.
  The session is now resolved once by the caller and passed in, avoiding a second `findActiveSession` call.
- `DbSubsystemQueryService` — removed a redundant second DB call by extracting `parentId` directly
  from the main JOIN via `getRawAndEntities()`.
- `DbSpfModuleQueryService.findByUsecaseIds` — overlay steps extracted to `applyUsecaseSubgraphOverlay`
  private method; all three overlay calls (`UseCaseSubgraph`, `SpfModule CREATE`, `Node DELETE`) now run
  in `Promise.all` rather than sequentially.
- `DbUseCaseQueryService.getAllUseCases` — per-row overlay loop body extracted to `applyRowOverlay`;
  per-node overlay extracted to `overlayNodeAndPorts` to reduce cognitive complexity.
- `GetComponentsHandler` — validation and flat-component-loading extracted to `findInvalidUsecaseId`
  and `loadComponents` private methods to reduce cognitive complexity.
by `systemId` using a `Set<number>` — `seen.add(item.systemId)` returns `false` if already seen,
`filter` removes the duplicate. Consistent with the dedup pattern in `DbSubgraphQueryService` and
`DbSpfModuleQueryService`.

---

*End of Document*
