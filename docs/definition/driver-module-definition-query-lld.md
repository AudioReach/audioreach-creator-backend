<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Driver Module Definition Query APIs — Design Document

## Document Information

- **Version**: 1.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `GET /arc-api/v1/projects/{projectId}/driver-module-definitions`
  - `GET /arc-api/v1/projects/{projectId}/driver-module-definitions/{moduleSystemId}`

**Note on build state**: this document describes the target design. `ModuleDefinitionController.getAllDriverModuleDefinitions`/`getDriverModuleDefinition` are both `NotImplementedException` stubs today. No query service or read model exists yet for driver module definitions — this is new work, not a revival of anything lost.

---

## Table of Contents

1. [Scope and Requirements](#1-scope-and-requirements)
2. [Controller Layer](#2-controller-layer)
3. [Interfaces and Read Models](#3-interfaces-and-read-models)
4. [Call Flow](#4-call-flow)
5. [Error Handling](#5-error-handling)
6. [Known Schema Gaps](#6-known-schema-gaps)
7. [Folder Structure](#7-folder-structure)

---

## 1. Scope and Requirements

Read-only query implementation for driver module definitions. Two `GET` endpoints only. No write or delete operations are in scope.

Driver modules are system-level modules that interface with hardware drivers. `DriverModuleDefinition` has no processor linkage, no container-type linkage, and no port/intent structure — it is a simple entity: identity fields plus a flat list of parameter definitions.

### 1.1 Functional requirements

**FR-1 — List driver module definitions**

`GET /arc-api/v1/projects/{projectId}/driver-module-definitions`

- Returns all driver module definitions belonging to the project.
- Response is always an array. An empty array is a valid response. One array element per module definition row (one `systemId` per element).
- Accepts two optional query parameters — `moduleDefinitionId`, `parameterId` — both natural ACDB IDs (not system IDs). When both are provided, they combine with AND semantics (a module definition must match both to be included).
  - `moduleDefinitionId` matches the module definition's own natural ID (`DriverModuleDefinition.moduleDefinitionId`).
  - `parameterId` matches module definitions that have at least one parameter with that natural ID (`parameterId` on `DriverModuleParameterDefinition`).
  - Returns an empty array if a filter (or combination) matches nothing — never 404 for a missing filter value.
- Returns HTTP 404 if the project does not exist.
- Every response item always includes the same full field set — there is no opt-in flag and no reduced summary shape. See §2.3 for the field list and sources.

**FR-2 — Get driver module definition by system ID**

`GET /arc-api/v1/projects/{projectId}/driver-module-definitions/{moduleSystemId}`

- Returns a single driver module definition identified by its system ID.
- Returns HTTP 404 if the project does not exist or the module definition is not found.
- Response shape is identical to a single item from the FR-1 list response — no additional fields beyond what FR-1 already returns.

**FR-3 — Project scoping**

Both endpoints return only module definitions that belong to the given project. A request for a module definition that exists but belongs to a different project must return 404, not the data. Scoping follows the established `projectId → fileSystemId` pattern (`ProjectQueryService.getFileIdByProjectId`, filtering by `file_system_id`).

**FR-4 — Error conditions**

| Condition | HTTP response |
|---|---|
| Project does not exist | 404 |
| Module definition not found (FR-2) | 404 |
| `moduleDefinitionId` / `parameterId` filter (or combination) matches nothing (FR-1) | 200 with empty array |

Full error-table breakdown by layer (controller/handler/service) is in §5.

### 1.2 Known schema gaps this design must account for

`DriverModuleDefinitionResponseDto` extends `BaseModuleDefinitionDto`, and `ParameterDefinitionSummaryInfo` is the shared parameter-summary DTO — both classes are also used by SPF module definitions. Several of their fields are not currently live TypeScript fields at all: they exist only as commented-out `@ApiProperty` stubs (marked `// TODO(schema): ...`) on the shared DTO classes, pending a backing column. This design's scope includes uncommenting/adding these fields on the shared DTOs, not just adding the DB columns — see §6 for the full breakdown and the noted-for-later column additions. Summary:

- **`BaseModuleDefinitionDto`** (`displayName` is a live field; `deprecated` is commented out on the class, shared with SPF)
- **`ParameterDefinitionSummaryInfo`** (embedded, per parameter, shared with SPF): `isHidden`, `deprecated` are commented out; `isReadOnly`, `toolPolicy`, `pidType` are live fields but have no backing column/value on the driver side (§6.2)

For driver module definitions specifically:
- `displayName` — live DTO field, but not persisted: computed by `DriverModuleDefinitionBuilder.createModuleDefinition` at ingestion time but dropped before reaching a DB column (§6.1).
- `deprecated` (module-level) — not a live DTO field yet (commented out on `BaseModuleDefinitionDto`); also has no domain/schema backing on the driver side at all (§6.1).
- `isHidden`, `deprecated` (parameter-level) — not live DTO fields yet (commented out on `ParameterDefinitionSummaryInfo`); also absent from `DriverModuleParameterDefinition`/schema entirely (§6.2).
- `isReadOnly`, `toolPolicy`, `pidType` (parameter-level) — live DTO fields, but the driver-side AWSP source (`AwspParamDefinition`, shared with SPF) already carries `isReadOnly`/`toolPolicies`/`pidType` and `DriverModuleDefinitionBuilder.buildParameterDefinitions` simply never reads them onto `DriverModuleParameterDefinition` (§6.2). `toolPolicy`'s DTO shape itself is a separate, already-tracked issue — see §6.2's note.

This design's read models (§3.1) include all of these fields as optional/nullable so the DTO shape is honored end-to-end, but the query service returns `undefined`/`false` defaults for all of them until the gaps in §6 are closed. Closing them — including uncommenting the pending DTO fields — is an implementation-phase concern, not resolved by this document.

Two additional fields are persisted end-to-end today but exposed by no DTO at all (`groupName` on the module, `maxSize`/`paramStructure` on parameters) — these are out of scope for this design and tracked separately; see `driver-module-definition-follow-ups.md`.

---

## 2. Controller Layer

### 2.1 Endpoints

Both routes live on the existing `ModuleDefinitionController` (`packages/api/src/presentation/rest/modules/definition/module-definition/module-definition.controller.ts`).

| Method | Route | Handler method |
|---|---|---|
| GET | `/arc-api/v1/projects/:projectId/driver-module-definitions` | `getAllDriverModuleDefinitions` |
| GET | `/arc-api/v1/projects/:projectId/driver-module-definitions/:moduleSystemId` | `getDriverModuleDefinition` |

### 2.2 Request

**List endpoint** — `getAllDriverModuleDefinitions`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` before dispatch |
| `moduleDefinitionId` | query | `string` | no | Natural `DriverModuleDefinition.moduleDefinitionId`. Converted to `number`. |
| `parameterId` | query | `string` | no | Natural `parameterId` on any linked parameter. Converted to `number`. |

**Get-by-id endpoint** — `getDriverModuleDefinition`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` |
| `moduleSystemId` | path | `string` | yes | DB system ID. Converted to `number`. |

### 2.3 Response DTOs

**`DriverModuleDefinitionResponseDto`** (extends `BaseModuleDefinitionDto`, existing DTO — currently an empty subclass with no fields of its own, `dto/driver-module-definition-response.dto.ts`) — used by FR-1 (array) and FR-2 (single item):

| DTO field | Type | Source (ReadModel field, §3.1) | Notes |
|---|---|---|---|
| `systemId` | `string` | `DriverModuleDefinitionSummaryReadModel.systemId` (number → string) | |
| `moduleId` | `number` | `.moduleId` | |
| `name` | `string` | `.name` | |
| `displayName` | `string` | `.displayName` | **Not persisted — see §6.1.** Live DTO field. Domain entity (`DriverModuleDefinition`) computes this at ingestion time (`awspDef.displayName || awspDef.name`) but the bulk inserter never writes it to a column, so it doesn't survive to the DB. |
| `description` | `string` | `.description` | |
| `paramDefinitionsSummaryInfo` | `ParameterDefinitionSummaryInfo[]` | `.parameterDefinitions` (each mapped, §2.3.1) | |
| `deprecated` | `boolean` (optional) | `.deprecated` | **Not a live DTO field yet — see §6.1.** Currently a commented-out `@ApiProperty` stub on `BaseModuleDefinitionDto` (shared with SPF); also no domain/schema backing on the driver side. |

**2.3.1 `ParameterDefinitionSummaryInfo`** (existing DTO, `info/parameter-definition-summary-info.ts`, shared with SPF):

| DTO field | Type | Source (ReadModel field) | Notes |
|---|---|---|---|
| `systemId` | `string` | `DriverParameterDefinitionSummaryReadModel.systemId` | |
| `paramId` | `number` | `.paramId` | |
| `name` | `string` | `.name` | |
| `description` | `string` | `.description` | |
| `isHidden` | `boolean` | `.isHidden` | **Not a live DTO field yet — see §6.2.** Commented-out `@ApiProperty` stub on `ParameterDefinitionSummaryInfo`; also absent from `DriverModuleParameterDefinition`/schema entirely. |
| `isReadOnly` | `boolean` | `.isReadOnly` | **Not persisted — see §6.2.** Live DTO field; `DriverModuleDefinitionBuilder.buildParameterDefinitions` never reads `awspParam.isReadOnly` onto the domain entity. |
| `deprecated` | `boolean` (optional) | `.deprecated` | **Not a live DTO field yet — see §6.2.** Commented-out stub, same as `isHidden`. |
| `toolPolicy` | `ToolPolicy` | `.toolPolicy` | **Not persisted, and DTO shape itself pending correction — see §6.2.** Live DTO field; builder never reads `awspParam.toolPolicies` onto the domain entity. |
| `pidType` | `PidType` | `.pidType` | **Not persisted — see §6.2.** Live DTO field; builder never reads `awspParam.pidType` onto the domain entity. |

---

## 3. Interfaces and Read Models

### 3.1 Read models (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/driver-module-definition/` (new folder)

```typescript
// driver-module-definition-read-model.ts

export interface DriverParameterDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly paramId: number;
  readonly name?: string;
  readonly description?: string;
  readonly isHidden?: boolean;    // not persisted yet — see LLD §6; always undefined until schema gap closes
  readonly isReadOnly?: boolean;  // not persisted yet
  readonly deprecated?: boolean;  // not persisted yet
  readonly toolPolicy?: string;   // not persisted yet
  readonly pidType?: string;      // not persisted yet
}

export interface DriverModuleDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly moduleId: number;
  readonly name: string;
  readonly displayName?: string;  // not persisted yet — see LLD §6
  readonly description?: string;
  readonly parameterDefinitions: DriverParameterDefinitionSummaryReadModel[];
  readonly deprecated?: boolean;  // not persisted yet
}
```


### 3.2 Query service port (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/driver-module-definition/driver-module-definition-query-service.ts` (new file)

```typescript
export interface DriverModuleDefinitionQueryService {
  /**
   * Returns all driver module definitions for the file, filtered by any
   * combination of moduleDefinitionId/parameterId (AND semantics). Empty
   * array if nothing matches. Overlay always applied.
   */
  getAllDriverModuleDefinitions(
    fileSystemId: number,
    filters: {
      moduleDefinitionId?: number;
      parameterId?: number;
    },
  ): Promise<Result<DriverModuleDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single driver module definition by system ID.
   * Result.fail with ENTITY_NOT_FOUND if absent from DB and session.
   */
  getDriverModuleDefinition(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<DriverModuleDefinitionSummaryReadModel>>;
}
```

Both methods return `Result<T>` since the underlying DB query and overlay steps here are a single fixed-shape batch and any unexpected failure should be distinguishable from "no rows matched a filter."

### 3.3 Registration in `QueryServices`

**File**: `packages/core/src/application/ports/persistence/query-services/query-services.ts`

```typescript
export interface QueryServices {
  // ... existing services ...
  readonly driverModuleDefinitionQueryService: DriverModuleDefinitionQueryService; // NEW
}
```

### 3.4 Query classes (`@arc/core`)

**Location**: `packages/core/src/application/definition/driver-module-definition/`

```typescript
// get-all/get-all-driver-module-definitions.query.ts
export class GetAllDriverModuleDefinitionsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly moduleDefinitionId: number | undefined,
    public readonly parameterId: number | undefined,
    clientId: string,
  ) {
    super(clientId);
  }
}

// get-one/get-driver-module-definition.query.ts
export class GetDriverModuleDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly moduleSystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 3.5 Handler interfaces (`@arc/core`)

```typescript
// GetAllDriverModuleDefinitionsHandler implements QueryHandler<
//   GetAllDriverModuleDefinitionsQuery,
//   Promise<DriverModuleDefinitionSummaryReadModel[]>
// >

// GetDriverModuleDefinitionHandler implements QueryHandler<
//   GetDriverModuleDefinitionQuery,
//   Promise<DriverModuleDefinitionSummaryReadModel>
// >
```

Both handlers unwrap the `Result` returned by the query service — `isFailure` on the get-by-id path maps to `ResourceNotFoundException`; on the list path, `isFailure` indicates a genuine unexpected error (not "no matches", which is `Result.ok([])`) and propagates as-is.

---

## 4. Call Flow

### 4.1 `GET /driver-module-definitions` — list (FR-1)

```
ModuleDefinitionController.getAllDriverModuleDefinitions
  IN:  projectId (string), moduleDefinitionId?/parameterId? (string)
  OUT: ApiResult<DriverModuleDefinitionResponseDto[]>
  │
  │  parse projectId → number; parse each provided filter → number
  │  dispatch GetAllDriverModuleDefinitionsQuery
  ▼
GetAllDriverModuleDefinitionsHandler.handle
  IN:  GetAllDriverModuleDefinitionsQuery(projectId, moduleDefinitionId?, parameterId?)
  OUT: DriverModuleDefinitionSummaryReadModel[]
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId)
  │     → fileSystemId; throws ResourceNotFoundException if project missing
  │
  │  2. driverModuleDefinitionQueryService.getAllDriverModuleDefinitions(fileSystemId, filters)
  │     → Result<DriverModuleDefinitionSummaryReadModel[]>
  │     → isFailure → propagate (no ENTITY_NOT_FOUND case here — empty-match is a valid 200)
  ▼
DbDriverModuleDefinitionQueryService.getAllDriverModuleDefinitions
  IN:  fileSystemId, filters
  OUT: Result<DriverModuleDefinitionSummaryReadModel[]>
  │
  │  ── No active session ────────────────────────────────────────────
  │  Query driver_module_definitions WHERE file_system_id = fileSystemId
  │  LEFT JOIN driver_module_parameter_definitions for paramDefinitionsSummaryInfo/parameterId filter
  │  [Filter by moduleDefinitionId/parameterId if provided — AND semantics]
  │  → Result.ok([]) if no rows match a filter combination
  │  → Result.ok(DriverModuleDefinitionSummaryReadModel[])
  │
  │  ── Active session ───────────────────────────────────────────────
  │  Same base query, then apply overlay (ADD / UPDATE / DELETE), one
  │  getEditActionsByTable call per table (driver_module_parameter_definitions,
  │  driver_module_definitions) — same table-wide batching pattern as
  │  DbKeyValueDefQueryService.overlayAllKeyDefinitions
  │  [Filter by moduleDefinitionId/parameterId if provided, after overlay]
  │  → Result.ok(DriverModuleDefinitionSummaryReadModel[])
  ▼
Controller
  IN:  DriverModuleDefinitionSummaryReadModel[]
  OUT: ApiResult<DriverModuleDefinitionResponseDto[]>
  │
  │  map → DriverModuleDefinitionResponseDto[]
```

### 4.2 `GET /driver-module-definitions/{moduleSystemId}` — get by id (FR-2)

Same shape as §4.1, singular: `getDriverModuleDefinition(moduleSystemId, fileSystemId)` → `Result<DriverModuleDefinitionSummaryReadModel>`; `isFailure` (including `ENTITY_NOT_FOUND`) → handler throws `ResourceNotFoundException` → 404.

---

## 5. Error Handling

### 5.1 Error table — by layer (FR-4)

| Layer | Condition | Behaviour |
|---|---|---|
| **Controller** | `projectId` not parseable as number | `400 Bad Request` |
| **Controller** | `moduleSystemId` not parseable as number (FR-2) | `400 Bad Request` |
| **Controller** | `moduleDefinitionId`/`parameterId` not parseable as number (FR-1) | `400 Bad Request` |
| **Handler** | `getFileIdByProjectId` throws | `ResourceNotFoundException` → 404 |
| **Handler (get-by-id, FR-2)** | `getDriverModuleDefinition` returns `Result.fail(ENTITY_NOT_FOUND)` | `ResourceNotFoundException` → 404 |
| **Service (list, FR-1)** | Filter (or combination) matches nothing | `Result.ok([])` → controller returns `200` with empty array |
| **Service** | Any unexpected DB error | `Result.fail(...)` (get-by-id) or propagates uncaught → `AllExceptionsFilter` → 500 |

---

## 6. Known Schema Gaps

The following fields are required by the response DTOs (§2.3) but have no corresponding column on `driver_module_definitions` or `driver_module_parameter_definitions` today, and in some cases aren't even live fields on the shared DTO classes yet. This is noted for future reference and implementation — **closing these gaps is explicitly out of scope for this design** and is deferred to a follow-up implementation task.

### 6.1 `DriverModuleDefinitionResponseDto` gaps

| Field | Current state | Proposed fix |
|---|---|---|
| `displayName` | Live DTO field (on `BaseModuleDefinitionDto`). Computed on the domain entity at ingestion (`DriverModuleDefinitionBuilder.createModuleDefinition`: `awspDef.displayName \|\| awspDef.name`) but dropped by `DriverModuleDefinitionInserter` — never written to a DB column. The value exists in memory during ingestion, just never persisted. | Add `display_name` (`varchar`, nullable) to `driver_module_definitions`. Requires one line in `DriverModuleDefinitionInserter.insertDriverModuleDefinitions`'s row mapping — the value is already computed, just needs to flow through. |
| `deprecated` | Not a live field — currently a commented-out `@ApiProperty` stub on `BaseModuleDefinitionDto` (shared with SPF, same stub). Also not present anywhere past the AWSP-parsed source (`BaseModuleDefinition.deprecated`) — `DriverModuleDefinitionInit`/`DriverModuleDefinition` domain entity has no field for it at all. | Uncomment the DTO field, then add `deprecated` (`boolean`, nullable, no default) to `driver_module_definitions`. Requires adding the field to `DriverModuleDefinitionInit`/`DriverModuleDefinition`, threading it through `DriverModuleDefinitionBuilder`, and the inserter's row mapping. |

### 6.2 `ParameterDefinitionSummaryInfo` gaps (driver module parameters)

`ParameterDefinitionSummaryInfo` is shared with SPF module definitions, so two of these rows are shared gaps, not driver-specific ones:

| Field | Current state | Proposed fix |
|---|---|---|
| `isHidden` | Not a live field — commented-out `@ApiProperty` stub, shared with SPF. Present on AWSP-parsed source (`AwspParamDefinition.isHidden`) but not on `DriverModuleParameterDefinitionInit`/`DriverModuleParameterDefinition` domain entity at all. | Uncomment the shared DTO field (tracked jointly with SPF's identical gap — see `spf-module-definition-query-lld.md` §1.2), then add `is_hidden` (`boolean`, nullable) to `driver_module_parameter_definitions`. |
| `isReadOnly` | Live DTO field. Present on AWSP-parsed source (`AwspParamDefinition.isReadOnly`) but not carried onto the domain entity — `DriverModuleDefinitionBuilder.buildParameterDefinitions` never reads it. | Add `is_read_only` (`boolean`, nullable) to `driver_module_parameter_definitions`. |
| `deprecated` | Not a live field — commented-out `@ApiProperty` stub, shared with SPF. Same AWSP source situation as `isHidden`. | Uncomment the shared DTO field (tracked jointly with SPF), then add `deprecated` (`boolean`, nullable) to `driver_module_parameter_definitions`. |
| `toolPolicy` | Live DTO field, but its shape is already flagged as broken independent of the driver-specific persistence gap: `ToolPolicy` (`enums/tool-policy.emum.ts`) has combined enum values (`CALIBRATION_AND_RTC`, `CALIBRATION_AND_RTC_READONLY`) that don't match the domain's real 6-value array-typed `ToolPolicy` (`TOOL_POLICY` in `domain/entities/definitions/common/types/tool-policy-type.ts`). This is the same DTO-shape correction already tracked by `spf-module-definition-query-lld.md` §1.2/§2.3.1 (`toolPolicy` → `toolPolicies: ToolPolicy[]`) — `ParameterDefinitionSummaryInfo` is one shared DTO used by both. Driver inherits whichever shape that correction lands on; this document does not make an independent decision. Separately, AWSP-parsed source has `toolPolicies: AwspToolPolicy[]` (array, mandatory) which is not carried onto the driver domain entity at all — `buildParameterDefinitions` never reads it. | Once SPF's `toolPolicy` → `toolPolicies` DTO correction lands, add a matching column/mapping on the driver side and thread `awspParam.toolPolicies` through `DriverModuleParameterDefinitionInit`/`DriverModuleParameterDefinition`/builder/inserter. |
| `pidType` | Live DTO field. AWSP-parsed source has `pidType: AwspPidType` (mandatory) — not carried onto the domain entity at all; `buildParameterDefinitions` never reads it. | Add `pid_type` (`varchar`, nullable) to `driver_module_parameter_definitions`, thread `awspParam.pidType` through the domain entity/builder/inserter. |

For the three fields with no domain/schema backing at all (`isReadOnly`, `toolPolicy`'s persistence half, `pidType`), note that unlike `displayName` (computed but dropped only at the inserter step), these never reach the domain entity in the first place — `DriverModuleDefinitionBuilder.buildParameterDefinitions` doesn't read `awspParam.isReadOnly`/`.toolPolicies`/`.pidType` off the AWSP source at all when constructing `DriverModuleParameterDefinition`. Closing this gap requires changes at three layers: domain entity (`DriverModuleParameterDefinitionInit`), entity builder (`buildParameterDefinitions`), and schema/inserter — not just the schema. `isHidden`/`deprecated` additionally require uncommenting the shared DTO stub first, coordinated with SPF.

### 6.3 Read model behavior until the gap is closed

Until the above columns exist (and, for `isHidden`/`deprecated`, until the shared DTO stubs are uncommented), `DriverModuleDefinitionSummaryReadModel.displayName`/`.deprecated` and `DriverParameterDefinitionSummaryReadModel.isHidden`/`.isReadOnly`/`.deprecated`/`.toolPolicy`/`.pidType` are always `undefined` when the query service maps rows to read models — there's nothing in the row to read. The DTO mapper (§2.3) should map these straight through as optional/absent, not synthesize a placeholder value.

### 6.4 Out-of-scope persisted-but-unexposed fields

Two further fields are fully persisted today (schema column + inserter writes a value) but are not part of this design's response shape at all, and are not part of the schema gaps above. They're tracked separately in `driver-module-definition-follow-ups.md`:

- `groupName` (module-level) — column and inserter mapping exist, but no AWSP source field populates it and no DTO exposes it.
- `maxSize`/`paramStructure` (parameter-level) — populated from AWSP today, but `ParameterDefinitionSummaryInfo` doesn't expose either; likely belongs to a future full-detail endpoint rather than this summary query API.

---

## 7. Folder Structure

```
packages/core/src/application/
  ports/persistence/query-services/
    query-services.ts                                    ← MODIFY: add driverModuleDefinitionQueryService
    driver-module-definition/
      driver-module-definition-query-service.ts          ← NEW: port interface
      driver-module-definition-read-model.ts             ← NEW: read models

  definition/
    driver-module-definition/
      get-all/
        get-all-driver-module-definitions.query.ts       ← NEW
        get-all-driver-module-definitions.handler.ts     ← NEW
      get-one/
        get-driver-module-definition.query.ts            ← NEW
        get-driver-module-definition.handler.ts          ← NEW

  orchestration/cqrs/registries/
    query-handler-registry.ts                             ← register both handlers

packages/infrastructure/persistence/src/
  persistence-typeorm-sqllite/queries/
    driver-module-definition/
      db-driver-module-definition-query-service.ts        ← NEW: DB implementation

  persistence-typeorm-sqllite/queries/
    typeorm-query-services.ts                              ← wire DbDriverModuleDefinitionQueryService

packages/api/src/presentation/rest/modules/definition/module-definition/
  module-definition.controller.ts                          ← MODIFY: replace 2 NotImplementedException stubs
```

**Not touched by this design** (tracked in §6 as follow-up implementation work):
- `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-definition.schema.ts` — new `display_name`/`deprecated` columns
- `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.ts` — new `is_hidden`/`is_read_only`/`deprecated`/`tool_policy`/`pid_type` columns
- `packages/core/src/domain/entities/definitions/driver-module/driver-module-definition.ts` / `driver-module-parameter-definition.ts` — new fields on `*Init` interfaces and entity classes
- `packages/core/src/application/file-operations/upload-file/services/entity-builders/driver-module-definition-builder.ts` — populate new fields from AWSP source
- `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/driver-module-definition/driver-module-definition.inserter.ts` — include new fields in row mapping
- `packages/api/src/presentation/rest/modules/definition/module-definition/dto/base-module-definition.dto.ts` / `info/parameter-definition-summary-info.ts` — uncomment pending `deprecated`/`isHidden` stubs (coordinate with SPF, which shares these DTOs)

See also `driver-module-definition-follow-ups.md` for the two persisted-but-unexposed fields (`groupName`, `maxSize`/`paramStructure`) this design deliberately leaves out of the response shape (§6.4).
