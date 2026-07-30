# Get Subgraph Properties — Low-Level Design

## Endpoint

`GET /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/properties` — returns HTTP 200 with `ApiResult<SubgraphPropertiesDto>`

---

## Relationship to Get Container Properties

This feature is structurally identical to **Get Container Properties** (`docs/container/design/get-container-properties-design.md`). The same CQRS pattern, three-tier session overlay, binary parsing, and read model shapes apply. Differences are called out explicitly below.

### Key differences from container

| Aspect | Container | Subgraph |
|---|---|---|
| Payload table | `container_property_data` | `subgraph_property_data` |
| Payload FK column | `propertySystemId` | `subgraphPropertySystemId` |
| Entity name | `ContainerPropertyData` | `SubgraphPropertyData` |
| Definition service | `ContainerPropertyDefQueryService` | `SubgraphPropertyDefQueryService` |
| Definition read model base | `PropertyDefinitionReadModel` | `SubgraphPropertyDefinitionReadModel` (adds `isVoice`) |
| Existence check service | `ContainerQueryService.findOne` | new `SubgraphQueryService.findOne` |
| Response DTO | `ContainerPropertiesDto` | `SubgraphPropertiesDto` |
| Controller | `ContainerController` | `SubgraphController` |

### Shared types (no duplication)

`PropertyPayloadReadModel`, `PropertyReadModel`, and `SubgraphPropertyDefinitionWithElementsReadModel` follow the same shapes. `PropertyPayloadReadModel` normalises the FK to `propertySystemId` regardless of the DB column name, so it can be shared.

---

## File and Folder Organization

### Core Layer

```
packages/core/src/application/
├── ports/persistence/query-services/
│   ├── subgraph/
│   │   └── subgraph-query-service.ts                                   (new — add findOne)
│   └── subgraph-property-definition/
│       ├── subgraph-property-def-query-service.ts                      (existing — add getAllSubgraphPropertyDefinitionsWithElements)
│       ├── subgraph-property-definition-read-model.ts                  (existing — unchanged)
│       ├── subgraph-property-definition-with-elements-read-model.ts    (new — extends SubgraphPropertyDefinitionReadModel + elementsStructure)
│       └── subgraph-property-data/
│           ├── subgraph-property-data-query-service.ts                 (new — SubgraphPropertyDataQueryService)
│           └── subgraph-property-payload-read-model.ts                 (new — SubgraphPropertyPayloadReadModel, mirrors PropertyPayloadReadModel)
└── usecase-designer/subgraph/
    └── get-properties/
        ├── get-subgraph-properties.query.ts                            (new)
        └── get-subgraph-properties.handler.ts                          (new — returns PropertyReadModel[])
```

> **Note:** `PropertyReadModel` (defined in `usecase-designer/container/get-properties/property-read-model.ts`) is reused directly — no new read model needed for the handler output.

### Infrastructure Layer

```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/
├── subgraph/
│   └── db-subgraph-query-service.ts                                    (new — SubgraphQueryService impl with findOne)
└── subgraph-property-definition/
    ├── db-subgraph-property-def-query-service.ts                       (existing — add getAllSubgraphPropertyDefinitionsWithElements)
    └── db-subgraph-property-data-query-service.ts                      (new)
```

### Presentation Layer

```
packages/api/src/presentation/rest/modules/subgraph/
└── subgraph.controller.ts                                              (existing — implement getSubgraphProperties)
```

### Wiring

```
packages/core/src/application/ports/persistence/query-services/
└── query-services.ts                                                   (existing — add subgraphQueryService + subgraphPropertyDataQueryService)

packages/core/src/application/orchestration/cqrs/registries/
└── query-handler-registry.ts                                           (existing — register GetSubgraphPropertiesQuery + handler)

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/
└── typeorm-query-services.ts                                           (existing — wire DbSubgraphQueryService + DbSubgraphPropertyDataQueryService)
```

---

## End-to-End Workflow

### Sequence

```
Client
  → SubgraphController.getSubgraphProperties(projectId, subgraphSystemId)
  → GetSubgraphPropertiesQuery
  → GetSubgraphPropertiesHandler
      Step 1: projectQueryService.getFileIdByProjectId(projectId) → fileSystemId
      Step 2: subgraphQueryService.findOne(subgraphSystemId, fileSystemId)
              → ResourceNotFoundException if null → 404
      Step 3: Promise.all([
                subgraphPropertyDefQueryService.getAllSubgraphPropertyDefinitionsWithElements(fileSystemId),
                subgraphPropertyDataQueryService.getPropertyPayloads(fileSystemId, subgraphSystemId),
              ])
      Step 4: defMap = Map<subgraphPropertySystemId, SubgraphPropertyDefinitionWithElementsReadModel>
              for each SubgraphPropertyPayloadReadModel:
                def = defMap.get(payload.propertySystemId)
                hasDefinition = def !== undefined
                elements = payload.payload && def
                  ? parseParameterData(payload.payload, def.elementsStructure)
                  : []
                → PropertyReadModel
      returns PropertyReadModel[]
  → SubgraphController maps to SubgraphPropertiesDto
  → HTTP 200
```

---

## Layer-by-Layer Design

### 1. Core Layer — Read Models

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-with-elements-read-model.ts` (new)

```typescript
import type { SubgraphPropertyDefinitionReadModel } from './subgraph-property-definition-read-model.js';

export interface SubgraphPropertyDefinitionWithElementsReadModel
  extends SubgraphPropertyDefinitionReadModel {
  readonly elementsStructure: string;
}
```

Extends `SubgraphPropertyDefinitionReadModel` (which already adds `isVoice: boolean` on top of `PropertyDefinitionReadModel`) and adds `elementsStructure` for use by the handler during binary parsing.

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-data/subgraph-property-payload-read-model.ts` (new)

```typescript
export interface SubgraphPropertyPayloadReadModel {
  readonly systemId: number;
  readonly propertySystemId: number;   // normalised from subgraphPropertySystemId in DB
  readonly payload: Uint8Array | null;
}
```

**Handler output:** reuses `PropertyReadModel` from `usecase-designer/container/get-properties/property-read-model.ts` — no new type needed.

### 2. Core Layer — Ports

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph/subgraph-query-service.ts` (new)

```typescript
export interface SubgraphQueryService {
  findOne(subgraphSystemId: number, fileSystemId: number): Promise<SubgraphReadModel | null>;
}
```

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-def-query-service.ts` (existing — add new method)

```typescript
// existing methods unchanged
getAllSubgraphPropertyDefinitions(fileSystemId: number, propertyNaturalId?: number): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>>;
getSubgraphPropertyDefinition(propertySystemId: number, fileSystemId: number): Promise<Result<SubgraphPropertyDefinitionReadModel>>;

// new
getAllSubgraphPropertyDefinitionsWithElements(fileSystemId: number): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel[]>>;
```

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-data/subgraph-property-data-query-service.ts` (new)

```typescript
import type { SubgraphPropertyPayloadReadModel } from './subgraph-property-payload-read-model.js';

export interface SubgraphPropertyDataQueryService {
  getPropertyPayloads(
    fileSystemId: number,
    subgraphSystemId: number,
  ): Promise<SubgraphPropertyPayloadReadModel[]>;
}
```

### 3. Core Layer — CQRS

**File:** `packages/core/src/application/usecase-designer/subgraph/get-properties/get-subgraph-properties.query.ts` (new)

```typescript
export class GetSubgraphPropertiesQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly subgraphSystemId: number;

  constructor(projectId: number, subgraphSystemId: number, clientId: string) {
    super(clientId);
    this.projectId = projectId;
    this.subgraphSystemId = subgraphSystemId;
  }
}
```

**File:** `packages/core/src/application/usecase-designer/subgraph/get-properties/get-subgraph-properties.handler.ts` (new)

```typescript
export class GetSubgraphPropertiesHandler
  implements QueryHandler<GetSubgraphPropertiesQuery, Promise<PropertyReadModel[]>> {

  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetSubgraphPropertiesQuery): Promise<PropertyReadModel[]> {
    // Step 1: resolve fileSystemId
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // Step 2: validate subgraph exists
    const subgraph = await this.queryServices.subgraphQueryService
      .findOne(query.subgraphSystemId, fileSystemId);
    if (!subgraph) {
      throw new ResourceNotFoundException(
        `Subgraph with systemId ${query.subgraphSystemId} not found`,
      );
    }

    // Step 3: fetch definitions and payloads in parallel
    const [definitionsResult, payloads] = await Promise.all([
      this.queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitionsWithElements(fileSystemId),
      this.queryServices.subgraphPropertyDataQueryService
        .getPropertyPayloads(fileSystemId, query.subgraphSystemId),
    ]);

    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(definitionsResult.issues[0]?.message ?? 'Failed to load subgraph property definitions');
    }

    // Step 4: join + parse
    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    return this.buildPropertyModels(payloads, defMap);
  }

  private buildPropertyModels(
    payloads: SubgraphPropertyPayloadReadModel[],
    defMap: Map<number, SubgraphPropertyDefinitionWithElementsReadModel>,
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

**`DbSubgraphQueryService`** (new) — `findOne`:

```typescript
const overlay = new OverlayMergeImpl();

export class DbSubgraphQueryService implements SubgraphQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQueryService: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  async findOne(subgraphSystemId: number, fileSystemId: number): Promise<SubgraphReadModel | null> {
    const baseRow = await this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.systemId = :subgraphSystemId AND s.fileSystemId = :fileSystemId', { subgraphSystemId, fileSystemId })
      .getOne() as SubgraphRow | null;

    const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
    const rows = session
      ? overlay
          .applyToCollection(
            baseRow ? [baseRow] : [],
            await this.editActionsQueryService.getByTable(session.sessionId, ENTITY_NAMES.Subgraph),
          )
          .map(r => r.effective)
      : baseRow ? [baseRow] : [];

    const row = rows[0];
    return row ? this.toReadModel(row as SubgraphRow) : null;
  }

  private toReadModel(row: SubgraphRow): SubgraphReadModel {
    return { systemId: row.systemId, name: row.name };
  }
}
```

**`DbSubgraphPropertyDefQueryService`** — add `getAllSubgraphPropertyDefinitionsWithElements`:

```typescript
async getAllSubgraphPropertyDefinitionsWithElements(
  fileSystemId: number,
): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel[]>> {
  // same query as getAllSubgraphPropertyDefinitions
  // mapper includes elementsStructure field
}

private toDetailWithElementsReadModel(row: SubgraphPropertyRow): SubgraphPropertyDefinitionWithElementsReadModel {
  return {
    systemId: row.systemId,
    propertyId: row.propertyId,
    name: row.name,
    description: row.description,
    propertyType: row.propertyType,
    maxSize: row.maxSize,
    isVoice: row.isVoice ?? false,
    elementsStructure: row.elementsStructure ?? '',
  };
}
```

**`DbSubgraphPropertyDataQueryService`** (new) — follows same pattern as `DbContainerPropertyDefQueryService.getAllContainerPropertyDefinitions`:

```typescript
const overlay = new OverlayMergeImpl();

export class DbSubgraphPropertyDataQueryService implements SubgraphPropertyDataQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQueryService: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  async getPropertyPayloads(
    fileSystemId: number,
    subgraphSystemId: number,
  ): Promise<SubgraphPropertyPayloadReadModel[]> {
    // Step 1 — baseline load
    const baseRows = await this.queryPayloadsRaw(subgraphSystemId);

    // Step 2 — overlay
    const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
    const rows = session
      ? overlay
          .applyToCollection(
            baseRows,
            await this.editActionsQueryService.getByTable(
              session.sessionId,
              ENTITY_NAMES.SubgraphPropertyData,
            ),
          )
          .map(r => r.effective)
      : baseRows;

    return rows.map(r => this.toReadModel(r));
  }

  private async queryPayloadsRaw(subgraphSystemId: number): Promise<SubgraphPropertyDataRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.SubgraphPropertyData)
      .createQueryBuilder('spd')
      .where('spd.subgraphSystemId = :subgraphSystemId', { subgraphSystemId })
      .getMany() as Promise<SubgraphPropertyDataRow[]>;
  }

  private toReadModel(row: SubgraphPropertyDataRow): SubgraphPropertyPayloadReadModel {
    return {
      systemId: row.systemId,
      propertySystemId: row.subgraphPropertySystemId,  // normalise FK name
      payload: row.payload ?? null,
    };
  }
}
```

> **Open question — aggregate ID for session overlay:**
> `subgraphSystemId` is assumed to be the aggregate ID for `SubgraphPropertyData` edit actions, by analogy with the container pattern where `container.repository.ts` sets `aggregateId: container.systemId`. However, no subgraph write repository currently exists in the codebase to confirm this. Additionally, `SubgraphPropertyRow` (the definition schema) does not have a `subgraphPropertyData[]` inverse relation, unlike `ContainerPropertyRow` which has `containerPropertyData?: ContainerPropertyDataRow[]`. This means the two schemas are not fully symmetric. Both the aggregate ID assumption and the missing inverse relation should be verified before the overlay logic is considered complete.

### 5. Presentation Layer

**`SubgraphController.getSubgraphProperties`** — replace `NotImplementedException`:

```typescript
async getSubgraphProperties(
  @Param('projectId') projectId: string,
  @Param('subgraphSystemId') subgraphSystemId: string,
): Promise<ApiResult<SubgraphPropertiesDto>> {
  const query = new GetSubgraphPropertiesQuery(
    Number.parseInt(projectId, 10),
    Number.parseInt(subgraphSystemId, 10),
    'client-id',
  );
  const properties = await this.queryBus.execute<PropertyReadModel[]>(query);
  return ApiResult.ok(
    new SubgraphPropertiesDto(properties.map(p => this.toPropertyDto(p))),
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

The `transformElement` private methods are duplicated from `SpfModuleController` for now — extraction to a shared mapper is deferred (see **Refactoring** in `get-container-properties-design.md`).

---

## Testing Strategy

### Unit Tests

**`GetSubgraphPropertiesHandler`** — `get-subgraph-properties.handler.spec.ts`

| Test case | Description |
|---|---|
| Happy path | Payloads and definitions joined correctly; `elements` populated |
| Subgraph not found | `findOne` returns null → throws `ResourceNotFoundException` |
| Payload null | `elements` is empty `[]` |
| No matching definition | `hasDefinition=false`, `elements=[]`, `propertyName=''` |
| Definitions fetch fails | `Result.fail` → throws |

### Integration Tests

**`DbSubgraphPropertyDataQueryService`** — `db-subgraph-property-data-query-service.spec.ts`

| Tier | Test case |
|---|---|
| Tier 1 (no session) | Returns all payloads for subgraph |
| Tier 2 (session, no changes) | Same as Tier 1 |
| Tier 3 (session + UPDATE) | Payload reflects pending edit |

### E2E Tests

**`get-subgraph-properties.e2e-spec.ts`**

| Test case | HTTP status |
|---|---|
| Happy path | 200 |
| Subgraph not found | 404 |
| Project not found | 404 |
| Unauthenticated | 401 |
