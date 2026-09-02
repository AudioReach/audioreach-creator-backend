/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {CHANGE_STATUS, SOURCE} from '@arc/core';
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
const TAG_DEF_ID = 500;
const TAG_MAP_ID = 40;
const TKV_ID = 60;
const PARAM_DEF_ID = 20;
const PAYLOAD_ID = 30;

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
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (1, 1, 'proc', ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
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
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, 'mod', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
}

async function seedParamDef(ds: DataSource) {
  await ds.query(
    `INSERT INTO spf_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, spf_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID, DEF_ID],
  );
}

async function seedTagData(ds: DataSource) {
  await ds.query(
    `INSERT INTO tag_definitions (system_id, tag_id, name, is_voice, file_system_id) VALUES (?, 1, 'ch', 0, ?)`,
    [TAG_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (?, ?, ?)`,
    [TAG_MAP_ID, MODULE_ID, TAG_DEF_ID],
  );
  await ds.query(
    `INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (?, ?)`,
    [TKV_ID, TAG_MAP_ID],
  );
}

async function seedPayload(ds: DataSource) {
  await ds.query(
    `INSERT INTO tkv_parameter_payload (system_id, parameter_system_id, tkv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [PAYLOAD_ID, PARAM_DEF_ID, TKV_ID, Buffer.alloc(0)],
  );
}

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
    getModuleRepository: () => {
      throw new Error('not needed');
    },
    getModuleDefinitionRepository: () => {
      throw new Error('not needed');
    },
  };
  return new TypeOrmModuleRepository(writer, qr.manager, uow as never);
}

describe('TypeOrmModuleRepository — TKV cal data methods', () => {
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
    await seedModule(ds);
    await seedParamDef(ds);
    await seedTagData(ds);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  describe('moduleTagIdMapExists', () => {
    it('returns true when the tag map row is in DB', async () => {
      const repo = makeRepo(qr, sessionId);
      expect(await repo.moduleTagIdMapExists(MODULE_ID, TAG_MAP_ID)).toBe(true);
    });

    it('returns false when spfModuleSystemId does not match', async () => {
      const repo = makeRepo(qr, sessionId);
      expect(await repo.moduleTagIdMapExists(9999, TAG_MAP_ID)).toBe(false);
    });

    it('returns false when moduleTagIdMapSystemId does not exist', async () => {
      const repo = makeRepo(qr, sessionId);
      expect(await repo.moduleTagIdMapExists(MODULE_ID, 9999)).toBe(false);
    });
  });

  describe('tkvExists', () => {
    it('returns true when the TKV row is in DB', async () => {
      const repo = makeRepo(qr, sessionId);
      expect(await repo.tkvExists(TAG_MAP_ID, TKV_ID)).toBe(true);
    });

    it('returns false when moduleTagIdMapSystemId does not match', async () => {
      const repo = makeRepo(qr, sessionId);
      expect(await repo.tkvExists(9999, TKV_ID)).toBe(false);
    });

    it('returns false when tkvSystemId does not exist', async () => {
      const repo = makeRepo(qr, sessionId);
      expect(await repo.tkvExists(TAG_MAP_ID, 9999)).toBe(false);
    });
  });

  describe('getExistingTkvPayloads', () => {
    it('returns all payload rows for the TKV', async () => {
      await seedPayload(ds);
      const repo = makeRepo(qr, sessionId);
      const rows = await repo.getExistingTkvPayloads(TAG_MAP_ID, TKV_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0].systemId).toBe(PAYLOAD_ID);
      expect(rows[0].parameterSystemId).toBe(PARAM_DEF_ID);
    });

    it('returns empty array when no payload rows exist', async () => {
      const repo = makeRepo(qr, sessionId);
      const rows = await repo.getExistingTkvPayloads(TAG_MAP_ID, TKV_ID);
      expect(rows).toHaveLength(0);
    });
  });

  describe('setTkvCalData', () => {
    it('writes edit_actions with aggregateId=moduleTagIdMapSystemId and correct base64 payload', async () => {
      await seedPayload(ds);
      const repo = makeRepo(qr, sessionId);
      const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      await repo.setTkvCalData(TAG_MAP_ID, TKV_ID, [
        {payloadSystemId: PAYLOAD_ID, payload},
      ]);
      const rows: Array<{
        target_table: string;
        aggregate_id: number;
        target_system_id: number;
        new_value: string;
        change_status: string;
      }> = await ds.query(
        `SELECT target_table, aggregate_id, target_system_id, new_value, change_status FROM edit_actions WHERE session_id = ?`,
        [sessionId],
      );
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.target_table).toBe(ENTITY_NAMES.TkvParameterPayload);
      expect(row.aggregate_id).toBe(TAG_MAP_ID);
      expect(row.target_system_id).toBe(PAYLOAD_ID);
      expect(row.change_status).toBe(CHANGE_STATUS.Staged);
      const delta = JSON.parse(row.new_value) as {payload: {__blob: string}};
      expect(Buffer.from(delta.payload.__blob, 'base64')).toEqual(
        Buffer.from(payload),
      );
    });

    it('writes uiPersistence edit_action on Tkv row when provided', async () => {
      const repo = makeRepo(qr, sessionId);
      await repo.setTkvCalData(TAG_MAP_ID, TKV_ID, [], 'hello ui');
      const rows: Array<{
        target_table: string;
        aggregate_id: number;
        target_system_id: number;
        new_value: string;
      }> = await ds.query(
        `SELECT target_table, aggregate_id, target_system_id, new_value FROM edit_actions WHERE session_id = ?`,
        [sessionId],
      );
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.target_table).toBe(ENTITY_NAMES.Tkv);
      expect(row.aggregate_id).toBe(TAG_MAP_ID);
      expect(row.target_system_id).toBe(TKV_ID);
      const delta = JSON.parse(row.new_value) as {uiPersistence: string};
      expect(delta.uiPersistence).toBe('hello ui');
    });

    it('does not write uiPersistence edit_action when uiPersistence is absent', async () => {
      const repo = makeRepo(qr, sessionId);
      await repo.setTkvCalData(TAG_MAP_ID, TKV_ID, []);
      const rows: Array<unknown> = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ?`,
        [sessionId],
      );
      expect(rows).toHaveLength(0);
    });

    it('writes only uiPersistence edit_action when payload batch is empty', async () => {
      const repo = makeRepo(qr, sessionId);
      await repo.setTkvCalData(TAG_MAP_ID, TKV_ID, [], 'persist');
      const rows: Array<unknown> = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ?`,
        [sessionId],
      );
      expect(rows).toHaveLength(1);
    });
  });
});
