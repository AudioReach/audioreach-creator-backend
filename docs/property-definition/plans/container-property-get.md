# Container Property Definition GET APIs Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two GET endpoints for container property definitions (list + detail) end-to-end, following the existing `KeyDefinition` CQRS query stack pattern.

**Architecture:** Controller → `QueryBus` → Query → Handler → `QueryServices.containerPropertyDefQueryService` (new) → TypeORM query service (DB + session overlay) → read model → DTO. A migration adds `file_system_id` to `container_property_definitions` so "all properties for this file" can be expressed as a `WHERE` clause.

**Tech Stack:** NestJS, TypeORM (SQLite), Jest, CQRS (custom `QueryBus`/`QueryHandlerRegistry`), pnpm workspaces (`@arc/core`, `@arc/persistence`, `@arc/api`).

**Spec:** `docs/property-definition/design/container-property-get-design.md`

---

## Task 1: Add `fileSystemId` to `ContainerPropertyRow` schema

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.ts`

- [ ] **Step 1: Update `ContainerPropertyRow` interface and schema columns**

Add `fileSystemId: number` to the interface (matching `KeyDefinitionRow.fileSystemId` in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.ts`), and add the corresponding column + relation to the `EntitySchema`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {ContainerPropertyDataRow} from '../../usecase-data/container/container-property-data.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';
import {PROPERTY_TYPE, type PropertyType} from '@arc/core';

export interface ContainerPropertyRow extends EntityBaseRow {
  // foreign key to arc_db_file
  fileSystemId: number;

  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyType: PropertyType;
  elementsStructure: string; // JSON

  // Relations
  file?: ArcDbFileRow;
  containerPropertyData?: ContainerPropertyDataRow[];
}

export const ContainerPropertyDefinitionSchema =
  new EntitySchema<ContainerPropertyRow>({
    name: 'ContainerProperty',
    tableName: 'container_property_definitions',
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
      containerPropertyData: {
        type: 'one-to-many',
        target: 'ContainerPropertyData',
        inverseSide: 'containerProperty',
      },
    },
  });
```

- [ ] **Step 2: Regenerate the single migration**

This project uses one regenerated `initial-create` migration (never hand-written SQL) — see `.ai/context/CLAUDE.md` "Database Migration Workflow". Run, in order:

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

Expected: the generated migration's `up()` includes `"container_property_definitions"` with a new `"file_system_id" integer NOT NULL` column (and no other unrelated table changes — if it does, something else changed since the last migration; investigate before proceeding).

- [ ] **Step 3: Verify the build and migration apply cleanly**

Run: `pnpm run build`
Expected: no TypeScript errors.

Run: `pnpm run migration:run`
Expected: migration runs without error against the dev SQLite DB.

- [ ] **Step 4: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.ts packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/ packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts
  git commit -m "feat(persistence): add fileSystemId to ContainerPropertyRow" \
             -m "Enables scoping container property definitions to a file via a WHERE clause, matching KeyDefinitionRow." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 2: Core layer — read models and port interface

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/query-services/property-definition/property-definition-read-model.ts`
- Create: `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.ts`
- Create: `packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.ts`
- Modify: `packages/core/src/application/ports/persistence/query-services/query-services.ts`
- Modify: `packages/core/src/index.ts`

These are plain interfaces/types with no logic to unit test — TDD steps 1/2/4 (failing test, run, pass) don't apply. Write the types directly, then verify with a build.

- [ ] **Step 1: Create the shared `PropertyDefinitionReadModel` base**

```typescript
// packages/core/src/application/ports/persistence/query-services/property-definition/property-definition-read-model.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PropertyType} from '../../../../../domain/entities/definitions/common/entities/property-definition.js';

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
  readonly elementsStructure: string; // raw JSON; not exposed on the DTO (see LLD §5.2)
}
```

- [ ] **Step 2: Create the Container-specific read model aliases**

```typescript
// packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PropertyDefinitionSummaryReadModel,
  PropertyDefinitionReadModel,
} from '../property-definition/property-definition-read-model.js';

export type ContainerPropertyDefinitionSummaryReadModel =
  PropertyDefinitionSummaryReadModel;

export type ContainerPropertyDefinitionReadModel = PropertyDefinitionReadModel;
```

- [ ] **Step 3: Create the `ContainerPropertyDefQueryService` port**

```typescript
// packages/core/src/application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ContainerPropertyDefinitionSummaryReadModel,
  ContainerPropertyDefinitionReadModel,
} from './container-property-definition-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

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

- [ ] **Step 4: Register the port on `QueryServices`**

Modify `packages/core/src/application/ports/persistence/query-services/query-services.ts` — add the import and field, matching the existing `keyValueDefQueryService` line:

```typescript
import type {ContainerPropertyDefQueryService} from './container-property-definition/container-property-def-query-service.js';
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
}
```

- [ ] **Step 5: Export the new types from the `@arc/core` barrel**

Modify `packages/core/src/index.ts` — add these two lines near the other query-service exports (after the `container` query-service exports, around line 69):

```typescript
export * from './application/ports/persistence/query-services/property-definition/property-definition-read-model.js';
export * from './application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.js';
export * from './application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.js';
```

- [ ] **Step 6: Build to verify the types compile**

Run: `pnpm run build:core`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/core/src/application/ports/persistence/query-services/property-definition/ packages/core/src/application/ports/persistence/query-services/container-property-definition/ packages/core/src/application/ports/persistence/query-services/query-services.ts packages/core/src/index.ts
  git commit -m "feat(core): add ContainerPropertyDefQueryService port and read models" \
             -m "PropertyDefinitionReadModel is a shared base for Container and Subgraph property definitions. Container adds no fields beyond the base." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 3: Core layer — Query/Handler pairs

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.query.ts`
- Create: `packages/core/src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.handler.ts`
- Create: `packages/core/src/application/definition/container-property-definition/get-property/get-container-property-definition.query.ts`
- Create: `packages/core/src/application/definition/container-property-definition/get-property/get-container-property-definition.handler.ts`
- Modify: `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/unit/application/definition/container-property-definition/get-all-container-property-definitions.handler.spec.ts`
- Test: `packages/core/tests/unit/application/definition/container-property-definition/get-container-property-definition.handler.spec.ts`

- [ ] **Step 1: Write the failing test for `GetAllContainerPropertyDefinitionsHandler`**

```typescript
// packages/core/tests/unit/application/definition/container-property-definition/get-all-container-property-definitions.handler.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllContainerPropertyDefinitionsHandler} from '../../../../../src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.handler.js';
import {GetAllContainerPropertyDefinitionsQuery} from '../../../../../src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.query.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {ContainerPropertyDefinitionSummaryReadModel} from '../../../../../src/application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetAllContainerPropertyDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      containerPropertyDefQueryService: {
        getAllContainerPropertyDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then lists container property definitions for that file', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const properties: ContainerPropertyDefinitionSummaryReadModel[] = [
      {
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
        propertyType: PROPERTY_TYPE.Spf,
      },
    ];
    (
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(properties));

    const handler = new GetAllContainerPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllContainerPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitions,
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
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    const handler = new GetAllContainerPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllContainerPropertyDefinitionsQuery(
      7,
      123,
      'client-id',
    );

    await handler.handle(query);

    expect(
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitions,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetAllContainerPropertyDefinitionsHandler(
      queryServices,
    );
    const query = new GetAllContainerPropertyDefinitionsQuery(
      7,
      undefined,
      'client-id',
    );

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.containerPropertyDefQueryService
        .getAllContainerPropertyDefinitions,
    ).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-all-container-property-definitions.handler.spec"`
Expected: FAIL — cannot find module `get-all-container-property-definitions.handler.js` (file doesn't exist yet).

- [ ] **Step 3: Write the Query and Handler**

```typescript
// packages/core/src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.query.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetAllContainerPropertyDefinitionsQuery extends BaseQuery {
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
// packages/core/src/application/definition/container-property-definition/get-all/get-all-container-property-definitions.handler.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ContainerPropertyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/container-property-definition/container-property-definition-read-model.js';
import {GetAllContainerPropertyDefinitionsQuery} from './get-all-container-property-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handler for GetAllContainerPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists container property definitions for that file.
 * Forwards the Result straight through — the controller decides the HTTP status.
 */
export class GetAllContainerPropertyDefinitionsHandler
  implements
    QueryHandler<
      GetAllContainerPropertyDefinitionsQuery,
      Promise<Result<ContainerPropertyDefinitionSummaryReadModel[]>>
    >
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllContainerPropertyDefinitionsQuery,
  ): Promise<Result<ContainerPropertyDefinitionSummaryReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    return this.queryServices.containerPropertyDefQueryService.getAllContainerPropertyDefinitions(
      fileId,
      query.propertyDefinitionId,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-all-container-property-definitions.handler.spec"`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `GetContainerPropertyDefinitionHandler`**

```typescript
// packages/core/tests/unit/application/definition/container-property-definition/get-container-property-definition.handler.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetContainerPropertyDefinitionHandler} from '../../../../../src/application/definition/container-property-definition/get-property/get-container-property-definition.handler.js';
import {GetContainerPropertyDefinitionQuery} from '../../../../../src/application/definition/container-property-definition/get-property/get-container-property-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {Result} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {ContainerPropertyDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/container-property-definition/container-property-definition-read-model.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

describe('GetContainerPropertyDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      containerPropertyDefQueryService: {
        getContainerPropertyDefinition: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the container property definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const property: ContainerPropertyDefinitionReadModel = {
      systemId: 1,
      propertyId: 100,
      name: 'MyProperty',
      propertyType: PROPERTY_TYPE.Spf,
      maxSize: 4,
      elementsStructure: '[]',
    };
    (
      queryServices.containerPropertyDefQueryService
        .getContainerPropertyDefinition as jest.Mock
    ).mockResolvedValue(Result.ok(property));

    const handler = new GetContainerPropertyDefinitionHandler(queryServices);
    const query = new GetContainerPropertyDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.containerPropertyDefQueryService
        .getContainerPropertyDefinition,
    ).toHaveBeenCalledWith(1, 42);
    expect(result).toBe(property);
  });

  it('throws ResourceNotFoundException when the property definition is not found', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.containerPropertyDefQueryService
        .getContainerPropertyDefinition as jest.Mock
    ).mockResolvedValue(
      Result.fail({
        code: 'ENTITY_NOT_FOUND',
        message: 'ContainerPropertyDefinition not found for systemId=999',
        severity: IssueSeverity.Error,
      }),
    );

    const handler = new GetContainerPropertyDefinitionHandler(queryServices);
    const query = new GetContainerPropertyDefinitionQuery(
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

    const handler = new GetContainerPropertyDefinitionHandler(queryServices);
    const query = new GetContainerPropertyDefinitionQuery(7, 1, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.containerPropertyDefQueryService
        .getContainerPropertyDefinition,
    ).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-container-property-definition.handler.spec"`
Expected: FAIL — cannot find module `get-container-property-definition.handler.js` (file doesn't exist yet).

- [ ] **Step 7: Write the Query and Handler**

```typescript
// packages/core/src/application/definition/container-property-definition/get-property/get-container-property-definition.query.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetContainerPropertyDefinitionQuery extends BaseQuery {
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
// packages/core/src/application/definition/container-property-definition/get-property/get-container-property-definition.handler.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ContainerPropertyDefinitionReadModel} from '../../../ports/persistence/query-services/container-property-definition/container-property-definition-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetContainerPropertyDefinitionQuery} from './get-container-property-definition.query.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

/**
 * Handler for GetContainerPropertyDefinitionQuery
 * Resolves projectId → fileId, then loads a single container property
 * definition by system ID.
 */
export class GetContainerPropertyDefinitionHandler
  implements
    QueryHandler<
      GetContainerPropertyDefinitionQuery,
      Promise<ContainerPropertyDefinitionReadModel>
    >
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetContainerPropertyDefinitionQuery,
  ): Promise<ContainerPropertyDefinitionReadModel> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.containerPropertyDefQueryService.getContainerPropertyDefinition(
        query.propertySystemId,
        fileId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Container property definition with system ID ${query.propertySystemId} not found`,
      );
    }

    return result.data;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:unit -- --testPathPattern="get-container-property-definition.handler.spec"`
Expected: PASS (3 tests).

- [ ] **Step 9: Register both handlers in `QueryHandlerRegistry`**

Modify `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts` — add imports near the other definition query imports:

```typescript
import {GetAllContainerPropertyDefinitionsQuery} from '../../../definition/container-property-definition/get-all/get-all-container-property-definitions.query.js';
import {GetAllContainerPropertyDefinitionsHandler} from '../../../definition/container-property-definition/get-all/get-all-container-property-definitions.handler.js';
import {GetContainerPropertyDefinitionQuery} from '../../../definition/container-property-definition/get-property/get-container-property-definition.query.js';
import {GetContainerPropertyDefinitionHandler} from '../../../definition/container-property-definition/get-property/get-container-property-definition.handler.js';
```

And add registrations inside `registerAllQueryHandlers()`, after the `GetTagDefinitionQuery` registration:

```typescript
    this.queryHandlerFactories.set(GetAllContainerPropertyDefinitionsQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetAllContainerPropertyDefinitionsHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetContainerPropertyDefinitionQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetContainerPropertyDefinitionHandler(deps.queryServices),
    });
```

- [ ] **Step 10: Export the new Query/Handler classes from the `@arc/core` barrel**

Modify `packages/core/src/index.ts` — add after the "Tag definition query handlers" block (around line 83):

```typescript
// Container property definition query handlers
export * from './application/definition/container-property-definition/get-all/get-all-container-property-definitions.query.js';
export * from './application/definition/container-property-definition/get-all/get-all-container-property-definitions.handler.js';
export * from './application/definition/container-property-definition/get-property/get-container-property-definition.query.js';
export * from './application/definition/container-property-definition/get-property/get-container-property-definition.handler.js';
```

- [ ] **Step 11: Run the full core unit suite**

Run: `pnpm --filter @arc/core run test:unit`
Expected: PASS, no regressions.

- [ ] **Step 12: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/core/src/application/definition/container-property-definition/ packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts packages/core/src/index.ts packages/core/tests/unit/application/definition/container-property-definition/
  git commit -m "feat(core): add Get(All)ContainerPropertyDefinition query handlers" \
             -m "Mirrors GetKeyDefinitionQuery/GetAllKeyDefinitionsQuery — resolves projectId to fileId then delegates to ContainerPropertyDefQueryService." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 4: Persistence layer — `DbContainerPropertyDefQueryService`

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.ts`
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`
- Test: `packages/infrastructure/persistence/tests/integration/queries/container-property-definition/db-container-property-def-query-service.spec.ts`

This is a **complex handler** (2+ branches: no-session / session-no-changes / session-with-changes, for two public methods) — code is written in full below since the pattern is a direct, well-established mirror of `DbContainerQueryService.findAll` (table-wide overlay) combined with the single-row overlay pattern from `DbKeyValueDefQueryService.getByKeyDefinition`. Tests are written with representative cases per the "Testing Strategy" in the spec, not exhaustively enumerated — extend with more cases if you find gaps while implementing.

- [ ] **Step 1: Write failing integration tests**

```typescript
// packages/infrastructure/persistence/tests/integration/queries/container-property-definition/db-container-property-def-query-service.spec.ts
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
import {CHANGE_OPERATION, CHANGE_STATUS, RESULT_KIND, SOURCE} from '@arc/core';
import {DbContainerPropertyDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ContainerPropertyDefinitionSchema,
  ContainerPropertyRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.js';
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

describe('DbContainerPropertyDefQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let containerPropertyRepository: Repository<ContainerPropertyRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbContainerPropertyDefQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    containerPropertyRepository = getTestRepository<ContainerPropertyRow>(
      ContainerPropertyDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbContainerPropertyDefQueryService(
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

  describe('getAllContainerPropertyDefinitions', () => {
    it('returns an empty array when the file has no container property definitions (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns all container property definitions for the file (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
      });
    });

    it('filters by propertyNaturalId when provided', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'FirstProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });
      await containerPropertyRepository.save({
        systemId: 2,
        fileSystemId,
        propertyId: 200,
        name: 'SecondProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result = await service.getAllContainerPropertyDefinitions(
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

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
    });

    it('reflects a pending UPDATE edit action on name (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'OriginalName',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ContainerProperty,
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

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data[0].name).toBe('UpdatedName');
    });
  });

  describe('getContainerPropertyDefinition', () => {
    it('returns the property definition by systemId (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result = await service.getContainerPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.systemId).toBe(1);
      expect(result.data.elementsStructure).toBe('[]');
    });

    it('returns Result.fail with ENTITY_NOT_FOUND when the systemId does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getContainerPropertyDefinition(
        999,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
      if (result.kind !== RESULT_KIND.Fail) return;
      expect(result.issues[0].code).toBe('ENTITY_NOT_FOUND');
    });

    it('reflects a pending UPDATE edit action (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'OriginalName',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ContainerProperty,
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

      const result = await service.getContainerPropertyDefinition(
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

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="db-container-property-def-query-service.spec"`
Expected: FAIL — cannot find module `db-container-property-def-query-service.js` (file doesn't exist yet).

- [ ] **Step 3: Write `DbContainerPropertyDefQueryService`**

```typescript
// packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type ContainerPropertyDefQueryService,
  type ContainerPropertyDefinitionSummaryReadModel,
  type ContainerPropertyDefinitionReadModel,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ContainerPropertyRow} from '../../entity-schema/definitions/container/container-property-definition.schema.js';

export class DbContainerPropertyDefQueryService
  implements ContainerPropertyDefQueryService
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns every container property definition for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag, matching DbContainerQueryService.findAll.
   */
  async getAllContainerPropertyDefinitions(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<ContainerPropertyDefinitionSummaryReadModel[]>> {
    try {
      // Step 1 — baseline load, all container property definitions scoped to this file
      const baselineRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.ContainerProperty)
        .createQueryBuilder('cp')
        .where('cp.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as ContainerPropertyRow[];

      // Step 2 — Overlay: table-wide query, not one call per row
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const rows = session
        ? applyToCollection(
            baselineRows,
            await this.editActionsSvc.getByTable(
              session.sessionId,
              ENTITY_NAMES.ContainerProperty,
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
            : 'Failed to load container property definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns a single container property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   */
  async getContainerPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<ContainerPropertyDefinitionReadModel>> {
    try {
      const baseRow = (await this.dataSource
        .getRepository(ENTITY_NAMES.ContainerProperty)
        .createQueryBuilder('cp')
        .where('cp.systemId = :propertySystemId', {propertySystemId})
        .getOne()) as ContainerPropertyRow | null;

      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const baseRows = baseRow ? [baseRow] : [];
      const rows = session
        ? applyToCollection(
            baseRows,
            (
              await this.editActionsSvc.getByTable(
                session.sessionId,
                ENTITY_NAMES.ContainerProperty,
              )
            ).filter(a => a.targetSystemId === propertySystemId),
          )
        : baseRows;

      const match = rows[0];
      return match
        ? Result.ok(this.toDetailReadModel(match))
        : Result.fail({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `ContainerPropertyDefinition not found for systemId=${propertySystemId}`,
            severity: IssueSeverity.Error,
          });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load container property definition',
        severity: IssueSeverity.Error,
      });
    }
  }

  private toSummaryReadModel(
    row: ContainerPropertyRow,
  ): ContainerPropertyDefinitionSummaryReadModel {
    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      name: row.name,
      description: row.description,
      propertyType: row.propertyType,
    };
  }

  private toDetailReadModel(
    row: ContainerPropertyRow,
  ): ContainerPropertyDefinitionReadModel {
    return {
      ...this.toSummaryReadModel(row),
      maxSize: row.maxSize,
      elementsStructure: row.elementsStructure,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="db-container-property-def-query-service.spec"`
Expected: PASS (all cases above).

- [ ] **Step 5: Wire `DbContainerPropertyDefQueryService` into `DbQueryServices`**

Modify `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`:

Add to the `import type {...} from '@arc/core'` block:

```typescript
  ContainerPropertyDefQueryService,
```

Add a new import:

```typescript
import {DbContainerPropertyDefQueryService} from './container-property-definition/db-container-property-def-query-service.js';
```

Add the field declaration:

```typescript
  readonly containerPropertyDefQueryService: ContainerPropertyDefQueryService;
```

Add the instantiation in the constructor, after `this.containerQueryService = new DbContainerQueryService(...)`:

```typescript
    this.containerPropertyDefQueryService = new DbContainerPropertyDefQueryService(
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
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/container-property-definition/ packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts packages/infrastructure/persistence/tests/integration/queries/container-property-definition/
  git commit -m "feat(persistence): add DbContainerPropertyDefQueryService" \
             -m "Mirrors DbContainerQueryService.findAll for the list query and DbKeyValueDefQueryService.getByKeyDefinition's overlay resolution order for the detail query." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 5: Controller wiring

**Package:** `@arc/api`

**Files:**
- Modify: `packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts`
- Test: `packages/api/tests/e2e/definition/container-property-definition.e2e-spec.ts`

The controller change is a simple, single-path mapping per endpoint (parse → delegate → map) — full code below.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// packages/api/tests/e2e/definition/container-property-definition.e2e-spec.ts
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

describe('Container Property Definition Query E2E (GET /arc-api/v1/projects/{projectId}/definitions/container/properties)', () => {
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
      .get(`/arc-api/v1/projects/${projectId}/definitions/container/properties`)
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

  it('should return container property definitions with correct summary shape', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/container/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    for (const property of response.body.data) {
      expect(typeof property.systemId).toBe('string');
      expect(typeof property.propertyId).toBe('number');
      expect(typeof property.name).toBe('string');
      expect(typeof property.type).toBe('string');
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
        `/arc-api/v1/projects/${projectId}/definitions/container/properties?propertyDefinitionId=${samplePropertyId}`,
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
        `/arc-api/v1/projects/${projectId}/definitions/container/properties?propertyDefinitionId=999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return HTTP 400 when projectId is not a valid number', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/not-a-number/definitions/container/properties')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return a single container property definition by systemId with detail shape', async () => {
    if (!projectId || !samplePropertySystemId) {
      console.warn('No projectId or samplePropertySystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/container/properties/${samplePropertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(typeof response.body.data.systemId).toBe('string');
    expect(typeof response.body.data.propertyId).toBe('number');
    expect(typeof response.body.data.name).toBe('string');
    expect(typeof response.body.data.type).toBe('string');
    expect(response.body.data.elements).toBeUndefined();
  });

  it('should return HTTP 404 when propertySystemId does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/container/properties/999999999`,
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
        `/arc-api/v1/projects/${projectId}/definitions/container/properties/not-a-number`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/api run test:e2e -- --testPathPattern="container-property-definition.e2e-spec"`
Expected: FAIL — endpoints currently throw `NotImplementedException` (501), not the expected 200/400/404s.

- [ ] **Step 3: Replace the two `NotImplementedException` controller methods**

Modify `packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts`.

First, update the imports at the top of the file — replace:

```typescript
import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotImplementedException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {SubgraphPropertyDefinitionDetailResponseDto} from './dto/subgraph-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionDetailResponseDto} from './dto/container-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionSummaryResponseDto} from './dto/container-property-definition-summary-response.dto.js';
import {SubgraphPropertyDefinitionSummaryResponseDto} from './dto/subgraph-property-definition-summary-response.dto.js';
```

with:

```typescript
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotImplementedException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  QueryBus,
  GetAllContainerPropertyDefinitionsQuery,
  GetContainerPropertyDefinitionQuery,
  type ContainerPropertyDefinitionSummaryReadModel,
  type ContainerPropertyDefinitionReadModel,
  type Result,
  type PropertyType as CorePropertyType,
} from '@arc/core';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {toApiResult} from '../../../common/result/to-api-result.js';
import {SubgraphPropertyDefinitionDetailResponseDto} from './dto/subgraph-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionDetailResponseDto} from './dto/container-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionSummaryResponseDto} from './dto/container-property-definition-summary-response.dto.js';
import {SubgraphPropertyDefinitionSummaryResponseDto} from './dto/subgraph-property-definition-summary-response.dto.js';
import {PropertyType} from './enums/property-type.enum.js';
```

Next, add the constructor (the class currently has none — it's stateless):

```typescript
export class PropertyDefinitionController {
  constructor(private readonly queryBus: QueryBus) {}
```

Next, replace the `getContainerPropertyDefinitions` method body:

```typescript
  async getContainerPropertyDefinitions(
    @Param('projectId') projectId: string,
    @Query('propertyDefinitionId') propertyDefinitionId?: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionSummaryResponseDto[]>> {
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

    const query = new GetAllContainerPropertyDefinitionsQuery(
      parsedProjectId,
      parsedPropertyDefinitionId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<
        Result<ContainerPropertyDefinitionSummaryReadModel[]>
      >(query);

    return toApiResult(result, data => data.map(p => this.mapToSummaryDto(p)));
  }
```

Next, replace the `getContainerPropertyDefinition` method body:

```typescript
  async getContainerPropertyDefinition(
    @Param('projectId') projectId: string,
    @Param('propertySystemId') propertySystemId: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionDetailResponseDto>> {
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

    const query = new GetContainerPropertyDefinitionQuery(
      parsedProjectId,
      parsedPropertySystemId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const property =
      await this.queryBus.execute<ContainerPropertyDefinitionReadModel>(
        query,
      );

    return {data: this.mapToDetailDto(property)};
  }
```

Leave `deleteContainerPropertyDefinition` and the Subgraph methods untouched — out of scope for this plan.

Finally, add the two private mapping helpers at the bottom of the class, right before the closing `}`:

```typescript

  // ── Private helpers ───────────────────────────────────────────────────────

  private mapToSummaryDto(
    m: ContainerPropertyDefinitionSummaryReadModel,
  ): ContainerPropertyDefinitionSummaryResponseDto {
    const dto = new ContainerPropertyDefinitionSummaryResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
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
    dto.type = m.propertyType as unknown as PropertyType;
    return dto;
  }
```

Note: `m.propertyType` is core's `PropertyType` (`'SPF' | 'DRIVER'` string union from `@arc/core`); `dto.type` is the API layer's `PropertyType` enum (`property-definition/enums/property-type.enum.ts`) whose members have the same string values (`Spf = 'SPF'`, `Driver = 'DRIVER'`). The cast through `unknown` matches the existing LLD code sample (`m.propertyType as PropertyType`) — no runtime conversion needed since the string values are identical.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/api run test:e2e -- --testPathPattern="container-property-definition.e2e-spec"`
Expected: PASS (all 7 cases; skip-guarded cases pass trivially if no fixture data exists — check console warnings if so).

- [ ] **Step 5: Build the API package**

Run: `pnpm run build:api`
Expected: no TypeScript errors.

- [ ] **Step 6: Run the full API test suite (unit + e2e) to check for regressions**

Run: `pnpm --filter @arc/api run test:unit`
Run: `pnpm --filter @arc/api run test:e2e`
Expected: PASS, no regressions in other controllers.

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add packages/api/src/presentation/rest/modules/definition/property-definition/property-definition.controller.ts packages/api/tests/e2e/definition/container-property-definition.e2e-spec.ts
  git commit -m "feat(api): implement GET container property definition endpoints" \
             -m "Replaces NotImplementedException stubs with QueryBus-backed handlers, following the KeyDefinitionController pattern. elements is not mapped — dropped from the DTO per product decision (see LLD §5.2)." \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.

---

## Task 6: Full workspace verification

**Package:** workspace root

**Files:** none (verification only)

- [ ] **Step 1: Run the full build**

Run: `pnpm run build`
Expected: all packages (`@arc/core`, `@arc/persistence`, `@arc/api`) build with no errors.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm run test:unit`
Run: `pnpm run test:integration`
Run: `pnpm run test:e2e`
Expected: PASS across all three, no regressions introduced by this feature.

- [ ] **Step 3: Run lint**

Run: `pnpm run lint`
Expected: no new lint errors in the files touched by this plan.

- [ ] **Step 4: No commit for this task** — this is a verification-only pass. If any step fails, go back to the relevant task, fix, and re-commit there.
