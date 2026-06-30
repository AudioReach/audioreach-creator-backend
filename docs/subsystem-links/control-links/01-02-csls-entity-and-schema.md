<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: `ControlSubsystemLinkSegment` entity + persistence schema (§11.2, §11.3)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.2 (lines 744–761) and §11.3 (lines 765–807).
>
> **Goal of this chapter:** Introduce the new `ControlSubsystemLinkSegment` (CSLS) domain entity in `@arc/core` and its TypeORM-backed table `control_subsystem_link_segments` in `@arc/persistence`. CSLS is the control-plane analogue of `SubsystemLinkSegment`: it records one boundary-crossing segment of a control connection with the two peer nodes, the two boundary control ports, the resolved `ControlLink` (loose FK — nullable only in `edit_actions` payloads; NOT NULL in the committed table) and the file. FK behaviour follows the spec table verbatim: `CASCADE` on file, control-link, and both peer-node FKs; `RESTRICT` on both port FKs so orphan-port cleanup must always delete the CSLS first. Schema lands on the single regenerated `initial-create` migration per the workflow in `CLAUDE.md`.
>
> **Cardinal rule check:** `@arc/core` may not import TypeORM or NestJS. The CSLS class is a plain TypeScript class with public fields — no decorators, no framework imports — matching the pattern already established by `ControlLink` and `DataLink` in `packages/core/src/domain/entities/usecase-data/links/`.

---

### Task 4: `ControlSubsystemLinkSegment` domain entity (core)

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.ts`
- Modify: `packages/core/src/index.ts` (append a barrel export immediately after the existing `data-link.js` export on line 104)
- Test: `packages/core/tests/unit/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test for the entity**

  Create `packages/core/tests/unit/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {ControlSubsystemLinkSegment} from '@arc/core';

  describe('ControlSubsystemLinkSegment (spec §11.2)', () => {
    it('exposes all eight fields from the spec via the constructor in order', () => {
      const csls = new ControlSubsystemLinkSegment(
        /* systemId            */ 9001,
        /* peerNodeASystemId   */ 10,
        /* peerNodeBSystemId   */ 20,
        /* nodeAPortSystemId   */ 100,
        /* nodeBPortSystemId   */ 200,
        /* controlLinkSystemId */ 5000,
        /* fileSystemId        */ 1,
        /* version             */ 1,
      );
      expect(csls.systemId).toBe(9001);
      expect(csls.peerNodeASystemId).toBe(10);
      expect(csls.peerNodeBSystemId).toBe(20);
      expect(csls.nodeAPortSystemId).toBe(100);
      expect(csls.nodeBPortSystemId).toBe(200);
      expect(csls.controlLinkSystemId).toBe(5000);
      expect(csls.fileSystemId).toBe(1);
      expect(csls.version).toBe(1);
    });

    it('accepts null controlLinkSystemId (unresolved edit_actions payload, spec §11.2)', () => {
      const csls = new ControlSubsystemLinkSegment(
        9002,
        10,
        20,
        100,
        200,
        null,
        1,
        1,
      );
      expect(csls.controlLinkSystemId).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-subsystem-link-segment"`

  Expected: FAIL with a module-resolution error along the lines of `Cannot find module '@arc/core' provides ControlSubsystemLinkSegment` (or `ControlSubsystemLinkSegment is not exported from @arc/core`).

- [ ] **Step 3: Create the domain entity**

  Create `packages/core/src/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  /**
   * One boundary-crossing segment of a control connection.
   *
   * `controlLinkSystemId` is a loose FK: a CSLS may exist in an `edit_actions`
   * payload before the owning `ControlLink` is resolved (`controlLinkSystemId =
   * null`). Committed rows in the `control_subsystem_link_segments` table are
   * always non-null — the commit pre-pass (§11.9) discards unresolved segments
   * before the transaction runs.
   *
   * Spec: §11.2.
   */
  export class ControlSubsystemLinkSegment {
    public systemId: number;
    public peerNodeASystemId: number;
    public peerNodeBSystemId: number;
    public nodeAPortSystemId: number;
    public nodeBPortSystemId: number;
    public controlLinkSystemId: number | null;
    public fileSystemId: number;
    public version: number;

    constructor(
      systemId: number,
      peerNodeASystemId: number,
      peerNodeBSystemId: number,
      nodeAPortSystemId: number,
      nodeBPortSystemId: number,
      controlLinkSystemId: number | null,
      fileSystemId: number,
      version: number,
    ) {
      this.systemId = systemId;
      this.peerNodeASystemId = peerNodeASystemId;
      this.peerNodeBSystemId = peerNodeBSystemId;
      this.nodeAPortSystemId = nodeAPortSystemId;
      this.nodeBPortSystemId = nodeBPortSystemId;
      this.controlLinkSystemId = controlLinkSystemId;
      this.fileSystemId = fileSystemId;
      this.version = version;
    }
  }
  ```

- [ ] **Step 4: Add the barrel export to `packages/core/src/index.ts`**

  Insert this line immediately after the existing line `export * from './domain/entities/usecase-data/links/data-link.js';` (currently line 104):

  ```typescript
  export * from './domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.js';
  ```

- [ ] **Step 5: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-subsystem-link-segment"`

  Expected: PASS — both assertions in `control-subsystem-link-segment.spec.ts` succeed.

- [ ] **Step 6: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.ts \
          packages/core/src/index.ts \
          packages/core/tests/unit/domain/entities/usecase-data/control-subsystem-link-segment/control-subsystem-link-segment.spec.ts
  git commit -m "feat(core): add ControlSubsystemLinkSegment domain entity" \
             -m "Introduces the control-plane analogue of SubsystemLinkSegment with the seven natural fields plus version from spec §11.2. controlLinkSystemId is nullable so the same class can represent unresolved edit_actions payloads." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 5: Register `ControlSubsystemLinkSegment` in `ENTITY_NAMES`

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts` (extend the "Link data" group)
- Test: `packages/infrastructure/persistence/tests/integration/schema/entity-names-csls.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

  Create `packages/infrastructure/persistence/tests/integration/schema/entity-names-csls.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';

  describe('ENTITY_NAMES — ControlSubsystemLinkSegment (spec §11.3)', () => {
    it('registers ControlSubsystemLinkSegment with the matching schema name string', () => {
      expect(
        (ENTITY_NAMES as Record<string, string>).ControlSubsystemLinkSegment,
      ).toBe('ControlSubsystemLinkSegment');
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="entity-names-csls"`

  Expected: FAIL with `expect(received).toBe(expected) … Received: undefined`.

- [ ] **Step 3: Add the entry to `ENTITY_NAMES`**

  Edit `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts`. In the `// ── Link data ──` group, add the new key directly below `ControlLink`:

  ```typescript
    // ── Link data ─────────────────────────────────────────────────────────────
    DataLink: 'DataLink',
    ControlLink: 'ControlLink',
    ControlSubsystemLinkSegment: 'ControlSubsystemLinkSegment',
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="entity-names-csls"`

  Expected: PASS.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts \
          packages/infrastructure/persistence/tests/integration/schema/entity-names-csls.spec.ts
  git commit -m "feat(db): register ControlSubsystemLinkSegment in ENTITY_NAMES" \
             -m "Adds the canonical entity name string so the upcoming EntitySchema, bulk inserter, and edit_actions tableName references all resolve to the same identifier (spec §11.3)." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 6: `ControlSubsystemLinkSegment` TypeORM schema (`control_subsystem_link_segments` table)

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-subsystem-link-segment.schema.ts`
- Test: `packages/infrastructure/persistence/tests/integration/schema/control-subsystem-link-segment-schema.spec.ts` (new)

> Note: the spec lists the path as `…/usecase-data/links/…`, but the existing folder in this repo uses capital-L casing (`Links/`) — see `usecase-data/Links/control-link.ts` and `usecase-data/Links/data-link.ts`. Use the existing `Links/` directory so all link schemas live together; case-insensitive filesystems will treat the two spellings identically.

- [ ] **Step 1: Write the failing schema unit test (runs without DB synchronisation)**

  Create `packages/infrastructure/persistence/tests/integration/schema/control-subsystem-link-segment-schema.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {ControlSubsystemLinkSegmentSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-subsystem-link-segment.schema.js';

  type RelationOpts = {
    target: string;
    onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | 'DEFAULT';
    joinColumn?: {name?: string; referencedColumnName?: string};
  };

  describe('ControlSubsystemLinkSegmentSchema (spec §11.3)', () => {
    const opts = ControlSubsystemLinkSegmentSchema.options;
    const relations = opts.relations as Record<string, RelationOpts>;

    it('uses the entity name and table name from the spec', () => {
      expect(opts.name).toBe('ControlSubsystemLinkSegment');
      expect(opts.tableName).toBe('control_subsystem_link_segments');
    });

    it('declares all seven FK columns with the spec-required snake_case names', () => {
      const columns = opts.columns as Record<string, {name?: string; nullable?: boolean}>;
      expect(columns.peerNodeASystemId.name).toBe('peer_nodeA_system_id');
      expect(columns.peerNodeBSystemId.name).toBe('peer_nodeB_system_id');
      expect(columns.nodeAPortSystemId.name).toBe('nodeA_port_system_id');
      expect(columns.nodeBPortSystemId.name).toBe('nodeB_port_system_id');
      expect(columns.controlLinkSystemId.name).toBe('control_link_system_id');
      expect(columns.fileSystemId.name).toBe('file_system_id');
      // version comes from BaseColumnSchemaPart (default 1)
      expect(columns.version.name).toBe('version');
      expect(columns.version.nullable).not.toBe(true);
    });

    it('applies CASCADE on file, control-link and both peer-node FKs', () => {
      expect(relations.file.target).toBe('ArcDbFile');
      expect(relations.file.onDelete).toBe('CASCADE');
      expect(relations.controlLink.target).toBe('ControlLink');
      expect(relations.controlLink.onDelete).toBe('CASCADE');
      expect(relations.peerNodeA.target).toBe('Node');
      expect(relations.peerNodeA.onDelete).toBe('CASCADE');
      expect(relations.peerNodeB.target).toBe('Node');
      expect(relations.peerNodeB.onDelete).toBe('CASCADE');
    });

    it('applies RESTRICT on both control-port FKs (orphan cleanup §11.9 must delete CSLS first)', () => {
      expect(relations.nodeAPort.target).toBe('ControlPort');
      expect(relations.nodeAPort.onDelete).toBe('RESTRICT');
      expect(relations.nodeBPort.target).toBe('ControlPort');
      expect(relations.nodeBPort.onDelete).toBe('RESTRICT');
    });

    it('declares all four indices required by the spec', () => {
      const indexNames = (opts.indices ?? []).map(i => i.name).sort();
      expect(indexNames).toEqual([
        'idx_csls_control_link',
        'idx_csls_file',
        'idx_csls_nodeA_port_file',
        'idx_csls_nodeB_port_file',
      ]);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="control-subsystem-link-segment-schema"`

  Expected: FAIL with `Cannot find module '.../usecase-data/Links/control-subsystem-link-segment.schema.js'`.

- [ ] **Step 3: Create the schema file**

  Create `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-subsystem-link-segment.schema.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {BaseColumnSchemaPart} from '../../entity-base.js';
  import type {EntityBaseRow} from '../../entity-base.js';
  import type {NodeRow} from '../node/node.schema.js';
  import type {ControlPortRow} from '../node/control-port.js';
  import type {ControlLinkRow} from './control-link.js';
  import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
  import {EntitySchema} from 'typeorm';

  export interface ControlSubsystemLinkSegmentRow extends EntityBaseRow {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
    controlLinkSystemId: number;
    fileSystemId: number;

    peerNodeA?: NodeRow;
    peerNodeB?: NodeRow;
    nodeAPort?: ControlPortRow;
    nodeBPort?: ControlPortRow;
    controlLink?: ControlLinkRow;
    file?: ArcDbFileRow;
  }

  export const ControlSubsystemLinkSegmentSchema =
    new EntitySchema<ControlSubsystemLinkSegmentRow>({
      name: 'ControlSubsystemLinkSegment',
      tableName: 'control_subsystem_link_segments',
      columns: {
        ...BaseColumnSchemaPart,
        peerNodeASystemId: {
          name: 'peer_nodeA_system_id',
          type: 'integer',
          nullable: false,
        },
        peerNodeBSystemId: {
          name: 'peer_nodeB_system_id',
          type: 'integer',
          nullable: false,
        },
        nodeAPortSystemId: {
          name: 'nodeA_port_system_id',
          type: 'integer',
          nullable: false,
        },
        nodeBPortSystemId: {
          name: 'nodeB_port_system_id',
          type: 'integer',
          nullable: false,
        },
        controlLinkSystemId: {
          name: 'control_link_system_id',
          type: 'integer',
          nullable: false,
        },
        fileSystemId: {
          name: 'file_system_id',
          type: 'integer',
          nullable: false,
        },
      },
      relations: {
        peerNodeA: {
          type: 'many-to-one',
          target: 'Node',
          joinColumn: {
            name: 'peer_nodeA_system_id',
            referencedColumnName: 'systemId',
          },
          onDelete: 'CASCADE',
        },
        peerNodeB: {
          type: 'many-to-one',
          target: 'Node',
          joinColumn: {
            name: 'peer_nodeB_system_id',
            referencedColumnName: 'systemId',
          },
          onDelete: 'CASCADE',
        },
        nodeAPort: {
          type: 'many-to-one',
          target: 'ControlPort',
          joinColumn: {
            name: 'nodeA_port_system_id',
            referencedColumnName: 'systemId',
          },
          onDelete: 'RESTRICT',
        },
        nodeBPort: {
          type: 'many-to-one',
          target: 'ControlPort',
          joinColumn: {
            name: 'nodeB_port_system_id',
            referencedColumnName: 'systemId',
          },
          onDelete: 'RESTRICT',
        },
        controlLink: {
          type: 'many-to-one',
          target: 'ControlLink',
          joinColumn: {
            name: 'control_link_system_id',
            referencedColumnName: 'systemId',
          },
          onDelete: 'CASCADE',
        },
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
      indices: [
        {
          name: 'idx_csls_file',
          columns: ['fileSystemId'],
        },
        {
          name: 'idx_csls_control_link',
          columns: ['controlLinkSystemId'],
        },
        {
          name: 'idx_csls_nodeA_port_file',
          columns: ['nodeAPortSystemId', 'fileSystemId'],
        },
        {
          name: 'idx_csls_nodeB_port_file',
          columns: ['nodeBPortSystemId', 'fileSystemId'],
        },
      ],
    });
  ```

  Note on the `version` column: it comes from `BaseColumnSchemaPart` (see `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-base.ts:76-81`), which sets `default: 1` and marks it as a TypeORM optimistic-locking column. Do not redeclare it on this schema — that is exactly the pattern used by `ControlLinkSchema` and `DataLinkSchema`.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="control-subsystem-link-segment-schema"`

  Expected: PASS — all five assertions succeed.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-subsystem-link-segment.schema.ts \
          packages/infrastructure/persistence/tests/integration/schema/control-subsystem-link-segment-schema.spec.ts
  git commit -m "feat(db): add ControlSubsystemLinkSegment EntitySchema" \
             -m "Defines control_subsystem_link_segments per spec §11.3: six FK columns (CASCADE on file/control-link/peer-node FKs, RESTRICT on both port FKs) plus four indices (idx_csls_file, idx_csls_control_link, idx_csls_nodeA_port_file, idx_csls_nodeB_port_file). version inherited from BaseColumnSchemaPart with default 1." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 7: Register `ControlSubsystemLinkSegmentSchema` in the persistence entity registry

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/index.ts` (three additions: import, re-export, and inclusion in `getAllEntitySchemas`)
- Test: `packages/infrastructure/persistence/tests/integration/schema/csls-registered.spec.ts` (new)

- [ ] **Step 1: Write the failing registration test**

  Create `packages/infrastructure/persistence/tests/integration/schema/csls-registered.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {getAllEntitySchemas} from '../../../src/persistence-typeorm-sqllite/entity-schema/index.js';
  import {TestBlobConverter} from '../helpers/test-blob-converter.js';

  describe('Entity schema registry — ControlSubsystemLinkSegment (spec §11.3)', () => {
    it('includes ControlSubsystemLinkSegmentSchema in getAllEntitySchemas()', () => {
      const schemas = getAllEntitySchemas(new TestBlobConverter());
      const names = schemas.map(s => s.options.name);
      expect(names).toContain('ControlSubsystemLinkSegment');
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="csls-registered"`

  Expected: FAIL with `Expected array to contain: "ControlSubsystemLinkSegment"`.

- [ ] **Step 3: Register the schema in `entity-schema/index.ts`**

  Make three edits in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/index.ts`:

  1. Replace the existing `DataLinkSchema` import (currently around line 46) with the two-line block that also imports the new schema:

     ```typescript
     import {DataLinkSchema} from './usecase-data/Links/data-link.js';
     import {ControlSubsystemLinkSegmentSchema} from './usecase-data/Links/control-subsystem-link-segment.schema.js';
     ```

  2. In the "Use Case Data - Links" re-export section (currently around lines 187–191), append the new public exports immediately after the `DataLinkSchema` export:

     ```typescript
     export type {ControlSubsystemLinkSegmentRow} from './usecase-data/Links/control-subsystem-link-segment.schema.js';
     export {ControlSubsystemLinkSegmentSchema} from './usecase-data/Links/control-subsystem-link-segment.schema.js';
     ```

  3. Inside `getAllEntitySchemas()` (currently around lines 311–391), add `ControlSubsystemLinkSegmentSchema` to the returned array immediately after `DataLinkSchema`:

     ```typescript
         ControlLinkSchema,
         DataLinkSchema,
         ControlSubsystemLinkSegmentSchema,
     ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="csls-registered"`

  Expected: PASS.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/index.ts \
          packages/infrastructure/persistence/tests/integration/schema/csls-registered.spec.ts
  git commit -m "feat(db): register ControlSubsystemLinkSegmentSchema with TypeORM" \
             -m "Wires the new schema into getAllEntitySchemas() (and the public re-export surface) so the table is created during synchronize() in integration tests and picked up by migration:gen for the regenerated initial-create migration. Mirrors how DataLinkSchema and ControlLinkSchema are registered." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 8: Regenerate the `initial-create` migration and verify the live table

**Package:** `@arc/persistence`

**Files:**
- Delete: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/1781364357082-initial-create.ts` *(timestamp may differ if Task 1 from Chapter 01-01 has already replaced it; re-discover with `ls`)*
- Create (via `pnpm run migration:gen`): `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts`
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts`
- Test: `packages/infrastructure/persistence/tests/integration/schema/control-subsystem-link-segments-table.spec.ts` (new)

- [ ] **Step 1: Write the failing live-table integration test**

  Create `packages/infrastructure/persistence/tests/integration/schema/control-subsystem-link-segments-table.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
  import type {EntityManager} from 'typeorm';
  import {
    setupIntegrationTest,
    teardownIntegrationTest,
    setupEachTest,
    getTestDataSource,
  } from '../helpers/test-database-setup.js';

  // ── FK parent fixture IDs ────────────────────────────────────────────────
  const FILE_ID = 100;
  const SUBGRAPH_ID = 400;
  const NODE_A_ID = 200;
  const NODE_B_ID = 201;
  const PORT_A_ID = 300;
  const PORT_B_ID = 301;
  const CONTROL_LINK_ID = 500;

  async function createFkDependencies(manager: EntityManager): Promise<void> {
    await manager.insert('Project', {
      systemId: 1, name: 'P', description: '', type: 'Offline', version: 1,
    });
    await manager.insert('ArcDbFile', {
      systemId: FILE_ID, projectSystemId: 1, fileName: 'f.awsp',
      description: '', metadata: '{}', isTarget: 0, lastReservedId: 0, version: 1,
    });
    await manager.insert('Subgraph', {
      systemId: SUBGRAPH_ID, subgraphId: 1, name: 'sg', isExported: 0,
      fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert('Node', {
      systemId: NODE_A_ID, type: 'module', fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert('Node', {
      systemId: NODE_B_ID, type: 'module', fileSystemId: FILE_ID, version: 1,
    });
    await manager.insert('ControlPort', {
      systemId: PORT_A_ID, portId: 1, isStatic: 1, nodeSystemId: NODE_A_ID, version: 1,
    });
    await manager.insert('ControlPort', {
      systemId: PORT_B_ID, portId: 2, isStatic: 1, nodeSystemId: NODE_B_ID, version: 1,
    });
    await manager.insert('ControlLink', {
      systemId: CONTROL_LINK_ID,
      fileSystemId: FILE_ID,
      peerNodeASystemId: NODE_A_ID,
      peerNodeBSystemId: NODE_B_ID,
      nodeAPortSystemId: PORT_A_ID,
      nodeBPortSystemId: PORT_B_ID,
      heapId: 0,
      linkType: 'INTRA_SUBGRAPH',
      sourceSubgraphSystemId: SUBGRAPH_ID,
      destSubgraphSystemId: SUBGRAPH_ID,
      version: 1,
    });
  }

  describe('control_subsystem_link_segments table (spec §11.3)', () => {
    beforeAll(async () => { await setupIntegrationTest(); });
    afterAll(async () => { await teardownIntegrationTest(); });
    beforeEach(async () => { await setupEachTest(); });

    it('table exists with all spec-required columns', async () => {
      const ds = getTestDataSource();
      const columns: Array<{name: string; notnull: number; dflt_value: string | null}> =
        await ds.query(`PRAGMA table_info("control_subsystem_link_segments")`);
      const byName = Object.fromEntries(columns.map(c => [c.name, c]));
      expect(byName.system_id).toBeDefined();
      expect(byName.peer_nodeA_system_id.notnull).toBe(1);
      expect(byName.peer_nodeB_system_id.notnull).toBe(1);
      expect(byName.nodeA_port_system_id.notnull).toBe(1);
      expect(byName.nodeB_port_system_id.notnull).toBe(1);
      expect(byName.control_link_system_id.notnull).toBe(1);
      expect(byName.file_system_id.notnull).toBe(1);
      expect(byName.version.notnull).toBe(1);
      expect(byName.version.dflt_value).toBe('1');
      expect(byName.created_at).toBeDefined();
      expect(byName.updated_at).toBeDefined();
    });

    it('all four spec-required indices are present', async () => {
      const ds = getTestDataSource();
      const rows: Array<{name: string}> = await ds.query(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND tbl_name = 'control_subsystem_link_segments'`,
      );
      const names = rows.map(r => r.name).sort();
      expect(names).toEqual(expect.arrayContaining([
        'idx_csls_control_link',
        'idx_csls_file',
        'idx_csls_nodeA_port_file',
        'idx_csls_nodeB_port_file',
      ]));
    });

    it('cascades the CSLS row when its ControlLink is deleted', async () => {
      const ds = getTestDataSource();
      await ds.query(`PRAGMA foreign_keys = ON`);
      const manager = ds.manager;
      await createFkDependencies(manager);

      await manager.insert('ControlSubsystemLinkSegment', {
        systemId: 9001,
        peerNodeASystemId: NODE_A_ID,
        peerNodeBSystemId: NODE_B_ID,
        nodeAPortSystemId: PORT_A_ID,
        nodeBPortSystemId: PORT_B_ID,
        controlLinkSystemId: CONTROL_LINK_ID,
        fileSystemId: FILE_ID,
        version: 1,
      });

      await ds.query(`DELETE FROM control_links WHERE system_id = ?`, [CONTROL_LINK_ID]);
      const remaining = await ds.query(
        `SELECT system_id FROM control_subsystem_link_segments WHERE system_id = 9001`,
      );
      expect(remaining).toHaveLength(0);
    });

    it('RESTRICTs delete of a control_ports row still referenced by a CSLS', async () => {
      const ds = getTestDataSource();
      await ds.query(`PRAGMA foreign_keys = ON`);
      const manager = ds.manager;
      await createFkDependencies(manager);

      await manager.insert('ControlSubsystemLinkSegment', {
        systemId: 9002,
        peerNodeASystemId: NODE_A_ID,
        peerNodeBSystemId: NODE_B_ID,
        nodeAPortSystemId: PORT_A_ID,
        nodeBPortSystemId: PORT_B_ID,
        controlLinkSystemId: CONTROL_LINK_ID,
        fileSystemId: FILE_ID,
        version: 1,
      });

      const deletePort = ds.query(
        `DELETE FROM control_ports WHERE system_id = ?`,
        [PORT_A_ID],
      );
      await expect(deletePort).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="control-subsystem-link-segments-table"`

  Expected: FAIL — the first assertion fails because the live in-memory schema is built from `getAllEntitySchemas()` which (until Task 7 is merged into this run) does not yet include CSLS, *or* the table simply doesn't exist yet. After Tasks 5–7 are committed and rebuilt this test still verifies live-table behaviour in a fresh DB and acts as the regression guard for the regenerated migration in Step 5 below.

- [ ] **Step 3: Build so the TypeORM CLI sees the updated schema set**

  Run: `pnpm run build`

  Expected: build succeeds across all packages. `@arc/persistence` must build cleanly with the new `ControlSubsystemLinkSegmentSchema` registered.

- [ ] **Step 4: Delete the current `initial-create` migration and regenerate**

  Per the migration workflow in `CLAUDE.md` ("Database Migration Workflow"), there is always exactly one migration file. Locate it (the timestamp may differ from `1781364357082` if Chapter 01-01 has already regenerated it) and delete it before regenerating:

  ```bash
  ls packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/
  rm packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/*-initial-create.ts
  pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create
  ```

  Expected: TypeORM writes `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts`. Inspect its `up()` and confirm it contains:
  - `CREATE TABLE "control_subsystem_link_segments"` with columns `system_id`, `peer_nodeA_system_id`, `peer_nodeB_system_id`, `nodeA_port_system_id`, `nodeB_port_system_id`, `control_link_system_id`, `file_system_id`, `version` (with `DEFAULT (1)`), `created_at`, `updated_at`, plus the six `CONSTRAINT … FOREIGN KEY … ON DELETE` clauses (4× `CASCADE` on `file`/`control_link`/`peer_nodeA`/`peer_nodeB`, 2× `RESTRICT` on `nodeA_port`/`nodeB_port`).
  - `CREATE INDEX "idx_csls_file" ON "control_subsystem_link_segments" ("file_system_id")`
  - `CREATE INDEX "idx_csls_control_link" ON "control_subsystem_link_segments" ("control_link_system_id")`
  - `CREATE INDEX "idx_csls_nodeA_port_file" ON "control_subsystem_link_segments" ("nodeA_port_system_id", "file_system_id")`
  - `CREATE INDEX "idx_csls_nodeB_port_file" ON "control_subsystem_link_segments" ("nodeB_port_system_id", "file_system_id")`

- [ ] **Step 5: Post-process the regenerated migration (required by `CLAUDE.md`)**

  Open the new `<new-timestamp>-initial-create.ts` and apply the two mandatory edits:

  1. Prepend the Qualcomm header at the top of the file:
     ```typescript
     /*
      * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
      * SPDX-License-Identifier: BSD-3-Clause
      */
     ```
  2. Change the TypeORM import to use `type`:
     ```typescript
     import type {MigrationInterface, QueryRunner} from 'typeorm';
     ```

- [ ] **Step 6: Update `migration-index.ts`**

  Edit `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts` so the import and the exported array point to the new timestamp:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {InitialCreate<new-timestamp>} from './migrations/<new-timestamp>-initial-create.js';

  export const migrations = [InitialCreate<new-timestamp>];
  ```

- [ ] **Step 7: Rebuild and run the live-table integration test**

  Run: `pnpm run build && pnpm --filter @arc/persistence run test:integration -- --testPathPattern="control-subsystem-link-segments-table"`

  Expected: PASS — all four assertions succeed. The table exists with the eight expected columns and `version DEFAULT 1`, all four CSLS indices are present, deleting the parent `ControlLink` cascades the CSLS row, and deleting a still-referenced `control_ports` row is rejected with `FOREIGN KEY constraint failed`.

- [ ] **Step 8: Run the full persistence integration suite as a regression guard**

  Run: `pnpm --filter @arc/persistence run test:integration`

  Expected: PASS — no pre-existing test is broken by the new schema or the regenerated migration. If anything fails, fix it before committing.

- [ ] **Step 9: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/ \
          packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts \
          packages/infrastructure/persistence/tests/integration/schema/control-subsystem-link-segments-table.spec.ts
  git commit -m "feat(db): regenerate initial-create migration with control_subsystem_link_segments" \
             -m "Regenerated the single initial-create migration per CLAUDE.md so the new control_subsystem_link_segments table is created with the spec §11.3 FK actions (CASCADE on file/control-link/peer-node FKs; RESTRICT on both port FKs) and the four CSLS indices. Live-table integration test pins the column set, default version=1, cascade-on-control-link-delete, and restrict-on-port-delete contract." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

## Chapter self-review

- **Spec coverage.** §11.2 entity shape (eight fields including nullable `controlLinkSystemId`) → Task 4. §11.3 row interface, FK table with CASCADE/RESTRICT pattern, four named indices, `version DEFAULT 1`, and the `ENTITY_NAMES` addition → Tasks 5, 6, 7, 8. The migration regeneration workflow (delete → `migration:gen` → header + `type` import → `migration-index.ts`) from `CLAUDE.md` is the body of Task 8.
- **Placeholder scan.** No "TBD" / "TODO" / "implement appropriately" / "similar to Task N" left in the chapter. Every code step is complete.
- **Type consistency.** Field names (`peerNodeASystemId`, `nodeAPortSystemId`, `controlLinkSystemId`, …), column names (`peer_nodeA_system_id`, `nodeA_port_system_id`, `control_link_system_id`, …), entity name (`ControlSubsystemLinkSegment`), table name (`control_subsystem_link_segments`), and index names (`idx_csls_file`, `idx_csls_control_link`, `idx_csls_nodeA_port_file`, `idx_csls_nodeB_port_file`) match across the entity, schema, registry, and migration tasks.
- **Out-of-scope guard.** No tasks for §11.4–§11.9 (handler, propagation, chain resolution, orphan cleanup) — those belong to sibling chapters.
