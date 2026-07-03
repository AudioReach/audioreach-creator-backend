<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Tag Definition Query APIs — Design Document

## Document Information

- **Version**: 2.0
- **Date**: July 2026
- **Status**: Draft
- **Endpoints**:
  - `GET /arc-api/v1/projects/{projectId}/definitions/tags`
  - `GET /arc-api/v1/projects/{projectId}/definitions/tags/{tagSystemId}`

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

Read-only query implementation for tag definitions. Two `GET` endpoints only. No write or delete operations are in scope.

### Functional Requirements

**FR-1 — List tag definitions**

`GET /arc-api/v1/projects/{projectId}/definitions/tags`

- Returns all tag definitions belonging to the project.
- Response is always an array. An empty array is a valid response.
- Accepts an optional `tagDefinitionId` query parameter. When provided, filters results to tag definitions whose natural ACDB tag ID (`tag_id`) matches. Returns an empty array if no match — never 404 for a missing filter value.
- Returns HTTP 404 if the project does not exist.
- Each item includes its associated key definitions inline, and each key definition includes its child value definitions inline. There is no opt-in flag — they are always present.

**FR-2 — Get tag definition by system ID**

`GET /arc-api/v1/projects/{projectId}/definitions/tags/{tagSystemId}`

- Returns a single tag definition identified by its system ID.
- Returns HTTP 404 if the project does not exist or the tag definition is not found.
- Associated key definitions and their child value definitions are always included inline.

**FR-3 — Project scoping**

Both endpoints must return only tag definitions that belong to the given project. A request for a tag definition that exists but belongs to a different project must return 404, not the data.

**FR-4 — Error conditions**

| Condition | HTTP response |
|---|---|
| Project does not exist | 404 |
| Tag definition not found (FR-2) | 404 |
| `tagDefinitionId` filter matches nothing (FR-1) | 200 with empty array |

---

## 2. Controller Layer

### 2.1 Endpoints

`KeyDefinitionController` owns both key and tag routes.

| Method | Route | Handler method |
|---|---|---|
| GET | `/arc-api/v1/projects/:projectId/definitions/tags` | `getTagDefinitions` |
| GET | `/arc-api/v1/projects/:projectId/definitions/tags/:tagSystemId` | `getTagDefinition` |

### 2.2 Request

**List endpoint** — `getTagDefinitions`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` before dispatch |
| `tagDefinitionId` | query | `string` | no | Natural ACDB tag ID (`tag_id`). Converted to `number` before dispatch. |

**Get-by-id endpoint** — `getTagDefinition`

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `projectId` | path | `string` | yes | Converted to `number` before dispatch |
| `tagSystemId` | path | `string` | yes | DB system ID. Converted to `number` before dispatch. |

### 2.3 Response DTOs

**`TagDefinitionResponseDto`** — used by both endpoints (list returns array, get-by-id returns single)

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `TagDefinitionReadModel.systemId` (number → string) |
| `tagId` | `number` | `TagDefinitionReadModel.tagId` |
| `name` | `string` | `TagDefinitionReadModel.name` |
| `cHeaderEnumValue` | `string` (optional) | `TagDefinitionReadModel.cHeaderEnumValue` |
| `cHeaderEnumName` | `string` (optional) | `TagDefinitionReadModel.cHeaderEnumName` |
| `keyDefinitions` | `TagKeyDefinitionInfo[]` | `TagDefinitionReadModel.keys` |

**`TagKeyDefinitionInfo`** — inline child, resolved via `tag_key_def_links → arc_keys`

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `TagKeyDefinitionReadModel.keyDefinition.systemId` (number → string) |
| `keyId` | `number` | `TagKeyDefinitionReadModel.keyDefinition.keyId` |
| `name` | `string` | `TagKeyDefinitionReadModel.keyDefinition.name` |
| `description` | `string` (optional) | `TagKeyDefinitionReadModel.keyDefinition.description` |
| `cHeaderEnumValue` | `string` (optional) | `TagKeyDefinitionReadModel.cHeaderTagEnumMemberName` |
| `values` | `ValueDefinitionInfo[]` | `TagKeyDefinitionReadModel.keyDefinition.values` |

`ValueDefinitionInfo` is the same shape as in the key definition endpoints — sourced from `KeyDefinitionReadModel.values`.

---

## 3. Interfaces and Read Models

### 3.1 Read models (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/tag-definition/`

```typescript
// tag-definition-read-model.ts

export interface TagKeyDefinitionReadModel {
  readonly cHeaderTagEnumMemberName?: string;  // tag_key_def_links.tagEnumValue
  readonly keyDefinition: KeyDefinitionReadModel;  // reuses key definition read model
}

export interface TagDefinitionReadModel {
  readonly systemId: number;
  readonly tagId: number;
  readonly name: string;
  readonly description?: string;
  readonly isVoice: boolean;
  readonly cHeaderEnumName?: string;
  readonly cHeaderEnumValue?: string;
  readonly keys: TagKeyDefinitionReadModel[];
}
```

`KeyDefinitionReadModel` and `ValueDefinitionReadModel` are imported from the key-value module's read model file (`key-value/key-value-definition-read-model.ts`) — no duplication.

### 3.2 Query service port (`@arc/core`)

**Location**: `packages/core/src/application/ports/persistence/query-services/tag-definition/tag-definition-query-service.ts`

```typescript
export interface TagDefinitionQueryService {
  /**
   * Returns all tag definitions for the given file, with associated key
   * definitions (and their values) embedded. Optional tagId filters by
   * natural ACDB tag_id. Overlay is always applied.
   */
  getAllTagDefinitions(
    fileSystemId: number,
    tagId?: number,
  ): Promise<TagDefinitionReadModel[]>;

  /**
   * Returns a single tag definition for the given file, with associated key
   * definitions (and their values) embedded. Overlay is always applied.
   * Returns null if absent from both DB and session.
   */
  getTagDefinition(
    fileSystemId: number,
    tagSystemId: number,
  ): Promise<TagDefinitionReadModel | null>;
}
```

### 3.3 Registration in `QueryServices`

**File**: `packages/core/src/application/ports/persistence/query-services/query-services.ts`

```typescript
export interface QueryServices {
  // ... existing services ...
  readonly tagDefinitionQueryService: TagDefinitionQueryService;  // NEW
}
```

### 3.4 Query classes (`@arc/core`)

**Location**: `packages/core/src/application/definition/tag-definition/`

```typescript
// get-all/get-all-tag-definitions.query.ts
export class GetAllTagDefinitionsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly tagId: number | undefined,
    clientId: string,
  ) {
    super(clientId);
  }
}

// get-tag/get-tag-definition.query.ts
export class GetTagDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly tagSystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

### 3.5 Handler interfaces (`@arc/core`)

```typescript
// GetAllTagDefinitionsHandler implements QueryHandler<
//   GetAllTagDefinitionsQuery,
//   Promise<TagDefinitionReadModel[]>
// >

// GetTagDefinitionHandler implements QueryHandler<
//   GetTagDefinitionQuery,
//   Promise<TagDefinitionReadModel>
// >
```

---

## 4. Call Flow

### 4.1 `GET /definitions/tags` — list

```
KeyDefinitionController.getTagDefinitions
  IN:  projectId (string), tagDefinitionId? (string)
  OUT: ApiResult<TagDefinitionResponseDto[]>
  │
  │  parse projectId → number, tagDefinitionId? → number
  │  dispatch GetAllTagDefinitionsQuery
  ▼
GetAllTagDefinitionsHandler.handle
  IN:  GetAllTagDefinitionsQuery(projectId, tagId?)
  OUT: TagDefinitionReadModel[]
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId)
  │     → fileSystemId
  │     → throws ResourceNotFoundException if project does not exist
  │
  │  2. tagDefinitionQueryService.getAllTagDefinitions(fileSystemId, tagId?)
  │     → TagDefinitionReadModel[]
  ▼
DbTagDefinitionQueryService.getAllTagDefinitions
  IN:  fileSystemId, tagId?
  OUT: TagDefinitionReadModel[]
  │
  │  ── No active session ────────────────────────────────────────────
  │  Query tag_definitions WHERE file_system_id = fileSystemId
  │  JOIN tag_key_def_links ON tag_definition_system_id = tag_definitions.system_id
  │  JOIN arc_keys ON system_id = tag_key_def_links.key_reference_system_id
  │  JOIN arc_values ON keys_system_id = arc_keys.system_id
  │  [Filter by tagId if provided]
  │  → TagDefinitionReadModel[] (empty array if no match)
  │
  │  ── Active session ───────────────────────────────────────────────
  │  Query tag_definitions WHERE file_system_id = fileSystemId
  │    (with the same joins as above, base rows for overlay)
  │  Apply overlay (ADD / UPDATE / DELETE), one getEditActionsByTable
  │    call per table (arc_values, arc_keys, tag_key_def_links, tag_definitions)
  │  Regroup overlaid values → keys → links → tags
  │  Links whose key resolves to nothing (deleted in session) are dropped
  │  [Filter by tagId if provided, after overlay]
  │  → TagDefinitionReadModel[]
  ▼
Controller
  IN:  TagDefinitionReadModel[]
  OUT: ApiResult<TagDefinitionResponseDto[]>
  │
  │  ResourceNotFoundException thrown upstream → AllExceptionsFilter → HTTP 404
  │  map TagDefinitionReadModel[] → TagDefinitionResponseDto[]
```

---

### 4.2 `GET /definitions/tags/{tagSystemId}` — get by id

```
KeyDefinitionController.getTagDefinition
  IN:  projectId (string), tagSystemId (string)
  OUT: ApiResult<TagDefinitionResponseDto>
  │
  │  parse projectId → number, tagSystemId → number
  │  dispatch GetTagDefinitionQuery
  ▼
GetTagDefinitionHandler.handle
  IN:  GetTagDefinitionQuery(projectId, tagSystemId)
  OUT: TagDefinitionReadModel
  │
  │  1. projectQueryService.getFileIdByProjectId(projectId)
  │     → fileSystemId
  │     → throws ResourceNotFoundException if project does not exist
  │
  │  2. tagDefinitionQueryService.getTagDefinition(fileSystemId, tagSystemId)
  │     → TagDefinitionReadModel | null
  │     → null → handler throws ResourceNotFoundException
  ▼
DbTagDefinitionQueryService.getTagDefinition
  IN:  fileSystemId, tagSystemId
  OUT: TagDefinitionReadModel | null
  │
  │  ── No active session ────────────────────────────────────────────
  │  Query tag_definitions WHERE system_id = tagSystemId
  │    AND file_system_id = fileSystemId
  │  JOIN tag_key_def_links ON tag_definition_system_id = tag_definitions.system_id
  │  JOIN arc_keys ON system_id = tag_key_def_links.key_reference_system_id
  │  JOIN arc_values ON keys_system_id = arc_keys.system_id
  │  → null if no row
  │  → TagDefinitionReadModel
  │
  │  ── Active session ───────────────────────────────────────────────
  │  Query tag_definitions WHERE system_id = tagSystemId AND file_system_id = fileSystemId
  │    (with the same joins as above, base row for overlay; if the row is
  │    absent, still passed through as an empty base list so a session-only
  │    CREATE can resolve)
  │  Apply overlay (ADD / UPDATE / DELETE), one getEditActionsByTable
  │    call per table (arc_values, arc_keys, tag_key_def_links, tag_definitions)
  │  Links whose key resolves to nothing (deleted in session) are dropped
  │  → null if the overlaid tag is absent (deleted in session, or never existed)
  │  → TagDefinitionReadModel
  ▼
Controller
  IN:  TagDefinitionReadModel
  OUT: ApiResult<TagDefinitionResponseDto>
  │
  │  ResourceNotFoundException thrown upstream → AllExceptionsFilter → HTTP 404
  │  map TagDefinitionReadModel → TagDefinitionResponseDto
```

---

## 5. Error Handling

### 5.1 Error table — by layer

| Layer | Condition | Behaviour |
|---|---|---|
| **Controller** | `projectId` not parseable as number | `400 Bad Request` — manual `Number.parseInt` check, throws `BadRequestException` |
| **Controller** | `tagSystemId` not parseable as number | `400 Bad Request` — manual `Number.parseInt` check, throws `BadRequestException` |
| **Handler** | `getFileIdByProjectId` returns null / throws | `ResourceNotFoundException` thrown by `ProjectQueryService` propagates uncaught → `AllExceptionsFilter` maps to `404` |
| **Handler (getTagDefinition)** | Tag not found in DB or deleted in active session | `TagDefinitionQueryService.getTagDefinition` returns `null` → handler throws `ResourceNotFoundException` → `AllExceptionsFilter` maps to `404` |
| **Handler (getAllTagDefinitions)** | `tagDefinitionId` filter matches nothing | `TagDefinitionQueryService.getAllTagDefinitions` returns `[]` → controller returns `200` with empty array |
| **Service** | Any unexpected DB error | Error propagates uncaught → `AllExceptionsFilter` maps to `500` |

---

## 6. Folder Structure

```
packages/core/src/application/
  ports/persistence/query-services/
    query-services.ts                              ← add tagDefinitionQueryService
    tag-definition/
      tag-definition-query-service.ts              ← NEW: port interface
      tag-definition-read-model.ts                 ← NEW: read models

  definition/
    tag-definition/
      get-all/
        get-all-tag-definitions.query.ts           ← NEW
        get-all-tag-definitions.handler.ts         ← NEW
      get-tag/
        get-tag-definition.query.ts                ← NEW
        get-tag-definition.handler.ts              ← NEW

  orchestration/cqrs/registries/
    query-handler-registry.ts                      ← register both handlers

packages/infrastructure/persistence/src/
  persistence-typeorm-sqllite/queries/
    tag-definition/
      db-tag-definition-query-service.ts           ← NEW: DB implementation

  persistence-typeorm-sqllite/queries/
    typeorm-query-services.ts                      ← wire DbTagDefinitionQueryService

packages/api/src/presentation/rest/modules/definition/key-definition/
  key-definition.controller.ts                     ← MODIFY
```
