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
import {ModuleNodeOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/module-node-overlay-fetcher.js';
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

async function seedModule(ds: DataSource, opts: {alias?: string} = {}) {
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
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, ?, ?, ?, ?, ?)`,
    [
      MODULE_ID,
      opts.alias ?? 'base-alias',
      DEF_ID,
      CONTAINER_ID,
      SUBGRAPH_ID,
      FILE_ID,
    ],
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

describe('ModuleNodeOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: ModuleNodeOverlayFetcher;

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
    fetcher = new ModuleNodeOverlayFetcher(
      qr.manager,
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  it('returns null when module not in DB and sessionId is null', async () => {
    expect(await fetcher.fetchOne(MODULE_ID, FILE_ID, null)).toBeNull();
  });

  it('returns base module row when sessionId is null', async () => {
    await seedModule(ds, {alias: 'base-alias'});
    const result = await fetcher.fetchOne(MODULE_ID, FILE_ID, null);
    expect(result).not.toBeNull();
    expect(result!.alias).toBe('base-alias');
    expect(result!.systemId).toBe(MODULE_ID);
  });

  it('applies UPDATE overlay to alias', async () => {
    await seedModule(ds, {alias: 'old'});
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: MODULE_ID,
      targetTable: ENTITY_NAMES.SpfModule,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'alias',
      newValue: '"new"',
    });
    const result = await fetcher.fetchOne(MODULE_ID, FILE_ID, sessionId);
    expect(result!.alias).toBe('new');
  });

  it('returns null when session DELETE tombstones the module', async () => {
    await seedModule(ds);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: MODULE_ID,
      targetSystemId: MODULE_ID,
      targetTable: ENTITY_NAMES.SpfModule,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    expect(await fetcher.fetchOne(MODULE_ID, FILE_ID, sessionId)).toBeNull();
  });

  it('returns base row unchanged for a session with no actions for this module', async () => {
    await seedModule(ds, {alias: 'stable'});
    const sessionId = await seedSession(ds);
    const result = await fetcher.fetchOne(MODULE_ID, FILE_ID, sessionId);
    expect(result!.alias).toBe('stable');
  });
});
