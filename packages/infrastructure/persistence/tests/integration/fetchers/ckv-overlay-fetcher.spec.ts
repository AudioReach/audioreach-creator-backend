/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {CkvOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/ckv-overlay-fetcher.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
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
const PARAM_DEF_ID_2 = 21;
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
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, 'mod', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
}

async function seedParamDef(ds: DataSource) {
  await ds.query(
    `INSERT INTO spf_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, spf_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID, DEF_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, spf_module_definition_system_id) VALUES (?, 2, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID_2, DEF_ID],
  );
}

async function seedCkv(ds: DataSource, ckvSystemId = CKV_ID) {
  await ds.query(
    `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
    [ckvSystemId, MODULE_ID],
  );
}

async function seedPayload(
  ds: DataSource,
  payloadSystemId = PAYLOAD_ID,
  ckvSystemId = CKV_ID,
) {
  await ds.query(
    `INSERT INTO ckv_parameter_payload (system_id, parameter_system_id, ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [payloadSystemId, PARAM_DEF_ID, ckvSystemId, Buffer.alloc(0)],
  );
}

async function seedEditAction(
  ds: DataSource,
  opts: {
    sessionId: number;
    aggregateId: number;
    targetSystemId: number;
    targetTable: string;
    operation: string;
    newValue: string;
    fieldPath?: string | null;
  },
) {
  await ds.query(
    `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      opts.sessionId,
      opts.aggregateId,
      opts.targetSystemId,
      opts.targetTable,
      opts.operation,
      opts.fieldPath ?? null,
      opts.newValue,
      SOURCE.Manual,
      CHANGE_STATUS.Staged,
    ],
  );
}

describe('CkvOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: CkvOverlayFetcher;

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
    qr = ds.createQueryRunner();
    await qr.connect();
    fetcher = new CkvOverlayFetcher(
      qr.manager,
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  // ── fetchCkv ─────────────────────────────────────────────────────────────────

  it('fetchCkv — row in DB, sessionId=null — returns CkvBase with correct systemId', async () => {
    await seedCkv(ds);
    const result = await fetcher.fetchCkv(CKV_ID, MODULE_ID, null);
    expect(result).not.toBeNull();
    expect(result!.systemId).toBe(CKV_ID);
    expect(result!.spfModuleSystemId).toBe(MODULE_ID);
  });

  it('fetchCkv — DELETE edit_action present — returns null', async () => {
    await seedCkv(ds);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: CKV_ID,
      targetTable: ENTITY_NAMES.Ckv,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    const result = await fetcher.fetchCkv(CKV_ID, MODULE_ID, sessionId);
    expect(result).toBeNull();
  });

  it('fetchCkv — CREATE edit_action, no DB row — returns synthesised row', async () => {
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: CKV_ID,
      targetTable: ENTITY_NAMES.Ckv,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({spfModuleSystemId: MODULE_ID}),
    });
    const result = await fetcher.fetchCkv(CKV_ID, MODULE_ID, sessionId);
    expect(result).not.toBeNull();
    expect(result!.systemId).toBe(CKV_ID);
    expect(result!.spfModuleSystemId).toBe(MODULE_ID);
  });

  // ── fetchCkvPayloads ──────────────────────────────────────────────────────────

  it('fetchCkvPayloads — committed rows, sessionId=null — returns all rows', async () => {
    await seedCkv(ds);
    await seedPayload(ds, PAYLOAD_ID, CKV_ID);
    await ds.query(
      `INSERT INTO ckv_parameter_payload (system_id, parameter_system_id, ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
      [PAYLOAD_ID + 1, PARAM_DEF_ID_2, CKV_ID, Buffer.alloc(0)],
    );
    const results = await fetcher.fetchCkvPayloads(CKV_ID, MODULE_ID, null);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.systemId).sort()).toEqual(
      [PAYLOAD_ID, PAYLOAD_ID + 1].sort(),
    );
  });

  it('fetchCkvPayloads — CREATE edit_action adds row to results', async () => {
    await seedCkv(ds);
    await seedPayload(ds, PAYLOAD_ID, CKV_ID);
    const sessionId = await seedSession(ds);
    const newPayloadId = PAYLOAD_ID + 10;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: newPayloadId,
      targetTable: ENTITY_NAMES.CkvParameterPayload,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({ckvSystemId: CKV_ID, parameterSystemId: PARAM_DEF_ID}),
    });
    const results = await fetcher.fetchCkvPayloads(
      CKV_ID,
      MODULE_ID,
      sessionId,
    );
    expect(results).toHaveLength(2);
    expect(results.some(r => r.systemId === newPayloadId)).toBe(true);
  });

  it('fetchCkvPayloads — DELETE edit_action removes row from results', async () => {
    await seedCkv(ds);
    await seedPayload(ds, PAYLOAD_ID, CKV_ID);
    await ds.query(
      `INSERT INTO ckv_parameter_payload (system_id, parameter_system_id, ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
      [PAYLOAD_ID + 1, PARAM_DEF_ID_2, CKV_ID, Buffer.alloc(0)],
    );
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: PAYLOAD_ID,
      targetTable: ENTITY_NAMES.CkvParameterPayload,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    const results = await fetcher.fetchCkvPayloads(
      CKV_ID,
      MODULE_ID,
      sessionId,
    );
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(PAYLOAD_ID + 1);
  });
});
