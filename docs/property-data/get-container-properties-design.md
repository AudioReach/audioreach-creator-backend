# Get Container Properties — Low-Level Design

## Endpoint

`GET /arc-api/v1/projects/{projectId}/containers/{containerSystemId}/properties` — returns HTTP 200 with `ApiResult<ContainerPropertiesDto>`

---

## File and Folder Organization
  
### Core Layer (rename — part of this PR)

```
packages/core/src/domain/entities/definitions/common/types/
└── element-data.ts                                                    (new — ElementData, ElementDataBase; replaces element-cal-data.ts)
```

`ElementCalData` and `ElementCalDataBase` are moved from `spf-module/param-parser/types/element-cal-data.ts` to `domain/entities/definitions/common/types/element-data.ts` and renamed to `ElementData` / `ElementDataBase`. Both `ParamDefinition` and `PropertyDefinition` carry `elementsStructure` — `ElementData` is the typed in-memory representation of that binary field and belongs alongside those domain types. All import paths in `get-cal-data`, `get-container-properties`, and `get-subgraph-properties` features are updated.

### Core Layer

```
packages/core/src/application/
├── ports/persistence/query-services/
│   ├── shared/
│   │   └── property-payload-read-model.ts                          (new — PropertyPayloadReadModel, shared by container + subgraph)
│   ├── container/
│   │   └── container-query-service.ts                              (existing — add findOne returning OverlaidContainer shape via fetcher)
│   └── container-property-definition/
│       ├── container-property-def-query-service.ts                 (existing — add getAllContainerPropertyDefinitionsWithElements)
│       └── container-property-definition-with-elements-read-model.ts  (new — ContainerPropertyDefinitionWithElementsReadModel extends PropertyDefinitionWithElements)
└── usecase-designer/
    ├── shared/
    │   ├── property-definition-with-elements.ts                    (new — PropertyDefinitionWithElements interface)
    │   └── build-property-models.ts                                (new — shared buildPropertyModels utility)
    └── container/
        └── get-properties/
            ├── get-container-properties.query.ts                   (new)
            ├── get-container-properties.handler.ts                 (new — returns PropertyReadModel[])
            └── property-read-model.ts                              (new — PropertyReadModel)
```

### Infrastructure Layer

```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
├── fetchers/
│   └── container-overlay-fetcher.ts                               (existing — used as-is, no changes)
└── queries/container/
    └── db-container-query-service.ts                              (existing — add findOne delegating to ContainerOverlayFetcher)
    └── db-container-property-def-query-service.ts                 (existing — add getAllContainerPropertyDefinitionsWithElements)
```

### Presentation Layer

```
packages/api/src/presentation/rest/modules/container/
└── container.controller.ts                                        (existing — implement getContainerProperties)
```

### Wiring

```
packages/core/src/application/ports/persistence/query-services/
└── query-services.ts                                              (existing — no new services needed)

packages/core/src/application/orchestration/cqrs/registries/
└── query-handler-registry.ts                                      (existing — register GetContainerPropertiesQuery + handler)
```

---

## End-to-End Workflow

### Key design decision — `ContainerOverlayFetcher`

`ContainerOverlayFetcher` (already exists in `fetchers/container-overlay-fetcher.ts`) fetches a container row and all its `ContainerPropertyData` rows in a single call, applying session overlay via `getByAggregateId(sessionId, containerSystemId)`. This is the correct aggregate-scoped overlay — it handles CREATE/UPDATE/DELETE for both the container and its property rows in one round-trip.

The design uses this fetcher directly rather than introducing a separate `ContainerPropertyDataQueryService`, which would have duplicated the fetcher's logic and used the wrong overlay scope (`getByTable` fetches all containers' changes in the session rather than scoping to one aggregate).

### Sequence

```
Client
  → ContainerController.getContainerProperties(projectId, containerSystemId)
  → GetContainerPropertiesQuery
  → GetContainerPropertiesHandler
      Step 1: projectQueryService.getFileIdByProjectId(projectId) → fileSystemId
      Step 2+3 combined: containerQueryService.findOne(containerSystemId, fileSystemId)
              → null → ResourceNotFoundException → 404
              → OverlaidContainer (container exists + properties[] already available)
      Step 4: getAllContainerPropertyDefinitionsWithElements(fileSystemId)
              → ContainerPropertyDefinitionWithElementsReadModel[]
      Step 5: defMap = Map<propertySystemId, ContainerPropertyDefinitionWithElementsReadModel>
              for each OverlaidContainerProperty in overlaidContainer.properties:
                def = defMap.get(property.propertySystemId)
                hasDefinition = def !== undefined
                elements = property.payload && def
                  ? parseParameterData(property.payload as Uint8Array, def.elementsStructure)
                  : []
                → PropertyReadModel
      returns PropertyReadModel[]
  → ContainerController maps to ContainerPropertiesDto
  → HTTP 200
```

---

## Layer-by-Layer Design

### 1. Core Layer — Read Models

**File:** `packages/core/src/application/usecase-designer/shared/property-definition-with-elements.ts` (new)

```typescript
import type { PropertyDefinitionReadModel } from '../../ports/persistence/query-services/property-definition/property-definition-read-model.js';

export interface PropertyDefinitionWithElements extends PropertyDefinitionReadModel {
  readonly elementsStructure: string;
}
```

Extends `PropertyDefinitionReadModel` and adds `elementsStructure`. Extended by both `ContainerPropertyDefinitionWithElementsReadModel` and `SubgraphPropertyDefinitionWithElementsReadModel`. `buildPropertyModels` depends only on this interface.

**File:** `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-definition-with-elements-read-model.ts` (new)

```typescript
import type { PropertyDefinitionWithElements } from '../../../../usecase-designer/shared/property-definition-with-elements.js';

export interface ContainerPropertyDefinitionWithElementsReadModel
  extends PropertyDefinitionWithElements {}
```

**File:** `packages/core/src/application/usecase-designer/shared/build-property-models.ts` (new)

```typescript
import type { PropertyPayloadReadModel } from '../../../ports/persistence/query-services/shared/property-payload-read-model.js';
import type { PropertyDefinitionWithElements } from './property-definition-with-elements.js';
import type { PropertyReadModel } from '../container/get-properties/property-read-model.js';
import { parseParameterData } from '../spf-module/param-parser/parse-elements.js';
import type { ElementData } from '../../../../domain/entities/definitions/common/types/element-data.js';

export function buildPropertyModels(
  payloads: PropertyPayloadReadModel[],
  defMap: Map<number, PropertyDefinitionWithElements>,
): PropertyReadModel[] {
  return payloads.map(p => {
    const def = defMap.get(p.propertySystemId);
    const hasDefinition = def !== undefined;
    const elements: ElementData[] =
      p.payload !== null && p.payload !== undefined && def !== undefined
        ? parseParameterData(p.payload as Uint8Array, def.elementsStructure)
        : [];
    return {
      systemId: p.systemId,
      propertyId: def?.propertyId ?? 0,
      propertyName: def?.name ?? '',
      hasDefinition,
      elements,
    };
  });
}
```

**File:** `packages/core/src/application/usecase-designer/container/get-properties/property-read-model.ts` (new)

```typescript
import type { ElementData } from '../../../../../domain/entities/definitions/common/types/element-data.js';

export interface PropertyReadModel {
  readonly systemId: number;
  readonly propertyId: number;
  readonly propertyName: string;
  readonly hasDefinition: boolean;
  readonly elements: ElementData[];
}
```

### 2. Core Layer — Ports

**File:** `packages/core/src/application/ports/persistence/query-services/container/container-query-service.ts` (existing — add `findOne`)

```typescript
import type { OverlaidContainer } from '../../../../../infrastructure/.../container-overlay-fetcher.js';

export interface ContainerQueryService {
  findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>>;
  findOne(containerSystemId: number, fileSystemId: number): Promise<OverlaidContainer | null>;
}
```

> **Note:** `findOne` returns `OverlaidContainer` (from the fetcher) rather than `ContainerReadModel` — it carries `properties[]` which the handler needs. The core port depends on the `OverlaidContainer` type which is defined in the infrastructure layer. If this cross-layer dependency is undesirable, a mirror type can be defined in core — to be decided at implementation.

**File:** `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.ts` (existing — add new method)

```typescript
// existing methods unchanged
getAllContainerPropertyDefinitions(fileSystemId: number, propertyNaturalId?: number): Promise<Result<PropertyDefinitionSummaryReadModel[]>>;
getContainerPropertyDefinition(propertySystemId: number, fileSystemId: number): Promise<Result<PropertyDefinitionReadModel>>;

// new
getAllContainerPropertyDefinitionsWithElements(fileSystemId: number): Promise<Result<ContainerPropertyDefinitionWithElementsReadModel[]>>;
```

### 3. Core Layer — CQRS

**File:** `packages/core/src/application/usecase-designer/container/get-properties/get-container-properties.query.ts` (new)

```typescript
export class GetContainerPropertiesQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly containerSystemId: number;

  constructor(projectId: number, containerSystemId: number, clientId: string) {
    super(clientId);
    this.projectId = projectId;
    this.containerSystemId = containerSystemId;
  }
}
```

**File:** `packages/core/src/application/usecase-designer/container/get-properties/get-container-properties.handler.ts` (new)

```typescript
export class GetContainerPropertiesHandler
  implements QueryHandler<GetContainerPropertiesQuery, Promise<PropertyReadModel[]>> {

  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetContainerPropertiesQuery): Promise<PropertyReadModel[]> {
    // Step 1: resolve fileSystemId
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // Step 2+3 combined: existence check + payload fetch via ContainerOverlayFetcher
    const overlaidContainer = await this.queryServices.containerQueryService
      .findOne(query.containerSystemId, fileSystemId);
    if (!overlaidContainer) {
      throw new ResourceNotFoundException(
        `Container with systemId ${query.containerSystemId} not found`,
      );
    }

    // Step 4: fetch definitions with elementsStructure
    const definitionsResult = await this.queryServices.containerPropertyDefQueryService
      .getAllContainerPropertyDefinitionsWithElements(fileSystemId);

    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(definitionsResult.issues[0]?.message ?? 'Failed to load property definitions');
    }

    // Step 5: join + parse
    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    return buildPropertyModels(overlaidContainer.properties, defMap);
  }
}
```

### 4. Infrastructure Layer

**`DbContainerQueryService`** (existing) — add `findOne`. Constructs a `ContainerOverlayFetcher` (same pattern as `TypeOrmContainerRepository`) and delegates to it after resolving the active session:

```typescript
async findOne(containerSystemId: number, fileSystemId: number): Promise<OverlaidContainer | null> {
  const fetcher = new ContainerOverlayFetcher(this.dataSource.manager, this.editActionsSvc);
  const session = await this.editActionsSvc.findActiveSession(fileSystemId);
  return fetcher.fetchOne(
    containerSystemId,
    fileSystemId,
    session?.sessionId ?? null,
  );
}
```

**`DbContainerPropertyDefQueryService`** (existing) — add `getAllContainerPropertyDefinitionsWithElements`:

```typescript
async getAllContainerPropertyDefinitionsWithElements(
  fileSystemId: number,
): Promise<Result<ContainerPropertyDefinitionWithElementsReadModel[]>> {
  try {
    const baselineRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ContainerProperty)
      .createQueryBuilder('cp')
      .where('cp.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as ContainerPropertyRow[];

    const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
    const rows = session
      ? overlay
          .applyToCollection(
            baselineRows,
            await this.editActionsSvc.getByTable(
              session.sessionId,
              ENTITY_NAMES.ContainerProperty,
            ),
          )
          .map(r => r.effective)
      : baselineRows;

    return Result.ok(rows.map(r => this.toDetailWithElementsReadModel(r)));
  } catch (error) {
    return Result.fail({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to load container property definitions',
      severity: IssueSeverity.Error,
    });
  }
}

private toDetailWithElementsReadModel(row: ContainerPropertyRow): ContainerPropertyDefinitionWithElementsReadModel {
  return {
    systemId: row.systemId,
    propertyId: row.propertyId,
    name: row.name,
    description: row.description,
    propertyType: row.propertyType,
    maxSize: row.maxSize,
    elementsStructure: row.elementsStructure ?? '',
  };
}
```

### 5. Presentation Layer

**`ContainerController.getContainerProperties`** — replace `NotImplementedException`:

```typescript
async getContainerProperties(
  @Param('projectId') projectId: string,
  @Param('containerSystemId') containerSystemId: string,
): Promise<ApiResult<ContainerPropertiesDto>> {
  const query = new GetContainerPropertiesQuery(
    Number.parseInt(projectId, 10),
    Number.parseInt(containerSystemId, 10),
    'client-id',
  );
  const properties = await this.queryBus.execute<PropertyReadModel[]>(query);
  return ApiResult.ok(
    new ContainerPropertiesDto(properties.map(p => this.toPropertyDto(p))),
  );
}

private toPropertyDto(model: PropertyReadModel): PropertyDto {
  const dto = new PropertyDto(
    String(model.systemId),
    model.propertyId,
    model.propertyName,
    model.hasDefinition,
  );
  dto.elements = model.elements.map(e => this.transformElement(e));
  return dto;
}
```

The `transformElement` private methods are duplicated from `SpfModuleController` for now — extraction to a shared mapper is tracked in the **Refactoring** section.

---

## Testing Strategy

### Unit Tests

**`GetContainerPropertiesHandler`** — `get-container-properties.handler.spec.ts`

| Test case | Description |
|---|---|
| Happy path | `findOne` returns overlaid container; payloads and definitions joined; `elements` populated |
| Container not found | `findOne` returns null → throws `ResourceNotFoundException` |
| Payload null | `elements` is empty `[]` |
| No matching definition | `hasDefinition=false`, `elements=[]`, `propertyName=''` |
| Definitions fetch fails | `Result.fail` → throws |

### Integration Tests

**`DbContainerQueryService.findOne`** — `db-container-query-service.spec.ts`

| Tier | Test case |
|---|---|
| No session | Returns `OverlaidContainer` with correct `properties[]` |
| No session | Returns null when `containerSystemId` does not exist |
| Session + UPDATE on property | `payload` in `properties[]` reflects pending edit |
| Session + CREATE container | Container assembled from CREATE action payload |
| Session + DELETE container | Returns null |

### E2E Tests

**`get-container-properties.e2e-spec.ts`**

| Test case | HTTP status |
|---|---|
| Happy path | 200 |
| Container not found | 404 |
| Project not found | 404 |
| Unauthenticated | 401 |

---

## Refactoring

### Extract shared element mapper

`SpfModuleController` has private methods that map `ElementData` → element DTOs:

- `transformElement` (line 848)
- `transformConfigElement` (line 878)
- `transformElementArray` (line 903)
- `transformStruct` (line 917)

`ContainerController` duplicates these for now. Once this feature is stable, extract them to a shared mapper:

- **Target:** `packages/api/src/presentation/rest/common/mappers/element-data.mapper.ts`
- **Exports:** `mapElementToDto`, `mapElementsToDto`

Both controllers then delegate to the shared mapper. This is a pure refactor — no behaviour change.
