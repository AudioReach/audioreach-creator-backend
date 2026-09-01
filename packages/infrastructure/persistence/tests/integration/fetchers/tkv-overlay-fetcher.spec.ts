/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  SOURCE,
  CONFIGURATION_INCLUDES,
} from '@arc/core';
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
import {TkvOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/tkv-overlay-fetcher.js';
import {TkvParameterPayloadFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/tkv-parameter-payload-fetcher.js';
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
const TAG_DEF_ID = 10;
const TAG_MAP_ID = 20;
const TKV_ID = 30;
const TKV_PAYLOAD_ID = 40;
const PARAM_DEF_ID = 60;

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

async function seedTagDefinition(ds: DataSource) {
  await ds.query(
    `INSERT INTO tag_definitions (system_id, tag_id, name, file_system_id, is_voice) VALUES (?, 1, 'tag', ?, 0)`,
    [TAG_DEF_ID, FILE_ID],
  );
}

async function seedParamDef(ds: DataSource) {
  await ds.query(
    `INSERT INTO spf_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, spf_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID, DEF_ID],
  );
}

async function seedTagMap(ds: DataSource, tagMapId = TAG_MAP_ID) {
  await ds.query(
    `INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (?, ?, ?)`,
    [tagMapId, MODULE_ID, TAG_DEF_ID],
  );
}

async function seedTkv(ds: DataSource, tkvId = TKV_ID, tagMapId = TAG_MAP_ID) {
  await ds.query(
    `INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (?, ?)`,
    [tkvId, tagMapId],
  );
}

async function seedTkvPayload(
  ds: DataSource,
  payloadId = TKV_PAYLOAD_ID,
  tkvId = TKV_ID,
) {
  await ds.query(
    `INSERT INTO tkv_parameter_payload (system_id, parameter_system_id, tkv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [payloadId, PARAM_DEF_ID, tkvId, Buffer.alloc(0)],
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

describe('TkvOverlayFetcher — fetchMany (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: TkvOverlayFetcher;

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
    await seedTagDefinition(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
    const editActionsQs = new EditActionsQueryService(qr.manager);
    fetcher = new TkvOverlayFetcher(
      qr.manager,
      editActionsQs,
      new TkvParameterPayloadFetcher(qr.manager, editActionsQs),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  it('fetchMany — sessionId=null — returns baseline tag maps with tkvs', async () => {
    await seedTagMap(ds);
    await seedTkv(ds);
    const results = await fetcher.fetchMany(
      MODULE_ID,
      null,
      CONFIGURATION_INCLUDES.Summary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(TAG_MAP_ID);
    expect(results[0].tkvs).toHaveLength(1);
    expect(results[0].tkvs[0].systemId).toBe(TKV_ID);
  });

  it('fetchMany — no session actions — returns baseline unchanged', async () => {
    await seedTagMap(ds);
    const sessionId = await seedSession(ds);
    const results = await fetcher.fetchMany(
      MODULE_ID,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(TAG_MAP_ID);
  });

  it('fetchMany — CREATE tag map action — includes created tag map', async () => {
    const sessionId = await seedSession(ds);
    const newTagMapId = TAG_MAP_ID + 5;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: newTagMapId,
      targetTable: ENTITY_NAMES.ModuleTagIdMap,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({
        spfModuleSystemId: MODULE_ID,
        tagDefinitionSystemId: TAG_DEF_ID,
      }),
    });
    const results = await fetcher.fetchMany(
      MODULE_ID,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(newTagMapId);
    expect(results[0].tkvs).toHaveLength(0);
  });

  it('fetchMany — CREATE tkv under existing tag map — includes created TKV', async () => {
    await seedTagMap(ds);
    const sessionId = await seedSession(ds);
    const newTkvId = TKV_ID + 5;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: TAG_MAP_ID,
      targetSystemId: newTkvId,
      targetTable: ENTITY_NAMES.Tkv,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({moduleTagIdMapSystemId: TAG_MAP_ID}),
    });
    const results = await fetcher.fetchMany(
      MODULE_ID,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].tkvs).toHaveLength(1);
    expect(results[0].tkvs[0].systemId).toBe(newTkvId);
  });

  it('fetchMany — CREATE then UPDATE in same session — UPDATE is applied to created TKV', async () => {
    await seedTagMap(ds);
    const sessionId = await seedSession(ds);
    const newTkvId = TKV_ID + 10;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: TAG_MAP_ID,
      targetSystemId: newTkvId,
      targetTable: ENTITY_NAMES.Tkv,
      operation: CHANGE_OPERATION.Create,
      fieldPath: null,
      newValue: JSON.stringify({moduleTagIdMapSystemId: TAG_MAP_ID}),
    });
    await seedEditAction(ds, {
      sessionId,
      aggregateId: TAG_MAP_ID,
      targetSystemId: newTkvId,
      targetTable: ENTITY_NAMES.Tkv,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'moduleTagIdMapSystemId',
      newValue: String(TAG_MAP_ID),
    });
    const results = await fetcher.fetchMany(
      MODULE_ID,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].tkvs).toHaveLength(1);
    expect(results[0].tkvs[0].systemId).toBe(newTkvId);
    expect(results[0].tkvs[0].moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
  });

  it('fetchMany — DELETE tkv action — excludes deleted TKV', async () => {
    await seedTagMap(ds);
    await seedTkv(ds);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: TAG_MAP_ID,
      targetSystemId: TKV_ID,
      targetTable: ENTITY_NAMES.Tkv,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    const results = await fetcher.fetchMany(
      MODULE_ID,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].tkvs).toHaveLength(0);
  });
});

describe('TkvParameterPayloadFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let payloadFetcher: TkvParameterPayloadFetcher;

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
    await seedTagDefinition(ds);
    await seedParamDef(ds);
    await seedTagMap(ds);
    await seedTkv(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
    payloadFetcher = new TkvParameterPayloadFetcher(
      qr.manager,
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  it('fetchMany — sessionId=null — returns all baseline rows', async () => {
    await seedTkvPayload(ds, TKV_PAYLOAD_ID, TKV_ID);
    const results = await payloadFetcher.fetchMany(TKV_ID, null);
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(TKV_PAYLOAD_ID);
  });

  it('fetchMany — CREATE action — adds row', async () => {
    const sessionId = await seedSession(ds);
    const newId = TKV_PAYLOAD_ID + 10;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: TAG_MAP_ID,
      targetSystemId: newId,
      targetTable: ENTITY_NAMES.TkvParameterPayload,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({
        tkvSystemId: TKV_ID,
        parameterSystemId: PARAM_DEF_ID,
      }),
    });
    const results = await payloadFetcher.fetchMany(TKV_ID, sessionId);
    expect(results).toHaveLength(1);
    expect(results[0].systemId).toBe(newId);
  });

  it('fetchMany — DELETE action — removes row', async () => {
    await seedTkvPayload(ds, TKV_PAYLOAD_ID, TKV_ID);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: TAG_MAP_ID,
      targetSystemId: TKV_PAYLOAD_ID,
      targetTable: ENTITY_NAMES.TkvParameterPayload,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    const results = await payloadFetcher.fetchMany(TKV_ID, sessionId);
    expect(results).toHaveLength(0);
  });
});
