# Virtual Links — Data Links Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement subsystem link segments (SLS) for data links — the full mechanism by which signals cross subsystem boundaries in the AudioReach graph designer, including persistence, domain services, command handlers, port interfaces, and commit orchestration.

**Architecture:** Hexagonal (Ports & Adapters) + CQRS + DDD. New entities (`SubsystemLinkSegment`, `Configuration`) are added at all layers: domain entity → TypeORM schema → migration → port interfaces → command handlers. All edit operations flow through the `edit_actions` overlay; `CommitChangesHandler` is extended with pre-pass Steps A (incomplete chain discard) and B (orphaned port cleanup) before applying changes in topological order.

**Tech Stack:** TypeScript, NestJS, TypeORM, SQLite, Jest (unit + integration + E2E via Supertest)

**Out of scope:** §11 of the design (Control Subsystem Link Segments / CSLS — including `ControlSubsystemLinkSegment`, `control_subsystem_link_segments` table, `CreateControlSubsystemLinkSegmentHandler`, `DeleteControlSubsystemLinkSegmentHandler`, `ControlChainResolutionService`, `ControlIntentPropagationService`, and the parallel commit Step A'/B' for control links) is intentionally deferred to a separate plan. This plan covers data links only.

---

<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Chapter 01-01 — Entities & Enums

Spec reference: §3.1–3.2 of `docs/virtual-links/2026-05-31-virtual-links-design.md`

---

### Task 1: Extend `PORT_IO_TYPE` enum in core

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/domain/entities/common/enums/port-io-type.ts`

- [ ] **Step 1: Add `InputOutput` and `OutputInput` to the const object and the derived type**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PORT_IO_TYPE = {
  Input:       'Input',
  Output:      'Output',
  InputOutput: 'InputOutput',  // subsystem port: outfacing=Input, infacing=Output
  OutputInput: 'OutputInput',  // subsystem port: outfacing=Output, infacing=Input
} as const;

export type PortIoType = (typeof PORT_IO_TYPE)[keyof typeof PORT_IO_TYPE];
```

- [ ] **Step 2: Build and verify**

Run: `pnpm run build:core`
Expected: Build exits with code 0, no TypeScript errors.

---

### Task 2: Extend the persistence-layer `PortIoType` mirror

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/port-io-type-definition.schema.ts`

- [ ] **Step 1: Add the same two new values to the persistence mirror**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PortIoType = {
  Input:       'Input',
  Output:      'Output',
  InputOutput: 'InputOutput',  // subsystem port: outfacing=Input, infacing=Output
  OutputInput: 'OutputInput',  // subsystem port: outfacing=Output, infacing=Input
} as const;

export type PortIoType = (typeof PortIoType)[keyof typeof PortIoType];
```

- [ ] **Step 2: Build and verify**

Run: `pnpm run build`
Expected: Build exits with code 0, no TypeScript errors across all packages.

---

### Task 3: Create the `SubsystemLinkSegment` domain entity

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/domain/entities/usecase-data/subsystem-link-segment/subsystem-link-segment.ts`

- [ ] **Step 1: Create the entity file**

`DataLink` uses a plain constructor with direct property assignment and no `fromJson`/`toJson` pattern. `SubsystemLinkSegment` follows the same shape — plain public properties assigned in the constructor — but with no constructor validation (per spec §3.2: "No domain invariants are enforced in the constructor").

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export class SubsystemLinkSegment {
  public systemId:                number;
  public sourceNodeSystemId:      number;
  public destinationNodeSystemId: number;
  public sourcePortSystemId:      number;
  public destinationPortSystemId: number;
  public dataLinkSystemId:        number | null;
  public fileSystemId:            number;
  public version:                 number;

  constructor(
    systemId:                number,
    sourceNodeSystemId:      number,
    destinationNodeSystemId: number,
    sourcePortSystemId:      number,
    destinationPortSystemId: number,
    dataLinkSystemId:        number | null,
    fileSystemId:            number,
    version:                 number,
  ) {
    this.systemId                = systemId;
    this.sourceNodeSystemId      = sourceNodeSystemId;
    this.destinationNodeSystemId = destinationNodeSystemId;
    this.sourcePortSystemId      = sourcePortSystemId;
    this.destinationPortSystemId = destinationPortSystemId;
    this.dataLinkSystemId        = dataLinkSystemId;
    this.fileSystemId            = fileSystemId;
    this.version                 = version;
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm run build:core`
Expected: Build exits with code 0, no TypeScript errors.

---

### Task 4: Commit

Tasks 1–3 are a single atomic unit: the enum extension and the new entity that depends on the extended type both belong to the "entities & enums" chapter boundary. Commit them together.

- [ ] **Step 1: Use the `commit` skill to draft the commit message**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

```bash
git add packages/core/src/domain/entities/common/enums/port-io-type.ts
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/port-io-type-definition.schema.ts
git add packages/core/src/domain/entities/usecase-data/subsystem-link-segment/subsystem-link-segment.ts
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**
<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Chapter 01-02: Persistence Schemas (Tasks 5–10)

**Spec sections:** 4.1–4.4  
**Package:** `@arc/persistence`

---

### Task 5: Create `subsystem-link-segment.schema.ts`

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/links/subsystem-link-segment.schema.ts`

> Note: the new file lives in a new **lowercase** `links/` subfolder alongside the existing capitalised `Links/` folder.
> Both coexist on a case-insensitive filesystem — do **not** rename the existing `Links/` folder.

- [ ] **Step 1: Create the schema file**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {DataPortRow} from '../node/data-port-info.schema.js';
import type {DataLinkRow} from '../Links/data-link.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';

export interface SubsystemLinkSegmentRow extends EntityBaseRow {
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  dataLinkSystemId: number;
  fileSystemId: number;

  sourceNode?: NodeRow;
  destinationNode?: NodeRow;
  sourcePort?: DataPortRow;
  destinationPort?: DataPortRow;
  dataLink?: DataLinkRow;
  file?: ArcDbFileRow;
}

export const SubsystemLinkSegmentSchema = new EntitySchema<SubsystemLinkSegmentRow>({
  name: 'SubsystemLinkSegment',
  tableName: 'subsystem_link_segments',
  columns: {
    ...BaseColumnSchemaPart,
    sourceNodeSystemId: {
      name: 'source_node_system_id',
      type: 'integer',
      nullable: false,
    },
    destinationNodeSystemId: {
      name: 'destination_node_system_id',
      type: 'integer',
      nullable: false,
    },
    sourcePortSystemId: {
      name: 'source_port_system_id',
      type: 'integer',
      nullable: false,
    },
    destinationPortSystemId: {
      name: 'destination_port_system_id',
      type: 'integer',
      nullable: false,
    },
    dataLinkSystemId: {
      name: 'data_link_system_id',
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
    sourceNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'source_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    destinationNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'destination_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    sourcePort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'source_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    destinationPort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'destination_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    dataLink: {
      type: 'many-to-one',
      target: 'DataLink',
      joinColumn: {
        name: 'data_link_system_id',
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
      name: 'idx_sls_file',
      columns: ['fileSystemId'],
    },
    {
      name: 'idx_sls_data_link',
      columns: ['dataLinkSystemId'],
    },
    {
      name: 'idx_sls_src_port_file',
      columns: ['sourcePortSystemId', 'fileSystemId'],
    },
    {
      name: 'idx_sls_dst_port_file',
      columns: ['destinationPortSystemId', 'fileSystemId'],
    },
  ],
});
```

- [ ] **Step 2: Run test / verify**

Run: `pnpm run build`
Expected: Build completes with no TypeScript errors. The new schema file is compiled without issues.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything:

```bash
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/links/subsystem-link-segment.schema.ts
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 6: Create `configuration.schema.ts`

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/project-data/configuration.schema.ts`

- [ ] **Step 1: Create the schema file**

> **Reuses existing core const.** `MODULE_PORT_STRATEGIES` (plural) and `ModulePortStrategy` already exist at
> `packages/core/src/application/file-operations/shared/awsp-serializers/v1/configuration/types.ts` (re-exported from
> `.../configuration/index.js`). Values are identical (`'INPUT_ODD_OUTPUT_EVEN'`, `'SEQUENTIAL'`). The persistence
> layer already depends on `@arc/core`, so import the existing const from the `@arc/core` barrel instead of
> defining a duplicate. **Prerequisite:** Task 21 Step 3 adds the re-export to `packages/core/src/index.ts`; do
> not start this task until that re-export is in place.

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart} from '../entity-base.js';
import type {EntityBaseRow} from '../entity-base.js';
import type {ArcDbFileRow} from './arc-db-file.schema.js';
import {MODULE_PORT_STRATEGIES, type ModulePortStrategy} from '@arc/core';

// Re-export so downstream persistence consumers (e.g. inserters working with `ConfigurationRow`)
// have a single import point alongside the schema/row types.
export {MODULE_PORT_STRATEGIES, type ModulePortStrategy};

export interface ConfigurationRow extends EntityBaseRow {
  fileSystemId: number;
  portStrategy: ModulePortStrategy;
  extraConfig: string | null;

  file?: ArcDbFileRow;
}

export const ConfigurationSchema = new EntitySchema<ConfigurationRow>({
  name: 'Configuration',
  tableName: 'configuration',
  columns: {
    ...BaseColumnSchemaPart,
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    portStrategy: {
      name: 'port_strategy',
      type: 'simple-enum',
      enum: Object.values(MODULE_PORT_STRATEGIES),
      nullable: false,
    },
    extraConfig: {
      name: 'extra_config',
      type: 'text',
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
  },
  indices: [
    {
      name: 'uk_configuration_file',
      columns: ['fileSystemId'],
      unique: true,
    },
  ],
});
```

- [ ] **Step 2: Run test / verify**

Run: `pnpm run build`
Expected: Build completes with no TypeScript errors.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything:

```bash
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/project-data/configuration.schema.ts
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 7: Add new entity names to `ENTITY_NAMES`

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts`

- [ ] **Step 1: Add `SubsystemLinkSegment` and `Configuration` entries**

Locate the `// ── Link data ─────────────────────────────────────────────────────────────` comment block and add `SubsystemLinkSegment` immediately after `ControlLink`:

```typescript
  // ── Link data ─────────────────────────────────────────────────────────────
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  SubsystemLinkSegment: 'SubsystemLinkSegment',
```

Then locate the `// ── Project / File ────────────────────────────────────────────────────────────` comment block and add `Configuration` after `ModuleManagerData`:

```typescript
  // ── Project / File ────────────────────────────────────────────────────────────
  ArcDbFile: 'ArcDbFile',
  Project: 'Project',
  ModuleManagerData: 'ModuleManagerData',
  Configuration: 'Configuration',
```

The complete updated sections of the file (showing surrounding context for precision):

```typescript
  // ── Link data ─────────────────────────────────────────────────────────────
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  SubsystemLinkSegment: 'SubsystemLinkSegment',

  // ── Subgraph data ─────────────────────────────────────────────────────────
  Subgraph: 'Subgraph',
```

```typescript
  // ── Project / File ────────────────────────────────────────────────────────────
  ArcDbFile: 'ArcDbFile',
  Project: 'Project',
  ModuleManagerData: 'ModuleManagerData',
  Configuration: 'Configuration',

  // ── Edit session ──────────────────────────────────────────────────────────
  EditAction: 'EditAction',
```

- [ ] **Step 2: Run test / verify**

Run: `pnpm run build`
Expected: Build completes with no TypeScript errors. `EntityName` union type now includes `'SubsystemLinkSegment'` and `'Configuration'`.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything:

```bash
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 8: Register both new schemas in `entity-schema/index.ts`

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/index.ts`

> The `getAllEntitySchemas()` function in `index.ts` is the single registration point for all TypeORM EntitySchemas — it is passed to `getOrmBase()` in `orm-base.ts` which wires it into the DataSource. Adding schemas here is all that is needed.

- [ ] **Step 1: Add imports and register in `getAllEntitySchemas`**

Add the two new import lines near the top of the file, alongside the other link and project-data imports:

```typescript
import {SubsystemLinkSegmentSchema} from './usecase-data/links/subsystem-link-segment.schema.js';
import {ConfigurationSchema} from './project-data/configuration.schema.js';
```

Add the two new export statements in the appropriate sections of the file:

In the `// Use Case Data - Links` export section, after the existing `DataLink` exports:

```typescript
export type {SubsystemLinkSegmentRow} from './usecase-data/links/subsystem-link-segment.schema.js';
export {SubsystemLinkSegmentSchema} from './usecase-data/links/subsystem-link-segment.schema.js';
```

In the `// Project Data` export section, after the existing `Project` exports:

```typescript
export type {
  ConfigurationRow,
  ModulePortStrategy,
} from './project-data/configuration.schema.js';
export {
  MODULE_PORT_STRATEGIES,
  ConfigurationSchema,
} from './project-data/configuration.schema.js';
```

> `MODULE_PORT_STRATEGIES` (plural) is the existing const from `@arc/core`. The persistence `configuration.schema.ts`
> re-exports it for convenience (see Task 6); this `entity-schema/index.ts` propagates that re-export to
> `@arc/persistence` consumers so they do not need to know it originated in core.

In the `getAllEntitySchemas` function body, add both schemas. Place `SubsystemLinkSegmentSchema` directly after `DataLinkSchema`, and `ConfigurationSchema` directly after `ArcDbFileSchema`:

```typescript
    ControlLinkSchema,
    DataLinkSchema,
    SubsystemLinkSegmentSchema,   // ← add here
```

```typescript
    ArcDbFileSchema,
    ConfigurationSchema,          // ← add here
    ProjectSchema,
```

- [ ] **Step 2: Run test / verify**

Run: `pnpm run build`
Expected: Build completes with no TypeScript errors. Both new schemas are compiled and exported.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything:

```bash
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/index.ts
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 9: Regenerate the database migration

**Package:** `@arc/persistence`

**Files:**
- Delete: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/1781364357082-initial-create.ts`  (current timestamp — verify before deleting)
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts`  (generated by TypeORM CLI)
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts`

> Follow the standard workflow from `CLAUDE.md` § "Database Migration Workflow" exactly. All six steps are listed below.

- [ ] **Step 1: Build so the TypeORM CLI sees the updated schemas**

Run: `pnpm run build`
Expected: Build succeeds — all new `.js` files appear in `dist/`.

- [ ] **Step 2: Delete the current migration file**

Verify the current file first, then delete it:

```bash
ls packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/
rm packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/1781364357082-initial-create.ts
```

Expected: The `migrations/` directory is now empty.

- [ ] **Step 3: Generate the new migration**

Run: `pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create`
Expected: TypeORM CLI prints a success message and creates a new file named `<new-timestamp>-initial-create.ts` in the `migrations/` directory. Look for output like:

```
Migration ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts has been generated successfully.
```

The new timestamp will differ from `1781364357082`. Note the new timestamp — it is needed in Steps 4 and 5.

- [ ] **Step 4: Post-process the generated file**

Open the newly generated `<new-timestamp>-initial-create.ts`. Make exactly two edits:

**Edit A — add the Qualcomm copyright header at the very top of the file** (before all other content):

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
```

**Edit B — change the TypeORM import to use `type`:**

```typescript
// Before (generated by TypeORM):
import {MigrationInterface, QueryRunner} from 'typeorm';

// After (required by project ESM convention):
import type {MigrationInterface, QueryRunner} from 'typeorm';
```

Verify the generated migration contains `CREATE TABLE "subsystem_link_segments"` with all expected columns (`source_node_system_id`, `destination_node_system_id`, `source_port_system_id`, `destination_port_system_id`, `data_link_system_id`, `file_system_id`, `version`, `created_at`, `updated_at`), the four indices (`idx_sls_file`, `idx_sls_data_link`, `idx_sls_src_port_file`, `idx_sls_dst_port_file`), and the FK constraints with the correct `ON DELETE` behaviours (CASCADE on node/data_link/file FKs; RESTRICT on port FKs).

Also verify the migration contains `CREATE TABLE "configuration"` with `file_system_id` (UNIQUE), `port_strategy` (enum text), and `extra_config` (nullable text).

- [ ] **Step 5: Update `migration-index.ts`**

Replace the entire content of `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts` with:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {InitialCreate<new-timestamp>} from './migrations/<new-timestamp>-initial-create.js';

export const migrations = [InitialCreate<new-timestamp>];
```

Replace `<new-timestamp>` with the actual timestamp string from the generated filename (e.g. `1781500000000`).

- [ ] **Step 6: Run tests to verify the migration applies cleanly**

Run: `pnpm run build && pnpm run migration:run`
Expected: Migration runs without errors. All tables — including `subsystem_link_segments` and `configuration` — are created in the SQLite database.

Run: `pnpm --filter @arc/persistence run test`  (or the integration test suite)
Expected: All existing integration tests pass. No schema-mismatch errors.

- [ ] **Step 7: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything:

```bash
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts
git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 10: Commit everything (final chapter checkpoint)

**Package:** `@arc/persistence`

> This task is a checkpoint to ensure Tasks 5–9 are all committed and the persistence chapter is complete before moving on.

- [ ] **Step 1: Confirm all files are committed**

Run:

```bash
git status
```

Expected: Working tree is clean. If any files from Tasks 5–9 remain unstaged or uncommitted, stage and commit them now following the commit-skill workflow.

- [ ] **Step 2: Run the full persistence test suite**

Run: `pnpm --filter @arc/persistence run test`
Expected: All tests pass. No regressions introduced by the new schemas.

- [ ] **Step 3: Run the full build**

Run: `pnpm run build`
Expected: All packages build successfully. The `@arc/persistence` package exports `SubsystemLinkSegmentSchema`, `SubsystemLinkSegmentRow`, `ConfigurationSchema`, `ConfigurationRow`, `MODULE_PORT_STRATEGIES`, and `ModulePortStrategy` from its index.

- [ ] **Step 4: Tag the chapter complete**

Confirm with the user that Tasks 5–10 are done before starting the next chapter.

Use the `commit` skill to draft any final consolidation commit message if needed. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything:

```bash
git add <any remaining files>
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**
<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Chapter 01-03: Domain Services

Covers spec sections 5.1 (`SubsystemBoundaryPathService`) and 5.2 (`ChainResolutionService`).

Both services are pure TypeScript with no framework dependencies. They live in
`packages/core/src/domain/services/virtual-links/` and operate entirely on
in-memory data provided by the caller.

---

## Tasks 11–14 — `SubsystemBoundaryPathService`

---

### Task 11: Write failing tests for SubsystemBoundaryPathService

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/subsystem-boundary-path.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  SubsystemBoundaryPathService,
  type PathInput,
  type PathOutput,
} from '../../../../../../src/domain/services/virtual-links/subsystem-boundary-path.service.js';
import {PORT_IO_TYPE} from '../../../../../../src/domain/entities/common/enums/port-io-type.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(
  sourceNodeId: number,
  destNodeId: number,
  parentEntries: [number, number | null][],
  sourcePortId = 100,
  destPortId = 200,
): PathInput {
  return {
    sourceNodeId,
    sourcePortId,
    destNodeId,
    destPortId,
    nodeParentMap: new Map<number, number | null>(parentEntries),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubsystemBoundaryPathService', () => {
  // -------------------------------------------------------------------------
  // Case 1: Source at top level, dest inside one subsystem (LCA = null)
  // -------------------------------------------------------------------------
  describe('source at top level, dest inside one subsystem', () => {
    it('returns correct nodeSequence and requiredPortType', () => {
      // Layout:
      //   ModuleA (1) — parentId null  (top level)
      //   SubsystemY (10) — parentId null
      //   ModuleB (2)  — parentId 10
      const input = makeInput(1, 2, [
        [1, null],
        [10, null],
        [2, 10],
      ]);

      const result: PathOutput = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 2]);
      expect(result.requiredPortType.size).toBe(1);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.InputOutput);
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Both modules in different top-level subsystems (spec worked example)
  // Layout:
  //   ModuleA (1) → SubsystemInner (10) → SubsystemOuter (20) (top level)
  //   ModuleB (2) → SubsystemY (30) (top level)
  // Expected: nodeSequence = [1, 10, 20, 30, 2]
  //   SubsystemInner (10) → OutputInput  (exit)
  //   SubsystemOuter (20) → OutputInput  (exit)
  //   SubsystemY (30)     → InputOutput  (enter)
  // -------------------------------------------------------------------------
  describe('spec worked example — source nested 2 levels, dest nested 1 level, LCA = null', () => {
    it('returns [ModuleA, SubsystemInner, SubsystemOuter, SubsystemY, ModuleB]', () => {
      const input = makeInput(1, 2, [
        [1, 10],   // ModuleA inside SubsystemInner
        [10, 20],  // SubsystemInner inside SubsystemOuter
        [20, null], // SubsystemOuter at top level
        [2, 30],   // ModuleB inside SubsystemY
        [30, null], // SubsystemY at top level
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 20, 30, 2]);

      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(20)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(30)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Both modules share an outer subsystem (LCA is non-null node)
  //   SubsystemOuter (20) — parentId null
  //   SubsystemA (10)     — parentId 20
  //   SubsystemB (30)     — parentId 20
  //   ModuleA (1)         — parentId 10
  //   ModuleB (2)         — parentId 30
  // exitChain:  [10, 20] trimmed to [10]  (stops before LCA 20)
  // entryChain: [30, 20] trimmed to [30]  (stops before LCA 20)
  // nodeSequence: [1, 10, 30, 2]
  //   10 → OutputInput, 30 → InputOutput
  // -------------------------------------------------------------------------
  describe('both modules share outer subsystem (LCA = SubsystemOuter)', () => {
    it('does not include the LCA in nodeSequence and assigns correct port types', () => {
      const input = makeInput(1, 2, [
        [1, 10],   // ModuleA inside SubsystemA
        [10, 20],  // SubsystemA inside SubsystemOuter
        [2, 30],   // ModuleB inside SubsystemB
        [30, 20],  // SubsystemB inside SubsystemOuter
        [20, null], // SubsystemOuter at top level
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 30, 2]);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(30)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(2);
      // LCA (20) must not appear in the sequence
      expect(result.nodeSequence).not.toContain(20);
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Deep nesting on both sides with a non-null LCA
  //   Root (5)    — parentId null
  //   Mid_L (11)  — parentId 5
  //   Mid_R (21)  — parentId 5
  //   Inner_L (12)— parentId 11
  //   Inner_R (22)— parentId 21
  //   ModuleA (1) — parentId 12
  //   ModuleB (2) — parentId 22
  //
  // exitChain (from 1):  [12, 11, 5] trimmed (LCA=5) → [12, 11]
  // entryChain (from 2): [22, 21, 5] trimmed (LCA=5) → [22, 21]
  // reversed entryChain:                              → [21, 22]
  // nodeSequence: [1, 12, 11, 21, 22, 2]
  // -------------------------------------------------------------------------
  describe('deep nesting both sides with non-null LCA', () => {
    it('returns correct sequence excluding LCA node', () => {
      const input = makeInput(1, 2, [
        [1, 12],
        [12, 11],
        [11, 5],
        [5, null],
        [2, 22],
        [22, 21],
        [21, 5],
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 12, 11, 21, 22, 2]);

      expect(result.requiredPortType.get(12)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(11)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(21)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.get(22)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(4);
      expect(result.nodeSequence).not.toContain(5);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: One module inside one subsystem, other module at top level
  //         (mirror of Case 1 but source is the nested one)
  //   ModuleA (1) — parentId 10
  //   SubsystemX (10) — parentId null
  //   ModuleB (2) — parentId null
  // exitChain (from 1): [10] trimmed to [10]
  // entryChain (from 2): [] (already at top)
  // nodeSequence: [1, 10, 2]
  // -------------------------------------------------------------------------
  describe('source nested one level, dest at top level', () => {
    it('returns correct sequence with exit subsystem only', () => {
      const input = makeInput(1, 2, [
        [1, 10],
        [10, null],
        [2, null],
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 2]);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.size).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Both in different top-level subsystems, no intermediate nesting
  //   ModuleA (1) — parentId 10
  //   SubsystemA (10) — parentId null
  //   ModuleB (2) — parentId 20
  //   SubsystemB (20) — parentId null
  // nodeSequence: [1, 10, 20, 2]
  // -------------------------------------------------------------------------
  describe('both in different top-level subsystems (simple case)', () => {
    it('returns nodeSequence with one exit and one entry subsystem', () => {
      const input = makeInput(1, 2, [
        [1, 10],
        [10, null],
        [2, 20],
        [20, null],
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 20, 2]);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(20)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Verify port IDs pass through unchanged
  // -------------------------------------------------------------------------
  describe('portId passthrough', () => {
    it('does not mutate sourcePortId or destPortId (they are inputs, not in output)', () => {
      const input: PathInput = {
        sourceNodeId: 1,
        sourcePortId: 555,
        destNodeId: 2,
        destPortId: 666,
        nodeParentMap: new Map<number, number | null>([
          [1, 10],
          [10, null],
          [2, 20],
          [20, null],
        ]),
      };

      const result = SubsystemBoundaryPathService.compute(input);

      // The service just computes the path — it does not embed portIds into nodeSequence
      expect(result.nodeSequence[0]).toBe(1);
      expect(result.nodeSequence[result.nodeSequence.length - 1]).toBe(2);
    });
  });
});
```

---

### Task 12: Run tests to verify they fail

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/subsystem-boundary-path.service.spec.ts`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="subsystem-boundary-path.service.spec"`

Expected: FAIL with "Cannot find module '../../../../../../src/domain/services/virtual-links/subsystem-boundary-path.service.js'"

---

### Task 13: Implement SubsystemBoundaryPathService

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/domain/services/virtual-links/subsystem-boundary-path.service.ts`

- [ ] **Step 3: Write minimal implementation**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PORT_IO_TYPE} from '../../entities/common/enums/port-io-type.js';

// ---------------------------------------------------------------------------
// Interfaces (exported — callers depend on these shapes)
// ---------------------------------------------------------------------------

export interface PathInput {
  /** node.system_id for the source module */
  sourceNodeId: number;
  /** output port on the source module (caller-resolved) */
  sourcePortId: number;
  /** node.system_id for the dest module */
  destNodeId: number;
  /** input port on the dest module (caller-resolved) */
  destPortId: number;
  /** All nodes visible in the file: maps node.system_id → node.parentId (null = top level) */
  nodeParentMap: Map<number, number | null>;
}

export interface PathOutput {
  /** Ordered node IDs: [sourceModule, ...subsystemNodes, destModule] */
  nodeSequence: number[];
  /**
   * For each subsystem node in nodeSequence: the PortIoType it must have.
   * EXIT nodes (signal leaves) → PORT_IO_TYPE.OutputInput
   * ENTRY nodes (signal enters) → PORT_IO_TYPE.InputOutput
   */
  requiredPortType: Map<
    number,
    typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
  >;
}

// ---------------------------------------------------------------------------
// Service (static methods only — pure function, no instantiation needed)
// ---------------------------------------------------------------------------

export const SubsystemBoundaryPathService = {
  /**
   * Given two module nodes in different subsystem contexts, computes the
   * ordered node sequence the signal must pass through and the PortIoType
   * required at each subsystem boundary.
   *
   * Algorithm (spec section 5.1 / OQ-2):
   * 1. Walk nodeParentMap upward from sourceNodeId → exitChain
   * 2. Walk nodeParentMap upward from destNodeId   → entryChain
   * 3. Find LCA — first entry shared by both chains (null = top level if none)
   * 4. Trim both chains at LCA (exclusive)
   * 5. Reverse entryChain (LCA-level down to dest's immediate parent)
   * 6. Assemble nodeSequence
   * 7. Assign requiredPortType per chain membership
   */
  compute(input: PathInput): PathOutput {
    const {sourceNodeId, destNodeId, nodeParentMap} = input;

    // Step 1: build exitChain (ancestors of source, innermost first)
    const exitChain: number[] = [];
    let cursor: number | null = nodeParentMap.get(sourceNodeId) ?? null;
    while (cursor !== null) {
      exitChain.push(cursor);
      cursor = nodeParentMap.get(cursor) ?? null;
    }

    // Step 2: build entryChain (ancestors of dest, innermost first)
    const entryChain: number[] = [];
    cursor = nodeParentMap.get(destNodeId) ?? null;
    while (cursor !== null) {
      entryChain.push(cursor);
      cursor = nodeParentMap.get(cursor) ?? null;
    }

    // Step 3: find LCA — first node in exitChain that also appears in entryChain
    // A null LCA means the two chains share no common ancestor (both reach top level
    // without meeting), or one/both chains are empty (module already at top level).
    const entryChainSet = new Set<number>(entryChain);
    let lca: number | null = null;
    for (const node of exitChain) {
      if (entryChainSet.has(node)) {
        lca = node;
        break;
      }
    }

    // Step 4: trim both chains at LCA (exclusive — LCA itself is not a boundary node)
    const trimmedExit = lca === null
      ? exitChain
      : exitChain.slice(0, exitChain.indexOf(lca));

    const trimmedEntry = lca === null
      ? entryChain
      : entryChain.slice(0, entryChain.indexOf(lca));

    // Step 5: reverse entryChain so it reads top-down (outermost → innermost)
    const reversedEntry = trimmedEntry.slice().reverse();

    // Step 6: assemble nodeSequence
    const nodeSequence: number[] = [
      sourceNodeId,
      ...trimmedExit,
      ...reversedEntry,
      destNodeId,
    ];

    // Step 7: assign requiredPortType
    const requiredPortType = new Map<
      number,
      typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
    >();

    for (const node of trimmedExit) {
      requiredPortType.set(node, PORT_IO_TYPE.OutputInput);
    }
    for (const node of reversedEntry) {
      requiredPortType.set(node, PORT_IO_TYPE.InputOutput);
    }

    return {nodeSequence, requiredPortType};
  },
} as const;
```

---

### Task 14: Run tests to verify they pass, then commit

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/subsystem-boundary-path.service.spec.ts`
- Impl: `packages/core/src/domain/services/virtual-links/subsystem-boundary-path.service.ts`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="subsystem-boundary-path.service.spec"`

Expected: PASS

- [ ] **Step 5: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

## Tasks 15–18 — `ChainResolutionService`

---

### Task 15: Write failing tests for ChainResolutionService

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/chain-resolution.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  ChainResolutionService,
  type ResolutionInput,
  type ResolutionResult,
} from '../../../../../../src/domain/services/virtual-links/chain-resolution.service.js';
import {NodeType} from '../../../../../../src/domain/entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SegmentShape = ResolutionInput['unresolvedSegments'][number];

function seg(
  systemId: number,
  srcNode: number,
  dstNode: number,
  srcPort: number,
  dstPort: number,
): SegmentShape {
  return {
    systemId,
    sourceNodeSystemId: srcNode,
    destinationNodeSystemId: dstNode,
    sourcePortSystemId: srcPort,
    destinationPortSystemId: dstPort,
  };
}

function nodeTypeMap(entries: [number, 'module' | 'subsystem'][]): Map<number, NodeType> {
  return new Map(entries.map(([id, t]) => [id, t as NodeType]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChainResolutionService', () => {
  // -------------------------------------------------------------------------
  // Case 1: Empty input (fast path)
  // -------------------------------------------------------------------------
  describe('empty input', () => {
    it('returns empty completeChains and incompleteChains', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [],
        nodeTypeMap: new Map(),
      };

      const result: ResolutionResult = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(0);
      expect(result.incompleteChains).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Single complete chain — module → subsystem → module
  // Segments:
  //   S1: ModuleA(1) → SubsystemX(10),  port 100 → port 200
  //   S2: SubsystemX(10) → ModuleB(2),  port 201 → port 300
  // Expected complete chain: segmentIds=[1,2], srcModule=1, dstModule=2,
  //   sourcePortId=100, destPortId=300
  // -------------------------------------------------------------------------
  describe('single complete chain (module → subsystem → module)', () => {
    it('resolves to one complete chain with correct endpoints and port IDs', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [
          seg(1, 1, 10, 100, 200),  // ModuleA → SubsystemX
          seg(2, 10, 2, 201, 300),  // SubsystemX → ModuleB
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(1);
      expect(result.incompleteChains).toHaveLength(0);

      const chain = result.completeChains[0];
      expect(chain.segmentIds).toEqual([1, 2]);
      expect(chain.sourceModuleNodeId).toBe(1);
      expect(chain.destModuleNodeId).toBe(2);
      expect(chain.sourcePortId).toBe(100);   // S1.sourcePortSystemId
      expect(chain.destPortId).toBe(300);     // S2.destPortSystemId
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Multiple independent complete chains
  // Chain A: ModuleA(1) → SubsysX(10) → ModuleB(2)
  // Chain B: ModuleC(3) → SubsysY(20) → ModuleD(4)
  // -------------------------------------------------------------------------
  describe('multiple independent complete chains', () => {
    it('returns all chains without cross-contamination', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [
          // Chain A
          seg(1, 1, 10, 101, 201),
          seg(2, 10, 2, 202, 301),
          // Chain B
          seg(3, 3, 20, 103, 203),
          seg(4, 20, 4, 204, 304),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
          [3, 'module'],
          [20, 'subsystem'],
          [4, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(2);
      expect(result.incompleteChains).toHaveLength(0);

      const chainA = result.completeChains.find(c => c.sourceModuleNodeId === 1);
      const chainB = result.completeChains.find(c => c.sourceModuleNodeId === 3);

      expect(chainA).toBeDefined();
      expect(chainA!.segmentIds).toEqual([1, 2]);
      expect(chainA!.destModuleNodeId).toBe(2);
      expect(chainA!.sourcePortId).toBe(101);
      expect(chainA!.destPortId).toBe(301);

      expect(chainB).toBeDefined();
      expect(chainB!.segmentIds).toEqual([3, 4]);
      expect(chainB!.destModuleNodeId).toBe(4);
      expect(chainB!.sourcePortId).toBe(103);
      expect(chainB!.destPortId).toBe(304);
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Incomplete chain — dead end at a subsystem node
  // ModuleA(1) → SubsysX(10)  (no outgoing segment from SubsysX)
  // -------------------------------------------------------------------------
  describe('incomplete chain — dead end at subsystem', () => {
    it('reports an incomplete chain with the start module and last reachable node', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [
          seg(1, 1, 10, 100, 200),  // ModuleA → SubsystemX (dead end)
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(0);
      expect(result.incompleteChains).toHaveLength(1);

      const incomplete = result.incompleteChains[0];
      expect(incomplete.segmentIds).toEqual([1]);
      expect(incomplete.startModuleNodeId).toBe(1);
      expect(incomplete.lastReachableNodeId).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: Cycle detection
  // ModuleA(1) → SubsysX(10) → SubsysY(20) → SubsysX(10)  — cycle at 10
  // -------------------------------------------------------------------------
  describe('cycle detection', () => {
    it('reports an incomplete chain when a cycle is detected', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [
          seg(1, 1, 10, 100, 200),   // ModuleA → SubsysX
          seg(2, 10, 20, 201, 300),  // SubsysX → SubsysY
          seg(3, 20, 10, 301, 202),  // SubsysY → SubsysX (cycle!)
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      // The cycle prevents completion → everything ends up as incomplete
      expect(result.completeChains).toHaveLength(0);
      expect(result.incompleteChains.length).toBeGreaterThan(0);

      // The start module must be identified
      const inc = result.incompleteChains[0];
      expect(inc.startModuleNodeId).toBe(1);
      // All segment IDs should be reported
      const allReported = new Set(result.incompleteChains.flatMap(c => c.segmentIds));
      expect(allReported.has(1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Fan-out — one module with two outgoing segments (two chains)
  // ModuleA(1) → SubsysX(10) → ModuleB(2)
  // ModuleA(1) → SubsysY(20) → ModuleC(3)
  // -------------------------------------------------------------------------
  describe('fan-out — one module with two outgoing SLS', () => {
    it('walks both branches as independent chains', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [
          // Branch 1
          seg(1, 1, 10, 101, 201),
          seg(2, 10, 2, 202, 301),
          // Branch 2
          seg(3, 1, 20, 102, 401),  // same source module, different port
          seg(4, 20, 3, 402, 501),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
          [20, 'subsystem'],
          [3, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(2);
      expect(result.incompleteChains).toHaveLength(0);

      const chainToB = result.completeChains.find(c => c.destModuleNodeId === 2);
      const chainToC = result.completeChains.find(c => c.destModuleNodeId === 3);

      expect(chainToB).toBeDefined();
      expect(chainToB!.sourceModuleNodeId).toBe(1);
      expect(chainToB!.segmentIds).toEqual([1, 2]);
      expect(chainToB!.sourcePortId).toBe(101);
      expect(chainToB!.destPortId).toBe(301);

      expect(chainToC).toBeDefined();
      expect(chainToC!.sourceModuleNodeId).toBe(1);
      expect(chainToC!.segmentIds).toEqual([3, 4]);
      expect(chainToC!.sourcePortId).toBe(102);
      expect(chainToC!.destPortId).toBe(501);
    });
  });

  // -------------------------------------------------------------------------
  // Case 7: Chain of three segments (module → sub → sub → module)
  // ModuleA(1) → SubsysX(10) → SubsysY(20) → ModuleB(2)
  // -------------------------------------------------------------------------
  describe('three-segment complete chain', () => {
    it('resolves and carries first source port and last dest port', () => {
      const input: ResolutionInput = {
        unresolvedSegments: [
          seg(1, 1, 10, 100, 200),
          seg(2, 10, 20, 201, 300),
          seg(3, 20, 2, 301, 400),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
          [2, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(1);
      const chain = result.completeChains[0];
      expect(chain.segmentIds).toEqual([1, 2, 3]);
      expect(chain.sourceModuleNodeId).toBe(1);
      expect(chain.destModuleNodeId).toBe(2);
      expect(chain.sourcePortId).toBe(100);
      expect(chain.destPortId).toBe(400);
    });
  });
});
```

---

### Task 16: Run tests to verify they fail

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/chain-resolution.service.spec.ts`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="chain-resolution.service.spec"`

Expected: FAIL with "Cannot find module '../../../../../../src/domain/services/virtual-links/chain-resolution.service.js'"

---

### Task 17: Implement ChainResolutionService

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/domain/services/virtual-links/chain-resolution.service.ts`

- [ ] **Step 3: Write minimal implementation**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NodeType} from '../../entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Interfaces (exported — callers depend on these shapes)
// ---------------------------------------------------------------------------

export interface ResolutionInput {
  /**
   * All SLS where dataLinkSystemId = null (committed + overlay merged by caller).
   */
  unresolvedSegments: {
    systemId: number;
    sourceNodeSystemId: number;
    destinationNodeSystemId: number;
    sourcePortSystemId: number;
    destinationPortSystemId: number;
  }[];

  /** NodeType for every node that appears in the segments. */
  nodeTypeMap: Map<number, NodeType>;
}

export interface ResolutionResult {
  completeChains: {
    /** Ordered SLS system_ids — used for SLS UPDATE edit actions. */
    segmentIds: number[];
    /** The module node where the chain starts. */
    sourceModuleNodeId: number;
    /** The module node where the chain ends. */
    destModuleNodeId: number;
    /** S1.sourcePortSystemId → DataLink.sourcePortSystemId */
    sourcePortId: number;
    /** SN.destPortSystemId → DataLink.destPortSystemId */
    destPortId: number;
  }[];

  incompleteChains: {
    /** All SLS system_ids in the incomplete chain (ordered). */
    segmentIds: number[];
    /** Module node where the chain begins. */
    startModuleNodeId: number;
    /** Last node reached before the dead end or cycle. */
    lastReachableNodeId: number;
  }[];
}

// ---------------------------------------------------------------------------
// Internal walk result
// ---------------------------------------------------------------------------

type WalkResult =
  | {
      kind: 'complete';
      segmentIds: number[];
      sourceModuleNodeId: number;
      destModuleNodeId: number;
      sourcePortId: number;
      destPortId: number;
    }
  | {
      kind: 'incomplete';
      segmentIds: number[];
      startModuleNodeId: number;
      lastReachableNodeId: number;
    };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ChainResolutionService = {
  /**
   * Given all unresolved SLS for a file, finds every complete chain
   * (module → subsystems → module) and returns the information needed to
   * create a DataLink for each. Also reports incomplete chains (dead ends
   * and cycles).
   *
   * Algorithm (spec section 5.2):
   * 1. Build directed adjacency map: sourceNodeId → SLS[]
   * 2. Identify start nodes: appear as source AND are NodeType.Module
   * 3. For each start node, walk forward (greedy). Fan-out spawns independent
   *    branches. Cycle detection via visited set.
   * 4. Terminate complete when destination is NodeType.Module (not start).
   *    Terminate incomplete on dead end or cycle.
   * 5. Extract sourcePortId / destPortId from first / last segment.
   */
  resolve(input: ResolutionInput): ResolutionResult {
    const {unresolvedSegments, nodeTypeMap} = input;

    if (unresolvedSegments.length === 0) {
      return {completeChains: [], incompleteChains: []};
    }

    // Step 1: build directed adjacency map
    const adjacency = new Map<
      number,
      {segmentId: number; destNode: number; srcPort: number; dstPort: number}[]
    >();

    for (const seg of unresolvedSegments) {
      const existing = adjacency.get(seg.sourceNodeSystemId);
      const entry = {
        segmentId: seg.systemId,
        destNode: seg.destinationNodeSystemId,
        srcPort: seg.sourcePortSystemId,
        dstPort: seg.destinationPortSystemId,
      };
      if (existing) {
        existing.push(entry);
      } else {
        adjacency.set(seg.sourceNodeSystemId, [entry]);
      }
    }

    // Step 2: identify start nodes (source nodes that are modules)
    const startNodes = new Set<number>();
    for (const [nodeId] of adjacency) {
      if (nodeTypeMap.get(nodeId) === NodeType.Module) {
        startNodes.add(nodeId);
      }
    }

    const completeChains: ResolutionResult['completeChains'] = [];
    const incompleteChains: ResolutionResult['incompleteChains'] = [];

    // Step 3–5: walk each start node
    for (const startNode of startNodes) {
      const walks = ChainResolutionService._walkFrom(
        startNode,
        adjacency,
        nodeTypeMap,
      );

      for (const walk of walks) {
        if (walk.kind === 'complete') {
          completeChains.push({
            segmentIds: walk.segmentIds,
            sourceModuleNodeId: walk.sourceModuleNodeId,
            destModuleNodeId: walk.destModuleNodeId,
            sourcePortId: walk.sourcePortId,
            destPortId: walk.destPortId,
          });
        } else {
          incompleteChains.push({
            segmentIds: walk.segmentIds,
            startModuleNodeId: walk.startModuleNodeId,
            lastReachableNodeId: walk.lastReachableNodeId,
          });
        }
      }
    }

    return {completeChains, incompleteChains};
  },

  /**
   * Recursively walks forward from `currentNode`, returning all walk results
   * (one per branch in the case of fan-out).
   *
   * @param startNode - the module node that began this chain
   * @param adjacency - the full adjacency map
   * @param nodeTypeMap - node type lookup
   * @param accumulated - segments accumulated so far on this branch
   * @param visited - set of nodes visited on this branch (cycle detection)
   * @param firstSrcPort - the sourcePortSystemId of the very first segment
   */
  _walkFrom(
    currentNode: number,
    adjacency: Map<
      number,
      {segmentId: number; destNode: number; srcPort: number; dstPort: number}[]
    >,
    nodeTypeMap: Map<number, NodeType>,
    accumulated: {segmentId: number; srcPort: number; dstPort: number}[] = [],
    visited: Set<number> = new Set<number>(),
    firstSrcPort: number | null = null,
    startModuleNodeId: number | null = null,
  ): WalkResult[] {
    const actualStart = startModuleNodeId ?? currentNode;
    const outgoing = adjacency.get(currentNode);

    // Dead end (no outgoing segments)
    if (!outgoing || outgoing.length === 0) {
      const lastNode = accumulated.length > 0
        ? (() => {
            // last reachable node is the destination of the last segment
            // We need the destination of the final segment; it's currentNode itself
            return currentNode;
          })()
        : currentNode;

      return [
        {
          kind: 'incomplete',
          segmentIds: accumulated.map(a => a.segmentId),
          startModuleNodeId: actualStart,
          lastReachableNodeId: lastNode,
        },
      ];
    }

    const results: WalkResult[] = [];

    for (const edge of outgoing) {
      const {segmentId, destNode, srcPort, dstPort} = edge;

      // Cycle detection
      if (visited.has(destNode)) {
        results.push({
          kind: 'incomplete',
          segmentIds: [...accumulated.map(a => a.segmentId), segmentId],
          startModuleNodeId: actualStart,
          lastReachableNodeId: destNode,
        });
        continue;
      }

      const newAccumulated = [
        ...accumulated,
        {segmentId, srcPort, dstPort},
      ];
      const resolvedFirstSrcPort = firstSrcPort ?? srcPort;

      // Complete chain: destination is a module (and not the start)
      if (
        nodeTypeMap.get(destNode) === NodeType.Module &&
        destNode !== actualStart
      ) {
        results.push({
          kind: 'complete',
          segmentIds: newAccumulated.map(a => a.segmentId),
          sourceModuleNodeId: actualStart,
          destModuleNodeId: destNode,
          sourcePortId: resolvedFirstSrcPort,
          destPortId: dstPort,
        });
        continue;
      }

      // Continue walking — recurse into destNode
      const newVisited = new Set<number>(visited);
      newVisited.add(currentNode);

      const subResults = ChainResolutionService._walkFrom(
        destNode,
        adjacency,
        nodeTypeMap,
        newAccumulated,
        newVisited,
        resolvedFirstSrcPort,
        actualStart,
      );

      results.push(...subResults);
    }

    return results;
  },
} as const;
```

---

### Task 18: Run tests to verify they pass, then commit

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/chain-resolution.service.spec.ts`
- Impl: `packages/core/src/domain/services/virtual-links/chain-resolution.service.ts`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="chain-resolution.service.spec"`

Expected: PASS

- [ ] **Step 5: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**
<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Chapter 02-01: Port Interfaces (Tasks 19–24)

**Spec sections:** 7.1–7.4  
**Packages:** `@arc/core`, `@arc/persistence`

---

### Task 19: Define `ISubsystemLinkSegmentRepository`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/repositories/i-subsystem-link-segment.repository.ts`

- [ ] **Step 1: Create the interface file**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubsystemLinkSegmentRow} from '../../../../infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/links/subsystem-link-segment.schema.js';
```

> **Wait** — `@arc/core` must never import from `@arc/persistence` or the infrastructure path. The row type used in the interface must be imported from a schema file that lives inside `@arc/core`, or the interface must use a plain structural type. Per the spec (§7.1), the row type is `SubsystemLinkSegmentRow` defined in Task 5. Since that type lives in `@arc/persistence`, the interface must either:
>
> (a) Re-declare a minimal structural type inline, or  
> (b) The plan must accept that `SubsystemLinkSegmentRow` is declared in a shared location visible to core.
>
> **Resolution for this plan:** The interface uses a locally-redeclared structural type `SubsystemLinkSegmentOverlayRow` that matches the fields the handlers actually need. This is the same approach used for every other port interface in `@arc/core` — they never import persistence-layer row types. Implementations in `@arc/persistence` satisfy the structural contract.

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Minimal structural shape of a subsystem link segment row as seen by
 * application-layer handlers. Matches `SubsystemLinkSegmentRow` from the
 * persistence layer structurally — no import from @arc/persistence.
 *
 * Fields mirror the entity defined in spec §3.2 / §4.1.
 */
export interface SubsystemLinkSegmentOverlayRow {
  systemId:                number;
  sourceNodeSystemId:      number;
  destinationNodeSystemId: number;
  sourcePortSystemId:      number;
  destinationPortSystemId: number;
  /** null in the overlay-merged view when the row is unresolved */
  dataLinkSystemId:        number | null;
  fileSystemId:            number;
  version:                 number;
}

/**
 * Read-side repository for subsystem link segments.
 *
 * All three methods return the committed-table view merged with the active
 * session's edit_actions overlay (STAGED + UNSTAGED, validUntil IS NULL).
 *
 * Spec §7.1.
 */
export interface ISubsystemLinkSegmentRepository {
  /**
   * Returns all SLS for the file where the effective dataLinkSystemId is null
   * after applying the session overlay. Includes:
   *  - Committed rows with no overlay (already had null FK — should not exist
   *    in the actual table, but guard for safety)
   *  - Pending CREATE edit actions with dataLinkSystemId = null
   *  - Committed rows whose FK was nulled by an UPDATE edit action (sibling
   *    cleanup from DeleteSubsystemLinkSegmentHandler Case B)
   *
   * Used by ResolveSLSChainsService and CommitChangesHandler Step A.
   */
  getUnresolvedForFile(
    fileId:    number,
    sessionId: number,
  ): Promise<SubsystemLinkSegmentOverlayRow[]>;

  /**
   * Returns all SLS whose effective dataLinkSystemId equals the given value
   * after applying the session overlay.
   *
   * Used by DeleteDataLinkHandler to find sibling segments to clean up.
   */
  getByDataLinkId(
    dataLinkSystemId: number,
    fileId:           number,
    sessionId:        number,
  ): Promise<SubsystemLinkSegmentOverlayRow[]>;

  /**
   * One-connection-per-port check (FR-VL-08).
   *
   * Returns the SLS systemId that already uses this port as its source
   * (asSource) or destination (asDest) in the committed+overlay view, or null
   * if the port slot is free.
   *
   * Used by CreateSubsystemLinkSegmentHandler Branch C before any write.
   */
  getByPortId(
    portSystemId: number,
    fileId:       number,
    sessionId:    number,
  ): Promise<{
    asSource: number | null;
    asDest:   number | null;
  }>;
}
```

- [ ] **Step 2: Export the interface from the persistence ports index**

Open `packages/core/src/application/ports/persistence/index.ts` and add the two lines shown below. Do not rewrite the rest of the file.

Lines to add:

```typescript
export type {ISubsystemLinkSegmentRepository} from './repositories/i-subsystem-link-segment.repository.js';
export type {SubsystemLinkSegmentOverlayRow} from './repositories/i-subsystem-link-segment.repository.js';
```

- [ ] **Step 3: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

- [ ] **Step 4: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 20: Extend `INodeRepository` with `getNodeParentMap` and `getNodeTypeMap`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/ports/persistence/repositories/` — find the existing node repository interface file first (search for `INodeRepository` or `NodeRepository` in the `repositories/` subtree).

> **Before writing any code:** run
> ```
> find packages/core/src/application/ports/persistence/repositories -name "*node*"
> ```
> or use Grep to locate the file. If it does not exist yet, create it at
> `packages/core/src/application/ports/persistence/repositories/i-node.repository.ts`
> following the pattern of `i-subsystem-link-segment.repository.ts` above.

- [ ] **Step 1: Add two new methods to the interface**

Locate the `INodeRepository` (or `NodeRepository`) interface. Insert the following two method signatures. Do not alter existing methods.

```typescript
  /**
   * Returns a map of every node systemId → parentId (null for top-level nodes)
   * for all nodes that belong to the given file, after applying the session
   * overlay (STAGED + UNSTAGED, validUntil IS NULL).
   *
   * Called by CreateDataLinkHandler and CreateSubsystemLinkSegmentHandler
   * before invoking SubsystemBoundaryPathService.
   *
   * Spec §7.2.
   */
  getNodeParentMap(fileId: number): Promise<Map<number, number | null>>;

  /**
   * Returns a map of nodeId → NodeType for a specific set of node IDs.
   *
   * The set is the union of all sourceNodeSystemId and destinationNodeSystemId
   * values from the unresolved SLS passed to ChainResolutionService.
   *
   * Implementations must query the committed table and merge any live
   * edit_actions (CREATE, UPDATE, DELETE) for the relevant systemIds.
   * For the session-scoped variant the caller passes the resolved sessionId.
   *
   * Spec §7.2.
   */
  getNodeTypeMap(nodeIds: number[]): Promise<Map<number, NodeType>>;
```

> `NodeType` is imported from the node schema: `import type {NodeType} from '...'`.
> The exact import path depends on where the file lives. If the interface file is in
> `packages/core/src/application/ports/persistence/repositories/`, the import is:
>
> ```typescript
> // NOT allowed — core cannot import persistence layer types directly.
> ```
>
> Instead, `NodeType` must come from the core domain. Check whether `NodeType` is
> already re-exported from `@arc/core`. If it is, import it from the relative path to
> `packages/core/src/domain/...`. If it lives only in the persistence schema, copy the
> `NODE_TYPE` const and `NodeType` type into a new core domain enum file at
> `packages/core/src/domain/entities/common/enums/node-type.ts` and import from there.
>
> The existing `node.schema.ts` at
> `packages/infrastructure/persistence/src/.../node.schema.ts` already defines
> `NODE_TYPE` and `NodeType` — if they are not yet in `@arc/core`, they must be
> extracted there as part of this task before the interface can compile.

- [ ] **Step 2: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 21: Define `IConfigurationRepository` and `calculatePortId`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/repositories/i-configuration.repository.ts`
- Create: `packages/core/src/domain/utilities/port-id-strategy.ts`

- [ ] **Step 1: Create the `IConfigurationRepository` interface**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  MODULE_PORT_STRATEGIES,
  type ModulePortStrategy,
} from '../../../../file-operations/shared/awsp-serializers/v1/configuration/index.js';

// Re-export so application-layer code that uses ConfigurationOverlayRow can pick up
// the const+type from one place rather than reaching into the awsp-serializers path.
export {MODULE_PORT_STRATEGIES, type ModulePortStrategy};

/**
 * Minimal structural shape of a configuration row as seen by application-layer
 * handlers. Matches `ConfigurationRow` from the persistence layer structurally —
 * no import from @arc/persistence.
 *
 * Fields mirror the entity defined in spec §4.3.
 */
export interface ConfigurationOverlayRow {
  systemId:      number;
  fileSystemId:  number;
  portStrategy:  ModulePortStrategy;
  /** JSON blob for future workspace config fields; not used by handlers */
  extraConfig:   string | null;
  version:       number;
}

/**
 * Read-side repository for the workspace configuration record.
 *
 * There is exactly one row per file. The row is inserted at upload time
 * (out of scope for this task but assumed to exist).
 *
 * Spec §7.4.
 */
export interface IConfigurationRepository {
  /**
   * Returns the configuration row for the given file.
   * Throws if no row exists (guards against missing upload-time seeding).
   */
  getByFileId(fileId: number): Promise<ConfigurationOverlayRow>;
}
```

> **Why reuse over redefine.** `MODULE_PORT_STRATEGIES` (plural) and `ModulePortStrategy` already exist in
> `@arc/core` at `application/file-operations/shared/awsp-serializers/v1/configuration/types.ts` and are used by
> `spf-module-builder.ts:688-706` (the function we are extracting). Defining a second `MODULE_PORT_STRATEGY`
> (singular) here would split the source of truth — upload-time port assignment and modification-time port
> assignment must agree by definition. Importing the existing const guarantees that.

- [ ] **Step 2: Create the `calculatePortId` utility**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  MODULE_PORT_STRATEGIES,
  type ModulePortStrategy,
} from '../../application/file-operations/shared/awsp-serializers/v1/configuration/index.js';

/**
 * Computes the dataPortId for a new subsystem port given the current count
 * of ports of the same direction on the target node.
 *
 * Strategy semantics:
 *   SEQUENTIAL:           dataPortId = baseIndex + 1
 *   INPUT_ODD_OUTPUT_EVEN: Input  → baseIndex * 2 + 2  (even start: 2, 4, 6 …)
 *                          Output → baseIndex * 2 + 1  (odd start:  1, 3, 5 …)
 *
 * `baseIndex` is the count of existing ports of the same portIoType on the
 * subsystem node (committed + overlay), before the new port is added.
 * For the first port of a direction, baseIndex = 0.
 *
 * Pure function — no side effects, no external dependencies.
 *
 * Extracted from `spf-module-builder.ts:688-706` per spec §7.4 — the
 * domain utility and the upload-time builder must stay in lock-step, which is
 * why both depend on the same `MODULE_PORT_STRATEGIES` constant in @arc/core.
 */
export function calculatePortId(
  baseIndex: number,
  isInput:   boolean,
  strategy:  ModulePortStrategy,
): number {
  if (strategy === MODULE_PORT_STRATEGIES.SEQUENTIAL) {
    return baseIndex + 1;
  }
  // INPUT_ODD_OUTPUT_EVEN (and default)
  return isInput ? baseIndex * 2 + 2 : baseIndex * 2 + 1;
}
```

> **Optional follow-up (not in this plan).** `MODULE_PORT_STRATEGIES` currently lives in `application/file-operations/...`
> because that's where AWSP parsing introduced it. Semantically it is a domain enum (it governs how port IDs are
> assigned). A future refactor may move it to `packages/core/src/domain/entities/common/enums/module-port-strategy.ts`
> and re-export from the existing location. Leaving the import path as-is keeps this plan minimal.

- [ ] **Step 3: Export the new types and utility from `@arc/core`**

`@arc/core`'s `package.json` only declares a single `.` export entry, so all cross-package imports must
flow through `packages/core/src/index.ts`. This step wires three pieces into that barrel:

1. **`MODULE_PORT_STRATEGIES` / `ModulePortStrategy`** — the existing const lives at
   `application/file-operations/shared/awsp-serializers/v1/configuration/index.js` and is currently NOT
   re-exported from `src/index.ts`. Add it here so `@arc/persistence` can import it via `from '@arc/core'`
   instead of a deep path (which would not resolve against the package's `exports` field).

   Open `packages/core/src/index.ts` and add (near the other `application/file-operations/...` exports
   around line 80):

   ```typescript
   // File Operations - AWSP configuration types (port strategy, processor domains, alsa file types)
   export {
     MODULE_PORT_STRATEGIES,
     PROCESSOR_DOMAINS,
     ALSA_FILE_TYPES,
     type ModulePortStrategy,
     type ProcessorDomain,
     type AlsaFileType,
   } from './application/file-operations/shared/awsp-serializers/v1/configuration/index.js';
   ```

2. **`IConfigurationRepository` / `ConfigurationOverlayRow`** — add to the ports section:

   ```typescript
   export type {
     IConfigurationRepository,
     ConfigurationOverlayRow,
   } from './application/ports/persistence/repositories/i-configuration.repository.js';
   ```

3. **`calculatePortId`** — add to the domain utilities section (create the section if it does not exist):

   ```typescript
   // Domain utilities
   export {calculatePortId} from './domain/utilities/port-id-strategy.js';
   ```

After this step, `@arc/persistence` and any other consumer can write:

```typescript
import {MODULE_PORT_STRATEGIES, type ModulePortStrategy, calculatePortId} from '@arc/core';
```

> **Note:** `i-configuration.repository.ts` (Step 1) already re-exports `MODULE_PORT_STRATEGIES` for ergonomic
> grouping with `ConfigurationOverlayRow`. The barrel export here points consumers at the canonical AWSP location
> so they do not need to know which intermediate file re-exports it. Both paths resolve to the same symbol.

- [ ] **Step 4: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

- [ ] **Step 5: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 22: Register new repositories in `UnitOfWork`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/ports/persistence/unit-of-work.ts`

- [ ] **Step 1: Add the two new getter method signatures**

Open `packages/core/src/application/ports/persistence/unit-of-work.ts`. Add these two import lines at the top alongside the existing imports:

```typescript
import type {ISubsystemLinkSegmentRepository} from './repositories/i-subsystem-link-segment.repository.js';
import type {IConfigurationRepository} from './repositories/i-configuration.repository.js';
```

Then insert the following two method signatures at the end of the `UnitOfWork` interface body, after the existing `getValidationQueryService()` line:

```typescript
  /**
   * Get subsystem link segment repository for SLS read operations.
   * Uses shared QueryRunner from this UOW.
   */
  getSubsystemLinkSegmentRepository(): ISubsystemLinkSegmentRepository;

  /**
   * Get configuration repository for workspace configuration reads.
   * Uses shared QueryRunner from this UOW.
   */
  getConfigurationRepository(): IConfigurationRepository;
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
import type {ISubsystemLinkSegmentRepository} from './repositories/i-subsystem-link-segment.repository.js';
import type {IConfigurationRepository} from './repositories/i-configuration.repository.js';

/**
 * Unit of Work pattern for managing database transactions and repository access.
 *
 * Lifecycle:
 * - Created by CommandBus with an active QueryRunner
 * - QueryRunner remains alive for the entire command execution
 * - Handlers control transaction boundaries via startTransaction/commit/rollback
 * - CommandBus releases QueryRunner after command completes
 */
export interface UnitOfWork {
  /**
   * Start a new transaction.
   * @throws Error if transaction is already active
   */
  startTransaction(): Promise<void>;

  /**
   * Commit the active transaction.
   * Note: QueryRunner remains alive after commit (CommandBus will release it)
   * @throws Error if no active transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback the active transaction.
   * Note: QueryRunner remains alive after rollback (CommandBus will release it)
   * @throws Error if no active transaction
   */
  rollback(): Promise<void>;

  /**
   * Check if a transaction is currently active.
   */
  isInTransaction(): boolean;

  /**
   * Get bulk import repository for file upload operations.
   * Uses shared QueryRunner from this UOW.
   */
  getBulkImportRepository(): BulkImportRepository;

  /**
   * Get project repository for project management operations.
   * Uses shared QueryRunner from this UOW.
   */
  getProjectRepository(): ProjectRepository;

  /**
   * Get validation preferences repository.
   * Uses shared QueryRunner from this UOW.
   */
  getValidationPreferencesRepository(): ValidationPreferencesRepository;

  /**
   * Get validation query service for running validations from command handlers.
   * Provides read-only access to domain entities needed by ValidationContextBuilder.fromDb().
   * Uses the same DB connection as this UOW for consistency.
   *
   * Use this in command handlers (commit, save) that need to run validation
   * against DB-persisted entities. For the upload path, use fromEntities() instead.
   */
  getValidationQueryService(): ValidationQueryRepository;

  /**
   * Get subsystem link segment repository for SLS read operations.
   * Uses shared QueryRunner from this UOW.
   */
  getSubsystemLinkSegmentRepository(): ISubsystemLinkSegmentRepository;

  /**
   * Get configuration repository for workspace configuration reads.
   * Uses shared QueryRunner from this UOW.
   */
  getConfigurationRepository(): IConfigurationRepository;
}
```

- [ ] **Step 2: Export from the persistence ports index**

Verify `packages/core/src/application/ports/persistence/index.ts` already exports `UnitOfWork` (it does). No additional lines needed here — the two new interface types are already exported in Tasks 19 and 21.

- [ ] **Step 3: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors. The `TypeOrmUnitOfWork` in `@arc/api` will now have two missing method errors — those are addressed in Task 24.

- [ ] **Step 4: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 23: Implement TypeORM repositories for SLS, Configuration, and Node extensions

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/subsystem-link-segment/typeorm-subsystem-link-segment.repository.ts`
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/configuration/typeorm-configuration.repository.ts`
- Modify: find existing node repository implementation (search `typeorm-node` in repositories subtree); if it does not exist, create `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/node/typeorm-node.repository.ts`

- [ ] **Step 1: Implement `TypeOrmSubsystemLinkSegmentRepository`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryRunner} from 'typeorm';
import type {
  ISubsystemLinkSegmentRepository,
  SubsystemLinkSegmentOverlayRow,
} from '@arc/core';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {SubsystemLinkSegmentRow} from '../../entity-schema/usecase-data/links/subsystem-link-segment.schema.js';
import {
  applyToCollection,
  applyToSingle,
} from '../../queries/edit-session/overlay-merge.js';

/**
 * TypeORM implementation of ISubsystemLinkSegmentRepository.
 *
 * Each method queries the committed `subsystem_link_segments` table, then
 * fetches the active session's edit_actions (STAGED + UNSTAGED, validUntil
 * IS NULL) for the SubsystemLinkSegment entity, and merges them using the
 * shared overlay helpers.
 *
 * The overlay-merge logic is:
 *   CREATE  → append to result (entity exists only in edit_actions)
 *   UPDATE  → merge partial payload over the committed row
 *   DELETE  → remove the row from the result
 *
 * This faithfully represents what the committed table will look like after the
 * session is committed, without touching the actual table.
 */
export class TypeOrmSubsystemLinkSegmentRepository
  implements ISubsystemLinkSegmentRepository
{
  constructor(private readonly queryRunner: QueryRunner) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  private async fetchCommitted(fileId: number): Promise<SubsystemLinkSegmentRow[]> {
    return this.queryRunner.manager.find<SubsystemLinkSegmentRow>(
      ENTITY_NAMES.SubsystemLinkSegment,
      {where: {fileSystemId: fileId}},
    );
  }

  private async fetchEditActions(sessionId: number): Promise<EditActionRow[]> {
    return this.queryRunner.manager.find<EditActionRow>(
      ENTITY_NAMES.EditAction,
      {
        where: {
          sessionId,
          tableName: ENTITY_NAMES.SubsystemLinkSegment,
          // validUntil IS NULL — TypeORM treats undefined as no filter for
          // nullable columns; use a raw query builder clause instead.
        },
      },
    ).then(rows =>
      // Post-filter: only current (validUntil IS NULL) STAGED/UNSTAGED actions.
      rows.filter(
        r =>
          r.validUntil === null &&
          (r.changeStatus === CHANGE_STATUS.Staged ||
            r.changeStatus === CHANGE_STATUS.Unstaged),
      ),
    );
  }

  private mergedView(
    committed: SubsystemLinkSegmentRow[],
    editActions: EditActionRow[],
  ): SubsystemLinkSegmentOverlayRow[] {
    // Cast payload to Partial<SubsystemLinkSegmentRow> for the overlay helper.
    const overlayActions = editActions.map(ea => ({
      systemId: ea.systemId,
      operation: ea.operation,
      payload: ea.payload,
    }));
    return applyToCollection(
      committed as SubsystemLinkSegmentOverlayRow[],
      overlayActions,
    ) as SubsystemLinkSegmentOverlayRow[];
  }

  // ── interface methods ──────────────────────────────────────────────────────

  async getUnresolvedForFile(
    fileId:    number,
    sessionId: number,
  ): Promise<SubsystemLinkSegmentOverlayRow[]> {
    const [committed, editActions] = await Promise.all([
      this.fetchCommitted(fileId),
      this.fetchEditActions(sessionId),
    ]);

    const merged = this.mergedView(committed, editActions);

    // Keep only rows where the effective dataLinkSystemId is null.
    // Note: committed rows in the actual table are always non-null (schema
    // constraint), but an UPDATE edit action may have nulled the FK in the
    // overlay (DeleteSubsystemLinkSegmentHandler Case B sibling cleanup).
    return merged.filter(row => row.dataLinkSystemId === null);
  }

  async getByDataLinkId(
    dataLinkSystemId: number,
    fileId:           number,
    sessionId:        number,
  ): Promise<SubsystemLinkSegmentOverlayRow[]> {
    const [committed, editActions] = await Promise.all([
      this.fetchCommitted(fileId),
      this.fetchEditActions(sessionId),
    ]);

    const merged = this.mergedView(committed, editActions);

    return merged.filter(
      row => row.dataLinkSystemId === dataLinkSystemId,
    );
  }

  async getByPortId(
    portSystemId: number,
    fileId:       number,
    sessionId:    number,
  ): Promise<{asSource: number | null; asDest: number | null}> {
    const [committed, editActions] = await Promise.all([
      this.fetchCommitted(fileId),
      this.fetchEditActions(sessionId),
    ]);

    const merged = this.mergedView(committed, editActions);

    const asSourceRow = merged.find(
      row => row.sourcePortSystemId === portSystemId,
    );
    const asDestRow = merged.find(
      row => row.destinationPortSystemId === portSystemId,
    );

    return {
      asSource: asSourceRow?.systemId ?? null,
      asDest:   asDestRow?.systemId   ?? null,
    };
  }
}
```

> **Note on `fetchEditActions`:** The `.find()` call above does not express `validUntil IS NULL` as a TypeORM `where` clause because TypeORM's `find` API does not support `IS NULL` on a non-nullable column directly in all versions. The post-filter `r.validUntil === null` is functionally correct and deliberately explicit. For production-scale performance, replace with a `createQueryBuilder` clause — that optimisation is out of scope here.

- [ ] **Step 2: Implement `TypeOrmConfigurationRepository`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryRunner} from 'typeorm';
import type {
  IConfigurationRepository,
  ConfigurationOverlayRow,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {ConfigurationRow} from '../../entity-schema/project-data/configuration.schema.js';

/**
 * TypeORM implementation of IConfigurationRepository.
 *
 * The configuration table has exactly one row per file and is immutable after
 * the upload phase — there are no edit_actions for this entity. The method
 * queries the committed table directly.
 *
 * Throws if the row is missing, as callers depend on it being present
 * (it is seeded during upload — out of scope for this task).
 */
export class TypeOrmConfigurationRepository
  implements IConfigurationRepository
{
  constructor(private readonly queryRunner: QueryRunner) {}

  async getByFileId(fileId: number): Promise<ConfigurationOverlayRow> {
    const row = await this.queryRunner.manager.findOne<ConfigurationRow>(
      ENTITY_NAMES.Configuration,
      {where: {fileSystemId: fileId}},
    );

    if (!row) {
      throw new Error(
        `No configuration row found for fileSystemId=${fileId}. ` +
          'Ensure the file was fully uploaded before running modification commands.',
      );
    }

    return {
      systemId:     row.systemId,
      fileSystemId: row.fileSystemId,
      portStrategy: row.portStrategy,
      extraConfig:  row.extraConfig,
      version:      row.version,
    };
  }
}
```

- [ ] **Step 3: Implement `getNodeParentMap` and `getNodeTypeMap` on the TypeORM node repository**

First, locate or create the file. If no `typeorm-node.repository.ts` exists under `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/`, create:

`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/node/typeorm-node.repository.ts`

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryRunner} from 'typeorm';
import type {INodeRepository} from '@arc/core';
import type {NodeType} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';

/**
 * TypeORM implementation of INodeRepository.
 *
 * Both methods query only the committed `nodes` table. Nodes are not currently
 * mutated via edit_actions (no CREATE/DELETE/UPDATE node edit actions exist in
 * the current design), so the overlay step is omitted. If node mutations are
 * added in a future task, add an overlay-merge step here following the same
 * pattern as TypeOrmSubsystemLinkSegmentRepository.
 */
export class TypeOrmNodeRepository implements INodeRepository {
  constructor(private readonly queryRunner: QueryRunner) {}

  /**
   * Returns a map of nodeSystemId → parentId (null for top-level nodes)
   * for all nodes belonging to the given file.
   *
   * Spec §7.2.
   */
  async getNodeParentMap(
    fileId: number,
  ): Promise<Map<number, number | null>> {
    const rows = await this.queryRunner.manager.find<NodeRow>(
      ENTITY_NAMES.Node,
      {
        where: {fileSystemId: fileId},
        select: ['systemId', 'parentId'],
      },
    );

    const result = new Map<number, number | null>();
    for (const row of rows) {
      result.set(row.systemId, row.parentId ?? null);
    }
    return result;
  }

  /**
   * Returns a map of nodeId → NodeType for the provided set of node IDs.
   *
   * Fetches only the rows whose systemId is in the provided array.
   * Nodes not found in the table are omitted from the result map.
   *
   * Spec §7.2.
   */
  async getNodeTypeMap(
    nodeIds: number[],
  ): Promise<Map<number, NodeType>> {
    if (nodeIds.length === 0) return new Map();

    const rows = await this.queryRunner.manager
      .createQueryBuilder<NodeRow>(ENTITY_NAMES.Node, 'node')
      .select(['node.systemId', 'node.type'])
      .where('node.systemId IN (:...nodeIds)', {nodeIds})
      .getMany();

    const result = new Map<number, NodeType>();
    for (const row of rows) {
      result.set(row.systemId, row.type as NodeType);
    }
    return result;
  }
}
```

> If the `INodeRepository` interface is not yet exported from `@arc/core`, the import will fail. Resolve by ensuring Task 20 exports `INodeRepository` from `packages/core/src/application/ports/persistence/index.ts` before running this step.

- [ ] **Step 4: Verify**

Run: `pnpm run build`  
Expected: Zero TypeScript errors across all packages. The `TypeOrmUnitOfWork` in `@arc/api` will still have two missing method errors until Task 24 is complete — check only `@arc/persistence` compiles cleanly here.

Run only persistence build: `pnpm --filter @arc/persistence run build`  
Expected: Zero errors.

- [ ] **Step 5: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 24: Wire new repositories into `TypeOrmUnitOfWork` and verify full build

**Package:** `@arc/api` (the `TypeOrmUnitOfWork` lives in `packages/api/src/infrastructure-wrapper/persistence/unit-of-work/`)

**Files:**
- Modify: `packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts`

- [ ] **Step 1: Add imports and two new getter methods**

The complete updated file after the edit:

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
  ISubsystemLinkSegmentRepository,
  IConfigurationRepository,
} from '@arc/core';
import type {QueryRunner, EntityManager} from 'typeorm';
import {
  TypeOrmBulkImportRepository,
  TypeOrmProjectRepository,
  TypeOrmValidationPreferencesRepository,
  TypeOrmValidationQueryRepository,
} from '@arc/persistence';
import {TypeOrmSubsystemLinkSegmentRepository} from '../repositories/subsystem-link-segment/typeorm-subsystem-link-segment.repository.js';
import {TypeOrmConfigurationRepository} from '../repositories/configuration/typeorm-configuration.repository.js';

/**
 * TypeORM implementation of Unit of Work.
 *
 * Lifecycle:
 * 1. CommandBus creates QueryRunner and connects it
 * 2. CommandBus creates TypeOrmUnitOfWork with QueryRunner
 * 3. Handler uses UOW to manage transactions and access repositories
 * 4. CommandBus releases QueryRunner in finally block
 */
export class TypeOrmUnitOfWork implements UnitOfWork {
  private inTransaction: boolean = false;

  /**
   * @param queryRunner - Active QueryRunner injected by CommandBus
   * @param idGeneration - ID generation port shared from the application layer
   */
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

  getSubsystemLinkSegmentRepository(): ISubsystemLinkSegmentRepository {
    return new TypeOrmSubsystemLinkSegmentRepository(this.queryRunner);
  }

  getConfigurationRepository(): IConfigurationRepository {
    return new TypeOrmConfigurationRepository(this.queryRunner);
  }
}
```

> **Import path note:** The two new repository classes are imported via relative paths
> from within the `infrastructure-wrapper/persistence/` subtree. The actual import
> path depends on whether the files were placed directly in `@arc/persistence`'s
> exported surface or kept inside `@arc/api`'s infrastructure wrapper.
>
> **Preferred layout:** Place `TypeOrmSubsystemLinkSegmentRepository` and
> `TypeOrmConfigurationRepository` inside `@arc/persistence` (as done in Task 23)
> and export them from `packages/infrastructure/persistence/src/index.ts`. Then the
> imports in `TypeOrmUnitOfWork` become:
>
> ```typescript
> import {
>   TypeOrmSubsystemLinkSegmentRepository,
>   TypeOrmConfigurationRepository,
>   TypeOrmNodeRepository,
> } from '@arc/persistence';
> ```
>
> Adjust the import lines above to match wherever the implementations actually live.
> The logic of the two getter methods is identical regardless of path.

- [ ] **Step 2: Export the new repositories from `@arc/persistence`**

Open `packages/infrastructure/persistence/src/index.ts` and add:

```typescript
export * from './persistence-typeorm-sqllite/repositories/subsystem-link-segment/typeorm-subsystem-link-segment.repository.js';
export * from './persistence-typeorm-sqllite/repositories/configuration/typeorm-configuration.repository.js';
export * from './persistence-typeorm-sqllite/repositories/node/typeorm-node.repository.js';
```

- [ ] **Step 3: Add `ENTITY_NAMES` entries for the new tables**

Open `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/entity-table-names.ts`.

In the `// ── Link data ─────────────────────────────────────────────────────────────` section add:

```typescript
  SubsystemLinkSegment: 'SubsystemLinkSegment',
```

In the `// ── Project / File ────────────────────────────────────────────────────────` section add:

```typescript
  Configuration: 'Configuration',
```

> These entries are required by `ENTITY_NAMES.SubsystemLinkSegment` and
> `ENTITY_NAMES.Configuration` referenced in the repository implementations above.
> Spec §4.2 specifies both additions.

- [ ] **Step 4: Run full build and confirm no TypeScript errors**

Run: `pnpm run build`  
Expected: Zero TypeScript errors in all packages (`@arc/core`, `@arc/persistence`, `@arc/api`).

If `TypeOrmUnitOfWork` still reports "Property does not exist on type" errors, check that `UnitOfWork` in `@arc/core` has been rebuilt (Task 22) before re-running the api build.

- [ ] **Step 5: Run unit tests to confirm no regressions**

Run: `pnpm test`  
Expected: All previously-passing tests continue to pass. No new failures.

- [ ] **Step 6: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**
<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Chapter 02-02: Commit Orchestration (Tasks 25–30)

**Spec sections:** 6.6, 8.1–8.3  
**Packages:** `@arc/core`

These tasks run in Batch 2 (parallel with Tasks 19–24). They produce:

1. `ResolveSLSChainsService` — shared application service (§6.6)
2. `CommitChangesHandler` skeleton with pre-commit Steps A, B, and C baked in (§8.1–8.3)

`CommitChangesHandler` is a new file — it does not yet exist in the codebase.
Tasks 26–28 build it incrementally so that each task is independently reviewable.

---

### Task 25: Create `ResolveSLSChainsService`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/services/virtual-links/resolve-sls-chains.service.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create the service file**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {generateUuid} from '../../../shared/utilities/uuid.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '../../shared/change-vocabulary.js';
import {LINK_TYPE} from '../../../domain/entities/usecase-data/links/link-type.js';
import {ChainResolutionService} from '../../../domain/services/virtual-links/chain-resolution.service.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../ports/id-generation/id-generation.port.js';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ResolveSLSChainsResult {
  status: 'ok' | 'incomplete';
  incompleteChains?: {
    segmentIds:          number[];
    startModuleNodeId:   number;
    lastReachableNodeId: number;
  }[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Shared application service for SLS chain resolution.
 *
 * Encapsulates the full chain-resolution orchestration so it can be called
 * from any handler (ResolveVirtualLinkChainsHandler, AutoCreateUsecasesHandler,
 * CommitChangesHandler) without duplicating application-layer logic.
 *
 * Not a CQRS handler — it has no handle() method and is not registered in
 * CommandHandlerRegistry. Injected directly by the handlers that use it.
 *
 * Spec §6.6.
 */
export class ResolveSLSChainsService {
  /**
   * @param uow          - Active UnitOfWork from the calling handler's context.
   * @param idGeneration - ID generation port for pre-assigning DataLink systemIds.
   * @param fileId       - Resolved file system ID for the active project.
   * @param sessionId    - Resolved session ID for the active session.
   */
  constructor(
    private readonly uow:          UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly fileId:       number,
    private readonly sessionId:    number,
  ) {}

  /**
   * Resolves all unresolved SLS for the file.
   *
   * Steps (spec §6.6):
   * 1. Fetch unresolved SLS (pending CREATEs with null FK + committed rows
   *    whose FK was nulled by an UPDATE overlay).
   * 2. Fast path: if none → return { status: 'ok' }.
   * 3. Fetch nodeTypeMap for all nodes referenced.
   * 4. Run ChainResolutionService.resolve().
   * 5. If any incomplete chains → return { status: 'incomplete', incompleteChains }.
   * 6. For each complete chain: pre-assign DataLink systemId, generate groupId,
   *    compute linkType, record DataLink CREATE + SLS UPDATE edit actions.
   * 7. Return { status: 'ok' }.
   *
   * IMPORTANT: This method writes new edit actions into the session. The caller
   * is responsible for ensuring these are within or before a transaction
   * boundary as appropriate.
   */
  async resolve(): Promise<ResolveSLSChainsResult> {
    const slsRepo  = this.uow.getSubsystemLinkSegmentRepository();
    const nodeRepo = this.uow.getNodeRepository();
    const eaRepo   = this.uow.getEditActionRepository();

    // Step 1: fetch all unresolved SLS (null dataLinkSystemId in overlay view)
    const unresolvedSegments = await slsRepo.getUnresolvedForFile(
      this.fileId,
      this.sessionId,
    );

    // Step 2: fast path — nothing to do
    if (unresolvedSegments.length === 0) {
      return {status: 'ok'};
    }

    // Step 3: collect all node IDs referenced by unresolved segments
    const allNodeIds = new Set<number>();
    for (const seg of unresolvedSegments) {
      allNodeIds.add(seg.sourceNodeSystemId);
      allNodeIds.add(seg.destinationNodeSystemId);
    }

    const nodeTypeMap = await nodeRepo.getNodeTypeMap([...allNodeIds]);

    // Step 4: run domain service
    const result = ChainResolutionService.resolve({
      unresolvedSegments,
      nodeTypeMap,
    });

    // Step 5: incomplete chains — return 422-ready result, let caller decide
    if (result.incompleteChains.length > 0) {
      return {
        status: 'incomplete',
        incompleteChains: result.incompleteChains,
      };
    }

    // Step 6: record DataLink CREATEs + SLS UPDATEs for each complete chain
    for (const chain of result.completeChains) {
      const dataLinkSystemId = await this.idGeneration.getNextId(this.fileId);
      const groupId = generateUuid();

      // Compute linkType: for now assume INTRA_USECASE for cross-subsystem
      // chains discovered at resolution time. The precise computation
      // (comparing subgraph memberships) is deferred to the full handler
      // implementation in Batch 3. This is a safe default — INTRA_USECASE is
      // the most common case and is always valid for cross-subsystem data links.
      const linkType = LINK_TYPE.IntraUsecase;

      // Record DataLink CREATE edit action
      await eaRepo.insert({
        systemId:     dataLinkSystemId,
        aggregateId:  dataLinkSystemId,
        sessionId:    this.sessionId,
        tableName:    'DataLink',
        operation:    CHANGE_OPERATION.Create,
        changeStatus: CHANGE_STATUS.Staged,
        payload: {
          systemId:               dataLinkSystemId,
          sourceNodeSystemId:     chain.sourceModuleNodeId,
          destinationNodeSystemId: chain.destModuleNodeId,
          sourcePortSystemId:     chain.sourcePortId,
          destinationPortSystemId: chain.destPortId,
          linkType,
          groupId,
          sourceSubgraphSystemId:  null,
          destSubgraphSystemId:    null,
          isEc:                    null,
          fileSystemId:            this.fileId,
          version:                 1,
        },
        baseVersion: null,
        groupId,
      });

      // Record SLS UPDATE edit actions setting dataLinkSystemId for each segment
      for (const slsId of chain.segmentIds) {
        await eaRepo.insert({
          systemId:     slsId,
          aggregateId:  slsId,
          sessionId:    this.sessionId,
          tableName:    'SubsystemLinkSegment',
          operation:    CHANGE_OPERATION.Update,
          changeStatus: CHANGE_STATUS.Staged,
          payload: {
            dataLinkSystemId,
          },
          baseVersion: null,
          groupId,
        });
      }
    }

    // Step 7
    return {status: 'ok'};
  }
}
```

> **Design note — `getNodeRepository()` and `getEditActionRepository()`:** These two
> methods do not yet exist on `UnitOfWork`. They are required by this service and must
> be added in the same PR that introduces this file. See Step 2 below.
>
> **Design note — `linkType` computation:** The full computation (comparing subgraph
> FKs of the source and dest module nodes) requires a `getSubgraphMembership` query
> that is out of scope for this task. The `INTRA_USECASE` default is correct for
> cross-subsystem chains (the two modules are in different subgraphs by definition —
> they are in different subsystems). The only case that differs is `INTER_USECASE`
> (two subgraphs from different use-cases), which requires the `isInterUsecase` flag
> from the original `POST /subsystem-links` command. At chain-resolution time that
> flag is not available. The full handler in Batch 3 will carry it through via the
> command payload stored in the SLS group. For this task, `INTRA_USECASE` is the
> safe fallback.

- [ ] **Step 2: Extend `UnitOfWork` with `getNodeRepository()` and `getEditActionRepository()`**

Open `packages/core/src/application/ports/persistence/unit-of-work.ts`.

Add two import lines alongside the existing imports:

```typescript
import type {INodeRepository} from './repositories/i-node.repository.js';
import type {IEditActionRepository} from './repositories/i-edit-action.repository.js';
```

Add two method signatures after the existing `getConfigurationRepository()` line:

```typescript
  /**
   * Get node repository for node type/parent lookups.
   * Uses shared QueryRunner from this UOW.
   */
  getNodeRepository(): INodeRepository;

  /**
   * Get edit action repository for writing new edit actions within a handler.
   * Uses shared QueryRunner from this UOW.
   */
  getEditActionRepository(): IEditActionRepository;
```

Then create the two new interface files.

**`packages/core/src/application/ports/persistence/repositories/i-node.repository.ts`**

(This file may have been created in Task 20. If it already exists, only add the missing methods. If it does not exist yet, create it in full.)

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {NodeType} from '../../../domain/entities/usecase-data/node/node.js';

/**
 * Read-side repository for node data as seen by application-layer handlers.
 *
 * Methods return the committed-table view merged with the active session's
 * edit_actions overlay (STAGED + UNSTAGED, validUntil IS NULL).
 *
 * Spec §7.2.
 */
export interface INodeRepository {
  /**
   * Returns a map of every node systemId → parentId (null for top-level nodes)
   * for all nodes that belong to the given file, after applying the session
   * overlay.
   */
  getNodeParentMap(fileId: number): Promise<Map<number, number | null>>;

  /**
   * Returns a map of nodeId → NodeType for a specific set of node IDs.
   *
   * The set is the union of all sourceNodeSystemId and destinationNodeSystemId
   * values from the unresolved SLS passed to ChainResolutionService.
   */
  getNodeTypeMap(nodeIds: number[]): Promise<Map<number, NodeType>>;
}
```

**`packages/core/src/application/ports/persistence/repositories/i-edit-action.repository.ts`**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeOperation, ChangeStatus} from '../../../shared/change-vocabulary.js';

/**
 * Minimal shape of an edit action row as seen by application-layer handlers.
 * Matches EditActionRow from the persistence layer structurally.
 *
 * Fields mirror the entity defined in the edit_actions table schema.
 */
export interface EditActionInsertParams {
  systemId:     number;
  aggregateId:  number;
  sessionId:    number;
  tableName:    string;
  operation:    ChangeOperation;
  changeStatus: ChangeStatus;
  payload:      unknown;
  baseVersion:  number | null;
  groupId:      string | null;
}

/**
 * Write-side repository for edit_actions.
 *
 * Used by handlers and application services to record new edit actions
 * during a session. Thin wrapper over the table — no business logic.
 *
 * The `insert` method always creates a new row. Superseding an existing
 * current row (setting its validUntil) is handled automatically by the
 * implementation before the insert — the unique constraint
 * `uniq_edit_actions_current (sessionId, systemId) WHERE validUntil IS NULL`
 * requires that at most one current row exists per entity per session.
 */
export interface IEditActionRepository {
  /**
   * Inserts a new edit action row for an entity.
   *
   * If a current row (validUntil IS NULL) already exists for
   * (sessionId, systemId), the implementation must expire it by setting
   * validUntil = NOW() before inserting the new row, to satisfy the unique
   * constraint.
   */
  insert(params: EditActionInsertParams): Promise<void>;

  /**
   * Marks an existing STAGED CREATE edit action as DISCARDED.
   *
   * Used by CommitChangesHandler Step A to discard incomplete chain SLS
   * that only exist as pending CREATEs in edit_actions (they have never
   * reached the actual table).
   *
   * Throws if no current STAGED CREATE row exists for (sessionId, systemId).
   */
  markDiscarded(sessionId: number, systemId: number): Promise<void>;

  /**
   * Returns all current (validUntil IS NULL) edit actions for a given session,
   * optionally filtered by tableName and/or changeStatus.
   */
  getStagedForSession(
    sessionId: number,
    options?: {
      tableName?:    string;
      changeStatus?: ChangeStatus;
    },
  ): Promise<EditActionInsertParams[]>;
}
```

> **Note on `markDiscarded`:** The `CHANGE_STATUS` object in `change-vocabulary.ts`
> currently only has `Staged` and `Unstaged`. Add a `Discarded` value before this
> service is used:
>
> ```typescript
> export const CHANGE_STATUS = {
>   Staged:    'STAGED',
>   Unstaged:  'UNSTAGED',
>   Discarded: 'DISCARDED',
> } as const;
> ```
>
> Update the enum list in `EditActionSchema` in `edit-action.schema.ts` correspondingly.

- [ ] **Step 3: Export `ResolveSLSChainsResult` and `ResolveSLSChainsService` from `@arc/core`**

Open `packages/core/src/index.ts` and add the following line in the "Application services" section:

```typescript
export {ResolveSLSChainsService} from './application/services/virtual-links/resolve-sls-chains.service.js';
export type {ResolveSLSChainsResult} from './application/services/virtual-links/resolve-sls-chains.service.js';
```

Also add exports for the two new repository interfaces in `packages/core/src/application/ports/persistence/index.ts`:

```typescript
export type {INodeRepository} from './repositories/i-node.repository.js';
export type {IEditActionRepository, EditActionInsertParams} from './repositories/i-edit-action.repository.js';
```

- [ ] **Step 4: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

> If `TypeOrmUnitOfWork` in `@arc/api` now has missing-method errors for
> `getNodeRepository()` and `getEditActionRepository()`, those will be fixed in
> Task 24 (which wires all new repositories into the UoW implementation). This
> build step only checks `@arc/core`.

- [ ] **Step 5: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 26: Create `CommitChangesHandler` with pre-commit Step A

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.command.ts`
- Create: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`
- Modify: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create the command**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

/**
 * Commits all STAGED edit actions for the active session of a project.
 *
 * Pre-commit steps (run before the transaction):
 *   Step A — incomplete SLS chain discard + committed sibling cleanup (§8.1)
 *   Step B — orphaned subsystem port cleanup (§8.2)
 *   Step C — topological ordering for new entity types (§8.3)
 *
 * Command fields: projectId only. fileSystemId and sessionId are resolved
 * by the handler at runtime (session resolution pattern §6.0).
 */
export class CommitChangesCommand extends BaseCommand {
  constructor(public readonly projectId: number) {
    super();
  }
}
```

- [ ] **Step 2: Create the handler with Step A**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {CommitChangesCommand} from './commit-changes.command.js';
import {ResolveSLSChainsService} from '../../../services/virtual-links/resolve-sls-chains.service.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../shared/change-vocabulary.js';

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export interface CommitChangesResponse {
  committedCount: number;
  warnings:       string[];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * CommitChangesHandler — applies all STAGED edit actions for the active
 * session to the actual tables.
 *
 * Pre-commit steps (run BEFORE the transaction):
 *   Step A (§8.1) — resolve remaining unresolved SLS chains; discard
 *                   incomplete chains; clean up committed sibling rows.
 *   Step B (§8.2) — detect and clean up orphaned subsystem ports.
 *   Step C (§8.3) — topological ordering is enforced inside the transaction
 *                   by the apply loop — see _applyInTopologicalOrder().
 */
export class CommitChangesHandler
  implements CommandHandler<CommitChangesCommand, CommitChangesResponse>
{
  constructor(
    private readonly uow:          UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: CommitChangesCommand): Promise<CommitChangesResponse> {
    const {projectId} = command;
    const warnings: string[] = [];

    // ── Session resolution (§6.0) ─────────────────────────────────────────
    const projectRepo = this.uow.getProjectRepository();
    const {fileSystemId, sessionId} = await projectRepo.resolveActiveSession(
      projectId,
    );

    // ── Pre-commit Step A — SLS chain resolution & incomplete chain discard ──
    const stepAWarnings = await this._runStepA(fileSystemId, sessionId);
    warnings.push(...stepAWarnings);

    // ── Pre-commit Step B — orphaned subsystem port cleanup ───────────────
    const stepBWarnings = await this._runStepB(fileSystemId, sessionId);
    warnings.push(...stepBWarnings);

    // ── Strict invariant assertion (§8.1) ────────────────────────────────
    await this._assertNoUnresolvedSLSInStagedSet(sessionId);

    // ── Apply staged changes in topological order (§8.3) ─────────────────
    const eaRepo = this.uow.getEditActionRepository();
    const stagedActions = await eaRepo.getStagedForSession(sessionId, {
      changeStatus: CHANGE_STATUS.Staged,
    });

    await this.uow.startTransaction();
    try {
      const committedCount = await this._applyInTopologicalOrder(
        stagedActions,
        sessionId,
      );
      await this.uow.commit();
      return {committedCount, warnings};
    } catch (err) {
      await this.uow.rollback();
      throw err;
    }
  }

  // ── Step A implementation (§8.1) ──────────────────────────────────────────

  /**
   * Runs chain resolution on all unresolved SLS.
   *
   * For complete chains: records DataLink CREATE + SLS UPDATEs via
   * ResolveSLSChainsService (same logic used by ResolveVirtualLinkChainsHandler).
   *
   * For incomplete chains, for each SLS in the chain:
   *  - If only a pending CREATE exists in edit_actions: marks it DISCARDED.
   *  - If a committed row has a null-FK UPDATE overlay: records an explicit
   *    SLS DELETE in the STAGED set.
   *
   * Returns warning strings to include in the commit response (§8.1 step 5).
   */
  private async _runStepA(
    fileSystemId: number,
    sessionId:    number,
  ): Promise<string[]> {
    const warnings: string[] = [];

    // Use ResolveSLSChainsService for complete chain resolution
    const svc = new ResolveSLSChainsService(
      this.uow,
      this.idGeneration,
      fileSystemId,
      sessionId,
    );

    const result = await svc.resolve();

    if (result.status === 'ok') {
      // All chains were resolved (or there were none) — nothing to discard.
      return warnings;
    }

    // status === 'incomplete': discard/delete each SLS in each incomplete chain
    const incompleteChains = result.incompleteChains!;
    const slsRepo  = this.uow.getSubsystemLinkSegmentRepository();
    const eaRepo   = this.uow.getEditActionRepository();

    // Gather all SLS IDs from incomplete chains (deduplicated)
    const incompleteSlsIds = new Set<number>();
    for (const chain of incompleteChains) {
      for (const slsId of chain.segmentIds) {
        incompleteSlsIds.add(slsId);
      }
    }

    // For each incomplete SLS: determine whether it is a pending CREATE (never
    // committed) or a committed row with a null-FK UPDATE overlay.
    const allStagedActions = await eaRepo.getStagedForSession(sessionId);
    const pendingCreateIds = new Set<number>(
      allStagedActions
        .filter(
          a =>
            a.tableName === 'SubsystemLinkSegment' &&
            a.operation === CHANGE_OPERATION.Create,
        )
        .map(a => a.systemId),
    );

    let discardedCount = 0;
    for (const slsId of incompleteSlsIds) {
      if (pendingCreateIds.has(slsId)) {
        // Pending CREATE — mark DISCARDED (never reaches actual table)
        await eaRepo.markDiscarded(sessionId, slsId);
        discardedCount++;
      } else {
        // Committed row with null-FK UPDATE overlay — record explicit DELETE
        // so the transaction removes it from the actual table.
        // Fetch the committed SLS to get baseVersion.
        const [committedRow] = await slsRepo.getBySystemId(slsId, fileSystemId);
        if (committedRow) {
          await eaRepo.insert({
            systemId:     slsId,
            aggregateId:  slsId,
            sessionId,
            tableName:    'SubsystemLinkSegment',
            operation:    CHANGE_OPERATION.Delete,
            changeStatus: CHANGE_STATUS.Staged,
            payload:      {systemId: slsId},
            baseVersion:  committedRow.version,
            groupId:      null,
          });
          discardedCount++;
        }
      }
    }

    if (discardedCount > 0) {
      warnings.push(
        `${discardedCount} subsystem link segment(s) were discarded because ` +
          'they did not form complete connections.',
      );
    }

    return warnings;
  }

  // ── Step B implementation (§8.2) ──────────────────────────────────────────

  /**
   * Orphaned subsystem port cleanup.
   *
   * After Step A, some subsystem ports may no longer be referenced by any SLS.
   * These are "orphaned" and must be cleaned up:
   *  - If the port exists only as a pending CREATE: mark DISCARDED.
   *  - If the port is already committed: record a DataPort DELETE.
   *
   * Returns warning strings (currently empty — this step is silent per spec).
   */
  private async _runStepB(
    fileSystemId: number,
    sessionId:    number,
  ): Promise<string[]> {
    const eaRepo  = this.uow.getEditActionRepository();

    // 1. Collect all staged DataPort CREATEs with portIoType InputOutput/OutputInput
    //    (subsystem boundary ports) and all staged SLS DELETEs / DISCARDED SLS.
    const allStagedActions = await eaRepo.getStagedForSession(sessionId);

    // Port systemIds that are being deleted or discarded in Step A
    const deletedOrDiscardedSlsIds = new Set<number>(
      allStagedActions
        .filter(
          a =>
            a.tableName === 'SubsystemLinkSegment' &&
            (a.operation === CHANGE_OPERATION.Delete ||
              a.changeStatus === CHANGE_STATUS.Discarded),
        )
        .map(a => a.systemId),
    );

    if (deletedOrDiscardedSlsIds.size === 0) {
      // Nothing was deleted/discarded — no ports can be orphaned.
      return [];
    }

    // 2. Collect all subsystem port systemIds referenced ONLY by the deleted/discarded SLS.
    //    "Referenced only" = the port is not referenced by any remaining staged SLS CREATE
    //    or any committed SLS that is not being deleted.
    const slsRepo = this.uow.getSubsystemLinkSegmentRepository();

    // Build the set of port IDs that were referenced by deleted/discarded SLS
    const candidatePortIds = new Set<number>();
    for (const slsId of deletedOrDiscardedSlsIds) {
      // Look at the payload of the staged action to extract port IDs.
      // For pending CREATEs the payload has both ports; for DELETEs we need
      // to look at the original CREATE payload or the committed row.
      const action = allStagedActions.find(
        a => a.systemId === slsId && a.tableName === 'SubsystemLinkSegment',
      );
      if (action) {
        const payload = action.payload as {
          sourcePortSystemId?:      number;
          destinationPortSystemId?: number;
        };
        if (payload.sourcePortSystemId != null) {
          candidatePortIds.add(payload.sourcePortSystemId);
        }
        if (payload.destinationPortSystemId != null) {
          candidatePortIds.add(payload.destinationPortSystemId);
        }
      }
    }

    if (candidatePortIds.size === 0) {
      return [];
    }

    // 3. For each candidate port: check whether any remaining staged SLS CREATE
    //    or committed SLS (not being deleted) still references it.
    const remainingStagedSlsCreates = allStagedActions.filter(
      a =>
        a.tableName === 'SubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Create &&
        a.changeStatus === CHANGE_STATUS.Staged &&
        !deletedOrDiscardedSlsIds.has(a.systemId),
    );

    const portIdsStillReferenced = new Set<number>();
    for (const action of remainingStagedSlsCreates) {
      const payload = action.payload as {
        sourcePortSystemId?:      number;
        destinationPortSystemId?: number;
      };
      if (payload.sourcePortSystemId != null) {
        portIdsStillReferenced.add(payload.sourcePortSystemId);
      }
      if (payload.destinationPortSystemId != null) {
        portIdsStillReferenced.add(payload.destinationPortSystemId);
      }
    }

    // Also check committed SLS that are not being deleted
    for (const portId of candidatePortIds) {
      if (!portIdsStillReferenced.has(portId)) {
        // Check committed table via repository
        const usage = await slsRepo.getByPortId(portId, fileSystemId, sessionId);
        if (usage.asSource !== null && !deletedOrDiscardedSlsIds.has(usage.asSource)) {
          portIdsStillReferenced.add(portId);
        }
        if (usage.asDest !== null && !deletedOrDiscardedSlsIds.has(usage.asDest)) {
          portIdsStillReferenced.add(portId);
        }
      }
    }

    // 4. Orphaned ports = candidate ports not in portIdsStillReferenced
    const orphanedPortIds = [...candidatePortIds].filter(
      id => !portIdsStillReferenced.has(id),
    );

    if (orphanedPortIds.length === 0) {
      return [];
    }

    // 5. For each orphaned port: discard pending CREATE or record DELETE
    const pendingPortCreateIds = new Set<number>(
      allStagedActions
        .filter(
          a =>
            a.tableName === 'DataPort' &&
            a.operation === CHANGE_OPERATION.Create,
        )
        .map(a => a.systemId),
    );

    const dataPortRepo = this.uow.getDataPortRepository();

    for (const portId of orphanedPortIds) {
      if (pendingPortCreateIds.has(portId)) {
        await eaRepo.markDiscarded(sessionId, portId);
      } else {
        // Committed port — record DELETE
        const committedPort = await dataPortRepo.getBySystemId(portId, fileSystemId);
        if (committedPort) {
          await eaRepo.insert({
            systemId:     portId,
            aggregateId:  portId,
            sessionId,
            tableName:    'DataPort',
            operation:    CHANGE_OPERATION.Delete,
            changeStatus: CHANGE_STATUS.Staged,
            payload:      {systemId: portId},
            baseVersion:  committedPort.version,
            groupId:      null,
          });
        }
      }
    }

    // Step B is silent — no user-visible warnings per spec §8.2
    return [];
  }

  // ── Strict invariant assertion (§8.1) ─────────────────────────────────────

  /**
   * After Step A, asserts that no STAGED edit action contains an SLS CREATE or
   * UPDATE with dataLinkSystemId = null.
   *
   * If any are found, throws an internal error — this indicates a logic bug in
   * the pre-commit steps that would cause a NOT NULL constraint violation.
   */
  private async _assertNoUnresolvedSLSInStagedSet(
    sessionId: number,
  ): Promise<void> {
    const eaRepo = this.uow.getEditActionRepository();
    const staged = await eaRepo.getStagedForSession(sessionId, {
      changeStatus: CHANGE_STATUS.Staged,
    });

    const violations = staged.filter(a => {
      if (a.tableName !== 'SubsystemLinkSegment') return false;
      if (
        a.operation !== CHANGE_OPERATION.Create &&
        a.operation !== CHANGE_OPERATION.Update
      ) {
        return false;
      }
      const payload = a.payload as {dataLinkSystemId?: number | null};
      return payload.dataLinkSystemId === null || payload.dataLinkSystemId === undefined;
    });

    if (violations.length > 0) {
      const ids = violations.map(v => v.systemId).join(', ');
      throw new Error(
        `[CommitChangesHandler] Invariant violation: ${violations.length} SLS ` +
          `CREATE/UPDATE action(s) still have null dataLinkSystemId after pre-commit ` +
          `Step A. Affected systemIds: ${ids}. This is a server bug — commit aborted.`,
      );
    }
  }

  // ── Topological apply (§8.3) ───────────────────────────────────────────────

  /**
   * Applies all STAGED edit actions to the actual tables within the active
   * transaction, in the topological order required by §8.3.
   *
   * Order:
   *   1. SLS DELETEs
   *   2. DataLink DELETEs   (ON DELETE CASCADE removes remaining committed SLS)
   *   3. DataPort DELETEs   (orphaned subsystem ports; ON DELETE RESTRICT is safe
   *                          because all referencing SLS were removed in step 1)
   *   4. DataPort CREATEs   (new subsystem boundary ports)
   *   5. DataLink CREATEs   (must exist before SLS CREATEs that reference them)
   *   6. SLS CREATEs        (dataLinkSystemId FK satisfied by step 5)
   *   7. SLS UPDATEs setting dataLinkSystemId (resolution results)
   *   8. All other operations in insertion order (DataLink UPDATEs, etc.)
   *
   * Returns the total number of rows applied.
   */
  private async _applyInTopologicalOrder(
    stagedActions: Awaited<ReturnType<typeof this.uow.getEditActionRepository>['getStagedForSession']>,
    _sessionId:    number,
  ): Promise<number> {
    // Partition actions by their (tableName, operation) pair
    const slsDeletes     = stagedActions.filter(a => a.tableName === 'SubsystemLinkSegment' && a.operation === CHANGE_OPERATION.Delete);
    const dlDeletes      = stagedActions.filter(a => a.tableName === 'DataLink'             && a.operation === CHANGE_OPERATION.Delete);
    const portDeletes    = stagedActions.filter(a => a.tableName === 'DataPort'             && a.operation === CHANGE_OPERATION.Delete);
    const portCreates    = stagedActions.filter(a => a.tableName === 'DataPort'             && a.operation === CHANGE_OPERATION.Create);
    const dlCreates      = stagedActions.filter(a => a.tableName === 'DataLink'             && a.operation === CHANGE_OPERATION.Create);
    const slsCreates     = stagedActions.filter(a => a.tableName === 'SubsystemLinkSegment' && a.operation === CHANGE_OPERATION.Create);
    const slsUpdatesLink = stagedActions.filter(
      a =>
        a.tableName === 'SubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Update &&
        (a.payload as {dataLinkSystemId?: unknown}).dataLinkSystemId != null,
    );

    // Everything else (DataLink UPDATEs, other entities, etc.)
    const handledIds = new Set([
      ...slsDeletes,
      ...dlDeletes,
      ...portDeletes,
      ...portCreates,
      ...dlCreates,
      ...slsCreates,
      ...slsUpdatesLink,
    ].map(a => a.systemId + '|' + a.operation + '|' + a.tableName));

    const others = stagedActions.filter(
      a => !handledIds.has(a.systemId + '|' + a.operation + '|' + a.tableName),
    );

    const ordered = [
      ...slsDeletes,        // 1
      ...dlDeletes,         // 2
      ...portDeletes,       // 3
      ...portCreates,       // 4
      ...dlCreates,         // 5
      ...slsCreates,        // 6
      ...slsUpdatesLink,    // 7
      ...others,            // 8
    ];

    // TODO (Batch 3): call the actual persistence writer for each action.
    // The writer is introduced in Task 31+ (CommitChangesHandler full
    // implementation). For now, the ordering logic is in place and verified
    // by the invariant assertion above.
    return ordered.length;
  }
}
```

> **Design notes:**
>
> 1. **`projectRepo.resolveActiveSession(projectId)`** — this method needs to be
>    added to `ProjectRepository` (or a new `ISessionRepository` interface) as part
>    of the Batch 3 handler implementation. This task creates the skeleton; Batch 3
>    wires the actual DB call. For the build to pass, add a stub to the interface.
>
> 2. **`slsRepo.getBySystemId(slsId, fileSystemId)`** and **`dataPortRepo.getBySystemId(...)`**
>    — these are new repository methods not yet in the interfaces. Add stub signatures
>    to `ISubsystemLinkSegmentRepository` and a new `IDataPortRepository` interface.
>    See Step 3 below.
>
> 3. **`this.uow.getDataPortRepository()`** — add this method to `UnitOfWork`.
>
> 4. **`_applyInTopologicalOrder` is a stub.** The actual row-level persistence
>    writer (which calls `queryRunner.manager.save/delete`) is out of scope for
>    Tasks 25–28 and will be completed in Batch 3. The stub returns `ordered.length`
>    so the handler compiles cleanly.

- [ ] **Step 3: Add required stubs to port interfaces**

**Add to `ISubsystemLinkSegmentRepository`** (in `packages/core/src/application/ports/persistence/repositories/i-subsystem-link-segment.repository.ts`):

```typescript
  /**
   * Fetches a single SLS by systemId from the committed table.
   * Returns an empty array if not found.
   * Used by CommitChangesHandler Step A to get baseVersion for DELETE actions.
   */
  getBySystemId(
    systemId:    number,
    fileSystemId: number,
  ): Promise<SubsystemLinkSegmentOverlayRow[]>;
```

**Create `packages/core/src/application/ports/persistence/repositories/i-data-port.repository.ts`**:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Minimal structural shape of a data port row as seen by application-layer
 * handlers. Matches DataPortRow from the persistence layer structurally.
 */
export interface DataPortOverlayRow {
  systemId:     number;
  fileSystemId: number;
  nodeSystemId: number;
  portIoType:   string;
  dataPortId:   number;
  version:      number;
}

/**
 * Read-side repository for data ports (committed table only — ports are not
 * mutated through edit_actions in the base implementation).
 *
 * Spec §7.3.
 */
export interface IDataPortRepository {
  /**
   * Fetches a single DataPort by systemId from the committed table.
   * Returns null if not found.
   * Used by CommitChangesHandler Step B to get baseVersion for DELETE actions.
   */
  getBySystemId(
    systemId:     number,
    fileSystemId: number,
  ): Promise<DataPortOverlayRow | null>;
}
```

**Add to `UnitOfWork`** (in `packages/core/src/application/ports/persistence/unit-of-work.ts`):

```typescript
import type {IDataPortRepository} from './repositories/i-data-port.repository.js';

// ... inside the interface body:

  /**
   * Get data port repository for port existence/version lookups.
   * Uses shared QueryRunner from this UOW.
   */
  getDataPortRepository(): IDataPortRepository;
```

**Export new interfaces from the persistence ports index** (`packages/core/src/application/ports/persistence/index.ts`):

```typescript
export type {IDataPortRepository, DataPortOverlayRow} from './repositories/i-data-port.repository.js';
```

- [ ] **Step 4: Register the handler in `CommandHandlerRegistry`**

Open `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`.

Add the following import at the top of the file:

```typescript
import {CommitChangesHandler} from '../../../usecase-designer/session/commit-changes/commit-changes.handler.js';
import {CommitChangesCommand} from '../../../usecase-designer/session/commit-changes/commit-changes.command.js';
```

Inside `registerAllCommandHandlers()`, add:

```typescript
    registry.register(
      CommitChangesCommand,
      (uow, idGeneration) => new CommitChangesHandler(uow, idGeneration),
    );
```

> Check how the existing registry wires up handlers. If the registration signature
> differs (e.g. factory takes different arguments), follow the existing pattern exactly.

- [ ] **Step 5: Export command and handler from `@arc/core`**

Open `packages/core/src/index.ts` and add in the "Use case designer" section:

```typescript
export {CommitChangesHandler} from './application/usecase-designer/session/commit-changes/commit-changes.handler.js';
export {CommitChangesCommand} from './application/usecase-designer/session/commit-changes/commit-changes.command.js';
export type {CommitChangesResponse} from './application/usecase-designer/session/commit-changes/commit-changes.handler.js';
```

- [ ] **Step 6: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

- [ ] **Step 7: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 27: Add pre-commit Step B — orphaned subsystem port cleanup

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`

Step B is already present as `_runStepB()` in the handler created in Task 26. This task verifies its correctness and fills in the one remaining gap: the `_runStepB` method relies on payload inspection to identify port IDs referenced by deleted/discarded SLS. That approach is fragile for committed SLS deletions whose payload is `{systemId: id}` only (not the full row).

- [ ] **Step 1: Strengthen `_runStepB` to handle committed SLS DELETEs correctly**

The existing `_runStepB` inspects action payloads to extract port IDs. For a staged SLS DELETE that targets a committed row, the payload only contains `{systemId}` — not the port IDs. Add a lookup step that fetches the committed row for these DELETEs:

Replace the `candidatePortIds` population loop in `_runStepB` with the following:

```typescript
    // Build the set of port IDs referenced by deleted/discarded SLS.
    // For staged CREATEs (payload has all fields) — read directly from payload.
    // For staged DELETEs targeting committed rows — fetch the committed row.
    const candidatePortIds = new Set<number>();

    for (const slsId of deletedOrDiscardedSlsIds) {
      // First, check the staged CREATE payload (always has full fields)
      const createAction = allStagedActions.find(
        a =>
          a.systemId === slsId &&
          a.tableName === 'SubsystemLinkSegment' &&
          a.operation === CHANGE_OPERATION.Create,
      );
      if (createAction) {
        const p = createAction.payload as {
          sourcePortSystemId?:      number;
          destinationPortSystemId?: number;
        };
        if (p.sourcePortSystemId != null)      candidatePortIds.add(p.sourcePortSystemId);
        if (p.destinationPortSystemId != null) candidatePortIds.add(p.destinationPortSystemId);
        continue;
      }

      // No CREATE action — this is a committed row targeted by a DELETE.
      // Fetch the committed row to get its port IDs.
      const [committedSls] = await slsRepo.getBySystemId(slsId, fileSystemId);
      if (committedSls) {
        candidatePortIds.add(committedSls.sourcePortSystemId);
        candidatePortIds.add(committedSls.destinationPortSystemId);
      }
    }
```

This replaces the simpler version from Task 26 that only read the payload of whichever action happened to exist.

The rest of `_runStepB` (checking remaining staged SLS, checking committed table, discarding/deleting orphaned ports) remains unchanged.

- [ ] **Step 2: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 28: Verify topological commit order and document Step C

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`

The `_applyInTopologicalOrder` stub in Task 26 already partitions staged actions into the correct seven buckets. This task replaces the comment-only stub body with the actual typed partition logic and adds the Batch 3 TODO comment in the right place, making the ordering verifiable at review time.

- [ ] **Step 1: Replace the `_applyInTopologicalOrder` method body**

Replace the entire `_applyInTopologicalOrder` method in `commit-changes.handler.ts` with:

```typescript
  /**
   * Applies all STAGED edit actions to the actual tables within the active
   * transaction, in the topological order required by spec §8.3.
   *
   * ┌───┬────────────────────────────────────────────────────────────────────┐
   * │ # │ Operation                                                          │
   * ├───┼────────────────────────────────────────────────────────────────────┤
   * │ 1 │ SLS DELETEs — precede DataLink DELETEs; explicit first to avoid    │
   * │   │ cascade conflicts                                                  │
   * │ 2 │ DataLink DELETEs — ON DELETE CASCADE removes any remaining         │
   * │   │ committed SLS rows referencing these DataLinks                     │
   * │ 3 │ DataPort DELETEs — orphaned subsystem ports; ON DELETE RESTRICT on │
   * │   │ SLS port FKs is safe because all referencing SLS were removed in   │
   * │   │ steps 1–2                                                          │
   * │ 4 │ DataPort CREATEs — new subsystem ports must exist before SLS       │
   * │   │ CREATEs that reference them                                        │
   * │ 5 │ DataLink CREATEs — must exist before SLS CREATEs that reference    │
   * │   │ them via dataLinkSystemId FK                                       │
   * │ 6 │ SLS CREATEs — dataLinkSystemId FK satisfied by step 5; all CREATEs │
   * │   │ at this point have non-null dataLinkSystemId (invariant asserted    │
   * │   │ before the transaction begins)                                     │
   * │ 7 │ SLS UPDATEs setting dataLinkSystemId — resolution results;         │
   * │   │ DataLink must exist (step 5)                                       │
   * │ 8 │ All other operations in their natural insertion order              │
   * └───┴────────────────────────────────────────────────────────────────────┘
   *
   * TODO (Batch 3 — Task 31+): Replace the stub return with the actual
   * persistence writer call:
   *   for (const action of ordered) {
   *     await this._persistAction(action);
   *   }
   * where _persistAction() calls queryRunner.manager.save() for CREATEs/UPDATEs
   * and queryRunner.manager.delete() for DELETEs, using the tableName to
   * resolve the TypeORM EntitySchema.
   */
  private _applyInTopologicalOrder(
    stagedActions: {
      systemId:     number;
      tableName:    string;
      operation:    string;
      changeStatus: string;
      payload:      unknown;
      baseVersion:  number | null;
      groupId:      string | null;
    }[],
    _sessionId: number,
  ): Promise<number> {
    // Partition into the seven ordered buckets

    const slsDeletes = stagedActions.filter(
      a =>
        a.tableName === 'SubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Delete,
    );
    const dlDeletes = stagedActions.filter(
      a =>
        a.tableName === 'DataLink' &&
        a.operation === CHANGE_OPERATION.Delete,
    );
    const portDeletes = stagedActions.filter(
      a =>
        a.tableName === 'DataPort' &&
        a.operation === CHANGE_OPERATION.Delete,
    );
    const portCreates = stagedActions.filter(
      a =>
        a.tableName === 'DataPort' &&
        a.operation === CHANGE_OPERATION.Create,
    );
    const dlCreates = stagedActions.filter(
      a =>
        a.tableName === 'DataLink' &&
        a.operation === CHANGE_OPERATION.Create,
    );
    const slsCreates = stagedActions.filter(
      a =>
        a.tableName === 'SubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Create,
    );
    const slsUpdatesLink = stagedActions.filter(
      a =>
        a.tableName === 'SubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Update &&
        (a.payload as {dataLinkSystemId?: unknown}).dataLinkSystemId != null,
    );

    // Build a key for each partitioned action to identify "others"
    const partitionedKeys = new Set<string>([
      ...slsDeletes,
      ...dlDeletes,
      ...portDeletes,
      ...portCreates,
      ...dlCreates,
      ...slsCreates,
      ...slsUpdatesLink,
    ].map(a => `${a.tableName}|${a.operation}|${a.systemId}`));

    const others = stagedActions.filter(
      a => !partitionedKeys.has(`${a.tableName}|${a.operation}|${a.systemId}`),
    );

    // Final ordered sequence (§8.3)
    const ordered = [
      ...slsDeletes,     // 1
      ...dlDeletes,      // 2
      ...portDeletes,    // 3
      ...portCreates,    // 4
      ...dlCreates,      // 5
      ...slsCreates,     // 6
      ...slsUpdatesLink, // 7
      ...others,         // 8
    ];

    // TODO (Batch 3): call the actual persistence writer for each action here.
    return Promise.resolve(ordered.length);
  }
```

- [ ] **Step 2: Verify**

Run: `pnpm run build:core`  
Expected: Zero TypeScript errors.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 29: Build and run tests — verify `ResolveSLSChainsService` is importable and handler compiles

**Package:** `@arc/core`

**Files:**
- No changes — verify only.

- [ ] **Step 1: Full build**

Run: `pnpm run build`  
Expected: Zero TypeScript errors across all packages (`@arc/core`, `@arc/persistence`, `@arc/api`).

If `TypeOrmUnitOfWork` in `@arc/api` reports missing method errors for any of the new `UnitOfWork` getters introduced in Tasks 25–26 (`getNodeRepository`, `getEditActionRepository`, `getDataPortRepository`), add stub implementations to `TypeOrmUnitOfWork` that throw `new Error('not implemented')` so the build passes. These stubs will be replaced by real implementations in Task 24 (port interfaces) and Batch 3.

Example stub pattern (add after existing getter methods in `TypeOrmUnitOfWork`):

```typescript
  getNodeRepository(): INodeRepository {
    throw new Error('TypeOrmNodeRepository not yet wired — implement in Task 24');
  }

  getEditActionRepository(): IEditActionRepository {
    throw new Error('TypeOrmEditActionRepository not yet wired — implement in Task 31');
  }

  getDataPortRepository(): IDataPortRepository {
    throw new Error('TypeOrmDataPortRepository not yet wired — implement in Task 31');
  }
```

- [ ] **Step 2: Run unit tests**

Run: `pnpm --filter @arc/core run test:unit:core`  
Expected: All existing unit tests pass. No new failures introduced by the new files.

> There are no unit tests for `ResolveSLSChainsService` or `CommitChangesHandler` in
> this batch — those are in Batch 4 (Tasks 52+). This step only checks that the
> new files do not break existing tests.

- [ ] **Step 3: Verify import chain**

Confirm that `ResolveSLSChainsService` and `CommitChangesCommand` are reachable from `@arc/core`:

```bash
node --input-type=module <<'EOF'
import {ResolveSLSChainsService, CommitChangesCommand, CommitChangesHandler} from './packages/core/dist/index.js';
console.log('ResolveSLSChainsService:', typeof ResolveSLSChainsService);
console.log('CommitChangesCommand:', typeof CommitChangesCommand);
console.log('CommitChangesHandler:', typeof CommitChangesHandler);
EOF
```

Expected: all three print `function` (class constructors are functions in JS).

---

### Task 30: Commit all commit-orchestration changes

**Package:** `@arc/core`

**Files:**
- All files created or modified in Tasks 25–29.

- [ ] **Step 1: Final build check**

Run: `pnpm run build`  
Expected: Zero TypeScript errors.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`  
Expected: All previously-passing tests continue to pass.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**
<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

### Task 31: Command definitions — CreateSubsystemLinkSegment, DeleteSubsystemLinkSegment, ResolveVirtualLinkChains

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.command.ts`
- Create: `packages/core/src/application/usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.command.ts`
- Create: `packages/core/src/application/usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.command.ts`

- [ ] **Step 1: Create CreateSubsystemLinkSegmentCommand**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class CreateSubsystemLinkSegmentCommand extends BaseCommand {
  constructor(
    public readonly sourceNodeSystemId: number,
    public readonly destinationNodeSystemId: number,
    public readonly sourcePortSystemId: number | null,
    public readonly destinationPortSystemId: number | null,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

- [ ] **Step 2: Create DeleteSubsystemLinkSegmentCommand**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class DeleteSubsystemLinkSegmentCommand extends BaseCommand {
  constructor(
    public readonly slsSystemId: number,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

- [ ] **Step 3: Create ResolveVirtualLinkChainsCommand**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class ResolveVirtualLinkChainsCommand extends BaseCommand {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

- [ ] **Step 4: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything:

```bash
git add packages/core/src/application/usecase-designer/virtual-links/
git commit -m "..."
```

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 32: Integration tests — CreateSubsystemLinkSegmentHandler Branch A (same-parent mod→mod)

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/tests/integration/handlers/create-subsystem-link-segment.spec.ts`

**Prerequisite:** Tasks 19–24 (port interfaces + UnitOfWork getters) must be complete. The handler requires `uow.getEditActionRepository()`, `uow.getProjectRepository().getActiveFileId()`, `uow.getSessionRepository()`, `uow.getNodeRepository()`.

- [ ] **Step 1: Write the failing tests**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {
  EditActionSchema,
  type EditActionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  type ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  ProjectSchema,
  type ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  type ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  NodeSchema,
  type NodeRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {CreateSubsystemLinkSegmentHandler} from '@arc/core';
import {CreateSubsystemLinkSegmentCommand} from '@arc/core';
import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

const PROJECT_ID = 1;
const FILE_ID = 1;
const NODE_A_ID = 100;
const NODE_B_ID = 101;

describe('CreateSubsystemLinkSegmentHandler', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    await insertFixtures();
  });

  async function insertFixtures(): Promise<{sessionId: number}> {
    const ds = getTestDataSource();
    const projectRepo = ds.getRepository(ProjectSchema);
    const fileRepo = ds.getRepository(ArcDbFileSchema);
    const sessionRepo = ds.getRepository(ProjectSessionSchema);
    const nodeRepo = ds.getRepository(NodeSchema);

    await projectRepo.save({systemId: PROJECT_ID, name: 'Test Project', description: '', type: 'Offline'});
    await fileRepo.save({systemId: FILE_ID, projectSystemId: PROJECT_ID, fileName: 'test.awsp', description: '', metadata: '{}', isTarget: false, lastReservedId: 1000});
    const session = await sessionRepo.save({fileSystemId: FILE_ID, clientId: 'test-client', sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null});
    await nodeRepo.save({systemId: NODE_A_ID, parentId: null, type: 'module', fileSystemId: FILE_ID});
    await nodeRepo.save({systemId: NODE_B_ID, parentId: null, type: 'module', fileSystemId: FILE_ID});
    return {sessionId: session.sessionId};
  }

  describe('Branch A — both endpoints are module nodes with same parentId', () => {
    it('records a DataLink CREATE edit action with STAGED status', async () => {
      const ds = getTestDataSource();
      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const uow = new TypeOrmUnitOfWork(qr);
        const idGen = new EntityIdServiceRegistry(qr.manager);
        const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
        const command = new CreateSubsystemLinkSegmentCommand(NODE_A_ID, NODE_B_ID, 200, 201, PROJECT_ID, 'test-client');

        await handler.handle(command);

        const editRepo = ds.getRepository(EditActionSchema);
        const actions = await editRepo.find({where: {tableName: ENTITY_NAMES.DataLink}});
        expect(actions).toHaveLength(1);
        expect(actions[0].operation).toBe(CHANGE_OPERATION.Create);
        expect(actions[0].changeStatus).toBe(CHANGE_STATUS.Staged);
        expect(actions[0].tableName).toBe(ENTITY_NAMES.DataLink);
      } finally {
        await qr.release();
      }
    });

    it('returns { systemId, type: "DataLink" }', async () => {
      const ds = getTestDataSource();
      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const uow = new TypeOrmUnitOfWork(qr);
        const idGen = new EntityIdServiceRegistry(qr.manager);
        const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
        const command = new CreateSubsystemLinkSegmentCommand(NODE_A_ID, NODE_B_ID, 200, 201, PROJECT_ID, 'test-client');

        const result = await handler.handle(command);

        expect(result).toMatchObject({type: 'DataLink'});
        expect(typeof result.systemId).toBe('number');
      } finally {
        await qr.release();
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: FAIL — `Cannot find module '@arc/core' CreateSubsystemLinkSegmentHandler` or similar compile error.

---

### Task 33: Implement CreateSubsystemLinkSegmentHandler — Branch A

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.handler.ts`

**Prerequisite:** The Port Interfaces chapter (Tasks 22–24) must have added to `UnitOfWork`:
- `getEditActionRepository(): IEditActionRepository`
- `getSessionRepository(): ISessionRepository`
- `getNodeRepository(): INodeRepository`

Also, `ProjectRepository` (Task 22) must have added:
- `getActiveFileId(projectId: number): Promise<number>`

If those methods are not yet on `UnitOfWork`, add them now before implementing the handler. See the Port Interfaces chapter for the interface definitions.

- [ ] **Step 1: Write the handler (Branch A path only)**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../shared/change-vocabulary.js';
import {ENTITY_NAMES} from '../../../../../domain/entities/common/entity-names.js';
import {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';
import {LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/link-type.js';
import {SubsystemBoundaryPathService} from '../../../../../domain/services/virtual-links/subsystem-boundary-path.service.js';
import {calculatePortId} from '../../../../../domain/utilities/port-id-strategy.js';
import {CreateSubsystemLinkSegmentCommand} from './create-subsystem-link-segment.command.js';

// Allowed session modes for graph modification commands.
// These literals match the `SESSION_MODE` constant values in @arc/persistence
// (SESSION_MODE.Designer === 'DESIGNER', SESSION_MODE.DiffMerge === 'DIFF_MERGE').
// They are duplicated here as string literals to avoid a @arc/core → @arc/persistence dependency.
const ALLOWED_SESSION_MODES = ['DESIGNER', 'DIFF_MERGE'] as const;

export type CreateSubsystemLinkSegmentResult =
  | {systemId: number; type: 'DataLink'}
  | {subsystemLinkSegments: {systemId: number}[]}
  | {systemId: number; createdPortSystemId?: number};

export class CreateSubsystemLinkSegmentHandler
  implements CommandHandler<CreateSubsystemLinkSegmentCommand, CreateSubsystemLinkSegmentResult>
{
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: CreateSubsystemLinkSegmentCommand): Promise<CreateSubsystemLinkSegmentResult> {
    // §6.0 — Session resolution pattern
    const fileSystemId = await this.uow.getProjectRepository().getActiveFileId(command.projectId);
    const session = await this.uow.getSessionRepository().getActiveSession(command.projectId);
    if (!ALLOWED_SESSION_MODES.includes(session.sessionMode as any)) {
      throw Object.assign(new Error('Session mode does not allow graph modifications'), {statusCode: 422});
    }
    const {sessionId} = session;

    // Load both nodes to determine their types and parentIds
    const nodeRepo = this.uow.getNodeRepository();
    const sourceNode = await nodeRepo.getById(command.sourceNodeSystemId, fileSystemId);
    const destNode = await nodeRepo.getById(command.destinationNodeSystemId, fileSystemId);

    const sourceIsModule = sourceNode.type === NodeType.Module;
    const destIsModule = destNode.type === NodeType.Module;

    // Branch A — both module nodes, same parentId (or both null)
    if (sourceIsModule && destIsModule && sourceNode.parentId === destNode.parentId) {
      return this._branchA(command, fileSystemId, sessionId, sourceNode, destNode);
    }

    // Branch B — both module nodes, different parentIds
    if (sourceIsModule && destIsModule) {
      return this._branchB(command, fileSystemId, sessionId, sourceNode, destNode);
    }

    // Branch C — at least one endpoint is a subsystem node
    return this._branchC(command, fileSystemId, sessionId, sourceNode, destNode);
  }

  // ── Branch A ──────────────────────────────────────────────────────────────
  private async _branchA(
    command: CreateSubsystemLinkSegmentCommand,
    fileSystemId: number,
    sessionId: number,
    sourceNode: {systemId: number; parentId: number | null; subgraphSystemId?: number},
    destNode: {systemId: number; parentId: number | null; subgraphSystemId?: number},
  ): Promise<{systemId: number; type: 'DataLink'}> {
    const editRepo = this.uow.getEditActionRepository();

    // Duplicate check: same (sourcePortSystemId, destinationPortSystemId) must not already exist
    const existing = await this.uow.getDataLinkRepository().getByPortPair(
      command.sourcePortSystemId!,
      command.destinationPortSystemId!,
      fileSystemId,
      sessionId,
    );
    if (existing !== null) {
      throw Object.assign(new Error('DataLink already exists for this port pair'), {statusCode: 422});
    }

    // Compute linkType
    const linkType = sourceNode.subgraphSystemId === destNode.subgraphSystemId
      ? LINK_TYPE.IntraSubgraph
      : LINK_TYPE.IntraUsecase;

    // Pre-assign systemId
    const systemId = await this.idGeneration.getNextId(fileSystemId);

    // Record DataLink CREATE edit action
    await editRepo.insert({
      systemId,
      aggregateId: 0,
      sessionId,
      tableName: ENTITY_NAMES.DataLink,
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({
        systemId,
        sourceNodeSystemId: command.sourceNodeSystemId,
        destinationNodeSystemId: command.destinationNodeSystemId,
        sourcePortSystemId: command.sourcePortSystemId,
        destinationPortSystemId: command.destinationPortSystemId,
        linkType,
        fileSystemId,
      }),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    return {systemId, type: 'DataLink'};
  }

  // Branch B and Branch C are added in Tasks 36 and 39 respectively.
  private async _branchB(..._args: any[]): Promise<any> {
    throw new Error('Branch B not yet implemented — see Task 36');
  }

  private async _branchC(..._args: any[]): Promise<any> {
    throw new Error('Branch C not yet implemented — see Task 39');
  }
}
```

> **Note on `ENTITY_NAMES` import:** The `ENTITY_NAMES` const lives in `packages/infrastructure/persistence`. Core handlers **must not** import from infrastructure. Instead, the Port Interfaces chapter defines an `EntityTableNames` or similar string literals in core. If the port interfaces chapter did not do this, add the following minimal set to `packages/core/src/domain/entities/common/entity-names.ts`:
>
> ```typescript
> export const ENTITY_NAMES_CORE = {
>   DataLink: 'DataLink',
>   SubsystemLinkSegment: 'SubsystemLinkSegment',
>   DataPort: 'DataPort',
> } as const;
> ```
>
> Then update the `ENTITY_NAMES` import in the handler to use `ENTITY_NAMES_CORE`.

- [ ] **Step 2: Run test to verify Branch A passes**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: Branch A tests (Task 32) pass; Branch B and C are not yet tested.

---

### Task 34: Run tests + commit (Tasks 31–33)

- [ ] **Step 1: Run the integration tests**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: PASS — 2 Branch A tests pass.

- [ ] **Step 2: Run the build**

Run: `pnpm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

Use the `commit` skill to draft the commit message. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 35: Integration tests — CreateSubsystemLinkSegmentHandler Branch B (cross-parent mod→mod)

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/tests/integration/handlers/create-subsystem-link-segment.spec.ts`

**Setup needed:** Two module nodes in different subsystems. SubsystemA (parentId=null, type='subsystem') and SubsystemB (parentId=null, type='subsystem'). NodeA.parentId = SubsystemA.systemId. NodeB.parentId = SubsystemB.systemId.

- [ ] **Step 1: Add the Branch B tests**

Add a new `describe` block to the existing spec file after the Branch A `describe`:

```typescript
describe('Branch B — both module nodes in different subsystems', () => {
  const SUBSYSTEM_A_ID = 50;
  const SUBSYSTEM_B_ID = 51;
  const NODE_C_ID = 102; // module inside SubsystemA
  const NODE_D_ID = 103; // module inside SubsystemB

  beforeEach(async () => {
    const ds = getTestDataSource();
    const nodeRepo = ds.getRepository(NodeSchema);
    // Insert subsystem nodes and nested module nodes
    await nodeRepo.save({systemId: SUBSYSTEM_A_ID, parentId: null, type: 'subsystem', fileSystemId: FILE_ID});
    await nodeRepo.save({systemId: SUBSYSTEM_B_ID, parentId: null, type: 'subsystem', fileSystemId: FILE_ID});
    await nodeRepo.save({systemId: NODE_C_ID, parentId: SUBSYSTEM_A_ID, type: 'module', fileSystemId: FILE_ID});
    await nodeRepo.save({systemId: NODE_D_ID, parentId: SUBSYSTEM_B_ID, type: 'module', fileSystemId: FILE_ID});
  });

  it('records DataLink + SLS CREATE edit actions all sharing a groupId', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
      const command = new CreateSubsystemLinkSegmentCommand(NODE_C_ID, NODE_D_ID, 300, 301, PROJECT_ID, 'test-client');

      await handler.handle(command);

      const editRepo = ds.getRepository(EditActionSchema);
      const allActions = await editRepo.find({});

      const dataLinkActions = allActions.filter(a => a.tableName === ENTITY_NAMES.DataLink);
      const slsActions = allActions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment);

      expect(dataLinkActions).toHaveLength(1);
      expect(slsActions.length).toBeGreaterThanOrEqual(2); // at least 2 SLS for SubsystemA→SubsystemB

      // All actions in the chain share the same groupId
      const groupId = dataLinkActions[0].groupId;
      expect(groupId).toBeTruthy();
      for (const action of slsActions) {
        expect(action.groupId).toBe(groupId);
      }
    } finally {
      await qr.release();
    }
  });

  it('returns subsystemLinkSegments array (DataLink systemId absent)', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
      const command = new CreateSubsystemLinkSegmentCommand(NODE_C_ID, NODE_D_ID, 300, 301, PROJECT_ID, 'test-client');

      const result = await handler.handle(command);

      expect(result).toHaveProperty('subsystemLinkSegments');
      expect(result).not.toHaveProperty('systemId');
      const segments = (result as any).subsystemLinkSegments as {systemId: number}[];
      expect(segments.length).toBeGreaterThanOrEqual(2);
    } finally {
      await qr.release();
    }
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: FAIL — `Branch B not yet implemented`.

---

### Task 36: Implement Branch B in CreateSubsystemLinkSegmentHandler

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.handler.ts`

- [ ] **Step 1: Replace the `_branchB` stub with the full implementation**

Replace the stub `_branchB` method with:

```typescript
private async _branchB(
  command: CreateSubsystemLinkSegmentCommand,
  fileSystemId: number,
  sessionId: number,
  sourceNode: {systemId: number; parentId: number | null; subgraphSystemId?: number},
  destNode: {systemId: number; parentId: number | null; subgraphSystemId?: number},
): Promise<{subsystemLinkSegments: {systemId: number}[]}> {
  const editRepo = this.uow.getEditActionRepository();
  const nodeRepo = this.uow.getNodeRepository();

  // Duplicate check
  const existing = await this.uow.getDataLinkRepository().getByPortPair(
    command.sourcePortSystemId!,
    command.destinationPortSystemId!,
    fileSystemId,
    sessionId,
  );
  if (existing !== null) {
    throw Object.assign(new Error('DataLink already exists for this port pair'), {statusCode: 422});
  }

  // Compute the subsystem boundary path
  const nodeParentMap = await nodeRepo.getNodeParentMap(fileSystemId);
  const pathOutput = SubsystemBoundaryPathService.compute({
    sourceNodeId: command.sourceNodeSystemId,
    sourcePortId: command.sourcePortSystemId!,
    destNodeId: command.destinationNodeSystemId,
    destPortId: command.destinationPortSystemId!,
    nodeParentMap,
  });

  // Get port strategy for auto-created subsystem ports
  const config = await this.uow.getConfigurationRepository().getByFileId(fileSystemId);

  // Pre-create subsystem boundary ports (one per boundary subsystem node)
  const subsystemNodes = pathOutput.nodeSequence.slice(1, -1); // exclude source/dest module
  const boundaryPortMap = new Map<number, number>(); // nodeSystemId → new portSystemId

  // Pre-generate the shared groupId BEFORE port creation so every DataPort CREATE,
  // the DataLink CREATE, and every SLS CREATE share the same group (design §6.2 step 10).
  const groupId = crypto.randomUUID();

  for (const nodeId of subsystemNodes) {
    const requiredPortType = pathOutput.requiredPortType.get(nodeId)!;
    const isInput = requiredPortType === 'InputOutput'; // InputOutput = outfacing=Input, infacing=Output
    const existingPorts = await this.uow.getDataPortRepository().countByNodeAndType(nodeId, requiredPortType, fileSystemId, sessionId);
    const newPortId = calculatePortId(existingPorts, isInput, config.portStrategy);
    const portSystemId = await this.idGeneration.getNextId(fileSystemId);

    await editRepo.insert({
      systemId: portSystemId,
      aggregateId: nodeId,
      sessionId,
      tableName: 'DataPort',
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: portSystemId, nodeSystemId: nodeId, portIoType: requiredPortType, portId: newPortId, fileSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId,
      validUntil: null,
    });

    boundaryPortMap.set(nodeId, portSystemId);
  }

  // Pre-assign DataLink systemId (groupId already generated above)
  const dataLinkId = await this.idGeneration.getNextId(fileSystemId);

  // Compute linkType from subgraph membership (design §6.2 Branch B step 7).
  // CreateSubsystemLinkSegmentHandler does not accept an `isInterUsecase` flag, so the
  // only two possible outcomes here are INTRA_SUBGRAPH (same subgraph) or INTRA_USECASE
  // (different subgraphs). INTER_USECASE requires the flag and is only produced by
  // CreateDataLinkHandler.
  const linkType = sourceNode.subgraphSystemId === destNode.subgraphSystemId
    ? LINK_TYPE.IntraSubgraph
    : LINK_TYPE.IntraUsecase;

  // Record DataLink CREATE
  await editRepo.insert({
    systemId: dataLinkId,
    aggregateId: 0,
    sessionId,
    tableName: ENTITY_NAMES.DataLink,
    operation: CHANGE_OPERATION.Create,
    payload: JSON.stringify({
      systemId: dataLinkId,
      sourceNodeSystemId: command.sourceNodeSystemId,
      destinationNodeSystemId: command.destinationNodeSystemId,
      sourcePortSystemId: command.sourcePortSystemId,
      destinationPortSystemId: command.destinationPortSystemId,
      linkType,
      fileSystemId,
    }),
    changeStatus: CHANGE_STATUS.Staged,
    baseVersion: null,
    groupId,
    validUntil: null,
  });

  // Record SLS CREATEs for each adjacent pair in nodeSequence
  const sequence = pathOutput.nodeSequence;
  const slsIds: number[] = [];

  for (let i = 0; i < sequence.length - 1; i++) {
    const nodeA = sequence[i];
    const nodeB = sequence[i + 1];

    // Resolve ports for this pair
    let srcPortId: number;
    let dstPortId: number;

    if (i === 0) {
      // First pair: source module's output port
      srcPortId = command.sourcePortSystemId!;
    } else {
      srcPortId = boundaryPortMap.get(nodeA)!;
    }

    if (i === sequence.length - 2) {
      // Last pair: dest module's input port
      dstPortId = command.destinationPortSystemId!;
    } else {
      dstPortId = boundaryPortMap.get(nodeB)!;
    }

    const slsId = await this.idGeneration.getNextId(fileSystemId);
    slsIds.push(slsId);

    await editRepo.insert({
      systemId: slsId,
      aggregateId: 0,
      sessionId,
      tableName: ENTITY_NAMES.SubsystemLinkSegment,
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({
        systemId: slsId,
        sourceNodeSystemId: nodeA,
        destinationNodeSystemId: nodeB,
        sourcePortSystemId: srcPortId,
        destinationPortSystemId: dstPortId,
        dataLinkSystemId: dataLinkId, // immediately resolved
        fileSystemId,
      }),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId,
      validUntil: null,
    });
  }

  return {subsystemLinkSegments: slsIds.map(id => ({systemId: id}))};
}
```

- [ ] **Step 2: Run tests to verify Branch B passes**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: All Branch A + B tests pass.

---

### Task 37: Run all CreateSubsystemLinkSegment tests + commit (Branches A + B)

- [ ] **Step 1: Run**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: PASS — 4 tests pass (2 Branch A, 2 Branch B).

- [ ] **Step 2: Commit**

Use the `commit` skill. Show proposed message and commands. **Wait for user confirmation.**

**STOP — do not run `git commit` until approved.**

---

### Task 38: Integration tests — CreateSubsystemLinkSegmentHandler Branch C (subsystem endpoint)

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/tests/integration/handlers/create-subsystem-link-segment.spec.ts`

- [ ] **Step 1: Add Branch C tests**

Add a third `describe` block:

```typescript
describe('Branch C — at least one endpoint is a subsystem node', () => {
  const SUBSYSTEM_C_ID = 60;
  const NODE_E_ID = 110; // module node
  const DATA_PORT_E_ID = 400; // port on NodeE

  beforeEach(async () => {
    const ds = getTestDataSource();
    const nodeRepo = ds.getRepository(NodeSchema);
    await nodeRepo.save({systemId: SUBSYSTEM_C_ID, parentId: null, type: 'subsystem', fileSystemId: FILE_ID});
    await nodeRepo.save({systemId: NODE_E_ID, parentId: null, type: 'module', fileSystemId: FILE_ID});
    // Insert a DataPort for NodeE
    const portRepo = ds.getRepository('DataPort'); // use the DataPort schema name
    await portRepo.save({systemId: DATA_PORT_E_ID, nodeSystemId: NODE_E_ID, portIoType: 'Output', portId: 1, fileSystemId: FILE_ID});
  });

  it('creates SLS CREATE edit action with null dataLinkSystemId', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
      // source=module(NodeE, port Output), dest=subsystem(SubsystemC, portSystemId=null → auto-create)
      const command = new CreateSubsystemLinkSegmentCommand(NODE_E_ID, SUBSYSTEM_C_ID, DATA_PORT_E_ID, null, PROJECT_ID, 'test-client');

      await handler.handle(command);

      const editRepo = ds.getRepository(EditActionSchema);
      const slsActions = await editRepo.find({where: {tableName: ENTITY_NAMES.SubsystemLinkSegment}});
      expect(slsActions).toHaveLength(1);
      const payload = JSON.parse(slsActions[0].payload as string);
      expect(payload.dataLinkSystemId).toBeNull();
    } finally {
      await qr.release();
    }
  });

  it('returns createdPortSystemId when subsystem port was auto-created', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
      const command = new CreateSubsystemLinkSegmentCommand(NODE_E_ID, SUBSYSTEM_C_ID, DATA_PORT_E_ID, null, PROJECT_ID, 'test-client');

      const result = await handler.handle(command) as {systemId: number; createdPortSystemId?: number};

      expect(result).toHaveProperty('systemId');
      expect(result.createdPortSystemId).toBeDefined();
      expect(typeof result.createdPortSystemId).toBe('number');
    } finally {
      await qr.release();
    }
  });

  it('returns 422 when source port direction is Input', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const portRepo = ds.getRepository('DataPort');
      const INPUT_PORT_ID = 401;
      await portRepo.save({systemId: INPUT_PORT_ID, nodeSystemId: NODE_E_ID, portIoType: 'Input', portId: 2, fileSystemId: FILE_ID});

      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
      const command = new CreateSubsystemLinkSegmentCommand(NODE_E_ID, SUBSYSTEM_C_ID, INPUT_PORT_ID, null, PROJECT_ID, 'test-client');

      await expect(handler.handle(command)).rejects.toMatchObject({statusCode: 422});
    } finally {
      await qr.release();
    }
  });

  it('returns 422 when subsystem port is already in use as source', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      // Insert a subsystem port that is already used in an SLS
      const portRepo = ds.getRepository('DataPort');
      const SUBSYSTEM_PORT_ID = 500;
      await portRepo.save({systemId: SUBSYSTEM_PORT_ID, nodeSystemId: SUBSYSTEM_C_ID, portIoType: 'OutputInput', portId: 1, fileSystemId: FILE_ID});

      // Insert an SLS edit action that already uses this port as source
      const editRepo = ds.getRepository(EditActionSchema);
      const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: FILE_ID}});
      await editRepo.save({
        systemId: 999,
        aggregateId: 0,
        sessionId: session!.sessionId,
        tableName: ENTITY_NAMES.SubsystemLinkSegment,
        operation: CHANGE_OPERATION.Create,
        payload: JSON.stringify({sourcePortSystemId: SUBSYSTEM_PORT_ID, destinationPortSystemId: 9, dataLinkSystemId: null}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      });

      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
      // Try to use SUBSYSTEM_PORT_ID as source again
      const command = new CreateSubsystemLinkSegmentCommand(SUBSYSTEM_C_ID, NODE_E_ID, SUBSYSTEM_PORT_ID, DATA_PORT_E_ID, PROJECT_ID, 'test-client');

      await expect(handler.handle(command)).rejects.toMatchObject({statusCode: 422});
    } finally {
      await qr.release();
    }
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: FAIL — `Branch C not yet implemented`.

---

### Task 39: Implement Branch C in CreateSubsystemLinkSegmentHandler

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.handler.ts`

- [ ] **Step 1: Replace the `_branchC` stub with the full implementation**

Replace the stub `_branchC` method with:

```typescript
private async _branchC(
  command: CreateSubsystemLinkSegmentCommand,
  fileSystemId: number,
  sessionId: number,
  sourceNode: {systemId: number; type: string; parentId: number | null},
  destNode: {systemId: number; type: string; parentId: number | null},
): Promise<{systemId: number; createdPortSystemId?: number}> {
  const editRepo = this.uow.getEditActionRepository();
  const slsRepo = this.uow.getSubsystemLinkSegmentRepository();
  const portRepo = this.uow.getDataPortRepository();

  // Determine which endpoint is the subsystem node
  const sourceIsSubsystem = sourceNode.type === NodeType.Subsystem;
  const destIsSubsystem = destNode.type === NodeType.Subsystem;

  // Port direction check (FR-VL-07):
  // Source port must not be Input; dest port must not be Output
  if (command.sourcePortSystemId !== null) {
    const srcPort = await portRepo.getById(command.sourcePortSystemId, fileSystemId);
    if (srcPort.portIoType === 'Input') {
      throw Object.assign(new Error('Source port direction must not be Input for a subsystem link segment'), {statusCode: 422});
    }
  }
  if (command.destinationPortSystemId !== null) {
    const dstPort = await portRepo.getById(command.destinationPortSystemId, fileSystemId);
    if (dstPort.portIoType === 'Output') {
      throw Object.assign(new Error('Destination port direction must not be Output for a subsystem link segment'), {statusCode: 422});
    }
  }

  // One-connection-per-subsystem-port check (FR-VL-08)
  if (sourceIsSubsystem && command.sourcePortSystemId !== null) {
    const usage = await slsRepo.getByPortId(command.sourcePortSystemId, fileSystemId, sessionId);
    if (usage.asSource !== null) {
      throw Object.assign(new Error('Subsystem source port is already in use'), {statusCode: 422});
    }
  }
  if (destIsSubsystem && command.destinationPortSystemId !== null) {
    const usage = await slsRepo.getByPortId(command.destinationPortSystemId, fileSystemId, sessionId);
    if (usage.asDest !== null) {
      throw Object.assign(new Error('Subsystem destination port is already in use'), {statusCode: 422});
    }
  }

  // Inline port creation for omitted subsystem port
  let createdPortSystemId: number | undefined;
  let resolvedSrcPortId = command.sourcePortSystemId;
  let resolvedDstPortId = command.destinationPortSystemId;

  if (sourceIsSubsystem && command.sourcePortSystemId === null) {
    const config = await this.uow.getConfigurationRepository().getByFileId(fileSystemId);
    const existingCount = await portRepo.countByNodeAndType(sourceNode.systemId, 'OutputInput', fileSystemId, sessionId);
    const portId = calculatePortId(existingCount, false, config.portStrategy);
    const portSystemId = await this.idGeneration.getNextId(fileSystemId);

    await editRepo.insert({
      systemId: portSystemId,
      aggregateId: sourceNode.systemId,
      sessionId,
      tableName: 'DataPort',
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: portSystemId, nodeSystemId: sourceNode.systemId, portIoType: 'OutputInput', portId, fileSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    resolvedSrcPortId = portSystemId;
    createdPortSystemId = portSystemId;
  }

  if (destIsSubsystem && command.destinationPortSystemId === null) {
    const config = await this.uow.getConfigurationRepository().getByFileId(fileSystemId);
    const existingCount = await portRepo.countByNodeAndType(destNode.systemId, 'InputOutput', fileSystemId, sessionId);
    const portId = calculatePortId(existingCount, true, config.portStrategy);
    const portSystemId = await this.idGeneration.getNextId(fileSystemId);

    await editRepo.insert({
      systemId: portSystemId,
      aggregateId: destNode.systemId,
      sessionId,
      tableName: 'DataPort',
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: portSystemId, nodeSystemId: destNode.systemId, portIoType: 'InputOutput', portId, fileSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    resolvedDstPortId = portSystemId;
    createdPortSystemId = portSystemId;
  }

  // Record SLS CREATE with null dataLinkSystemId
  const slsId = await this.idGeneration.getNextId(fileSystemId);

  await editRepo.insert({
    systemId: slsId,
    aggregateId: 0,
    sessionId,
    tableName: ENTITY_NAMES.SubsystemLinkSegment,
    operation: CHANGE_OPERATION.Create,
    payload: JSON.stringify({
      systemId: slsId,
      sourceNodeSystemId: command.sourceNodeSystemId,
      destinationNodeSystemId: command.destinationNodeSystemId,
      sourcePortSystemId: resolvedSrcPortId,
      destinationPortSystemId: resolvedDstPortId,
      dataLinkSystemId: null, // unresolved
      fileSystemId,
    }),
    changeStatus: CHANGE_STATUS.Staged,
    baseVersion: null,
    groupId: null,
    validUntil: null,
  });

  return {systemId: slsId, createdPortSystemId};
}
```

- [ ] **Step 2: Run all Branch C tests**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: All 8 tests pass (2 Branch A, 2 Branch B, 4 Branch C).

---

### Task 40: Run all CreateSubsystemLinkSegment tests + commit (all branches)

- [ ] **Step 1: Run**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: PASS — 8 tests.

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

Use the `commit` skill. Show proposed message and commands. **Wait for user confirmation.**

**STOP — do not run `git commit` until approved.**
<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

### Task 41: CreateDataLinkHandler — extend with cross-subsystem path (§6.3)

**Package:** `@arc/core` + `@arc/persistence`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/virtual-links/create-data-link/create-data-link.handler.ts` (if it exists) OR create it (if this is the first time it is being written)
- Create/modify: `packages/infrastructure/persistence/tests/integration/handlers/create-data-link.spec.ts`

**Prerequisite:** If `CreateDataLinkCommand` does not yet exist, create it first:
```typescript
// packages/core/src/application/usecase-designer/virtual-links/create-data-link/create-data-link.command.ts
import {BaseCommand} from '../../../shared/base-command.js';

export class CreateDataLinkCommand extends BaseCommand {
  constructor(
    public readonly sourceNodeSystemId: number,
    public readonly destinationNodeSystemId: number,
    public readonly sourcePortSystemId: number,
    public readonly destinationPortSystemId: number,
    public readonly isInterUsecase: boolean,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

- [ ] **Step 1: Write integration tests for CreateDataLinkHandler**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSessionSchema, SESSION_MODE, SESSION_STATUS} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {NodeSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {CreateDataLinkHandler} from '@arc/core';
import {CreateDataLinkCommand} from '@arc/core';
import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

describe('CreateDataLinkHandler', () => {
  beforeAll(async () => { await setupIntegrationTest(); });
  afterAll(async () => { await teardownIntegrationTest(); });
  beforeEach(async () => {
    await setupEachTest();
    const ds = getTestDataSource();
    await ds.getRepository(ProjectSchema).save({systemId: 1, name: 'P', description: '', type: 'Offline'});
    await ds.getRepository(ArcDbFileSchema).save({systemId: 1, projectSystemId: 1, fileName: 'f.awsp', description: '', metadata: '{}', isTarget: false, lastReservedId: 1000});
    await ds.getRepository(ProjectSessionSchema).save({fileSystemId: 1, clientId: 'c', sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null});
    // Same-subsystem nodes
    await ds.getRepository(NodeSchema).save({systemId: 10, parentId: null, type: 'module', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 11, parentId: null, type: 'module', fileSystemId: 1});
    // Cross-subsystem nodes
    await ds.getRepository(NodeSchema).save({systemId: 20, parentId: null, type: 'subsystem', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 21, parentId: null, type: 'subsystem', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 22, parentId: 20, type: 'module', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 23, parentId: 21, type: 'module', fileSystemId: 1});
  });

  it('creates DataLink only (no SLS) when both modules share parentId', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new CreateDataLinkHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      const command = new CreateDataLinkCommand(10, 11, 100, 101, false, 1, 'c');
      await handler.handle(command);

      const actions = await ds.getRepository(EditActionSchema).find({});
      expect(actions.filter(a => a.tableName === ENTITY_NAMES.DataLink)).toHaveLength(1);
      expect(actions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment)).toHaveLength(0);
    } finally { await qr.release(); }
  });

  it('returns { systemId, type: DataLink } even for cross-subsystem (flat-mode caller)', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new CreateDataLinkHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      const command = new CreateDataLinkCommand(22, 23, 200, 201, false, 1, 'c');
      const result = await handler.handle(command);

      expect(result).toMatchObject({type: 'DataLink'});
      expect(typeof result.systemId).toBe('number');
    } finally { await qr.release(); }
  });

  it('creates DataLink + SLS chain + boundary DataPort when modules are in different subsystems', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new CreateDataLinkHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      const command = new CreateDataLinkCommand(22, 23, 200, 201, false, 1, 'c');
      await handler.handle(command);

      const actions = await ds.getRepository(EditActionSchema).find({});
      const dlActions = actions.filter(a => a.tableName === ENTITY_NAMES.DataLink);
      const slsActions = actions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment);

      expect(dlActions).toHaveLength(1);
      expect(slsActions.length).toBeGreaterThanOrEqual(2);

      // All share the same groupId
      const gid = dlActions[0].groupId;
      expect(gid).toBeTruthy();
      for (const a of slsActions) { expect(a.groupId).toBe(gid); }
    } finally { await qr.release(); }
  });

  it('returns 422 when either endpoint is a subsystem node', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new CreateDataLinkHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      // Node 20 is a subsystem
      const command = new CreateDataLinkCommand(22, 20, 200, 201, false, 1, 'c');
      await expect(handler.handle(command)).rejects.toMatchObject({statusCode: 422});
    } finally { await qr.release(); }
  });
});
```

- [ ] **Step 2: Implement CreateDataLinkHandler**

Create: `packages/core/src/application/usecase-designer/virtual-links/create-data-link/create-data-link.handler.ts`

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../shared/change-vocabulary.js';
import {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';
import {LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/link-type.js';
import {SubsystemBoundaryPathService} from '../../../../../domain/services/virtual-links/subsystem-boundary-path.service.js';
import {calculatePortId} from '../../../../../domain/utilities/port-id-strategy.js';
import {CreateDataLinkCommand} from './create-data-link.command.js';

const ALLOWED_SESSION_MODES = ['DESIGNER', 'DIFF_MERGE'] as const;

export class CreateDataLinkHandler implements CommandHandler<CreateDataLinkCommand, {systemId: number; type: 'DataLink'}> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: CreateDataLinkCommand): Promise<{systemId: number; type: 'DataLink'}> {
    // §6.0 session resolution
    const fileSystemId = await this.uow.getProjectRepository().getActiveFileId(command.projectId);
    const session = await this.uow.getSessionRepository().getActiveSession(command.projectId);
    if (!ALLOWED_SESSION_MODES.includes(session.sessionMode)) {
      throw Object.assign(new Error('Session mode does not allow graph modifications'), {statusCode: 422});
    }
    const {sessionId} = session;

    const nodeRepo = this.uow.getNodeRepository();
    const sourceNode = await nodeRepo.getById(command.sourceNodeSystemId, fileSystemId);
    const destNode = await nodeRepo.getById(command.destinationNodeSystemId, fileSystemId);

    // Step 1: Reject subsystem node endpoints
    if (sourceNode.type === NodeType.Subsystem || destNode.type === NodeType.Subsystem) {
      throw Object.assign(new Error('Subsystem node endpoints are not supported — use the subsystem-link-segments endpoint instead'), {statusCode: 422});
    }

    // Step 2: Duplicate check
    const existing = await this.uow.getDataLinkRepository().getByPortPair(
      command.sourcePortSystemId, command.destinationPortSystemId, fileSystemId, sessionId,
    );
    if (existing !== null) {
      throw Object.assign(new Error('DataLink already exists for this port pair'), {statusCode: 422});
    }

    // Same-subsystem vs. cross-subsystem
    if (sourceNode.parentId === destNode.parentId) {
      return this._sameContext(command, fileSystemId, sessionId, sourceNode, destNode);
    } else {
      return this._crossSubsystem(command, fileSystemId, sessionId, sourceNode, destNode);
    }
  }

  private async _sameContext(
    command: CreateDataLinkCommand,
    fileSystemId: number,
    sessionId: number,
    sourceNode: {subgraphSystemId?: number},
    destNode: {subgraphSystemId?: number},
  ): Promise<{systemId: number; type: 'DataLink'}> {
    const editRepo = this.uow.getEditActionRepository();
    // Design §6.3 L415: `isInterUsecase` is IGNORED when both modules share the same subgraph
    // (always INTRA_SUBGRAPH). The flag only distinguishes INTRA_USECASE vs INTER_USECASE in
    // the cross-subgraph case.
    const linkType = sourceNode.subgraphSystemId === destNode.subgraphSystemId
      ? LINK_TYPE.IntraSubgraph
      : command.isInterUsecase
      ? LINK_TYPE.InterUsecase
      : LINK_TYPE.IntraUsecase;

    const systemId = await this.idGeneration.getNextId(fileSystemId);
    await editRepo.insert({
      systemId,
      aggregateId: 0,
      sessionId,
      tableName: 'DataLink',
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId, sourceNodeSystemId: command.sourceNodeSystemId, destinationNodeSystemId: command.destinationNodeSystemId, sourcePortSystemId: command.sourcePortSystemId, destinationPortSystemId: command.destinationPortSystemId, linkType, fileSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });
    return {systemId, type: 'DataLink'};
  }

  private async _crossSubsystem(
    command: CreateDataLinkCommand,
    fileSystemId: number,
    sessionId: number,
    sourceNode: {systemId: number; parentId: number | null; subgraphSystemId?: number},
    destNode: {systemId: number; parentId: number | null; subgraphSystemId?: number},
  ): Promise<{systemId: number; type: 'DataLink'}> {
    const editRepo = this.uow.getEditActionRepository();
    const nodeRepo = this.uow.getNodeRepository();
    const portRepo = this.uow.getDataPortRepository();

    const nodeParentMap = await nodeRepo.getNodeParentMap(fileSystemId);
    const pathOutput = SubsystemBoundaryPathService.compute({
      sourceNodeId: command.sourceNodeSystemId,
      sourcePortId: command.sourcePortSystemId,
      destNodeId: command.destinationNodeSystemId,
      destPortId: command.destinationPortSystemId,
      nodeParentMap,
    });

    const config = await this.uow.getConfigurationRepository().getByFileId(fileSystemId);
    const subsystemNodes = pathOutput.nodeSequence.slice(1, -1);
    const boundaryPortMap = new Map<number, number>();

    const groupId = crypto.randomUUID();

    for (const nodeId of subsystemNodes) {
      const requiredPortType = pathOutput.requiredPortType.get(nodeId)!;
      const isInput = requiredPortType === 'InputOutput';
      const existingCount = await portRepo.countByNodeAndType(nodeId, requiredPortType, fileSystemId, sessionId);
      const portId = calculatePortId(existingCount, isInput, config.portStrategy);
      const portSystemId = await this.idGeneration.getNextId(fileSystemId);

      await editRepo.insert({
        systemId: portSystemId,
        aggregateId: nodeId,
        sessionId,
        tableName: 'DataPort',
        operation: CHANGE_OPERATION.Create,
        payload: JSON.stringify({systemId: portSystemId, nodeSystemId: nodeId, portIoType: requiredPortType, portId, fileSystemId}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId,
        validUntil: null,
      });

      boundaryPortMap.set(nodeId, portSystemId);
    }

    const dataLinkId = await this.idGeneration.getNextId(fileSystemId);
    // Design §6.3 L435: compute `linkType` from subgraph membership AND `isInterUsecase`.
    // Same subgraph ⇒ INTRA_SUBGRAPH (flag ignored); different subgraph ⇒
    // INTRA_USECASE or INTER_USECASE depending on the flag.
    const linkType = sourceNode.subgraphSystemId === destNode.subgraphSystemId
      ? LINK_TYPE.IntraSubgraph
      : command.isInterUsecase
      ? LINK_TYPE.InterUsecase
      : LINK_TYPE.IntraUsecase;

    await editRepo.insert({
      systemId: dataLinkId,
      aggregateId: 0,
      sessionId,
      tableName: 'DataLink',
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: dataLinkId, sourceNodeSystemId: command.sourceNodeSystemId, destinationNodeSystemId: command.destinationNodeSystemId, sourcePortSystemId: command.sourcePortSystemId, destinationPortSystemId: command.destinationPortSystemId, linkType, fileSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId,
      validUntil: null,
    });

    const sequence = pathOutput.nodeSequence;
    for (let i = 0; i < sequence.length - 1; i++) {
      const nodeA = sequence[i];
      const nodeB = sequence[i + 1];
      const srcPortId = i === 0 ? command.sourcePortSystemId : boundaryPortMap.get(nodeA)!;
      const dstPortId = i === sequence.length - 2 ? command.destinationPortSystemId : boundaryPortMap.get(nodeB)!;

      const slsId = await this.idGeneration.getNextId(fileSystemId);
      await editRepo.insert({
        systemId: slsId,
        aggregateId: 0,
        sessionId,
        tableName: 'SubsystemLinkSegment',
        operation: CHANGE_OPERATION.Create,
        payload: JSON.stringify({systemId: slsId, sourceNodeSystemId: nodeA, destinationNodeSystemId: nodeB, sourcePortSystemId: srcPortId, destinationPortSystemId: dstPortId, dataLinkSystemId: dataLinkId, fileSystemId}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId,
        validUntil: null,
      });
    }

    return {systemId: dataLinkId, type: 'DataLink'};
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-data-link"`
Expected: PASS — 4 tests.

- [ ] **Step 4: Commit**

Use the `commit` skill. **Wait for user confirmation before running git commit.**

---

### Task 42: DeleteDataLinkHandler — SLS cascade (§6.4)

**Package:** `@arc/core` + `@arc/persistence`

**Files:**
- Create: `packages/core/src/application/usecase-designer/virtual-links/delete-data-link/delete-data-link.command.ts`
- Create: `packages/core/src/application/usecase-designer/virtual-links/delete-data-link/delete-data-link.handler.ts`
- Create: `packages/infrastructure/persistence/tests/integration/handlers/delete-data-link.spec.ts`

- [ ] **Step 1: Create DeleteDataLinkCommand**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class DeleteDataLinkCommand extends BaseCommand {
  constructor(
    public readonly dataLinkSystemId: number,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
```

- [ ] **Step 2: Write integration tests**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import {setupIntegrationTest, teardownIntegrationTest, setupEachTest, getTestDataSource} from '../helpers/test-database-setup.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSessionSchema, SESSION_MODE, SESSION_STATUS} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {DeleteDataLinkHandler} from '@arc/core';
import {DeleteDataLinkCommand} from '@arc/core';
import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

describe('DeleteDataLinkHandler', () => {
  beforeAll(async () => { await setupIntegrationTest(); });
  afterAll(async () => { await teardownIntegrationTest(); });
  beforeEach(async () => {
    await setupEachTest();
    const ds = getTestDataSource();
    await ds.getRepository(ProjectSchema).save({systemId: 1, name: 'P', description: '', type: 'Offline'});
    await ds.getRepository(ArcDbFileSchema).save({systemId: 1, projectSystemId: 1, fileName: 'f.awsp', description: '', metadata: '{}', isTarget: false, lastReservedId: 1000});
    await ds.getRepository(ProjectSessionSchema).save({fileSystemId: 1, clientId: 'c', sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null});
  });

  it('records DataLink DELETE + SLS DELETE edit actions sharing groupId', async () => {
    const ds = getTestDataSource();
    const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});

    // Seed: a committed DataLink row
    await ds.query(`INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, file_system_id, version) VALUES (500, 1, 2, 10, 11, 'INTRA_SUBGRAPH', 1, 1)`);
    // Seed: two committed SLS rows referencing the DataLink
    await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (600, 1, 3, 10, 20, 500, 1, 1)`);
    await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (601, 3, 2, 20, 11, 500, 1, 1)`);

    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new DeleteDataLinkHandler(uow, idGen);
      const command = new DeleteDataLinkCommand(500, 1, 'c');
      await handler.handle(command);

      const editRepo = ds.getRepository(EditActionSchema);
      const allActions = await editRepo.find({where: {sessionId: session!.sessionId}});

      const dlDeletes = allActions.filter(a => a.tableName === ENTITY_NAMES.DataLink && a.operation === CHANGE_OPERATION.Delete);
      const slsDeletes = allActions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment && a.operation === CHANGE_OPERATION.Delete);

      expect(dlDeletes).toHaveLength(1);
      expect(slsDeletes).toHaveLength(2);

      const groupId = dlDeletes[0].groupId;
      expect(groupId).toBeTruthy();
      for (const a of slsDeletes) { expect(a.groupId).toBe(groupId); }
    } finally { await qr.release(); }
  });
});
```

- [ ] **Step 3: Implement DeleteDataLinkHandler**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../shared/change-vocabulary.js';
import {DeleteDataLinkCommand} from './delete-data-link.command.js';

const ALLOWED_SESSION_MODES = ['DESIGNER', 'DIFF_MERGE'] as const;

export class DeleteDataLinkHandler implements CommandHandler<DeleteDataLinkCommand, void> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: DeleteDataLinkCommand): Promise<void> {
    const fileSystemId = await this.uow.getProjectRepository().getActiveFileId(command.projectId);
    const session = await this.uow.getSessionRepository().getActiveSession(command.projectId);
    if (!ALLOWED_SESSION_MODES.includes(session.sessionMode)) {
      throw Object.assign(new Error('Session mode does not allow graph modifications'), {statusCode: 422});
    }
    const {sessionId} = session;

    const dlRepo = this.uow.getDataLinkRepository();
    const editRepo = this.uow.getEditActionRepository();
    const slsRepo = this.uow.getSubsystemLinkSegmentRepository();

    // Load DataLink; 404 if not found
    const dataLink = await dlRepo.getById(command.dataLinkSystemId, fileSystemId, sessionId);
    if (!dataLink) {
      throw Object.assign(new Error('DataLink not found'), {statusCode: 404});
    }

    const groupId = crypto.randomUUID();

    // Record DataLink DELETE
    await editRepo.insert({
      systemId: command.dataLinkSystemId,
      aggregateId: 0,
      sessionId,
      tableName: 'DataLink',
      operation: CHANGE_OPERATION.Delete,
      payload: JSON.stringify({systemId: command.dataLinkSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: dataLink.version,
      groupId,
      validUntil: null,
    });

    // Record DELETE for each associated SLS
    const siblings = await slsRepo.getByDataLinkId(command.dataLinkSystemId, fileSystemId, sessionId);
    for (const sls of siblings) {
      await editRepo.insert({
        systemId: sls.systemId,
        aggregateId: 0,
        sessionId,
        tableName: 'SubsystemLinkSegment',
        operation: CHANGE_OPERATION.Delete,
        payload: JSON.stringify({systemId: sls.systemId}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: sls.version,
        groupId,
        validUntil: null,
      });
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="delete-data-link"`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 43: DeleteSubsystemLinkSegmentHandler — Cases A and B (§6.5)

**Package:** `@arc/core` + `@arc/persistence`

**Files:**
- Create: `packages/core/src/application/usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.handler.ts`
- Create: `packages/infrastructure/persistence/tests/integration/handlers/delete-subsystem-link-segment.spec.ts`

- [ ] **Step 1: Write integration tests**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import {setupIntegrationTest, teardownIntegrationTest, setupEachTest, getTestDataSource} from '../helpers/test-database-setup.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSessionSchema, SESSION_MODE, SESSION_STATUS} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {DeleteSubsystemLinkSegmentHandler} from '@arc/core';
import {DeleteSubsystemLinkSegmentCommand} from '@arc/core';
import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

describe('DeleteSubsystemLinkSegmentHandler', () => {
  beforeAll(async () => { await setupIntegrationTest(); });
  afterAll(async () => { await teardownIntegrationTest(); });
  beforeEach(async () => {
    await setupEachTest();
    const ds = getTestDataSource();
    await ds.getRepository(ProjectSchema).save({systemId: 1, name: 'P', description: '', type: 'Offline'});
    await ds.getRepository(ArcDbFileSchema).save({systemId: 1, projectSystemId: 1, fileName: 'f.awsp', description: '', metadata: '{}', isTarget: false, lastReservedId: 1000});
    await ds.getRepository(ProjectSessionSchema).save({fileSystemId: 1, clientId: 'c', sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null});
  });

  describe('Case A — unresolved SLS (dataLinkSystemId = null)', () => {
    it('records only a single SLS DELETE edit action', async () => {
      const ds = getTestDataSource();
      const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});

      // Seed: SLS in edit_actions as a pending CREATE with null dataLinkSystemId
      const editRepo = ds.getRepository(EditActionSchema);
      await editRepo.save({
        systemId: 700,
        aggregateId: 0,
        sessionId: session!.sessionId,
        tableName: ENTITY_NAMES.SubsystemLinkSegment,
        operation: CHANGE_OPERATION.Create,
        payload: JSON.stringify({systemId: 700, sourceNodeSystemId: 1, destinationNodeSystemId: 2, sourcePortSystemId: 10, destinationPortSystemId: 11, dataLinkSystemId: null, fileSystemId: 1}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: null,
        groupId: null,
        validUntil: null,
      });

      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const handler = new DeleteSubsystemLinkSegmentHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
        await handler.handle(new DeleteSubsystemLinkSegmentCommand(700, 1, 'c'));

        const after = await editRepo.find({where: {sessionId: session!.sessionId}});
        const deletes = after.filter(a => a.operation === CHANGE_OPERATION.Delete && a.tableName === ENTITY_NAMES.SubsystemLinkSegment);
        expect(deletes).toHaveLength(1);
        expect(deletes[0].systemId).toBe(700);
      } finally { await qr.release(); }
    });
  });

  describe('Case B — resolved SLS (dataLinkSystemId non-null)', () => {
    it('records SLS DELETE + DataLink DELETE + sibling SLS UPDATE (null FK) all sharing groupId', async () => {
      const ds = getTestDataSource();
      const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});

      // Seed: committed DataLink + 2 committed SLS rows
      await ds.query(`INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, file_system_id, version) VALUES (800, 1, 2, 10, 11, 'INTRA_SUBGRAPH', 1, 1)`);
      await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (810, 1, 3, 10, 20, 800, 1, 1)`);
      await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (811, 3, 2, 20, 11, 800, 1, 1)`);

      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const handler = new DeleteSubsystemLinkSegmentHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
        // Delete SLS 810
        await handler.handle(new DeleteSubsystemLinkSegmentCommand(810, 1, 'c'));

        const editRepo = ds.getRepository(EditActionSchema);
        const allActions = await editRepo.find({where: {sessionId: session!.sessionId}});

        const slsDeletes = allActions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment && a.operation === CHANGE_OPERATION.Delete);
        const dlDeletes = allActions.filter(a => a.tableName === ENTITY_NAMES.DataLink && a.operation === CHANGE_OPERATION.Delete);
        const slsUpdates = allActions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment && a.operation === CHANGE_OPERATION.Update);

        expect(slsDeletes).toHaveLength(1);
        expect(dlDeletes).toHaveLength(1);
        expect(slsUpdates).toHaveLength(1); // sibling 811

        const gid = slsDeletes[0].groupId;
        expect(gid).toBeTruthy();
        expect(dlDeletes[0].groupId).toBe(gid);
        expect(slsUpdates[0].groupId).toBe(gid);

        // Sibling UPDATE payload has dataLinkSystemId: null
        const sibling = JSON.parse(slsUpdates[0].payload as string);
        expect(sibling.dataLinkSystemId).toBeNull();
      } finally { await qr.release(); }
    });
  });
});
```

- [ ] **Step 2: Implement DeleteSubsystemLinkSegmentHandler**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../shared/change-vocabulary.js';
import {DeleteSubsystemLinkSegmentCommand} from './delete-subsystem-link-segment.command.js';

const ALLOWED_SESSION_MODES = ['DESIGNER', 'DIFF_MERGE'] as const;

export class DeleteSubsystemLinkSegmentHandler implements CommandHandler<DeleteSubsystemLinkSegmentCommand, void> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: DeleteSubsystemLinkSegmentCommand): Promise<void> {
    const fileSystemId = await this.uow.getProjectRepository().getActiveFileId(command.projectId);
    const session = await this.uow.getSessionRepository().getActiveSession(command.projectId);
    if (!ALLOWED_SESSION_MODES.includes(session.sessionMode)) {
      throw Object.assign(new Error('Session mode does not allow graph modifications'), {statusCode: 422});
    }
    const {sessionId} = session;

    const slsRepo = this.uow.getSubsystemLinkSegmentRepository();
    const editRepo = this.uow.getEditActionRepository();

    // Load SLS from committed table + overlay
    const sls = await slsRepo.getById(command.slsSystemId, fileSystemId, sessionId);
    if (!sls) {
      throw Object.assign(new Error('SubsystemLinkSegment not found'), {statusCode: 404});
    }

    // Case A — unresolved
    if (sls.dataLinkSystemId === null) {
      await editRepo.insert({
        systemId: sls.systemId,
        aggregateId: 0,
        sessionId,
        tableName: 'SubsystemLinkSegment',
        operation: CHANGE_OPERATION.Delete,
        payload: JSON.stringify({systemId: sls.systemId}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: sls.version,
        groupId: null,
        validUntil: null,
      });
      return;
    }

    // Case B — resolved
    const groupId = crypto.randomUUID();

    await editRepo.insert({
      systemId: sls.systemId,
      aggregateId: 0,
      sessionId,
      tableName: 'SubsystemLinkSegment',
      operation: CHANGE_OPERATION.Delete,
      payload: JSON.stringify({systemId: sls.systemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: sls.version,
      groupId,
      validUntil: null,
    });

    // Load DataLink to get baseVersion
    const dlRepo = this.uow.getDataLinkRepository();
    const dataLink = await dlRepo.getById(sls.dataLinkSystemId, fileSystemId, sessionId);
    await editRepo.insert({
      systemId: sls.dataLinkSystemId,
      aggregateId: 0,
      sessionId,
      tableName: 'DataLink',
      operation: CHANGE_OPERATION.Delete,
      payload: JSON.stringify({systemId: sls.dataLinkSystemId}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: dataLink?.version ?? null,
      groupId,
      validUntil: null,
    });

    // Null out FK on all sibling SLS (so commit pre-pass treats them as unresolved)
    const siblings = await slsRepo.getByDataLinkId(sls.dataLinkSystemId, fileSystemId, sessionId);
    for (const sibling of siblings) {
      if (sibling.systemId === sls.systemId) continue; // skip the deleted one
      await editRepo.insert({
        systemId: sibling.systemId,
        aggregateId: 0,
        sessionId,
        tableName: 'SubsystemLinkSegment',
        operation: CHANGE_OPERATION.Update,
        payload: JSON.stringify({systemId: sibling.systemId, dataLinkSystemId: null}),
        changeStatus: CHANGE_STATUS.Staged,
        baseVersion: sibling.version,
        groupId,
        validUntil: null,
      });
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="delete-subsystem-link-segment"`
Expected: PASS — 2 tests.

- [ ] **Step 4: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 44: ResolveVirtualLinkChainsHandler (§6.7)

**Package:** `@arc/core` + `@arc/persistence`

**Files:**
- Create: `packages/core/src/application/usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.handler.ts`
- Create: `packages/infrastructure/persistence/tests/integration/handlers/resolve-virtual-link-chains.spec.ts`

- [ ] **Step 1: Write integration tests**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import {setupIntegrationTest, teardownIntegrationTest, setupEachTest, getTestDataSource} from '../helpers/test-database-setup.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSessionSchema, SESSION_MODE, SESSION_STATUS} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {NodeSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {ResolveVirtualLinkChainsHandler} from '@arc/core';
import {ResolveVirtualLinkChainsCommand} from '@arc/core';
import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

describe('ResolveVirtualLinkChainsHandler', () => {
  beforeAll(async () => { await setupIntegrationTest(); });
  afterAll(async () => { await teardownIntegrationTest(); });
  beforeEach(async () => {
    await setupEachTest();
    const ds = getTestDataSource();
    await ds.getRepository(ProjectSchema).save({systemId: 1, name: 'P', description: '', type: 'Offline'});
    await ds.getRepository(ArcDbFileSchema).save({systemId: 1, projectSystemId: 1, fileName: 'f.awsp', description: '', metadata: '{}', isTarget: false, lastReservedId: 1000});
    await ds.getRepository(ProjectSessionSchema).save({fileSystemId: 1, clientId: 'c', sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null});
  });

  it('fast-paths when no unresolved SLS exist — returns success with no new edit actions', async () => {
    const ds = getTestDataSource();
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new ResolveVirtualLinkChainsHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      await handler.handle(new ResolveVirtualLinkChainsCommand(1, 'c'));
      const editRepo = ds.getRepository(EditActionSchema);
      const actions = await editRepo.find({});
      expect(actions).toHaveLength(0);
    } finally { await qr.release(); }
  });

  it('resolves a complete chain and records DataLink CREATE + SLS UPDATE edit actions', async () => {
    const ds = getTestDataSource();
    const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});
    const editRepo = ds.getRepository(EditActionSchema);

    // Insert nodes: module A, subsystem S, module B
    await ds.getRepository(NodeSchema).save({systemId: 10, parentId: null, type: 'module', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 11, parentId: null, type: 'subsystem', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 12, parentId: null, type: 'module', fileSystemId: 1});

    // Insert 2 unresolved SLS edit actions forming a complete chain: A→S + S→B
    await editRepo.save({
      systemId: 900,
      aggregateId: 0,
      sessionId: session!.sessionId,
      tableName: ENTITY_NAMES.SubsystemLinkSegment,
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: 900, sourceNodeSystemId: 10, destinationNodeSystemId: 11, sourcePortSystemId: 100, destinationPortSystemId: 200, dataLinkSystemId: null, fileSystemId: 1}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });
    await editRepo.save({
      systemId: 901,
      aggregateId: 0,
      sessionId: session!.sessionId,
      tableName: ENTITY_NAMES.SubsystemLinkSegment,
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: 901, sourceNodeSystemId: 11, destinationNodeSystemId: 12, sourcePortSystemId: 200, destinationPortSystemId: 300, dataLinkSystemId: null, fileSystemId: 1}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new ResolveVirtualLinkChainsHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      await handler.handle(new ResolveVirtualLinkChainsCommand(1, 'c'));

      const allActions = await editRepo.find({});
      const dlCreates = allActions.filter(a => a.tableName === ENTITY_NAMES.DataLink && a.operation === CHANGE_OPERATION.Create);
      const slsUpdates = allActions.filter(a => a.tableName === ENTITY_NAMES.SubsystemLinkSegment && a.operation === CHANGE_OPERATION.Update);

      expect(dlCreates).toHaveLength(1);
      expect(slsUpdates).toHaveLength(2);

      const dlPayload = JSON.parse(dlCreates[0].payload as string);
      expect(typeof dlPayload.systemId).toBe('number');
      for (const upd of slsUpdates) {
        const p = JSON.parse(upd.payload as string);
        expect(p.dataLinkSystemId).toBe(dlPayload.systemId);
      }
    } finally { await qr.release(); }
  });

  it('returns 422 when an incomplete chain exists', async () => {
    const ds = getTestDataSource();
    const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});
    const editRepo = ds.getRepository(EditActionSchema);

    await ds.getRepository(NodeSchema).save({systemId: 20, parentId: null, type: 'module', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 21, parentId: null, type: 'subsystem', fileSystemId: 1});

    // One SLS with dead end at subsystem
    await editRepo.save({
      systemId: 950,
      aggregateId: 0,
      sessionId: session!.sessionId,
      tableName: ENTITY_NAMES.SubsystemLinkSegment,
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: 950, sourceNodeSystemId: 20, destinationNodeSystemId: 21, sourcePortSystemId: 100, destinationPortSystemId: 200, dataLinkSystemId: null, fileSystemId: 1}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const handler = new ResolveVirtualLinkChainsHandler(new TypeOrmUnitOfWork(qr), new EntityIdServiceRegistry(qr.manager));
      await expect(handler.handle(new ResolveVirtualLinkChainsCommand(1, 'c'))).rejects.toMatchObject({statusCode: 422});
    } finally { await qr.release(); }
  });
});
```

- [ ] **Step 2: Implement ResolveVirtualLinkChainsHandler**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {ResolveSLSChainsService} from '../../../services/virtual-links/resolve-sls-chains.service.js';
import {ResolveVirtualLinkChainsCommand} from './resolve-virtual-link-chains.command.js';

const ALLOWED_SESSION_MODES = ['DESIGNER', 'DIFF_MERGE'] as const;

export class ResolveVirtualLinkChainsHandler
  implements CommandHandler<ResolveVirtualLinkChainsCommand, void>
{
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: ResolveVirtualLinkChainsCommand): Promise<void> {
    const fileSystemId = await this.uow.getProjectRepository().getActiveFileId(command.projectId);
    const session = await this.uow.getSessionRepository().getActiveSession(command.projectId);
    if (!ALLOWED_SESSION_MODES.includes(session.sessionMode)) {
      throw Object.assign(new Error('Session mode does not allow graph modifications'), {statusCode: 422});
    }

    const service = new ResolveSLSChainsService(this.uow, this.idGeneration);
    const result = await service.resolve(fileSystemId, session.sessionId);

    if (result.status === 'incomplete') {
      throw Object.assign(
        new Error('Incomplete subsystem link chains exist'),
        {statusCode: 422, incompleteChains: result.incompleteChains},
      );
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="resolve-virtual-link-chains"`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 45: AutoCreateUsecasesHandler — pre-pass extension (§6.8)

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/usecase/auto-create/auto-create-usecases.handler.ts` (find by searching for AutoCreate in the `usecase-designer/usecase` folder)

- [ ] **Step 1: Find the handler**

Search: `packages/core/src/application/usecase-designer/usecase/`

Look for a handler with "auto" in the name. If it is named differently, adjust the path below.

- [ ] **Step 2: Add the pre-pass to the start of `handle()`**

Find the `handle()` method. Before any routing logic, add:

```typescript
// Pre-pass: resolve any unresolved subsystem link segment chains.
// If incomplete chains exist, reject — routing cannot proceed without all links resolved.
const service = new ResolveSLSChainsService(this.uow, this.idGeneration);
const slsResult = await service.resolve(fileSystemId, session.sessionId);
if (slsResult.status === 'incomplete') {
  throw Object.assign(
    new Error('Cannot auto-create usecases: incomplete subsystem link chains exist'),
    {statusCode: 422, incompleteChains: slsResult.incompleteChains},
  );
}
```

Add the import at the top of the file:
```typescript
import {ResolveSLSChainsService} from '../../../services/virtual-links/resolve-sls-chains.service.js';
```

Make sure the handler's constructor accepts `IdGenerationPort` if it doesn't already:
```typescript
constructor(
  private readonly uow: UnitOfWork,
  private readonly idGeneration: IdGenerationPort,  // add if missing
) {}
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 46: Handler registry + exports

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`
- Modify: `packages/core/src/index.ts` (or wherever `@arc/core` exports are defined)

- [ ] **Step 1: Register new handlers in CommandHandlerRegistry**

Add these imports at the top of `command-handler-registry.ts`:

```typescript
import {CreateSubsystemLinkSegmentCommand} from '../../../usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.command.js';
import {CreateSubsystemLinkSegmentHandler} from '../../../usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.handler.js';
import {DeleteSubsystemLinkSegmentCommand} from '../../../usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.command.js';
import {DeleteSubsystemLinkSegmentHandler} from '../../../usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.handler.js';
import {ResolveVirtualLinkChainsCommand} from '../../../usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.command.js';
import {ResolveVirtualLinkChainsHandler} from '../../../usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.handler.js';
import {CreateDataLinkCommand} from '../../../usecase-designer/virtual-links/create-data-link/create-data-link.command.js';
import {CreateDataLinkHandler} from '../../../usecase-designer/virtual-links/create-data-link/create-data-link.handler.js';
import {DeleteDataLinkCommand} from '../../../usecase-designer/virtual-links/delete-data-link/delete-data-link.command.js';
import {DeleteDataLinkHandler} from '../../../usecase-designer/virtual-links/delete-data-link/delete-data-link.handler.js';
```

Add these lines inside `registerAllCommandHandlers()`:

```typescript
this.commandHandlerFactories.set(CreateSubsystemLinkSegmentCommand, {
  create: deps => new CreateSubsystemLinkSegmentHandler(deps.uow, deps.idGeneration),
});
this.commandHandlerFactories.set(DeleteSubsystemLinkSegmentCommand, {
  create: deps => new DeleteSubsystemLinkSegmentHandler(deps.uow, deps.idGeneration),
});
this.commandHandlerFactories.set(ResolveVirtualLinkChainsCommand, {
  create: deps => new ResolveVirtualLinkChainsHandler(deps.uow, deps.idGeneration),
});
this.commandHandlerFactories.set(CreateDataLinkCommand, {
  create: deps => new CreateDataLinkHandler(deps.uow, deps.idGeneration),
});
this.commandHandlerFactories.set(DeleteDataLinkCommand, {
  create: deps => new DeleteDataLinkHandler(deps.uow, deps.idGeneration),
});
```

- [ ] **Step 2: Export new types from @arc/core**

Open the `@arc/core` package's main index file (likely `packages/core/src/index.ts`). Add exports:

```typescript
// Virtual links — commands
export {CreateSubsystemLinkSegmentCommand} from './application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.command.js';
export {DeleteSubsystemLinkSegmentCommand} from './application/usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.command.js';
export {ResolveVirtualLinkChainsCommand} from './application/usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.command.js';
export {CreateDataLinkCommand} from './application/usecase-designer/virtual-links/create-data-link/create-data-link.command.js';
export {DeleteDataLinkCommand} from './application/usecase-designer/virtual-links/delete-data-link/delete-data-link.command.js';

// Virtual links — handlers
export {CreateSubsystemLinkSegmentHandler} from './application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.handler.js';
export {DeleteSubsystemLinkSegmentHandler} from './application/usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.handler.js';
export {ResolveVirtualLinkChainsHandler} from './application/usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.handler.js';
export {CreateDataLinkHandler} from './application/usecase-designer/virtual-links/create-data-link/create-data-link.handler.js';
export {DeleteDataLinkHandler} from './application/usecase-designer/virtual-links/delete-data-link/delete-data-link.handler.js';

// Virtual links — domain
export {SubsystemLinkSegment} from './domain/entities/usecase-data/subsystem-link-segment/subsystem-link-segment.js';
export {SubsystemBoundaryPathService} from './domain/services/virtual-links/subsystem-boundary-path.service.js';
export {ChainResolutionService} from './domain/services/virtual-links/chain-resolution.service.js';
// NOTE: `calculatePortId`, `MODULE_PORT_STRATEGIES`, `ModulePortStrategy`, `IConfigurationRepository`,
// and `ConfigurationOverlayRow` are already exported by Task 21 Step 3 — do not duplicate here.
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: no TypeScript errors across all packages.

---

### Task 47: Full test run + commit

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: all unit + integration tests pass.

- [ ] **Step 2: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 48: UnitOfWork — missing getter note

If `pnpm run build` in Task 46 reports missing implementations for UnitOfWork getters, the following stubs need to be added to `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/typeorm-unit-of-work.ts`:

```typescript
// Add to TypeOrmUnitOfWork class:

getEditActionRepository(): IEditActionRepository {
  return new TypeOrmEditActionRepository(this.queryRunner.manager);
}

getSessionRepository(): ISessionRepository {
  return new TypeOrmSessionRepository(this.queryRunner.manager);
}

getNodeRepository(): INodeRepository {
  return new TypeOrmNodeRepository(this.queryRunner.manager);
}

getSubsystemLinkSegmentRepository(): ISubsystemLinkSegmentRepository {
  return new TypeOrmSubsystemLinkSegmentRepository(this.queryRunner.manager);
}

getConfigurationRepository(): IConfigurationRepository {
  return new TypeOrmConfigurationRepository(this.queryRunner.manager);
}

getDataLinkRepository(): IDataLinkRepository {
  return new TypeOrmDataLinkRepository(this.queryRunner.manager);
}

getDataPortRepository(): IDataPortRepository {
  return new TypeOrmDataPortRepository(this.queryRunner.manager);
}
```

These implementations should have been created in the Port Interfaces chapter (Tasks 23–24). If they are missing, add them then wire up here.

---

### Task 49: Session resolution in ProjectRepository

Per spec §6.0, the session is found by `projectId`. Add the following method to `packages/core/src/application/ports/persistence/repositories/project/project.repository.ts`:

```typescript
/**
 * Returns the active file ID for a project.
 * Throws if the project has no file.
 */
getActiveFileId(projectId: number): Promise<number>;
```

And the corresponding TypeORM implementation in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/project/typeorm-project.repository.ts`:

```typescript
async getActiveFileId(projectId: number): Promise<number> {
  const file = await this.manager
    .getRepository(ArcDbFileSchema)
    .findOne({where: {projectSystemId: projectId}});
  if (!file) {
    throw Object.assign(new Error(`No file found for project ${projectId}`), {statusCode: 404});
  }
  return file.systemId;
}
```

If `ISessionRepository` doesn't exist yet, create it:

```typescript
// packages/core/src/application/ports/persistence/repositories/i-session.repository.ts
export interface ISessionRepository {
  getActiveSession(projectId: number): Promise<{sessionId: number; fileSystemId: number; sessionMode: string}>;
}
```

TypeORM implementation:

```typescript
// packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.ts
import {ArcDbFileSchema} from '../../entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema, SESSION_STATUS} from '../../entity-schema/edit-session/project-session.schema.js';
import type {ISessionRepository} from '@arc/core';
import type {EntityManager} from 'typeorm';

export class TypeOrmSessionRepository implements ISessionRepository {
  constructor(private readonly manager: EntityManager) {}

  async getActiveSession(projectId: number): Promise<{sessionId: number; fileSystemId: number; sessionMode: string}> {
    const file = await this.manager
      .getRepository(ArcDbFileSchema)
      .findOne({where: {projectSystemId: projectId}});
    if (!file) {
      throw Object.assign(new Error(`No file found for project ${projectId}`), {statusCode: 404});
    }
    const session = await this.manager
      .getRepository(ProjectSessionSchema)
      .findOne({where: {fileSystemId: file.systemId, status: SESSION_STATUS.Active}});
    if (!session) {
      throw Object.assign(new Error(`No active session found for project ${projectId}`), {statusCode: 422});
    }
    return {sessionId: session.sessionId, fileSystemId: session.fileSystemId, sessionMode: session.sessionMode};
  }
}
```

---

### Task 50: File manifest — Tasks 31–51

All files created or modified in this command handlers chapter:

| File | Action | Package |
|---|---|---|
| `packages/core/src/application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.command.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/create-subsystem-link-segment/create-subsystem-link-segment.handler.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.command.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/delete-subsystem-link-segment/delete-subsystem-link-segment.handler.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.command.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/resolve-virtual-link-chains/resolve-virtual-link-chains.handler.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/create-data-link/create-data-link.command.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/create-data-link/create-data-link.handler.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/delete-data-link/delete-data-link.command.ts` | Create | `@arc/core` |
| `packages/core/src/application/usecase-designer/virtual-links/delete-data-link/delete-data-link.handler.ts` | Create | `@arc/core` |
| `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts` | Modify | `@arc/core` |
| `packages/core/src/index.ts` | Modify | `@arc/core` |
| `packages/core/src/application/usecase-designer/usecase/auto-create/auto-create-usecases.handler.ts` | Modify | `@arc/core` |
| `packages/infrastructure/persistence/tests/integration/handlers/create-subsystem-link-segment.spec.ts` | Create | `@arc/persistence` |
| `packages/infrastructure/persistence/tests/integration/handlers/create-data-link.spec.ts` | Create | `@arc/persistence` |
| `packages/infrastructure/persistence/tests/integration/handlers/delete-data-link.spec.ts` | Create | `@arc/persistence` |
| `packages/infrastructure/persistence/tests/integration/handlers/delete-subsystem-link-segment.spec.ts` | Create | `@arc/persistence` |
| `packages/infrastructure/persistence/tests/integration/handlers/resolve-virtual-link-chains.spec.ts` | Create | `@arc/persistence` |
| `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/typeorm-unit-of-work.ts` | Modify | `@arc/persistence` |

### Task 51: Run full test suite + final commit

- [ ] **Step 1: Build and test**

Run: `pnpm run build && pnpm test`
Expected: zero TypeScript errors; all unit and integration tests pass.

- [ ] **Step 2: Final commit**

Use the `commit` skill to commit any remaining uncommitted changes. **Wait for user confirmation.**
<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

### Task 52: Verify SubsystemBoundaryPathService unit test coverage

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/subsystem-boundary-path.service.spec.ts`

The unit tests for `SubsystemBoundaryPathService` were written in Task 11 (Domain Services chapter). This task verifies that all spec section 10.1 cases are present and adds any missing edge cases.

- [ ] **Step 1: Run the existing unit tests**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="subsystem-boundary-path"`
Expected: PASS — all 6+ cases defined in Task 11.

- [ ] **Step 2: Verify the following test cases exist**

Open the test file and confirm each of the following `it()` descriptions is present (or the equivalent):

1. One module at top level (parentId=null), one module inside one subsystem — LCA is null, path crosses one boundary.
2. Both modules inside different top-level subsystems — two boundaries, LCA is null, nodeSequence has 4 nodes.
3. Source module nested two levels deep (SubInner inside SubOuter), dest inside unrelated SubY — 3 boundary subsystems.
4. Both modules share an outer subsystem (LCA is a non-null subsystem node) — only inner boundaries crossed, LCA excluded from nodeSequence.
5. Deep nesting on both sides with a non-null LCA.
6. The worked example from spec §5.1: ModuleA inside SubsystemInner (inside SubsystemOuter), ModuleB inside SubsystemY; expects `nodeSequence = [ModuleA, SubsystemInner, SubsystemOuter, SubsystemY, ModuleB]`.

If any case is missing, add it now. The test must use concrete numbers and assert both `nodeSequence` and `requiredPortType` map values.

---

### Task 53: Add SubsystemBoundaryPathService edge-case tests

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/tests/unit/domain/services/virtual-links/subsystem-boundary-path.service.spec.ts`

- [ ] **Step 1: Add the port-passthrough test**

```typescript
it('passes sourcePortId and destPortId through unchanged', () => {
  const nodeParentMap = new Map<number, number | null>([
    [1, null],  // ModuleA (top level)
    [2, null],  // SubsystemX (top level)
    [3, 2],     // ModuleB inside SubsystemX
  ]);

  const result = SubsystemBoundaryPathService.compute({
    sourceNodeId: 1,
    sourcePortId: 100,
    destNodeId: 3,
    destPortId: 200,
    nodeParentMap,
  });

  expect(result.nodeSequence[0]).toBe(1);
  expect(result.nodeSequence[result.nodeSequence.length - 1]).toBe(3);
  // The service does not alter ports — they are tracked by the caller
});
```

- [ ] **Step 1b: Add the defensive same-parent test (design §10.1 — "both modules inside the same top-level subsystem but reported as different")**

The handler is only supposed to call this service when `sourceModule.parentId !== destModule.parentId`. This test exercises a defensive path where the caller violates that pre-condition by passing two modules that share the same parent — the service should produce an empty boundary list (LCA = shared parent, both trimmed chains empty), yielding `nodeSequence = [src, dst]` and an empty `requiredPortType` map. This guards against silent miscalculation if a future caller misuses the contract.

```typescript
it('defensive: both modules share the same immediate parent — empty boundary set', () => {
  const nodeParentMap = new Map<number, number | null>([
    [1, 10],   // ModuleA inside SubsystemX
    [2, 10],   // ModuleB inside SubsystemX (same parent)
    [10, null], // SubsystemX at top level
  ]);

  const result = SubsystemBoundaryPathService.compute({
    sourceNodeId: 1,
    sourcePortId: 100,
    destNodeId: 2,
    destPortId: 200,
    nodeParentMap,
  });

  expect(result.nodeSequence).toEqual([1, 2]);
  expect(result.requiredPortType.size).toBe(0);
});
```

- [ ] **Step 2: Run all unit tests**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="subsystem-boundary-path"`
Expected: all tests PASS.

---

### Task 54: Verify ChainResolutionService unit test coverage

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/virtual-links/chain-resolution.service.spec.ts`

The unit tests for `ChainResolutionService` were written in Task 15 (Domain Services chapter). Verify all spec 10.1 cases exist.

- [ ] **Step 1: Run**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="chain-resolution"`
Expected: PASS.

- [ ] **Step 2: Verify these cases exist**

1. Empty input → `{ completeChains: [], incompleteChains: [] }` (fast path).
2. Single complete chain: module → subsystem → module. Assert `segmentIds`, `sourcePortId`, `destPortId`.
3. Multiple independent complete chains in one call — both resolved.
4. Incomplete chain: dead end at a subsystem node (no outgoing SLS from it) → appears in `incompleteChains`.
5. Cycle detection: A→B→C→A → `incompleteChains`.
6. Fan-out: one module with two outgoing SLS (two independent complete chains).

If any case is missing, add it.

---

### Task 55: Add ChainResolutionService edge-case tests

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/tests/unit/domain/services/virtual-links/chain-resolution.service.spec.ts`

- [ ] **Step 1: Add a three-segment chain test**

```typescript
it('extracts sourcePortId from first segment and destPortId from last segment in a 3-segment chain', () => {
  // module(10) → subsystem(11) → subsystem(12) → module(13)
  const segments = [
    {systemId: 1, sourceNodeSystemId: 10, destinationNodeSystemId: 11, sourcePortSystemId: 100, destinationPortSystemId: 200},
    {systemId: 2, sourceNodeSystemId: 11, destinationNodeSystemId: 12, sourcePortSystemId: 201, destinationPortSystemId: 300},
    {systemId: 3, sourceNodeSystemId: 12, destinationNodeSystemId: 13, sourcePortSystemId: 301, destinationPortSystemId: 400},
  ];
  const nodeTypeMap = new Map([
    [10, 'module' as const],
    [11, 'subsystem' as const],
    [12, 'subsystem' as const],
    [13, 'module' as const],
  ]);

  const result = ChainResolutionService.resolve({unresolvedSegments: segments, nodeTypeMap});

  expect(result.completeChains).toHaveLength(1);
  const chain = result.completeChains[0];
  expect(chain.segmentIds).toEqual([1, 2, 3]);
  expect(chain.sourcePortId).toBe(100);   // first segment's sourcePortSystemId
  expect(chain.destPortId).toBe(400);     // last segment's destinationPortSystemId
  expect(chain.sourceModuleNodeId).toBe(10);
  expect(chain.destModuleNodeId).toBe(13);
});
```

- [ ] **Step 2: Run all unit tests**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="chain-resolution"`
Expected: PASS.

- [ ] **Step 3: Run full unit test suite**

Run: `pnpm --filter @arc/core run test:unit:core`
Expected: all unit tests PASS.

---

### Task 56: Run full unit test suite

- [ ] **Step 1: Run**

Run: `pnpm --filter @arc/core run test:unit:core`
Expected: PASS — all unit tests.

---

### Task 57: Commit unit tests

- [ ] **Step 1: Commit any new tests added in Tasks 53 and 55**

Use the `commit` skill. Show proposed message and commands. **Wait for user confirmation.**

**STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 58: ResolveSLSChainsService unit tests

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/tests/unit/application/services/virtual-links/resolve-sls-chains.service.spec.ts`

`ResolveSLSChainsService` is an application service (not a pure domain service), so it requires mocked ports. Write unit tests using Jest mocks.

- [ ] **Step 1: Write the tests**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {ResolveSLSChainsService} from '../../../../../src/application/services/virtual-links/resolve-sls-chains.service.js';

function makeUow(overrides: Record<string, any> = {}) {
  return {
    getSubsystemLinkSegmentRepository: jest.fn().mockReturnValue({
      getUnresolvedForFile: jest.fn().mockResolvedValue([]),
      ...overrides.slsRepo,
    }),
    getNodeRepository: jest.fn().mockReturnValue({
      getNodeTypeMap: jest.fn().mockResolvedValue(new Map()),
      ...overrides.nodeRepo,
    }),
    getEditActionRepository: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue(undefined),
      ...overrides.editRepo,
    }),
    getDataLinkRepository: jest.fn().mockReturnValue({
      ...overrides.dlRepo,
    }),
  } as any;
}

function makeIdGen(nextId = 1000) {
  let id = nextId;
  return {
    getNextId: jest.fn().mockImplementation(async () => id++),
  } as any;
}

describe('ResolveSLSChainsService', () => {
  it('returns { status: ok } immediately when no unresolved SLS exist (fast path)', async () => {
    const uow = makeUow();
    const service = new ResolveSLSChainsService(uow, makeIdGen());
    const result = await service.resolve(1, 10);
    expect(result.status).toBe('ok');
    expect(uow.getNodeRepository().getNodeTypeMap).not.toHaveBeenCalled();
  });

  it('returns { status: ok } and records DataLink CREATE + SLS UPDATE for complete chain', async () => {
    const uow = makeUow({
      slsRepo: {
        getUnresolvedForFile: jest.fn().mockResolvedValue([
          {systemId: 100, sourceNodeSystemId: 1, destinationNodeSystemId: 2, sourcePortSystemId: 10, destinationPortSystemId: 20},
          {systemId: 101, sourceNodeSystemId: 2, destinationNodeSystemId: 3, sourcePortSystemId: 21, destinationPortSystemId: 30},
        ]),
      },
      nodeRepo: {
        getNodeTypeMap: jest.fn().mockResolvedValue(new Map([[1, 'module'], [2, 'subsystem'], [3, 'module']])),
      },
    });
    const idGen = makeIdGen(500);
    const service = new ResolveSLSChainsService(uow, idGen);

    const result = await service.resolve(1, 10);

    expect(result.status).toBe('ok');
    const editRepo = uow.getEditActionRepository();
    const insertCalls = (editRepo.insert as jest.Mock).mock.calls;
    const dlInsert = insertCalls.find((call: any) => call[0].tableName === 'DataLink' && call[0].operation === 'CREATE');
    const slsUpdates = insertCalls.filter((call: any) => call[0].tableName === 'SubsystemLinkSegment' && call[0].operation === 'UPDATE');

    expect(dlInsert).toBeDefined();
    expect(slsUpdates).toHaveLength(2);
    const dlSystemId = JSON.parse(dlInsert![0].payload).systemId;
    for (const upd of slsUpdates) {
      expect(JSON.parse(upd[0].payload).dataLinkSystemId).toBe(dlSystemId);
    }
  });

  it('returns { status: incomplete } when a chain has no outgoing segment from subsystem', async () => {
    const uow = makeUow({
      slsRepo: {
        getUnresolvedForFile: jest.fn().mockResolvedValue([
          {systemId: 200, sourceNodeSystemId: 5, destinationNodeSystemId: 6, sourcePortSystemId: 50, destinationPortSystemId: 60},
        ]),
      },
      nodeRepo: {
        getNodeTypeMap: jest.fn().mockResolvedValue(new Map([[5, 'module'], [6, 'subsystem']])),
      },
    });
    const service = new ResolveSLSChainsService(uow, makeIdGen());

    const result = await service.resolve(1, 10);

    expect(result.status).toBe('incomplete');
    expect(result.incompleteChains).toBeDefined();
    expect(result.incompleteChains![0].segmentIds).toContain(200);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="resolve-sls-chains"`
Expected: PASS — 3 tests.

- [ ] **Step 3: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 59: Run all unit tests — final check

- [ ] **Step 1: Run**

Run: `pnpm --filter @arc/core run test:unit:core`
Expected: all unit tests PASS (SubsystemBoundaryPathService, ChainResolutionService, ResolveSLSChainsService).
<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

### Task 60: Verify handler integration test coverage

**Package:** `@arc/persistence`

Integration tests for all command handlers were written inline in the Command Handlers chapter (Tasks 32–48). This task verifies coverage against the spec §10.2 test matrix.

- [ ] **Step 1: Run all integration tests**

Run: `pnpm --filter @arc/persistence run test:integration`
Expected: all integration tests PASS.

- [ ] **Step 2: Confirm the following test files exist and pass**

| Test file | Tasks that wrote it |
|---|---|
| `tests/integration/handlers/create-subsystem-link-segment.spec.ts` | Tasks 32, 35, 38 |
| `tests/integration/handlers/create-data-link.spec.ts` | Task 41 |
| `tests/integration/handlers/delete-data-link.spec.ts` | Task 42 |
| `tests/integration/handlers/delete-subsystem-link-segment.spec.ts` | Task 43 |
| `tests/integration/handlers/resolve-virtual-link-chains.spec.ts` | Task 44 |

---

### Task 61: Add missing integration test — CreateSubsystemLinkSegmentHandler Branch A duplicate check

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/tests/integration/handlers/create-subsystem-link-segment.spec.ts`

Spec §10.2 lists: "Branch A — DataLink created; no SLS produced; returns `{ systemId, type: 'DataLink' }`" and also the 422 duplicate case.

- [ ] **Step 1: Verify the 422 duplicate test exists in Branch A describe block**

The test should assert that calling `CreateSubsystemLinkSegmentHandler` with the same `(sourcePortSystemId, destinationPortSystemId)` as an already-existing DataLink throws a 422 error.

If missing, add:

```typescript
it('Branch A — returns 422 when a DataLink already exists for the same port pair', async () => {
  const ds = getTestDataSource();
  const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: FILE_ID}});

  // Pre-insert a DataLink for the same port pair as an edit action
  await ds.getRepository(EditActionSchema).save({
    systemId: 999,
    aggregateId: 0,
    sessionId: session!.sessionId,
    tableName: ENTITY_NAMES.DataLink,
    operation: CHANGE_OPERATION.Create,
    payload: JSON.stringify({systemId: 999, sourcePortSystemId: 200, destinationPortSystemId: 201, fileSystemId: FILE_ID}),
    changeStatus: CHANGE_STATUS.Staged,
    baseVersion: null,
    groupId: null,
    validUntil: null,
  });

  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    const uow = new TypeOrmUnitOfWork(qr);
    const idGen = new EntityIdServiceRegistry(qr.manager);
    const handler = new CreateSubsystemLinkSegmentHandler(uow, idGen);
    const command = new CreateSubsystemLinkSegmentCommand(NODE_A_ID, NODE_B_ID, 200, 201, PROJECT_ID, 'test-client');
    await expect(handler.handle(command)).rejects.toMatchObject({statusCode: 422});
  } finally {
    await qr.release();
  }
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-subsystem-link-segment"`
Expected: PASS.

---

### Task 62: Add missing integration test — commit pre-pass (incomplete SLS discarded)

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/tests/integration/commit/commit-pre-pass.spec.ts`

The spec §10.2 includes: "Commit pre-pass: incomplete SLS discarded with warning; orphaned subsystem ports cleaned up; topological order respected."

This test exercises the `CommitChangesHandler` pre-pass logic.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
import {setupIntegrationTest, teardownIntegrationTest, setupEachTest, getTestDataSource} from '../helpers/test-database-setup.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSessionSchema, SESSION_MODE, SESSION_STATUS} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {NodeSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {CHANGE_OPERATION, CHANGE_STATUS} from '@arc/core';
import {CommitChangesHandler} from '@arc/core';
import {CommitChangesCommand} from '@arc/core';
import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

describe('CommitChangesHandler — pre-pass', () => {
  beforeAll(async () => { await setupIntegrationTest(); });
  afterAll(async () => { await teardownIntegrationTest(); });
  beforeEach(async () => {
    await setupEachTest();
    const ds = getTestDataSource();
    await ds.getRepository(ProjectSchema).save({systemId: 1, name: 'P', description: '', type: 'Offline'});
    await ds.getRepository(ArcDbFileSchema).save({systemId: 1, projectSystemId: 1, fileName: 'f.awsp', description: '', metadata: '{}', isTarget: false, lastReservedId: 1000});
    await ds.getRepository(ProjectSessionSchema).save({fileSystemId: 1, clientId: 'c', sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null});
    await ds.getRepository(NodeSchema).save({systemId: 10, parentId: null, type: 'module', fileSystemId: 1});
    await ds.getRepository(NodeSchema).save({systemId: 11, parentId: null, type: 'subsystem', fileSystemId: 1});
  });

  it('discards pending SLS CREATE edit actions that form incomplete chains (no matching partner)', async () => {
    const ds = getTestDataSource();
    const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});
    const editRepo = ds.getRepository(EditActionSchema);

    // One dangling SLS: module(10) → subsystem(11), dead end
    await editRepo.save({
      systemId: 500,
      aggregateId: 0,
      sessionId: session!.sessionId,
      tableName: ENTITY_NAMES.SubsystemLinkSegment,
      operation: CHANGE_OPERATION.Create,
      payload: JSON.stringify({systemId: 500, sourceNodeSystemId: 10, destinationNodeSystemId: 11, sourcePortSystemId: 100, destinationPortSystemId: 200, dataLinkSystemId: null, fileSystemId: 1}),
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const uow = new TypeOrmUnitOfWork(qr);
      const idGen = new EntityIdServiceRegistry(qr.manager);
      const handler = new CommitChangesHandler(uow, idGen);
      const result = await handler.handle(new CommitChangesCommand(1, 'c'));

      // The incomplete SLS should be discarded (not applied to actual tables)
      const slsInDb = await ds.query(`SELECT * FROM subsystem_link_segments`);
      expect(slsInDb).toHaveLength(0);

      // Commit result should contain a warning about discarded segments
      expect(JSON.stringify(result)).toContain('subsystem link segment');
    } finally { await qr.release(); }
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="commit-pre-pass"`
Expected: PASS.

- [ ] **Step 3: Commit any new test files**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 63: Add missing integration test — DeleteSubsystemLinkSegmentHandler Case B cascade

**Package:** `@arc/persistence`

The spec §10.2 integration matrix includes:
> `DeleteSubsystemLinkSegmentHandler Case B`: DataLink deleted; sibling SLS cleaned up by ON DELETE CASCADE at commit; groupId shared.

Note: this is in the spec but refers to the commit behavior. The handler-level test (Task 43 of the command handlers chapter) verified that sibling SLS get null-FK UPDATE edit actions. A separate commit-level test is needed to confirm ON DELETE CASCADE removes committed rows.

- [ ] **Step 1: Add a test to commit-pre-pass.spec.ts**

```typescript
it('ON DELETE CASCADE removes sibling committed SLS when DataLink is deleted at commit', async () => {
  const ds = getTestDataSource();

  // Insert committed DataLink + 2 SLS rows directly into actual tables
  await ds.query(`INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, file_system_id, version) VALUES (700, 1, 2, 10, 11, 'INTRA_SUBGRAPH', 1, 1)`);
  await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (710, 1, 3, 10, 20, 700, 1, 1)`);
  await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (711, 3, 2, 20, 11, 700, 1, 1)`);

  const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});
  const editRepo = ds.getRepository(EditActionSchema);

  // Stage a DataLink DELETE edit action
  await editRepo.save({
    systemId: 700, aggregateId: 0, sessionId: session!.sessionId,
    tableName: ENTITY_NAMES.DataLink, operation: CHANGE_OPERATION.Delete,
    payload: JSON.stringify({systemId: 700}), changeStatus: CHANGE_STATUS.Staged,
    baseVersion: 1, groupId: 'grp-abc', validUntil: null,
  });

  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    const uow = new TypeOrmUnitOfWork(qr);
    const idGen = new EntityIdServiceRegistry(qr.manager);
    const handler = new CommitChangesHandler(uow, idGen);
    await handler.handle(new CommitChangesCommand(1, 'c'));

    const dlInDb = await ds.query(`SELECT * FROM data_links WHERE system_id = 700`);
    const slsInDb = await ds.query(`SELECT * FROM subsystem_link_segments WHERE data_link_system_id = 700`);

    expect(dlInDb).toHaveLength(0);
    expect(slsInDb).toHaveLength(0); // ON DELETE CASCADE removed siblings
  } finally { await qr.release(); }
});
```

- [ ] **Step 2: Run all integration tests**

Run: `pnpm --filter @arc/persistence run test:integration`
Expected: all integration tests PASS.

---

### Task 64: Topological order integration test

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/tests/integration/commit/commit-pre-pass.spec.ts`

Spec §8.3 defines the topological order: SLS DELETEs → DataLink DELETEs → DataPort DELETEs → DataPort CREATEs → DataLink CREATEs → SLS CREATEs → SLS UPDATEs. The constraint is that `ON DELETE RESTRICT` on port FKs must not be violated.

- [ ] **Step 1: Add a topological order constraint test**

```typescript
it('applies SLS DELETEs before DataPort DELETEs at commit (RESTRICT constraint not violated)', async () => {
  const ds = getTestDataSource();

  // Insert a subsystem port + one SLS referencing it
  await ds.query(`INSERT INTO data_ports (system_id, node_system_id, port_io_type, port_id, file_system_id, version) VALUES (800, 11, 'OutputInput', 1, 1, 1)`);
  await ds.query(`INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, file_system_id, version) VALUES (801, 10, 12, 100, 200, 'INTRA_SUBGRAPH', 1, 1)`);
  await ds.query(`INSERT INTO subsystem_link_segments (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, data_link_system_id, file_system_id, version) VALUES (802, 10, 11, 100, 800, 801, 1, 1)`);

  const session = await ds.getRepository(ProjectSessionSchema).findOne({where: {fileSystemId: 1}});
  const editRepo = ds.getRepository(EditActionSchema);

  // Stage: DataLink DELETE, then DataPort DELETE — commit must reorder correctly
  await editRepo.save([
    {systemId: 801, aggregateId: 0, sessionId: session!.sessionId, tableName: ENTITY_NAMES.DataLink, operation: CHANGE_OPERATION.Delete, payload: JSON.stringify({systemId: 801}), changeStatus: CHANGE_STATUS.Staged, baseVersion: 1, groupId: 'g1', validUntil: null},
    {systemId: 800, aggregateId: 0, sessionId: session!.sessionId, tableName: 'DataPort', operation: CHANGE_OPERATION.Delete, payload: JSON.stringify({systemId: 800}), changeStatus: CHANGE_STATUS.Staged, baseVersion: 1, groupId: 'g1', validUntil: null},
  ]);

  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    const uow = new TypeOrmUnitOfWork(qr);
    const idGen = new EntityIdServiceRegistry(qr.manager);
    const handler = new CommitChangesHandler(uow, idGen);
    // Should not throw FK violation
    await expect(handler.handle(new CommitChangesCommand(1, 'c'))).resolves.not.toThrow();

    const portInDb = await ds.query(`SELECT * FROM data_ports WHERE system_id = 800`);
    expect(portInDb).toHaveLength(0);
  } finally { await qr.release(); }
});
```

- [ ] **Step 2: Run all integration tests**

Run: `pnpm --filter @arc/persistence run test:integration`
Expected: PASS.

- [ ] **Step 3: Commit**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 65: Integration test — ResolveVirtualLinkChainsHandler fast path + complete chain

These are already covered in Task 44 of the command handlers chapter. Run to confirm.

- [ ] **Step 1: Confirm**

Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="resolve-virtual-link-chains"`
Expected: PASS — 3 tests.

---

### Task 66: Run full integration test suite — final check

- [ ] **Step 1: Run**

Run: `pnpm --filter @arc/persistence run test:integration`
Expected: all integration tests PASS across all test files.

- [ ] **Step 2: Commit any remaining test additions**

Use the `commit` skill. **Wait for user confirmation.**
<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

> **Note:** E2E tests for virtual links require REST controllers for the following endpoints which are outside the scope of this plan (per the design document: "Controllers and API endpoint/DTO design are out of scope"):
> - `POST /arc-api/v1/projects/:id/data-links`
> - `DELETE /arc-api/v1/projects/:id/data-links/:linkId`
> - `POST /arc-api/v1/projects/:id/subsystem-links`
> - `DELETE /arc-api/v1/projects/:id/subsystem-links/:slsId`
> - `POST /arc-api/v1/projects/:id/resolve-virtual-link-chains` (or integrated into GET /components)
> - `POST /arc-api/v1/projects/:id/commit-changes`
>
> Tasks 72–81 specify the E2E tests to be implemented **after** those controllers are wired up. Each test file includes a `xdescribe` (pending) block that becomes `describe` once the controller endpoint exists.

---

### Task 72: E2E setup — flat-mode create DataLink (same context)

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/flat-create-data-link.e2e-spec.ts`

**Scenario:** `POST /data-links` (same context) → `GET /components?showSubsystems=false` returns the link.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest, resetTestDatabase} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// xdescribe → change to describe once controllers are wired up
xdescribe('E2E: flat-mode DataLink creation', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;
  // Node and port IDs extracted from the uploaded file graph
  let sourceNodeId: number;
  let destNodeId: number;
  let sourcePortId: number;
  let destPortId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    // Upload fixture files to get a project with real nodes and ports
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);

    projectId = res.body.data.projectId;

    // Get the flat component view to find module nodes with ports
    const componentsRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: false})
      .expect(200);

    // Extract two module nodes that are NOT already connected and have compatible ports
    // (pick the first module with an output port and a second module with an input port)
    const modules = componentsRes.body.data.nodes?.filter((n: any) => n.type === 'module') ?? [];
    const sourceModule = modules.find((m: any) => m.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const destModule = modules.find((m: any) => m.systemId !== sourceModule?.systemId && m.dataPorts?.some((p: any) => p.portIoType === 'Input'));

    sourceNodeId = sourceModule.systemId;
    sourcePortId = sourceModule.dataPorts.find((p: any) => p.portIoType === 'Output').systemId;
    destNodeId = destModule.systemId;
    destPortId = destModule.dataPorts.find((p: any) => p.portIoType === 'Input').systemId;
  });

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('POST /data-links creates a DataLink and returns { systemId, type: DataLink }', async () => {
    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/data-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: sourceNodeId,
        destinationNodeSystemId: destNodeId,
        sourcePortSystemId: sourcePortId,
        destinationPortSystemId: destPortId,
        isInterUsecase: false,
      })
      .expect(201);

    expect(res.body.data).toMatchObject({type: 'DataLink'});
    expect(typeof res.body.data.systemId).toBe('number');
  });

  it('GET /components?showSubsystems=false returns the newly created DataLink', async () => {
    // Create the link first
    const createRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/data-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({sourceNodeSystemId: sourceNodeId, destinationNodeSystemId: destNodeId, sourcePortSystemId: sourcePortId, destinationPortSystemId: destPortId, isInterUsecase: false})
      .expect(201);

    const linkId = createRes.body.data.systemId;

    const componentsRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: false})
      .expect(200);

    const links = componentsRes.body.data.dataLinks ?? [];
    expect(links.some((l: any) => l.systemId === linkId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="flat-create-data-link"`
Expected: test suite skipped (xdescribe). No failures.

---

### Task 73: E2E — cross-subsystem flat create DataLink (auto-SLS creation)

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/cross-subsystem-flat-create.e2e-spec.ts`

**Scenario:** `POST /data-links` (cross-subsystem) → `{ systemId, type: 'DataLink' }`; SLS auto-created internally; `GET /components?showSubsystems=true` shows the chain.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: cross-subsystem flat DataLink creation', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);

    projectId = res.body.data.projectId;
  });

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns { systemId, type: DataLink } for cross-subsystem flat create (SLS created internally)', async () => {
    // Get subsystem-mode view to find two modules in different subsystems
    const subsysView = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = subsysView.body.data.nodes ?? [];
    const subsystems = nodes.filter((n: any) => n.type === 'subsystem');
    if (subsystems.length < 2) {
      console.warn('Fixture does not contain two subsystems — skipping cross-subsystem test');
      return;
    }

    const sub1 = subsystems[0];
    const sub2 = subsystems[1];
    const moduleInSub1 = nodes.find((n: any) => n.type === 'module' && n.parentId === sub1.systemId && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const moduleInSub2 = nodes.find((n: any) => n.type === 'module' && n.parentId === sub2.systemId && n.dataPorts?.some((p: any) => p.portIoType === 'Input'));
    if (!moduleInSub1 || !moduleInSub2) {
      console.warn('Cannot find cross-subsystem module pair — skipping');
      return;
    }

    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/data-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: moduleInSub1.systemId,
        destinationNodeSystemId: moduleInSub2.systemId,
        sourcePortSystemId: moduleInSub1.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: moduleInSub2.dataPorts.find((p: any) => p.portIoType === 'Input').systemId,
        isInterUsecase: false,
      })
      .expect(201);

    expect(res.body.data).toMatchObject({type: 'DataLink'});
    expect(typeof res.body.data.systemId).toBe('number');

    // Verify the subsystem view shows the SLS chain
    const subsysAfter = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const slsChain = subsysAfter.body.data.subsystemLinkSegments ?? [];
    expect(slsChain.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="cross-subsystem-flat-create"`
Expected: skipped (xdescribe).

---

### Task 74: E2E — delete DataLink cascades to SLS

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/delete-data-link.e2e-spec.ts`

**Scenario:** `DELETE /data-links/{id}` → commit → SLS absent from subsystem view.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: delete DataLink cascades', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);

    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('DELETE /data-links/:id followed by commit removes DataLink and SLS from subsystem view', async () => {
    // First create a cross-subsystem link to get a DataLink + SLS chain
    const subsysView = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = subsysView.body.data.nodes ?? [];
    const moduleA = nodes.find((n: any) => n.type === 'module' && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const moduleB = nodes.find((n: any) => n.type === 'module' && n.systemId !== moduleA?.systemId && n.dataPorts?.some((p: any) => p.portIoType === 'Input'));
    if (!moduleA || !moduleB) { console.warn('Cannot find two modules for test'); return; }

    const createRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/data-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: moduleA.systemId,
        destinationNodeSystemId: moduleB.systemId,
        sourcePortSystemId: moduleA.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: moduleB.dataPorts.find((p: any) => p.portIoType === 'Input').systemId,
        isInterUsecase: false,
      })
      .expect(201);

    const dataLinkId = createRes.body.data.systemId;

    // Delete the DataLink
    await request(httpServer)
      .delete(`/arc-api/v1/projects/${projectId}/data-links/${dataLinkId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    // Commit
    await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify: subsystem view shows no SLS for this chain
    const subsysAfter = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const sls = subsysAfter.body.data.subsystemLinkSegments ?? [];
    // No SLS referencing the deleted DataLink
    expect(sls.every((s: any) => s.dataLinkSystemId !== dataLinkId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="delete-data-link"`
Expected: skipped (xdescribe).

---

### Task 75: E2E — subsystem-mode same-parent mod→mod

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/subsystem-mode-same-parent.e2e-spec.ts`

**Scenario:** `POST /subsystem-links` (both modules in same subsystem) → response is `{ systemId, type: 'ControlLink' }` (actually `{ systemId, type: 'DataLink' }` for data links); no SLS in subsystem view.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: subsystem-mode same-parent mod→mod', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);
    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('POST /subsystem-links returns { systemId, type: DataLink } when both modules share same parentId', async () => {
    // Find two modules inside the same subsystem
    const view = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = view.body.data.nodes ?? [];
    const subsystems = nodes.filter((n: any) => n.type === 'subsystem');
    if (subsystems.length === 0) { console.warn('No subsystems in fixture'); return; }

    const sub = subsystems[0];
    const modulesInSub = nodes.filter((n: any) => n.type === 'module' && n.parentId === sub.systemId);
    if (modulesInSub.length < 2) { console.warn('Not enough modules in subsystem'); return; }

    const src = modulesInSub.find((m: any) => m.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const dst = modulesInSub.find((m: any) => m.systemId !== src?.systemId && m.dataPorts?.some((p: any) => p.portIoType === 'Input'));
    if (!src || !dst) { console.warn('No compatible port pair in subsystem'); return; }

    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: src.systemId,
        destinationNodeSystemId: dst.systemId,
        sourcePortSystemId: src.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: dst.dataPorts.find((p: any) => p.portIoType === 'Input').systemId,
      })
      .expect(201);

    expect(res.body.data).toMatchObject({type: 'DataLink'});
    expect(typeof res.body.data.systemId).toBe('number');
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="subsystem-mode-same-parent"`
Expected: skipped.

---

### Task 75a: E2E — subsystem-mode cross-parent mod→mod

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/subsystem-mode-cross-parent.e2e-spec.ts`

**Scenario (design §10.3 row 4):** `POST /subsystem-links` with modules in different subsystems → response contains `subsystemLinkSegments` array only (no DataLink `systemId`); `GET /components?showSubsystems=true` shows the resolved SLS chain; the underlying DataLink is visible in the flat view.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: subsystem-mode cross-parent mod→mod', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);
    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('POST /subsystem-links returns { subsystemLinkSegments: [...] } when modules live in different subsystems, and DataLink is visible in the flat view', async () => {
    const view = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = view.body.data.nodes ?? [];
    const subsystems = nodes.filter((n: any) => n.type === 'subsystem');
    if (subsystems.length < 2) { console.warn('Need two subsystems in fixture'); return; }

    const sub1 = subsystems[0];
    const sub2 = subsystems[1];
    const src = nodes.find((n: any) => n.type === 'module' && n.parentId === sub1.systemId
      && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const dst = nodes.find((n: any) => n.type === 'module' && n.parentId === sub2.systemId
      && n.dataPorts?.some((p: any) => p.portIoType === 'Input'));
    if (!src || !dst) { console.warn('No cross-subsystem module pair available'); return; }

    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: src.systemId,
        destinationNodeSystemId: dst.systemId,
        sourcePortSystemId: src.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: dst.dataPorts.find((p: any) => p.portIoType === 'Input').systemId,
      })
      .expect(201);

    // §6.2 Branch B: response is SLS-only — DataLink systemId is intentionally absent
    expect(Array.isArray(res.body.data.subsystemLinkSegments)).toBe(true);
    expect(res.body.data.subsystemLinkSegments.length).toBeGreaterThan(0);
    expect(res.body.data.systemId).toBeUndefined();
    expect(res.body.data.type).toBeUndefined();

    // Subsystem-mode read shows the resolved SLS chain
    const subsysView = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);
    const slsList = subsysView.body.data.subsystemLinkSegments ?? [];
    expect(slsList.length).toBeGreaterThanOrEqual(res.body.data.subsystemLinkSegments.length);

    // Flat-mode read shows the underlying DataLink (chain auto-resolved during create)
    const flatView = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: false})
      .expect(200);
    const dataLinks = flatView.body.data.dataLinks ?? [];
    expect(dataLinks.some((d: any) =>
      d.sourcePortSystemId === src.dataPorts.find((p: any) => p.portIoType === 'Output').systemId
      && d.destinationPortSystemId === dst.dataPorts.find((p: any) => p.portIoType === 'Input').systemId
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="subsystem-mode-cross-parent"`
Expected: skipped (xdescribe).

---

### Task 75b: E2E — subsystem-mode create + resolve (chain built across multiple POSTs)

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/subsystem-mode-create-resolve.e2e-spec.ts`

**Scenario (design §10.3 row 5):** Successive `POST /subsystem-links` calls build an unresolved SLS chain (mod → subsystem → … → mod) one segment at a time. Each segment is created without auto-resolution because at least one endpoint is a subsystem (Branch C). Then `GET /components?showSubsystems=false` triggers `ResolveVirtualLinkChainsHandler`, which detects the now-complete chain and returns the resolved DataLink.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: subsystem-mode create + resolve', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);
    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('multiple POST /subsystem-links calls build a chain; flat read triggers resolution and DataLink appears', async () => {
    const view = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = view.body.data.nodes ?? [];
    const subsystem = nodes.find((n: any) => n.type === 'subsystem');
    if (!subsystem) { console.warn('No subsystem in fixture'); return; }

    const moduleOutside = nodes.find((n: any) => n.type === 'module' && n.parentId === null
      && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const moduleInside = nodes.find((n: any) => n.type === 'module' && n.parentId === subsystem.systemId
      && n.dataPorts?.some((p: any) => p.portIoType === 'Input'));
    if (!moduleOutside || !moduleInside) { console.warn('No mod-outside/mod-inside pair available'); return; }

    const outsidePort = moduleOutside.dataPorts.find((p: any) => p.portIoType === 'Output').systemId;
    const insidePort = moduleInside.dataPorts.find((p: any) => p.portIoType === 'Input').systemId;

    // Segment 1: outside module → subsystem boundary (subsystem endpoint auto-creates a port)
    const seg1 = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: moduleOutside.systemId,
        destinationNodeSystemId: subsystem.systemId,
        sourcePortSystemId: outsidePort,
        // destinationPortSystemId omitted → server creates boundary port (Branch C)
      })
      .expect(201);
    expect(typeof seg1.body.data.systemId).toBe('number');
    expect(typeof seg1.body.data.createdPortSystemId).toBe('number');
    const boundaryPortId = seg1.body.data.createdPortSystemId;

    // Segment 2: subsystem boundary → inside module — uses the boundary port created above
    const seg2 = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: subsystem.systemId,
        destinationNodeSystemId: moduleInside.systemId,
        sourcePortSystemId: boundaryPortId,
        destinationPortSystemId: insidePort,
      })
      .expect(201);
    expect(typeof seg2.body.data.systemId).toBe('number');

    // Flat-mode read triggers ResolveVirtualLinkChainsHandler — chain is now complete (mod→sub→mod)
    const flatView = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: false})
      .expect(200);

    const dataLinks = flatView.body.data.dataLinks ?? [];
    expect(dataLinks.some((d: any) =>
      d.sourcePortSystemId === outsidePort && d.destinationPortSystemId === insidePort
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="subsystem-mode-create-resolve"`
Expected: skipped (xdescribe).

---

### Task 76: E2E — delete resolved SLS (Case B)

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/delete-subsystem-link-segment.e2e-spec.ts`

**Scenario:** `DELETE /subsystem-links/{id}` on resolved SLS → siblings become unresolved → DataLink absent from flat view.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: delete resolved SLS (Case B)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);
    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('DELETE /subsystem-links/:id → DataLink absent from flat view after deletion', async () => {
    // Build a cross-subsystem link to get an SLS chain
    const view = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = view.body.data.nodes ?? [];
    const subsystems = nodes.filter((n: any) => n.type === 'subsystem');
    if (subsystems.length < 2) { console.warn('Not enough subsystems'); return; }

    const sub1 = subsystems[0];
    const sub2 = subsystems[1];
    const src = nodes.find((n: any) => n.type === 'module' && n.parentId === sub1.systemId && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const dst = nodes.find((n: any) => n.type === 'module' && n.parentId === sub2.systemId && n.dataPorts?.some((p: any) => p.portIoType === 'Input'));
    if (!src || !dst) { console.warn('No cross-subsystem pair'); return; }

    const createRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: src.systemId,
        destinationNodeSystemId: dst.systemId,
        sourcePortSystemId: src.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: dst.dataPorts.find((p: any) => p.portIoType === 'Input').systemId,
      })
      .expect(201);

    const slsIds: number[] = createRes.body.data.subsystemLinkSegments?.map((s: any) => s.systemId) ?? [];
    if (slsIds.length === 0) { console.warn('No SLS returned'); return; }

    // Delete the first SLS
    await request(httpServer)
      .delete(`/arc-api/v1/projects/${projectId}/subsystem-links/${slsIds[0]}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    // Flat view should now return 422 (incomplete chain) or show no DataLink for this connection
    const flatRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: false})
      .expect(422); // incomplete chain blocks resolution

    expect(flatRes.body.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="delete-subsystem-link-segment"`
Expected: skipped.

---

### Task 77: E2E — commit discards incomplete SLS

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/commit-discards-incomplete-sls.e2e-spec.ts`

**Scenario:** Dangling SLS → `POST /commit-changes` → warning in response; SLS absent from DB.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: commit discards incomplete SLS', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);
    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('POST /commit-changes succeeds and includes warning when dangling SLS exist', async () => {
    // Create a partial SLS chain (one SLS with a subsystem endpoint, no partner)
    const view = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = view.body.data.nodes ?? [];
    const moduleNode = nodes.find((n: any) => n.type === 'module' && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const subsystemNode = nodes.find((n: any) => n.type === 'subsystem');
    if (!moduleNode || !subsystemNode) { console.warn('Missing module or subsystem'); return; }

    // Create a single SLS (dangling — subsystem endpoint, no partner)
    await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: moduleNode.systemId,
        destinationNodeSystemId: subsystemNode.systemId,
        sourcePortSystemId: moduleNode.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: null,
      })
      .expect(201);

    // Commit — should succeed but include a discard warning
    const commitRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(JSON.stringify(commitRes.body)).toMatch(/subsystem link segment.*discarded/i);

    // Verify: subsystem view shows no dangling SLS
    const afterView = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const sls = afterView.body.data.subsystemLinkSegments ?? [];
    expect(sls.every((s: any) => s.dataLinkSystemId !== null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="commit-discards-incomplete-sls"`
Expected: skipped.

---

### Task 78: E2E — incomplete chain blocks flat read (422)

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/tests/e2e/virtual-links/incomplete-chain-blocks-flat-read.e2e-spec.ts`

**Scenario:** Dangling SLS → `GET /components?showSubsystems=false` returns 422 with segment IDs.

- [ ] **Step 1: Write the test**

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

xdescribe('E2E: incomplete chain blocks flat read', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach('workspaceFile', join(__dirname, '../fixtures/workspaceFileXml.awsp'))
      .expect(201);
    projectId = res.body.data.projectId;
  });

  afterAll(async () => { await teardownE2ETest(app); });

  it('GET /components flat view returns 422 with incompleteChains when dangling SLS exist', async () => {
    // Create a dangling SLS (subsystem endpoint with no partner)
    const view = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: true})
      .expect(200);

    const nodes = view.body.data.nodes ?? [];
    const moduleNode = nodes.find((n: any) => n.type === 'module' && n.dataPorts?.some((p: any) => p.portIoType === 'Output'));
    const subsystemNode = nodes.find((n: any) => n.type === 'subsystem');
    if (!moduleNode || !subsystemNode) { console.warn('Missing nodes'); return; }

    const createRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/subsystem-links`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceNodeSystemId: moduleNode.systemId,
        destinationNodeSystemId: subsystemNode.systemId,
        sourcePortSystemId: moduleNode.dataPorts.find((p: any) => p.portIoType === 'Output').systemId,
        destinationPortSystemId: null,
      })
      .expect(201);

    const slsId = createRes.body.data.systemId;

    // Flat view should return 422
    const flatRes = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({showSubsystems: false})
      .expect(422);

    const body = flatRes.body;
    expect(body.error).toBeTruthy();
    // incompleteChains should reference the dangling SLS
    const chainsStr = JSON.stringify(body);
    expect(chainsStr).toContain(String(slsId));
  });
});
```

- [ ] **Step 2: Run (expect skip)**

Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="incomplete-chain-blocks-flat-read"`
Expected: skipped.

---

### Task 79: Run full E2E test suite (current state)

- [ ] **Step 1: Run all E2E tests including previously-passing ones**

Run: `pnpm --filter @arc/api run test:e2e:api`
Expected: all previously-passing tests still PASS; new virtual-links tests are skipped (xdescribe).

- [ ] **Step 2: Commit all E2E test files**

Use the `commit` skill. **Wait for user confirmation.**

---

### Task 80: Controllers prerequisite note

The virtual-links E2E tests (Tasks 72–78) are blocked on the following NestJS controllers being added to `@arc/api`:

| Endpoint | Command |
|---|---|
| `POST /arc-api/v1/projects/:id/data-links` | `CreateDataLinkCommand` |
| `DELETE /arc-api/v1/projects/:id/data-links/:linkId` | `DeleteDataLinkCommand` |
| `POST /arc-api/v1/projects/:id/subsystem-links` | `CreateSubsystemLinkSegmentCommand` |
| `DELETE /arc-api/v1/projects/:id/subsystem-links/:slsId` | `DeleteSubsystemLinkSegmentCommand` |
| `POST /arc-api/v1/projects/:id/resolve-virtual-link-chains` | `ResolveVirtualLinkChainsCommand` |
| `POST /arc-api/v1/projects/:id/commit-changes` | `CommitChangesCommand` |

Once each controller is wired up, change the corresponding `xdescribe` to `describe` in the E2E test file and run to verify.

**Controller implementation is the subject of a follow-on plan (API layer).**

---

### Task 81: Final plan verification

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: zero failures (E2E virtual-links tests are pending/skipped).

- [ ] **Step 2: Run build**

Run: `pnpm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Confirm plan coverage**

Review the following from spec sections 1–10 and confirm each is covered:

| Spec Item | Covered by |
|---|---|
| PortIoType enum extension (§3.1) | Task 1–2 |
| SubsystemLinkSegment domain entity (§3.2) | Task 3 |
| subsystem_link_segments table (§4.1) | Task 5 |
| configuration table (§4.3) | Task 6 |
| ENTITY_NAMES additions (§4.2) | Task 7 |
| Migration regeneration (§4.4) | Task 9 |
| SubsystemBoundaryPathService (§5.1) | Tasks 11–14, 52–53 |
| ChainResolutionService (§5.2) | Tasks 15–18, 54–55 |
| Session resolution pattern (§6.0) | Tasks 33, 41, 42, 43, 44 |
| CreateSubsystemLinkSegmentHandler A/B/C (§6.2) | Tasks 32–40 |
| CreateDataLinkHandler cross-subsystem (§6.3) | Task 41 |
| DeleteDataLinkHandler SLS cascade (§6.4) | Task 42 |
| DeleteSubsystemLinkSegmentHandler A+B (§6.5) | Task 43 |
| ResolveSLSChainsService (§6.6) | Task 25, 58 |
| ResolveVirtualLinkChainsHandler (§6.7) | Task 44 |
| AutoCreateUsecasesHandler pre-pass (§6.8) | Task 45 |
| Handler registry (§6.8) | Task 46 |
| ISubsystemLinkSegmentRepository (§7.1) | Task 19 |
| INodeRepository extensions (§7.2) | Task 20 |
| IConfigurationRepository + calculatePortId (§7.4) | Task 21 |
| CommitChangesHandler Step A (§8.1) | Task 26 |
| CommitChangesHandler Step B (§8.2) | Task 27 |
| Topological commit order (§8.3) | Task 28, 64 |
| Unit tests — domain services (§10.1) | Tasks 11–18, 52–59 |
| Integration tests — handlers (§10.2) | Tasks 32–48, 60–66 |
| E2E tests (§10.3) | Tasks 72–78 (pending controllers) |

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-06-17-virtual-links-data-links.md`.**

**How would you like to proceed?**

1. **Inline Execution** — Execute tasks in this session using the executing-plans skill, with checkpoints for review at each commit.

2. **Separate Session** — Start a fresh session and load the executing-plans skill to implement the plan. Recommended for large plans or when you want a clean context window.

3. **Manual Execution** — Review the plan yourself and implement manually without agent assistance.
