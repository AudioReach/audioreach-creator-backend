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
} from '@jest/globals';
import type {EntityManager} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';

// ── FK parent fixture IDs ────────────────────────────────────────────────
const FILE_ID = 100;
const SUBGRAPH_ID = 400;
const NODE_A_ID = 200;
const NODE_B_ID = 201;
const PORT_A_ID = 300;
const PORT_B_ID = 301;
const CONTROL_LINK_ID = 500;

async function createFkDependencies(manager: EntityManager): Promise<void> {
  await manager.insert('Project', {
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
    version: 1,
  });
  await manager.insert('ArcDbFile', {
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'f.awsp',
    description: '',
    metadata: '{}',
    isTarget: 0,
    lastReservedId: 0,
    version: 1,
  });
  await manager.insert('Subgraph', {
    systemId: SUBGRAPH_ID,
    subgraphId: 1,
    name: 'sg',
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
  await manager.insert('ControlLink', {
    systemId: CONTROL_LINK_ID,
    fileSystemId: FILE_ID,
    peerNodeASystemId: NODE_A_ID,
    peerNodeBSystemId: NODE_B_ID,
    nodeAPortSystemId: PORT_A_ID,
    nodeBPortSystemId: PORT_B_ID,
    heapId: 0,
    linkType: 'INTRA_SUBGRAPH',
    sourceSubgraphSystemId: SUBGRAPH_ID,
    destSubgraphSystemId: SUBGRAPH_ID,
    version: 1,
  });
}

describe('subsystem_control_links table (spec §11.3)', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
  });

  it('table exists with all spec-required columns', async () => {
    const ds = getTestDataSource();
    const columns: Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }> = await ds.query(`PRAGMA table_info("subsystem_control_links")`);
    const byName = Object.fromEntries(columns.map(c => [c.name, c]));
    expect(byName.system_id).toBeDefined();
    expect(byName.peer_nodeA_system_id.notnull).toBe(1);
    expect(byName.peer_nodeB_system_id.notnull).toBe(1);
    expect(byName.nodeA_port_system_id.notnull).toBe(1);
    expect(byName.nodeB_port_system_id.notnull).toBe(1);
    expect(byName.control_link_system_id.notnull).toBe(1);
    expect(byName.file_system_id.notnull).toBe(1);
    expect(byName.version.notnull).toBe(1);
    expect(byName.version.dflt_value).toBe('1');
    expect(byName.created_at).toBeDefined();
    expect(byName.updated_at).toBeDefined();
  });

  it('all four spec-required indices are present', async () => {
    const ds = getTestDataSource();
    const rows: Array<{name: string}> = await ds.query(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND tbl_name = 'subsystem_control_links'`,
    );
    const names = rows.map(r => r.name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'idx_scl_control_link',
        'idx_scl_file',
        'idx_scl_nodeA_port_file',
        'idx_scl_nodeB_port_file',
      ]),
    );
  });

  it('cascades the SCL row when its ControlLink is deleted', async () => {
    const ds = getTestDataSource();
    await ds.query(`PRAGMA foreign_keys = ON`);
    const manager = ds.manager;
    await createFkDependencies(manager);

    await manager.insert('SubsystemControlLink', {
      systemId: 9001,
      peerNodeASystemId: NODE_A_ID,
      peerNodeBSystemId: NODE_B_ID,
      nodeAPortSystemId: PORT_A_ID,
      nodeBPortSystemId: PORT_B_ID,
      controlLinkSystemId: CONTROL_LINK_ID,
      fileSystemId: FILE_ID,
      version: 1,
    });

    await ds.query(`DELETE FROM control_links WHERE system_id = ?`, [
      CONTROL_LINK_ID,
    ]);
    const remaining = await ds.query(
      `SELECT system_id FROM subsystem_control_links WHERE system_id = 9001`,
    );
    expect(remaining).toHaveLength(0);
  });

  it('RESTRICTs delete of a control_ports row still referenced by a SCL', async () => {
    const ds = getTestDataSource();
    await ds.query(`PRAGMA foreign_keys = ON`);
    const manager = ds.manager;
    await createFkDependencies(manager);

    await manager.insert('SubsystemControlLink', {
      systemId: 9002,
      peerNodeASystemId: NODE_A_ID,
      peerNodeBSystemId: NODE_B_ID,
      nodeAPortSystemId: PORT_A_ID,
      nodeBPortSystemId: PORT_B_ID,
      controlLinkSystemId: CONTROL_LINK_ID,
      fileSystemId: FILE_ID,
      version: 1,
    });

    const deletePort = ds.query(
      `DELETE FROM control_ports WHERE system_id = ?`,
      [PORT_A_ID],
    );
    await expect(deletePort).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });
});
