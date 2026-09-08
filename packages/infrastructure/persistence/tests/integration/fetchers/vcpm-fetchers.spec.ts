/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
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
import {VcpmInstanceFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/vcpm-instance-fetcher.js';
import {VcpmCkvFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/vcpm-ckv-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/vcpm-parameter-payload-fetcher.js';
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
} from '@jest/globals';

const FILE_ID = 100;
const SUBGRAPH_ID = 400;
const VCPM_DEF_ID = 10;
const VCPM_INSTANCE_ID = 20;
const CKV_ID = 30;
const PARAM_ID = 60;
const PAYLOAD_ID = 70;

async function seedBase(ds: DataSource) {
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
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (?, 1, 'vcpm_def', ?)`,
    [VCPM_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_instances (system_id, subgraph_system_id, vcpm_definition_id) VALUES (?, ?, ?)`,
    [VCPM_INSTANCE_ID, SUBGRAPH_ID, VCPM_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_ckv (system_id, vcpm_instance_system_id) VALUES (?, ?)`,
    [CKV_ID, VCPM_INSTANCE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_ID, VCPM_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [PAYLOAD_ID, PARAM_ID, CKV_ID, Buffer.alloc(4)],
  );
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

async function seedAction(
  ds: DataSource,
  opts: {
    sessionId: number;
    targetSystemId: number;
    targetTable: string;
    operation: string;
    newValue: unknown;
    fieldPath?: string | null;
  },
) {
  await ds.query(
    `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      opts.sessionId,
      SUBGRAPH_ID,
      opts.targetSystemId,
      opts.targetTable,
      opts.operation,
      opts.fieldPath ?? null,
      JSON.stringify(opts.newValue),
      SOURCE.Manual,
      CHANGE_STATUS.Staged,
    ],
  );
}

describe('VCPM split fetchers (integration)', () => {
  let ds: DataSource;
  let instanceFetcher: VcpmInstanceFetcher;
  let ckvFetcher: VcpmCkvFetcher;
  let payloadFetcher: VcpmParameterPayloadFetcher;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedBase(ds);
    const editActionsSvc = new EditActionsQueryService(ds.manager);
    instanceFetcher = new VcpmInstanceFetcher(ds.manager, editActionsSvc);
    ckvFetcher = new VcpmCkvFetcher(
      ds.manager,
      editActionsSvc,
      instanceFetcher,
    );
    payloadFetcher = new VcpmParameterPayloadFetcher(
      ds.manager,
      editActionsSvc,
    );
  });

  it('applies instance and CKV create/delete overlays', async () => {
    const sessionId = await seedSession(ds);
    await seedAction(ds, {
      sessionId,
      targetSystemId: VCPM_INSTANCE_ID,
      targetTable: ENTITY_NAMES.VcpmInstance,
      operation: CHANGE_OPERATION.Delete,
      newValue: {},
    });
    expect(
      await instanceFetcher.fetchMany(SUBGRAPH_ID, FILE_ID, sessionId),
    ).toEqual([]);

    await ds.query(`DELETE FROM vcpm_instances WHERE system_id = ?`, [
      VCPM_INSTANCE_ID,
    ]);
    await seedAction(ds, {
      sessionId,
      targetSystemId: VCPM_INSTANCE_ID + 1,
      targetTable: ENTITY_NAMES.VcpmInstance,
      operation: CHANGE_OPERATION.Create,
      newValue: {
        subgraphSystemId: SUBGRAPH_ID,
        vcpmDefinitionId: VCPM_DEF_ID,
      },
    });
    const instances = await instanceFetcher.fetchMany(
      SUBGRAPH_ID,
      FILE_ID,
      sessionId,
    );
    expect(instances[0].systemId).toBe(VCPM_INSTANCE_ID + 1);
  });

  it('projects payload associations without returning payload bytes', async () => {
    const links = await payloadFetcher.fetchParameterCkvLinksBySubgraph(
      SUBGRAPH_ID,
      FILE_ID,
      null,
      new Set([CKV_ID]),
    );
    expect(links).toEqual([{parameterSystemId: PARAM_ID, ckvSystemId: CKV_ID}]);
    expect(links[0]).not.toHaveProperty('systemId');
    expect(links[0]).not.toHaveProperty('payload');
  });

  it('excludes a payload link moved outside the effective CKV set', async () => {
    const sessionId = await seedSession(ds);
    await seedAction(ds, {
      sessionId,
      targetSystemId: PAYLOAD_ID,
      targetTable: ENTITY_NAMES.VcpmParameterPayload,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'vcpmCkvSystemId',
      newValue: CKV_ID + 1,
    });
    const links = await payloadFetcher.fetchParameterCkvLinksBySubgraph(
      SUBGRAPH_ID,
      FILE_ID,
      sessionId,
      new Set([CKV_ID]),
    );
    expect(links).toEqual([]);
  });

  it('applies payload create/delete overlays and parameter filtering', async () => {
    const sessionId = await seedSession(ds);
    await seedAction(ds, {
      sessionId,
      targetSystemId: PAYLOAD_ID,
      targetTable: ENTITY_NAMES.VcpmParameterPayload,
      operation: CHANGE_OPERATION.Delete,
      newValue: {},
    });
    expect(
      await payloadFetcher.fetchMany(
        CKV_ID,
        SUBGRAPH_ID,
        FILE_ID,
        sessionId,
        new Set([CKV_ID]),
        [PARAM_ID],
      ),
    ).toEqual([]);
  });
});
