/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {DataPort} from '@arc/core';
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
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';

const FILE_ID = 100;
const MODULE_ID = 50;
const DEF_ID = 200;
const CONTAINER_ID = 300;
const SUBGRAPH_ID = 400;

async function seedProjectAndFile(ds: DataSource) {
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

async function seedModule(ds: DataSource) {
  await ds.query(
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name) VALUES (1, 1, 'proc')`,
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_exported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (?, 1, 5, ?)`,
    [CONTAINER_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (?, 1, 'def', 0, ?, 0, 1)`,
    [DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [MODULE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, 'base-alias', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
}

function makeWriter(manager: QueryRunner['manager']): PendingChangeWriter {
  return new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
}

describe('Module PATCH write path (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;

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
    await seedModule(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  it('multi-field patch: all edit_actions rows share the same group_id', async () => {
    const sessionId = await seedSession(ds);
    const groupId = 'shared-group-uuid';
    const uow = {
      getWriteContext: () => ({
        session: {
          sessionId,
          fileSystemId: FILE_ID,
          mode: SESSION_MODE.Designer,
          projectId: '1',
        },
        groupId,
      }),
    } as any;
    const repo = new TypeOrmModuleRepository(
      makeWriter(qr.manager),
      qr.manager,
      uow,
    );
    await qr.startTransaction();
    await repo.renameModule(MODULE_ID, 'new-alias');
    const port = new DataPort({
      systemId: 700,
      dataPortId: 3,
      portIoType: 'OUTPUT',
      isStatic: false,
    });
    await repo.addDataPort(port, MODULE_ID);
    await qr.commitTransaction();

    const rows: any[] = await ds.query(
      `SELECT group_id FROM edit_actions WHERE session_id = ? AND aggregate_id = ?`,
      [sessionId, MODULE_ID],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const groupIds = new Set(rows.map((r: any) => r.group_id));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0]).toBe(groupId);
  });

  it('two renameModule calls: second supersedes first — one active row remains', async () => {
    const sessionId = await seedSession(ds);
    const uow = {
      getWriteContext: () => ({
        session: {
          sessionId,
          fileSystemId: FILE_ID,
          mode: SESSION_MODE.Designer,
          projectId: '1',
        },
        groupId: 'g1',
      }),
    } as any;
    const repo = new TypeOrmModuleRepository(
      makeWriter(qr.manager),
      qr.manager,
      uow,
    );
    await qr.startTransaction();
    await repo.renameModule(MODULE_ID, 'first');
    await repo.renameModule(MODULE_ID, 'second');
    await qr.commitTransaction();

    const activeRows: any[] = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND valid_until IS NULL`,
      [sessionId, MODULE_ID],
    );
    // Accumulator mode: second rename should supersede first → 1 active row
    expect(activeRows).toHaveLength(1);
    const parsed = JSON.parse(activeRows[0].new_value);
    // The accumulated value should reflect 'second' alias
    expect(parsed.alias).toBe('second');
  });
});
