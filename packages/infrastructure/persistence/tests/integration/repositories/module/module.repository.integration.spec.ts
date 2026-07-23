/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

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
import {DataPort} from '@arc/core';
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
  // Seed prerequisite tables using raw SQL to avoid FK chain complexity in tests
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

async function seedDataPort(ds: DataSource, portSystemId: number) {
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, name, node_system_id) VALUES (?, 1, 'INPUT', 0, 'p', ?)`,
    [portSystemId, MODULE_ID],
  );
}

function makeWriter(manager: QueryRunner['manager']): PendingChangeWriter {
  return new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
}

function makeUow(sessionId: number) {
  return {
    getWriteContext: () => ({
      session: {
        sessionId,
        fileSystemId: FILE_ID,
        mode: SESSION_MODE.Designer,
        projectId: '1',
      },
      groupId: 'test-group',
    }),
  } as any;
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId: number,
): TypeOrmModuleRepository {
  return new TypeOrmModuleRepository(
    makeWriter(manager),
    manager,
    makeUow(sessionId),
  );
}

describe('TypeOrmModuleRepository (integration)', () => {
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
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  describe('findModuleForPatch', () => {
    it('returns null when module does not exist', async () => {
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      expect(await repo.findModuleForPatch(9999, FILE_ID)).toBeNull();
    });

    it('returns SpfModule with correct fields when module exists', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      const module = await repo.findModuleForPatch(MODULE_ID, FILE_ID);
      expect(module).not.toBeNull();
      expect(module!.systemId).toBe(MODULE_ID);
      expect(module!.definitionSystemId).toBe(DEF_ID);
      expect(module!.containerSystemId).toBe(CONTAINER_ID);
    });

    it('returns SpfModule with data ports populated', async () => {
      await seedModule(ds);
      await seedDataPort(ds, 600);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      const module = await repo.findModuleForPatch(MODULE_ID, FILE_ID);
      expect(module!.dataPorts).toHaveLength(1);
      expect(module!.dataPorts[0].systemId).toBe(600);
    });
  });

  describe('renameModule', () => {
    it('writes a delta edit_action row with alias and correct metadata', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      await repo.renameModule(MODULE_ID, 'new-alias');
      await qr.commitTransaction();
      const rows: any[] = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND target_table = ?`,
        [sessionId, MODULE_ID, ENTITY_NAMES.SpfModule],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].change_status).toBe(CHANGE_STATUS.Staged);
      expect(rows[0].source).toBe(SOURCE.Manual);
    });
  });

  describe('addDataPort / removeDataPort', () => {
    it('addDataPort writes a CREATE edit_action for DataPort under module aggregate', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const port = new DataPort({
        systemId: 700,
        dataPortId: 1,
        portIoType: 'INPUT',
        isStatic: false,
        name: 'p',
      });
      await repo.addDataPort(port, MODULE_ID);
      await qr.commitTransaction();
      const rows: any[] = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND target_table = ? AND operation = ?`,
        [sessionId, MODULE_ID, ENTITY_NAMES.DataPort, CHANGE_OPERATION.Create],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].target_system_id).toBe(700);
    });

    it('removeDataPort writes a DELETE edit_action for DataPort', async () => {
      await seedModule(ds);
      await seedDataPort(ds, 600);
      const sessionId = await seedSession(ds);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      await repo.removeDataPort(600, MODULE_ID);
      await qr.commitTransaction();
      const rows: any[] = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND operation = ?`,
        [sessionId, 600, CHANGE_OPERATION.Delete],
      );
      expect(rows).toHaveLength(1);
    });
  });
});
