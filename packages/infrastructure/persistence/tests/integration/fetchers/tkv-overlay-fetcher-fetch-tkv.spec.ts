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
import {TkvOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/tkv-overlay-fetcher.js';
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

const FILE_ID = 200;
const MODULE_ID = 60;
const TAG_MAP_ID = 70;
const TKV_ID = 80;
const TAG_DEF_ID = 90;
const DEF_SYSTEM_ID = 300;
const SUBGRAPH_ID = 400;
const CONTAINER_ID = 500;

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
    `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (?, 1, 'mod', 0, ?, 0, 1)`,
    [DEF_SYSTEM_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [MODULE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, 'mod', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_SYSTEM_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO tag_definitions (system_id, tag_id, name, is_voice, file_system_id) VALUES (${TAG_DEF_ID}, 1, 'ch', 0, ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (${TAG_MAP_ID}, ${MODULE_ID}, ${TAG_DEF_ID})`,
  );
  await ds.query(
    `INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (${TKV_ID}, ${TAG_MAP_ID})`,
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

function makeFetcher(ds: DataSource): TkvOverlayFetcher {
  return new TkvOverlayFetcher(
    ds.manager,
    new EditActionsQueryService(ds.manager),
  );
}

describe('TkvOverlayFetcher.fetchTkv', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  it('Tier 1 — returns OverlaidTkv when TKV exists and no session', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const fetcher = makeFetcher(ds);
    const result = await fetcher.fetchTkv(TKV_ID, TAG_MAP_ID, null);
    expect(result).not.toBeNull();
    expect(result?.systemId).toBe(TKV_ID);
    expect(result?.moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
  });

  it('Tier 1 — returns null when tkvSystemId not found', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const fetcher = makeFetcher(ds);
    expect(await fetcher.fetchTkv(9999, TAG_MAP_ID, null)).toBeNull();
  });

  it('Tier 1 — returns null when moduleTagIdMapSystemId does not match', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const fetcher = makeFetcher(ds);
    expect(await fetcher.fetchTkv(TKV_ID, 9999, null)).toBeNull();
  });

  it('Tier 3 — returns null for DELETE edit_action', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    await ds.getRepository(ENTITY_NAMES.EditAction).save({
      sessionId,
      targetTable: ENTITY_NAMES.Tkv,
      aggregateId: TAG_MAP_ID,
      targetSystemId: TKV_ID,
      operation: CHANGE_OPERATION.Delete,
      changeStatus: CHANGE_STATUS.Pending,
      source: SOURCE.Manual,
      newValue: null,
    });
    const fetcher = makeFetcher(ds);
    expect(await fetcher.fetchTkv(TKV_ID, TAG_MAP_ID, sessionId)).toBeNull();
  });

  it('Tier 3 — returns synthesised row for CREATE edit_action (not in DB)', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const newTkvId = 999;
    await ds.getRepository(ENTITY_NAMES.EditAction).save({
      sessionId,
      targetTable: ENTITY_NAMES.Tkv,
      aggregateId: TAG_MAP_ID,
      targetSystemId: newTkvId,
      operation: CHANGE_OPERATION.Create,
      changeStatus: CHANGE_STATUS.Pending,
      source: SOURCE.Manual,
      newValue: {systemId: newTkvId, moduleTagIdMapSystemId: TAG_MAP_ID},
    });
    const fetcher = makeFetcher(ds);
    const result = await fetcher.fetchTkv(newTkvId, TAG_MAP_ID, sessionId);
    expect(result).not.toBeNull();
    expect(result?.systemId).toBe(newTkvId);
    expect(result?.moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
    expect(result?.values).toEqual([]);
  });
});

describe('TkvOverlayFetcher.fetchModuleTagIdMap', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  it('returns true when the tag map row is in DB', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const result = await makeFetcher(ds).fetchModuleTagIdMap(
      TAG_MAP_ID,
      MODULE_ID,
      null,
    );
    expect(result).toBe(true);
  });

  it('returns false when systemId does not match', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    expect(
      await makeFetcher(ds).fetchModuleTagIdMap(9999, MODULE_ID, null),
    ).toBe(false);
  });

  it('returns false when spfModuleSystemId does not match', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    expect(
      await makeFetcher(ds).fetchModuleTagIdMap(TAG_MAP_ID, 9999, null),
    ).toBe(false);
  });
});
