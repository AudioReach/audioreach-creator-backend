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
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';

describe('control_links schema — canonical ordering (spec §11.1)', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
  });

  it('uk_control_link_unique is defined on (nodeA_port_system_id, nodeB_port_system_id)', async () => {
    const ds = getTestDataSource();
    const rows: Array<{name: string; sql: string}> = await ds.query(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'index' AND name = 'uk_control_link_unique'`,
    );
    expect(rows).toHaveLength(1);
    const sql = rows[0].sql.toLowerCase();
    expect(sql).toContain('"nodea_port_system_id"');
    expect(sql).toContain('"nodeb_port_system_id"');
    expect(sql).not.toContain('"peer_nodea_system_id"');
    expect(sql).not.toContain('"peer_nodeb_system_id"');
  });

  it('control_links table has CHECK (nodeA_port_system_id < nodeB_port_system_id)', async () => {
    const ds = getTestDataSource();
    const rows: Array<{sql: string}> = await ds.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'control_links'`,
    );
    expect(rows).toHaveLength(1);
    const sql = rows[0].sql.toLowerCase().replaceAll(/\s+/g, ' ');
    expect(sql).toMatch(
      /check\s*\(\s*"nodea_port_system_id"\s*<\s*"nodeb_port_system_id"\s*\)/,
    );
  });

  it('rejects rows that violate canonical ordering (nodeA_port_system_id >= nodeB_port_system_id)', async () => {
    const ds = getTestDataSource();
    // Disable FK enforcement so raw inserts can exercise CHECK/UNIQUE without parent rows.
    await ds.query('PRAGMA foreign_keys = OFF');
    try {
      // Try to insert a control_link with reversed port ordering: 200 >= 100
      const insert = ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (9001, 1, 10, 20, 200, 100, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );
      await expect(insert).rejects.toThrow(/CHECK constraint failed/i);
    } finally {
      await ds.query('PRAGMA foreign_keys = ON');
    }
  });

  it('rejects a second row with the same port pair (uniqueness on canonical ports)', async () => {
    const ds = getTestDataSource();
    // Disable FK enforcement so raw inserts can exercise CHECK/UNIQUE without parent rows.
    await ds.query('PRAGMA foreign_keys = OFF');
    try {
      await ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (9002, 1, 10, 20, 100, 200, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );
      const dupe = ds.query(
        `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
                                    nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
                                    source_subgraph_system_id, dest_subgraph_system_id)
         VALUES (9003, 1, 11, 21, 100, 200, 0, 'INTRA_SUBGRAPH', 1, 1)`,
      );
      await expect(dupe).rejects.toThrow(
        /UNIQUE constraint failed|uk_control_link_unique/i,
      );
    } finally {
      await ds.query('PRAGMA foreign_keys = ON');
    }
  });
});
