---
name: bulk-inserter-pattern
description: >
  Use when implementing a new bulk inserter in the AudioReach Creator Backend
  (packages/infrastructure/persistence). Covers the full TDD pattern: write
  integration tests first, then implement StepResult skip-sets, groupRawFailures,
  BatchInserter, BinaryUtils.toHexString, and Promise.all parallelism. Trigger
  when the user asks to "add an inserter", "implement insertXxx", "wire up a
  bulk insert", or wants to persist a new entity type through BulkImportRepository.
---

# Implementing a Bulk Inserter

This skill guides implementation of a new inserter following the established
pattern in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/`.

**The order matters: tests first, implementation second.**

## Before you start — read these files

Always read these to understand the exact types before writing any code:

1. **Shared framework** (already built):
   - `…/bulk-import/common/step-result.ts` — `StepResult` interface
   - `…/bulk-import/common/group-raw-failures.ts` — `groupRawFailures` function
   - `…/bulk-import/batch-inserter.ts` — `BatchInserter`, `InsertRow`, `RawFailure`

2. **Domain class(es)** for the aggregate you're inserting. Check whether the
   domain type is actually exported from `@arc/core` — look in
   `packages/core/src/index.ts`. If it isn't exported yet, ask the caller to
   confirm the shape before writing the inserter. Do NOT assume a domain type
   is in `@arc/core` without verifying.

3. **Schema file(s)** for the aggregate and every child table — the exact TypeScript
   property names matter. Always verify by reading the file, not from memory.

4. **`id-generation.port.ts`** if you need `idGeneration` — check the exact
   signature of `getNextId`. Do NOT call `reserveBlock` inside an inserter; the
   upload orchestrator does a blanket reservation upfront that covers all IDs.

5. **An existing inserter** as a reference. `key-definition.inserter.ts` is a good
   two-step example. `tag-definition.inserter.ts` shows the `getNextId` pattern
   for value objects. `vcpm-module-definition.inserter.ts` shows `Promise.all`
   for parallel child steps.

6. **An existing test** as a reference:
   `tests/integration/bulk-import/spf-module-ckv.spec.ts` — shows the full test
   structure: FK seeding, domain entity builders, and the four test case types.

---

## Step 1: Write the integration test first

**File:** `tests/integration/bulk-import/<entity-name>.spec.ts`

The test runs against an in-memory SQLite DB (no mocks, no migrations needed —
the DB is created from schemas via `synchronize: true`). Write all four test cases
before touching the inserter implementation. They will all fail with
"Cannot find module './my-entity.inserter.js'" — that's the expected starting state.

### Test file structure

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {MyEntityInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/my-entity/my-entity.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
// Add other FK dependency IDs as needed

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedFkDependencies(manager: EntityManager): Promise<void> {
  await manager.insert('Project', {
    systemId: 1, name: 'Test', description: '', type: 'Offline', version: 1,
  });
  await manager.insert('ArcDbFile', {
    systemId: FILE_ID, projectSystemId: 1, fileName: 'test.awsp',
    description: '', metadata: '{}', isTarget: 0, lastReservedId: 0, version: 1,
  });
  // Seed any other FK rows the entity's schema requires (nodes, definitions, etc.)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MyEntityInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: MyEntityInserter;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    manager = dataSource.manager;
    await seedFkDependencies(manager);
    inserter = new MyEntityInserter(manager);  // pass idGeneration if needed
  });

  // ── Test 1: empty input ──────────────────────────────────────────────────

  it('returns ok immediately for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(`SELECT * FROM my_entity_table`);
    expect(rows).toHaveLength(0);
  });

  // ── Test 2: happy path ───────────────────────────────────────────────────

  it('inserts all rows and returns ok', async () => {
    const entity = buildMyEntity(1001);  // helper that constructs domain object

    const result = await inserter.insert([entity]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    const rows = await dataSource.query(
      `SELECT * FROM my_entity_table WHERE system_id = 1001`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].some_column).toBe(expectedValue);
    // For two-level: also query the child table
  });

  // ── Test 3: failure is reported with aggregate natural ID ─────────────────

  it('reports failure grouped under the aggregate natural ID', async () => {
    // Force a failure: insert a row with the same systemId first to cause a UNIQUE conflict
    await manager.insert('MyEntityTable', {systemId: 1002, /* minimal cols */ version: 1});

    const entity = buildMyEntity(1002);  // duplicate systemId → will fail
    const result = await inserter.insert([entity]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('MyEntity');
    expect(result.errors[0].message).toContain('myNaturalId');  // natural ID in message
  });

  // ── Test 4: failure isolation (sibling entities survive) ─────────────────

  it('good sibling inserts successfully when one entity fails', async () => {
    // First entity: pre-seed a conflict so it fails
    await manager.insert('MyEntityTable', {systemId: 1003, /* minimal cols */ version: 1});
    const bad = buildMyEntity(1003);   // will fail — duplicate

    const good = buildMyEntity(1004);  // unique — should succeed

    const result = await inserter.insert([bad, good]);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);   // only the bad one fails

    const goodRows = await dataSource.query(
      `SELECT * FROM my_entity_table WHERE system_id = 1004`,
    );
    expect(goodRows).toHaveLength(1);   // good entity was inserted
  });
});
```

### For two-level inserters: add a fifth test case

```typescript
  // ── Test 5: parent failure skips children ─────────────────────────────────

  it('skips child rows when their parent fails', async () => {
    // Pre-seed a conflict so the root entity fails
    await manager.insert('MyEntityTable', {systemId: 1005, version: 1});

    const entity = buildMyEntityWithChildren(1005, [
      {systemId: 2001, /* child fields */ },
    ]);

    await inserter.insert([entity]);

    // No child rows should exist — they were skipped, not attempted
    const childRows = await dataSource.query(
      `SELECT * FROM my_child_table WHERE parent_system_id = 1005`,
    );
    expect(childRows).toHaveLength(0);
  });
```

### Run the tests — confirm they fail

```bash
pnpm --filter @arc/persistence run test:integration -- --testPathPattern="my-entity.spec.ts"
```

Expected: **FAIL** — "Cannot find module './my-entity.inserter.js'"

Only after all four (or five) tests are written and confirmed to fail, proceed to Step 2.

---

## Step 2: Implement the inserter

**File:** `repositories/bulk-import/<entity-name>/<entity-name>.inserter.ts`

### Class skeleton

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, MyEntity} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {BatchInserter, type InsertRow, type RawFailure} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {MyEntitySchema, type MyEntityRow} from '../../../entity-schema/…/my-entity.schema.js';

export class MyEntityInserter {
  // Only include idGeneration if this inserter actually calls getNextId.
  // If no generated IDs are needed, omit it entirely.
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,  // omit if unused
  ) {}

  async insert(items: MyEntity[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));

    const rootStep = await this.insertMyEntities(items);

    // NEVER skip this filter — it is what prevents FK noise from failed parents
    const activeItems = items.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const childStep = await this.insertChildren(activeItems);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...childStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      bySystemId,
      item =>
        `MyEntity (myNaturalId=${BinaryUtils.toHexString(item.myNaturalId)}, name='${item.name}')`,
    );
  }
```

### Run the tests — confirm they pass

```bash
pnpm --filter @arc/persistence run test:integration -- --testPathPattern="my-entity.spec.ts"
```

Expected: **PASS** for all cases.

---

## Constructor rule

Only include `idGeneration: IdGenerationPort` when the inserter calls `getNextId`.
If no generated IDs are needed (all systemIds are pre-assigned), omit it entirely.
Do NOT include it with an underscore prefix — a parameter that is never used has no
place in the constructor.

```typescript
// Inserter that generates IDs — include idGeneration
constructor(
  private readonly manager: EntityManager,
  private readonly idGeneration: IdGenerationPort,
) {}

// Flat inserter or one with only pre-assigned systemIds — omit idGeneration
constructor(
  private readonly manager: EntityManager,
) {}
```

The repository call site must match:
```typescript
// With idGeneration:
return new TagDefinitionInserter(this.manager, this.idGeneration).insert([...items]);

// Without:
return new ProcessorDefinitionInserter(this.manager).insert([...items]);
```

For inserters that use `idGeneration`, the test needs a mock:
```typescript
function makeIdGenerator(): IdGenerationPort {
  let counter = 9000;
  return {
    getNextId: async () => ++counter,
    reserveBlock: async () => counter,
    persistLastUsedId: async () => undefined,
  };
}
// Used as: inserter = new MyEntityInserter(manager, makeIdGenerator());
```

---

## StepResult contract

Every private step method must return `StepResult`:

```typescript
interface StepResult {
  rawFailures: RawFailure[];
  failedEntityIds: Set<number>; // systemIds of entities that failed AT THIS STEP
}
```

`failedEntityIds` contains the **entity-level** systemIds, not the aggregate root's.
The aggregate root's systemId goes into `rawFailure.systemId` for error grouping.
These two are the same for flat inserters; they differ for multi-level hierarchies.

---

## Anatomy of a step method

```typescript
private async insertMyChildren(
  items: MyEntity[],
  skipParentIds?: Set<number>,  // omit if no parent skip needed
): Promise<StepResult> {
  const contextBySystemId = new Map<number, {parent: MyEntity; childId: number}>();

  const rows: InsertRow<MyChildRow>[] = items.flatMap(parent => {
    if (skipParentIds?.has(parent.someGeneratedId)) return [];
    return parent.children.map(child => {
      const row: InsertRow<MyChildRow> = {
        systemId: child.systemId,       // pre-assigned
        childNaturalId: child.childNaturalId,
        parentSystemId: parent.systemId,
      };
      contextBySystemId.set(row.systemId, {parent, childId: child.childNaturalId});
      return row;
    });
  });

  if (rows.length === 0) return {rawFailures: [], failedEntityIds: new Set()};

  const {failedEntities} = await BatchInserter.insert(
    this.manager,
    MyChildSchema,
    rows,
  );

  const rawFailures: RawFailure[] = failedEntities.map(error => {
    const ctx = contextBySystemId.get(error.systemId)!;
    const row = rows.find(r => r.systemId === error.systemId)!;
    return {
      systemId: ctx.parent.systemId,    // ← always the AGGREGATE ROOT systemId
      entityLabel: 'MyChild',
      failedRowJson: `(parentId=${BinaryUtils.toHexString(ctx.parent.myNaturalId)}, childId=${BinaryUtils.toHexString(ctx.childId)}) Row: ${JSON.stringify(row)}`,
      dbError: error.message,
    };
  });

  return {
    rawFailures,
    failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
  };
}
```

---

## idGeneration pattern (for value objects without domain systemId)

The upload orchestrator performs a blanket `reserveBlock` before the entire
pipeline runs. Do NOT call `reserveBlock` inside an inserter. Just call
`getNextId` directly when you need a generated ID.

Since `getNextId` is async, use a `for` loop rather than `flatMap`:

```typescript
const rows: InsertRow<ChildRow>[] = [];
for (const parent of items) {
  for (const child of parent.children) {
    const systemId = await this.idGeneration.getNextId(parent.fileSystemId);
    contextBySystemId.set(systemId, {parent, childNaturalId: child.naturalId});
    rows.push({systemId, ...});
  }
}
```

---

## Promise.all pattern for independent child steps

```typescript
const [stepA, stepB, stepC] = await Promise.all([
  this.insertParamsStep(activeItems),
  this.insertAttributesStep(activeItems),
  this.insertLinksStep(activeItems),
]);

// Steps that depend on stepA run after Promise.all resolves:
const stepD = await this.insertGrandchildren(
  activeItems,
  stepA.failedEntityIds,
  parentToGeneratedIdMap,
);
```

When a step must return both a `StepResult` and a context map:
```typescript
interface StepWithContextResult {
  stepResult: StepResult;
  parentToGeneratedId: Map<ParentType, number>;
}
```

---

## failedRowJson format

```typescript
// Root entity:
`(naturalId=${BinaryUtils.toHexString(entity.naturalId)}) Row: ${JSON.stringify(row)}`

// Child:
`(rootId=${BinaryUtils.toHexString(root.naturalId)}, childId=${BinaryUtils.toHexString(child.naturalId)}) Row: ${JSON.stringify(row)}`
```

## Aggregate label (for groupRawFailures)

```typescript
item => `SpfModuleDefinition (moduleDefinitionId=${BinaryUtils.toHexString(item.moduleDefinitionId)}, name='${item.name}')`
item => `KeyDefinition (keyId=${BinaryUtils.toHexString(item.keyId)}, name='${item.name}')`
item => `ProcessorDefinition (processorDefinitionId=${BinaryUtils.toHexString(item.processorDefinitionId)})`
```

---

## Flat inserters (no children, no skip-sets)

```typescript
async insert(items: SimpleEntity[]): Promise<BulkInsertResult> {
  if (items.length === 0) return okBulkInsert();
  const bySystemId = new Map(items.map(i => [i.systemId, i]));
  const step = await this.insertSimpleEntities(items);
  return groupRawFailures(step.rawFailures, bySystemId,
    i => `SimpleEntity (naturalId=${BinaryUtils.toHexString(i.naturalId)})`);
}
```

Flat inserters need only 4 test cases (no Test 5 — there are no children to skip).

---

## Step 3: Wire into the repository

Update `typeorm-bulk-import.repository.ts`:

```typescript
// Add import:
import {MyEntityInserter} from './my-entity/my-entity.inserter.js';

// Replace stub:
insertMyEntities(items: readonly MyEntity[]): Promise<BulkInsertResult> {
  return new MyEntityInserter(this.manager).insert([...items]);
  // or: new MyEntityInserter(this.manager, this.idGeneration).insert([...items]);
}
```

---

## Code rules

- ESM imports: **all intra-package imports use `.js` extension**
- Copyright header: `/* Copyright (c) Qualcomm Technologies... BSD-3-Clause */`
- No comments explaining what the code does
- Use `BinaryUtils.toHexString()` for all IDs — import `BinaryUtils` from `@arc/core`
- Only include `idGeneration` in constructor when the inserter calls `getNextId`
- Do NOT call `reserveBlock` — the orchestrator handles the blanket reservation
- Always return `{rawFailures: [], failedEntityIds: new Set()}` for empty collections

---

## Checklist before submitting

- [ ] Integration test file written before any implementation
- [ ] All 4 test cases present (5 for two-level inserters)
- [ ] Tests confirmed failing before writing the inserter
- [ ] Tests passing after implementing the inserter
- [ ] Step methods return `StepResult` (not `RawFailure[]`)
- [ ] `activeItems` filter is present after every root step
- [ ] `idGeneration` only in constructor if `getNextId` is called
- [ ] No `reserveBlock` calls anywhere in the inserter
- [ ] `rawFailure.systemId` is always the **aggregate root** systemId
- [ ] `failedEntityIds` contains entity-level systemIds at that step's level
- [ ] `failedRowJson` includes natural IDs + full `JSON.stringify(row)`
- [ ] `BinaryUtils.toHexString()` used for all IDs (imported from `@arc/core`)
- [ ] All imports use `.js` extension
- [ ] Repository stub replaced with live call


# Implementing a Bulk Inserter

This skill guides implementation of a new inserter following the established
pattern in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/`.

## Before you start — read these files

Always read these to understand the exact types before writing code:

1. **Shared framework** (already built):
   - `…/bulk-import/common/step-result.ts` — `StepResult` interface
   - `…/bulk-import/common/group-raw-failures.ts` — `groupRawFailures` function
   - `…/bulk-import/batch-inserter.ts` — `BatchInserter`, `InsertRow`, `RawFailure`

2. **Domain class(es)** for the aggregate you're inserting. Check whether the
   domain type is actually exported from `@arc/core` — look in
   `packages/core/src/index.ts`. If it isn't exported yet, ask the caller to
   confirm the shape before writing the inserter. Do NOT assume a domain type
   is in `@arc/core` without verifying.

3. **Schema file(s)** for the aggregate and every child table — the exact TypeScript
   property names matter; they changed from the original names during the audit.
   Always verify by reading the file, not from memory.

4. **`id-generation.port.ts`** if you need `idGeneration` — check the exact
   signature of `getNextId`. Do NOT call `reserveBlock` inside an inserter; the
   upload orchestrator does a blanket reservation upfront that covers all IDs.

5. **An existing inserter** as a reference. `key-definition.inserter.ts` is a good
   two-step example. `tag-definition.inserter.ts` shows the `getNextId` pattern
   for value objects. `vcpm-module-definition.inserter.ts` shows `Promise.all`
   for parallel child steps.

---

## File location and naming

```
repositories/bulk-import/<entity-name>/<entity-name>.inserter.ts
```

Example: `key-definition/key-definition.inserter.ts`

---

## Class skeleton

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, MyEntity} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {BatchInserter, type InsertRow, type RawFailure} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {MyEntitySchema, type MyEntityRow} from '../../../entity-schema/…/my-entity.schema.js';

export class MyEntityInserter {
  // Only include idGeneration if this inserter actually calls getNextId.
  // If no generated IDs are needed, omit it entirely — do not add it unused.
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,  // omit if unused
  ) {}

  async insert(items: MyEntity[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));

    const rootStep = await this.insertMyEntities(items);

    // NEVER skip this filter — it is what prevents FK noise from failed parents
    const activeItems = items.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const childStep = await this.insertChildren(activeItems);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...childStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      bySystemId,
      item =>
        `MyEntity (myNaturalId=${BinaryUtils.toHexString(item.myNaturalId)}, name='${item.name}')`,
    );
  }
```

---

## Constructor rule

Only include `idGeneration: IdGenerationPort` in the constructor when the inserter
calls `getNextId`. If no generated IDs are needed (all systemIds are pre-assigned
from the domain), omit `idGeneration` entirely. Do NOT include it with an underscore
prefix — a parameter that is never used has no place in the constructor.

```typescript
// Inserter that generates IDs — include idGeneration
constructor(
  private readonly manager: EntityManager,
  private readonly idGeneration: IdGenerationPort,
) {}

// Flat inserter or one with only pre-assigned systemIds — omit idGeneration
constructor(
  private readonly manager: EntityManager,
) {}
```

The repository call site must match:
```typescript
// With idGeneration:
return new TagDefinitionInserter(this.manager, this.idGeneration).insert([...items]);

// Without:
return new ProcessorDefinitionInserter(this.manager).insert([...items]);
```

---

## StepResult contract

Every private step method must return `StepResult`:

```typescript
interface StepResult {
  rawFailures: RawFailure[];
  failedEntityIds: Set<number>; // systemIds of entities that failed AT THIS STEP
}
```

`failedEntityIds` contains the **entity-level** systemIds, not the aggregate root's.
The aggregate root's systemId goes into `rawFailure.systemId` for error grouping.
These two are the same for flat inserters; they differ for multi-level hierarchies.

---

## Anatomy of a step method

```typescript
private async insertMyChildren(
  items: MyEntity[],
  skipParentIds?: Set<number>,  // omit if no parent skip needed
): Promise<StepResult> {
  const contextBySystemId = new Map<number, {parent: MyEntity; childId: number}>();

  const rows: InsertRow<MyChildRow>[] = items.flatMap(parent => {
    if (skipParentIds?.has(parent.someGeneratedId)) return [];  // skip failed parents
    return parent.children.map(child => {
      const row: InsertRow<MyChildRow> = {
        systemId: child.systemId,       // pre-assigned
        // — or —
        // systemId: await this.idGeneration.getNextId(parent.fileSystemId),  // generated
        childNaturalId: child.childNaturalId,
        parentSystemId: parent.systemId,
      };
      contextBySystemId.set(row.systemId, {parent, childId: child.childNaturalId});
      return row;
    });
  });

  if (rows.length === 0) return {rawFailures: [], failedEntityIds: new Set()};

  const {failedEntities} = await BatchInserter.insert(
    this.manager,
    MyChildSchema,
    rows,
  );

  const rawFailures: RawFailure[] = failedEntities.map(error => {
    const ctx = contextBySystemId.get(error.systemId)!;
    const row = rows.find(r => r.systemId === error.systemId)!;
    return {
      systemId: ctx.parent.systemId,    // ← always the AGGREGATE ROOT systemId
      entityLabel: 'MyChild',
      failedRowJson: `(parentId=${BinaryUtils.toHexString(ctx.parent.myNaturalId)}, childId=${BinaryUtils.toHexString(ctx.childId)}) Row: ${JSON.stringify(row)}`,
      dbError: error.message,
    };
  });

  return {
    rawFailures,
    failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
  };
}
```

---

## idGeneration pattern (for value objects without domain systemId)

The upload orchestrator performs a blanket `reserveBlock` before the entire
pipeline runs. Do NOT call `reserveBlock` inside an inserter. Just call
`getNextId` directly when you need a generated ID.

Since `getNextId` is async, use a `for` loop rather than `flatMap`:

```typescript
// In the step method:
const rows: InsertRow<ChildRow>[] = [];
for (const parent of items) {
  for (const child of parent.children) {
    const systemId = await this.idGeneration.getNextId(parent.fileSystemId);
    contextBySystemId.set(systemId, {parent, childNaturalId: child.naturalId});
    rows.push({systemId, ...});
  }
}
```

---

## Promise.all pattern for independent child steps

When multiple child steps depend only on the root (not on each other), run them
in parallel. SQLite executes them sequentially via the shared EntityManager anyway,
but the code is Postgres-ready without changes.

```typescript
const [stepA, stepB, stepC] = await Promise.all([
  this.insertParamsStep(activeItems),
  this.insertAttributesStep(activeItems),
  this.insertLinksStep(activeItems),
]);

// For steps that depend on stepA's output, run them after Promise.all:
const stepD = await this.insertGrandchildren(
  activeItems,
  stepA.failedEntityIds,    // skip-set
  parentToGeneratedIdMap,   // built inside insertParamsStep
);
```

When a step needs to return both a `StepResult` AND a context map (like a
`Map<DomainType, number>` for linking parent-generated IDs to children), define
a custom return interface:

```typescript
interface StepWithContextResult {
  stepResult: StepResult;
  parentToGeneratedId: Map<ParentType, number>;
}
```

---

## failedRowJson format

Include enough natural-ID context to identify the row, then the full JSON.
Use `BinaryUtils.toHexString()` for all IDs per the project convention:

- Root entity: `(naturalId=${BinaryUtils.toHexString(entity.naturalId)}) Row: ${JSON.stringify(row)}`
- Child: `(rootId=${BinaryUtils.toHexString(root.naturalId)}, childId=${BinaryUtils.toHexString(child.naturalId)}) Row: ${JSON.stringify(row)}`
- 3-level deep: include the nearest parent's natural ID as context

---

## Aggregate label (for groupRawFailures)

Include the natural ID and a human-readable name where available:

```typescript
item => `SpfModuleDefinition (moduleDefinitionId=${BinaryUtils.toHexString(item.moduleDefinitionId)}, name='${item.name}')`
item => `KeyDefinition (keyId=${BinaryUtils.toHexString(item.keyId)}, name='${item.name}')`
item => `ProcessorDefinition (processorDefinitionId=${BinaryUtils.toHexString(item.processorDefinitionId)})`
```

---

## Flat inserters (no children, no skip-sets)

For simple entities with no children, the pattern collapses to a single step:

```typescript
async insert(items: SimpleEntity[]): Promise<BulkInsertResult> {
  if (items.length === 0) return okBulkInsert();
  const bySystemId = new Map(items.map(i => [i.systemId, i]));
  const step = await this.insertSimpleEntities(items);
  return groupRawFailures(step.rawFailures, bySystemId,
    i => `SimpleEntity (naturalId=${BinaryUtils.toHexString(i.naturalId)})`);
}
```

For flat inserters, each item is its own aggregate, so `rawFailure.systemId = item.systemId`.
`failedEntityIds` in the returned `StepResult` can be an empty `Set` since nothing depends on it.
Omit `idGeneration` from the constructor entirely.

---

## Wiring into the repository

After creating the inserter, update `typeorm-bulk-import.repository.ts`:

1. Add the import: `import {MyEntityInserter} from './my-entity/my-entity.inserter.js';`
2. Replace the stub — pass `this.idGeneration` only if the inserter uses it:
   ```typescript
   // Inserter that uses idGeneration:
   insertMyEntities(items: readonly MyEntity[]): Promise<BulkInsertResult> {
     return new MyEntityInserter(this.manager, this.idGeneration).insert([...items]);
   }

   // Flat inserter — no idGeneration:
   insertMyEntities(items: readonly MyEntity[]): Promise<BulkInsertResult> {
     return new MyEntityInserter(this.manager).insert([...items]);
   }
   ```

---

## Code rules (all inserters must follow these)

- ESM imports: **all intra-package imports use `.js` extension**
- Copyright header: `/* Copyright (c) Qualcomm Technologies... BSD-3-Clause */`
- No comments explaining what the code does
- Use `BinaryUtils.toHexString()` for all IDs — import `BinaryUtils` from `@arc/core`
- Only include `idGeneration` in constructor when the inserter calls `getNextId`
- Do NOT call `reserveBlock` — the orchestrator handles the blanket reservation
- Always return `{rawFailures: [], failedEntityIds: new Set()}` for empty collections

---

## Checklist before submitting

- [ ] Step methods return `StepResult` (not `RawFailure[]`)
- [ ] `activeItems` filter is present after every root step
- [ ] `idGeneration` only in constructor if `getNextId` is called
- [ ] No `reserveBlock` calls anywhere in the inserter
- [ ] `rawFailure.systemId` is always the **aggregate root** systemId
- [ ] `failedEntityIds` contains entity-level systemIds at that step's level
- [ ] `failedRowJson` includes natural IDs + full `JSON.stringify(row)`
- [ ] `BinaryUtils.toHexString()` used for all IDs (imported from `@arc/core`)
- [ ] All imports use `.js` extension
- [ ] Repository stub replaced with live call, `idGeneration` passed only if needed
