# Get Container Properties — Low-Level Design

## Endpoint

`GET /arc-api/v1/projects/{projectId}/containers/{containerSystemId}/properties` — returns HTTP 200 with `ApiResult<ContainerPropertiesDto>`

---

## File and Folder Organization

### Core Layer

```
packages/core/src/application/
├── ports/persistence/query-services/
│   ├── container/
│   │   └── container-query-service.ts                              (existing — add findOne)
│   ├── container-property-definition/
│   │   ├── container-property-def-query-service.ts                 (existing — add getAllContainerPropertyDefinitionsWithElements)
│   │   ├── container-property-definition-read-model.ts             (new — ContainerPropertyDefinitionReadModel)
│   │   └── container-property-data/
│   │       ├── container-property-data-query-service.ts            (new — ContainerPropertyDataQueryService)
│   │       └── property-payload-read-model.ts                      (new — PropertyPayloadReadModel)
└── usecase-designer/container/
    └── get-properties/
        ├── get-container-properties.query.ts                       (new)
        ├── get-container-properties.handler.ts                     (new)
        └── property-read-model.ts                                  (new — PropertyReadModel)
```

### Infrastructure Layer

```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/container/
├── db-container-query-service.ts                                   (existing — add findOne)
├── db-container-property-def-query-service.ts                      (existing — add getAllContainerPropertyDefinitionsWithElements)
└── db-container-property-data-query-service.ts                     (new)
```

### Presentation Layer

```
packages/api/src/presentation/rest/modules/container/
└── container.controller.ts                                         (existing — implement getContainerProperties)
```

### Wiring

```
packages/core/src/application/ports/persistence/query-services/
└── query-services.ts                                               (existing — add containerPropertyDataQueryService)

packages/core/src/application/orchestration/cqrs/registries/
└── query-handler-registry.ts                                       (existing — register GetContainerPropertiesQuery + handler)

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/
└── typeorm-query-services.ts                                       (existing — wire DbContainerPropertyDataQueryService)
```

---

## End-to-End Workflow

### Call Flow

1. `ContainerController.getContainerProperties` validates path params, dispatches `GetContainerPropertiesQuery`
2. `GetContainerPropertiesHandler` resolves `fileSystemId`, validates container exists, fetches definitions and payloads in parallel, joins, parses binary, returns `PropertyReadModel[]`
3. Controller maps `PropertyReadModel[]` → `ContainerPropertiesDto`

### Sequence

```
Client
  → ContainerController.getContainerProperties(projectId, containerSystemId)
  → GetContainerPropertiesQuery
  → GetContainerPropertiesHandler
      Step 1: projectQueryService.getFileIdByProjectId(projectId) → fileSystemId
      Step 2: containerQueryService.findOne(containerSystemId, fileSystemId)
              → ResourceNotFoundException if null → 404
      Step 3: Promise.all([
                containerPropertyDefQueryService.getAllContainerPropertyDefinitionsWithElements(fileSystemId),
                containerPropertyDataQueryService.getPropertyPayloads(fileSystemId, containerSystemId),
              ])
      Step 4: defMap = Map<propertySystemId, ContainerPropertyDefinitionReadModel>
              for each PropertyPayloadReadModel:
                def = defMap.get(payload.propertySystemId)
                hasDefinition = def !== undefined
                elements = payload.payload && def
                  ? parseParameterData(payload.payload, def.elementsStructure)
                  : []
                → PropertyReadModel
      returns PropertyReadModel[]
  → ContainerController maps to ContainerPropertiesDto
  → HTTP 200
```

---

## Layer-by-Layer Design

### 1. Core Layer — Read Models

**File:** `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.ts` (new)

```typescript
import type { PropertyDefinitionReadModel } from '../property-definition/property-definition-read-model.js';

export interface ContainerPropertyDefinitionReadModel extends PropertyDefinitionReadModel {
  readonly elementsStructure: string;
}
```

**File:** `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-data/property-payload-read-model.ts` (new)

```typescript
export interface PropertyPayloadReadModel {
  readonly systemId: number;
  readonly propertySystemId: number;
  readonly payload: Uint8Array | null;
}
```

**File:** `packages/core/src/application/usecase-designer/container/get-properties/property-read-model.ts` (new)

```typescript
import type { ElementCalData } from '../../param-parser/types/element-cal-data.js';

export interface PropertyReadModel {
  readonly systemId: number;
  readonly propertyId: number;
  readonly propertyName: string;
  readonly hasDefinition: boolean;
  readonly elements: ElementCalData[];
}
```

### 2. Core Layer — Ports

**File:** `packages/core/src/application/ports/persistence/query-services/container/container-query-service.ts` (existing — add `findOne`)

```typescript
export interface ContainerQueryService {
  findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>>;
  findOne(containerSystemId: number, fileSystemId: number): Promise<ContainerReadModel | null>;
}
```

**File:** `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.ts` (existing — add new method)

```typescript
import type { ContainerPropertyDefinitionReadModel } from './container-property-definition-read-model.js';

export interface ContainerPropertyDefQueryService {
  // existing methods unchanged
  getAllContainerPropertyDefinitions(fileSystemId: number, propertyNaturalId?: number): Promise<Result<PropertyDefinitionSummaryReadModel[]>>;
  getContainerPropertyDefinition(propertySystemId: number, fileSystemId: number): Promise<Result<PropertyDefinitionReadModel>>;

  // new
  getAllContainerPropertyDefinitionsWithElements(fileSystemId: number): Promise<Result<ContainerPropertyDefinitionReadModel[]>>;
}
```

**File:** `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-data/container-property-data-query-service.ts` (new)

```typescript
import type { PropertyPayloadReadModel } from './property-payload-read-model.js';

export interface ContainerPropertyDataQueryService {
  getPropertyPayloads(
    fileSystemId: number,
    containerSystemId: number,
  ): Promise<PropertyPayloadReadModel[]>;
}
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

    // Step 2: validate container exists
    const container = await this.queryServices.containerQueryService
      .findOne(query.containerSystemId, fileSystemId);
    if (!container) {
      throw new ResourceNotFoundException(
        `Container with systemId ${query.containerSystemId} not found`,
      );
    }

    // Step 3: fetch definitions and payloads in parallel
    const [definitionsResult, payloads] = await Promise.all([
      this.queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitionsWithElements(fileSystemId),
      this.queryServices.containerPropertyDataQueryService
        .getPropertyPayloads(fileSystemId, query.containerSystemId),
    ]);

    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(definitionsResult.issues[0]?.message ?? 'Failed to load property definitions');
    }

    // Step 4: join + parse
    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    return this.buildPropertyModels(payloads, defMap);
  }

  private buildPropertyModels(
    payloads: PropertyPayloadReadModel[],
    defMap: Map<number, ContainerPropertyDefinitionReadModel>,
  ): PropertyReadModel[] {
    return payloads.map(p => {
      const def = defMap.get(p.propertySystemId);
      const hasDefinition = def !== undefined;
      const elements: ElementCalData[] =
        p.payload !== null && def !== undefined
          ? parseParameterData(p.payload, def.elementsStructure)
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
}
```

### 4. Infrastructure Layer

**`DbContainerQueryService`** — add `findOne`:

```typescript
async findOne(containerSystemId: number, fileSystemId: number): Promise<ContainerReadModel | null> {
  const baseRow = await this.dataSource
    .getRepository(ENTITY_NAMES.Container)
    .createQueryBuilder('c')
    .where('c.systemId = :containerSystemId AND c.fileSystemId = :fileSystemId', { containerSystemId, fileSystemId })
    .getOne() as ContainerRow | null;

  const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
  const rows = session
    ? overlay
        .applyToCollection(
          baseRow ? [baseRow] : [],
          await this.editActionsSvc.getByTable(session.sessionId, ENTITY_NAMES.Container),
        )
        .map(r => r.effective)
    : baseRow ? [baseRow] : [];

  const row = rows[0];
  return row ? this.toReadModel(row, new Map()) : null;
}
```

**`DbContainerPropertyDefQueryService`** — add `getAllContainerPropertyDefinitionsWithElements`:

```typescript
async getAllContainerPropertyDefinitionsWithElements(
  fileSystemId: number,
): Promise<Result<ContainerPropertyDefinitionReadModel[]>> {
  // same query as getAllContainerPropertyDefinitions
  // mapper includes elementsStructure field
}

private toDetailWithElementsReadModel(row: ContainerPropertyRow): ContainerPropertyDefinitionReadModel {
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

**`DbContainerPropertyDataQueryService`** (new) — follows same pattern as `DbContainerPropertyDefQueryService.getAllContainerPropertyDefinitions`:

```typescript
const overlay = new OverlayMergeImpl();

export class DbContainerPropertyDataQueryService implements ContainerPropertyDataQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQueryService: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  async getPropertyPayloads(
    fileSystemId: number,
    containerSystemId: number,
  ): Promise<PropertyPayloadReadModel[]> {
    // Step 1 — baseline load
    const baseRows = await this.queryPayloadsRaw(containerSystemId);

    // Step 2 — overlay
    const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
    const rows = session
      ? overlay
          .applyToCollection(
            baseRows,
            await this.editActionsQueryService.getByTable(
              session.sessionId,
              ENTITY_NAMES.ContainerPropertyData,
            ),
          )
          .map(r => r.effective)
      : baseRows;

    return rows.map(r => this.toReadModel(r));
  }

  private async queryPayloadsRaw(containerSystemId: number): Promise<ContainerPropertyDataRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.ContainerPropertyData)
      .createQueryBuilder('cpd')
      .where('cpd.containerSystemId = :containerSystemId', { containerSystemId })
      .getMany() as Promise<ContainerPropertyDataRow[]>;
  }

  private toReadModel(row: ContainerPropertyDataRow): PropertyPayloadReadModel {
    return {
      systemId: row.systemId,
      propertySystemId: row.propertySystemId,
      payload: row.payload ?? null,
    };
  }
}
```

### 5. Presentation Layer

#### ContainerController — implement `getContainerProperties`

**File:** `packages/api/src/presentation/rest/modules/container/container.controller.ts` (existing — replace `NotImplementedException`)

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

The `transformElement`, `transformConfigElement`, `transformElementArray`, and `transformStruct` methods are duplicated from `SpfModuleController` for now. Extraction to a shared mapper is deferred — see **Future Work**.

---

## Testing Strategy

### Unit Tests

**`GetContainerPropertiesHandler`** — `get-container-properties.handler.spec.ts`

| Test case | Description |
|---|---|
| Happy path | Payloads and definitions joined correctly; `elements` populated |
| Container not found | `findOne` returns null → throws `ResourceNotFoundException` |
| Payload null | `elements` is empty `[]` |
| No matching definition | `hasDefinition=false`, `elements=[]`, `propertyName=''` |
| Definitions fetch fails | `Result.fail` → throws |

### Integration Tests

**`DbContainerPropertyDataQueryService`** — `db-container-property-data-query-service.spec.ts`

| Tier | Test case |
|---|---|
| Tier 1 (no session) | Returns all payloads for container |
| Tier 2 (session, no changes) | Same as Tier 1 |
| Tier 3 (session + UPDATE) | Payload reflects pending edit |

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

`SpfModuleController` has private methods that map `ElementCalData` → element DTOs:

- `transformElement` (line 848)
- `transformConfigElement` (line 878)
- `transformElementArray` (line 903)
- `transformStruct` (line 917)

`ContainerController` duplicates these for now. Once this feature is stable, extract them to a shared mapper:

- **Target:** `packages/api/src/presentation/rest/common/mappers/element-data.mapper.ts`
- **Exports:** `mapElementToDto`, `mapElementsToDto`

Both controllers then delegate to the shared mapper. This is a pure refactor — no behaviour change.

### Rename `ElementCalData` and move to shared folder

`ElementCalData` and `ElementCalDataBase` are currently defined in
`packages/core/src/application/usecase-designer/spf-module/param-parser/types/element-cal-data.ts`.
The `CalData` suffix is SPF-calibration-specific naming. Since container properties
now also produce this type, both the type and its base should be renamed and relocated:

- **Current:** `packages/core/src/application/usecase-designer/spf-module/param-parser/types/element-cal-data.ts`
- **Target:** `packages/core/src/application/usecase-designer/shared/types/element-data.ts`
- **Rename:** `ElementCalData` → `ElementData`, `ElementCalDataBase` → `ElementDataBase`

All consumers (`GetCkvCalibrationDataHandler`, `GetContainerPropertiesHandler`, DTOs, etc.)
would need to update their imports. This is a pure rename refactor — no behaviour change.
Deferred to avoid scope creep in this feature.
