<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: CSLS repository port + ControlPort intent-lookup method (§11.10)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.10 (lines 1068–1095).
>
> **Goal of this chapter:** Land the two repository contracts §11.10 requires —
>
> 1. **`IControlSubsystemLinkSegmentRepository`** with the four read methods (`getAllForFile`, `getUnresolvedForFile`, `getByControlLinkId`, `getByPortId`). Used by `DeleteControlSubsystemLinkSegmentHandler` (intent clearing, Case B sibling nulling), `CreateControlSubsystemLinkSegmentHandler` Branch C (same-side check), and commit Step A' (unresolved-chain resolution).
> 2. **`IControlPortRepository.getIntentsByPortId`** — a new method that returns committed `IntentRow`s plus the active session's edit-action overlay for a given control port. Used by `DeleteControlSubsystemLinkSegmentHandler` to find which `IntentRow` records to clear for unanchored ports.
>
> Both interfaces live in `@arc/core` and their TypeORM implementations live in `@arc/persistence`. Every method is **overlay-aware**: the read pattern is `committed rows ⊕ edit_actions(sessionId, validUntil IS NULL, STAGED|UNSTAGED)` projected through `applyToCollection` from `queries/edit-session/overlay-merge.ts`.
>
> **Cardinal rule check:** the port interfaces in `@arc/core` declare the row shapes structurally (no import from `@arc/persistence`). The persistence-layer schema rows satisfy these structural shapes — the type names (`ControlSubsystemLinkSegmentRow`, `IntentRow`) are used verbatim per §11.10 but are independent declarations in the core file. The TypeORM impl is the only place that touches `EntitySchema`, `QueryRunner`, `edit_actions`, etc.
>
> **Read pattern detail.** Every method goes through this sequence:
> 1. `fetchCommitted(fileId)` — `manager.find(ENTITY_NAMES.ControlSubsystemLinkSegment, {where: {fileSystemId: fileId}})`.
> 2. `fetchEditActions(sessionId)` — `manager.find(ENTITY_NAMES.EditAction, {where: {sessionId, tableName: ENTITY_NAMES.ControlSubsystemLinkSegment}})` then post-filter to `validUntil === null` and `changeStatus ∈ {STAGED, UNSTAGED}`.
> 3. `applyToCollection(committed, overlayActions)` — produces the merged view. The helper handles CREATE (append), UPDATE (merge over committed), DELETE (drop).
> 4. Method-specific filter on the merged view.
>
> **`getUnresolvedForFile` specifically** uses the same overlay-merge but keeps only rows where the effective `controlLinkSystemId === null`. This catches **both** spec-required cases at once:
> - Pending `CHANGE_OPERATION.Create` edit-actions with payload `controlLinkSystemId: null` (Branch C unresolved CSLS).
> - Committed rows whose latest `CHANGE_OPERATION.Update` overlay sets `controlLinkSystemId: null` (Case B sibling-nulling from §11.7).

---

### Task 18: Define `IControlSubsystemLinkSegmentRepository` port interface

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.ts`
- Modify: `packages/core/src/application/ports/persistence/index.ts`
- Test: `packages/core/tests/unit/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create `packages/core/tests/unit/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import type {
    IControlSubsystemLinkSegmentRepository,
    ControlSubsystemLinkSegmentRow,
  } from '../../../../../../src/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.js';

  /**
   * Compile-time conformance test for the IControlSubsystemLinkSegmentRepository
   * port interface (spec §11.10). Verifies that a class with the four declared
   * methods satisfies the interface and that the row shape exposes the
   * spec-required fields.
   */
  class FakeCslsRepo implements IControlSubsystemLinkSegmentRepository {
    async getAllForFile(
      _fileId: number,
      _sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
    async getUnresolvedForFile(
      _fileId: number,
      _sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
    async getByControlLinkId(
      _controlLinkSystemId: number,
      _fileId: number,
      _sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
    async getByPortId(
      _portSystemId: number,
      _fileId: number,
      _sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
  }

  describe('IControlSubsystemLinkSegmentRepository (spec §11.10)', () => {
    it('is structurally satisfied by a class implementing all four read methods', async () => {
      const repo: IControlSubsystemLinkSegmentRepository = new FakeCslsRepo();
      await expect(repo.getAllForFile(1, 1)).resolves.toEqual([]);
      await expect(repo.getUnresolvedForFile(1, 1)).resolves.toEqual([]);
      await expect(repo.getByControlLinkId(5, 1, 1)).resolves.toEqual([]);
      await expect(repo.getByPortId(100, 1, 1)).resolves.toEqual([]);
    });

    it('ControlSubsystemLinkSegmentRow allows controlLinkSystemId === null (overlay payload, §11.2)', () => {
      const unresolved: ControlSubsystemLinkSegmentRow = {
        systemId: 9001,
        peerNodeASystemId: 10,
        peerNodeBSystemId: 20,
        nodeAPortSystemId: 100,
        nodeBPortSystemId: 200,
        controlLinkSystemId: null,
        fileSystemId: 1,
        version: 1,
      };
      expect(unresolved.controlLinkSystemId).toBeNull();

      const resolved: ControlSubsystemLinkSegmentRow = {
        ...unresolved,
        systemId: 9002,
        controlLinkSystemId: 5000,
      };
      expect(resolved.controlLinkSystemId).toBe(5000);
    });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-subsystem-link-segment.repository.port"`

  Expected: FAIL with `Cannot find module '.../control-subsystem-link-segment.repository.port.js'`.

- [ ] **Step 3: Create the port interface file**

  Create `packages/core/src/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  /**
   * Structural shape of a control_subsystem_link_segments row as seen by the
   * application layer. Mirrors `ControlSubsystemLinkSegmentRow` from
   * `@arc/persistence` (declared independently here to keep @arc/core free of
   * TypeORM imports — see cardinal rule in CLAUDE.md).
   *
   * `controlLinkSystemId` is nullable in this shape: the committed table is
   * NOT NULL (spec §11.3), but the overlay-merged view returned by the
   * repository may legitimately surface a `null` FK in two cases (spec §11.10):
   *   1. A pending CREATE edit_action whose payload carries `null` for the FK
   *      (Branch C unresolved CSLS — §11.6).
   *   2. A committed row whose latest staged UPDATE edit_action sets the FK
   *      to `null` (Case B sibling-nulling from §11.7).
   */
  export interface ControlSubsystemLinkSegmentRow {
    systemId: number;
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
    controlLinkSystemId: number | null;
    fileSystemId: number;
    version: number;
  }

  /**
   * Read-side repository for control subsystem link segments.
   *
   * All four methods return the committed-table view merged with the active
   * session's edit_actions overlay (STAGED + UNSTAGED, `validUntil IS NULL`).
   *
   * Spec §11.10.
   */
  export interface IControlSubsystemLinkSegmentRepository {
    /**
     * All CSLS for the file (committed + overlay).
     *
     * Used by `DeleteControlSubsystemLinkSegmentHandler` when computing the
     * remaining graph for the shared intent-clearing step (§11.7).
     */
    getAllForFile(
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]>;

    /**
     * Only CSLS where the effective `controlLinkSystemId` is `null` after
     * applying the overlay. This includes:
     *   - Pending CREATE edit_actions with `change_status = STAGED` and
     *     payload `controlLinkSystemId: null` (Branch C unresolved segments).
     *   - Committed rows whose latest staged UPDATE edit_action sets
     *     `controlLinkSystemId: null` (Case B sibling-null from §11.7).
     *
     * Used by commit Step A' (`ControlChainResolutionService`) to pick up
     * every segment still waiting for a `ControlLink` resolution.
     */
    getUnresolvedForFile(
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]>;

    /**
     * All CSLS whose effective `controlLinkSystemId` equals the given value
     * (committed + overlay).
     *
     * Used by `DeleteControlSubsystemLinkSegmentHandler` Case B sibling
     * null-FK UPDATE (§11.7).
     */
    getByControlLinkId(
      controlLinkSystemId: number,
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]>;

    /**
     * All CSLS that reference the given port as either `nodeAPortSystemId`
     * or `nodeBPortSystemId` (committed + overlay).
     *
     * Used by `CreateControlSubsystemLinkSegmentHandler` Branch C same-side
     * check (§11.6).
     */
    getByPortId(
      portSystemId: number,
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]>;
  }
  ```

- [ ] **Step 4: Export the interface and row type from `packages/core/src/application/ports/persistence/index.ts`**

  Open `packages/core/src/application/ports/persistence/index.ts`. Add two new lines at the bottom of the file, immediately after `export type {ProjectRepository} from './repositories/project/project.repository.js';`:

  ```typescript
  export type {
    IControlSubsystemLinkSegmentRepository,
    ControlSubsystemLinkSegmentRow,
  } from './repositories/control-subsystem-link-segment.repository.port.js';
  ```

  The complete file after this edit:

  ```typescript
  export type {UnitOfWork} from './unit-of-work.js';
  export type {
    UnitOfWorkFactory,
    UnitOfWorkContext,
  } from './unit-of-work-factory.js';
  export type {BulkImportRepository} from './repositories/bulk-import/bulk-import.repository.js';
  export type {ProjectRepository} from './repositories/project/project.repository.js';
  export type {
    IControlSubsystemLinkSegmentRepository,
    ControlSubsystemLinkSegmentRow,
  } from './repositories/control-subsystem-link-segment.repository.port.js';
  ```

- [ ] **Step 5: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-subsystem-link-segment.repository.port"`

  Expected: PASS — both `describe` blocks succeed.

- [ ] **Step 6: Verify `@arc/core` still builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors.

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.ts \
          packages/core/src/application/ports/persistence/index.ts \
          packages/core/tests/unit/application/ports/persistence/repositories/control-subsystem-link-segment.repository.port.spec.ts
  git commit -m "feat(core): add IControlSubsystemLinkSegmentRepository port (§11.10)" \
             -m "Declares the four read methods required by the CSLS handlers and the commit pre-pass: getAllForFile (intent clearing), getUnresolvedForFile (commit Step A'), getByControlLinkId (Case B sibling null-FK), and getByPortId (Branch C same-side check). Row shape allows controlLinkSystemId=null to model both pending CREATE overlays and committed rows whose FK was nulled by an UPDATE overlay (§11.7)." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 19: Define `IControlPortRepository` port with `getIntentsByPortId`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/repositories/control-port.repository.port.ts`
- Modify: `packages/core/src/application/ports/persistence/index.ts`
- Test: `packages/core/tests/unit/application/ports/persistence/repositories/control-port.repository.port.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create `packages/core/tests/unit/application/ports/persistence/repositories/control-port.repository.port.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import type {
    IControlPortRepository,
    IntentRow,
  } from '../../../../../../src/application/ports/persistence/repositories/control-port.repository.port.js';

  /**
   * Compile-time conformance test for the IControlPortRepository port (spec
   * §11.10 — only the new getIntentsByPortId method is declared here; other
   * ControlPort operations are added by sibling chapters).
   */
  class FakeControlPortRepo implements IControlPortRepository {
    async getIntentsByPortId(
      _portSystemId: number,
      _sessionId: number,
    ): Promise<IntentRow[]> {
      return [];
    }
  }

  describe('IControlPortRepository.getIntentsByPortId (spec §11.10)', () => {
    it('is structurally satisfied by a class declaring the method', async () => {
      const repo: IControlPortRepository = new FakeControlPortRepo();
      await expect(repo.getIntentsByPortId(100, 1)).resolves.toEqual([]);
    });

    it('IntentRow exposes systemId / intentId / controlPortSystemId / version', () => {
      const row: IntentRow = {
        systemId: 7000,
        intentId: 42,
        controlPortSystemId: 100,
        version: 1,
      };
      expect(row.systemId).toBe(7000);
      expect(row.intentId).toBe(42);
      expect(row.controlPortSystemId).toBe(100);
      expect(row.version).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-port.repository.port"`

  Expected: FAIL with `Cannot find module '.../control-port.repository.port.js'`.

- [ ] **Step 3: Create the port interface file**

  Create `packages/core/src/application/ports/persistence/repositories/control-port.repository.port.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  /**
   * Structural shape of an `intents` row as seen by the application layer.
   * Mirrors the persistence-layer `IntentRow` (declared independently here to
   * keep @arc/core free of TypeORM imports — see cardinal rule in CLAUDE.md).
   *
   * Fields match the `intents` table:
   *   - `systemId`            — primary key
   *   - `intentId`            — natural / wire-protocol intent identifier
   *   - `controlPortSystemId` — FK to `control_ports.system_id`
   *   - `version`             — optimistic-locking column
   */
  export interface IntentRow {
    systemId: number;
    intentId: number;
    controlPortSystemId: number;
    version: number;
  }

  /**
   * Read-side repository for control ports.
   *
   * This interface starts with the single method required by spec §11.10 —
   * `getIntentsByPortId`. Sibling chapters extend the interface with the
   * additional ControlPort read/lookup methods their handlers need.
   *
   * Spec §11.10.
   */
  export interface IControlPortRepository {
    /**
     * Returns every IntentRow attached to the given control port — committed
     * rows merged with the active session's edit_actions overlay
     * (STAGED + UNSTAGED, `validUntil IS NULL`).
     *
     * The merged view honours:
     *   - CREATE overlays — append (intent staged for creation).
     *   - UPDATE overlays — merge over the committed row.
     *   - DELETE overlays — drop the row from the result.
     *
     * Used by `DeleteControlSubsystemLinkSegmentHandler` to find which
     * IntentRows to clear for ports that the propagation analysis (§11.8 Op A)
     * has flagged as unanchored.
     */
    getIntentsByPortId(
      portSystemId: number,
      sessionId: number,
    ): Promise<IntentRow[]>;
  }
  ```

- [ ] **Step 4: Export from `packages/core/src/application/ports/persistence/index.ts`**

  Open `packages/core/src/application/ports/persistence/index.ts`. Append immediately after the `IControlSubsystemLinkSegmentRepository` export added in Task 18:

  ```typescript
  export type {
    IControlPortRepository,
    IntentRow,
  } from './repositories/control-port.repository.port.js';
  ```

- [ ] **Step 5: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-port.repository.port"`

  Expected: PASS — both assertions succeed.

- [ ] **Step 6: Verify `@arc/core` still builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors.

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/ports/persistence/repositories/control-port.repository.port.ts \
          packages/core/src/application/ports/persistence/index.ts \
          packages/core/tests/unit/application/ports/persistence/repositories/control-port.repository.port.spec.ts
  git commit -m "feat(core): add IControlPortRepository port with getIntentsByPortId (§11.10)" \
             -m "Introduces the IControlPortRepository port carrying the single overlay-aware read getIntentsByPortId(portSystemId, sessionId) that DeleteControlSubsystemLinkSegmentHandler uses to discover which IntentRows to clear for unanchored ports. IntentRow is declared as a structural shape in core so the interface stays free of @arc/persistence imports (cardinal rule)." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 20: Wire `IControlSubsystemLinkSegmentRepository` and `IControlPortRepository` into `UnitOfWork`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/ports/persistence/unit-of-work.ts`
- Test: `packages/core/tests/unit/application/ports/persistence/unit-of-work-csls-control-port.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create `packages/core/tests/unit/application/ports/persistence/unit-of-work-csls-control-port.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import type {
    UnitOfWork,
    IControlSubsystemLinkSegmentRepository,
    IControlPortRepository,
    ControlSubsystemLinkSegmentRow,
    IntentRow,
  } from '../../../../../src/application/ports/persistence/index.js';

  class StubCslsRepo implements IControlSubsystemLinkSegmentRepository {
    async getAllForFile(): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
    async getUnresolvedForFile(): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
    async getByControlLinkId(): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
    async getByPortId(): Promise<ControlSubsystemLinkSegmentRow[]> {
      return [];
    }
  }

  class StubControlPortRepo implements IControlPortRepository {
    async getIntentsByPortId(): Promise<IntentRow[]> {
      return [];
    }
  }

  /**
   * Compile-time conformance test: the UnitOfWork interface must declare two
   * new getters required by the CSLS / ControlPort handlers (spec §11.10).
   */
  describe('UnitOfWork CSLS + ControlPort getters (spec §11.10)', () => {
    it('declares getControlSubsystemLinkSegmentRepository(): IControlSubsystemLinkSegmentRepository', () => {
      const stub: Pick<UnitOfWork, 'getControlSubsystemLinkSegmentRepository'> = {
        getControlSubsystemLinkSegmentRepository: () => new StubCslsRepo(),
      };
      const repo: IControlSubsystemLinkSegmentRepository =
        stub.getControlSubsystemLinkSegmentRepository();
      expect(typeof repo.getUnresolvedForFile).toBe('function');
    });

    it('declares getControlPortRepository(): IControlPortRepository', () => {
      const stub: Pick<UnitOfWork, 'getControlPortRepository'> = {
        getControlPortRepository: () => new StubControlPortRepo(),
      };
      const repo: IControlPortRepository = stub.getControlPortRepository();
      expect(typeof repo.getIntentsByPortId).toBe('function');
    });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="unit-of-work-csls-control-port"`

  Expected: FAIL with a TypeScript error along the lines of `Property 'getControlSubsystemLinkSegmentRepository' is missing in type 'UnitOfWork'`.

- [ ] **Step 3: Add the two new getter method signatures to `UnitOfWork`**

  Open `packages/core/src/application/ports/persistence/unit-of-work.ts`. Add two new import lines at the top of the file alongside the existing imports:

  ```typescript
  import type {IControlSubsystemLinkSegmentRepository} from './repositories/control-subsystem-link-segment.repository.port.js';
  import type {IControlPortRepository} from './repositories/control-port.repository.port.js';
  ```

  Then append the two new getters at the end of the `UnitOfWork` interface body, after `getValidationQueryService(): ValidationQueryRepository;`:

  ```typescript
    /**
     * Get the control subsystem link segment repository for CSLS overlay-aware
     * reads. Uses the shared QueryRunner from this UOW.
     *
     * Spec §11.10.
     */
    getControlSubsystemLinkSegmentRepository(): IControlSubsystemLinkSegmentRepository;

    /**
     * Get the control port repository for control-port overlay-aware reads
     * (currently exposes only getIntentsByPortId; sibling chapters add more
     * methods). Uses the shared QueryRunner from this UOW.
     *
     * Spec §11.10.
     */
    getControlPortRepository(): IControlPortRepository;
  ```

  The complete updated `unit-of-work.ts` after the edit:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {BulkImportRepository} from './repositories/bulk-import/bulk-import.repository.js';
  import type {ProjectRepository} from './repositories/project/project.repository.js';
  import type {ValidationPreferencesRepository} from './repositories/validation/validation-preferences.repository.js';
  import type {ValidationQueryRepository} from './repositories/validation/validation-query.repository.js';
  import type {IControlSubsystemLinkSegmentRepository} from './repositories/control-subsystem-link-segment.repository.port.js';
  import type {IControlPortRepository} from './repositories/control-port.repository.port.js';

  export interface UnitOfWork {
    startTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    isInTransaction(): boolean;

    getBulkImportRepository(): BulkImportRepository;
    getProjectRepository(): ProjectRepository;
    getValidationPreferencesRepository(): ValidationPreferencesRepository;
    getValidationQueryService(): ValidationQueryRepository;

    /**
     * Get the control subsystem link segment repository for CSLS overlay-aware
     * reads. Uses the shared QueryRunner from this UOW.
     *
     * Spec §11.10.
     */
    getControlSubsystemLinkSegmentRepository(): IControlSubsystemLinkSegmentRepository;

    /**
     * Get the control port repository for control-port overlay-aware reads
     * (currently exposes only getIntentsByPortId; sibling chapters add more
     * methods). Uses the shared QueryRunner from this UOW.
     *
     * Spec §11.10.
     */
    getControlPortRepository(): IControlPortRepository;
  }
  ```

  > **Note** — the existing JSDoc comments on the four pre-existing getters (`getBulkImportRepository`, `getProjectRepository`, `getValidationPreferencesRepository`, `getValidationQueryService`) MUST be preserved. The simplified body above is for clarity in this plan; do not delete the existing doc comments when editing the real file. Insert the two new getters at the end, leaving the rest of the file unchanged.

- [ ] **Step 4: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="unit-of-work-csls-control-port"`

  Expected: PASS — both new getter declarations are present.

- [ ] **Step 5: Verify `@arc/core` builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors. The `TypeOrmUnitOfWork` class in `@arc/api` will now report two missing-method errors — those are addressed in Task 22.

- [ ] **Step 6: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/ports/persistence/unit-of-work.ts \
          packages/core/tests/unit/application/ports/persistence/unit-of-work-csls-control-port.spec.ts
  git commit -m "feat(core): wire CSLS and ControlPort repositories into UnitOfWork (§11.10)" \
             -m "Adds getControlSubsystemLinkSegmentRepository() and getControlPortRepository() to the UnitOfWork port so the CSLS create/delete handlers and the commit Step A' pre-pass can obtain overlay-aware repositories sharing the active QueryRunner." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 21: Implement `TypeOrmControlSubsystemLinkSegmentRepository` with integration tests

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-subsystem-link-segment/typeorm-control-subsystem-link-segment.repository.ts`
- Modify: `packages/infrastructure/persistence/src/index.ts` (export the new class)
- Test: `packages/infrastructure/persistence/tests/integration/repositories/typeorm-control-subsystem-link-segment.repository.spec.ts` (new)

- [ ] **Step 1: Write the failing integration test**

  Create `packages/infrastructure/persistence/tests/integration/repositories/typeorm-control-subsystem-link-segment.repository.spec.ts`:

  ```typescript
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
  import type {QueryRunner, EntityManager} from 'typeorm';
  import {
    setupIntegrationTest,
    teardownIntegrationTest,
    setupEachTest,
    getTestDataSource,
  } from '../helpers/test-database-setup.js';
  import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
  import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
  import {TypeOrmControlSubsystemLinkSegmentRepository} from '../../../src/persistence-typeorm-sqllite/repositories/control-subsystem-link-segment/typeorm-control-subsystem-link-segment.repository.js';

  // ── Fixture IDs ────────────────────────────────────────────────────────────
  const FILE_ID = 100;
  const OTHER_FILE_ID = 101;
  const SUBGRAPH_ID = 400;
  const MODULE_NODE_ID = 200;
  const SUBSYSTEM_NODE_ID = 201;
  const PORT_A_ID = 300;
  const PORT_B_ID = 301;
  const PORT_C_ID = 302;
  const CONTROL_LINK_ID = 500;
  const OTHER_CONTROL_LINK_ID = 501;

  async function createFkDependencies(manager: EntityManager): Promise<void> {
    await manager.insert(ENTITY_NAMES.Project, {
      systemId: 1, name: 'P', description: '', type: 'Offline', version: 1,
    });
    await manager.insert(ENTITY_NAMES.ArcDbFile, {
      systemId: FILE_ID, projectSystemId: 1, fileName: 'f.awsp',
      description: '', metadata: '{}', isTarget: 0, lastReservedId: 0, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ArcDbFile, {
      systemId: OTHER_FILE_ID, projectSystemId: 1, fileName: 'g.awsp',
      description: '', metadata: '{}', isTarget: 0, lastReservedId: 0, version: 1,
    });
    await manager.insert(ENTITY_NAMES.Subgraph, {
      systemId: SUBGRAPH_ID, subgraphId: 1, name: 'sg', isExported: 0,
      fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.Node, {
      systemId: MODULE_NODE_ID, type: 'module', fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.Node, {
      systemId: SUBSYSTEM_NODE_ID, type: 'subsystem', fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlPort, {
      systemId: PORT_A_ID, portId: 1, isStatic: 1, nodeSystemId: MODULE_NODE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlPort, {
      systemId: PORT_B_ID, portId: 2, isStatic: 1, nodeSystemId: SUBSYSTEM_NODE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlPort, {
      systemId: PORT_C_ID, portId: 3, isStatic: 0, nodeSystemId: SUBSYSTEM_NODE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlLink, {
      systemId: CONTROL_LINK_ID,
      fileSystemId: FILE_ID,
      peerNodeASystemId: MODULE_NODE_ID,
      peerNodeBSystemId: SUBSYSTEM_NODE_ID,
      nodeAPortSystemId: PORT_A_ID,
      nodeBPortSystemId: PORT_B_ID,
      heapId: 0,
      linkType: 'INTRA_SUBGRAPH',
      sourceSubgraphSystemId: SUBGRAPH_ID,
      destSubgraphSystemId: SUBGRAPH_ID,
      version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlLink, {
      systemId: OTHER_CONTROL_LINK_ID,
      fileSystemId: FILE_ID,
      peerNodeASystemId: MODULE_NODE_ID,
      peerNodeBSystemId: SUBSYSTEM_NODE_ID,
      nodeAPortSystemId: PORT_A_ID,
      nodeBPortSystemId: PORT_C_ID,
      heapId: 0,
      linkType: 'INTRA_SUBGRAPH',
      sourceSubgraphSystemId: SUBGRAPH_ID,
      destSubgraphSystemId: SUBGRAPH_ID,
      version: 1,
    });
  }

  async function insertCommittedCsls(
    manager: EntityManager,
    overrides: {
      systemId: number;
      controlLinkSystemId: number | null;
      portA?: number;
      portB?: number;
      file?: number;
    },
  ): Promise<void> {
    await manager.insert(ENTITY_NAMES.ControlSubsystemLinkSegment, {
      systemId: overrides.systemId,
      peerNodeASystemId: MODULE_NODE_ID,
      peerNodeBSystemId: SUBSYSTEM_NODE_ID,
      nodeAPortSystemId: overrides.portA ?? PORT_A_ID,
      nodeBPortSystemId: overrides.portB ?? PORT_B_ID,
      controlLinkSystemId: overrides.controlLinkSystemId,
      fileSystemId: overrides.file ?? FILE_ID,
      version: 1,
    });
  }

  async function insertEditAction(
    manager: EntityManager,
    sessionId: number,
    systemId: number,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: Record<string, unknown>,
  ): Promise<void> {
    await manager.insert(ENTITY_NAMES.EditAction, {
      systemId,
      aggregateId: 0,
      sessionId,
      tableName: ENTITY_NAMES.ControlSubsystemLinkSegment,
      operation,
      payload: JSON.stringify(payload),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });
  }

  async function createSession(
    manager: EntityManager,
    fileSystemId: number,
  ): Promise<number> {
    const inserted = await manager.insert(ENTITY_NAMES.ProjectSession, {
      fileSystemId,
      userId: 'test-user',
      clientId: 'test-client',
      sessionMode: 'designer',
      status: 'active',
      endedAt: null,
    });
    return Number(inserted.identifiers[0].sessionId);
  }

  describe('TypeOrmControlSubsystemLinkSegmentRepository (spec §11.10)', () => {
    let queryRunner: QueryRunner;
    let repo: TypeOrmControlSubsystemLinkSegmentRepository;

    beforeAll(async () => {
      await setupIntegrationTest();
    });
    afterAll(async () => {
      await teardownIntegrationTest();
    });
    beforeEach(async () => {
      await setupEachTest();
      queryRunner = getTestDataSource().createQueryRunner();
      await queryRunner.connect();
      repo = new TypeOrmControlSubsystemLinkSegmentRepository(queryRunner);
    });
    afterEach(async () => {
      await queryRunner.release();
    });

    // ── getAllForFile ──────────────────────────────────────────────────────
    describe('getAllForFile', () => {
      it('returns committed CSLS for the file plus overlay CREATEs, ignoring DELETEs', async () => {
        const manager = queryRunner.manager;
        await createFkDependencies(manager);
        const sessionId = await createSession(manager, FILE_ID);

        // Committed: one CSLS (will be DELETE-overlayed) + one (untouched).
        await insertCommittedCsls(manager, {
          systemId: 9001,
          controlLinkSystemId: CONTROL_LINK_ID,
        });
        await insertCommittedCsls(manager, {
          systemId: 9002,
          controlLinkSystemId: OTHER_CONTROL_LINK_ID,
          portB: PORT_C_ID,
        });

        // Overlay: DELETE 9001 + CREATE pending 9003 + CSLS in OTHER_FILE_ID committed (filtered out by file scope).
        await insertEditAction(manager, sessionId, 9001, CHANGE_OPERATION.Delete, {systemId: 9001});
        await insertEditAction(manager, sessionId, 9003, CHANGE_OPERATION.Create, {
          systemId: 9003,
          peerNodeASystemId: MODULE_NODE_ID,
          peerNodeBSystemId: SUBSYSTEM_NODE_ID,
          nodeAPortSystemId: PORT_A_ID,
          nodeBPortSystemId: PORT_B_ID,
          controlLinkSystemId: null,
          fileSystemId: FILE_ID,
          version: 1,
        });

        const result = await repo.getAllForFile(FILE_ID, sessionId);
        const ids = result.map(r => r.systemId).sort((a, b) => a - b);
        expect(ids).toEqual([9002, 9003]);
      });

      it('honours sessionId — overlay from a different session is ignored', async () => {
        const manager = queryRunner.manager;
        await createFkDependencies(manager);
        const sessionA = await createSession(manager, FILE_ID);
        const sessionB = await createSession(manager, FILE_ID);

        await insertCommittedCsls(manager, {
          systemId: 9010,
          controlLinkSystemId: CONTROL_LINK_ID,
        });
        // DELETE overlay belongs to sessionB only.
        await insertEditAction(manager, sessionB, 9010, CHANGE_OPERATION.Delete, {systemId: 9010});

        const fromA = await repo.getAllForFile(FILE_ID, sessionA);
        expect(fromA.map(r => r.systemId)).toEqual([9010]);

        const fromB = await repo.getAllForFile(FILE_ID, sessionB);
        expect(fromB).toEqual([]);
      });
    });

    // ── getUnresolvedForFile ────────────────────────────────────────────────
    describe('getUnresolvedForFile', () => {
      it('returns pending CREATEs whose payload has controlLinkSystemId === null', async () => {
        const manager = queryRunner.manager;
        await createFkDependencies(manager);
        const sessionId = await createSession(manager, FILE_ID);

        await insertEditAction(manager, sessionId, 9100, CHANGE_OPERATION.Create, {
          systemId: 9100,
          peerNodeASystemId: MODULE_NODE_ID,
          peerNodeBSystemId: SUBSYSTEM_NODE_ID,
          nodeAPortSystemId: PORT_A_ID,
          nodeBPortSystemId: PORT_B_ID,
          controlLinkSystemId: null,
          fileSystemId: FILE_ID,
          version: 1,
        });
        // Also: a pending CREATE that IS resolved (controlLinkSystemId set) — must NOT be returned.
        await insertEditAction(manager, sessionId, 9101, CHANGE_OPERATION.Create, {
          systemId: 9101,
          peerNodeASystemId: MODULE_NODE_ID,
          peerNodeBSystemId: SUBSYSTEM_NODE_ID,
          nodeAPortSystemId: PORT_A_ID,
          nodeBPortSystemId: PORT_C_ID,
          controlLinkSystemId: CONTROL_LINK_ID,
          fileSystemId: FILE_ID,
          version: 1,
        });

        const result = await repo.getUnresolvedForFile(FILE_ID, sessionId);
        expect(result.map(r => r.systemId)).toEqual([9100]);
        expect(result[0].controlLinkSystemId).toBeNull();
      });

      it('returns committed rows whose latest UPDATE overlay sets controlLinkSystemId = null (sibling-null §11.7 Case B)', async () => {
        const manager = queryRunner.manager;
        await createFkDependencies(manager);
        const sessionId = await createSession(manager, FILE_ID);

        // Committed row with FK set; overlay nulls it.
        await insertCommittedCsls(manager, {
          systemId: 9200,
          controlLinkSystemId: CONTROL_LINK_ID,
        });
        await insertEditAction(manager, sessionId, 9200, CHANGE_OPERATION.Update, {
          controlLinkSystemId: null,
        });

        // Resolved sibling of an unrelated link must NOT be returned.
        await insertCommittedCsls(manager, {
          systemId: 9201,
          controlLinkSystemId: OTHER_CONTROL_LINK_ID,
          portB: PORT_C_ID,
        });

        const result = await repo.getUnresolvedForFile(FILE_ID, sessionId);
        expect(result.map(r => r.systemId)).toEqual([9200]);
        expect(result[0].controlLinkSystemId).toBeNull();
      });
    });

    // ── getByControlLinkId ──────────────────────────────────────────────────
    describe('getByControlLinkId', () => {
      it('returns only rows whose effective controlLinkSystemId matches', async () => {
        const manager = queryRunner.manager;
        await createFkDependencies(manager);
        const sessionId = await createSession(manager, FILE_ID);

        await insertCommittedCsls(manager, {
          systemId: 9300, controlLinkSystemId: CONTROL_LINK_ID,
        });
        await insertCommittedCsls(manager, {
          systemId: 9301, controlLinkSystemId: CONTROL_LINK_ID, portB: PORT_C_ID,
        });
        await insertCommittedCsls(manager, {
          systemId: 9302, controlLinkSystemId: OTHER_CONTROL_LINK_ID, portB: PORT_C_ID,
        });

        // Overlay: UPDATE nulls one row's FK → it must drop out.
        await insertEditAction(manager, sessionId, 9301, CHANGE_OPERATION.Update, {
          controlLinkSystemId: null,
        });

        const result = await repo.getByControlLinkId(CONTROL_LINK_ID, FILE_ID, sessionId);
        expect(result.map(r => r.systemId).sort((a, b) => a - b)).toEqual([9300]);
      });
    });

    // ── getByPortId ─────────────────────────────────────────────────────────
    describe('getByPortId', () => {
      it('returns CSLS where the port appears as nodeAPortSystemId OR nodeBPortSystemId', async () => {
        const manager = queryRunner.manager;
        await createFkDependencies(manager);
        const sessionId = await createSession(manager, FILE_ID);

        // 9400: port appears as A.
        await insertCommittedCsls(manager, {
          systemId: 9400, controlLinkSystemId: CONTROL_LINK_ID,
          portA: PORT_B_ID, portB: PORT_C_ID,
        });
        // 9401: port appears as B.
        await insertCommittedCsls(manager, {
          systemId: 9401, controlLinkSystemId: OTHER_CONTROL_LINK_ID,
          portA: PORT_A_ID, portB: PORT_B_ID,
        });
        // 9402: port does NOT appear.
        await insertCommittedCsls(manager, {
          systemId: 9402, controlLinkSystemId: OTHER_CONTROL_LINK_ID,
          portA: PORT_A_ID, portB: PORT_C_ID,
        });

        const result = await repo.getByPortId(PORT_B_ID, FILE_ID, sessionId);
        expect(result.map(r => r.systemId).sort((a, b) => a - b)).toEqual([9400, 9401]);
      });
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="typeorm-control-subsystem-link-segment.repository"`

  Expected: FAIL with `Cannot find module '.../typeorm-control-subsystem-link-segment.repository.js'`.

- [ ] **Step 3: Create the implementation file**

  Create `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-subsystem-link-segment/typeorm-control-subsystem-link-segment.repository.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {QueryRunner} from 'typeorm';
  import type {
    IControlSubsystemLinkSegmentRepository,
    ControlSubsystemLinkSegmentRow,
  } from '@arc/core';
  import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
  import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
  import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
  import type {ControlSubsystemLinkSegmentRow as PersistenceCslsRow} from '../../entity-schema/usecase-data/Links/control-subsystem-link-segment.schema.js';
  import {
    applyToCollection,
    type EditActionForOverlay,
  } from '../../queries/edit-session/overlay-merge.js';

  /**
   * TypeORM implementation of IControlSubsystemLinkSegmentRepository.
   *
   * All four methods follow the same overlay-aware read pattern:
   *   1. Fetch the committed rows for the file from `control_subsystem_link_segments`.
   *   2. Fetch the active session's STAGED + UNSTAGED edit_actions (validUntil IS NULL)
   *      for `tableName = ControlSubsystemLinkSegment`.
   *   3. Project the edit_actions through `applyToCollection` (CREATE → append,
   *      UPDATE → merge over committed, DELETE → drop).
   *   4. Apply the method-specific filter on the merged view.
   *
   * Spec §11.10.
   */
  export class TypeOrmControlSubsystemLinkSegmentRepository
    implements IControlSubsystemLinkSegmentRepository
  {
    constructor(private readonly queryRunner: QueryRunner) {}

    // ── helpers ────────────────────────────────────────────────────────────

    private async fetchCommitted(
      fileId: number,
    ): Promise<PersistenceCslsRow[]> {
      return this.queryRunner.manager.find<PersistenceCslsRow>(
        ENTITY_NAMES.ControlSubsystemLinkSegment,
        {where: {fileSystemId: fileId}},
      );
    }

    private async fetchEditActions(
      sessionId: number,
    ): Promise<EditActionForOverlay[]> {
      const rows = await this.queryRunner.manager
        .createQueryBuilder<EditActionRow>(ENTITY_NAMES.EditAction, 'ea')
        .where('ea.sessionId = :sessionId', {sessionId})
        .andWhere('ea.tableName = :tableName', {
          tableName: ENTITY_NAMES.ControlSubsystemLinkSegment,
        })
        .andWhere('ea.validUntil IS NULL')
        .andWhere('ea.changeStatus IN (:...statuses)', {
          statuses: [CHANGE_STATUS.Staged, CHANGE_STATUS.Unstaged],
        })
        .getMany();

      // edit_actions.payload is stored as a JSON string; parse before merging.
      return rows.map(r => ({
        systemId: r.systemId,
        operation: r.operation,
        payload:
          typeof r.payload === 'string'
            ? (JSON.parse(r.payload) as unknown)
            : r.payload,
      }));
    }

    private mergedView(
      fileId: number,
      committed: PersistenceCslsRow[],
      overlayActions: EditActionForOverlay[],
    ): ControlSubsystemLinkSegmentRow[] {
      const merged = applyToCollection<PersistenceCslsRow>(
        committed,
        overlayActions,
      );
      // Scope to the file — an overlay CREATE may carry a different fileSystemId
      // if a session ever spans files; defend against that here.
      return merged
        .filter(row => row.fileSystemId === fileId)
        .map(row => this.toPort(row));
    }

    private toPort(row: PersistenceCslsRow): ControlSubsystemLinkSegmentRow {
      return {
        systemId: row.systemId,
        peerNodeASystemId: row.peerNodeASystemId,
        peerNodeBSystemId: row.peerNodeBSystemId,
        nodeAPortSystemId: row.nodeAPortSystemId,
        nodeBPortSystemId: row.nodeBPortSystemId,
        // Persistence row type is non-null; cast to nullable since overlay may null it.
        controlLinkSystemId:
          (row.controlLinkSystemId as number | null | undefined) ?? null,
        fileSystemId: row.fileSystemId,
        version: row.version,
      };
    }

    // ── interface methods ──────────────────────────────────────────────────

    async getAllForFile(
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      const [committed, overlayActions] = await Promise.all([
        this.fetchCommitted(fileId),
        this.fetchEditActions(sessionId),
      ]);
      return this.mergedView(fileId, committed, overlayActions);
    }

    async getUnresolvedForFile(
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      const all = await this.getAllForFile(fileId, sessionId);
      // Pending CREATEs with null FK AND committed rows whose UPDATE overlay
      // set the FK to null both surface here.
      return all.filter(row => row.controlLinkSystemId === null);
    }

    async getByControlLinkId(
      controlLinkSystemId: number,
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      const all = await this.getAllForFile(fileId, sessionId);
      return all.filter(
        row => row.controlLinkSystemId === controlLinkSystemId,
      );
    }

    async getByPortId(
      portSystemId: number,
      fileId: number,
      sessionId: number,
    ): Promise<ControlSubsystemLinkSegmentRow[]> {
      const all = await this.getAllForFile(fileId, sessionId);
      return all.filter(
        row =>
          row.nodeAPortSystemId === portSystemId ||
          row.nodeBPortSystemId === portSystemId,
      );
    }

    // Silence "unused parameter" linter if needed — kept verbose for clarity.
    private static _spec = CHANGE_OPERATION;
  }
  ```

- [ ] **Step 4: Export the new class from `packages/infrastructure/persistence/src/index.ts`**

  Open `packages/infrastructure/persistence/src/index.ts`. Append:

  ```typescript
  export * from './persistence-typeorm-sqllite/repositories/control-subsystem-link-segment/typeorm-control-subsystem-link-segment.repository.js';
  ```

- [ ] **Step 5: Run the integration test to verify it passes**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="typeorm-control-subsystem-link-segment.repository"`

  Expected: PASS — all `getAllForFile`, `getUnresolvedForFile`, `getByControlLinkId`, and `getByPortId` blocks succeed.

- [ ] **Step 6: Run the full persistence integration suite as a regression guard**

  Run: `pnpm --filter @arc/persistence run test:integration`

  Expected: PASS — no pre-existing test is broken.

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-subsystem-link-segment/typeorm-control-subsystem-link-segment.repository.ts \
          packages/infrastructure/persistence/src/index.ts \
          packages/infrastructure/persistence/tests/integration/repositories/typeorm-control-subsystem-link-segment.repository.spec.ts
  git commit -m "feat(db): implement TypeOrmControlSubsystemLinkSegmentRepository (§11.10)" \
             -m "Implements all four CSLS read methods with the overlay-aware pattern: fetch committed rows from control_subsystem_link_segments, fetch STAGED+UNSTAGED edit_actions with validUntil IS NULL, merge via applyToCollection (CREATE/UPDATE/DELETE), then apply the per-method filter. getUnresolvedForFile picks up both pending CREATE payloads with controlLinkSystemId=null and committed rows whose UPDATE overlay sets it to null (sibling-null §11.7 Case B)." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 22: Implement `TypeOrmControlPortRepository.getIntentsByPortId`, wire both repos into `TypeOrmUnitOfWork`

**Package:** `@arc/persistence` (impl) + `@arc/api` (UoW wiring)

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-port/typeorm-control-port.repository.ts`
- Modify: `packages/infrastructure/persistence/src/index.ts`
- Modify: `packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts`
- Test: `packages/infrastructure/persistence/tests/integration/repositories/typeorm-control-port.repository.spec.ts` (new)

- [ ] **Step 1: Write the failing integration test**

  Create `packages/infrastructure/persistence/tests/integration/repositories/typeorm-control-port.repository.spec.ts`:

  ```typescript
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
    afterEach,
  } from '@jest/globals';
  import type {QueryRunner, EntityManager} from 'typeorm';
  import {
    setupIntegrationTest,
    teardownIntegrationTest,
    setupEachTest,
    getTestDataSource,
  } from '../helpers/test-database-setup.js';
  import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
  import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
  import {TypeOrmControlPortRepository} from '../../../src/persistence-typeorm-sqllite/repositories/control-port/typeorm-control-port.repository.js';

  const FILE_ID = 100;
  const NODE_ID = 200;
  const PORT_ID = 300;
  const OTHER_PORT_ID = 301;

  async function createFkDependencies(manager: EntityManager): Promise<void> {
    await manager.insert(ENTITY_NAMES.Project, {
      systemId: 1, name: 'P', description: '', type: 'Offline', version: 1,
    });
    await manager.insert(ENTITY_NAMES.ArcDbFile, {
      systemId: FILE_ID, projectSystemId: 1, fileName: 'f.awsp',
      description: '', metadata: '{}', isTarget: 0, lastReservedId: 0, version: 1,
    });
    await manager.insert(ENTITY_NAMES.Node, {
      systemId: NODE_ID, type: 'subsystem', fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlPort, {
      systemId: PORT_ID, portId: 1, isStatic: 1, nodeSystemId: NODE_ID, version: 1,
    });
    await manager.insert(ENTITY_NAMES.ControlPort, {
      systemId: OTHER_PORT_ID, portId: 2, isStatic: 1, nodeSystemId: NODE_ID, version: 1,
    });
  }

  async function insertCommittedIntent(
    manager: EntityManager,
    systemId: number,
    intentId: number,
    controlPortSystemId: number,
  ): Promise<void> {
    await manager.insert(ENTITY_NAMES.Intent, {
      systemId,
      intentId,
      controlPortSystemId,
      version: 1,
    });
  }

  async function insertIntentEditAction(
    manager: EntityManager,
    sessionId: number,
    systemId: number,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: Record<string, unknown>,
  ): Promise<void> {
    await manager.insert(ENTITY_NAMES.EditAction, {
      systemId,
      aggregateId: 0,
      sessionId,
      tableName: ENTITY_NAMES.Intent,
      operation,
      payload: JSON.stringify(payload),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });
  }

  async function createSession(
    manager: EntityManager,
    fileSystemId: number,
  ): Promise<number> {
    const inserted = await manager.insert(ENTITY_NAMES.ProjectSession, {
      fileSystemId,
      userId: 'test-user',
      clientId: 'test-client',
      sessionMode: 'designer',
      status: 'active',
      endedAt: null,
    });
    return Number(inserted.identifiers[0].sessionId);
  }

  describe('TypeOrmControlPortRepository.getIntentsByPortId (spec §11.10)', () => {
    let queryRunner: QueryRunner;
    let repo: TypeOrmControlPortRepository;

    beforeAll(async () => {
      await setupIntegrationTest();
    });
    afterAll(async () => {
      await teardownIntegrationTest();
    });
    beforeEach(async () => {
      await setupEachTest();
      queryRunner = getTestDataSource().createQueryRunner();
      await queryRunner.connect();
      repo = new TypeOrmControlPortRepository(queryRunner);
    });
    afterEach(async () => {
      await queryRunner.release();
    });

    it('returns union of committed IntentRows and overlay CREATEs minus overlay DELETEs for the port', async () => {
      const manager = queryRunner.manager;
      await createFkDependencies(manager);
      const sessionId = await createSession(manager, FILE_ID);

      // Committed: two intents on PORT_ID, one will be DELETE-overlayed.
      await insertCommittedIntent(manager, 7000, 42, PORT_ID);
      await insertCommittedIntent(manager, 7001, 43, PORT_ID);
      // Committed intent on a different port — must be filtered out.
      await insertCommittedIntent(manager, 7002, 44, OTHER_PORT_ID);

      // Overlay: DELETE 7001 + CREATE pending 7003 on PORT_ID + CREATE pending 7004 on OTHER_PORT_ID.
      await insertIntentEditAction(manager, sessionId, 7001, CHANGE_OPERATION.Delete, {systemId: 7001});
      await insertIntentEditAction(manager, sessionId, 7003, CHANGE_OPERATION.Create, {
        systemId: 7003, intentId: 45, controlPortSystemId: PORT_ID, version: 1,
      });
      await insertIntentEditAction(manager, sessionId, 7004, CHANGE_OPERATION.Create, {
        systemId: 7004, intentId: 46, controlPortSystemId: OTHER_PORT_ID, version: 1,
      });

      const result = await repo.getIntentsByPortId(PORT_ID, sessionId);
      const ids = result.map(r => r.systemId).sort((a, b) => a - b);
      expect(ids).toEqual([7000, 7003]);
    });

    it('honours sessionId — overlay from a different session is invisible', async () => {
      const manager = queryRunner.manager;
      await createFkDependencies(manager);
      const sessionA = await createSession(manager, FILE_ID);
      const sessionB = await createSession(manager, FILE_ID);

      await insertCommittedIntent(manager, 7100, 50, PORT_ID);
      // DELETE overlay belongs only to sessionB.
      await insertIntentEditAction(manager, sessionB, 7100, CHANGE_OPERATION.Delete, {systemId: 7100});

      const fromA = await repo.getIntentsByPortId(PORT_ID, sessionA);
      expect(fromA.map(r => r.systemId)).toEqual([7100]);

      const fromB = await repo.getIntentsByPortId(PORT_ID, sessionB);
      expect(fromB).toEqual([]);
    });

    it('returns [] when the port has no committed intents and no overlay CREATEs for it', async () => {
      const manager = queryRunner.manager;
      await createFkDependencies(manager);
      const sessionId = await createSession(manager, FILE_ID);

      const result = await repo.getIntentsByPortId(PORT_ID, sessionId);
      expect(result).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="typeorm-control-port.repository"`

  Expected: FAIL with `Cannot find module '.../typeorm-control-port.repository.js'`.

- [ ] **Step 3: Create the implementation file**

  Create `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-port/typeorm-control-port.repository.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {QueryRunner} from 'typeorm';
  import type {IControlPortRepository, IntentRow} from '@arc/core';
  import {CHANGE_STATUS} from '@arc/core';
  import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
  import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
  import type {IntentRow as PersistenceIntentRow} from '../../entity-schema/usecase-data/node/control-port.js';
  import {
    applyToCollection,
    type EditActionForOverlay,
  } from '../../queries/edit-session/overlay-merge.js';

  /**
   * TypeORM implementation of IControlPortRepository.
   *
   * Currently exposes only `getIntentsByPortId` (spec §11.10). Sibling chapters
   * extend the interface and add the corresponding methods here. The read
   * pattern is the same overlay-aware merge used by the CSLS repository:
   *   1. Fetch all committed intents for this port.
   *   2. Fetch the session's STAGED + UNSTAGED edit_actions for the Intent
   *      table (validUntil IS NULL).
   *   3. Merge via applyToCollection.
   *   4. Filter to rows whose effective controlPortSystemId === portSystemId.
   *      (Step 4 catches overlay CREATEs whose payload targets this port and
   *      drops overlay CREATEs that target a different port.)
   */
  export class TypeOrmControlPortRepository implements IControlPortRepository {
    constructor(private readonly queryRunner: QueryRunner) {}

    async getIntentsByPortId(
      portSystemId: number,
      sessionId: number,
    ): Promise<IntentRow[]> {
      const [committed, overlayActions] = await Promise.all([
        this.fetchCommittedIntents(portSystemId),
        this.fetchIntentEditActions(sessionId),
      ]);

      const merged = applyToCollection<PersistenceIntentRow>(
        committed,
        overlayActions,
      );

      return merged
        .filter(row => row.controlPortSystemId === portSystemId)
        .map(row => ({
          systemId: row.systemId,
          intentId: row.intentId,
          controlPortSystemId: row.controlPortSystemId,
          version: row.version,
        }));
    }

    private async fetchCommittedIntents(
      portSystemId: number,
    ): Promise<PersistenceIntentRow[]> {
      return this.queryRunner.manager.find<PersistenceIntentRow>(
        ENTITY_NAMES.Intent,
        {where: {controlPortSystemId: portSystemId}},
      );
    }

    private async fetchIntentEditActions(
      sessionId: number,
    ): Promise<EditActionForOverlay[]> {
      const rows = await this.queryRunner.manager
        .createQueryBuilder<EditActionRow>(ENTITY_NAMES.EditAction, 'ea')
        .where('ea.sessionId = :sessionId', {sessionId})
        .andWhere('ea.tableName = :tableName', {
          tableName: ENTITY_NAMES.Intent,
        })
        .andWhere('ea.validUntil IS NULL')
        .andWhere('ea.changeStatus IN (:...statuses)', {
          statuses: [CHANGE_STATUS.Staged, CHANGE_STATUS.Unstaged],
        })
        .getMany();

      return rows.map(r => ({
        systemId: r.systemId,
        operation: r.operation,
        payload:
          typeof r.payload === 'string'
            ? (JSON.parse(r.payload) as unknown)
            : r.payload,
      }));
    }
  }
  ```

- [ ] **Step 4: Export the new class from `packages/infrastructure/persistence/src/index.ts`**

  Open `packages/infrastructure/persistence/src/index.ts`. Append:

  ```typescript
  export * from './persistence-typeorm-sqllite/repositories/control-port/typeorm-control-port.repository.js';
  ```

- [ ] **Step 5: Wire both repositories into `TypeOrmUnitOfWork`**

  Open `packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts`. Apply three edits:

  1. Extend the `@arc/core` type-only import to include the two new interfaces:

     ```typescript
     import type {
       UnitOfWork,
       BulkImportRepository,
       IdGenerationPort,
       ProjectRepository,
       ValidationPreferencesRepository,
       ValidationQueryRepository,
       IControlSubsystemLinkSegmentRepository,
       IControlPortRepository,
     } from '@arc/core';
     ```

  2. Extend the `@arc/persistence` value import to include the two new TypeORM repos:

     ```typescript
     import {
       TypeOrmBulkImportRepository,
       TypeOrmProjectRepository,
       TypeOrmValidationPreferencesRepository,
       TypeOrmValidationQueryRepository,
       TypeOrmControlSubsystemLinkSegmentRepository,
       TypeOrmControlPortRepository,
     } from '@arc/persistence';
     ```

  3. Add the two getter methods immediately after `getValidationQueryService()`:

     ```typescript
       getControlSubsystemLinkSegmentRepository(): IControlSubsystemLinkSegmentRepository {
         return new TypeOrmControlSubsystemLinkSegmentRepository(this.queryRunner);
       }

       getControlPortRepository(): IControlPortRepository {
         return new TypeOrmControlPortRepository(this.queryRunner);
       }
     ```

  The complete updated `typeorm-unit-of-work.ts` after the edit:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {
    UnitOfWork,
    BulkImportRepository,
    IdGenerationPort,
    ProjectRepository,
    ValidationPreferencesRepository,
    ValidationQueryRepository,
    IControlSubsystemLinkSegmentRepository,
    IControlPortRepository,
  } from '@arc/core';
  import type {QueryRunner, EntityManager} from 'typeorm';
  import {
    TypeOrmBulkImportRepository,
    TypeOrmProjectRepository,
    TypeOrmValidationPreferencesRepository,
    TypeOrmValidationQueryRepository,
    TypeOrmControlSubsystemLinkSegmentRepository,
    TypeOrmControlPortRepository,
  } from '@arc/persistence';

  export class TypeOrmUnitOfWork implements UnitOfWork {
    private inTransaction: boolean = false;

    constructor(
      private readonly queryRunner: QueryRunner,
      private readonly idGeneration: IdGenerationPort,
    ) {}

    async startTransaction(): Promise<void> {
      if (this.inTransaction) {
        throw new Error(
          'Transaction already active. ' +
            'Call commit() or rollback() before starting a new transaction.',
        );
      }
      await this.queryRunner.startTransaction();
      this.inTransaction = true;
    }

    async commit(): Promise<void> {
      if (!this.inTransaction) {
        throw new Error('No active transaction to commit');
      }
      await this.queryRunner.commitTransaction();
      this.inTransaction = false;
    }

    async rollback(): Promise<void> {
      if (!this.inTransaction) {
        throw new Error('No active transaction to rollback');
      }
      await this.queryRunner.rollbackTransaction();
      this.inTransaction = false;
    }

    isInTransaction(): boolean {
      return this.inTransaction;
    }

    private getManager(): EntityManager {
      return this.queryRunner.manager;
    }

    getBulkImportRepository(): BulkImportRepository {
      return new TypeOrmBulkImportRepository(
        this.getManager(),
        this.idGeneration,
      );
    }

    getProjectRepository(): ProjectRepository {
      return new TypeOrmProjectRepository(this.queryRunner.manager);
    }

    getValidationPreferencesRepository(): ValidationPreferencesRepository {
      return new TypeOrmValidationPreferencesRepository(
        this.queryRunner.manager.connection,
      );
    }

    getValidationQueryService(): ValidationQueryRepository {
      return new TypeOrmValidationQueryRepository(
        this.queryRunner.manager.connection,
      );
    }

    getControlSubsystemLinkSegmentRepository(): IControlSubsystemLinkSegmentRepository {
      return new TypeOrmControlSubsystemLinkSegmentRepository(this.queryRunner);
    }

    getControlPortRepository(): IControlPortRepository {
      return new TypeOrmControlPortRepository(this.queryRunner);
    }
  }
  ```

- [ ] **Step 6: Run the integration test to verify it passes**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="typeorm-control-port.repository"`

  Expected: PASS — all three `it()` blocks succeed.

- [ ] **Step 7: Run the full build to confirm `TypeOrmUnitOfWork` satisfies the updated `UnitOfWork` contract**

  Run: `pnpm run build`

  Expected: Zero TypeScript errors across `@arc/core`, `@arc/persistence`, and `@arc/api`. In particular, the two "missing property" errors on `TypeOrmUnitOfWork` reported at the end of Task 20 are now resolved.

- [ ] **Step 8: Run the full persistence integration suite as a regression guard**

  Run: `pnpm --filter @arc/persistence run test:integration`

  Expected: PASS — all previously passing tests continue to pass; the two new repository suites pass.

- [ ] **Step 9: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-port/typeorm-control-port.repository.ts \
          packages/infrastructure/persistence/src/index.ts \
          packages/infrastructure/persistence/tests/integration/repositories/typeorm-control-port.repository.spec.ts \
          packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts
  git commit -m "feat(db): implement getIntentsByPortId and wire CSLS+ControlPort repos into UoW (§11.10)" \
             -m "Adds TypeOrmControlPortRepository.getIntentsByPortId — overlay-aware (committed intents + STAGED/UNSTAGED edit_actions, validUntil IS NULL) returning IntentRows whose effective controlPortSystemId matches the requested port. Wires TypeOrmControlSubsystemLinkSegmentRepository and TypeOrmControlPortRepository into TypeOrmUnitOfWork so command handlers can obtain them via the active QueryRunner." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

## Chapter self-review

- **Spec coverage.** §11.10 names two contracts: `IControlSubsystemLinkSegmentRepository` (four methods) and a new `IControlPortRepository.getIntentsByPortId`. Task 18 declares the CSLS port with all four methods; Task 19 declares the ControlPort port with the new method; Task 20 wires both into `UnitOfWork`; Task 21 implements the CSLS repo with integration tests covering all four methods; Task 22 implements `getIntentsByPortId` with integration tests and wires both impls into `TypeOrmUnitOfWork`. The `getUnresolvedForFile` requirement to cover *both* pending CREATE `null` payloads *and* committed-row UPDATE-to-null overlays is exercised by the two dedicated `getUnresolvedForFile` tests in Task 21.
- **Placeholder scan.** No `TBD` / `TODO` / "implement appropriately" / "similar to Task N" left in this chapter. Every code step is complete.
- **Type consistency.** Type names match across tasks: `IControlSubsystemLinkSegmentRepository` (Tasks 18, 20, 21, 22); `ControlSubsystemLinkSegmentRow` (Tasks 18, 21); `IControlPortRepository` (Tasks 19, 20, 22); `IntentRow` (Tasks 19, 22). Persistence row alias `PersistenceCslsRow` / `PersistenceIntentRow` is used only inside impl files to disambiguate from the port row shape.
- **Out-of-scope guard.** No tasks for §11.1, §11.2–§11.3, §11.4–§11.7, §11.8, §11.9, §11.11 — those belong to sibling chapters (01-01 schema fix; 01-02 entity + schema; 01-03 chain resolution; 01-04 intent propagation; later batches for the handlers and commit pre-pass).
