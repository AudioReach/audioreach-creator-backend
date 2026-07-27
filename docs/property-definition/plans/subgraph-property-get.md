# Subgraph Property Definition GET APIs Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two GET endpoints for subgraph property definitions (list + detail) end-to-end, following the same CQRS pattern already applied to Container property definitions.

**Architecture:** Controller → `QueryBus` → Query → Handler → `QueryServices.subgraphPropertyDefQueryService` (new) → TypeORM query service (DB + session overlay) → read model → DTO. A migration adds `file_system_id` to `subgraph_property_definitions`, sharing the same migration regeneration as the Container property definition change (already applied — see `docs/property-definition/plans/container-property-get.md` Task 1).

**Tech Stack:** NestJS, TypeORM (SQLite), Jest, CQRS (custom `QueryBus`/`QueryHandlerRegistry`), pnpm workspaces (`@arc/core`, `@arc/persistence`, `@arc/api`).

**Spec:** `docs/property-definition/design/subgraph-property-get-design.md`

**Prior work this plan builds on (already implemented — do not recreate):**
- `packages/core/src/application/ports/persistence/query-services/property-definition/property-definition-read-model.ts` — shared `PropertyDefinitionSummaryReadModel` / `PropertyDefinitionReadModel` base (no `elementsStructure` — dropped since `elements` isn't exposed on any property-definition DTO).
- `packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts` — already has a constructor injecting `QueryBus`, and the Container endpoints implemented. This plan adds the two Subgraph endpoints to the same file.
- `packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.module.ts` — already imports `ArcCqrsModule` so `QueryBus` resolves.
- Container's `ContainerPropertyRow.fileSystemId` migration is pending regeneration — **run migration:gen once, after this plan's schema change, to cover both Container and Subgraph in the same migration** (per user instruction). Task 1 Step 2 reflects this.

---

## Task 1: Add `fileSystemId` to `SubgraphPropertyRow` schema

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.ts`

- [ ] **Step 1: Update `SubgraphPropertyRow` interface and schema columns**

Add `fileSystemId: number` to the interface (matching `KeyDefinitionRow.fileSystemId` and the `ContainerPropertyRow.fileSystemId` addition already made), and add the corresponding column + relation to the `EntitySchema`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';
import {PROPERTY_TYPE, type PropertyType} from '@arc/core';

export interface SubgraphPropertyRow extends EntityBaseRow {
  // foreign key to arc_db_file
  fileSystemId: number;

  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyType: PropertyType;
  elementsStructure: string; // JSON
  isVoice: boolean;

  // Relations
  file?: ArcDbFileRow;
}

export const SubgraphPropertyDefinitionSchema =
  new EntitySchema<SubgraphPropertyRow>({
    name: 'SubgraphProperty',
    tableName: 'subgraph_property_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      fileSystemId: {
        name: 'file_system_id',
        type: 'integer',
        nullable: false,
      },
      propertyId: {
        type: 'integer',
        name: 'property_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      maxSize: {
        type: 'integer',
        name: 'max_size',
      },
      propertyType: {
        type: 'simple-enum',
        enum: Object.values(PROPERTY_TYPE),
        name: 'property_type',
      },
      elementsStructure: {
        type: 'text',
        name: 'elements_structure',
        nullable: true,
      },
      isVoice: {
        type: 'boolean',
        name: 'is_voice',
      },
    },
    relations: {
      file: {
        type: 'many-to-one',
        target: 'ArcDbFile',
        joinColumn: {
          name: 'file_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
  });
```

- [ ] **Step 2: Do NOT regenerate the migration yet**

Per user instruction, the migration is regenerated once, after both Container's and Subgraph's schema changes are in place — Container's `fileSystemId` addition (see `docs/property-definition/plans/container-property-get.md` Task 1) has already been made to the schema but the migration has **not** been regenerated yet. Skip migration regeneration in this task. It happens in Task 6 of this plan (final verification task), covering both entities in one migration.

- [ ] **Step 3: Build to verify the schema change compiles**

Run: `pnpm run build:persistence`
Expected: no TypeScript errors. (The migration itself will still reference the old columns until regenerated in Task 6 — that's expected and fine; TypeORM migrations are independent of entity schema files until `migration:run` is executed.)

- [ ] **Step 4: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.ts
  git commit -m "feat(persistence): add fileSystemId to SubgraphPropertyRow" \
             -m "Enables scoping subgraph property definitions to a file via a WHERE clause, matching KeyDefinitionRow and the earlier ContainerPropertyRow change. Migration regeneration deferred to cover both entities in one pass." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 2: Core layer — Subgraph-specific read models and port interface

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.ts`
- Create: `packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-def-query-service.ts`
- Modify: `packages/core/src/application/ports/persistence/query-services/query-services.ts`
- Modify: `packages/core/src/index.ts`

These are plain interfaces with no logic to unit test — TDD steps 1/2/4 (failing test, run, pass) don't apply. Write the types directly, then verify with a build.

Unlike Container (which reuses `PropertyDefinitionSummaryReadModel`/`PropertyDefinitionReadModel` directly since it adds no extra fields), Subgraph needs `isVoice` — so it gets its own extended interfaces.

- [ ] **Step 1: Create the Subgraph-specific read models**

```typescript
// packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PropertyDefinitionSummaryReadModel,
  PropertyDefinitionReadModel,
} from '../property-definition/property-definition-read-model.js';

export interface SubgraphPropertyDefinitionSummaryReadModel
  extends PropertyDefinitionSummaryReadModel {
  readonly isVoice: boolean;
}

export interface SubgraphPropertyDefinitionReadModel
  extends SubgraphPropertyDefinitionSummaryReadModel,
    PropertyDefinitionReadModel {}
```

- [ ] **Step 2: Create the `SubgraphPropertyDefQueryService` port**

```typescript
// packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-def-query-service.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SubgraphPropertyDefinitionSummaryReadModel,
  SubgraphPropertyDefinitionReadModel,
} from './subgraph-property-definition-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

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

- [ ] **Step 3: Register the port on `QueryServices`**

Modify `packages/core/src/application/ports/persistence/query-services/query-services.ts` — add the import and field, right after `containerPropertyDefQueryService`:

```typescript
import type {SubgraphPropertyDefQueryService} from './subgraph-property-definition/subgraph-property-def-query-service.js';
```

```typescript
export interface QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  readonly bulkReadQueryService: BulkReadQueryService;
  readonly spfModuleQueryService: SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
  readonly keyValueDefQueryService: KeyValueDefQueryService;
  readonly tagDefinitionQueryService: TagDefinitionQueryService;
  readonly containerQueryService: ContainerQueryService;
  readonly containerPropertyDefQueryService: ContainerPropertyDefQueryService;
  readonly subgraphPropertyDefQueryService: SubgraphPropertyDefQueryService;
}
```

- [ ] **Step 4: Export the new types from the `@arc/core` barrel**

Modify `packages/core/src/index.ts` — add after the Container property-definition export line (currently line 73):

```typescript
export * from './application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
export * from './application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-def-query-service.js';
```

- [ ] **Step 5: Build to verify the types compile**

Run: `pnpm run build:core`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/ packages/core/src/application/ports/persistence/query-services/query-services.ts packages/core/src/index.ts
  git commit -m "feat(core): add SubgraphPropertyDefQueryService port and read models" \
             -m "SubgraphPropertyDefinitionSummaryReadModel/ReadModel extend the shared PropertyDefinitionReadModel base with isVoice — the one field Container's read model doesn't have." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 3: Core layer — Query/Handler pairs

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.ts`
- Create: `packages/core/src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.ts`
- Create: `packages/core/src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.ts`
- Create: `packages/core/src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.ts`
- Modify: `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/unit/application/definition/subgraph-property-definition/get-all-subgraph-property-definitions.handler.spec.ts`
- Test: `packages/core/tests/unit/application/definition/subgraph-property-definition/get-subgraph-property-definition.handler.spec.ts`

- [ ] **Step 1: Write the failing test for `GetAllSubgraphPropertyDefinitionsHandler`**

```typescript
// packages/core/tests/unit/application/definition/subgraph-property-definition/get-all-subgraph-property-definitions.handler.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllSubgraphPropertyDefinitionsHandler} from '../../../../../src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.js';
import {GetAllSubgraphPropertyDefinitionsQuery} from '../../../../../src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetAllSubgraphPropertyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      subgraphPropertyDefQueryService: {
        getAllSubgraphPropertyDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then lists subgraph property definitions for that file', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const properties: SubgraphPropertyDefinitionSummaryReadModel[] = [
      {
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
        propertyType: PROPERTY_TYPE.Spf,
        isVoice: true,
      },
    ];
    (
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(properties));

    const handler = new GetAllSubgraphPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions,
    ).toHaveBeenCalledWith(42, undefined);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toBe(properties);
  });

  it('passes the propertyDefinitionId filter through to the query service', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    const handler = new GetAllSubgraphPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      7,
      123,
      'client-id',
    );

    await handler.handle(query);

    expect(
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetAllSubgraphPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getAllSubgraphPropertyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-all-subgraph-property-definitions.handler.spec"`
Expected: FAIL — cannot find module `get-all-subgraph-property-definitions.handler.js` (file doesn't exist yet).

- [ ] **Step 3: Write the Query and Handler**

```typescript
// packages/core/src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetAllSubgraphPropertyDefinitionsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly propertyDefinitionId: number | undefined,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

```typescript
// packages/core/src/application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {GetAllSubgraphPropertyDefinitionsQuery} from './get-all-subgraph-property-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handler for GetAllSubgraphPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists subgraph property definitions for that file.
 * Forwards the Result straight through — the controller decides the HTTP status.
 */
export class GetAllSubgraphPropertyDefinitionsHandler
  implements
    QueryHandler<
      GetAllSubgraphPropertyDefinitionsQuery,
      Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>>
    >
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllSubgraphPropertyDefinitionsQuery,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.subgraphPropertyDefQueryService.getAllSubgraphPropertyDefinitions(
      fileId,
      query.propertyDefinitionId,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-all-subgraph-property-definitions.handler.spec"`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `GetSubgraphPropertyDefinitionHandler`**

```typescript
// packages/core/tests/unit/application/definition/subgraph-property-definition/get-subgraph-property-definition.handler.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetSubgraphPropertyDefinitionHandler} from '../../../../../src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.js';
import {GetSubgraphPropertyDefinitionQuery} from '../../../../../src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetSubgraphPropertyDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      subgraphPropertyDefQueryService: {
        getSubgraphPropertyDefinition: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the subgraph property definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const property: SubgraphPropertyDefinitionReadModel = {
      systemId: 1,
      propertyId: 100,
      name: 'MyProperty',
      propertyType: PROPERTY_TYPE.Spf,
      isVoice: true,
      maxSize: 4,
    };
    (
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition as jest.Mock
    ).mockResolvedValue(Result.ok(property));

    const handler = new GetSubgraphPropertyDefinitionHandler(queryServices);
    const query = new GetSubgraphPropertyDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition,
    ).toHaveBeenCalledWith(1, 42);
    expect(result).toBe(property);
  });

  it('throws ResourceNotFoundException when the property definition is not found', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition as jest.Mock
    ).mockResolvedValue(
      Result.fail({
        code: 'ENTITY_NOT_FOUND',
        message: 'SubgraphPropertyDefinition not found for systemId=999',
        severity: IssueSeverity.Error,
      }),
    );

    const handler = new GetSubgraphPropertyDefinitionHandler(queryServices);
    const query = new GetSubgraphPropertyDefinitionQuery(
      7,
      999,
      'client-id',
    );

    await expect(handler.handle(query)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetSubgraphPropertyDefinitionHandler(queryServices);
    const query = new GetSubgraphPropertyDefinitionQuery(7, 1, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.subgraphPropertyDefQueryService
        .getSubgraphPropertyDefinition,
    ).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-subgraph-property-definition.handler.spec"`
Expected: FAIL — cannot find module `get-subgraph-property-definition.handler.js` (file doesn't exist yet).

- [ ] **Step 7: Write the Query and Handler**

```typescript
// packages/core/src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetSubgraphPropertyDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly propertySystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

```typescript
// packages/core/src/application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubgraphPropertyDefinitionReadModel} from '../../../ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetSubgraphPropertyDefinitionQuery} from './get-subgraph-property-definition.query.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

/**
 * Handler for GetSubgraphPropertyDefinitionQuery
 * Resolves projectId → fileId, then loads a single subgraph property
 * definition by system ID.
 */
export class GetSubgraphPropertyDefinitionHandler
  implements
    QueryHandler<
      GetSubgraphPropertyDefinitionQuery,
      Promise<SubgraphPropertyDefinitionReadModel>
    >
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphPropertyDefinitionQuery,
  ): Promise<SubgraphPropertyDefinitionReadModel> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.subgraphPropertyDefQueryService.getSubgraphPropertyDefinition(
        query.propertySystemId,
        fileId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Subgraph property definition with system ID ${query.propertySystemId} not found`,
      );
    }

    return result.data;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-subgraph-property-definition.handler.spec"`
Expected: PASS (3 tests).

- [ ] **Step 9: Register both handlers in `QueryHandlerRegistry`**

Modify `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts` — add imports right after the Container property-definition imports:

```typescript
import {GetAllSubgraphPropertyDefinitionsQuery} from '../../../definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.js';
import {GetAllSubgraphPropertyDefinitionsHandler} from '../../../definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.js';
import {GetSubgraphPropertyDefinitionQuery} from '../../../definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.js';
import {GetSubgraphPropertyDefinitionHandler} from '../../../definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.js';
```

And add registrations inside `registerAllQueryHandlers()`, right after the `GetContainerPropertyDefinitionQuery` registration:

```typescript
    this.queryHandlerFactories.set(GetAllSubgraphPropertyDefinitionsQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetAllSubgraphPropertyDefinitionsHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetSubgraphPropertyDefinitionQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetSubgraphPropertyDefinitionHandler(deps.queryServices),
    });
```

- [ ] **Step 10: Export the new Query/Handler classes from the `@arc/core` barrel**

Modify `packages/core/src/index.ts` — add after the "Container property definition query handlers" block:

```typescript
// Subgraph property definition query handlers
export * from './application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.js';
export * from './application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.js';
export * from './application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.js';
export * from './application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.js';
```

- [ ] **Step 11: Run the full core unit suite**

Run: `pnpm --filter @arc/core run test:unit`
Expected: PASS, no regressions.

- [ ] **Step 12: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/core/src/application/definition/subgraph-property-definition/ packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts packages/core/src/index.ts packages/core/tests/unit/application/definition/subgraph-property-definition/
  git commit -m "feat(core): add Get(All)SubgraphPropertyDefinition query handlers" \
             -m "Mirrors GetKeyDefinitionQuery/GetAllKeyDefinitionsQuery and the Container property definition handlers — resolves projectId to fileId then delegates to SubgraphPropertyDefQueryService." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 4: Persistence layer — `DbSubgraphPropertyDefQueryService`

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/subgraph-property-definition/db-subgraph-property-def-query-service.ts`
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`
- Test: `packages/infrastructure/persistence/tests/integration/queries/subgraph-property-definition/db-subgraph-property-def-query-service.spec.ts`

This is a **complex handler** (2+ branches: no-session / session-no-changes / session-with-changes, for two public methods) — code is written in full below since it's a direct mirror of `DbContainerPropertyDefQueryService` (see `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.ts`), with `isVoice` added to the row-mapping.

- [ ] **Step 1: Write failing integration tests**

```typescript
// packages/infrastructure/persistence/tests/integration/queries/subgraph-property-definition/db-subgraph-property-def-query-service.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import {Repository, DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../../helpers/test-database-setup.js';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  ERROR_CODES,
  RESULT_KIND,
  SOURCE,
} from '@arc/core';
import {DbSubgraphPropertyDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/subgraph-property-definition/db-subgraph-property-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  SubgraphPropertyDefinitionSchema,
  SubgraphPropertyRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  EditActionSchema,
  EditActionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';

describe('DbSubgraphPropertyDefQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let subgraphPropertyRepository: Repository<SubgraphPropertyRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbSubgraphPropertyDefQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    subgraphPropertyRepository = getTestRepository<SubgraphPropertyRow>(
      SubgraphPropertyDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbSubgraphPropertyDefQueryService(
      dataSource,
      new EditActionsQueryService(dataSource.manager),
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFileDependency(): Promise<{fileSystemId: number}> {
    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });

    const file = await arcDbFileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });

    return {fileSystemId: file.systemId};
  }

  async function createSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow> {
    return projectSessionRepository.save({
      fileSystemId,
      userId: 'test-user-123',
      clientId: 'test-client-456',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
  }

  describe('getAllSubgraphPropertyDefinitions', () => {
    it('returns an empty array when the file has no subgraph property definitions (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns all subgraph property definitions for the file, including isVoice (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: true,
      });

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
        isVoice: true,
      });
    });

    it('filters by propertyNaturalId when provided', async () => {
      const {fileSystemId} = await createFileDependency();

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'FirstProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });
      await subgraphPropertyRepository.save({
        systemId: 2,
        fileSystemId,
        propertyId: 200,
        name: 'SecondProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      const result = await service.getAllSubgraphPropertyDefinitions(
        fileSystemId,
        200,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].propertyId).toBe(200);
    });

    it('returns the same result when a session exists but has no pending changes (Tier 2)', async () => {
      const {fileSystemId} = await createFileDependency();
      await createSession(fileSystemId);

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
    });

    it('reflects a pending UPDATE edit action on isVoice (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SubgraphPropertyDefinition,
        targetSystemId: 1,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: 'isVoice',
        newValue: {isVoice: true},
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data[0].isVoice).toBe(true);
    });
  });

  describe('getSubgraphPropertyDefinition', () => {
    it('returns the property definition by systemId (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: true,
      });

      const result = await service.getSubgraphPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.systemId).toBe(1);
      expect(result.data.maxSize).toBe(4);
      expect(result.data.isVoice).toBe(true);
    });

    it('returns Result.fail with ENTITY_NOT_FOUND when the systemId does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getSubgraphPropertyDefinition(
        999,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
      if (result.kind !== RESULT_KIND.Fail) return;
      expect(result.issues[0].code).toBe(ERROR_CODES.ENTITY_NOT_FOUND);
    });

    it('reflects a pending UPDATE edit action (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'OriginalName',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SubgraphPropertyDefinition,
        targetSystemId: 1,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: 'name',
        newValue: {name: 'UpdatedName'},
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result = await service.getSubgraphPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.name).toBe('UpdatedName');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="db-subgraph-property-def-query-service.spec"`
Expected: FAIL — cannot find module `db-subgraph-property-def-query-service.js` (file doesn't exist yet).

- [ ] **Step 3: Write `DbSubgraphPropertyDefQueryService`**

```typescript
// packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/subgraph-property-definition/db-subgraph-property-def-query-service.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SubgraphPropertyDefQueryService,
  type SubgraphPropertyDefinitionSummaryReadModel,
  type SubgraphPropertyDefinitionReadModel,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {SubgraphPropertyRow} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';

export class DbSubgraphPropertyDefQueryService
  implements SubgraphPropertyDefQueryService
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns every subgraph property definition for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag, matching DbContainerPropertyDefQueryService.
   */
  async getAllSubgraphPropertyDefinitions(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>> {
    try {
      // Step 1 — baseline load, all subgraph property definitions scoped to this file
      const baselineRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
        .createQueryBuilder('sp')
        .where('sp.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as SubgraphPropertyRow[];

      // Step 2 — Overlay: table-wide query, not one call per row
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const rows = session
        ? applyToCollection(
            baselineRows,
            await this.editActionsSvc.getByTable(
              session.sessionId,
              ENTITY_NAMES.SubgraphPropertyDefinition,
            ),
          )
        : baselineRows;

      // Step 3 — in-memory filter by natural id, after overlay merge
      const filtered =
        propertyNaturalId === undefined
          ? rows
          : rows.filter(r => r.propertyId === propertyNaturalId);

      return Result.ok(filtered.map(r => this.toSummaryReadModel(r)));
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph property definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns a single subgraph property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   */
  async getSubgraphPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionReadModel>> {
    try {
      const baseRow = (await this.dataSource
        .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
        .createQueryBuilder('sp')
        .where('sp.systemId = :propertySystemId', {propertySystemId})
        .getOne()) as SubgraphPropertyRow | null;

      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const baseRows = baseRow ? [baseRow] : [];
      const rows = session
        ? applyToCollection(
            baseRows,
            (
              await this.editActionsSvc.getByTable(
                session.sessionId,
                ENTITY_NAMES.SubgraphPropertyDefinition,
              )
            ).filter(a => a.targetSystemId === propertySystemId),
          )
        : baseRows;

      const match = rows[0];
      return match
        ? Result.ok(this.toDetailReadModel(match))
        : Result.fail({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `SubgraphPropertyDefinition not found for systemId=${propertySystemId}`,
            severity: IssueSeverity.Error,
          });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph property definition',
        severity: IssueSeverity.Error,
      });
    }
  }

  private toSummaryReadModel(
    row: SubgraphPropertyRow,
  ): SubgraphPropertyDefinitionSummaryReadModel {
    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      name: row.name,
      description: row.description,
      propertyType: row.propertyType,
      isVoice: row.isVoice,
    };
  }

  private toDetailReadModel(
    row: SubgraphPropertyRow,
  ): SubgraphPropertyDefinitionReadModel {
    return {
      ...this.toSummaryReadModel(row),
      maxSize: row.maxSize,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="db-subgraph-property-def-query-service.spec"`
Expected: PASS (all cases above).

- [ ] **Step 5: Wire `DbSubgraphPropertyDefQueryService` into `DbQueryServices`**

Modify `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`:

Add to the `import type {...} from '@arc/core'` block, right after `ContainerPropertyDefQueryService`:

```typescript
  SubgraphPropertyDefQueryService,
```

Add a new import, right after the Container property-definition import:

```typescript
import {DbSubgraphPropertyDefQueryService} from './subgraph-property-definition/db-subgraph-property-def-query-service.js';
```

Add the field declaration, right after `containerPropertyDefQueryService`:

```typescript
  readonly subgraphPropertyDefQueryService: SubgraphPropertyDefQueryService;
```

Add the instantiation in the constructor, right after `this.containerPropertyDefQueryService = new DbContainerPropertyDefQueryService(...)`:

```typescript
    this.subgraphPropertyDefQueryService = new DbSubgraphPropertyDefQueryService(
      dataSource,
      editActionsQueryService,
    );
```

- [ ] **Step 6: Run the full persistence integration suite**

Run: `pnpm --filter @arc/persistence run test:integration`
Expected: PASS, no regressions.

- [ ] **Step 7: Build both packages**

Run: `pnpm run build:core`
Run: `pnpm run build:persistence`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/subgraph-property-definition/ packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts packages/infrastructure/persistence/tests/integration/queries/subgraph-property-definition/
  git commit -m "feat(persistence): add DbSubgraphPropertyDefQueryService" \
             -m "Mirrors DbContainerPropertyDefQueryService, adding isVoice to the row-to-read-model mapping." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 5: Controller wiring

**Package:** `@arc/api`

**Files:**
- Modify: `packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts`
- Modify: `packages/api/src/presentation/rest/modules/definition/property-definition/dto/subgraph-property-definition-detail-response.dto.ts`
- Test: `packages/api/tests/e2e/definition/subgraph-property-definition.e2e-spec.ts`

The controller change is a simple, single-path mapping per endpoint (parse → delegate → map), mirroring the already-implemented Container endpoints in the same file — full code below.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// packages/api/tests/e2e/definition/subgraph-property-definition.e2e-spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Subgraph Property Definition Query E2E (GET /arc-api/v1/projects/{projectId}/definitions/subgraph/properties)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let samplePropertySystemId: string | undefined;
  let samplePropertyId: number | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;

    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000);

    if (!uploadResponse.body?.data?.projectId) {
      console.error(
        'Upload failed:',
        uploadResponse.status,
        JSON.stringify(uploadResponse.body),
      );
      return;
    }

    projectId = uploadResponse.body.data.projectId;

    const listResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/subgraph/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (listResponse.status !== 200) return;

    const properties: any[] = listResponse.body.data ?? [];
    if (properties.length > 0) {
      samplePropertySystemId = String(properties[0].systemId);
      samplePropertyId = properties[0].propertyId;
    }
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return subgraph property definitions with correct summary shape', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/subgraph/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    for (const property of response.body.data) {
      expect(typeof property.systemId).toBe('string');
      expect(typeof property.propertyId).toBe('number');
      expect(typeof property.name).toBe('string');
      expect(typeof property.type).toBe('string');
      expect(typeof property.isVoice).toBe('boolean');
      expect(property.elements).toBeUndefined();
    }
  });

  it('should filter by propertyDefinitionId when provided', async () => {
    if (!projectId || samplePropertyId === undefined) {
      console.warn('No projectId or samplePropertyId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties?propertyDefinitionId=${samplePropertyId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const property of response.body.data) {
      expect(property.propertyId).toBe(samplePropertyId);
    }
  });

  it('should return HTTP 200 with empty array when propertyDefinitionId filter matches nothing', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties?propertyDefinitionId=999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return HTTP 400 when projectId is not a valid number', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/not-a-number/definitions/subgraph/properties')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return a single subgraph property definition by systemId with detail shape', async () => {
    if (!projectId || !samplePropertySystemId) {
      console.warn('No projectId or samplePropertySystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties/${samplePropertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(typeof response.body.data.systemId).toBe('string');
    expect(typeof response.body.data.propertyId).toBe('number');
    expect(typeof response.body.data.name).toBe('string');
    expect(typeof response.body.data.type).toBe('string');
    expect(typeof response.body.data.isVoice).toBe('boolean');
    expect(response.body.data.elements).toBeUndefined();
  });

  it('should return HTTP 404 when propertySystemId does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties/999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return HTTP 400 when propertySystemId is not a valid number', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties/not-a-number`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/api run test:e2e -- --testPathPattern="subgraph-property-definition.e2e-spec"`
Expected: FAIL — endpoints currently throw `NotImplementedException` (501), not the expected 200/400/404s.

- [ ] **Step 3: Remove the `elements` field from `SubgraphPropertyDefinitionDetailResponseDto`**

Modify `packages/api/src/presentation/rest/modules/definition/property-definition/dto/subgraph-property-definition-detail-response.dto.ts` to drop the `elements` field and its now-unused import, matching the decision already applied to `ContainerPropertyDefinitionDetailResponseDto`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubgraphPropertyDefinitionSummaryResponseDto} from './subgraph-property-definition-summary-response.dto.js';

export class SubgraphPropertyDefinitionDetailResponseDto extends SubgraphPropertyDefinitionSummaryResponseDto {}
```

- [ ] **Step 4: Replace the two `NotImplementedException` controller methods**

Modify `packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts`.

Update the `@arc/core` import block — add the four new symbols to the existing import statement:

```typescript
import {
  QueryBus,
  GetAllContainerPropertyDefinitionsQuery,
  GetContainerPropertyDefinitionQuery,
  GetAllSubgraphPropertyDefinitionsQuery,
  GetSubgraphPropertyDefinitionQuery,
  type PropertyDefinitionSummaryReadModel,
  type PropertyDefinitionReadModel,
  type SubgraphPropertyDefinitionSummaryReadModel,
  type SubgraphPropertyDefinitionReadModel,
  type Result,
} from '@arc/core';
```

Next, replace the `getSubgraphPropertyDefinitions` method body:

```typescript
  async getSubgraphPropertyDefinitions(
    @Param('projectId') projectId: string,
    @Query('propertyDefinitionId') propertyDefinitionId?: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionSummaryResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    let parsedPropertyDefinitionId: number | undefined;
    if (propertyDefinitionId !== undefined) {
      parsedPropertyDefinitionId = Number.parseInt(propertyDefinitionId, 10);
      if (Number.isNaN(parsedPropertyDefinitionId)) {
        throw new BadRequestException(
          `Invalid property definition ID: ${propertyDefinitionId}`,
        );
      }
    }

    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      parsedProjectId,
      parsedPropertyDefinitionId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<
        Result<SubgraphPropertyDefinitionSummaryReadModel[]>
      >(query);

    return toApiResult(result, data =>
      data.map(p => this.mapToSubgraphSummaryDto(p)),
    );
  }
```

Next, replace the `getSubgraphPropertyDefinition` method body:

```typescript
  async getSubgraphPropertyDefinition(
    @Param('projectId') projectId: string,
    @Param('propertySystemId') propertySystemId: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionDetailResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedPropertySystemId = Number.parseInt(propertySystemId, 10);
    if (Number.isNaN(parsedPropertySystemId)) {
      throw new BadRequestException(
        `Invalid property system ID: ${propertySystemId}`,
      );
    }

    const query = new GetSubgraphPropertyDefinitionQuery(
      parsedProjectId,
      parsedPropertySystemId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const property =
      await this.queryBus.execute<SubgraphPropertyDefinitionReadModel>(query);

    return {data: this.mapToSubgraphDetailDto(property)};
  }
```

Leave `deleteSpfSubgraphPropertyDefinition` and all Container methods untouched — out of scope for this task.

Finally, add two more private mapping helpers, alongside the existing `mapToSummaryDto`/`mapToDetailDto` (Container) helpers at the bottom of the class:

```typescript

  private mapToSubgraphSummaryDto(
    m: SubgraphPropertyDefinitionSummaryReadModel,
  ): SubgraphPropertyDefinitionSummaryResponseDto {
    const dto = new SubgraphPropertyDefinitionSummaryResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
    dto.isVoice = m.isVoice;
    return dto;
  }

  private mapToSubgraphDetailDto(
    m: SubgraphPropertyDefinitionReadModel,
  ): SubgraphPropertyDefinitionDetailResponseDto {
    const dto = new SubgraphPropertyDefinitionDetailResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
    dto.isVoice = m.isVoice;
    return dto;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @arc/api run test:e2e -- --testPathPattern="subgraph-property-definition.e2e-spec"`
Expected: PASS (all 7 cases; skip-guarded cases pass trivially if no fixture data exists — check console warnings if so).

- [ ] **Step 6: Build the API package**

Run: `pnpm run build:api`
Expected: no TypeScript errors.

- [ ] **Step 7: Run the full API test suite (unit + e2e) to check for regressions**

Run: `pnpm --filter @arc/api run test:unit`
Run: `pnpm --filter @arc/api run test:e2e`
Expected: PASS, no regressions in other controllers (including the Container endpoints in the same file).

- [ ] **Step 8: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts packages/api/src/presentation/rest/modules/definition/property-definition/dto/subgraph-property-definition-detail-response.dto.ts packages/api/tests/e2e/definition/subgraph-property-definition.e2e-spec.ts
  git commit -m "feat(api): implement GET subgraph property definition endpoints" \
             -m "Replaces NotImplementedException stubs with QueryBus-backed handlers, following the Container property definition pattern in the same controller. Removes the unused elements field from SubgraphPropertyDefinitionDetailResponseDto — dropped from the DTO per product decision (see LLD §5.2), matching Container's DTO." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 6: Regenerate the shared migration and run full workspace verification

**Package:** workspace root

**Files:**
- Regenerate: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts` (replaces the current single migration file)
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts`

This task regenerates the single project migration to cover **both** the Container (`ContainerPropertyRow.fileSystemId`, already in the schema since the Container plan) and Subgraph (`SubgraphPropertyRow.fileSystemId`, added in Task 1 of this plan) schema changes in one pass, per user instruction to defer migration regeneration until both entities are ready.

- [ ] **Step 1: Regenerate the single migration**

Per `.ai/context/CLAUDE.md` "Database Migration Workflow" — this project uses one regenerated `initial-create` migration, never hand-written SQL. Run, in order:

```bash
pnpm run build
```

Then delete the current migration file (there is always exactly one):

```bash
rm packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/1784528839947-initial-create.ts
```

Then regenerate it:

```bash
pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create
```

TypeORM creates `<new-timestamp>-initial-create.ts`. Open it and:
1. Add the copyright header at the top:
   ```typescript
   /*
    * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
    * SPDX-License-Identifier: BSD-3-Clause
    */
   ```
2. Change the import to `import type {MigrationInterface, QueryRunner} from 'typeorm';`.

Then update `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts` to import the new class name and timestamp:

```typescript
import {InitialCreate<new-timestamp>} from './migrations/<new-timestamp>-initial-create.js';
export const migrations = [InitialCreate<new-timestamp>];
```

Expected: the generated migration's `up()` includes both `"container_property_definitions"` and `"subgraph_property_definitions"` with new `"file_system_id" integer NOT NULL` columns (and no other unrelated table changes — if it does, something else changed since the last migration; investigate before proceeding).

- [ ] **Step 2: Verify the build and migration apply cleanly**

Run: `pnpm run build`
Expected: no TypeScript errors.

Run: `pnpm run migration:run`
Expected: migration runs without error against the dev SQLite DB.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm run test:unit`
Run: `pnpm run test:integration`
Run: `pnpm run test:e2e`
Expected: PASS across all three, no regressions introduced by this feature or the Container feature.

- [ ] **Step 4: Run lint**

Run: `pnpm run lint`
Expected: no new lint errors in the files touched by this plan or the Container plan.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/ packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts
  git commit -m "chore(persistence): regenerate migration for fileSystemId columns" \
             -m "Covers both ContainerPropertyRow.fileSystemId and SubgraphPropertyRow.fileSystemId in a single regenerated initial-create migration, per project convention (single migration until an external release milestone)." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.
