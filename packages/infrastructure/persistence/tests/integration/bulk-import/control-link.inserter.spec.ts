/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {ControlLink, SubsystemControlLink, LINK_TYPE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {ControlLinkInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/control-link/control-link.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const SUBGRAPH_ID = 400;
const NODE_A_ID = 200;
const NODE_B_ID = 201;
const PORT_A_ID = 300;
const PORT_B_ID = 301;

// Subsystem node and its boundary control ports (used in SCL tests)
const SUBSYSTEM_NODE_ID = 210;
const SCL_PORT_A_ID = 310;
const SCL_PORT_B_ID = 311;

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

  await manager.insert('Subgraph', {
    systemId: SUBGRAPH_ID,
    subgraphId: 1,
    name: 'test-subgraph',
    isExported: 0,
    fileSystemId: FILE_ID,
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
  await manager.insert('Node', {
    systemId: SUBSYSTEM_NODE_ID,
    type: 'subsystem',
    fileSystemId: FILE_ID,
    version: 1,
  });

  await manager.insert('ControlPort', {
    systemId: PORT_A_ID,
    portId: 1,
    isStatic: 1,
    nodeSystemId: NODE_A_ID,
    version: 1,
  });
  await manager.insert('ControlPort', {
    systemId: PORT_B_ID,
    portId: 2,
    isStatic: 1,
    nodeSystemId: NODE_B_ID,
    version: 1,
  });
  await manager.insert('ControlPort', {
    systemId: SCL_PORT_A_ID,
    portId: 1,
    isStatic: 0,
    nodeSystemId: SUBSYSTEM_NODE_ID,
    version: 1,
  });
  await manager.insert('ControlPort', {
    systemId: SCL_PORT_B_ID,
    portId: 2,
    isStatic: 0,
    nodeSystemId: SUBSYSTEM_NODE_ID,
    version: 1,
  });
}

function buildControlLink(
  systemId: number,
  portASystemId = PORT_A_ID,
  portBSystemId = PORT_B_ID,
  subsystemControlLinks: SubsystemControlLink[] = [],
): ControlLink {
  return new ControlLink(
    systemId,
    FILE_ID,
    NODE_A_ID,
    NODE_B_ID,
    portASystemId,
    portBSystemId,
    0,
    LINK_TYPE.IntraSubgraph,
    SUBGRAPH_ID,
    SUBGRAPH_ID,
    subsystemControlLinks,
  );
}

function buildScl(
  systemId: number,
  peerNodeASystemId: number,
  peerNodeBSystemId: number,
  nodeAPortSystemId: number,
  nodeBPortSystemId: number,
  controlLinkSystemId: number,
): SubsystemControlLink {
  return new SubsystemControlLink(
    systemId,
    peerNodeASystemId,
    peerNodeBSystemId,
    nodeAPortSystemId,
    nodeBPortSystemId,
    controlLinkSystemId,
    FILE_ID,
    1,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ControlLinkInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: ControlLinkInserter;

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
    inserter = new ControlLinkInserter(manager);
  });

  it('returns okBulkInsert for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
  });

  it('inserts a single control link row', async () => {
    const result = await inserter.insert([buildControlLink(1000)]);

    expect(result.ok).toBe(true);

    const rows = await dataSource.query(
      `SELECT * FROM control_links WHERE system_id = 1000`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].peer_nodeA_system_id).toBe(NODE_A_ID);
    expect(rows[0].peer_nodeB_system_id).toBe(NODE_B_ID);
    expect(rows[0].nodeA_port_system_id).toBe(PORT_A_ID);
    expect(rows[0].nodeB_port_system_id).toBe(PORT_B_ID);
    expect(rows[0].file_system_id).toBe(FILE_ID);
    expect(rows[0].heap_id).toBe(0);
    expect(rows[0].link_type).toBe('INTRA_SUBGRAPH');
  });

  it('inserts multiple control links', async () => {
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
    await manager.insert('ControlPort', {
      systemId: 302,
      portId: 3,
      isStatic: 1,
      nodeSystemId: 202,
      version: 1,
    });
    await manager.insert('ControlPort', {
      systemId: 303,
      portId: 4,
      isStatic: 1,
      nodeSystemId: 203,
      version: 1,
    });

    const link1 = new ControlLink(
      1001,
      FILE_ID,
      NODE_A_ID,
      NODE_B_ID,
      PORT_A_ID,
      PORT_B_ID,
      0,
      LINK_TYPE.IntraSubgraph,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
    );
    const link2 = new ControlLink(
      1002,
      FILE_ID,
      202,
      203,
      302,
      303,
      5,
      LINK_TYPE.IntraUsecase,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
    );

    const result = await inserter.insert([link1, link2]);

    expect(result.ok).toBe(true);

    const rows = await dataSource.query(
      `SELECT system_id, heap_id, link_type FROM control_links ORDER BY system_id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].system_id).toBe(1001);
    expect(rows[0].heap_id).toBe(0);
    expect(rows[1].system_id).toBe(1002);
    expect(rows[1].heap_id).toBe(5);
    expect(rows[1].link_type).toBe('INTRA_USECASE');
  });

  it('reports failure when node A port FK does not exist', async () => {
    const link = buildControlLink(1003, 9999, PORT_B_ID);

    const result = await inserter.insert([link]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);

    const rows = await dataSource.query(
      `SELECT * FROM control_links WHERE system_id = 1003`,
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
    await manager.insert('ControlPort', {
      systemId: 304,
      portId: 5,
      isStatic: 1,
      nodeSystemId: 204,
      version: 1,
    });
    await manager.insert('ControlPort', {
      systemId: 305,
      portId: 6,
      isStatic: 1,
      nodeSystemId: 205,
      version: 1,
    });

    const good = new ControlLink(
      1004,
      FILE_ID,
      204,
      205,
      304,
      305,
      0,
      LINK_TYPE.IntraSubgraph,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
    );
    const bad = buildControlLink(1005, 9999, PORT_B_ID);

    const result = await inserter.insert([good, bad]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);

    const goodRow = await dataSource.query(
      `SELECT * FROM control_links WHERE system_id = 1004`,
    );
    expect(goodRow).toHaveLength(1);

    const badRow = await dataSource.query(
      `SELECT * FROM control_links WHERE system_id = 1005`,
    );
    expect(badRow).toHaveLength(0);
  });

  it('inserts SubsystemControlLink children when parent ControlLink succeeds', async () => {
    // Chain: M1(NODE_A) ↔ S(SUBSYSTEM) ↔ M2(NODE_B)
    const link = buildControlLink(1006, PORT_A_ID, PORT_B_ID, [
      buildScl(
        2001,
        NODE_A_ID,
        SUBSYSTEM_NODE_ID,
        PORT_A_ID,
        SCL_PORT_A_ID,
        1006,
      ),
      buildScl(
        2002,
        SUBSYSTEM_NODE_ID,
        NODE_B_ID,
        SCL_PORT_B_ID,
        PORT_B_ID,
        1006,
      ),
    ]);

    const result = await inserter.insert([link]);

    expect(result.ok).toBe(true);

    const sclRows = await dataSource.query(
      `SELECT system_id, control_link_system_id FROM subsystem_control_links ORDER BY system_id`,
    );
    expect(sclRows).toHaveLength(2);
    expect(sclRows[0].system_id).toBe(2001);
    expect(sclRows[0].control_link_system_id).toBe(1006);
    expect(sclRows[1].system_id).toBe(2002);
    expect(sclRows[1].control_link_system_id).toBe(1006);
  });

  it('skips SubsystemControlLink children when parent ControlLink fails', async () => {
    const link = buildControlLink(1007, 9999, PORT_B_ID, [
      buildScl(
        2003,
        NODE_A_ID,
        SUBSYSTEM_NODE_ID,
        PORT_A_ID,
        SCL_PORT_A_ID,
        1007,
      ),
    ]);

    const result = await inserter.insert([link]);

    expect(result.ok).toBe(false);

    const sclRows = await dataSource.query(
      `SELECT * FROM subsystem_control_links WHERE system_id = 2003`,
    );
    expect(sclRows).toHaveLength(0);
  });
});
