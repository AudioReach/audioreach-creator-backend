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
const CKV_ID = 10;
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

async function seedCkv(ds: DataSource) {
  await ds.query(
    `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
    [CKV_ID, MODULE_ID],
  );
}

async function seedPayload(ds: DataSource) {
  await ds.query(
    `INSERT INTO ckv_parameter_payload (system_id, parameter_system_id, ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [PAYLOAD_ID, PARAM_DEF_ID, CKV_ID, Buffer.alloc(0)],
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

describe('TypeOrmModuleRepository — CKV cal data', () => {
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
    await seedCkv(ds);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  it('getSpfModuleForValidation returns SpfModuleBase with all four fields', async () => {
    const repo = makeRepo(qr, sessionId);
    const result = await repo.getSpfModuleForValidation(MODULE_ID, FILE_ID);
    expect(result).not.toBeNull();
    expect(result!.systemId).toBe(MODULE_ID);
    expect(result!.definitionSystemId).toBe(DEF_ID);
    expect(result!.subgraphSystemId).toBe(SUBGRAPH_ID);
    expect(result!.containerSystemId).toBe(CONTAINER_ID);
  });

  it('getSpfModuleForValidation returns null when module does not exist', async () => {
    const repo = makeRepo(qr, sessionId);
    const result = await repo.getSpfModuleForValidation(9999, FILE_ID);
    expect(result).toBeNull();
  });

  it('ckvExists returns true when CKV exists', async () => {
    const repo = makeRepo(qr, sessionId);
    const result = await repo.ckvExists(MODULE_ID, CKV_ID);
    expect(result).toBe(true);
  });

  it('ckvExists returns false when CKV does not exist', async () => {
    const repo = makeRepo(qr, sessionId);
    const result = await repo.ckvExists(MODULE_ID, 9999);
    expect(result).toBe(false);
  });

  it('getExistingCkvPayloads returns rows with systemId and parameterSystemId', async () => {
    await seedPayload(ds);
    const repo = makeRepo(qr, sessionId);
    const results = await repo.getExistingCkvPayloads(MODULE_ID, CKV_ID);
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(PAYLOAD_ID);
    expect(results[0].parameterSystemId).toBe(PARAM_DEF_ID);
  });

  it('setCkvCalData writes edit_actions with aggregateId=spfModuleSystemId and correct base64 payload', async () => {
    await seedPayload(ds);
    const repo = makeRepo(qr, sessionId);
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await repo.setCkvCalData(MODULE_ID, CKV_ID, [
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
    expect(row.target_table).toBe(ENTITY_NAMES.CkvParameterPayload);
    expect(row.aggregate_id).toBe(MODULE_ID);
    expect(row.target_system_id).toBe(PAYLOAD_ID);
    expect(row.change_status).toBe(CHANGE_STATUS.Staged);
    const delta = JSON.parse(row.new_value) as {payload: {__blob: string}};
    expect(Buffer.from(delta.payload.__blob, 'base64')).toEqual(
      Buffer.from(payload),
    );
  });

  it('setCkvCalData writes uiPersistence edit_action on Ckv row when provided', async () => {
    const repo = makeRepo(qr, sessionId);
    const uiPersistence = new Uint8Array([0x01, 0x02, 0x03]);
    await repo.setCkvCalData(MODULE_ID, CKV_ID, [], uiPersistence);
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
    expect(row.target_table).toBe(ENTITY_NAMES.Ckv);
    expect(row.aggregate_id).toBe(MODULE_ID);
    expect(row.target_system_id).toBe(CKV_ID);
    const delta = JSON.parse(row.new_value) as {
      uiPersistence: {__blob: string};
    };
    expect(Buffer.from(delta.uiPersistence.__blob, 'base64')).toEqual(
      Buffer.from(uiPersistence),
    );
  });

  it('setCkvCalData with empty payloadUpdates and uiPersistence only writes one edit_action', async () => {
    const repo = makeRepo(qr, sessionId);
    await repo.setCkvCalData(MODULE_ID, CKV_ID, [], new Uint8Array([0xff]));
    const rows: Array<unknown> = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ?`,
      [sessionId],
    );
    expect(rows).toHaveLength(1);
  });
});
