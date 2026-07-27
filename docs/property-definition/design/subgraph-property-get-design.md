# LLD — GET Subgraph Property Definition APIs

## 0. Scope

This document is the low-level design for the two already-specified GET
endpoints below. The wire contract is frozen by
[`docs/swagger-api.json`](../../swagger-api.json) (lines 1663–1841); this LLD
describes how they get implemented end-to-end, following the same CQRS
pattern used by `KeyDefinitionController` / `KeyValueDefQueryService`
and already applied to Container property definitions in
[`container-property-get-design.md`](./container-property-get-design.md)
(Approach A there — applied directly here, not re-litigated).

| Method | Path | Purpose |
|---|---|---|
| GET | `/arc-api/v1/projects/{projectId}/definitions/subgraph/properties` | List subgraph property definitions, optional `propertyDefinitionId` query filter |
| GET | `/arc-api/v1/projects/{projectId}/definitions/subgraph/properties/{propertySystemId}` | Single subgraph property definition by system id |

## 1. Requirements

**Functional**
1. List endpoint returns all subgraph property definitions for the
   project, optionally filtered by `propertyDefinitionId` (the natural
   `propertyId`, not `systemId`). Response: `ApiResult<SubgraphPropertyDefinitionSummaryResponseDto[]>`.
2. Detail endpoint returns a single subgraph property definition by
   `systemId`. Response: `ApiResult<SubgraphPropertyDefinitionDetailResponseDto>`.
   `elementsStructure` is not exposed on this DTO — see §5.2.
3. 404 when `projectId` doesn't resolve to a file, or (detail only) the
   `systemId` isn't found — via `ResourceNotFoundException` →
   `ApiResult`, per the swagger 404 response schema.
4. 400 when `projectId`, `propertySystemId`, or `propertyDefinitionId`
   don't parse as integers.
5. End-to-end wiring follows the CQRS pattern already used elsewhere:
   Controller → `QueryBus` → Query → Handler →
   `QueryServices.subgraphPropertyDefQueryService` (new) → TypeORM
   query service → read model → DTO.

## 2. Architecture / Component Flow

```
GET /projects/{projectId}/definitions/subgraph/properties[/{propertySystemId}]
        │
        ▼
PropertyDefinitionController                 (packages/api)
        │  queryBus.execute(query)
        ▼
GetAllSubgraphPropertyDefinitionsQuery /
GetSubgraphPropertyDefinitionQuery            (packages/core, application/definition/subgraph-property-definition)
        │
        ▼
GetAllSubgraphPropertyDefinitionsHandler /
GetSubgraphPropertyDefinitionHandler
        │  projectQueryService.getFileIdByProjectId(projectId)
        │  subgraphPropertyDefQueryService.getAll... / get...
        ▼
SubgraphPropertyDefQueryService                (port — application/ports/persistence/query-services/subgraph-property-definition)
        │  implemented by
        ▼
DbSubgraphPropertyDefQueryService              (packages/infrastructure/persistence)
        │  reads SubgraphPropertyDefinitionSchema (subgraph_property_definitions)
        │  overlay via EditActionsQueryService + OverlayMergeImpl.applyToCollection
        │  (ENTITY_NAMES.SubgraphPropertyDefinition)
        ▼
SubgraphPropertyDefinitionReadModel[] / SubgraphPropertyDefinitionReadModel
```

This mirrors the `KeyDefinition` shape exactly (and the Container
property definition LLD): the controller stays thin (parse → delegate
→ map), the handler resolves `projectId → fileId` then delegates to
the query service, and the query service owns DB + overlay.

## 3. New Types

### 3.1 Read models

**Shared base** — `Container` and `Subgraph` property definition read
models are identical except for `isVoice` (Subgraph-only). Factored
into a common base, mirroring how the DTO layer already does this
(`BasePropertyDescriptionResponseDto` →
`SubgraphPropertyDefinitionSummaryResponseDto extends ... { isVoice }`):

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

**Subgraph-specific** — adds the one field Container doesn't have:

`packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.ts`:

```ts
export interface SubgraphPropertyDefinitionSummaryReadModel
  extends PropertyDefinitionSummaryReadModel {
  readonly isVoice: boolean;
}

export interface SubgraphPropertyDefinitionReadModel
  extends SubgraphPropertyDefinitionSummaryReadModel,
    PropertyDefinitionReadModel {}
```

`isVoice` is backed by an actual `SubgraphPropertyRow.isVoice` column
(see §5.3) — it's the one field the shared base doesn't cover. The
summary/detail split mirrors the DTO split, same rationale as
Container.

### 3.2 Port

`packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-def-query-service.ts`:

```ts
export interface SubgraphPropertyDefQueryService {
  /**
   * Returns all subgraph property definitions for the given file.
   * Optional propertyNaturalId filters by natural ACDB property_id.
   * Overlay is always applied.
   */
  getAllSubgraphPropertyDefinitions(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single subgraph property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   * Result.fail with ERROR_CODES.ENTITY_NOT_FOUND if absent from both.
   */
  getSubgraphPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionReadModel>>;
}
```

Registered on `QueryServices` as `subgraphPropertyDefQueryService`
(`query-services.ts`), instantiated in `DbQueryServices` alongside
`keyValueDefQueryService`/`tagDefinitionQueryService`/(the Container
LLD's) `containerPropertyDefQueryService`.

### 3.3 Query / Handler pairs

`packages/core/src/application/definition/subgraph-property-definition/`:

- `get-all/get-all-subgraph-property-definitions.query.ts` +
  `.handler.ts` — constructor shape `(projectId, propertyDefinitionId?,
  clientId)`, identical to `GetAllKeyDefinitionsQuery`/`Handler`.
- `get-property/get-subgraph-property-definition.query.ts` +
  `.handler.ts` — constructor shape `(projectId, propertySystemId,
  clientId)`, identical to `GetKeyDefinitionQuery`/`Handler`. On
  `RESULT_KIND.Fail` from the query service, throws
  `ResourceNotFoundException`, matching `GetKeyDefinitionHandler`.

Both registered in `QueryHandlerRegistry.registerAllQueryHandlers()`.

## 4. Persistence Implementation

`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/subgraph-property-definition/db-subgraph-property-def-query-service.ts`:

- `getAllSubgraphPropertyDefinitions`: baseline query against
  `SubgraphPropertyDefinitionSchema`. Overlay applied via
  `editActionsSvc.findActiveSession(fileSystemId)` +
  `getEditActionsByTable(session.sessionId, ENTITY_NAMES.SubgraphPropertyDefinition)`
  + `OverlayMergeImpl.applyToCollection` (see `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/edit-session/overlay-merge.ts:75`; the free-function `applyToCollection` at line 227 of that file is `@deprecated`), matching `DbContainerQueryService.findAll`.
  Filter by `propertyNaturalId` (i.e. `propertyId`) applied in-memory
  after overlay merge, matching `getAllKeyDefinitions`'s `keyNaturalId`
  filter.
- `getSubgraphPropertyDefinition`: single-row lookup by `systemId`,
  same DB-then-overlay resolution order as
  `getByKeyDefinition`/`getTagDefinition`. Returns
  `Result.fail(ERROR_CODES.ENTITY_NOT_FOUND)` if absent from both.

**Note:** `SubgraphPropertyRow` had no `fileSystemId` column, unlike
`KeyDefinitionRow` (`arc_keys.file_system_id`), so scoping "all
subgraph property definitions for this file" could not be expressed as
a `WHERE` clause the way `getAllKeyDefinitions` does. **Decision:**
add `fileSystemId` to `SubgraphPropertyRow` via migration, matching
`KeyDefinitionRow.fileSystemId` — this LLD's queries assume that
column exists. This is a single migration shared with Container (see
[`container-property-get-design.md` §4](./container-property-get-design.md#4-persistence-implementation),
which adds the same column to `ContainerPropertyRow`) — noted here
independently since this LLD's methodology (§5.3) compares Subgraph's
own DTO/schema pair only, not against Container.

## 5. Controller Changes

`PropertyDefinitionController` — replace both `NotImplementedException`
bodies (`getSubgraphPropertyDefinitions`, `getSubgraphPropertyDefinition`)
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
by `SubgraphPropertyDefinitionReadModel`:

```ts
private mapToSummaryDto(
  m: SubgraphPropertyDefinitionSummaryReadModel,
): SubgraphPropertyDefinitionSummaryResponseDto {
  const dto = new SubgraphPropertyDefinitionSummaryResponseDto();
  dto.systemId = String(m.systemId);
  dto.propertyId = m.propertyId;
  dto.name = m.name;
  dto.description = m.description ?? '';
  dto.type = m.propertyType as PropertyType;
  dto.isVoice = m.isVoice;
  return dto;
}

private mapToDetailDto(
  m: SubgraphPropertyDefinitionReadModel,
): SubgraphPropertyDefinitionDetailResponseDto {
  const dto = new SubgraphPropertyDefinitionDetailResponseDto();
  dto.systemId = String(m.systemId);
  dto.propertyId = m.propertyId;
  dto.name = m.name;
  dto.description = m.description ?? '';
  dto.type = m.propertyType as PropertyType;
  dto.isVoice = m.isVoice;
  return dto;
}
```

### 5.2 DTO fields with no schema-backed source

**Methodology note:** the gap analysis in this LLD compares Subgraph's
own DTO against Subgraph's own schema only —
`SubgraphPropertyRow` vs `SubgraphPropertyDefinitionSummaryResponseDto`
/ `SubgraphPropertyDefinitionDetailResponseDto` (and the shared base
`BasePropertyDescriptionResponseDto`). Other definition types
(Container, Key, Tag) are out of scope for this comparison — a field
present on another type's schema/DTO but absent on Subgraph's is not,
by itself, treated as a gap here. This is the same methodology applied
in `container-property-get-design.md` §5.2, run independently against
Subgraph's own pair.

Per the same project convention used for Container: any DTO field with
no corresponding column on `SubgraphPropertyRow` is left in the DTO
class, commented out, with a `// TODO:` note naming the missing
column/decision — never populated with a fabricated value. The only
such fields inherited via `BasePropertyDescriptionResponseDto` are
`categoryId`/`categoryName`, already commented out in the existing
code:

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

  // TODO: no `category_id` column on subgraph_property_definitions —
  // per the existing comment here, only relevant when type === SPF.
  // Add the column (and gate by type) if subgraph SPF properties need
  // categorization, else remove this placeholder.
  // @ApiProperty({ description: 'Property category identifier (required when type is SPF)', required: false })
  // categoryId?: number;

  // TODO: no `category_name` column on subgraph_property_definitions —
  // same gap as categoryId above.
  // @ApiProperty({ description: 'Property category name (required when type is SPF)', required: false })
  // categoryName?: string;
}
```

Conversely, schema columns with no DTO-exposed field (`maxSize` on the
summary DTO, `elementsStructure` on both DTOs) are *not* commented into
the DTO — these are intentional response-shaping decisions, not gaps.
`SubgraphPropertyDefinitionDetailResponseDto` no longer declares an
`elements` field: per product decision, the parsed structure of
`elementsStructure` is not exposed on this endpoint (same decision
applied to Container — see
[`container-property-get-design.md` §5.2](./container-property-get-design.md#52-dto-fields-with-no-schema-backed-source)).

### 5.3 DTO ↔ ReadModel mapping

Field-by-field mapping backing `mapToSummaryDto` / `mapToDetailDto`
(§5.1), in the same format as
[`key-definition-query-lld.md` §2.3](../../superpowers/specs/key-definition-query-lld.md#23-response-dtos)
and [`container-property-get-design.md` §5.3](./container-property-get-design.md#53-dto--readmodel-mapping).

**`SubgraphPropertyDefinitionSummaryResponseDto`** — used by the list endpoint

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| `systemId` | `string` | `SubgraphPropertyDefinitionSummaryReadModel.systemId` (number → string) |
| `propertyId` | `number` | `SubgraphPropertyDefinitionSummaryReadModel.propertyId` |
| `name` | `string` | `SubgraphPropertyDefinitionSummaryReadModel.name` |
| `description` | `string` | `SubgraphPropertyDefinitionSummaryReadModel.description` (`?? ''`) |
| `type` | `PropertyType` | `SubgraphPropertyDefinitionSummaryReadModel.propertyType` (renamed) |
| `isVoice` | `boolean` | `SubgraphPropertyDefinitionSummaryReadModel.isVoice` (direct — schema-backed) |

Not mapped: `SubgraphPropertyDefinitionSummaryReadModel.maxSize` /
`.elementsStructure` have no DTO field — intentional summary/detail
split. `categoryId` / `categoryName` exist on the DTO only as
commented-out placeholders with no ReadModel source.

**`SubgraphPropertyDefinitionDetailResponseDto`** — used by the get-by-id endpoint

| DTO field | Type | Source (ReadModel field) |
|---|---|---|
| *(all Summary fields above, via inheritance)* | | |

Not mapped: `SubgraphPropertyDefinitionReadModel.maxSize` has no DTO
field on the detail DTO either — intentional summary/detail split.
`SubgraphPropertyDefinitionReadModel.elementsStructure` is also not
mapped — `elements` was dropped from
`SubgraphPropertyDefinitionDetailResponseDto` (see §5.2). `categoryId`
/ `categoryName` — same as summary table above.

**Conclusion of the DTO ↔ schema comparison:** every field required by
`SubgraphPropertyDefinitionSummaryResponseDto` and
`SubgraphPropertyDefinitionDetailResponseDto` (including `isVoice`) is
backed by an existing `SubgraphPropertyRow` column — there is no DTO
field missing a schema source. (The `fileSystemId` gap noted in §4 is
resolved — added via migration — and isn't a DTO gap in any case: no
DTO field needs it. `elementsStructure` is a schema column with no DTO
field, not a gap — see §5.2.)

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| `projectId` non-numeric | 400 `BadRequestException` |
| `propertySystemId` / `propertyDefinitionId` non-numeric | 400 `BadRequestException` |
| `projectId` doesn't resolve to a file | `getFileIdByProjectId` throws → 404 (existing `ProjectQueryService` behavior, unchanged) |
| List: no properties match filter | 200 with empty array (swagger's 404 is documented at the project/definition-existence level, not empty-filter) |
| Detail: `propertySystemId` not found | Handler throws `ResourceNotFoundException` → 404 `ApiResult` |

## 7. Testing Strategy

- **Unit** — `get-all-subgraph-property-definitions.handler.spec.ts` /
  `get-subgraph-property-definition.handler.spec.ts`, mirroring
  `get-all-key-definitions.handler.spec.ts` /
  `get-key-definition.handler.spec.ts` (mock `QueryServices`).
- **Integration** — `db-subgraph-property-def-query-service.spec.ts`,
  mirroring `db-key-value-def-query-service.spec.ts`: seed rows, assert
  overlay merge behavior via create/update/delete edit actions against
  `ENTITY_NAMES.SubgraphPropertyDefinition`.
  Additionally assert `isVoice` round-trips correctly through overlay
  merge (a field Container's read model doesn't have).
- **Controller** — e2e-style test hitting both routes, asserting the
  200 / 400 / 404 matrix in §6.
