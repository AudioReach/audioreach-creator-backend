<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# SPF Module Definition Query APIs — Design Document

Requirements: [2026-07-08-spf-module-definition-query-requirements.md](2026-07-08-spf-module-definition-query-requirements.md)

## Document Information

- **Version**: 1.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `GET /arc-api/v1/projects/{projectId}/spf-module-definitions`
  - `GET /arc-api/v1/projects/{projectId}/spf-module-definitions/{moduleSystemId}`
  - `GET /arc-api/v1/projects/{projectId}/spf-module-definitions/{moduleSystemId}/custom-module-metadata`

**Note on build state**: this document describes the target design. `ModuleDefinitionController`'s three endpoints are all `NotImplementedException` stubs today, and the `SpfModuleDefinition` domain entity/schema, `DbSpfModuleDefinitionQueryService`, and the `module_manager_data` query wiring described in §1.2/§2.3.3 do not currently exist in the persistence/core layers — only the API-layer DTOs, enums, and controller stub survive. Nothing below should be read as "already built."

---

## Table of Contents

1. [Scope and Requirements](#1-scope-and-requirements)
2. [Controller Layer](#2-controller-layer)
3. [Interfaces and Read Models](#3-interfaces-and-read-models)
4. [Call Flow](#4-call-flow)
5. [Error Handling](#5-error-handling)
6. [Open Questions](#6-open-questions)
7. [Folder Structure](#7-folder-structure)

---

## 1. Scope and Requirements

Read-only query implementation for SPF module definitions and their custom module metadata. Three `GET` endpoints only.

### 1.1 Functional requirements

**FR-1 — List SPF module definitions**

`GET /arc-api/v1/projects/{projectId}/spf-module-definitions`

- Returns all SPF module definitions belonging to the project.
- Response is always an array. An empty array is a valid response. One array element per module definition row (one `systemId` per element).
- Accepts three optional query parameters — `processorId`, `moduleDefinitionId`, `parameterId` — all natural ACDB IDs (not system IDs). When more than one is provided, they combine with AND semantics (a module definition must match all provided filters to be included).
  - `processorId` matches module definitions linked to a processor with that natural ID (`ProcessorDefinition.processorId`).
  - `moduleDefinitionId` matches the module definition's own natural ID (`SpfModuleDefinition.moduleDefinitionId`).
  - `parameterId` matches module definitions that have at least one parameter with that natural ID (`paramId`).
  - Returns an empty array if a filter (or combination) matches nothing — never 404 for a missing filter value.
- Accepts an optional `includeCustomData` boolean query parameter (default `false`). When `true`, `customModuleData` is populated for modules where `isCustomModule` is `true` (see §4.3 for the resolution rule).
- Returns HTTP 404 if the project does not exist.
- Every response item always includes the same full field set — there is no opt-in flag and no reduced summary shape. See §2.3 for the field list and sources.

**FR-2 — Get SPF module definition by system ID**

`GET /arc-api/v1/projects/{projectId}/spf-module-definitions/{moduleSystemId}`

- Returns a single SPF module definition identified by its system ID.
- Accepts the same optional `includeCustomData` query parameter as FR-1, with the same behavior.
- Returns HTTP 404 if the project does not exist or the module definition is not found.
- Response shape is identical to a single item from the FR-1 list response — no additional fields beyond what FR-1 already returns.

**FR-3 — Get custom module metadata by system ID**

`GET /arc-api/v1/projects/{projectId}/spf-module-definitions/{moduleSystemId}/custom-module-metadata`

- Returns the custom module metadata for a single module definition, identified by its system ID.
- Returns HTTP 400 if the module definition's `isCustomModule` is `false`.
- Returns HTTP 404 if the project does not exist or the module definition is not found.
- Response fields: `changeInfo`, `type` (`{name, value, valueDataType}`), `interface` (`{type: {name, value, valueDataType}, version: {name, value, valueDataType}}`), `fileName`, `endPointFunctionTag`. All fields (except `changeInfo`) are sourced from `module_manager_data` (see §2.3.3 / §4.3). `valueDataType` uses a fixed `typeName`/`sizeInBytes` per field (`UINT32` for `type`, `UINT16` for `interface.type`/`interface.version`), not derived from a stored value. `changeInfo` reflects edit-session state on this resource.

**FR-4 — Project scoping**

All three endpoints return only module definitions that belong to the given project. A request for a module definition (or its custom module metadata) that exists but belongs to a different project must return 404, not the data. Scoping follows the established `projectId → fileSystemId` pattern (`ProjectQueryService.getFileIdByProjectId`, filtering by `file_system_id`) — the same pattern used by the key-definition and tag-definition query endpoints.

**FR-5 — Error conditions**

| Condition | HTTP response |
|---|---|
| Project does not exist | 404 |
| Module definition not found (FR-2) | 404 |
| Module definition not found (FR-3) | 404 |
| Module is not a custom module (FR-3) | 400 |
| `processorId` / `moduleDefinitionId` / `parameterId` filter (or combination) matches nothing (FR-1) | 200 with empty array |

Full error-table breakdown by layer (controller/handler/service) is in §5.

### 1.2 Known gaps this design must account for

- Several DTO fields (`deprecated`, `isOffloadable`, `builtIn`, `vocoderModuleType`, `moduleDirectionType`, `isCustomModule`, and `moduleInfo.pidFramework`/`.metaData`/`.reserved`/`.moduleTypeInfo`/`.mdfModuleType`) need dedicated columns on `spf_module_definitions` — none exist today. This design assumes those columns get added, but populating them during ingestion is explicitly out of scope (see §6, ingestion gap).
- `customModuleData` (FR-3) is sourced from the `module_manager_data` table, joined by `moduleDefinitionSystemId` — that table/entity exists in the schema today, but no query-service method joins it yet.
- Two DTO-shape corrections are in scope for this design:
  - **`toolPolicy` → `toolPolicies`**: the current API-layer DTO models this as a single `ToolPolicy` value with two combined enum members (`CALIBRATION_AND_RTC`, `CALIBRATION_AND_RTC_READONLY`) that don't match the domain's actual 6-value `ToolPolicy` type (`UNKNOWN`, `NO_SUPPORT`, `CALIBRATION`, `RTC`, `RTC_READONLY`, `RTM`). This design corrects it to `toolPolicies: ToolPolicy[]`, using the domain's 6 values as-is — the domain already stores this as an array. See §2.3.1.
  - **`valueDataType` (`DataTypeDto`)**: `minValue`/`maxValue` are removed and replaced with `allowedValues?: NameValuePairDto[]` — a static list of `{name, value}` pairs enumerating the relevant type's known members, not a numeric range. See §2.3.3.
  - Neither correction has been applied to the actual enum/DTO files on disk yet (`enums/tool-policy.emum.ts` still has the old combined values; `DataTypeDto` in `data-type.factory.ts` still has `minValue`/`maxValue`) — both are part of this design's implementation scope.
- `isCustomModule`'s determination mechanism (how it gets computed/populated) is unresolved — see §6. This design treats it as a boolean already available on the read model, however it ends up being computed.

---

## 2. Controller Layer

### 2.1 Endpoints

All three routes live on the existing `ModuleDefinitionController` (`packages/api/src/presentation/rest/modules/definition/module-definition/module-definition.controller.ts`), which also owns driver-module-definition and custom-module-metadata write routes (PUT/DELETE) not covered by this design.

| Method | Route | Handler method |
|---|---|---|
| GET | `/arc-api/v1/projects/:projectId/spf-module-definitions` | `getAllSpfModuleDefinitions` |
| GET | `/arc-api/v1/projects/:projectId/spf-module-definitions/:moduleSystemId` | `getSpfModuleDefinition` |
| GET | `/arc-api/v1/projects/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata` | `getSpfCustomModuleMetadata` |

### 2.2 Request

**List endpoint** — `getAllSpfModuleDefinitions`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` before dispatch |
| `processorId` | query | `string` | no | Natural `ProcessorDefinition.processorId`. Converted to `number`. |
| `moduleDefinitionId` | query | `string` | no | Natural `SpfModuleDefinition.moduleDefinitionId`. Converted to `number`. |
| `parameterId` | query | `string` | no | Natural `paramId` on any linked parameter. Converted to `number`. |
| `includeCustomData` | query | `boolean` | no | Default `false`. Already typed as `boolean` on the existing stub signature — Nest's query-string coercion applies. |

**Get-by-id endpoint** — `getSpfModuleDefinition`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` |
| `moduleSystemId` | path | `string` | yes | DB system ID. Converted to `number`. |
| `includeCustomData` | query | `boolean` | no | Same as FR-1. |

**Custom module metadata endpoint** — `getSpfCustomModuleMetadata`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` |
| `moduleSystemId` | path | `string` | yes | Converted to `number` |

### 2.3 Response DTOs

**`SpfModuleDefinitionResponseDto`** (extends `BaseModuleDefinitionDto`) — used by FR-1 (array) and FR-2 (single item), full field set already present in `dto/spf-module-definition-response.dto.ts`:

| DTO field | Type | Source (ReadModel field, §3.1) |
|---|---|---|
| `systemId` | `string` | `SpfModuleDefinitionSummaryReadModel.systemId` (number → string) |
| `moduleId` | `number` | `.moduleId` |
| `name` | `string` | `.name` |
| `displayName` | `string` | `.displayName` |
| `description` | `string` | `.description` |
| `paramDefinitionsSummaryInfo` | `ParameterDefinitionSummaryInfo[]` | `.parameterDefinitions` (each mapped, §2.3.1) |
| `deprecated` | `boolean` (optional) | `.deprecated` |
| `processorInfo` | `ProcessorInfo` | `.processorInfo` (first linked processor arbitrarily, when a module links to more than one — see §6, processor multiplicity) |
| `modSearchKeys` | `string` | `.modSearchKeys` |
| `isOffloadable` | `boolean` (optional) | `.isOffloadable` |
| `builtIn` | `boolean` | `.builtIn` |
| `vocoderModuleType` | `VocoderModuleType` (optional) | `.vocoderModuleType` |
| `moduleDirectionType` | `ModuleDirectionType` (optional) | `.moduleDirectionType` |
| `moduleInfo` | `ModuleInfo` | `.moduleInfo` (§2.3.2) |
| `isLoadedAtBootup` | `boolean` | `.isLoadedAtBootup` |
| `isCustomModule` | `boolean` | `.isCustomModule` |
| `customModuleData` | `SpfCustomModuleMetadataDto \| null` (optional) | resolved per OQ-3's rule — see §4.3 |

**2.3.1 `ParameterDefinitionSummaryInfo`** (existing DTO, `info/parameter-definition-summary-info.ts`):

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `ParameterDefinitionSummaryReadModel.systemId` |
| `paramId` | `number` | `.paramId` |
| `name` | `string` | `.name` |
| `description` | `string` | `.description` |
| `isHidden` | `boolean` | `.isHidden` (not persisted anywhere yet) |
| `isReadOnly` | `boolean` | `.isReadOnly` |
| `deprecated` | `boolean` (optional) | `.deprecated` (not persisted yet) |
| `toolPolicy` | `ToolPolicy` — **corrected to `toolPolicies: ToolPolicy[]`** (see §1.2) | `.toolPolicies` (domain stores as array already) |
| `pidType` | `PidType` | `.pidType` |

**Note:** `ParameterDefinitionSummaryInfo` (used here) still has the single-`toolPolicy` shape shown above on disk today; this design's correction targets whichever DTO is used for FR-1/FR-2's embedded parameter summaries — confirm at implementation time whether `ParameterDefinitionSummaryInfo` itself gets the `toolPolicies: ToolPolicy[]` field, replacing singular `toolPolicy`.

**2.3.2 `ModuleInfo`** (existing DTO, `info/module-info.ts`):

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `pidFramework` | `number` | `.pidFramework` (mandatory column, defaults to `0` — not populated by ingestion yet) |
| `stackSize` | `number` (optional) | `.stackSize` (column exists, always inserted as `0` today — ingestion gap) |
| `containerTypeInfo` | `ContainerTypeInfo[]` | `.containerTypeInfo` (via `module_definition_container_types` join) |
| `metaData` | `number` (optional) | `.metaData` |
| `reserved` | `number` (optional) | `.reserved` |
| `inputDataPortInfo` / `outputDataPortInfo` | `DataPortInfo` | `.dataPortGroups`, filtered by port I/O type |
| `staticCtrlPorts` | `StaticCtrlPortInfo[]` | `.staticControlPorts` |
| `dynamicIntents` | `IntentInfo[]` | `.dynamicIntents` |
| `moduleTypeInfo` | `ModuleTypeInfo` (optional) | `.moduleTypeInfo` — parsed JSON blob, see §3.4 |
| `mdfModuleType` | `MdfModuleType` (optional) | `.mdfModuleType` — validated column, see §3.4 |

**2.3.3 `SpfCustomModuleMetadataDto`** (FR-3 response, existing DTO `dto/spf-custom-module-metadata.dto.ts`):

| DTO field | Type | Source |
|---|---|---|
| `changeInfo` | `ChangeInfoDto` | edit-session state for this resource — mechanics deferred, not designed in this document |
| `type` | `NameValueDto` | `module_manager_data.moduleType` (+ derived name, fixed `UINT32` valueDataType) |
| `interface.type` | `NameValueDto` | `module_manager_data.interfaceType` (+ derived name, fixed `UINT16`) |
| `interface.version` | `NameValueDto` | `module_manager_data.interfaceVersion` (+ derived name, fixed `UINT16`) |
| `fileName` | `string` | `module_manager_data.fileName` |
| `endPointFunctionTag` | `string` | `module_manager_data.tag` |

**`NameValueDto.valueDataType` (`DataTypeDto`) correction** (see §1.2): `minValue`/`maxValue` removed, replaced with `allowedValues?: NameValuePairDto[]` — a static list of `{name, value}` enumerating the relevant domain enum's members (`ModuleType`/`InterfaceType`/`InterfaceVersion` in `entity-schema/module-manager/types.ts`), not a numeric range. `DataTypeDto` in `data-type.factory.ts` currently still has `minValue`/`maxValue` — this correction is not yet applied there either.

---

## 3. Interfaces and Read Models

### 3.1 Read models (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/spf-module-definition/`

Extends the existing `SpfModuleDefinitionReadModel` (`spf-module-definition-read-model.ts`, currently `systemId`/`name`/`moduleId` + summary/fullDetails port fields) with a new summary-oriented read model carrying the FR-1/FR-2 field set:

```typescript
export interface ProcessorSummaryReadModel {
  readonly systemId: number;
  readonly processorId: number;
  readonly name: string;
}

export interface ParameterDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly paramId: number;
  readonly name?: string;
  readonly description?: string;
  readonly isHidden: boolean;
  readonly isReadOnly?: boolean;
  readonly deprecated?: boolean;
  readonly toolPolicies: string; // stored form; mapped to ToolPolicy[] at the DTO boundary
  readonly pidType: string;
}

export interface ContainerTypeSummaryReadModel {
  readonly name: string;
  readonly value: string;
}

export interface ModuleTypeInfoReadModel {
  readonly majorModuleType: MajorModuleType; // one of the domain's 10 known values
  readonly buildType: BuildType;             // one of the domain's 3 known values
  readonly islandFriendly?: boolean;
}

export interface ModuleInfoSummaryReadModel {
  readonly pidFramework: number;
  readonly stackSize?: number;
  readonly containerTypeInfo: ContainerTypeSummaryReadModel[];
  readonly metaData?: number;
  readonly reserved?: number;
  readonly inputDataPortInfo: DataPortGroupReadModel | null;
  readonly outputDataPortInfo: DataPortGroupReadModel | null;
  readonly staticCtrlPorts: ControlPortDefinitionReadModel[];
  readonly dynamicIntents: DynamicIntentDefinitionReadModel[];
  readonly moduleTypeInfo?: ModuleTypeInfoReadModel;
  readonly mdfModuleType?: MdfModuleType; // one of the domain's 4 known values
}

export interface SpfModuleDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly moduleId: number;
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly parameterDefinitions: ParameterDefinitionSummaryReadModel[];
  readonly deprecated?: boolean;
  readonly processorInfo: ProcessorSummaryReadModel;
  readonly modSearchKeys?: string;
  readonly isOffloadable?: boolean;
  readonly builtIn: boolean;
  readonly vocoderModuleType?: string;
  readonly moduleDirectionType?: string;
  readonly moduleInfo: ModuleInfoSummaryReadModel;
  readonly isLoadedAtBootup: boolean;
  readonly isCustomModule: boolean;
}
```

`DataPortGroupReadModel`/`ControlPortDefinitionReadModel`/`DynamicIntentDefinitionReadModel` are the existing types in `spf-module-definition-read-model.ts` — reused, not duplicated. `MajorModuleType`/`BuildType`/`MdfModuleType` are domain enum types that need to be added under `packages/core/src/domain/entities/definitions/common/types/` (10, 3, and 4 values respectively — matching the equivalent enums already present in the API layer at `packages/api/src/presentation/rest/modules/definition/module-definition/enums/`) — the domain-layer versions do not exist on disk today.

`CustomModuleMetadataReadModel` (used by FR-3, and by the optional per-row `customModuleData` field on FR-1/FR-2 — see §4.3 for the resolution rule):

```typescript
export interface NameValueReadModel {
  readonly name: string;
  readonly value: string;
}

export interface CustomModuleInterfaceReadModel {
  readonly type: NameValueReadModel;
  readonly version: NameValueReadModel;
}

export interface CustomModuleMetadataReadModel {
  readonly type: NameValueReadModel;
  readonly interface: CustomModuleInterfaceReadModel;
  readonly fileName: string;
  readonly endPointFunctionTag: string;
}
```
`changeInfo` is deliberately excluded from this read model — its mechanics (edit-session-derived) are deferred, not designed in this document, so it is assembled at the handler/controller boundary, not sourced from this query.

### 3.2 Query service port changes (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/spf-module-definition/spf-module-definition-query-service.ts`

Add three methods to the existing `SpfModuleDefinitionQueryService` interface (alongside `getDefinition`/`getParameterDefinition`/`queryParameterDefinitions`, which stay as-is — they serve the container/tuning-config call paths, not this design):

```typescript
export interface SpfModuleDefinitionQueryService {
  // ...existing methods unchanged...

  /**
   * Returns all SPF module definitions for the file, filtered by any
   * combination of processorId/moduleDefinitionId/parameterId (AND
   * semantics). Empty array if nothing matches. Overlay always applied.
   */
  getAllSpfModuleDefinitionSummaries(
    fileSystemId: number,
    filters: {
      processorId?: number;
      moduleDefinitionId?: number;
      parameterId?: number;
    },
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single SPF module definition summary by system ID.
   * Result.fail with ENTITY_NOT_FOUND if absent from DB and session.
   */
  getSpfModuleDefinitionSummary(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel>>;

  /**
   * Returns FR-3's custom module metadata for one module definition,
   * sourced from module_manager_data (joined by moduleDefinitionSystemId).
   * Result.fail with ENTITY_NOT_FOUND if no module_manager_data row exists
   * for this module.
   */
  getCustomModuleMetadata(
    moduleDefinitionSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CustomModuleMetadataReadModel>>;
}
```

Both `getAllSpfModuleDefinitionSummaries` and `getSpfModuleDefinitionSummary` return `Result<T>` (unlike `getAllKeyDefinitions`'s plain-array precedent) because their failure mode is genuinely richer than "not found": `moduleTypeInfo`/`mdfModuleType` parsing can throw `DataIntegrityException`-worthy errors on malformed stored data (see §3.4), and the `customModuleData` resolution described in §4.3 can fail independently per module. This matches the existing `getDefinition`/`getParameterDefinition` convention already on this same port.

### 3.3 Registration in `QueryServices`

No change needed — `spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService` already exists on the `QueryServices` interface (`query-services.ts`); only the port's own method set grows.

### 3.4 Custom-module-data and enum-validation helpers (`DbSpfModuleDefinitionQueryService`)

Internal implementation methods on the DB service, not port-level:

- **`parseModuleTypeInfo(raw: string | null): ModuleTypeInfoReadModel | undefined`** — parses the `module_type_info` JSON-string column. Empty/absent → `undefined`. A non-empty blob missing `majorModuleType`/`buildType`, or holding a value outside the domain's known enum sets, throws `DataIntegrityException` (new domain exception — does not exist on disk yet, needs adding to `packages/core/src/shared/exceptions/`, mapped to HTTP 500 in `AllExceptionsFilter`'s `DOMAIN_STATUS_MAP`). `islandFriendly` is optional with no membership check.
- **`parseMdfModuleType(raw: string | null): MdfModuleType | undefined`** — same validate-if-present pattern against the domain's 4-value `MdfModuleType` enum.
- **`resolveCustomModuleData(moduleDefinitionSystemId, fileSystemId, isCustomModule, includeCustomData): Promise<Result<CustomModuleMetadataReadModel | null>>`** — the `customModuleData` resolution rule: returns `null` unless both `includeCustomData` and `isCustomModule` are true; when both hold, delegates to `getCustomModuleMetadata`, and a failure there propagates as a failed `Result` — the whole request fails, since `isCustomModule=true` is treated as a promise that the underlying data exists, not a per-row gap to silently paper over.

---

## 4. Call Flow

### 4.1 `GET /spf-module-definitions` — list (FR-1)

```
ModuleDefinitionController.getAllSpfModuleDefinitions
  IN:  projectId (string), processorId?/moduleDefinitionId?/parameterId? (string), includeCustomData (boolean)
  OUT: ApiResult<SpfModuleDefinitionResponseDto[]>
  │
  │  parse projectId → number; parse each provided filter → number
  │  dispatch GetAllSpfModuleDefinitionsQuery
  ▼
GetAllSpfModuleDefinitionsHandler.handle
  IN:  GetAllSpfModuleDefinitionsQuery(projectId, filters, includeCustomData)
  OUT: SpfModuleDefinitionSummaryReadModel[] with resolved customModuleData
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId)
  │     → fileSystemId; throws ResourceNotFoundException if project missing
  │
  │  2. spfModuleDefinitionQueryService.getAllSpfModuleDefinitionSummaries(fileSystemId, filters)
  │     → Result<SpfModuleDefinitionSummaryReadModel[]>
  │     → isFailure → propagate (DataIntegrityException surfaces as 500; genuine DB
  │       errors likewise — no ENTITY_NOT_FOUND case here since empty-match is valid 200)
  │
  │  3. For each row, if includeCustomData: resolveCustomModuleData(...) per the rule in §3.4/§4.3
  ▼
DbSpfModuleDefinitionQueryService.getAllSpfModuleDefinitionSummaries
  IN:  fileSystemId, filters
  OUT: Result<SpfModuleDefinitionSummaryReadModel[]>
  │
  │  Query spf_module_definitions WHERE file_system_id = fileSystemId
  │  JOIN module_definition_processor_links [+ ProcessorDefinition] for processorInfo/processorId filter
  │  JOIN spf_module_parameter_definitions for paramDefinitionsSummaryInfo/parameterId filter
  │  [Filter by moduleDefinitionId/processorId/parameterId if provided — AND semantics]
  │  Apply overlay (table-wide, same pattern as getAllKeyDefinitions)
  │  parseModuleTypeInfo / parseMdfModuleType per row (throws DataIntegrityException on malformed data)
  │  → Result.ok([]) if no rows match a filter combination
  │  → Result.ok(SpfModuleDefinitionSummaryReadModel[])
  ▼
Controller
  IN:  SpfModuleDefinitionSummaryReadModel[] (+ resolved customModuleData)
  OUT: ApiResult<SpfModuleDefinitionResponseDto[]>
  │
  │  map → SpfModuleDefinitionResponseDto[]
```

### 4.2 `GET /spf-module-definitions/{moduleSystemId}` — get by id (FR-2)

Same shape as §4.1, singular: `getSpfModuleDefinitionSummary(moduleSystemId, fileSystemId)` → `Result<SpfModuleDefinitionSummaryReadModel>`; `isFailure` (including `ENTITY_NOT_FOUND`) → handler throws `ResourceNotFoundException` → 404. `includeCustomData` resolution identical to FR-1, applied to the single row.

### 4.3 `GET /spf-module-definitions/{moduleSystemId}/custom-module-metadata` — FR-3

```
ModuleDefinitionController.getSpfCustomModuleMetadata
  IN:  projectId (string), moduleSystemId (string)
  OUT: ApiResult<SpfCustomModuleMetadataResponseDto>
  ▼
GetCustomModuleMetadataHandler.handle
  IN:  GetCustomModuleMetadataQuery(projectId, moduleSystemId)
  OUT: CustomModuleMetadataReadModel (+ changeInfo assembled at this layer)
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId) → fileSystemId (404 if missing)
  │
  │  2. spfModuleDefinitionQueryService.getSpfModuleDefinitionSummary(moduleSystemId, fileSystemId)
  │     → isFailure → ResourceNotFoundException (404)
  │     → isCustomModule === false → InvalidOperationException / BadRequestException (400, FR-5)
  │
  │  3. spfModuleDefinitionQueryService.getCustomModuleMetadata(moduleSystemId, fileSystemId)
  │     → isFailure (no module_manager_data row) → ResourceNotFoundException (404)
  │     → isSuccess → CustomModuleMetadataReadModel
  ▼
DbSpfModuleDefinitionQueryService.getCustomModuleMetadata
  IN:  moduleDefinitionSystemId, fileSystemId
  OUT: Result<CustomModuleMetadataReadModel>
  │
  │  Query module_manager_data WHERE module_definition_system_id = moduleDefinitionSystemId
  │    AND file_system_id = fileSystemId
  │  → Result.fail(ENTITY_NOT_FOUND) if no row
  │  Derive type.name / interface.type.name / interface.version.name via
  │    ModuleType.valueToName / InterfaceType.valueToName / InterfaceVersion.valueToName
  │  valueDataType fixed per field: UINT32 (type), UINT16 (interface.type, interface.version)
  │    + allowedValues enumerating each type's known enum members
  │  → Result.ok(CustomModuleMetadataReadModel)
  ▼
Controller
  IN:  CustomModuleMetadataReadModel
  OUT: ApiResult<SpfCustomModuleMetadataResponseDto>
  │
  │  map → SpfCustomModuleMetadataResponseDto (changeInfo populated separately — deferred mechanics)
```

---

## 5. Error Handling

### 5.1 Error table — by layer (FR-5)

| Layer | Condition | Behaviour |
|---|---|---|
| **Controller** | `projectId` not parseable as number | `400 Bad Request` |
| **Controller** | `moduleSystemId` not parseable as number | `400 Bad Request` |
| **Controller** | `processorId`/`moduleDefinitionId`/`parameterId` not parseable as number (FR-1) | `400 Bad Request` |
| **Handler** | `getFileIdByProjectId` throws | `ResourceNotFoundException` → 404 |
| **Handler (get-by-id, FR-2)** | `getSpfModuleDefinitionSummary` returns `Result.fail(ENTITY_NOT_FOUND)` | `ResourceNotFoundException` → 404 |
| **Handler (FR-3)** | `getCustomModuleMetadata` returns `Result.fail(ENTITY_NOT_FOUND)` | `ResourceNotFoundException` → 404 |
| **Handler (FR-3)** | Module's `isCustomModule` is `false` | `400 Bad Request` |
| **Service (list, FR-1)** | Filter (or combination) matches nothing | `Result.ok([])` → controller returns `200` with empty array |
| **Service** | `moduleTypeInfo`/`mdfModuleType` malformed | `DataIntegrityException` → 500 |
| **Service** | `resolveCustomModuleData` lookup fails for a row marked custom | Failure propagates → whole request fails (see §3.4) |
| **Service** | Any other unexpected DB error | Propagates uncaught → `AllExceptionsFilter` → 500 |

---

## 6. Open Questions

- **Ingestion gap resolution.** This design assumes the schema columns and domain fields listed in §1.2/§3.1 exist, but does not resolve how the module-definition entity builder (ingestion code that parses the AWSP file into domain entities) populates them, nor the remaining schema work (`stackSize`'s real stored value, `isHidden`/`deprecated` columns on the parameter definition table). Not addressed by this document.
- **`isCustomModule` determination.** This design's read model treats `isCustomModule` as an already-resolved boolean field (§3.1) but does not decide whether it's a dedicated ingestion-set column or derived from `module_manager_data` row presence. Not addressed by this document.
- **Processor multiplicity.** A module linking to more than one processor has its `processorInfo` resolved by taking the first linked processor arbitrarily — a known placeholder, not fixed by this design. The proper fix (one module-definition row per processor/module pair) requires an ingestion-side change, tracked separately.
- **`toolPolicy` → `toolPolicies` landing point** (§2.3.1) — which DTO(s) actually receive the array-shape correction needs confirming at implementation time; `ParameterDefinitionSummaryInfo` is the most likely candidate given it's what FR-1/FR-2 embed.

---

## 7. Folder Structure

```
packages/core/src/application/
  ports/persistence/query-services/
    spf-module-definition/
      spf-module-definition-query-service.ts        ← MODIFY: add 3 methods
      spf-module-definition-read-model.ts            ← MODIFY: add summary read models
      custom-module-metadata-read-model.ts           ← NEW: CustomModuleMetadataReadModel family

  definition/
    spf-module-definition/
      get-all/
        get-all-spf-module-definitions.query.ts      ← NEW
        get-all-spf-module-definitions.handler.ts    ← NEW
      get-one/
        get-spf-module-definition.query.ts           ← NEW
        get-spf-module-definition.handler.ts         ← NEW
      get-custom-module-metadata/
        get-custom-module-metadata.query.ts          ← NEW
        get-custom-module-metadata.handler.ts        ← NEW

  orchestration/cqrs/registries/
    query-handler-registry.ts                        ← register 3 new handlers

  domain/entities/definitions/common/types/
    major-module-type.ts                             ← NEW (re-add): MajorModuleType/MAJOR_MODULE_TYPE, 10 values
    build-type.ts                                     ← NEW (re-add): BuildType/BUILD_TYPE, 3 values
    mdf-module-type.ts                                ← NEW (re-add): MdfModuleType/MDF_MODULE_TYPE, 4 values

  shared/exceptions/
    data-integrity.exception.ts                       ← NEW (re-add): DataIntegrityException, maps to HTTP 500

packages/infrastructure/persistence/src/
  persistence-typeorm-sqllite/queries/spf-module-definition/
    db-spf-module-definition-query-service.ts         ← MODIFY: add 3 methods + parse helpers

  persistence-typeorm-sqllite/entity-schema/definitions/module/spf/
    spf-module-definition.schema.ts                    ← MODIFY: add builtIn/isCustomModule/pidFramework/
                                                             moduleTypeInfo/mdfModuleType/etc. columns (Part 0.1/0.6)

packages/api/src/infrastructure-wrapper/filters/
  all-exceptions.filter.ts                             ← MODIFY: register DataIntegrityException in DOMAIN_STATUS_MAP

packages/api/src/presentation/rest/modules/definition/module-definition/
  module-definition.controller.ts                      ← MODIFY: replace 3 NotImplementedException stubs
```
