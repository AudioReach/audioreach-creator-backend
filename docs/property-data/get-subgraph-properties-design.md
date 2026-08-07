# Get Subgraph Properties — Low-Level Design

## Endpoint

`GET /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/properties`

| Status | Condition |
|---|---|
| 200 | All property payloads resolved successfully |
| 207 | One or more property payloads missing — partial data returned with `issues[]` |
| 404 | Project or subgraph not found |

---

## Relationship to Get Container Properties

This feature is structurally identical to **Get Container Properties** (`docs/container/design/get-container-properties-design.md`). The same CQRS pattern, fetcher-based overlay, binary parsing, and read model shapes apply. Differences are called out explicitly below.

### Key differences from container

| Aspect | Container | Subgraph |
|---|---|---|
| Overlay fetcher | `ContainerOverlayFetcher` (existing) | `SubgraphOverlayFetcher` (new — to be created) |
| Payload table | `container_property_data` | `subgraph_property_data` |
| Payload FK column | `propertySystemId` | `subgraphPropertySystemId` |
| Entity name | `ContainerPropertyData` | `SubgraphPropertyData` |
| Definition service | `ContainerPropertyDefQueryService` | `SubgraphPropertyDefQueryService` |
| Definition read model base | `PropertyDefinitionReadModel` | `SubgraphPropertyDefinitionReadModel` (adds `isVoice`) |
| Response DTO | `ContainerPropertiesDto` | `SubgraphPropertiesDto` |
| Controller | `ContainerController` | `SubgraphController` |

### Shared types (no duplication)

`PropertyDataDto` is reused directly from `usecase-designer/shared/property-read-model.ts` — no new file needed.

---

## File and Folder Organization

### Core Layer (rename — part of this PR)

See `get-container-properties-design.md` — `ElementCalData` → `ElementData` rename and move to `domain/entities/definitions/common/types/element-data.ts` applies to this feature too. Import paths in `GetSubgraphPropertiesHandler` use `ElementData` from the new location.

### Core Layer

```
packages/core/src/application/
├── ports/persistence/query-services/
│   ├── shared/
│   │   └── property-payload-read-model.ts                              (existing — defined in get-container-properties, reused here)
│   ├── subgraph/
│   │   └── subgraph-query-service.ts                                   (new — SubgraphQueryService with findPropertyPayloads returning Result<PropertyPayloadReadModel[] | null>)
│   └── subgraph-property-definition/
│       ├── subgraph-property-def-query-service.ts                      (existing — add getAllSubgraphPropertyDefinitionsWithElements)
│       ├── subgraph-property-definition-read-model.ts                  (existing — unchanged)
│       └── subgraph-property-definition-with-elements-read-model.ts    (new — extends SubgraphPropertyDefinitionReadModel + PropertyDefinitionWithElements)
└── usecase-designer/
    ├── shared/
    │   ├── property-definition-with-elements.ts                        (existing — defined in get-container-properties, reused here)
    │   └── build-property-models.ts                                    (existing — defined in get-container-properties, reused here)
    └── subgraph/
        └── get-properties/
            ├── get-subgraph-properties.query.ts                        (new)
            └── get-subgraph-properties.handler.ts                      (new — returns Result<PropertyDataDto[]>)
```

> `PropertyReadModel` and the `shared/` utilities are defined in `get-container-properties` — reused directly here.

### Infrastructure Layer

```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
├── fetchers/
│   └── subgraph-overlay-fetcher.ts                                     (new — mirrors ContainerOverlayFetcher)
└── queries/subgraph/
    ├── db-subgraph-query-service.ts                                    (new — implements findPropertyPayloads delegating to SubgraphOverlayFetcher)
    └── db-subgraph-property-def-query-service.ts                       (existing — add getAllSubgraphPropertyDefinitionsWithElements)
```

> No `DbSubgraphPropertyDataQueryService` is needed — `SubgraphOverlayFetcher` handles both existence check and payload fetch in one call, exactly as `ContainerOverlayFetcher` does for container.

### Presentation Layer

```
packages/api/src/presentation/rest/modules/subgraph/
└── subgraph.controller.ts                                              (existing — implement getSubgraphProperties)
```

### Wiring

```
packages/core/src/application/ports/persistence/query-services/
└── query-services.ts                                                   (existing — add subgraphQueryService)

packages/core/src/application/orchestration/cqrs/registries/
└── query-handler-registry.ts                                           (existing — register GetSubgraphPropertiesQuery + handler)

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/
└── typeorm-query-services.ts                                           (existing — wire DbSubgraphQueryService)
```

---

## End-to-End Workflow

### Key design decision — `SubgraphOverlayFetcher`

No `SubgraphOverlayFetcher` exists yet. Following the same pattern as `ContainerOverlayFetcher`, it is created in `fetchers/subgraph-overlay-fetcher.ts`. It fetches the subgraph row and all its `SubgraphPropertyData` rows in a single call, applying session overlay via `getByAggregateId(sessionId, subgraphSystemId)` — the correct aggregate-scoped overlay that handles CREATE/UPDATE/DELETE for both the subgraph and its property rows.

`DbSubgraphQueryService.findPropertyPayloads` delegates to this fetcher, maps the result to `Result<PropertyPayloadReadModel[] | null>`, keeping `OverlaidSubgraph` internal to the infrastructure layer.

### Sequence

```
Client
  → SubgraphController.getSubgraphProperties(projectId, subgraphSystemId)
  → GetSubgraphPropertiesQuery
  → GetSubgraphPropertiesHandler
      Step 1: projectQueryService.getFileIdByProjectId(projectId) → fileSystemId
      Step 2+3 combined: subgraphQueryService.findPropertyPayloads(subgraphSystemId, fileSystemId)
              → Result.fail → throws
              → Result.ok(null) → ResourceNotFoundException → 404
              → Result.ok(PropertyPayloadReadModel[]) → subgraph exists + property payloads
      Step 4: getAllDetailedSubgraphPropertyDefinitionsWithElements(fileSystemId)
              → SubgraphPropertyDefinitionWithElementsReadModel[]
      Step 5: defMap = Map<systemId, SubgraphPropertyDefinitionWithElementsReadModel>
              buildPropertyModels(payloads, defMap)
                for each def in defMap:
                  payload found → parse elements → PropertyDataDto
                  payload missing → Issue(PROPERTY_PAYLOAD_NOT_FOUND) accumulated
                issues.length > 0 → Result.partial(data, issues)
                issues.length = 0 → Result.ok(data)
      returns Result<PropertyDataDto[]>
  → SubgraphController: toApiResult(result, data => new SubgraphPropertiesDto(...))
  → HTTP 200 (all payloads present) or 207 (one or more payloads missing)
```

---

## Layer-by-Layer Design

### 1. Core Layer — Read Models

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-with-elements-read-model.ts` (new)

```typescript
import type { SubgraphPropertyDefinitionSummaryReadModel } from './subgraph-property-definition-read-model.js';
import type { PropertyDefinitionWithElements } from '../../../../usecase-designer/shared/property-definition-with-elements.js';

export interface SubgraphPropertyDefinitionWithElementsReadModel
  extends SubgraphPropertyDefinitionSummaryReadModel, PropertyDefinitionWithElements {}
```

Extends `SubgraphPropertyDefinitionSummaryReadModel` (adds `isVoice: boolean`) and `PropertyDefinitionWithElements` (which already extends `PropertyDefinitionReadModel` and adds `elementsStructure`).

**Handler output:** reuses `PropertyDataDto` from `usecase-designer/shared/property-read-model.ts`.

### 2. Core Layer — Ports

**File:** `packages/core/src/application/ports/persistence/query-services/subgraph/subgraph-query-service.ts` (new)

```typescript
export interface SubgraphQueryService {
  findPropertyPayloads(subgraphSystemId: number, fileSystemId: number): Promise<Result<PropertyPayloadReadModel[] | null>>;
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
  implements QueryHandler<GetSubgraphPropertiesQuery, Promise<Result<PropertyDataDto[]>>> {

  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetSubgraphPropertiesQuery): Promise<Result<PropertyDataDto[]>> {
    // Step 1: resolve fileSystemId
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    // Step 2+3 combined: existence check + payload fetch via SubgraphOverlayFetcher
    const payloadsResult = await this.queryServices.subgraphQueryService
      .findPropertyPayloads(query.subgraphSystemId, fileSystemId);
    if (payloadsResult.kind === RESULT_KIND.Fail) {
      throw new Error(payloadsResult.issues[0]?.message ?? 'Failed to load subgraph properties');
    }
    if (payloadsResult.data === null) {
      throw new ResourceNotFoundException(
        `Subgraph with systemId ${query.subgraphSystemId} not found`,
      );
    }
    const payloads = payloadsResult.data;

    // Step 4: fetch definitions with elementsStructure
    const definitionsResult = await this.queryServices.subgraphPropertyDefQueryService
      .getAllDetailedSubgraphPropertyDefinitionsWithElements(fileSystemId);
    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(definitionsResult.issues[0]?.message ?? 'Failed to load subgraph property definitions');
    }

    // Step 5: join + parse — missing payloads become issues, not exceptions
    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    return buildPropertyModels(payloads, defMap);
  }
}
```

### 4. Infrastructure Layer

#### 4.1 `SubgraphOverlayFetcher` (new) — mirrors `ContainerOverlayFetcher`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/subgraph-overlay-fetcher.ts`

```typescript
export interface OverlaidSubgraphProperty {
  systemId: number;
  subgraphSystemId: number;
  propertySystemId: number;  // normalised from subgraphPropertySystemId
  payload: unknown;
}

export interface OverlaidSubgraph {
  systemId: number;
  subgraphId: number;
  name: string;
  isExported: boolean;
  fileSystemId: number;
  properties: OverlaidSubgraphProperty[];
}

export class SubgraphOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSubgraph | null> {
    // Load base subgraph row
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select(['s.systemId', 's.subgraphId', 's.name', 's.isExported', 's.fileSystemId'])
      .where('s.systemId = :subgraphSystemId AND s.fileSystemId = :fileSystemId', { subgraphSystemId, fileSystemId })
      .getOne()) as unknown as SubgraphBase | null;

    // Load base property rows (only if subgraph exists)
    let basePropRows: SubgraphPropertyDataBase[] = [];
    if (baseRow !== null) {
      basePropRows = (await this.manager
        .getRepository(ENTITY_NAMES.SubgraphPropertyData)
        .createQueryBuilder('spd')
        .select(['spd.systemId', 'spd.subgraphSystemId', 'spd.subgraphPropertySystemId', 'spd.payload'])
        .where('spd.subgraphSystemId = :subgraphSystemId', { subgraphSystemId })
        .getMany()) as unknown as SubgraphPropertyDataBase[];
    }

    if (sessionId === null) {
      if (baseRow === null) return null;
      return this.assembleSubgraph(baseRow, basePropRows.map(p => this.toOverlaidProperty(p)));
    }

    // Aggregate-scoped overlay — same pattern as ContainerOverlayFetcher
    const actions = await this.editActionsSvc.getByAggregateId(sessionId, subgraphSystemId);
    const subgraphActions = actions.filter(a => a.targetTable === ENTITY_NAMES.Subgraph);
    const propActions = actions.filter(a => a.targetTable === ENTITY_NAMES.SubgraphPropertyData);

    // Handle CREATE (no base row yet)
    const createAction = subgraphActions.find(a => a.operation === CHANGE_OPERATION.Create);
    if (baseRow === null) {
      if (!createAction) return null;
      const payload = createAction.newValue as Partial<SubgraphBase>;
      const createdSubgraph: SubgraphBase = {
        systemId: createAction.targetSystemId,
        subgraphId: payload.subgraphId ?? 0,
        name: payload.name ?? '',
        isExported: payload.isExported ?? false,
        fileSystemId: payload.fileSystemId ?? fileSystemId,
      };
      return this.assembleSubgraph(createdSubgraph, this.buildCreatedProperties(propActions, subgraphSystemId));
    }

    // Apply overlay to subgraph row
    const overlaidSubgraph = applyTableOverlay(
      baseRow as unknown as { systemId: number },
      subgraphActions,
      ENTITY_NAMES.Subgraph,
    ) as SubgraphBase | null;
    if (overlaidSubgraph === null) return null;

    // Apply overlay to property rows
    const overlaidProps = this.overlay.applyToCollection(
      basePropRows as unknown as Array<{ systemId: number }>,
      propActions,
    );

    // Handle CREATE-staged properties not yet in base
    const basePropIds = new Set(basePropRows.map(p => p.systemId));
    const createdProps = this.buildCreatedProperties(
      propActions.filter(a => !basePropIds.has(a.targetSystemId)),
      subgraphSystemId,
    );

    const survivingProps: OverlaidSubgraphProperty[] = [
      ...overlaidProps.map(r => this.toOverlaidProperty(r.effective as unknown as SubgraphPropertyDataBase)),
      ...createdProps,
    ];

    return this.assembleSubgraph(overlaidSubgraph, survivingProps);
  }

  private toOverlaidProperty(p: SubgraphPropertyDataBase): OverlaidSubgraphProperty {
    return {
      systemId: p.systemId,
      subgraphSystemId: p.subgraphSystemId,
      propertySystemId: p.subgraphPropertySystemId,  // normalise FK name
      payload: p.payload,
    };
  }

  private buildCreatedProperties(
    propActions: EditActionRow[],
    subgraphSystemId: number,
  ): OverlaidSubgraphProperty[] {
    return propActions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .map(a => {
        const payload = a.newValue as Partial<SubgraphPropertyDataBase>;
        return {
          systemId: a.targetSystemId,
          subgraphSystemId: payload.subgraphSystemId ?? subgraphSystemId,
          propertySystemId: payload.subgraphPropertySystemId ?? 0,
          payload: payload.payload ?? null,
        };
      });
  }

  private assembleSubgraph(
    subgraph: SubgraphBase,
    props: OverlaidSubgraphProperty[],
  ): OverlaidSubgraph {
    return {
      systemId: subgraph.systemId,
      subgraphId: subgraph.subgraphId,
      name: subgraph.name,
      isExported: subgraph.isExported,
      fileSystemId: subgraph.fileSystemId,
      properties: props,
    };
  }
}
```

#### 4.2 `DbSubgraphQueryService` (new) — delegates to fetcher, maps to `PropertyPayloadReadModel[]`

```typescript
export class DbSubgraphQueryService implements SubgraphQueryService {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {
    this.subgraphFetcher = new SubgraphOverlayFetcher(manager, editActionsSvc);
  }

  async findPropertyPayloads(subgraphSystemId: number, fileSystemId: number): Promise<Result<PropertyPayloadReadModel[] | null>> {
    try {
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaid = await this.subgraphFetcher.fetchOne(
        subgraphSystemId,
        fileSystemId,
        session?.sessionId ?? null,
      );
      if (!overlaid) return Result.ok(null);
      return Result.ok(overlaid.properties.map(p => ({
        systemId: p.systemId,
        propertySystemId: p.propertySystemId,
        payload: p.payload as Uint8Array | null,
      })));
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Failed to load subgraph properties',
        severity: IssueSeverity.Error,
      });
    }
  }
}
```

`OverlaidSubgraph` stays internal to the infrastructure layer — core only sees `PropertyPayloadReadModel[]`.

#### 4.3 `DbSubgraphPropertyDefQueryService` (existing) — add `getAllSubgraphPropertyDefinitionsWithElements`

```typescript
async getAllSubgraphPropertyDefinitionsWithElements(
  fileSystemId: number,
): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel[]>> {
  try {
    const baselineRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
      .createQueryBuilder('sp')
      .where('sp.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as SubgraphPropertyRow[];

    const session = await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
    const rows = session
      ? overlay
          .applyToCollection(
            baselineRows,
            await this.editActionsSvc.getByTable(
              session.sessionId,
              ENTITY_NAMES.SubgraphPropertyDefinition,
            ),
          )
          .map(r => r.effective)
      : baselineRows;

    return Result.ok((rows as SubgraphPropertyRow[]).map(r => this.toDetailWithElementsReadModel(r)));
  } catch (error) {
    return Result.fail({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Failed to load subgraph property definitions',
      severity: IssueSeverity.Error,
    });
  }
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
  const result = await this.queryBus.execute<Result<PropertyDataDto[]>>(query);
  return toApiResult(result, properties =>
    new SubgraphPropertiesDto(properties.map(p => mapPropertyToDto(p))),
  );
}
```

`toApiResult` propagates `Result.partial` issues into `ApiResult.issues`, which `PartialSuccessInterceptor` then upgrades to HTTP 207.

---

## Testing Strategy

### Unit Tests

**`GetSubgraphPropertiesHandler`** — `get-subgraph-properties.handler.spec.ts`

| Test case | Description |
|---|---|
| Happy path | Returns `Result.ok` with `PropertyDataDto[]`; definitions joined; `elements` populated |
| Subgraph not found | `findPropertyPayloads` returns `ok(null)` → throws `ResourceNotFoundException` |
| Payload null | `elements` is empty `[]`, result is `Result.ok` |
| No payload for definition | Returns `Result.partial` with `PROPERTY_PAYLOAD_NOT_FOUND` issue |
| Definitions fetch fails | `Result.fail` → throws |

### Integration Tests

**`DbSubgraphQueryService.findPropertyPayloads`** — `db-subgraph-query-service.spec.ts`

| Tier | Test case |
|---|---|
| No session | Returns `PropertyPayloadReadModel[]` with correct payloads |
| No session | Returns null when `subgraphSystemId` does not exist |
| Session + UPDATE on property | `payload` in returned array reflects pending edit |
| Session + CREATE subgraph | Returns property payloads assembled from CREATE action |
| Session + DELETE subgraph | Returns null |

### E2E Tests

**`get-subgraph-properties.e2e-spec.ts`**

| Test case | HTTP status |
|---|---|
| Happy path | 200 |
| Subgraph not found | 404 |
| Missing payload row (DB row deleted after upload) | 207 — `issues[0].code === 'PROPERTY_PAYLOAD_NOT_FOUND'` |
