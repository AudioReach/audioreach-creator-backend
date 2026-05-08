# Download File — Skeleton Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the complete `GET /arc-api/v1/projects/:projectId/download-files` call flow from controller through CQRS to persistence, with skeleton serializers that throw `NotImplementedError` — all layers connected, all types correct, no business logic yet.

**Architecture:** `ProjectController` dispatches `DownloadFileQuery` via `QueryBus` → `DownloadFileHandler` resolves `fileSystemId` and delegates to `DownloadFileOrchestrator` → `BulkReadRepository` reads all entities in parallel → `AcdbFileSerializer` and `AwspFileSerializer` run in parallel (both throw `NotImplementedError` for now) → returns `{ acdbFile: FileInfo, workspaceFile: FileInfo }`.

**Tech Stack:** TypeScript ESM, NestJS (API layer only), TypeORM + SQLite, `@arc/core` (framework-agnostic), `@arc/persistence` (TypeORM adapters), Jest (unit tests).

**Spec:** `docs/download-file-design.md`

---

## File Map

### New files
| File | Package | Responsibility |
|---|---|---|
| `packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts` | `@arc/core` | Port interface: `BulkReadRepository` + `DownloadEntities` type |
| `packages/core/src/application/file-operations/download-file/download-file.query.ts` | `@arc/core` | CQRS query carrying `projectId` |
| `packages/core/src/application/file-operations/download-file/download-file.handler.ts` | `@arc/core` | Query handler — resolves fileSystemId, delegates to orchestrator |
| `packages/core/src/application/file-operations/download-file/services/download-file-orchestrator.ts` | `@arc/core` | Coordinates bulk read + parallel serialization |
| `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts` | `@arc/core` | Skeleton: throws `NotImplementedError` |
| `packages/core/src/application/file-operations/download-file/services/awsp-file-serializer.ts` | `@arc/core` | Skeleton: throws `NotImplementedError` |
| `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.ts` | `@arc/persistence` | Skeleton: all `findX()` methods throw `NotImplementedError` |
| `packages/core/tests/unit/application/file-operations/download-file/download-file-orchestrator.spec.ts` | `@arc/core` | Unit tests for orchestrator |
| `packages/core/tests/unit/application/file-operations/download-file/download-file-handler.spec.ts` | `@arc/core` | Unit tests for handler |

### Modified files
| File | Package | Change |
|---|---|---|
| `packages/core/src/application/services/project/project-query-service.ts` | `@arc/core` | Add `getFileNamesByProjectId()` |
| `packages/core/src/application/services/query-services.ts` | `@arc/core` | Add `bulkReadRepository: BulkReadRepository` |
| `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts` | `@arc/core` | Register `DownloadFileHandler` |
| `packages/core/src/index.ts` | `@arc/core` | Export new download-file types |
| `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/db-project-query-service.ts` | `@arc/persistence` | Implement `getFileNamesByProjectId()` |
| `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts` | `@arc/persistence` | Wire `TypeOrmBulkReadRepository` |
| `packages/infrastructure/persistence/src/index.ts` | `@arc/persistence` | Export `TypeOrmBulkReadRepository` |
| `packages/api/src/presentation/rest/modules/project/project.controller.ts` | `@arc/api` | Inject `QueryBus`, implement `downloadArcDbFiles()` |

---

## Task 1: `BulkReadRepository` port + `DownloadEntities` type

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts`

- [ ] **Step 1: Create the port file**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {KeyDefinition} from '../../../../../domain/entities/definitions/key-value/key-definition.js';
import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';

/**
 * All domain entities needed to reconstruct .acdb and .awsp files for a given file.
 */
export interface DownloadEntities {
  subgraphs: Subgraph[];
  containers: Container[];
  modules: SpfModule[];
  dataLinks: DataLink[];
  controlLinks: ControlLink[];
  usecases: UseCase[];
  keyDefinitions: KeyDefinition[];
  moduleDefinitions: SpfModuleDefinition[];
}

/**
 * Port interface for reading all entities needed for file download.
 * Implementations run queries in parallel for performance.
 */
export interface BulkReadRepository {
  /**
   * Reads all entity types for a given file in parallel.
   * @param fileSystemId - The file system ID to scope the query
   */
  readAllEntitiesForFile(fileSystemId: number): Promise<DownloadEntities>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts
  git commit -m "feat(core): add BulkReadRepository port and DownloadEntities type" \
             -m "Introduces the BulkReadRepository port interface and DownloadEntities aggregate type needed for the download-file workflow." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 2: Update `ProjectQueryService` port

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/services/project/project-query-service.ts`

- [ ] **Step 1: Add `getFileNamesByProjectId` to the interface**

Replace the entire file content:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Query service interface for project queries
 */
export interface ProjectQueryService {
  /**
   * Get file ID associated with a project
   * @param projectId - The project system ID
   * @returns Promise resolving to the file system ID
   * @throws Error if project not found or has no associated file
   */
  getFileIdByProjectId(projectId: number): Promise<number>;

  /**
   * Get the original uploaded file names for a project.
   * Names are stored in arc_db_file.fileName as JSON: { acdb: "...", awsp: "..." }
   * @param projectId - The project system ID
   * @returns Promise resolving to { acdb: string, awsp: string }
   * @throws Error if project not found or has no associated file
   */
  getFileNamesByProjectId(
    projectId: number,
  ): Promise<{acdb: string; awsp: string}>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/services/project/project-query-service.ts
  git commit -m "feat(core): add getFileNamesByProjectId to ProjectQueryService port" \
             -m "Needed by DownloadFileHandler to resolve original file names from project metadata." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 3: Update `QueryServices` to include `BulkReadRepository`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/services/query-services.ts`

- [ ] **Step 1: Add `bulkReadRepository` to the interface**

Replace the entire file content:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleQueryService} from './module/module-query-service.js';
import type {UseCaseQueryService} from './usecase/usecase-query-service.js';
import type {ProjectQueryService} from './project/project-query-service.js';
import type {ValidationQueryRepository} from '../ports/persistence/repositories/validation/validation-query.repository.js';
import type {BulkReadRepository} from '../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

export interface QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  /** Repository for reading all entities needed for file download. */
  readonly bulkReadRepository: BulkReadRepository;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: TypeScript will report errors in `@arc/persistence` (because `DbQueryServices` doesn't implement `bulkReadRepository` yet). That is expected — we'll fix it in Task 7.

- [ ] **Step 3: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/services/query-services.ts
  git commit -m "feat(core): add bulkReadRepository to QueryServices interface" \
             -m "Extends QueryServices with BulkReadRepository for the download-file workflow." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 4: `DownloadFileQuery`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/file-operations/download-file/download-file.query.ts`

- [ ] **Step 1: Create the query class**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../shared/base-query.js';

/**
 * Query to download the .acdb and .awsp files for a project.
 * Dispatched via QueryBus — read-only operation.
 */
export class DownloadFileQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/file-operations/download-file/download-file.query.ts
  git commit -m "feat(core): add DownloadFileQuery" \
             -m "CQRS query carrying projectId for the download-file workflow." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 5: Skeleton serializers

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts`
- Create: `packages/core/src/application/file-operations/download-file/services/awsp-file-serializer.ts`

- [ ] **Step 1: Create `AcdbFileSerializer` skeleton**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

/**
 * Serializes domain entities to binary ACDB format.
 *
 * Reuses ACDB chunk classes from shared/acdb-chunks/.
 * Implementation deferred — see Phase 2 of the download-file plan.
 */
export class AcdbFileSerializer {
  /**
   * @throws {Error} Not yet implemented — Phase 2
   */
  async serialize(_entities: DownloadEntities): Promise<Buffer> {
    throw new Error(
      'AcdbFileSerializer.serialize() is not yet implemented. See Phase 2 of the download-file plan.',
    );
  }
}
```

- [ ] **Step 2: Create `AwspFileSerializer` skeleton**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

/**
 * Serializes domain entities to AWSP JSON format.
 *
 * Reuses AWSP serializer classes from shared/awsp-serializers/v1/.
 * Uses class-transformer instanceToPlain() for serialization.
 * Implementation deferred — see Phase 3 of the download-file plan.
 */
export class AwspFileSerializer {
  /**
   * @throws {Error} Not yet implemented — Phase 3
   */
  async serialize(_entities: DownloadEntities): Promise<Buffer> {
    throw new Error(
      'AwspFileSerializer.serialize() is not yet implemented. See Phase 3 of the download-file plan.',
    );
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts \
          packages/core/src/application/file-operations/download-file/services/awsp-file-serializer.ts
  git commit -m "feat(core): add AcdbFileSerializer and AwspFileSerializer skeletons" \
             -m "Both serializers throw NotImplementedError. Implementation deferred to Phase 2/3." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 6: `DownloadFileOrchestrator`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/file-operations/download-file/services/download-file-orchestrator.ts`
- Create: `packages/core/tests/unit/application/file-operations/download-file/download-file-orchestrator.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DownloadFileOrchestrator} from '../../../../../src/application/file-operations/download-file/services/download-file-orchestrator.js';
import type {BulkReadRepository, DownloadEntities} from '../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';

const makeEmptyEntities = (): DownloadEntities => ({
  subgraphs: [],
  containers: [],
  modules: [],
  dataLinks: [],
  controlLinks: [],
  usecases: [],
  keyDefinitions: [],
  moduleDefinitions: [],
});

const makeMockBulkReadRepository = (
  entities: DownloadEntities = makeEmptyEntities(),
): BulkReadRepository => ({
  readAllEntitiesForFile: jest.fn().mockResolvedValue(entities),
});

describe('DownloadFileOrchestrator', () => {
  describe('orchestrate()', () => {
    it('calls BulkReadRepository.readAllEntitiesForFile with the given fileSystemId', async () => {
      const mockRepo = makeMockBulkReadRepository();
      const orchestrator = new DownloadFileOrchestrator(mockRepo);

      await expect(
        orchestrator.orchestrate(42, {acdb: 'test.acdb', awsp: 'test.awsp'}),
      ).rejects.toThrow('AcdbFileSerializer.serialize() is not yet implemented');

      expect(mockRepo.readAllEntitiesForFile).toHaveBeenCalledWith(42);
    });

    it('calls BulkReadRepository.readAllEntitiesForFile exactly once', async () => {
      const mockRepo = makeMockBulkReadRepository();
      const orchestrator = new DownloadFileOrchestrator(mockRepo);

      await expect(
        orchestrator.orchestrate(1, {acdb: 'a.acdb', awsp: 'a.awsp'}),
      ).rejects.toThrow();

      expect(mockRepo.readAllEntitiesForFile).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @arc/core run test:core -- --testPathPattern="download-file-orchestrator"
```

Expected: FAIL — `Cannot find module` (file doesn't exist yet).

- [ ] **Step 3: Create `DownloadFileOrchestrator`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkReadRepository} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';
import {AcdbFileSerializer} from './acdb-file-serializer.js';
import {AwspFileSerializer} from './awsp-file-serializer.js';

export interface DownloadOptions {
  /** When true, serialize ACDB and AWSP sequentially. Default: false (parallel). */
  sequential?: boolean;
}

export interface DownloadResult {
  acdbBuffer: Buffer;
  awspBuffer: Buffer;
}

/**
 * Orchestrates the download-file workflow:
 * 1. Reads all entities from DB via BulkReadRepository
 * 2. Serializes to ACDB and AWSP in parallel (or sequentially for React Native)
 */
export class DownloadFileOrchestrator {
  constructor(
    private readonly bulkReadRepository: BulkReadRepository,
    private readonly options: DownloadOptions = {},
  ) {}

  async orchestrate(
    fileSystemId: number,
    _fileNames: {acdb: string; awsp: string},
  ): Promise<DownloadResult> {
    // Step 1: Read all entities from DB
    const entities =
      await this.bulkReadRepository.readAllEntitiesForFile(fileSystemId);

    // Step 2: Serialize to files
    const acdbSerializer = new AcdbFileSerializer();
    const awspSerializer = new AwspFileSerializer();

    let acdbBuffer: Buffer;
    let awspBuffer: Buffer;

    if (this.options.sequential) {
      acdbBuffer = await acdbSerializer.serialize(entities);
      awspBuffer = await awspSerializer.serialize(entities);
    } else {
      [acdbBuffer, awspBuffer] = await Promise.all([
        acdbSerializer.serialize(entities),
        awspSerializer.serialize(entities),
      ]);
    }

    return {acdbBuffer, awspBuffer};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @arc/core run test:core -- --testPathPattern="download-file-orchestrator"
```

Expected: PASS — both tests pass (the orchestrator calls `readAllEntitiesForFile` then throws from the serializer).

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/file-operations/download-file/services/download-file-orchestrator.ts \
          packages/core/tests/unit/application/file-operations/download-file/download-file-orchestrator.spec.ts
  git commit -m "feat(core): add DownloadFileOrchestrator with parallel/sequential serialization" \
             -m "Coordinates BulkReadRepository reads and parallel ACDB/AWSP serialization. Supports sequential mode for React Native compatibility." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 7: `DownloadFileHandler`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/file-operations/download-file/download-file.handler.ts`
- Create: `packages/core/tests/unit/application/file-operations/download-file/download-file-handler.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DownloadFileHandler} from '../../../../../src/application/file-operations/download-file/download-file.handler.js';
import {DownloadFileQuery} from '../../../../../src/application/file-operations/download-file/download-file.query.js';
import type {QueryServices} from '../../../../../src/application/services/query-services.js';
import type {BulkReadRepository, DownloadEntities} from '../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';

const makeEmptyEntities = (): DownloadEntities => ({
  subgraphs: [],
  containers: [],
  modules: [],
  dataLinks: [],
  controlLinks: [],
  usecases: [],
  keyDefinitions: [],
  moduleDefinitions: [],
});

const makeMockQueryServices = (overrides?: Partial<QueryServices>): QueryServices => ({
  modulesQueryService: {} as any,
  useCaseQueryService: {} as any,
  validationQueryService: {} as any,
  projectQueryService: {
    getFileIdByProjectId: jest.fn().mockResolvedValue(99),
    getFileNamesByProjectId: jest.fn().mockResolvedValue({
      acdb: 'test.acdb',
      awsp: 'test.awsp',
    }),
  },
  bulkReadRepository: {
    readAllEntitiesForFile: jest.fn().mockResolvedValue(makeEmptyEntities()),
  } as BulkReadRepository,
  ...overrides,
});

describe('DownloadFileHandler', () => {
  describe('handle()', () => {
    it('resolves fileSystemId from projectId before orchestrating', async () => {
      const queryServices = makeMockQueryServices();
      const handler = new DownloadFileHandler(queryServices);
      const query = new DownloadFileQuery(7, 'client-1');

      await expect(handler.handle(query)).rejects.toThrow(
        'AcdbFileSerializer.serialize() is not yet implemented',
      );

      expect(
        queryServices.projectQueryService.getFileIdByProjectId,
      ).toHaveBeenCalledWith(7);
    });

    it('resolves file names from projectId before orchestrating', async () => {
      const queryServices = makeMockQueryServices();
      const handler = new DownloadFileHandler(queryServices);
      const query = new DownloadFileQuery(7, 'client-1');

      await expect(handler.handle(query)).rejects.toThrow();

      expect(
        queryServices.projectQueryService.getFileNamesByProjectId,
      ).toHaveBeenCalledWith(7);
    });

    it('calls BulkReadRepository with the resolved fileSystemId', async () => {
      const queryServices = makeMockQueryServices();
      const handler = new DownloadFileHandler(queryServices);
      const query = new DownloadFileQuery(7, 'client-1');

      await expect(handler.handle(query)).rejects.toThrow();

      expect(
        queryServices.bulkReadRepository.readAllEntitiesForFile,
      ).toHaveBeenCalledWith(99); // fileSystemId resolved from projectId 7
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @arc/core run test:core -- --testPathPattern="download-file-handler"
```

Expected: FAIL — `Cannot find module` (file doesn't exist yet).

- [ ] **Step 3: Create `DownloadFileHandler`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../services/query-services.js';
import type {DownloadFileQuery} from './download-file.query.js';
import {DownloadFileOrchestrator} from './services/download-file-orchestrator.js';

export type DownloadFileResult = {
  acdbFile: {name: string; fileType: string; content: Buffer};
  workspaceFile: {name: string; fileType: string; content: Buffer};
};

/**
 * Query handler for DownloadFileQuery.
 * Resolves fileSystemId and file names from projectId, then delegates to DownloadFileOrchestrator.
 */
export class DownloadFileHandler
  implements QueryHandler<DownloadFileQuery, Promise<DownloadFileResult>>
{
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: DownloadFileQuery): Promise<DownloadFileResult> {
    // 1. Resolve fileSystemId from projectId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // 2. Resolve original file names
    const fileNames =
      await this.queryServices.projectQueryService.getFileNamesByProjectId(
        query.projectId,
      );

    // 3. Orchestrate download
    const orchestrator = new DownloadFileOrchestrator(
      this.queryServices.bulkReadRepository,
    );

    const result = await orchestrator.orchestrate(fileSystemId, fileNames);

    return {
      acdbFile: {
        name: fileNames.acdb,
        fileType: 'application/octet-stream',
        content: result.acdbBuffer,
      },
      workspaceFile: {
        name: fileNames.awsp,
        fileType: 'application/json',
        content: result.awspBuffer,
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @arc/core run test:core -- --testPathPattern="download-file-handler"
```

Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/file-operations/download-file/download-file.handler.ts \
          packages/core/tests/unit/application/file-operations/download-file/download-file-handler.spec.ts
  git commit -m "feat(core): add DownloadFileHandler" \
             -m "Resolves fileSystemId and file names from projectId, then delegates to DownloadFileOrchestrator." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 8: Register `DownloadFileHandler` in `QueryHandlerRegistry`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts`

- [ ] **Step 1: Add the import and registration**

Add the following two imports at the top of the file (after the existing imports):

```typescript
import {DownloadFileQuery} from '../../../file-operations/download-file/download-file.query.js';
import {DownloadFileHandler} from '../../../file-operations/download-file/download-file.handler.js';
```

Add the following registration inside `registerAllQueryHandlers()`, after the existing `ValidateFileQuery` registration:

```typescript
this.queryHandlerFactories.set(DownloadFileQuery, {
  create: (deps: QueryHandlerDependencies) =>
    new DownloadFileHandler(deps.queryServices),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run all core tests**

```bash
pnpm --filter @arc/core run test:core
```

Expected: PASS — all existing tests still pass, new tests pass.

- [ ] **Step 4: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts
  git commit -m "feat(core): register DownloadFileHandler in QueryHandlerRegistry" \
             -m "Wires DownloadFileQuery → DownloadFileHandler in the CQRS registry." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 9: Export new types from `@arc/core` `index.ts`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add exports for download-file types**

Add the following lines to `packages/core/src/index.ts` after the existing upload-file exports section:

```typescript
// File Operations - Download File pipeline exports
export * from './application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';
export * from './application/file-operations/download-file/download-file.query.js';
export * from './application/file-operations/download-file/download-file.handler.js';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/core run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/index.ts
  git commit -m "feat(core): export download-file types from package index" \
             -m "Exposes BulkReadRepository, DownloadFileQuery, DownloadFileHandler, and DownloadFileResult for consumers." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 10: `TypeOrmBulkReadRepository` skeleton

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.ts`

- [ ] **Step 1: Create the skeleton repository**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkReadRepository, DownloadEntities} from '@arc/core';
import type {DataSource} from 'typeorm';

/**
 * TypeORM implementation of BulkReadRepository.
 * Reads all entity types for a file in parallel using Promise.all.
 *
 * Individual query methods are deferred to Phase 4 of the download-file plan.
 */
export class TypeOrmBulkReadRepository implements BulkReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  async readAllEntitiesForFile(fileSystemId: number): Promise<DownloadEntities> {
    const [
      subgraphs,
      containers,
      modules,
      dataLinks,
      controlLinks,
      usecases,
      keyDefinitions,
      moduleDefinitions,
    ] = await Promise.all([
      this.findSubgraphs(fileSystemId),
      this.findContainers(fileSystemId),
      this.findModules(fileSystemId),
      this.findDataLinks(fileSystemId),
      this.findControlLinks(fileSystemId),
      this.findUsecases(fileSystemId),
      this.findKeyDefinitions(fileSystemId),
      this.findModuleDefinitions(fileSystemId),
    ]);

    return {
      subgraphs,
      containers,
      modules,
      dataLinks,
      controlLinks,
      usecases,
      keyDefinitions,
      moduleDefinitions,
    };
  }

  // ─── Individual query methods (Phase 4) ──────────────────────────────────

  private async findSubgraphs(_fileSystemId: number): Promise<DownloadEntities['subgraphs']> {
    throw new Error('TypeOrmBulkReadRepository.findSubgraphs() not yet implemented. See Phase 4.');
  }

  private async findContainers(_fileSystemId: number): Promise<DownloadEntities['containers']> {
    throw new Error('TypeOrmBulkReadRepository.findContainers() not yet implemented. See Phase 4.');
  }

  private async findModules(_fileSystemId: number): Promise<DownloadEntities['modules']> {
    throw new Error('TypeOrmBulkReadRepository.findModules() not yet implemented. See Phase 4.');
  }

  private async findDataLinks(_fileSystemId: number): Promise<DownloadEntities['dataLinks']> {
    throw new Error('TypeOrmBulkReadRepository.findDataLinks() not yet implemented. See Phase 4.');
  }

  private async findControlLinks(_fileSystemId: number): Promise<DownloadEntities['controlLinks']> {
    throw new Error('TypeOrmBulkReadRepository.findControlLinks() not yet implemented. See Phase 4.');
  }

  private async findUsecases(_fileSystemId: number): Promise<DownloadEntities['usecases']> {
    throw new Error('TypeOrmBulkReadRepository.findUsecases() not yet implemented. See Phase 4.');
  }

  private async findKeyDefinitions(_fileSystemId: number): Promise<DownloadEntities['keyDefinitions']> {
    throw new Error('TypeOrmBulkReadRepository.findKeyDefinitions() not yet implemented. See Phase 4.');
  }

  private async findModuleDefinitions(_fileSystemId: number): Promise<DownloadEntities['moduleDefinitions']> {
    throw new Error('TypeOrmBulkReadRepository.findModuleDefinitions() not yet implemented. See Phase 4.');
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @arc/persistence run typecheck
```

Expected: errors about `DbQueryServices` missing `bulkReadRepository` — that's expected, fixed in Task 11.

- [ ] **Step 3: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.ts
  git commit -m "feat(persistence): add TypeOrmBulkReadRepository skeleton" \
             -m "Implements BulkReadRepository port with parallel Promise.all structure. Individual query methods deferred to Phase 4." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 11: Update `DbProjectQueryService` and `DbQueryServices`

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/db-project-query-service.ts`
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts`
- Modify: `packages/infrastructure/persistence/src/index.ts`

- [ ] **Step 1: Add `getFileNamesByProjectId` to `DbProjectQueryService`**

Add the following method to the `DbProjectQueryService` class (after `getFileIdByProjectId`):

```typescript
async getFileNamesByProjectId(
  projectId: number,
): Promise<{acdb: string; awsp: string}> {
  const project = (await this.dataSource
    .getRepository('Project')
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.files', 'f')
    .where('p.systemId = :projectId', {projectId})
    .getOne()) as ProjectRow | null;

  if (!project?.files || project.files.length === 0) {
    throw new Error(
      `Project with ID ${projectId} not found or has no associated files`,
    );
  }

  const file = project.files[0];
  // fileName is stored as JSON: { acdb: "...", awsp: "...", uploadedAt: "..." }
  const parsed = JSON.parse(file.fileName) as {
    acdb: string;
    awsp: string;
  };

  return {acdb: parsed.acdb, awsp: parsed.awsp};
}
```

- [ ] **Step 2: Wire `TypeOrmBulkReadRepository` in `DbQueryServices`**

Replace the entire `typeorm-query-services.ts` file:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  QueryServices,
  ModuleQueryService,
  UseCaseQueryService,
  ProjectQueryService,
  ValidationQueryRepository,
  BulkReadRepository,
} from '@arc/core';
import {DataSource} from 'typeorm';
import {DbUseCaseQueryService} from './usecase/index.js';
import {DbProjectQueryService} from './db-project-query-service.js';
import {TypeOrmValidationQueryRepository} from '../repositories/validation/typeorm-validation-query.repository.js';
import {TypeOrmBulkReadRepository} from '../repositories/bulk-read/typeorm-bulk-read.repository.js';

// Database implementation of ModuleQueryService
class DbModuleQueryService implements ModuleQueryService {
  // Add query methods here as needed
}

export class DbQueryServices implements QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  readonly bulkReadRepository: BulkReadRepository;

  constructor(dataSource: DataSource) {
    this.modulesQueryService = new DbModuleQueryService();
    this.useCaseQueryService = new DbUseCaseQueryService(dataSource);
    this.projectQueryService = new DbProjectQueryService(dataSource);
    this.validationQueryService = new TypeOrmValidationQueryRepository(
      dataSource,
    );
    this.bulkReadRepository = new TypeOrmBulkReadRepository(dataSource);
  }
}
```

- [ ] **Step 3: Export `TypeOrmBulkReadRepository` from `@arc/persistence` index**

Add the following line to `packages/infrastructure/persistence/src/index.ts` after the existing repository exports:

```typescript
export * from './persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.js';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @arc/persistence run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run persistence tests**

```bash
pnpm --filter @arc/persistence run test:persistence
```

Expected: PASS — all existing tests still pass.

- [ ] **Step 6: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/db-project-query-service.ts \
          packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts \
          packages/infrastructure/persistence/src/index.ts
  git commit -m "feat(persistence): wire TypeOrmBulkReadRepository and implement getFileNamesByProjectId" \
             -m "DbQueryServices now satisfies the updated QueryServices interface. DbProjectQueryService parses arc_db_file.fileName JSON to return original file names." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Task 12: Implement `ProjectController.downloadArcDbFiles()`

**Package:** `@arc/api`

**Files:**
- Modify: `packages/api/src/presentation/rest/modules/project/project.controller.ts`

- [ ] **Step 1: Inject `QueryBus` into `ProjectController`**

In `project.controller.ts`, update the import to include `QueryBus` and `DownloadFileQuery`:

```typescript
import {CommandBus, QueryBus, UploadFileCommand} from '@arc/core';
import type {PathRef, Logger, DownloadFileResult} from '@arc/core';
```

Add `DownloadFileQuery` import:

```typescript
import {DownloadFileQuery} from '@arc/core';
```

Update the constructor to inject `QueryBus`:

```typescript
constructor(
  private readonly commandBus: CommandBus,
  private readonly queryBus: QueryBus,
  @Inject('LOGGER') private readonly logger: Logger,
) {}
```

- [ ] **Step 2: Implement `downloadArcDbFiles()`**

Replace the existing stub `downloadArcDbFiles()` method with:

```typescript
@Get('/:projectId/download-files')
@ApiParam({name: 'projectId', description: 'Id of project', required: true})
@ApiOperation({
  summary: 'Download the ACDB and workspace files',
  description: 'Download the ACDB and workspace files based on project Id.',
})
@ApiExtraModels(ApiResult, DownloadArcDatabaseFilesResponseDto)
@ApiResponse({
  status: HttpStatus.OK,
  schema: {
    allOf: [
      {$ref: getSchemaPath(ApiResult)},
      {
        properties: {
          data: {$ref: getSchemaPath(DownloadArcDatabaseFilesResponseDto)},
        },
      },
    ],
  },
})
@ApiResponse({
  status: HttpStatus.NOT_FOUND,
  description: 'Project does not exist',
  schema: {
    allOf: [
      {$ref: getSchemaPath(ApiResult)},
      {
        properties: {
          data: {
            type: 'object',
            nullable: true,
          },
        },
      },
    ],
  },
})
async downloadArcDbFiles(
  @Param('projectId') projectId: string,
): Promise<ApiResult<DownloadArcDatabaseFilesResponseDto>> {
  const clientId = '';
  // TODO: gather from jwt

  const result = await this.queryBus.execute<DownloadFileResult>(
    new DownloadFileQuery(Number(projectId), clientId),
  );

  return {
    data: {
      acdbFile: result.acdbFile,
      workspaceFile: result.workspaceFile,
    },
    success: true,
    message: 'Files downloaded successfully',
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @arc/api run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
pnpm --filter @arc/core run test:core
pnpm --filter @arc/persistence run test:persistence
pnpm --filter @arc/api run test:api
```

Expected: all pass.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/api/src/presentation/rest/modules/project/project.controller.ts
  git commit -m "feat(api): implement downloadArcDbFiles endpoint" \
             -m "Injects QueryBus into ProjectController and dispatches DownloadFileQuery. Completes the skeleton call flow for the download-file feature." \
             -m "Signed-off-by: $(git config user.name) <$(git config user.email)>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `GET /arc-api/v1/projects/:projectId/download-files` endpoint | Task 12 |
| `DownloadFileQuery` via `QueryBus` | Tasks 4, 8, 12 |
| `DownloadFileHandler` resolves fileSystemId + fileNames | Task 7 |
| `DownloadFileOrchestrator` parallel/sequential | Task 6 |
| `BulkReadRepository` port | Task 1 |
| `DownloadEntities` type | Task 1 |
| `AcdbFileSerializer` skeleton | Task 5 |
| `AwspFileSerializer` skeleton | Task 5 |
| `TypeOrmBulkReadRepository` skeleton | Task 10 |
| `QueryServices.bulkReadRepository` | Task 3 |
| `ProjectQueryService.getFileNamesByProjectId` | Tasks 2, 11 |
| `DbQueryServices` wired | Task 11 |
| `QueryHandlerRegistry` registration | Task 8 |
| `@arc/core` exports | Task 9 |
| `@arc/persistence` exports | Task 11 |
| React Native sequential mode | Task 6 |
| Returns `FileInfo` with `Buffer` content | Task 7 |

All spec requirements covered. ✅

### Placeholder scan

No TBDs or vague steps. All skeleton methods have explicit `throw new Error(...)` with Phase references. ✅

### Type consistency

- `DownloadEntities` defined in Task 1, used in Tasks 5, 6, 10 ✅
- `DownloadFileResult` defined in Task 7, used in Task 12 ✅
- `BulkReadRepository` defined in Task 1, used in Tasks 3, 6, 7, 10 ✅
- `DownloadFileQuery` defined in Task 4, used in Tasks 7, 8, 12 ✅
- `DownloadFileHandler` defined in Task 7, registered in Task 8 ✅
- `getFileNamesByProjectId` defined in Task 2, implemented in Task 11, called in Task 7 ✅