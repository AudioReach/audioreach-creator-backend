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
import {CHANGE_OPERATION} from '@arc/core';
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
import {TypeOrmSubgraphRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/subgraph/subgraph.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {OverlayMergeImpl} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {EditActionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';

const FILE_ID = 100;
const SUBGRAPH_ID = 200;
const VCPM_DEF_ID = 10;
const VCPM_INSTANCE_ID = 20;
const VALUE_DEF_ID = 40;
const CKV_ID = 50;
const VCPM_PARAM_DEF_ID = 60;
const PAYLOAD_ID = 70;

async function seedBase(ds: DataSource): Promise<number> {
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
    lastReservedId: 1000,
  });
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (?, 1, 'vcpm', ?)`,
    [VCPM_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_instances (system_id, subgraph_system_id, vcpm_definition_id) VALUES (?, ?, ?)`,
    [VCPM_INSTANCE_ID, SUBGRAPH_ID, VCPM_DEF_ID],
  );
  await seedParameterDefinition(ds);
  await ds.query(
    `INSERT INTO arc_keys (system_id, file_system_id, key_id, name) VALUES (?, ?, 1, 'key')`,
    [30, FILE_ID],
  );
  await ds.query(
    `INSERT INTO arc_values (system_id, value_id, name, keys_system_id) VALUES (?, 1, 'val', ?)`,
    [VALUE_DEF_ID, 30],
  );
  const session = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'u',
    clientId: 'c',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  return session.sessionId;
}

async function seedParameterDefinition(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT OR IGNORE INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, ?, 0, ?)`,
    [
      VCPM_PARAM_DEF_ID,
      JSON.stringify([
        {elementType: 'ConfigElement', dataType: 'UInt8', defaultValue: '3'},
      ]),
      VCPM_DEF_ID,
    ],
  );
}

async function seedCkv(ds: DataSource): Promise<void> {
  await seedCkvParent(ds, CKV_ID);
  await ds.query(
    `INSERT INTO vcpm_ckv_values (vcpm_ckv_system_id, value_def_system_id) VALUES (?, ?)`,
    [CKV_ID, VALUE_DEF_ID],
  );
}

async function seedCkvParent(
  ds: DataSource,
  ckvSystemId: number,
): Promise<void> {
  await ds.query(
    `INSERT INTO vcpm_ckv (system_id, vcpm_instance_system_id) VALUES (?, ?)`,
    [ckvSystemId, VCPM_INSTANCE_ID],
  );
}

async function seedPayload(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [PAYLOAD_ID, VCPM_PARAM_DEF_ID, CKV_ID, Buffer.alloc(1)],
  );
}

function makeRepo(
  qr: QueryRunner,
  sessionId: number,
  nextId = 500,
): TypeOrmSubgraphRepository {
  const editActionsSvc = new EditActionsQueryService(qr.manager);
  const writer = new PendingChangeWriter(
    editActionsSvc,
    new PendingChangeCache(),
  );
  const idGeneration = {
    getNextId: async (_fileId: number) => nextId++,
    reserveBlock: async (_fileId: number) => nextId,
    persistLastUsedId: async (_fileId: number) => {},
  };
  const uow = {
    getWriteContext: () => ({
      session: {sessionId, fileSystemId: FILE_ID},
      groupId: 'grp-test',
    }),
  };
  return new TypeOrmSubgraphRepository(
    writer,
    qr.manager,
    uow as never,
    idGeneration,
    editActionsSvc,
    new OverlayMergeImpl(),
  );
}

describe('TypeOrmSubgraphRepository VCPM CKV methods', () => {
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
    sessionId = await seedBase(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });

  afterEach(async () => {
    if (qr) await qr.release();
  });

  it('resolves the VcpmInstance systemId', async () => {
    const repo = makeRepo(qr, sessionId);
    await expect(
      repo.getVcpmInstanceSystemId(SUBGRAPH_ID, VCPM_DEF_ID),
    ).resolves.toBe(VCPM_INSTANCE_ID);
  });

  it('returns null when the VcpmInstance does not exist', async () => {
    const repo = makeRepo(qr, sessionId);
    await expect(
      repo.getVcpmInstanceSystemId(SUBGRAPH_ID, 9999),
    ).resolves.toBeNull();
  });

  it('detects committed CKVs with matching values', async () => {
    await seedCkv(ds);
    const repo = makeRepo(qr, sessionId);
    await expect(
      repo.vcpmCkvExists(VCPM_INSTANCE_ID, [VALUE_DEF_ID]),
    ).resolves.toBe(true);
    await expect(repo.vcpmCkvExists(VCPM_INSTANCE_ID, [9999])).resolves.toBe(
      false,
    );
  });

  it('detects a staged CKV create with matching values', async () => {
    await seedCkvParent(ds, 502);
    const repo = makeRepo(qr, sessionId, 502);
    await repo.createVcpmCkv(SUBGRAPH_ID, VCPM_INSTANCE_ID, [VALUE_DEF_ID], []);
    await expect(
      repo.vcpmCkvExists(VCPM_INSTANCE_ID, [VALUE_DEF_ID]),
    ).resolves.toBe(true);
  });

  it('checks CKV existence against the owning subgraph', async () => {
    await seedCkv(ds);
    const repo = makeRepo(qr, sessionId);
    await expect(
      repo.vcpmCkvExistsBySystemId(CKV_ID, SUBGRAPH_ID),
    ).resolves.toBe(true);
    await expect(repo.vcpmCkvExistsBySystemId(CKV_ID, 9999)).resolves.toBe(
      false,
    );
  });

  it('recognizes staged CKV creates and staged deletes', async () => {
    const repo = makeRepo(qr, sessionId, 502);
    const editActions = getTestRepository(EditActionSchema);
    await editActions.save({
      sessionId,
      aggregateId: SUBGRAPH_ID,
      targetSystemId: 502,
      targetTable: ENTITY_NAMES.VcpmCkv,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {vcpmInstanceSystemId: VCPM_INSTANCE_ID},
      source: 'MANUAL',
      changeStatus: 'STAGED',
      groupId: 'grp-test',
      linkedEntityGroupId: null,
      validUntil: null,
    });
    await expect(repo.vcpmCkvExistsBySystemId(502, SUBGRAPH_ID)).resolves.toBe(
      true,
    );

    await seedCkv(ds);
    await editActions.save({
      sessionId,
      aggregateId: SUBGRAPH_ID,
      targetSystemId: CKV_ID,
      targetTable: ENTITY_NAMES.VcpmCkv,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: null,
      newValue: {},
      source: 'MANUAL',
      changeStatus: 'STAGED',
      groupId: 'grp-test',
      linkedEntityGroupId: null,
      validUntil: null,
    });
    await expect(
      repo.vcpmCkvExistsBySystemId(CKV_ID, SUBGRAPH_ID),
    ).resolves.toBe(false);
  });

  it('creates a CKV, direct values, and default payload actions', async () => {
    await seedParameterDefinition(ds);
    await seedCkvParent(ds, 500);
    const repo = makeRepo(qr, sessionId, 500);
    const ckvId = await repo.createVcpmCkv(
      SUBGRAPH_ID,
      VCPM_INSTANCE_ID,
      [VALUE_DEF_ID],
      [
        {
          systemId: VCPM_PARAM_DEF_ID,
          isReadOnly: false,
          elementsStructure: JSON.stringify([
            {
              elementType: 'ConfigElement',
              dataType: 'UInt8',
              defaultValue: '3',
            },
          ]),
        },
      ],
    );
    expect(ckvId).toBe(500);
    const values = await ds.query(
      `SELECT * FROM vcpm_ckv_values WHERE vcpm_ckv_system_id = ?`,
      [ckvId],
    );
    expect(values).toHaveLength(1);
    const actions = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND valid_until IS NULL`,
      [sessionId, 501],
    );
    expect(actions).toHaveLength(1);
  });

  it('returns committed payload rows', async () => {
    await seedCkv(ds);
    await seedPayload(ds);
    const repo = makeRepo(qr, sessionId);
    await expect(repo.getVcpmCkvPayloads(CKV_ID, SUBGRAPH_ID)).resolves.toEqual(
      [{systemId: PAYLOAD_ID, vcpmParameterSystemId: VCPM_PARAM_DEF_ID}],
    );
  });

  it('includes staged payload creates and excludes staged deletes', async () => {
    await seedParameterDefinition(ds);
    await seedCkvParent(ds, 600);
    const repo = makeRepo(qr, sessionId, 600);
    const ckvId = await repo.createVcpmCkv(
      SUBGRAPH_ID,
      VCPM_INSTANCE_ID,
      [VALUE_DEF_ID],
      [
        {
          systemId: VCPM_PARAM_DEF_ID,
          isReadOnly: false,
          elementsStructure: '[]',
        },
      ],
    );
    await expect(repo.getVcpmCkvPayloads(ckvId, SUBGRAPH_ID)).resolves.toEqual([
      {systemId: 601, vcpmParameterSystemId: VCPM_PARAM_DEF_ID},
    ]);

    await seedCkv(ds);
    await seedPayload(ds);
    await repo.deleteVcpmCkv(SUBGRAPH_ID, CKV_ID);
    await expect(repo.getVcpmCkvPayloads(CKV_ID, SUBGRAPH_ID)).resolves.toEqual(
      [],
    );
  });

  it('stages calibration-data deltas and supersedes prior deltas', async () => {
    await seedCkv(ds);
    await seedPayload(ds);
    const repo = makeRepo(qr, sessionId);
    await repo.updateVcpmCalData(SUBGRAPH_ID, CKV_ID, [
      {payloadSystemId: PAYLOAD_ID, payload: new Uint8Array([1])},
    ]);
    await repo.updateVcpmCalData(SUBGRAPH_ID, CKV_ID, [
      {payloadSystemId: PAYLOAD_ID, payload: new Uint8Array([2])},
    ]);
    const rows = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND valid_until IS NULL`,
      [sessionId, PAYLOAD_ID],
    );
    expect(rows).toHaveLength(1);
  });

  it('keeps an existing payload visible after an overlay update', async () => {
    await seedCkv(ds);
    await seedPayload(ds);
    const repo = makeRepo(qr, sessionId);
    await repo.updateVcpmCalData(SUBGRAPH_ID, CKV_ID, [
      {payloadSystemId: PAYLOAD_ID, payload: new Uint8Array([3, 4])},
    ]);
    await expect(repo.getVcpmCkvPayloads(CKV_ID, SUBGRAPH_ID)).resolves.toEqual(
      [{systemId: PAYLOAD_ID, vcpmParameterSystemId: VCPM_PARAM_DEF_ID}],
    );
  });

  it('stages deletes for payloads and the CKV row', async () => {
    await seedCkv(ds);
    await seedPayload(ds);
    const repo = makeRepo(qr, sessionId);
    await repo.deleteVcpmCkv(SUBGRAPH_ID, CKV_ID);
    const rows = await ds.query(
      `SELECT target_table, operation FROM edit_actions WHERE session_id = ? AND valid_until IS NULL`,
      [sessionId],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          target_table: ENTITY_NAMES.VcpmParameterPayload,
          operation: CHANGE_OPERATION.Delete,
        },
        {
          target_table: ENTITY_NAMES.VcpmCkv,
          operation: CHANGE_OPERATION.Delete,
        },
      ]),
    );
  });
});
