# LLD — GET Container Property Definition APIs

## 0. Scope

This document is the low-level design for the two already-specified GET
endpoints below. The wire contract is frozen by
[`docs/swagger-api.json`](../../swagger-api.json) (lines 1842–2020); this LLD
describes how they get implemented end-to-end, following the existing
CQRS pattern already used by `KeyDefinitionController` /
`KeyValueDefQueryService`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/arc-api/v1/projects/{projectId}/definitions/container/properties` | List container property definitions, optional `propertyDefinitionId` query filter |
| GET | `/arc-api/v1/projects/{projectId}/definitions/container/properties/{propertySystemId}` | Single container property definition by system id |

## 1. Requirements

**Functional**
1. List endpoint returns all container property definitions for the
   project, optionally filtered by `propertyDefinitionId` (the natural
   `propertyId`, not `systemId`). Response: `ApiResult<ContainerPropertyDefinitionSummaryResponseDto[]>`.
2. Detail endpoint returns a single container property definition by
   `systemId`. Response: `ApiResult<ContainerPropertyDefinitionDetailResponseDto>`.
3. 404 when `projectId` doesn't resolve to a file, or (detail only) the
   `systemId` isn't found — via `ResourceNotFoundException` →
   `ApiResult`, per the swagger 404 response schema.
4. 400 when `projectId`, `propertySystemId`, or `propertyDefinitionId`
   don't parse as integers.
5. End-to-end wiring follows the CQRS pattern already used elsewhere:
   Controller → `QueryBus` → Query → Handler →
   `QueryServices.containerPropertyDefQueryService` (new) → TypeORM
   query service → read model → DTO.

## 2. Architecture / Component Flow

```
GET /projects/{projectId}/definitions/container/properties[/{propertySystemId}]
        │
        ▼
PropertyDefinitionController                 (packages/api)
        │  queryBus.execute(query)
        ▼
GetAllContainerPropertyDefinitionsQuery /
GetContainerPropertyDefinitionQuery           (packages/core, application/definition/container-property-definition)
        │
        ▼
GetAllContainerPropertyDefinitionsHandler /
GetContainerPropertyDefinitionHandler
        │  projectQueryService.getFileIdByProjectId(projectId)
        │  containerPropertyDefQueryService.getAll... / get...
        ▼
ContainerPropertyDefQueryService              (port — application/ports/persistence/query-services/container-property-definition)
        │  implemented by
        ▼
DbContainerPropertyDefQueryService            (packages/infrastructure/persistence)
        │  reads ContainerPropertyDefinitionSchema (container_property_definitions)
        │  overlay via EditActionsQueryService + OverlayMergeImpl.applyToCollection
        │  (ENTITY_NAMES.ContainerProperty)
        ▼
ContainerPropertyDefinitionReadModel[] / ContainerPropertyDefinitionReadModel
```

This mirrors the `KeyDefinition` shape exactly: the controller stays
thin (parse → delegate → map), the handler resolves `projectId → fileId`
then delegates to the query service, and the query service owns DB +
overlay.

## 3. New Types

### 3.1 Read models

**Shared base** — `Container` and `Subgraph` property definition
read models share the same identity fields. Factored into a common
base:

`packages/core/src/application/ports/persistence/query-services/property-definition/property-definition-read-model.ts`:

```ts
export interface PropertyDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly propertyId: number;
  readonly name: string;
  readonly description?: string;
  readonly propertyType: PropertyType;
}

export interface PropertyDefinitionReadModel
  extends PropertyDefinitionSummaryReadModel {
  readonly maxSize: number;
  readonly elementsStructure: string; // raw JSON; parsed at DTO-mapping time
}
```

**Container-specific** —
`packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.ts`.
Container adds no fields, so it type-aliases the shared base directly
rather than declaring an empty `extends`:

```ts
export type ContainerPropertyDefinitionSummaryReadModel =
  PropertyDefinitionSummaryReadModel;

export type ContainerPropertyDefinitionReadModel = PropertyDefinitionReadModel;
```


The summary/detail split at the read-model layer mirrors the DTO split
— the list query can select fewer columns than the detail query.

### 3.2 Port

`packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.ts`:

```ts
export interface ContainerPropertyDefQueryService {
  /**
   * Returns all container property definitions for the given file.
   * Optional propertyNaturalId filters by natural ACDB property_id.
   * Overlay is always applied.
   */
  getAllContainerPropertyDefinitions(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<ContainerPropertyDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single container property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   * Result.fail with ERROR_CODES.ENTITY_NOT_FOUND if absent from both.
   */
  getContainerPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<ContainerPropertyDefinitionReadModel>>;
}
```

Registered on `QueryServices` as `containerPropertyDefQueryService`
(`query-services.ts`), instantiated in `DbQueryServices` alongside
`keyValueDefQueryService`/`tagDefinitionQueryService`.

### 3.3 Query / Handler pairs

`packages/core/src/application/definition/container-property-definition/`:

- `get-all/get-all-container-property-definitions.query.ts` +
  `.handler.ts` — constructor shape `(projectId, propertyDefinitionId?,
  clientId)`, identical to `GetAllKeyDefinitionsQuery`/`Handler`.
- `get-property/get-container-property-definition.query.ts` +
  `.handler.ts` — constructor shape `(projectId, propertySystemId,
  clientId)`, identical to `GetKeyDefinitionQuery`/`Handler`. On
  `RESULT_KIND.Fail` from the query service, throws
  `ResourceNotFoundException`, matching `GetKeyDefinitionHandler`.

Both registered in `QueryHandlerRegistry.registerAllQueryHandlers()`.

## 4. Persistence Implementation

`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.ts`:

- `getAllContainerPropertyDefinitions`: baseline query against
  `ContainerPropertyDefinitionSchema`. Overlay applied via
  `editActionsSvc.findActiveSession(fileSystemId)` +
  `getEditActionsByTable(session.sessionId, ENTITY_NAMES.ContainerProperty)`
  + `OverlayMergeImpl.applyToCollection` (see `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/edit-session/overlay-merge.ts:75`; the free-function `applyToCollection` at line 227 of that file is `@deprecated`), matching `DbContainerQueryService.findAll`.
  Filter by `propertyNaturalId` (i.e. `propertyId`) applied in-memory
  after overlay merge, matching `getAllKeyDefinitions`'s `keyNaturalId`
  filter.
- `getContainerPropertyDefinition`: single-row lookup by `systemId`,
  same DB-then-overlay resolution order as
  `getByKeyDefinition`/`getTagDefinition`. Returns
  `Result.fail(ERROR_CODES.ENTITY_NOT_FOUND)` if absent from both.

**Note:** `ContainerPropertyRow` had no `fileSystemId` column,
unlike `KeyDefinitionRow` (`arc_keys.file_system_id`), so scoping "all
container property definitions for this file" could not be expressed
as a `WHERE` clause the way `getAllKeyDefinitions` does. **Decision:**
add `fileSystemId` to `ContainerPropertyRow` via migration, matching
`KeyDefinitionRow.fileSystemId` — this LLD's queries assume that
column exists. This is a single migration shared with Subgraph (see
[`subgraph-property-get-design.md` §4](./subgraph-property-get-design.md#4-persistence-implementation),
which adds the same column to `SubgraphPropertyRow`).
`getAllContainerPropertyDefinitions` / `getContainerPropertyDefinition`
filter/join on this column directly instead of the alternate
`ContainerPropertyData` → `Container.fileSystemId` join (rejected —
that join would only return properties actually *used* by a container
in that file, a different semantic than "all property definitions
belonging to that file").

## 5. Controller Changes

`PropertyDefinitionController` — replace both `NotImplementedException`
bodies (`getContainerPropertyDefinitions`, `getContainerPropertyDefinition`)
with the `KeyDefinitionController` pattern:

- Parse `projectId` / `propertySystemId` / `propertyDefinitionId` as
  integers; `BadRequestException` on `NaN`.
- Build the query, `await this.queryBus.execute(query)`.
- Map read model(s) → DTO via private helpers `mapToSummaryDto` /
  `mapToDetailDto`.
- List: return via `toApiResult(result, data => data.map(mapToSummaryDto))`.
- Detail: handler throws on not-found (no `Result` to unwrap at the
  controller), so return `{data: mapToDetailDto(model)}` directly,
  matching `getKeyDefinition`.

### 5.1 DTO mapping — schema-backed fields only

`mapToSummaryDto` / `mapToDetailDto` populate exactly the fields backed
by `ContainerPropertyDefinitionReadModel`:

```ts
private mapToSummaryDto(
  m: ContainerPropertyDefinitionSummaryReadModel,
): ContainerPropertyDefinitionSummaryResponseDto {
  const dto = new ContainerPropertyDefinitionSummaryResponseDto();
  dto.systemId = String(m.systemId);
  dto.propertyId = m.propertyId;
  dto.name = m.name;
  dto.description = m.description ?? '';
  dto.type = m.propertyType as PropertyType;
  return dto;
}

private mapToDetailDto(
  m: ContainerPropertyDefinitionReadModel,
): ContainerPropertyDefinitionDetailResponseDto {
  const dto = new ContainerPropertyDefinitionDetailResponseDto();
  dto.systemId = String(m.systemId);
  dto.propertyId = m.propertyId;
  dto.name = m.name;
  dto.description = m.description ?? '';
  dto.type = m.propertyType as PropertyType;
  return dto;
}
```

### 5.2 DTO fields with no schema-backed source

**Methodology note:** the gap analysis in this LLD compares Container's
own DTO against Container's own schema only — `ContainerPropertyRow`
vs `ContainerPropertyDefinitionSummaryResponseDto` /
`ContainerPropertyDefinitionDetailResponseDto` (and the shared base
`BasePropertyDescriptionResponseDto`). Sibling definition types
(Subgraph, Key, Tag) are out of scope for this comparison — a field
present on a sibling's schema/DTO but absent on Container's is not, by
itself, treated as a gap here.

Per project convention agreed for this LLD: any DTO field that has no
corresponding column on `ContainerPropertyRow` is left in the DTO
class, commented out, with a `// TODO:` note naming the missing
column/decision — never populated with a fabricated value. This applies
to `BasePropertyDescriptionResponseDto`, which already has this pattern
for `categoryId`/`categoryName`:

```ts
export class BasePropertyDescriptionResponseDto {
  @ApiProperty({description: 'System identifier'})
  systemId!: string;

  @ApiProperty({description: 'Property identifier'})
  propertyId!: number;

  @ApiProperty({description: 'Property name'})
  name!: string;

  @ApiProperty({description: 'Property description'})
  description!: string;

  @ApiProperty({description: 'Property type', enum: PropertyType})
  type!: PropertyType;

  // TODO: no `category_id` column on container_property_definitions —
  // per the existing comment here, only relevant when type === SPF.
  // Add the column (and gate by type) if container SPF properties need
  // categorization, else remove this placeholder.
  // @ApiProperty({ description: 'Property category identifier (required when type is SPF)', required: false })
  // categoryId?: number;

  // TODO: no `category_name` column on container_property_definitions —
  // same gap as categoryId above.
  // @ApiProperty({ description: 'Property category name (required when type is SPF)', required: false })
  // categoryName?: string;
}
```

Conversely, schema columns with no DTO-exposed field (`maxSize` on the
summary DTO, `elementsStructure` on both DTOs) are *not* commented into
the DTO — these are intentional response-shaping decisions, not gaps.
`ContainerPropertyDefinitionDetailResponseDto` no longer declares an
`elements` field: per product decision, the parsed structure of
`elementsStructure` is not exposed on this endpoint.

### 5.3 DTO ↔ ReadModel mapping

Field-by-field mapping backing `mapToSummaryDto` / `mapToDetailDto`
(§5.1), in the same format as
[`key-definition-query-lld.md` §2.3](../../superpowers/specs/key-definition-query-lld.md#23-response-dtos).

**`ContainerPropertyDefinitionSummaryResponseDto`** — used by the list endpoint

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `ContainerPropertyDefinitionSummaryReadModel.systemId` (number → string) |
| `propertyId` | `number` | `ContainerPropertyDefinitionSummaryReadModel.propertyId` |
| `name` | `string` | `ContainerPropertyDefinitionSummaryReadModel.name` |
| `description` | `string` | `ContainerPropertyDefinitionSummaryReadModel.description` (`?? ''`) |
| `type` | `PropertyType` | `ContainerPropertyDefinitionSummaryReadModel.propertyType` (renamed) |

Not mapped: `ContainerPropertyDefinitionSummaryReadModel.maxSize` /
`.elementsStructure` have no DTO field — intentional summary/detail
split. `categoryId` / `categoryName` exist on the DTO only as
commented-out placeholders with no ReadModel source.

**`ContainerPropertyDefinitionDetailResponseDto`** — used by the get-by-id endpoint

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `ContainerPropertyDefinitionReadModel.systemId` (number → string) |
| `propertyId` | `number` | `ContainerPropertyDefinitionReadModel.propertyId` |
| `name` | `string` | `ContainerPropertyDefinitionReadModel.name` |
| `description` | `string` | `ContainerPropertyDefinitionReadModel.description` (`?? ''`) |
| `type` | `PropertyType` | `ContainerPropertyDefinitionReadModel.propertyType` (renamed) |

Not mapped: `ContainerPropertyDefinitionReadModel.maxSize` has no DTO
field on the detail DTO either — intentional summary/detail split.
`ContainerPropertyDefinitionReadModel.elementsStructure` is also not
mapped — `elements` was dropped from
`ContainerPropertyDefinitionDetailResponseDto` (see §5.2). `categoryId`
/ `categoryName` — same as summary table above.


## 6. Error Handling

| Scenario | Behavior |
|---|---|
| `projectId` non-numeric | 400 `BadRequestException` |
| `propertySystemId` / `propertyDefinitionId` non-numeric | 400 `BadRequestException` |
| `projectId` doesn't resolve to a file | `getFileIdByProjectId` throws → 404 (existing `ProjectQueryService` behavior, unchanged) |
| List: no properties match filter | 200 with empty array (swagger's 404 is documented at the project/definition-existence level, not empty-filter) |
| Detail: `propertySystemId` not found | Handler throws `ResourceNotFoundException` → 404 `ApiResult` |

## 7. Testing Strategy

- **Unit** — `get-all-container-property-definitions.handler.spec.ts` /
  `get-container-property-definition.handler.spec.ts`, mirroring
  `get-all-key-definitions.handler.spec.ts` /
  `get-key-definition.handler.spec.ts` (mock `QueryServices`).
- **Integration** — `db-container-property-def-query-service.spec.ts`,
  mirroring `db-key-value-def-query-service.spec.ts`: seed rows, assert
  overlay merge behavior via create/update/delete edit actions against
  `ENTITY_NAMES.ContainerProperty`.
- **Controller** — e2e-style test hitting both routes, asserting the
  200 / 400 / 404 matrix in §6.
