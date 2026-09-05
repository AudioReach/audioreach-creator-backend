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
import type {DataSource, QueryRunner} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmModuleRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/module/module.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const MODULE_ID = 50;
const DEF_ID = 200;
const CONTAINER_ID = 300;
const SUBGRAPH_ID = 400;
const CONTAINER_TYPE_ID = 77;

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedProjectAndFile(ds: DataSource): Promise<void> {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'f.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
}

async function seedSession(ds: DataSource): Promise<number> {
  const row = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'u',
    clientId: 'c',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  return row.sessionId;
}

async function seedDefinition(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (1, 1, 'proc', ?)`,
    [FILE_ID],
  );
  await ds.query(
    `INSERT INTO container_types (system_id, name, value) VALUES (?, 'TestContainerType', ?)`,
    [CONTAINER_TYPE_ID, CONTAINER_TYPE_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, display_name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (?, 1, 'MyDef', 'My Display Name', 0, ?, 0, 1)`,
    [DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO module_definition_container_types (module_definition_system_id, container_type_system_id) VALUES (?, ?)`,
    [DEF_ID, CONTAINER_TYPE_ID],
  );
}

async function seedModule(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (?, 1, ?, ?)`,
    [CONTAINER_ID, CONTAINER_TYPE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [MODULE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, 'mod', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
}

// ── Factory ───────────────────────────────────────────────────────────────────

function makeRepo(qr: QueryRunner, sessionId: number): TypeOrmModuleRepository {
  const writer = new PendingChangeWriter(
    new EditActionsQueryService(qr.manager),
    new PendingChangeCache(),
  );
  const uow = {
    getWriteContext: () => ({
      session: {sessionId, fileSystemId: FILE_ID},
      groupId: 'grp-1',
    }),
    startTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    isInTransaction: () => false,
  };
  return new TypeOrmModuleRepository(writer, qr.manager, uow as never);
}

// ── getModulesByContainerId tests ─────────────────────────────────────────────

describe('TypeOrmModuleRepository — getModulesByContainerId', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let sessionId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    await seedDefinition(ds);
    await seedModule(ds);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    if (qr) await qr.release();
  });

  it('returns ModuleForContainer[] with correct containerTypeIds and displayName when modules exist in DB', async () => {
    const repo = makeRepo(qr, sessionId);
    const results = await repo.getModulesByContainerId(CONTAINER_ID, FILE_ID);
    expect(results).toHaveLength(1);
    expect(results[0].moduleSystemId).toBe(MODULE_ID);
    expect(results[0].displayName).toBe('My Display Name');
    expect(results[0].containerTypeIds).toContain(CONTAINER_TYPE_ID);
  });

  it('excludes a module that has a pending DELETE in the session', async () => {
    await ds.query(
      `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, new_value, change_status, source, valid_until)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, NULL)`,
      [
        sessionId,
        MODULE_ID,
        MODULE_ID,
        ENTITY_NAMES.SpfModule,
        CHANGE_OPERATION.Delete,
        CHANGE_STATUS.Staged,
        SOURCE.Manual,
      ],
    );
    const repo = makeRepo(qr, sessionId);
    const results = await repo.getModulesByContainerId(CONTAINER_ID, FILE_ID);
    expect(results).toHaveLength(0);
  });

  it('includes a module that has a pending CREATE in the session', async () => {
    const STAGED_MODULE_ID = 999;
    await ds.query(
      `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, new_value, change_status, source, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        sessionId,
        STAGED_MODULE_ID,
        STAGED_MODULE_ID,
        ENTITY_NAMES.SpfModule,
        CHANGE_OPERATION.Create,
        JSON.stringify({
          containerSystemId: CONTAINER_ID,
          definitionSystemId: DEF_ID,
          instanceId: 2,
          alias: 'staged',
          subgraphSystemId: SUBGRAPH_ID,
          fileSystemId: FILE_ID,
        }),
        CHANGE_STATUS.Staged,
        SOURCE.Manual,
      ],
    );
    const repo = makeRepo(qr, sessionId);
    const results = await repo.getModulesByContainerId(CONTAINER_ID, FILE_ID);
    expect(results.length).toBe(2);
    const staged = results.find(r => r.moduleSystemId === STAGED_MODULE_ID);
    expect(staged).toBeDefined();
    expect(staged!.containerTypeIds).toContain(CONTAINER_TYPE_ID);
  });

  it('returns empty array when no modules belong to the container', async () => {
    const repo = makeRepo(qr, sessionId);
    const results = await repo.getModulesByContainerId(9999, FILE_ID);
    expect(results).toHaveLength(0);
  });
});

// ── updateHeapId tests ────────────────────────────────────────────────────────

describe('TypeOrmModuleRepository — updateHeapId', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let sessionId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    if (qr) await qr.release();
  });

  it('writes a STAGED delta edit_action with targetTable=SpfModule and delta={heapId}', async () => {
    const repo = makeRepo(qr, sessionId);
    await repo.updateHeapId(MODULE_ID, 0x2);

    const rows: Array<{
      target_table: string;
      aggregate_id: number;
      target_system_id: number;
      new_value: string;
      change_status: string;
    }> = await ds.query(
      `SELECT target_table, aggregate_id, target_system_id, new_value, change_status
       FROM edit_actions
       WHERE session_id = ? AND valid_until IS NULL`,
      [sessionId],
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.target_table).toBe(ENTITY_NAMES.SpfModule);
    expect(row.aggregate_id).toBe(MODULE_ID);
    expect(row.target_system_id).toBe(MODULE_ID);
    expect(row.change_status).toBe(CHANGE_STATUS.Staged);
    const delta = JSON.parse(row.new_value) as {heapId: number};
    expect(delta.heapId).toBe(0x2);
  });

  it('supersedes a prior pending change — old row gets valid_until stamped, new merged row inserted', async () => {
    const repo = makeRepo(qr, sessionId);

    await repo.updateHeapId(MODULE_ID, 0x1);
    await repo.updateHeapId(MODULE_ID, 0x2);

    const activeRows: Array<{new_value: string}> = await ds.query(
      `SELECT new_value FROM edit_actions WHERE session_id = ? AND valid_until IS NULL`,
      [sessionId],
    );
    expect(activeRows).toHaveLength(1);
    const activeDelta = JSON.parse(activeRows[0].new_value) as {heapId: number};
    expect(activeDelta.heapId).toBe(0x2);

    const supersededRows: Array<unknown> = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ? AND valid_until IS NOT NULL`,
      [sessionId],
    );
    expect(supersededRows).toHaveLength(1);
  });
});
