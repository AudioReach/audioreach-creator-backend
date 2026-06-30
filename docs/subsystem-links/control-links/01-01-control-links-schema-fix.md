<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: Schema fix — canonical ordering on `control_links` (§11.1)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.1 (lines 726–740).
>
> **Goal of this chapter:** Make the bidirectional uniqueness of `ControlLink` rows DB-enforced. The current index `uk_control_link_unique: (peerNodeASystemId, peerNodeBSystemId, nodeAPortSystemId, nodeBPortSystemId)` is direction-sensitive and admits two rows for the same physical link `(A,P1)↔(B,P2)`. We narrow the index to `(nodeAPortSystemId, nodeBPortSystemId)` and add `CHECK (nodeA_port_system_id < nodeB_port_system_id)`. The flat-mode `CreateControlLinkHandler` is updated to swap node/port pairs into canonical order before its duplicate check and before recording the CREATE edit action so both halves of the invariant are enforced together.

### Task 1: control_links entity schema — narrowed unique index + canonical CHECK + migration regeneration

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-link.ts`
- Delete + regenerate: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<timestamp>-initial-create.ts`
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts`
- Test: `packages/infrastructure/persistence/tests/integration/schema/control-link-canonical-ordering.spec.ts` (new)

- [ ] **Step 1: Write the failing schema test**

  Create `packages/infrastructure/persistence/tests/integration/schema/control-link-canonical-ordering.spec.ts`:

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

  describe('control_links schema — canonical ordering (spec §11.1)', () => {
    beforeAll(async () => { await setupIntegrationTest(); });
    afterAll(async () => { await teardownIntegrationTest(); });
    beforeEach(async () => { await setupEachTest(); });

    it('uk_control_link_unique is defined on (nodeA_port_system_id, nodeB_port_system_id)', async () => {
      const ds = getTestDataSource();
      const rows: Array<{name: string; sql: string}> = await ds.query(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'index' AND name = 'uk_control_link_unique'`,
      );
      expect(rows).toHaveLength(1);
      const sql = rows[0].sql.toLowerCase();
      expect(sql).toContain('"nodea_port_system_id"');
      expect(sql).toContain('"nodeb_port_system_id"');
      expect(sql).not.toContain('"peer_nodea_system_id"');
      expect(sql).not.toContain('"peer_nodeb_system_id"');
    });

    it('control_links table has CHECK (nodeA_port_system_id < nodeB_port_system_id)', async () => {
      const ds = getTestDataSource();
      const rows: Array<{sql: string}> = await ds.query(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'control_links'`,
      );
      expect(rows).toHaveLength(1);
      const sql = rows[0].sql.toLowerCase().replaceAll(/\s+/g, ' ');
      expect(sql).toMatch(/check\s*\(\s*"nodea_port_system_id"\s*<\s*"nodeb_port_system_id"\s*\)/);
    });

    it('rejects rows that violate canonical ordering (nodeA_port_system_id >= nodeB_port_system_id)', async () => {
      const ds = getTestDataSource();
      // Minimal parent rows to satisfy NOT NULL FKs; values are integers, no FK enforcement in test DB beyond columns
      await ds.query(`INSERT INTO arc_db_files (system_id, project_system_id, file_name, description, metadata, is_target, last_reserved_id)
                      VALUES (1, 1, 'f', '', '{}', 0, 1000)`).catch(() => undefined);
      // Try to insert a control_link with reversed port ordering: 200 >= 100
      const insert = ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (9001, 1, 10, 20, 200, 100, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );
      await expect(insert).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('rejects a second row with the same port pair (uniqueness on canonical ports)', async () => {
      const ds = getTestDataSource();
      await ds.query(`INSERT INTO arc_db_files (system_id, project_system_id, file_name, description, metadata, is_target, last_reserved_id)
                      VALUES (1, 1, 'f', '', '{}', 0, 1000)`).catch(() => undefined);
      await ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (9002, 1, 10, 20, 100, 200, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );
      const dupe = ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (9003, 1, 11, 21, 100, 200, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );
      await expect(dupe).rejects.toThrow(/UNIQUE constraint failed|uk_control_link_unique/i);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="control-link-canonical-ordering"`

  Expected: FAIL. The first test fails with the index still containing `"peer_nodea_system_id"`; the second test fails because no `CHECK` constraint is present on `control_links`; the third test fails (insert succeeds — there is no CHECK); the fourth test currently *passes* spuriously only because the row already happens to be unique under the wider 4-column key.

- [ ] **Step 3: Update the `ControlLink` entity schema**

  Edit `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-link.ts`. Replace the `indices` block and add a `checks` block on the `EntitySchema`:

  ```typescript
  export const ControlLinkSchema = new EntitySchema<ControlLinkRow>({
    name: 'ControlLink',
    tableName: 'control_links',
    columns: {
      // ... unchanged ...
    },
    relations: {
      // ... unchanged ...
    },
    indices: [
      {
        name: 'uk_control_link_unique',
        columns: ['nodeAPortSystemId', 'nodeBPortSystemId'],
        unique: true,
      },
      {
        name: 'idx_control_links_src_sg_scope',
        columns: ['sourceSubgraphSystemId', 'linkType'],
      },
      {
        name: 'idx_control_links_dst_sg',
        columns: ['destSubgraphSystemId'],
      },
    ],
    checks: [
      {
        name: 'ck_control_link_port_canonical_order',
        expression: '"nodeA_port_system_id" < "nodeB_port_system_id"',
      },
    ],
  });
  ```

  Do not change the `columns` or `relations` blocks. The `peerNodeASystemId` / `peerNodeBSystemId` columns remain — they are no longer part of the unique key, but they are still stored.

- [ ] **Step 4: Build so the TypeORM CLI sees the updated schema**

  Run: `pnpm run build`

  Expected: build succeeds across all packages.

- [ ] **Step 5: Delete the existing migration file and regenerate**

  The repo follows the single-`initial-create` convention (see root `CLAUDE.md` → "Database Migration Workflow"). Find and delete the current file, then regenerate.

  ```bash
  rm packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/1781364357082-initial-create.ts
  pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create
  ```

  Expected: a new file `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<new-timestamp>-initial-create.ts` is created. Inspect its `up()` and `down()`: it must contain `CREATE UNIQUE INDEX "uk_control_link_unique" ON "control_links" ("nodeA_port_system_id", "nodeB_port_system_id")` and a `CHECK ("nodeA_port_system_id" < "nodeB_port_system_id")` clause embedded in the `CREATE TABLE "control_links"` statement (TypeORM inlines table-level CHECK constraints into the table definition; the generated `down()` will reverse via the temporary-table rename pattern already used in this codebase).

- [ ] **Step 6: Post-process the regenerated migration (required by `CLAUDE.md`)**

  Open the new `<new-timestamp>-initial-create.ts` and:

  1. Add the Qualcomm header at the top:
     ```typescript
     /*
      * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
      * SPDX-License-Identifier: BSD-3-Clause
      */
     ```
  2. Change the import to use `type`:
     ```typescript
     import type {MigrationInterface, QueryRunner} from 'typeorm';
     ```

- [ ] **Step 7: Update `migration-index.ts`**

  Edit `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts` so the import and exported array point to the new timestamp:

  ```typescript
  import {InitialCreate<new-timestamp>} from './migrations/<new-timestamp>-initial-create.js';
  export const migrations = [InitialCreate<new-timestamp>];
  ```

- [ ] **Step 8: Rebuild and run the schema test**

  Run: `pnpm run build && pnpm --filter @arc/persistence run test:integration -- --testPathPattern="control-link-canonical-ordering"`

  Expected: PASS — all four assertions in `control-link-canonical-ordering.spec.ts` succeed.

- [ ] **Step 9: Commit**

  Use the `commit` skill to draft the message. Show the proposed message and the exact commands to the user and wait for explicit confirmation:

  ```bash
  git add packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-link.ts \
          packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/ \
          packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migration-index.ts \
          packages/infrastructure/persistence/tests/integration/schema/control-link-canonical-ordering.spec.ts
  git commit -m "fix(db): canonical port ordering on control_links (uk + CHECK)" \
             -m "Narrow uk_control_link_unique to (nodeAPortSystemId, nodeBPortSystemId) and add CHECK (nodeA_port_system_id < nodeB_port_system_id) so reverse-direction duplicates are DB-rejected. Regenerated initial-create migration per CLAUDE.md workflow. Spec §11.1." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 2: `CreateControlLinkHandler` (flat-mode) — canonicalize peerA/peerB before duplicate check and CREATE edit action

**Package:** `@arc/core`

**Files:**
- Create (if missing) or Modify: `packages/core/src/application/usecase-designer/virtual-links/create-control-link/create-control-link.command.ts`
- Create (if missing) or Modify: `packages/core/src/application/usecase-designer/virtual-links/create-control-link/create-control-link.handler.ts`
- Test: `packages/infrastructure/persistence/tests/integration/handlers/create-control-link-canonicalization.spec.ts` (new)
- Modify: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts` (register the handler if not already)
- Modify: `packages/core/src/index.ts` (export `CreateControlLinkHandler` and `CreateControlLinkCommand` so persistence integration tests can import them, mirroring `CreateDataLinkHandler` exports)

- [ ] **Step 1: Write the failing handler-level integration test**

  Create `packages/infrastructure/persistence/tests/integration/handlers/create-control-link-canonicalization.spec.ts`:

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
  import {
    ProjectSessionSchema,
    SESSION_MODE,
    SESSION_STATUS,
  } from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
  import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
  import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
  import {NodeSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
  import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
  import {CreateControlLinkHandler, CreateControlLinkCommand} from '@arc/core';
  import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
  import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

  describe('CreateControlLinkHandler — canonical ordering (spec §11.1)', () => {
    beforeAll(async () => { await setupIntegrationTest(); });
    afterAll(async () => { await teardownIntegrationTest(); });

    beforeEach(async () => {
      await setupEachTest();
      const ds = getTestDataSource();
      await ds.getRepository(ProjectSchema).save({
        systemId: 1, name: 'P', description: '', type: 'Offline',
      });
      await ds.getRepository(ArcDbFileSchema).save({
        systemId: 1, projectSystemId: 1, fileName: 'f.awsp',
        description: '', metadata: '{}', isTarget: false, lastReservedId: 1000,
      });
      await ds.getRepository(ProjectSessionSchema).save({
        fileSystemId: 1, clientId: 'c',
        sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null,
      });
      // Two module nodes in the same subgraph; control ports 100 and 200 belong to them respectively
      await ds.getRepository(NodeSchema).save({systemId: 10, parentId: null, type: 'module', fileSystemId: 1});
      await ds.getRepository(NodeSchema).save({systemId: 20, parentId: null, type: 'module', fileSystemId: 1});
    });

    it('swaps peer node and port pairs together when caller passes the higher-port endpoint as A', async () => {
      const ds = getTestDataSource();
      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const handler = new CreateControlLinkHandler(
          new TypeOrmUnitOfWork(qr),
          new EntityIdServiceRegistry(qr.manager),
        );
        // Caller passes A = (node 20, port 200), B = (node 10, port 100).
        // Canonical ordering must produce peerA = node 10 / port 100, peerB = node 20 / port 200.
        const command = new CreateControlLinkCommand(
          /* peerNodeASystemId */ 20,
          /* peerNodeBSystemId */ 10,
          /* nodeAPortSystemId */ 200,
          /* nodeBPortSystemId */ 100,
          /* projectId */ 1,
          /* clientId */ 'c',
        );
        const result = await handler.handle(command);
        expect(result).toMatchObject({type: 'ControlLink'});

        const actions = await ds.getRepository(EditActionSchema).find({});
        const clCreate = actions.find(a => a.tableName === ENTITY_NAMES.ControlLink);
        expect(clCreate).toBeDefined();
        const payload = JSON.parse(clCreate!.payload);
        expect(payload.nodeAPortSystemId).toBe(100);
        expect(payload.nodeBPortSystemId).toBe(200);
        expect(payload.peerNodeASystemId).toBe(10);
        expect(payload.peerNodeBSystemId).toBe(20);
      } finally {
        await qr.release();
      }
    });

    it('does not swap when caller already passes the lower-port endpoint as A', async () => {
      const ds = getTestDataSource();
      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const handler = new CreateControlLinkHandler(
          new TypeOrmUnitOfWork(qr),
          new EntityIdServiceRegistry(qr.manager),
        );
        const command = new CreateControlLinkCommand(10, 20, 100, 200, 1, 'c');
        await handler.handle(command);

        const actions = await ds.getRepository(EditActionSchema).find({});
        const clCreate = actions.find(a => a.tableName === ENTITY_NAMES.ControlLink);
        const payload = JSON.parse(clCreate!.payload);
        expect(payload.nodeAPortSystemId).toBe(100);
        expect(payload.nodeBPortSystemId).toBe(200);
        expect(payload.peerNodeASystemId).toBe(10);
        expect(payload.peerNodeBSystemId).toBe(20);
      } finally {
        await qr.release();
      }
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-control-link-canonicalization"`

  Expected: FAIL. Either `CreateControlLinkHandler` / `CreateControlLinkCommand` are not exported from `@arc/core` (import resolves to undefined), or — if a non-canonicalizing handler already exists — the first assertion fails because the recorded edit action has `nodeAPortSystemId = 200` and `peerNodeASystemId = 20` (the un-swapped values the caller provided).

- [ ] **Step 3: Create or update the command**

  `packages/core/src/application/usecase-designer/virtual-links/create-control-link/create-control-link.command.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {BaseCommand} from '../../../shared/base-command.js';

  export class CreateControlLinkCommand extends BaseCommand {
    constructor(
      public readonly peerNodeASystemId: number,
      public readonly peerNodeBSystemId: number,
      public readonly nodeAPortSystemId: number,
      public readonly nodeBPortSystemId: number,
      public readonly projectId: number,
      clientId: string,
    ) {
      super(clientId);
    }
  }
  ```

- [ ] **Step 4: Create or update the handler with canonicalization (skeleton — see code below)**

  `packages/core/src/application/usecase-designer/virtual-links/create-control-link/create-control-link.handler.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
  import type {IUnitOfWork} from '../../../ports/persistence/unit-of-work.js';
  import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
  import {CHANGE_OPERATION, CHANGE_STATUS, LINK_TYPE} from '../../../../domain/index.js';
  import {ENTITY_NAMES} from '../../../../domain/entities/entity-names.js';
  import {DomainException} from '../../../orchestration/cqrs/exceptions/domain-exception.js';
  import {CreateControlLinkCommand} from './create-control-link.command.js';

  interface ControlLinkCreateResult {
    systemId: number;
    type: 'ControlLink';
  }

  /**
   * Canonical-ordering normalization helper (spec §11.1).
   *
   * Returns peerA = endpoint with the lower portSystemId; node and port are
   * swapped as a single pair so the (node, port) correspondence is preserved.
   */
  export function canonicalizeControlLinkEndpoints(input: {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }): {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  } {
    if (input.nodeAPortSystemId === input.nodeBPortSystemId) {
      throw new DomainException(
        422,
        'A control link cannot connect a port to itself',
      );
    }
    if (input.nodeAPortSystemId < input.nodeBPortSystemId) {
      return input;
    }
    return {
      peerNodeASystemId: input.peerNodeBSystemId,
      peerNodeBSystemId: input.peerNodeASystemId,
      nodeAPortSystemId: input.nodeBPortSystemId,
      nodeBPortSystemId: input.nodeAPortSystemId,
    };
  }

  export class CreateControlLinkHandler
    implements CommandHandler<CreateControlLinkCommand, ControlLinkCreateResult>
  {
    constructor(
      private readonly uow: IUnitOfWork,
      private readonly idService: IdGenerationPort,
    ) {}

    async handle(command: CreateControlLinkCommand): Promise<ControlLinkCreateResult> {
      // 1. Session resolution: getActiveFileId for projectId; getActiveSession for (fileId, clientId).
      const fileId = await this.uow.sessions.getActiveFileId(command.projectId);
      const session = await this.uow.sessions.getActiveSession(fileId, command.clientId);

      // 2. Fetch both endpoint nodes and their parents. Both must be module nodes
      //    (control flat-mode does not allow subsystem endpoints — that is the CSLS path).
      const nodeA = await this.uow.nodes.getById(command.peerNodeASystemId, fileId);
      const nodeB = await this.uow.nodes.getById(command.peerNodeBSystemId, fileId);
      if (nodeA?.type !== 'module' || nodeB?.type !== 'module') {
        throw new DomainException(422, 'Flat-mode control links require module endpoints');
      }

      // 3. Canonicalize peerA/peerB by lower portSystemId BEFORE the duplicate check.
      const canonical = canonicalizeControlLinkEndpoints({
        peerNodeASystemId: command.peerNodeASystemId,
        peerNodeBSystemId: command.peerNodeBSystemId,
        nodeAPortSystemId: command.nodeAPortSystemId,
        nodeBPortSystemId: command.nodeBPortSystemId,
      });

      // 4. Duplicate check uses the canonical port pair against the committed table
      //    plus the edit-actions overlay (mirrors CreateDataLinkHandler's pattern).
      const existing = await this.uow.controlLinks.findByCanonicalPorts(
        fileId,
        canonical.nodeAPortSystemId,
        canonical.nodeBPortSystemId,
        session.systemId,
      );
      if (existing) {
        throw new DomainException(
          422,
          `ControlLink already exists between ports ${canonical.nodeAPortSystemId} and ${canonical.nodeBPortSystemId}`,
        );
      }

      // 5. Compute linkType from the canonical peer nodes.
      const linkType =
        nodeA.subgraphSystemId === nodeB.subgraphSystemId
          ? LINK_TYPE.IntraSubgraph
          : LINK_TYPE.IntraUsecase;
      const [sourceSubgraphSystemId, destSubgraphSystemId] =
        canonical.peerNodeASystemId === nodeA.systemId
          ? [nodeA.subgraphSystemId, nodeB.subgraphSystemId]
          : [nodeB.subgraphSystemId, nodeA.subgraphSystemId];

      // 6. Pre-assign systemId and record the CREATE edit action with the CANONICAL payload.
      const systemId = await this.idService.next(ENTITY_NAMES.ControlLink);
      const payload = {
        systemId,
        fileSystemId: fileId,
        peerNodeASystemId: canonical.peerNodeASystemId,
        peerNodeBSystemId: canonical.peerNodeBSystemId,
        nodeAPortSystemId: canonical.nodeAPortSystemId,
        nodeBPortSystemId: canonical.nodeBPortSystemId,
        heapId: 0,
        linkType,
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      };

      await this.uow.editActions.record({
        sessionSystemId: session.systemId,
        tableName: ENTITY_NAMES.ControlLink,
        rowSystemId: systemId,
        operation: CHANGE_OPERATION.Create,
        status: CHANGE_STATUS.Staged,
        baseVersion: null,
        payload: JSON.stringify(payload),
        groupId: null,
      });

      return {systemId, type: 'ControlLink'};
    }
  }
  ```

  Note: the precise repository / unit-of-work method names (`uow.controlLinks.findByCanonicalPorts`, `uow.nodes.getById`, `uow.sessions.getActiveFileId`, `uow.editActions.record`) follow the pattern established by `CreateDataLinkHandler` in the parallel data-links plan. If the corresponding methods on `IUnitOfWork` are not yet present when this task executes, adopt the same names as `CreateDataLinkHandler` uses at the time of execution (the executing-plans skill will reconcile names against the live surface).

- [ ] **Step 5: Register and export the handler**

  In `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`, add `CreateControlLinkHandler` registration in `registerAllCommandHandlers()` following the existing pattern used for `CreateModuleHandler`.

  In `packages/core/src/index.ts`, add:
  ```typescript
  export {CreateControlLinkHandler, canonicalizeControlLinkEndpoints} from './application/usecase-designer/virtual-links/create-control-link/create-control-link.handler.js';
  export {CreateControlLinkCommand} from './application/usecase-designer/virtual-links/create-control-link/create-control-link.command.js';
  ```

- [ ] **Step 6: Build and run the test**

  Run: `pnpm run build && pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-control-link-canonicalization"`

  Expected: PASS — both assertions in `create-control-link-canonicalization.spec.ts` succeed.

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the message. Show the proposed message and the exact commands to the user and wait for explicit confirmation:

  ```bash
  git add packages/core/src/application/usecase-designer/virtual-links/create-control-link/ \
          packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts \
          packages/core/src/index.ts \
          packages/infrastructure/persistence/tests/integration/handlers/create-control-link-canonicalization.spec.ts
  git commit -m "feat(application): canonicalize control link endpoints in CreateControlLinkHandler" \
             -m "Swap peerA/peerB node and port pairs by lower portSystemId before the duplicate check and before recording the CREATE edit action so flat-mode and the new DB CHECK constraint agree. Spec §11.1." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 3: Reverse-direction duplicate integration test — `CreateControlLinkHandler` rejects P2→P1 after P1→P2

**Package:** `@arc/persistence` (test-only)

**Files:**
- Test: `packages/infrastructure/persistence/tests/integration/handlers/create-control-link-reverse-duplicate.spec.ts` (new)

This task is TDD-ordered: the test is written first and run against the state left by Tasks 1 and 2. It exercises the end-to-end duplicate detection — the handler's canonical normalization plus the DB-level unique index / CHECK — by inserting the link once and attempting the reverse direction.

- [ ] **Step 1: Write the failing reverse-direction test**

  Create `packages/infrastructure/persistence/tests/integration/handlers/create-control-link-reverse-duplicate.spec.ts`:

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
  import {
    ProjectSessionSchema,
    SESSION_MODE,
    SESSION_STATUS,
  } from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
  import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
  import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
  import {NodeSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
  import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
  import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
  import {CreateControlLinkHandler, CreateControlLinkCommand} from '@arc/core';
  import {TypeOrmUnitOfWork} from '../../../src/persistence-typeorm-sqllite/typeorm-unit-of-work.js';
  import {EntityIdServiceRegistry} from '../../../src/persistence-typeorm-sqllite/repositories/id-generation/entity-id-service-registry.js';

  describe('CreateControlLinkHandler — reverse-direction duplicate (spec §11.1, §11.12)', () => {
    beforeAll(async () => { await setupIntegrationTest(); });
    afterAll(async () => { await teardownIntegrationTest(); });

    beforeEach(async () => {
      await setupEachTest();
      const ds = getTestDataSource();
      await ds.getRepository(ProjectSchema).save({
        systemId: 1, name: 'P', description: '', type: 'Offline',
      });
      await ds.getRepository(ArcDbFileSchema).save({
        systemId: 1, projectSystemId: 1, fileName: 'f.awsp',
        description: '', metadata: '{}', isTarget: false, lastReservedId: 1000,
      });
      await ds.getRepository(ProjectSessionSchema).save({
        fileSystemId: 1, clientId: 'c',
        sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null,
      });
      await ds.getRepository(NodeSchema).save({systemId: 10, parentId: null, type: 'module', fileSystemId: 1});
      await ds.getRepository(NodeSchema).save({systemId: 20, parentId: null, type: 'module', fileSystemId: 1});
    });

    it('rejects a second CreateControlLink command for the reverse port direction with 422', async () => {
      const ds = getTestDataSource();
      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const handler = new CreateControlLinkHandler(
          new TypeOrmUnitOfWork(qr),
          new EntityIdServiceRegistry(qr.manager),
        );
        // First: P1 = port 100 (on node 10) -> P2 = port 200 (on node 20)
        const forward = new CreateControlLinkCommand(10, 20, 100, 200, 1, 'c');
        const result = await handler.handle(forward);
        expect(result).toMatchObject({type: 'ControlLink'});

        // Second: P2 -> P1 (reverse). Must be rejected with 422 — the handler
        // canonicalizes (200,100) -> (100,200) and the overlay-aware duplicate
        // check sees the prior CREATE.
        const reverse = new CreateControlLinkCommand(20, 10, 200, 100, 1, 'c');
        await expect(handler.handle(reverse)).rejects.toMatchObject({statusCode: 422});

        // Sanity: only one ControlLink CREATE edit action was recorded.
        const created = await ds.getRepository(EditActionSchema).find({
          where: {tableName: ENTITY_NAMES.ControlLink},
        });
        expect(created).toHaveLength(1);
      } finally {
        await qr.release();
      }
    });

    it('rejects the reverse-direction duplicate when the first row is already committed (DB unique index path)', async () => {
      const ds = getTestDataSource();
      // Seed a committed control_link row directly: ports (100, 200) in canonical order.
      await ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (5000, 1, 10, 20, 100, 200, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );

      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        const handler = new CreateControlLinkHandler(
          new TypeOrmUnitOfWork(qr),
          new EntityIdServiceRegistry(qr.manager),
        );
        // Attempt the reverse direction; handler must canonicalize and reject pre-commit.
        const reverse = new CreateControlLinkCommand(20, 10, 200, 100, 1, 'c');
        await expect(handler.handle(reverse)).rejects.toMatchObject({statusCode: 422});
      } finally {
        await qr.release();
      }
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm --filter @arc/persistence run test:integration -- --testPathPattern="create-control-link-reverse-duplicate"`

  Expected: FAIL on a baseline (pre-§11.1) build with "expected promise to be rejected" — the reverse-direction command currently succeeds because the wider 4-column index treats `(A,B,P1,P2)` and `(B,A,P2,P1)` as distinct. If the test is run *after* Tasks 1 and 2 are already in place, this test should pass on first run; capture that PASS on the first execution as the TDD signal that the §11.1 invariant is enforced end-to-end. If it still fails after Tasks 1 and 2, the most likely diagnoses are:
  - The handler's duplicate check is not overlay-aware (does not look at staged edit actions) — fix the duplicate-check call to consult both the committed table and the edit-actions overlay.
  - The handler did not call `canonicalizeControlLinkEndpoints` before the duplicate check — verify by adding a `console.log` of the canonical payload and re-running.

- [ ] **Step 3: Verify behaviour and run the full integration suite**

  Run: `pnpm --filter @arc/persistence run test:integration`

  Expected: PASS — `control-link-canonical-ordering`, `create-control-link-canonicalization`, and `create-control-link-reverse-duplicate` all pass; no other persistence integration tests regress.

- [ ] **Step 4: Commit**

  Use the `commit` skill to draft the message. Show the proposed message and the exact commands to the user and wait for explicit confirmation:

  ```bash
  git add packages/infrastructure/persistence/tests/integration/handlers/create-control-link-reverse-duplicate.spec.ts
  git commit -m "test(persistence): reverse-direction duplicate control link rejected with 422" \
             -m "Integration test for spec §11.1: inserting P1->P2 then attempting P2->P1 must yield 422, covering both the staged-overlay path and the committed-row path." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---
