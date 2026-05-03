/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {DataLink} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {DataLinkInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/data-link/data-link.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const NODE_A_ID = 200;
const NODE_B_ID = 201;
const SRC_PORT_ID = 300;
const DST_PORT_ID = 301;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createFkDependencies(manager: EntityManager): Promise<void> {
  await manager.insert('Project', {
    systemId: 1,
    name: 'Test Project',
    description: 'Test',
    type: 'Offline',
    version: 1,
  });

  await manager.insert('ArcDbFile', {
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'test.awsp',
    description: '',
    metadata: '{}',
    isTarget: 0,
    lastReservedId: 0,
    version: 1,
  });

  await manager.insert('Node', {
    systemId: NODE_A_ID,
    type: 'module',
    fileSystemId: FILE_ID,
    version: 1,
  });

  await manager.insert('Node', {
    systemId: NODE_B_ID,
    type: 'module',
    fileSystemId: FILE_ID,
    version: 1,
  });

  await manager.insert('DataPort', {
    systemId: SRC_PORT_ID,
    dataPortId: 1,
    portIoType: 'Output',
    isStatic: 1,
    nodeSystemId: NODE_A_ID,
    version: 1,
  });

  await manager.insert('DataPort', {
    systemId: DST_PORT_ID,
    dataPortId: 2,
    portIoType: 'Input',
    isStatic: 1,
    nodeSystemId: NODE_B_ID,
    version: 1,
  });
}

function buildDataLink(
  systemId: number,
  srcPortSystemId = SRC_PORT_ID,
  dstPortSystemId = DST_PORT_ID,
): DataLink {
  return new DataLink(
    systemId,
    NODE_A_ID,
    NODE_B_ID,
    srcPortSystemId,
    dstPortSystemId,
    false,
    FILE_ID,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DataLinkInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: DataLinkInserter;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    manager = dataSource.manager;
    await createFkDependencies(manager);
    inserter = new DataLinkInserter(manager);
  });

  it('returns okBulkInsert for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
  });

  it('inserts a single data link row', async () => {
    const result = await inserter.insert([buildDataLink(1000)]);

    expect(result.ok).toBe(true);

    const rows = await dataSource.query(
      `SELECT * FROM data_links WHERE system_id = 1000`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source_node_system_id).toBe(NODE_A_ID);
    expect(rows[0].destination_node_system_id).toBe(NODE_B_ID);
    expect(rows[0].source_port_system_id).toBe(SRC_PORT_ID);
    expect(rows[0].destination_port_system_id).toBe(DST_PORT_ID);
    expect(rows[0].file_system_id).toBe(FILE_ID);
    expect(rows[0].is_inter_graph).toBe(0);
  });

  it('inserts multiple data links', async () => {
    // Need extra nodes and ports for a second link
    await manager.insert('Node', {
      systemId: 202,
      type: 'module',
      fileSystemId: FILE_ID,
      version: 1,
    });
    await manager.insert('Node', {
      systemId: 203,
      type: 'module',
      fileSystemId: FILE_ID,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 302,
      dataPortId: 3,
      portIoType: 'Output',
      isStatic: 1,
      nodeSystemId: 202,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 303,
      dataPortId: 4,
      portIoType: 'Input',
      isStatic: 1,
      nodeSystemId: 203,
      version: 1,
    });

    const link1 = new DataLink(
      1001,
      NODE_A_ID,
      NODE_B_ID,
      SRC_PORT_ID,
      DST_PORT_ID,
      false,
      FILE_ID,
    );
    const link2 = new DataLink(1002, 202, 203, 302, 303, true, FILE_ID);

    const result = await inserter.insert([link1, link2]);

    expect(result.ok).toBe(true);

    const rows = await dataSource.query(
      `SELECT system_id, is_inter_graph FROM data_links ORDER BY system_id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].system_id).toBe(1001);
    expect(rows[0].is_inter_graph).toBe(0);
    expect(rows[1].system_id).toBe(1002);
    expect(rows[1].is_inter_graph).toBe(1);
  });

  it('reports failure when source port FK does not exist', async () => {
    const link = buildDataLink(1003, 9999, DST_PORT_ID);

    const result = await inserter.insert([link]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);

    const rows = await dataSource.query(
      `SELECT * FROM data_links WHERE system_id = 1003`,
    );
    expect(rows).toHaveLength(0);
  });

  it('isolates failure — valid link inserted when sibling fails', async () => {
    await manager.insert('Node', {
      systemId: 204,
      type: 'module',
      fileSystemId: FILE_ID,
      version: 1,
    });
    await manager.insert('Node', {
      systemId: 205,
      type: 'module',
      fileSystemId: FILE_ID,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 304,
      dataPortId: 5,
      portIoType: 'Output',
      isStatic: 1,
      nodeSystemId: 204,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 305,
      dataPortId: 6,
      portIoType: 'Input',
      isStatic: 1,
      nodeSystemId: 205,
      version: 1,
    });

    const good = new DataLink(1004, 204, 205, 304, 305, false, FILE_ID);
    const bad = buildDataLink(1005, 9999, DST_PORT_ID);

    const result = await inserter.insert([good, bad]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);

    const goodRow = await dataSource.query(
      `SELECT * FROM data_links WHERE system_id = 1004`,
    );
    expect(goodRow).toHaveLength(1);

    const badRow = await dataSource.query(
      `SELECT * FROM data_links WHERE system_id = 1005`,
    );
    expect(badRow).toHaveLength(0);
  });
});
