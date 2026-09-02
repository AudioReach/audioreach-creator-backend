# Update TKV Tag Data Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `PUT /:spfModuleSystemId/tag-data/:tagSystemId/:tkvSystemId` replacing the `NotImplementedException` stub with full CQRS command dispatch, per-parameter binary serialization, and UnitOfWork write.

**Architecture:** Follows the CKV `updateCalibrationData` pattern — `UpdateTkvCalDataCommand` dispatched through `CommandBus` to `UpdateTkvCalDataHandler`, which performs a two-step TKV validation (tag map then TKV), serializes each parameter via `serializeParameterData`, and writes via four new `ModuleRepository` TKV methods backed by `TkvOverlayFetcher`. The controller fires `GetTkvCalibrationDataQuery` for succeeded params and returns `TkvCalDataResponseDto`; `PartialSuccessInterceptor` handles HTTP 200 vs 207 automatically.

**Tech Stack:** NestJS, TypeORM (SQLite), `@arc/core` CQRS, `BinaryDataWriter` / `serializeParameterData` (existing — reused unchanged), `TkvOverlayFetcher` (existing — extended with one method), `PendingChangeWriter` (existing).

---

### Task 1: UpdateTkvRequestDto + UpdateTkvCalDataResult type

**Package:** `@arc/api` (DTO), `@arc/core` (result type)

**Files:**
- Modify: `packages/api/src/presentation/rest/modules/spf-module/dto/request/update-tkv-request.dto.ts`
- Create: `packages/core/src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data-result.ts`

- [ ] **Step 1: Replace `UpdateTkvRequestDto` content**

The current DTO has a `data: ParameterSummaryDto[]` field. Replace the entire file:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDto} from '../response/parameter.dto.js';

export class UpdateTkvRequestDto {
  @ApiProperty({
    description:
      'Parameter payloads to update, identified by their payload system IDs.',
    type: [ParameterDto],
  })
  parameters!: ParameterDto[];

  @ApiProperty({
    description:
      'Optional UI persistence blob (UTF-8 text). Written to Tkv.uiPersistence when present; left unchanged when absent.',
    required: false,
  })
  uiPersistence?: string;
}
```

- [ ] **Step 2: Create `update-tkv-cal-data-result.ts`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface UpdateTkvCalDataResult {
  groupId: string;
  succeededParamSystemIds: number[];
}
```

- [ ] **Step 3: Build check**

Run: `pnpm --filter @arc/core run build && pnpm --filter @arc/api run build`
Expected: PASS. The controller still references the old `data` field of `UpdateTkvRequestDto` — that is fine at this stage (it is the stub being replaced in Task 7).

---

### Task 2: UpdateTkvCalDataCommand

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.command.ts`

- [ ] **Step 1: Create the command file**

Mirrors `packages/core/src/application/usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.command.ts` exactly, with `ckvSystemId` replaced by `tagSystemId` + `tkvSystemId`. Copy the `parseId` helper verbatim.

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import type {ParameterDto} from '../dto/parameter-dto.js';
import type {ParameterElementDto} from '../dto/element-dto.js';
import {InvalidOperationException} from '../../../../shared/exceptions/index.js';

export class UpdateTkvCalDataCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  public readonly spfModuleSystemId: number;
  public readonly tagSystemId: number;
  public readonly tkvSystemId: number;
  public readonly parameters: Array<{
    systemId: number;
    elements: ParameterElementDto[];
  }>;
  public readonly uiPersistence: string | undefined;

  constructor(
    spfModuleSystemIdStr: string,
    tagSystemIdStr: string,
    tkvSystemIdStr: string,
    parameters: ParameterDto[],
    uiPersistence: string | undefined,
  ) {
    super();
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.tagSystemId       = parseId(tagSystemIdStr, 'tagSystemId');
    this.tkvSystemId       = parseId(tkvSystemIdStr, 'tkvSystemId');
    this.parameters = parameters.map(p => ({
      systemId: parseId(p.systemId, 'parameters[].systemId'),
      elements: p.elements,
    }));
    this.uiPersistence = uiPersistence;
  }
}

function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  const num =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new InvalidOperationException(
      `${paramName} must be an integer, got: ${value}`,
    );
  }
  if (num <= 0) {
    throw new InvalidOperationException(
      `${paramName} must be positive, got: ${value}`,
    );
  }
  return num;
}
```

- [ ] **Step 2: Build check**

Run: `pnpm --filter @arc/core run build`
Expected: PASS

---

### Task 3: ModuleRepository port — 4 TKV method signatures

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/ports/persistence/repositories/module/module.repository.ts`

- [ ] **Step 1: Add four TKV method signatures to `ModuleRepository`**

Open the file and append the four methods inside the `ModuleRepository` interface, immediately after the closing brace of `setCkvCalData`. `ExistingPayloadRow` and `CkvPayloadUpdate` are already declared in this file — no new imports needed.

```typescript
  /**
   * Returns true if a module_tag_id_map row with the given systemId
   * exists under the given SpfModule in the session-overlaid state.
   */
  moduleTagIdMapExists(
    spfModuleSystemId: number,
    moduleTagIdMapSystemId: number,
  ): Promise<boolean>;

  /**
   * Returns true if a tkv row with the given systemId exists under
   * the given module_tag_id_map in the session-overlaid state.
   */
  tkvExists(
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<boolean>;

  /**
   * Returns all tkv_parameter_payload rows under the given TKV
   * in the session-overlaid state.
   */
  getExistingTkvPayloads(
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<ExistingPayloadRow[]>;

  /**
   * Writes the payload batch to tkv_parameter_payload rows via edit_actions.
   * If uiPersistence is present, writes it to tkv.ui_persistence via edit_actions.
   * Must be called within an active UnitOfWork transaction.
   */
  setTkvCalData(
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
    writeBatch: CkvPayloadUpdate[],
    uiPersistence?: string,
  ): Promise<void>;
```

- [ ] **Step 2: Build core (expect PASS), build persistence (expect FAIL)**

Run: `pnpm --filter @arc/core run build`
Expected: PASS

Run: `pnpm --filter @arc/persistence run build`
Expected: FAIL — `TypeOrmModuleRepository` does not yet implement the four new methods. This is expected and is resolved in Task 4.

---

### Task 4: TkvOverlayFetcher extension + TypeOrmModuleRepository TKV methods

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/tkv-overlay-fetcher.ts`
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/module.repository.ts`

- [ ] **Step 1: Add `fetchModuleTagIdMap` to `TkvOverlayFetcher`**

Open `tkv-overlay-fetcher.ts`. Confirm these names are already imported: `ENTITY_NAMES`, `CHANGE_OPERATION`, `ModuleTagIdMapSchema`, `EditActionsQueryService`. Add the following public method after `fetchTkv`, following the same overlay pattern:

```typescript
async fetchModuleTagIdMap(
  moduleTagIdMapSystemId: number,
  spfModuleSystemId: number,
  sessionId: number | null,
): Promise<boolean> {
  if (sessionId !== null) {
    const actions = await this.editActionsQueryService.getByAggregateId(
      sessionId,
      spfModuleSystemId,
      ENTITY_NAMES.ModuleTagIdMap,
    );
    if (
      actions.some(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          a.targetSystemId === moduleTagIdMapSystemId,
      )
    )
      return true;
    if (
      actions.some(
        a =>
          a.operation === CHANGE_OPERATION.Delete &&
          a.targetSystemId === moduleTagIdMapSystemId,
      )
    )
      return false;
  }
  const count = await this.manager
    .getRepository(ModuleTagIdMapSchema)
    .count({where: {systemId: moduleTagIdMapSystemId, spfModuleSystemId}});
  return count > 0;
}
```

- [ ] **Step 2: Add `TkvOverlayFetcher` to `TypeOrmModuleRepository` constructor**

Run: `grep -n "constructor" packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/module.repository.ts`

Open the file. Add `private readonly tkvFetcher: TkvOverlayFetcher` as the last constructor parameter. Add the import at the top:

```typescript
import {TkvOverlayFetcher} from '../../fetchers/tkv-overlay-fetcher.js';
```

- [ ] **Step 3: Update the TypeOrmModuleRepository construction site**

Run: `grep -rn "new TypeOrmModuleRepository" packages/`

Find the wiring site (likely `TypeOrmUnitOfWork` or a factory file). Look at how `CkvOverlayFetcher` is constructed there — mirror the pattern to construct and pass `new TkvOverlayFetcher(manager, editActionsQueryService)` as the last argument.

- [ ] **Step 4: Implement the four TKV repository methods**

Append the four methods to `TypeOrmModuleRepository` after `setCkvCalData`. `CkvPayloadUpdate` is imported from `@arc/core` — verify the import is present or add it. `ENTITY_NAMES.TkvParameterPayload` and `ENTITY_NAMES.Tkv` — confirm they exist with: `grep -n "TkvParameterPayload\|Tkv[^O]" packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-names.ts`

```typescript
async moduleTagIdMapExists(
  spfModuleSystemId: number,
  moduleTagIdMapSystemId: number,
): Promise<boolean> {
  const sessionId = this.uow.getWriteContext().session.sessionId;
  return this.tkvFetcher.fetchModuleTagIdMap(
    moduleTagIdMapSystemId,
    spfModuleSystemId,
    sessionId,
  );
}

async tkvExists(
  moduleTagIdMapSystemId: number,
  tkvSystemId: number,
): Promise<boolean> {
  const sessionId = this.uow.getWriteContext().session.sessionId;
  const row = await this.tkvFetcher.fetchTkv(
    tkvSystemId,
    moduleTagIdMapSystemId,
    sessionId,
  );
  return row !== null;
}

async getExistingTkvPayloads(
  moduleTagIdMapSystemId: number,
  tkvSystemId: number,
): Promise<ExistingPayloadRow[]> {
  const sessionId = this.uow.getWriteContext().session.sessionId;
  const rows = await this.tkvFetcher.fetchTkvPayloads(tkvSystemId, sessionId);
  return rows.map(r => ({
    systemId: r.systemId,
    parameterSystemId: r.parameterSystemId,
  }));
}

async setTkvCalData(
  moduleTagIdMapSystemId: number,
  tkvSystemId: number,
  writeBatch: CkvPayloadUpdate[],
  uiPersistence?: string,
): Promise<void> {
  const {session, groupId} = this.uow.getWriteContext();
  const sessionId = session.sessionId;
  await this.writer.writeDeltaBatch(
    writeBatch.map(u => ({
      targetTable: ENTITY_NAMES.TkvParameterPayload,
      targetSystemId: u.payloadSystemId,
      aggregateId: moduleTagIdMapSystemId,
      delta: {payload: Buffer.from(u.payload).toString('base64')},
    })),
    sessionId,
    groupId,
    this.manager,
  );
  if (uiPersistence !== undefined) {
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Tkv,
        targetSystemId: tkvSystemId,
        aggregateId: moduleTagIdMapSystemId,
        delta: {uiPersistence},
      },
      sessionId,
      groupId,
      this.manager,
    );
  }
}
```

Note: `ExistingPayloadRow` is imported from `@arc/core` — check the existing imports in this file; it should already be present because `getExistingCkvPayloads` uses it.

- [ ] **Step 5: Build persistence**

Run: `pnpm --filter @arc/persistence run build`
Expected: PASS

---

### Task 5: Integration tests — `fetchModuleTagIdMap` + TypeOrmModuleRepository TKV methods

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/tests/integration/fetchers/tkv-overlay-fetcher-fetch-tkv.spec.ts`
- Create: `packages/infrastructure/persistence/tests/integration/repositories/module/module-tkv-cal-data.repository.spec.ts`

- [ ] **Step 1: Add `fetchModuleTagIdMap` tests to the TKV overlay fetcher spec**

Open `tkv-overlay-fetcher-fetch-tkv.spec.ts`. The existing seed (`seedAll`) already inserts `module_tag_id_map` and `tkv` rows. Add a `describe('fetchModuleTagIdMap')` block after all existing `describe` blocks. Use the constant names already defined at the top of the file (e.g. `MODULE_ID`, `TAG_MAP_ID`).

```typescript
describe('fetchModuleTagIdMap', () => {
  it('returns true when the tag map row is in DB', async () => {
    const ds = getTestDataSource();
    await seedAll(ds);
    const result = await makeFetcher(ds).fetchModuleTagIdMap(
      TAG_MAP_ID,
      MODULE_ID,
      null,
    );
    expect(result).toBe(true);
  });

  it('returns false when systemId does not match', async () => {
    const ds = getTestDataSource();
    await seedAll(ds);
    const result = await makeFetcher(ds).fetchModuleTagIdMap(9999, MODULE_ID, null);
    expect(result).toBe(false);
  });

  it('returns false when spfModuleSystemId does not match', async () => {
    const ds = getTestDataSource();
    await seedAll(ds);
    const result = await makeFetcher(ds).fetchModuleTagIdMap(TAG_MAP_ID, 9999, null);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run fetcher tests**

Run: `pnpm --filter @arc/persistence run test:persistence -- --testPathPattern="tkv-overlay-fetcher-fetch-tkv"`
Expected: PASS (existing tests unaffected, 3 new cases pass)

- [ ] **Step 3: Write repository integration tests**

Read `packages/infrastructure/persistence/tests/integration/repositories/module/module-ckv-cal-data.repository.spec.ts` in full — it provides the exact `seedBase`, `makeRepo`, session mock, and `edit_actions` assertion patterns to mirror. The TKV test mirrors it with `module_tag_id_map` / `tkv` / `tkv_parameter_payload` tables instead of `ckv` / `ckv_parameter_payload`.

Create `packages/infrastructure/persistence/tests/integration/repositories/module/module-tkv-cal-data.repository.spec.ts`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import type {DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
// Import TypeOrmModuleRepository and its constructor dependencies,
// mirroring the imports in module-ckv-cal-data.repository.spec.ts exactly.
// Import ProjectSchema and ArcDbFileSchema as in other integration tests.

const FILE_ID      = 1;
const MODULE_ID    = 10;
const DEF_ID       = 20;
const TAG_DEF_ID   = 30;
const TAG_MAP_ID   = 40;
const TKV_ID       = 50;
const PARAM_DEF_ID = 60;
const PAYLOAD_ID   = 70;
const SESSION_ID   = 99;
const GROUP_ID     = 'tkv-group';

// seedBase: insert the full FK chain
//   project → arcdbfile → processor_definition → subgraph → container
//   → spf_module_definitions → nodes → spf_modules
//   → tag_definitions → module_tag_id_map → tkv → tkv_parameter_payload
// Mirror the seed from module-ckv-cal-data.repository.spec.ts,
// replacing ckv/ckv_parameter_payload tables with the TKV equivalents.

// makeRepo: construct TypeOrmModuleRepository with a mock UoW returning
//   { session: { sessionId: SESSION_ID, fileSystemId: FILE_ID }, groupId: GROUP_ID }
// Mirror makeRepo from module-ckv-cal-data.repository.spec.ts exactly.

describe('TypeOrmModuleRepository — TKV cal data methods', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  describe('moduleTagIdMapExists', () => {
    it('returns true when the tag map row is in DB', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      expect(await repo.moduleTagIdMapExists(MODULE_ID, TAG_MAP_ID)).toBe(true);
    });

    it('returns false when spfModuleSystemId does not match', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      expect(await repo.moduleTagIdMapExists(9999, TAG_MAP_ID)).toBe(false);
    });

    it('returns false when moduleTagIdMapSystemId does not exist', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      expect(await repo.moduleTagIdMapExists(MODULE_ID, 9999)).toBe(false);
    });
  });

  describe('tkvExists', () => {
    it('returns true when the TKV row is in DB', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      expect(await repo.tkvExists(TAG_MAP_ID, TKV_ID)).toBe(true);
    });

    it('returns false when moduleTagIdMapSystemId does not match', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      expect(await repo.tkvExists(9999, TKV_ID)).toBe(false);
    });

    it('returns false when tkvSystemId does not exist', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      expect(await repo.tkvExists(TAG_MAP_ID, 9999)).toBe(false);
    });
  });

  describe('getExistingTkvPayloads', () => {
    it('returns all payload rows for the TKV', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      const rows = await repo.getExistingTkvPayloads(TAG_MAP_ID, TKV_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0].systemId).toBe(PAYLOAD_ID);
      expect(rows[0].parameterSystemId).toBe(PARAM_DEF_ID);
    });

    it('returns empty array when no payload rows exist', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      const rows = await repo.getExistingTkvPayloads(TAG_MAP_ID, 9999);
      expect(rows).toHaveLength(0);
    });
  });

  describe('setTkvCalData', () => {
    it('writes edit_actions for each payload with aggregateId=moduleTagIdMapSystemId', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      await repo.setTkvCalData(
        TAG_MAP_ID,
        TKV_ID,
        [{payloadSystemId: PAYLOAD_ID, payload: new Uint8Array([1, 2, 3, 4])}],
      );
      // Verify edit_actions row: aggregate_id=TAG_MAP_ID, target_system_id=PAYLOAD_ID,
      // field_path contains 'payload', new_value contains base64 of [1,2,3,4]
      // Mirror the edit_actions assertion from module-ckv-cal-data.repository.spec.ts
    });

    it('writes uiPersistence edit_action on Tkv when uiPersistence is provided', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      await repo.setTkvCalData(TAG_MAP_ID, TKV_ID, [], 'hello ui');
      // Verify edit_actions row: target_system_id=TKV_ID, aggregateId=TAG_MAP_ID,
      // new_value contains uiPersistence='hello ui'
    });

    it('does not write uiPersistence edit_action when uiPersistence is absent', async () => {
      const ds = getTestDataSource();
      await seedBase(ds);
      const repo = makeRepo(ds);
      await repo.setTkvCalData(TAG_MAP_ID, TKV_ID, []);
      // Verify no edit_actions row exists with targetTable=Tkv and targetSystemId=TKV_ID
    });
  });
});
```

- [ ] **Step 4: Run repository integration tests**

Run: `pnpm --filter @arc/persistence run test:persistence -- --testPathPattern="module-tkv-cal-data.repository"`
Expected: PASS (all 9 cases)

---

### Task 6: UpdateTkvCalDataHandler + unit tests

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.handler.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.handler.spec.ts`

- [ ] **Step 1: Write failing unit tests**

Read `packages/core/tests/unit/application/usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.handler.spec.ts` in full — the TKV unit test mirrors it with these replacements:
- `makeModuleRepo` mock uses: `moduleTagIdMapExists`, `tkvExists`, `getExistingTkvPayloads`, `setTkvCalData` instead of `ckvExists`, `getExistingCkvPayloads`, `setCkvCalData`
- `makeCommand` builds `UpdateTkvCalDataCommand` with `spfModuleSystemId`, `tagSystemId`, `tkvSystemId`, `parameters`, `uiPersistence`
- Two extra `ResourceNotFoundException` cases: one for `moduleTagIdMapExists` returning false, one for `tkvExists` returning false

Create `packages/core/tests/unit/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.handler.spec.ts`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, vi} from '@jest/globals';
import type {UnitOfWork} from '../../../../../src/application/ports/persistence/unit-of-work.js';
import type {ModuleRepository} from '../../../../../src/application/ports/persistence/repositories/module/module.repository.js';
import type {ModuleDefinitionRepository} from '../../../../../src/application/ports/persistence/repositories/module/module-definition.repository.js';
import {UpdateTkvCalDataHandler} from '../../../../../src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.handler.js';
import {UpdateTkvCalDataCommand} from '../../../../../src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.command.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/index.js';

const SPF_MODULE_ID   = '10';
const TAG_SYSTEM_ID   = '20';
const TKV_SYSTEM_ID   = '30';
const PAYLOAD_SYS_ID  = 101;
const PARAM_DEF_ID    = 201;

// Read put-ckv-cal-data.handler.spec.ts for the exact makeModuleRepo,
// makeModuleDefRepo, makeUow, and makeCommand helper patterns,
// then adapt as described below.

// makeModuleRepo(overrides?): returns a mock ModuleRepository with:
//   getSpfModuleForValidation → {systemId:10, definitionSystemId:99, ...}
//   moduleTagIdMapExists → true
//   tkvExists → true
//   getExistingTkvPayloads → [{systemId:PAYLOAD_SYS_ID, parameterSystemId:PARAM_DEF_ID}]
//   setTkvCalData → resolves void
// Allow overrides for each method.

// makeModuleDefRepo(overrides?): same as CKV counterpart —
//   getParameterDefinitions → [{systemId:PARAM_DEF_ID, isReadOnly:false, elementsStructure:'[]'}]

// makeUow(moduleRepo, defRepo): same as CKV counterpart —
//   getWriteContext → {session:{sessionId:1, fileSystemId:2}, groupId:'g1'}
//   getModuleRepository → moduleRepo
//   getModuleDefinitionRepository → defRepo
//   startTransaction, commit, rollback, isInTransaction → vi.fn()

// makeCommand(overrides?): builds UpdateTkvCalDataCommand with:
//   spfModuleSystemIdStr: SPF_MODULE_ID
//   tagSystemIdStr: TAG_SYSTEM_ID
//   tkvSystemIdStr: TKV_SYSTEM_ID
//   parameters: [{systemId: String(PAYLOAD_SYS_ID), elements: []}] by default
//   uiPersistence: undefined by default

describe('UpdateTkvCalDataHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: vi.fn().mockResolvedValue(null),
    });
    const handler = new UpdateTkvCalDataHandler(makeUow(moduleRepo, makeModuleDefRepo()));
    await expect(handler.handle(makeCommand())).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when moduleTagIdMap not found', async () => {
    const moduleRepo = makeModuleRepo({
      moduleTagIdMapExists: vi.fn().mockResolvedValue(false),
    });
    const handler = new UpdateTkvCalDataHandler(makeUow(moduleRepo, makeModuleDefRepo()));
    await expect(handler.handle(makeCommand())).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when TKV not found', async () => {
    const moduleRepo = makeModuleRepo({
      tkvExists: vi.fn().mockResolvedValue(false),
    });
    const handler = new UpdateTkvCalDataHandler(makeUow(moduleRepo, makeModuleDefRepo()));
    await expect(handler.handle(makeCommand())).rejects.toThrow(ResourceNotFoundException);
  });

  it('returns Result.ok with succeededParamSystemIds when all params succeed', async () => {
    // definition: elementsStructure with one Int16 element; param provides matching element value
    // mirror the CKV handler test for the success path
  });

  it('returns Result.partial when param systemId has no existing payload row', async () => {
    const moduleRepo = makeModuleRepo({
      getExistingTkvPayloads: vi.fn().mockResolvedValue([]),
    });
    const handler = new UpdateTkvCalDataHandler(makeUow(moduleRepo, makeModuleDefRepo()));
    const result = await handler.handle(makeCommand());
    expect(result.kind).toBe(RESULT_KIND.Partial);
    expect(result.data?.succeededParamSystemIds).toHaveLength(0);
    expect(result.issues?.length).toBeGreaterThan(0);
  });

  it('returns Result.partial when param definition is read-only', async () => {
    const defRepo = makeModuleDefRepo({
      getParameterDefinitions: vi.fn().mockResolvedValue([
        {systemId: PARAM_DEF_ID, isReadOnly: true, elementsStructure: '[]'},
      ]),
    });
    const handler = new UpdateTkvCalDataHandler(makeUow(makeModuleRepo(), defRepo));
    const result = await handler.handle(makeCommand());
    expect(result.kind).toBe(RESULT_KIND.Partial);
  });

  it('throws Error (DB integrity violation) when definition is missing for payload FK', async () => {
    const defRepo = makeModuleDefRepo({
      getParameterDefinitions: vi.fn().mockResolvedValue([]),
    });
    const handler = new UpdateTkvCalDataHandler(makeUow(makeModuleRepo(), defRepo));
    await expect(handler.handle(makeCommand())).rejects.toThrow(/DB integrity/);
  });

  it('calls rollback and rethrows when setTkvCalData throws', async () => {
    // mirror the CKV handler test for transaction rollback
    // definition: isReadOnly=false, elementsStructure='[]' (empty — serialization succeeds trivially)
    // setTkvCalData: throws new Error('write failed')
    // isInTransaction: returns true
    // assertions: rollback called, error rethrown
  });

  it('passes uiPersistence to setTkvCalData when provided', async () => {
    // mirror CKV handler test for uiPersistence passthrough
  });
});
```

The two cases marked with comment-only bodies should be fully implemented by reading the corresponding cases in `put-ckv-cal-data.handler.spec.ts` and adapting them — the mock setup is identical; only method names differ.

- [ ] **Step 2: Run tests to verify FAIL**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="update-tkv-cal-data.handler"`
Expected: FAIL — "Cannot find module '...update-tkv-cal-data.handler.js'"

- [ ] **Step 3: Implement `UpdateTkvCalDataHandler`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import type {UpdateTkvCalDataCommand} from './update-tkv-cal-data.command.js';
import type {UpdateTkvCalDataResult} from './update-tkv-cal-data-result.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import {mapDtoToParameterCalibration} from '../get-cal-data/ckv-cal-data-dto.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {ExistingPayloadRow} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {ParameterElementDto} from '../dto/element-dto.js';

type ParamProcessResult =
  | {
      ok: true;
      payloadSystemId: number;
      paramSystemId: number;
      payload: Uint8Array;
    }
  | {ok: false; issue: Issue};

export class UpdateTkvCalDataHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly logger?: Logger,
  ) {}

  async handle(
    command: UpdateTkvCalDataCommand,
  ): Promise<Result<UpdateTkvCalDataResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    const moduleRepo = this.uow.getModuleRepository();

    // Step 1: validate SpfModule exists
    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    // Step 2a: validate tag map exists under this SpfModule
    const tagMapExists = await moduleRepo.moduleTagIdMapExists(
      command.spfModuleSystemId,
      command.tagSystemId,
    );
    if (!tagMapExists)
      throw new ResourceNotFoundException('Tag (moduleTagIdMap) not found');

    // Step 2b: validate TKV exists under this tag map
    const tkvFound = await moduleRepo.tkvExists(
      command.tagSystemId,
      command.tkvSystemId,
    );
    if (!tkvFound) throw new ResourceNotFoundException('TKV not found');

    // Step 3: fetch existing payloads, then fetch definitions for those parameter IDs
    const existingPayloads = await moduleRepo.getExistingTkvPayloads(
      command.tagSystemId,
      command.tkvSystemId,
    );
    const relevantParamSystemIds = existingPayloads.map(p => p.parameterSystemId);
    const definitions = await this.uow
      .getModuleDefinitionRepository()
      .getParameterDefinitions(spfModule.definitionSystemId, relevantParamSystemIds);

    // Step 4: per-parameter validation + serialization
    const payloadMap = new Map(existingPayloads.map(p => [p.systemId, p]));
    const defMap = new Map(definitions.map(d => [d.systemId, d]));
    const issues: Issue[] = [];
    const succeededParamSystemIds: number[] = [];
    const writeBatch: Array<{payloadSystemId: number; payload: Uint8Array}> = [];

    for (const param of command.parameters) {
      const result = this.processParam(param, payloadMap, defMap);
      if (!result.ok) {
        issues.push(result.issue);
        continue;
      }
      succeededParamSystemIds.push(result.payloadSystemId);
      writeBatch.push({payloadSystemId: result.payloadSystemId, payload: result.payload});
    }

    // Step 5: write
    await this.uow.startTransaction();
    try {
      await moduleRepo.setTkvCalData(
        command.tagSystemId,
        command.tkvSystemId,
        writeBatch,
        command.uiPersistence,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw new Error(
        `Tag data write failed — transaction rolled back, no parameters were updated. Cause: ${(error as Error).message}`,
      );
    }

    const data: UpdateTkvCalDataResult = {groupId, succeededParamSystemIds};
    return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  }

  private processParam(
    param: {systemId: number; elements: ParameterElementDto[]},
    payloadMap: Map<number, ExistingPayloadRow>,
    defMap: Map<number, ParameterDefinitionBase>,
  ): ParamProcessResult {
    const existingPayload = payloadMap.get(param.systemId);
    if (!existingPayload) {
      return {ok: false, issue: IssueFactory.paramPayloadNotFound(param.systemId)};
    }
    const def = defMap.get(existingPayload.parameterSystemId);
    if (!def) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${existingPayload.parameterSystemId} — DB integrity violation`,
      );
    }
    if (def.isReadOnly) {
      return {ok: false, issue: IssueFactory.paramReadOnly(param.systemId)};
    }
    const serialized = serializeParameterData(
      def,
      mapDtoToParameterCalibration(param.elements),
      this.logger,
    );
    if (!serialized.ok) {
      return {
        ok: false,
        issue: IssueFactory.paramSerializationFailed(param.systemId, serialized.error),
      };
    }
    return {
      ok: true,
      payloadSystemId: param.systemId,
      paramSystemId: existingPayload.parameterSystemId,
      payload: serialized.value,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify PASS**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="update-tkv-cal-data.handler"`
Expected: PASS (all 8 cases)

---

### Task 7: Registry, index.ts, controller + E2E tests

**Package:** `@arc/core`, `@arc/api`

**Files:**
- Modify: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts`
- Create: `packages/api/tests/e2e/spf-module/update-tkv-data.e2e-spec.ts`

- [ ] **Step 1: Register `UpdateTkvCalDataHandler` in the command registry**

Open `command-handler-registry.ts`. Add imports directly below the `PutCkvCalDataCommand`/`PutCkvCalDataHandler` import pair:

```typescript
import {UpdateTkvCalDataCommand} from '../../usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.command.js';
import {UpdateTkvCalDataHandler} from '../../usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.handler.js';
```

Append the registration after the `PutCkvCalDataCommand` entry (the last existing entry in `registerAllCommandHandlers`):

```typescript
this.commandHandlerFactories.set(UpdateTkvCalDataCommand, {
  create: deps => new UpdateTkvCalDataHandler(deps.uow, deps.logger),
});
```

- [ ] **Step 2: Export from `packages/core/src/index.ts`**

Add two lines immediately after the `put-cal-data` exports (lines ~351–352):

```typescript
export * from './application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.command.js';
export * from './application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data-result.js';
```

- [ ] **Step 3: Implement `updateTagData` in the controller**

Open `spf-module.controller.ts`. Add to the `@arc/core` import line: `UpdateTkvCalDataCommand, type UpdateTkvCalDataResult`.

Replace the entire body of the `updateTagData` method (keeping all existing decorators, and adding `@UseGuards(SessionGuard)` before the route decorator if not already present). Also add `@ArcSession() session: ActiveSession` as the last parameter — it is already imported since `updateCalibrationData` uses it.

```typescript
@Put('/:spfModuleSystemId/tag-data/:tagSystemId/:tkvSystemId')
@UseGuards(SessionGuard)
// keep existing @ApiParam, @ApiDocumentationWithExample decorators unchanged
async updateTagData(
  @Param('projectId') projectId: string,
  @Param('spfModuleSystemId') spfModuleSystemId: string,
  @Param('tagSystemId') tagSystemId: string,
  @Param('tkvSystemId') tkvSystemId: string,
  @Body() body: UpdateTkvRequestDto,
  @ArcSession() session: ActiveSession,
): Promise<ApiResult<TkvCalDataResponseDto>> {
  const command = new UpdateTkvCalDataCommand(
    spfModuleSystemId,
    tagSystemId,
    tkvSystemId,
    body.parameters,
    body.uiPersistence,
  );

  const putResult = await this.commandBus.execute<Result<UpdateTkvCalDataResult>>(
    command,
    session,
  );
  if (putResult.kind === RESULT_KIND.Fail)
    throw new Error('UpdateTkvCalDataHandler returned unexpected Fail result');

  let data: TkvCalDataResponseDto | undefined;
  if (putResult.data.succeededParamSystemIds.length > 0) {
    const clientId = 'client-id';
    const query = new GetTkvCalibrationDataQuery(
      projectId,
      spfModuleSystemId,
      tagSystemId,
      tkvSystemId,
      clientId,
      putResult.data.succeededParamSystemIds.join(','),
    );
    const readResult = await this.queryBus.execute<Result<TkvCalDataResponseDto>>(query);
    data = readResult.kind !== RESULT_KIND.Fail ? readResult.data : undefined;
  }

  const issues = putResult.issues ?? [];
  const resultEnvelope =
    issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  return toApiResult(resultEnvelope);
}
```

`GetTkvCalibrationDataQuery` is already imported (added for the GET endpoint in a prior commit).

- [ ] **Step 4: Build all packages**

Run: `pnpm --filter @arc/core run build && pnpm --filter @arc/persistence run build && pnpm --filter @arc/api run build`
Expected: PASS

- [ ] **Step 5: Write E2E tests**

Read these two files before writing the test:
- `packages/api/tests/e2e/spf-module/get-tkv-data.e2e-spec.ts` — fixture upload, VOLUME_CONTROL lookup, `setupE2ETest` usage pattern
- The CKV update E2E file (run `find packages/api/tests/e2e -name "*ckv*" -o -name "*cal-data*"` to locate it) — session creation POST request pattern

Create `packages/api/tests/e2e/spf-module/update-tkv-data.e2e-spec.ts`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, beforeAll, afterAll} from '@jest/globals';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {createTestApp} from '../helpers/test-app.factory.js';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const VOLUME_CONTROL_MODULE_ID = 0x0700101b;

// ── Input-validation + auth tests (no session needed) ────────────────────────

describe('PUT tag-data — input validation', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    authToken = jwt.sign(
      {sub: 'test-user-id', clientId: 'test-client', username: 'test-user'},
      'arc-web-api',
    );
  }, 30000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 400 for non-numeric spfModuleSystemId', async () => {
    const res = await request(app.getHttpServer())
      .put('/arc-api/v1/projects/1/spf-modules/not-a-number/tag-data/1/1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: []});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric tagSystemId', async () => {
    const res = await request(app.getHttpServer())
      .put('/arc-api/v1/projects/1/spf-modules/1/tag-data/not-a-number/1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: []});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric tkvSystemId', async () => {
    const res = await request(app.getHttpServer())
      .put('/arc-api/v1/projects/1/spf-modules/1/tag-data/1/not-a-number')
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: []});
    expect(res.status).toBe(400);
  });

  it('returns 403 when no active session', async () => {
    const res = await request(app.getHttpServer())
      .put('/arc-api/v1/projects/1/spf-modules/1/tag-data/1/1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: []});
    expect(res.status).toBe(403);
  });
});

// ── Golden path (VOLUME_CONTROL, Designer session) ────────────────────────────

describe('PUT tag-data for VOLUME_CONTROL module (moduleId=0x0700101B)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sessionId: string | undefined;
  let volumeControlSystemId: string | undefined;
  let tagSystemId: string | undefined;
  let tkvSystemId: string | undefined;
  let firstParam: {systemId: number; elements: any[]} | undefined;

  beforeAll(async () => {
    // 1. Upload fixture + find VOLUME_CONTROL module (same as get-tkv-data.e2e-spec.ts beforeAll)
    const testSetup = await setupE2ETest();
    app      = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken  = testSetup.authToken;

    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadRes = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000);

    if (!uploadRes.body?.data?.projectId) return;
    projectId = uploadRes.body.data.projectId;

    // 2. Create Designer session
    // Read the CKV update E2E test for the exact POST body and response field.
    // Typical shape: POST /arc-api/v1/projects/:projectId/sessions { mode: 'Designer' }
    // Store sessionId from response for teardown.

    // 3. Find VOLUME_CONTROL module with tag+TKV (same loop as get-tkv-data.e2e-spec.ts)

    // 4. GET tag-data for the found TKV, capture first parameter
    if (projectId && volumeControlSystemId && tagSystemId && tkvSystemId) {
      const getRes = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/spf-modules/${volumeControlSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);
      if (getRes.status === 200 && getRes.body.data?.parameters?.length > 0) {
        const p = getRes.body.data.parameters[0];
        firstParam = {systemId: p.systemId, elements: p.elements};
      }
    }
  }, 350000);

  afterAll(async () => {
    if (projectId && sessionId) {
      await request(httpServer)
        .delete(`/arc-api/v1/projects/${projectId}/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000);
    }
    await teardownE2ETest(app);
  });

  it('returns HTTP 200 and TKV cal data after updating the first parameter', async () => {
    if (!projectId || !volumeControlSystemId || !tagSystemId || !tkvSystemId || !firstParam) {
      throw new Error(
        'Fixture setup failed — VOLUME_CONTROL module with TKV and writable parameter not found',
      );
    }
    const res = await request(httpServer)
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${volumeControlSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: [firstParam]})
      .timeout(30000);

    expect(res.status).toBe(200);
    expect(res.body.data?.parameters?.length).toBeGreaterThan(0);
  });

  it('returns HTTP 207 when a parameter systemId does not match any existing payload', async () => {
    if (!projectId || !volumeControlSystemId || !tagSystemId || !tkvSystemId) {
      throw new Error('Fixture setup failed');
    }
    const res = await request(httpServer)
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${volumeControlSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: [{systemId: 999_999_999, elements: []}]})
      .timeout(30000);

    expect(res.status).toBe(207);
    expect(res.body.issues?.length).toBeGreaterThan(0);
  });
});
```

For the `beforeAll` steps 2 and 3: read the CKV update E2E test for the exact session creation API shape, then copy the VOLUME_CONTROL search loop verbatim from `get-tkv-data.e2e-spec.ts`.

- [ ] **Step 6: Run E2E tests**

Run: `pnpm --filter @arc/api run test:api -- --testPathPattern="update-tkv-data.e2e"`
Expected: PASS (all cases)

- [ ] **Step 7: Full CI verification**

```bash
pnpm run format:check
pnpm run lint
pnpm --filter @arc/core run build
pnpm --filter @arc/persistence run build
pnpm --filter @arc/api run build
pnpm turbo run coverage:workspace
```

Expected: all PASS, all tests green.
