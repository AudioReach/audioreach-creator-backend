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
import {LinkOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/link-overlay-fetcher.js';
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
const SUBGRAPH_ID = 400;
const NODE_A = 201;
const NODE_B = 202;
// Control port IDs must satisfy nodeA_port < nodeB_port CHECK constraint
const CP_A = 301;
const CP_B = 302;
// Data port IDs
const DP_SRC = 303;
const DP_DST = 304;

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

async function seedFkDependencies(ds: DataSource) {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [NODE_A, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [NODE_B, FILE_ID],
  );
  // Data ports (for data link FK)
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, node_system_id) VALUES (?, 1, 'OUTPUT', 1, ?)`,
    [DP_SRC, NODE_A],
  );
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, node_system_id) VALUES (?, 2, 'INPUT', 1, ?)`,
    [DP_DST, NODE_B],
  );
  // Control ports (for control link FK)
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 1, 1, ?)`,
    [CP_A, NODE_A],
  );
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 2, 1, ?)`,
    [CP_B, NODE_B],
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

async function seedDataLink(
  ds: DataSource,
  systemId: number,
  srcPort: number,
  dstPort: number,
) {
  await ds.query(
    `INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, source_subgraph_system_id, dest_subgraph_system_id, file_system_id) VALUES (?, ?, ?, ?, ?, 'INTRA_SUBGRAPH', ?, ?, ?)`,
    [
      systemId,
      NODE_A,
      NODE_B,
      srcPort,
      dstPort,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
      FILE_ID,
    ],
  );
}

async function seedControlLink(
  ds: DataSource,
  systemId: number,
  portA: number,
  portB: number,
) {
  await ds.query(
    `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id, nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type, source_subgraph_system_id, dest_subgraph_system_id) VALUES (?, ?, ?, ?, ?, ?, 0, 'INTRA_SUBGRAPH', ?, ?)`,
    [systemId, FILE_ID, NODE_A, NODE_B, portA, portB, SUBGRAPH_ID, SUBGRAPH_ID],
  );
}

async function seedEditAction(
  ds: DataSource,
  opts: {
    sessionId: number;
    aggregateId?: number;
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
      opts.aggregateId ?? opts.targetSystemId,
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

describe('LinkOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: LinkOverlayFetcher;

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
    await seedFkDependencies(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
    fetcher = new LinkOverlayFetcher(
      qr.manager,
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  describe('fetchDataLinks', () => {
    it('returns base links when sessionId is null', async () => {
      await seedDataLink(ds, 500, DP_SRC, DP_DST);
      const result = await fetcher.loadDataLinkRows(FILE_ID, null, {
        $or: [{sourcePortSystemId: DP_SRC}, {destinationPortSystemId: DP_SRC}],
      });
      expect(result).toHaveLength(1);
      expect(
        result[0].sourcePortSystemId === DP_SRC ||
          result[0].destinationPortSystemId === DP_SRC,
      ).toBe(true);
    });

    it('returns [] when no data links exist for the file', async () => {
      const result = await fetcher.loadDataLinkRows(FILE_ID, null);
      expect(result).toEqual([]);
    });

    it('includes CREATE-staged data links', async () => {
      const sessionId = await seedSession(ds);
      const newLinkSystemId = 999;
      await seedEditAction(ds, {
        sessionId,
        targetSystemId: newLinkSystemId,
        targetTable: ENTITY_NAMES.DataLink,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          sourcePortSystemId: DP_SRC,
          destinationPortSystemId: DP_DST,
          fileSystemId: FILE_ID,
        }),
      });
      const result = await fetcher.loadDataLinkRows(FILE_ID, sessionId, {
        $or: [{sourcePortSystemId: DP_SRC}, {destinationPortSystemId: DP_SRC}],
      });
      expect(result.some(l => l.systemId === newLinkSystemId)).toBe(true);
    });

    it('tombstones DELETE-staged data links', async () => {
      const linkId = 501;
      await seedDataLink(ds, linkId, DP_SRC, DP_DST);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        targetSystemId: linkId,
        targetTable: ENTITY_NAMES.DataLink,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.loadDataLinkRows(FILE_ID, sessionId, {
        $or: [{sourcePortSystemId: DP_SRC}, {destinationPortSystemId: DP_SRC}],
      });
      expect(result.find(l => l.systemId === linkId)).toBeUndefined();
    });

    it('returns base links unchanged for a different session', async () => {
      const linkId = 502;
      await seedDataLink(ds, linkId, DP_SRC, DP_DST);
      const session1 = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId: session1,
        targetSystemId: linkId,
        targetTable: ENTITY_NAMES.DataLink,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      // End session1 before creating session2 (unique constraint on file_system_id WHERE ACTIVE)
      await ds.query(
        `UPDATE project_sessions SET status = 'ENDED' WHERE session_id = ?`,
        [session1],
      );
      const session2 = await seedSession(ds);
      const result = await fetcher.loadDataLinkRows(FILE_ID, session2, {
        $or: [{sourcePortSystemId: DP_SRC}, {destinationPortSystemId: DP_SRC}],
      });
      expect(result.find(l => l.systemId === linkId)).toBeDefined();
    });
  });

  describe('fetchControlLinks', () => {
    it('returns base control links when sessionId is null', async () => {
      await seedControlLink(ds, 600, CP_A, CP_B);
      const result = await fetcher.loadControlLinkRows(FILE_ID, null, {
        $or: [{nodeAPortSystemId: CP_A}, {nodeBPortSystemId: CP_A}],
      });
      expect(result).toHaveLength(1);
    });

    it('includes CREATE-staged control links', async () => {
      const sessionId = await seedSession(ds);
      const newLinkId = 888;
      await seedEditAction(ds, {
        sessionId,
        targetSystemId: newLinkId,
        targetTable: ENTITY_NAMES.ControlLink,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          nodeAPortSystemId: CP_A,
          nodeBPortSystemId: CP_B,
          fileSystemId: FILE_ID,
        }),
      });
      const result = await fetcher.loadControlLinkRows(FILE_ID, sessionId, {
        $or: [{nodeAPortSystemId: CP_A}, {nodeBPortSystemId: CP_A}],
      });
      expect(result.some(l => l.systemId === newLinkId)).toBe(true);
    });

    it('tombstones DELETE-staged control links', async () => {
      const linkId = 601;
      await seedControlLink(ds, linkId, CP_A, CP_B);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        targetSystemId: linkId,
        targetTable: ENTITY_NAMES.ControlLink,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.loadControlLinkRows(FILE_ID, sessionId, {
        $or: [{nodeAPortSystemId: CP_A}, {nodeBPortSystemId: CP_A}],
      });
      expect(result.find(l => l.systemId === linkId)).toBeUndefined();
    });
  });
});
