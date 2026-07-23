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
import {PortOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/port-overlay-fetcher.js';
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

async function seedNode(ds: DataSource) {
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [MODULE_ID, FILE_ID],
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

async function seedDataPort(
  ds: DataSource,
  opts: {portIoType: string; isStatic?: boolean; name?: string},
): Promise<number> {
  const rows: any[] = await ds.query(
    `INSERT INTO data_ports (data_port_id, port_io_type, is_static, name, node_system_id) VALUES (1, ?, ?, ?, ?) RETURNING system_id`,
    [opts.portIoType, opts.isStatic ? 1 : 0, opts.name ?? null, MODULE_ID],
  );
  if (rows.length > 0 && rows[0].system_id !== undefined)
    return rows[0].system_id as number;
  // Fallback: get last inserted id
  const lastId: any[] = await ds.query(`SELECT last_insert_rowid() AS id`);
  return lastId[0].id as number;
}

async function seedControlPort(
  ds: DataSource,
  opts: {portId: number; isStatic?: boolean},
): Promise<number> {
  const rows: any[] = await ds.query(
    `INSERT INTO control_ports (port_id, is_static, node_system_id) VALUES (?, ?, ?) RETURNING system_id`,
    [opts.portId, opts.isStatic ? 1 : 0, MODULE_ID],
  );
  if (rows.length > 0 && rows[0].system_id !== undefined)
    return rows[0].system_id as number;
  const lastId: any[] = await ds.query(`SELECT last_insert_rowid() AS id`);
  return lastId[0].id as number;
}

async function seedIntent(
  ds: DataSource,
  opts: {controlPortSystemId: number},
): Promise<number> {
  const rows: any[] = await ds.query(
    `INSERT INTO intents (intent_id, control_port_system_id) VALUES (1, ?) RETURNING system_id`,
    [opts.controlPortSystemId],
  );
  if (rows.length > 0 && rows[0].system_id !== undefined)
    return rows[0].system_id as number;
  const lastId: any[] = await ds.query(`SELECT last_insert_rowid() AS id`);
  return lastId[0].id as number;
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

describe('PortOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: PortOverlayFetcher;

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
    await seedNode(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
    fetcher = new PortOverlayFetcher(
      qr.manager,
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  describe('fetchDataPorts', () => {
    it('returns base data ports when sessionId is null', async () => {
      await seedDataPort(ds, {
        portIoType: 'INPUT',
        isStatic: false,
        name: 'p1',
      });
      const result = await fetcher.fetchDataPorts(MODULE_ID, FILE_ID, null);
      expect(result).toHaveLength(1);
      expect(result[0].portIoType).toBe('INPUT');
    });

    it('includes CREATE-staged data port', async () => {
      const sessionId = await seedSession(ds);
      const portSystemId = 999;
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: portSystemId,
        targetTable: ENTITY_NAMES.DataPort,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          dataPortId: 1,
          portIoType: 'OUTPUT',
          isStatic: false,
          name: 'staged',
          nodeSystemId: MODULE_ID,
          fileSystemId: FILE_ID,
        }),
      });
      const result = await fetcher.fetchDataPorts(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      const found = result.find(p => p.systemId === portSystemId);
      expect(found).toBeDefined();
      expect(found!.portIoType).toBe('OUTPUT');
    });

    it('tombstones DELETE-staged data port', async () => {
      const portId = await seedDataPort(ds, {
        portIoType: 'INPUT',
        isStatic: false,
      });
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: portId,
        targetTable: ENTITY_NAMES.DataPort,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.fetchDataPorts(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      expect(result.find(p => p.systemId === portId)).toBeUndefined();
    });

    it('applies UPDATE overlay to data port field', async () => {
      const portId = await seedDataPort(ds, {
        portIoType: 'INPUT',
        isStatic: false,
        name: 'old',
      });
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: portId,
        targetTable: ENTITY_NAMES.DataPort,
        operation: CHANGE_OPERATION.Update,
        fieldPath: 'name',
        newValue: '"new"',
      });
      const result = await fetcher.fetchDataPorts(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      expect(result.find(p => p.systemId === portId)?.name).toBe('new');
    });
  });

  describe('fetchControlPortsWithIntents', () => {
    it('returns base control ports with their intents when sessionId is null', async () => {
      const cpId = await seedControlPort(ds, {portId: 1, isStatic: false});
      await seedIntent(ds, {controlPortSystemId: cpId});
      const result = await fetcher.fetchControlPortsWithIntents(
        MODULE_ID,
        FILE_ID,
        null,
      );
      expect(result).toHaveLength(1);
      expect(result[0].intents).toHaveLength(1);
    });

    it('includes CREATE-staged control port (with no intents yet)', async () => {
      const sessionId = await seedSession(ds);
      const cpId = 777;
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: cpId,
        targetTable: ENTITY_NAMES.ControlPort,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          portId: 2,
          isStatic: false,
          name: 'cp',
          nodeSystemId: MODULE_ID,
          fileSystemId: FILE_ID,
        }),
      });
      const result = await fetcher.fetchControlPortsWithIntents(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      const found = result.find(cp => cp.systemId === cpId);
      expect(found).toBeDefined();
      expect(found!.intents).toHaveLength(0);
    });

    it('tombstones DELETE-staged control port', async () => {
      const cpId = await seedControlPort(ds, {portId: 1, isStatic: false});
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: cpId,
        targetTable: ENTITY_NAMES.ControlPort,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.fetchControlPortsWithIntents(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      expect(result.find(cp => cp.systemId === cpId)).toBeUndefined();
    });

    it('includes CREATE-staged intent for existing control port', async () => {
      const cpId = await seedControlPort(ds, {portId: 1, isStatic: false});
      const sessionId = await seedSession(ds);
      const intentId = 555;
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: intentId,
        targetTable: ENTITY_NAMES.Intent,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          controlPortSystemId: cpId,
          intentId: 3,
          fileSystemId: FILE_ID,
        }),
      });
      const result = await fetcher.fetchControlPortsWithIntents(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      const cp = result.find(c => c.systemId === cpId);
      expect(cp?.intents.find(i => i.systemId === intentId)).toBeDefined();
    });

    it('tombstones DELETE-staged intent', async () => {
      const cpId = await seedControlPort(ds, {portId: 1, isStatic: false});
      const intentId = await seedIntent(ds, {controlPortSystemId: cpId});
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: intentId,
        targetTable: ENTITY_NAMES.Intent,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.fetchControlPortsWithIntents(
        MODULE_ID,
        FILE_ID,
        sessionId,
      );
      const cp = result.find(c => c.systemId === cpId);
      expect(cp?.intents.find(i => i.systemId === intentId)).toBeUndefined();
    });
  });
});
