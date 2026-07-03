<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Key Definition Query APIs — Design Document

## Document Information

- **Version**: 1.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `GET /arc-api/v1/projects/{projectId}/definitions/keys`
  - `GET /arc-api/v1/projects/{projectId}/definitions/keys/{keySystemId}`

---

## Table of Contents

1. [Scope and Requirements](#1-scope-and-requirements)
2. [Controller Layer](#2-controller-layer)
3. [Interfaces and Read Models](#3-interfaces-and-read-models)
4. [Call Flow](#4-call-flow)
5. [Error Handling](#5-error-handling)
6. [Folder Structure](#6-folder-structure)

---

## 1. Scope and Requirements

Read-only query implementation for key definitions. Two `GET` endpoints only. No write or delete operations are in scope.

### Functional Requirements

**FR-1 — List key definitions**

`GET /arc-api/v1/projects/{projectId}/definitions/keys`

- Returns all key definitions belonging to the project.
- Response is always an array. An empty array is a valid response.
- Accepts an optional `keyDefinitionId` query parameter. When provided, filters results to key definitions whose natural ACDB key ID (`key_id`) matches. Returns an empty array if no match — never 404 for a missing filter value.
- Returns HTTP 404 if the project does not exist.
- Each item includes its child value definitions inline. There is no opt-in flag — they are always present.

**FR-2 — Get key definition by system ID**

`GET /arc-api/v1/projects/{projectId}/definitions/keys/{keySystemId}`

- Returns a single key definition identified by its system ID.
- Returns HTTP 404 if the project does not exist or the key definition is not found.
- Child value definitions are always included inline.

**FR-3 — Project scoping**

Both endpoints must return only key definitions that belong to the given project. A request for a key definition that exists but belongs to a different project must return 404, not the data.

**FR-4 — Error conditions**

| Condition | HTTP response |
|---|---|
| Project does not exist | 404 |
| Key definition not found (FR-2) | 404 |
| `keyDefinitionId` filter matches nothing (FR-1) | 200 with empty array |

---

## 2. Controller Layer

### 2.1 Endpoints

| Method | Route | Handler method |
|---|---|---|
| GET | `/arc-api/v1/projects/:projectId/definitions/keys` | `getKeyDefinitions` |
| GET | `/arc-api/v1/projects/:projectId/definitions/keys/:keySystemId` | `getKeyDefinition` |

### 2.2 Request

**List endpoint** — `getKeyDefinitions`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` before dispatch |
| `keyDefinitionId` | query | `string` | no | Natural ACDB key ID (`key_id`). Converted to `number` before dispatch. |

**Get-by-id endpoint** — `getKeyDefinition`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` before dispatch |
| `keySystemId` | path | `string` | yes | DB system ID. Converted to `number` before dispatch. |

### 2.3 Response DTOs

**`KeyDefinitionResponseDto`** — used by both endpoints (list returns array, get-by-id returns single)

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `KeyDefinitionReadModel.systemId` (number → string) |
| `keyId` | `number` | `KeyDefinitionReadModel.keyId` |
| `name` | `string` | `KeyDefinitionReadModel.name` |
| `description` | `string` (optional) | `KeyDefinitionReadModel.description` |
| `cHeaderEnumValue` | `string` | `KeyDefinitionReadModel.cEnumMemberName` |
| `cHeaderEnumName` | `string` | `KeyDefinitionReadModel.cEnumName` |
| `isVoice` | `boolean` | `KeyDefinitionReadModel.isVoice` |
| `isDynamic` | `boolean` | `KeyDefinitionReadModel.isDynamic` |
| `isCalibrationKey` | `boolean` | `KeyDefinitionReadModel.isCalibrationKey` |
| `isGraphKey` | `boolean` | `KeyDefinitionReadModel.isGraphKey` |
| `specialKey` | `'SAMPLE_RATE' \| 'VOLUME'` (optional) | `KeyDefinitionReadModel.specialityKeyValue` |
| `cHeaderCalibrationKeyEnumValue` | `string` (optional) | `KeyDefinitionReadModel.calibrationEnumValue` |
| `cHeaderGraphKeyEnumValue` | `string` (optional) | `KeyDefinitionReadModel.graphEnumValue` |
| `values` | `ValueDefinitionInfo[]` | `KeyDefinitionReadModel.values` |

**`ValueDefinitionInfo`** — inline child, always present

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `ValueDefinitionReadModel.systemId` (number → string) |
| `valueId` | `number` | `ValueDefinitionReadModel.valueId` |
| `name` | `string` | `ValueDefinitionReadModel.name` |
| `description` | `string` (optional) | `ValueDefinitionReadModel.description` |
| `cHeaderEnumValue` | `string` | `ValueDefinitionReadModel.enumValue` |
| `specialValue` | `string` (optional) | `ValueDefinitionReadModel.specialValue` |

**HTTP response wrapper** — `ApiResult<T>` (existing shape, unchanged)

```typescript
class ApiResult<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  warnings?: string[];
}
```

---

## 3. Interfaces and Read Models

### 3.1 Read models (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/key-value/`

```typescript
// key-value-definition-read-model.ts

export interface KeyDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
  readonly description?: string;
}

export interface ValueDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly valueId: number;
  readonly name: string;
  readonly description?: string;
}

export interface KeyDefinitionReadModel extends KeyDefinitionSummaryReadModel {
  readonly isCalibrationKey?: boolean;
  readonly isGraphKey?: boolean;
  readonly isVoice?: boolean;
  readonly isDynamic?: boolean;
  readonly cEnumMemberName?: string;
  readonly cEnumName?: string;
  readonly specialityKeyValue?: string;
  readonly calibrationEnumValue?: string;
  readonly graphEnumValue?: string;
  readonly values: ValueDefinitionReadModel[];
}

export interface ValueDefinitionReadModel extends ValueDefinitionSummaryReadModel {
  readonly enumValue?: string;
  readonly specialValue?: string;
}
```

`KeyDefinitionSummaryReadModel`/`ValueDefinitionSummaryReadModel` are reduced identity-only projections, reused elsewhere (e.g. `getKeyValueSummaryForGivenValues`, used by SPF tuning config) — not specific to these two endpoints.

### 3.2 Query service port (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/key-value/key-value-definition-query-service.ts`

```typescript
export interface KeyValueDefQueryService {
  /**
   * Returns all key definitions for the given file, with their values embedded.
   * Optional keyId filters by natural ACDB key_id. Overlay is always applied.
   * Plain return — throws on unexpected DB error (no Result wrapper).
   */
  getAllKeyDefinitions(
    fileSystemId: number,
    keyId?: number,
  ): Promise<KeyDefinitionReadModel[]>;

  /**
   * Given a key systemId, returns the overlaid KeyDefinitionReadModel with
   * all its child values. Result.fail with ERROR_CODES.ENTITY_NOT_FOUND if
   * the key is not found in the DB or has been deleted in the active session.
   */
  getByKeyDefinition(
    keyDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>>;
}
```

### 3.3 Registration in `QueryServices`

**File**: `packages/core/src/application/ports/persistence/query-services/query-services.ts`

```typescript
export interface QueryServices {
  // ... existing services ...
  readonly keyValueDefQueryService: KeyValueDefQueryService;
}
```

### 3.4 Query classes (`@arc/core`)

**Location**: `packages/core/src/application/definition/key-definition/`

```typescript
// get-all/get-all-key-definitions.query.ts
export class GetAllKeyDefinitionsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly keyId: number | undefined,
    clientId: string,
  ) {
    super(clientId);
  }
}

// get-key/get-key-definition.query.ts
export class GetKeyDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly keySystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 3.5 Handler interfaces (`@arc/core`)

```typescript
// GetAllKeyDefinitionsHandler implements QueryHandler<
//   GetAllKeyDefinitionsQuery,
//   Promise<KeyDefinitionReadModel[]>
// >

// GetKeyDefinitionHandler implements QueryHandler<
//   GetKeyDefinitionQuery,
//   Promise<KeyDefinitionReadModel>
// >
```

---

## 4. Call Flow

### 4.1 `GET /definitions/keys` — list

```
KeyDefinitionController.getKeyDefinitions
  IN:  projectId (string), keyDefinitionId? (string)
  OUT: ApiResult<KeyDefinitionResponseDto[]>
  │
  │  parse projectId → number, keyDefinitionId? → number
  │  dispatch GetAllKeyDefinitionsQuery
  ▼
GetAllKeyDefinitionsHandler.handle
  IN:  GetAllKeyDefinitionsQuery(projectId, keyId?)
  OUT: KeyDefinitionReadModel[]
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId)
  │     → fileSystemId
  │     → throws ResourceNotFoundException if project does not exist
  │
  │  2. keyValueDefQueryService.getAllKeyDefinitions(fileSystemId, keyId?)
  │     → KeyDefinitionReadModel[]
  ▼
DbKeyValueDefQueryService.getAllKeyDefinitions
  IN:  fileSystemId, keyId?
  OUT: KeyDefinitionReadModel[]
  │
  │  ── No active session ────────────────────────────────────────────
  │  Query arc_keys WHERE file_system_id = fileSystemId
  │  JOIN arc_values ON keys_system_id = arc_keys.system_id
  │  [Filter by keyId if provided]
  │  → KeyDefinitionReadModel[] (empty array if no match)
  │
  │  ── Active session ───────────────────────────────────────────────
  │  Query arc_keys WHERE file_system_id = fileSystemId
  │  Apply overlay (ADD / UPDATE / DELETE) on arc_keys rows
  │  Apply overlay on all arc_values rows for the file, regroup by keySystemId
  │  [Filter by keyId if provided, after overlay]
  │  → KeyDefinitionReadModel[]
  ▼
Controller
  IN:  KeyDefinitionReadModel[]
  OUT: ApiResult<KeyDefinitionResponseDto[]>
  │
  │  ResourceNotFoundException thrown upstream → AllExceptionsFilter → HTTP 404
  │  map KeyDefinitionReadModel[] → KeyDefinitionResponseDto[]
```

---

### 4.2 `GET /definitions/keys/{keySystemId}` — get by id

```
KeyDefinitionController.getKeyDefinition
  IN:  projectId (string), keySystemId (string)
  OUT: ApiResult<KeyDefinitionResponseDto>
  │
  │  parse projectId → number, keySystemId → number
  │  dispatch GetKeyDefinitionQuery
  ▼
GetKeyDefinitionHandler.handle
  IN:  GetKeyDefinitionQuery(projectId, keySystemId)
  OUT: KeyDefinitionReadModel
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId)
  │     → fileSystemId
  │     → throws ResourceNotFoundException if project does not exist
  │
  │  2. keyValueDefQueryService.getByKeyDefinition(keySystemId, fileSystemId)
  │     → Result<KeyDefinitionReadModel>
  │     → result.isFailure → throws ResourceNotFoundException
  │     → otherwise → result.data
  ▼
DbKeyValueDefQueryService.getByKeyDefinition
  IN:  keyDefSystemId, fileSystemId
  OUT: Result<KeyDefinitionReadModel>
  │
  │  ── No active session ────────────────────────────────────────────
  │  Query arc_keys WHERE system_id = keyDefSystemId
  │  JOIN arc_values ON keys_system_id = arc_keys.system_id
  │  → Result.fail(ENTITY_NOT_FOUND) if no row
  │  → Result.ok(KeyDefinitionReadModel)
  │
  │  ── Active session ───────────────────────────────────────────────
  │  Query arc_keys WHERE system_id = keyDefSystemId
  │  Apply overlay (applyTableOverlay) on the arc_keys row
  │  → Result.fail(ENTITY_NOT_FOUND) if deleted in session
  │  Apply overlay (applyBatchOverlay) on child arc_values rows
  │  → Result.ok(KeyDefinitionReadModel)
  ▼
Controller
  IN:  KeyDefinitionReadModel
  OUT: ApiResult<KeyDefinitionResponseDto>
  │
  │  ResourceNotFoundException thrown upstream → AllExceptionsFilter → HTTP 404
  │  map KeyDefinitionReadModel → KeyDefinitionResponseDto
```

---

## 5. Error Handling

### 5.1 Error table — by layer

| Layer | Condition | Behaviour |
|---|---|---|
| **Controller** | `projectId` not parseable as number | `400 Bad Request` — manual `Number.parseInt` check, throws `BadRequestException` |
| **Controller** | `keySystemId` not parseable as number | `400 Bad Request` — manual `Number.parseInt` check, throws `BadRequestException` |
| **Handler** | `getFileIdByProjectId` throws | `ResourceNotFoundException` propagates → `AllExceptionsFilter` → HTTP 404 |
| **Handler (getKeyDefinition)** | `getByKeyDefinition` returns `Result.fail(ENTITY_NOT_FOUND)` | Handler throws `ResourceNotFoundException` → HTTP 404 |
| **Service (getAllKeyDefinitions)** | `keyDefinitionId` filter matches nothing | Returns `[]` → controller returns `200` with empty array |
| **Service (getByKeyDefinition)** | Any unexpected DB error | Throws → `AllExceptionsFilter` → HTTP 500 |

---

## 6. Folder Structure

```
packages/core/src/application/
  ports/persistence/query-services/
    query-services.ts                              ← keyValueDefQueryService field
    key-value/
      key-value-definition-query-service.ts        ← port interface (pre-existing)
      key-value-definition-read-model.ts           ← read models (pre-existing)

  definition/
    key-definition/
      get-all/
        get-all-key-definitions.query.ts           ← NEW
        get-all-key-definitions.handler.ts         ← NEW
      get-key/
        get-key-definition.query.ts                ← NEW
        get-key-definition.handler.ts              ← NEW

  orchestration/cqrs/registries/
    query-handler-registry.ts                      ← register both handlers

packages/infrastructure/persistence/src/
  persistence-typeorm-sqllite/queries/
    key-value/
      db-key-value-def-query-service.ts            ← MODIFY: add getAllKeyDefinitions
                                                        (getByKeyDefinition pre-existing)

  persistence-typeorm-sqllite/queries/
    typeorm-query-services.ts                      ← wires DbKeyValueDefQueryService (pre-existing)

packages/api/src/presentation/rest/modules/definition/key-definition/
  key-definition.controller.ts                     ← MODIFY
  key-definition.module.ts                         ← MODIFY
```
