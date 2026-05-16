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
import type {DataSource, EntityManager} from 'typeorm';
import {UseCase} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {UsecaseInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/usecase/usecase.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const PROJECT_ID = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedFkDependencies(manager: EntityManager): Promise<void> {
  await manager.insert('Project', {
    systemId: PROJECT_ID,
    name: 'Test Project',
    description: '',
    type: 'Offline',
    version: 1,
  });
  await manager.insert('ArcDbFile', {
    systemId: FILE_ID,
    projectSystemId: PROJECT_ID,
    fileName: 'test.awsp',
    description: '',
    metadata: '{}',
    isTarget: 0,
    lastReservedId: 0,
    version: 1,
  });
}

function buildUsecase(
  systemId: number,
  aliasId: number,
  alias: string,
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: FILE_ID,
    keyVector: {valueSystemIds: []},
    aliasId,
    alias,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsecaseInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: UsecaseInserter;

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
    await seedFkDependencies(manager);
    inserter = new UsecaseInserter(manager);
  });

  // ── Test 1: empty input ──────────────────────────────────────────────────

  it('returns ok immediately for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(`SELECT * FROM use_cases`);
    expect(rows).toHaveLength(0);
  });

  // ── Test 2: happy path ───────────────────────────────────────────────────

  it('inserts all rows and returns ok', async () => {
    const usecase = buildUsecase(1001, 1, 'Test Usecase');

    const result = await inserter.insert([usecase]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    const rows = await dataSource.query(
      `SELECT * FROM use_cases WHERE system_id = 1001`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].alias).toBe('Test Usecase');
    expect(rows[0].alias_id).toBe(1);
    expect(rows[0].file_system_id).toBe(FILE_ID);
  });

  // ── Test 3: failure is reported with aggregate natural ID ─────────────────

  it('reports failure grouped under the aggregate natural ID', async () => {
    // Force a failure: insert a row with the same systemId first to cause a UNIQUE conflict
    await manager.insert('UseCase', {
      systemId: 1002,
      aliasId: 2,
      alias: 'Existing',
      fileSystemId: FILE_ID,
      version: 1,
    });

    const usecase = buildUsecase(1002, 2, 'Duplicate');
    const result = await inserter.insert([usecase]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('UseCase');
    expect(result.errors[0].message).toContain('systemId=1002');
  });

  // ── Test 4: failure isolation (sibling entities survive) ─────────────────

  it('good sibling inserts successfully when one entity fails', async () => {
    // First entity: pre-seed a conflict so it fails
    await manager.insert('UseCase', {
      systemId: 1003,
      aliasId: 3,
      alias: 'Existing',
      fileSystemId: FILE_ID,
      version: 1,
    });
    const bad = buildUsecase(1003, 3, 'Bad');

    const good = buildUsecase(1004, 4, 'Good');

    const result = await inserter.insert([bad, good]);

    expect(result.ok).toBe(false);

    const goodRows = await dataSource.query(
      `SELECT * FROM use_cases WHERE system_id = 1004`,
    );
    expect(goodRows).toHaveLength(1); // good entity was inserted
    expect(goodRows[0].alias).toBe('Good');
  });

  // ── Test 5: join-table insertion with non-empty relations ────────────────

  it('inserts usecase with join-table relations', async () => {
    // Seed the FK dependencies for nodes, dataLinks, controlLinks, and values
    // Insert nodes (modules)
    for (const nodeId of [101, 102, 103]) {
      await manager.insert('Node', {
        systemId: nodeId,
        type: 'module',
        fileSystemId: FILE_ID,
        aliasId: nodeId,
        alias: `Node${nodeId}`,
        moduleSystemId: nodeId,
        version: 1,
      });
    }

    // Insert data ports for the nodes
    await manager.insert('DataPort', {
      systemId: 1001,
      dataPortId: 1,
      portIoType: 'Output',
      isStatic: 1,
      nodeSystemId: 101,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 1002,
      dataPortId: 2,
      portIoType: 'Input',
      isStatic: 1,
      nodeSystemId: 102,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 1003,
      dataPortId: 3,
      portIoType: 'Output',
      isStatic: 1,
      nodeSystemId: 102,
      version: 1,
    });
    await manager.insert('DataPort', {
      systemId: 1004,
      dataPortId: 4,
      portIoType: 'Input',
      isStatic: 1,
      nodeSystemId: 103,
      version: 1,
    });

    // Insert data links
    await manager.insert('DataLink', {
      systemId: 201,
      sourceNodeSystemId: 101,
      destinationNodeSystemId: 102,
      sourcePortSystemId: 1001,
      destinationPortSystemId: 1002,
      isInterGraph: 0,
      fileSystemId: FILE_ID,
      aliasId: 201,
      alias: 'DataLink201',
      version: 1,
    });
    await manager.insert('DataLink', {
      systemId: 202,
      sourceNodeSystemId: 102,
      destinationNodeSystemId: 103,
      sourcePortSystemId: 1003,
      destinationPortSystemId: 1004,
      isInterGraph: 0,
      fileSystemId: FILE_ID,
      aliasId: 202,
      alias: 'DataLink202',
      version: 1,
    });

    // Insert control ports for control links
    await manager.insert('ControlPort', {
      systemId: 4001,
      portId: 1,
      isStatic: 1,
      nodeSystemId: 101,
      version: 1,
    });
    await manager.insert('ControlPort', {
      systemId: 4002,
      portId: 2,
      isStatic: 1,
      nodeSystemId: 102,
      version: 1,
    });

    // Insert control links
    await manager.insert('ControlLink', {
      systemId: 301,
      peerNodeASystemId: 101,
      peerNodeBSystemId: 102,
      nodeAPortSystemId: 4001,
      nodeBPortSystemId: 4002,
      heapId: 0,
      isInterGraph: 0,
      fileSystemId: FILE_ID,
      aliasId: 301,
      alias: 'ControlLink301',
      version: 1,
    });

    // Insert key definition for values
    await manager.insert('KeyDefinition', {
      systemId: 5001,
      fileSystemId: FILE_ID,
      keyId: 1,
      name: 'TestKey',
      version: 1,
    });

    // Insert value definitions
    for (const [systemId, valueId] of [
      [401, 1],
      [402, 2],
    ]) {
      await manager.insert('ValueDefinition', {
        systemId,
        keySystemId: 5001,
        valueId,
        name: `Value${systemId}`,
        fileSystemId: FILE_ID,
        aliasId: systemId,
        alias: `Value${systemId}`,
        version: 1,
      });
    }

    // Create a usecase with non-empty relation arrays
    const usecaseData = {
      systemId: 2001,
      fileSystemId: FILE_ID,
      keyVector: {valueSystemIds: [401, 402]},
      aliasId: 2,
      alias: 'Usecase with Relations',
    };
    const usecase = new UseCase(usecaseData);

    // Manually set the arrays since they're readonly
    Object.assign(usecase, {
      moduleSystemIds: [101, 102, 103],
      dataLinkSystemIds: [201, 202],
      controlLinkSystemIds: [301],
    });

    const result = await inserter.insert([usecase]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    // Verify join-table rows were inserted
    const nodesCount = await dataSource.query(
      'SELECT COUNT(*) as count FROM use_case_nodes WHERE use_case_system_id = ?',
      [2001],
    );
    expect(nodesCount[0].count).toBe(3);

    const dataLinksCount = await dataSource.query(
      'SELECT COUNT(*) as count FROM use_case_data_links WHERE use_case_system_id = ?',
      [2001],
    );
    expect(dataLinksCount[0].count).toBe(2);

    const controlLinksCount = await dataSource.query(
      'SELECT COUNT(*) as count FROM use_case_control_links WHERE use_case_system_id = ?',
      [2001],
    );
    expect(controlLinksCount[0].count).toBe(1);

    const gkvCount = await dataSource.query(
      'SELECT COUNT(*) as count FROM usecase_gkv_values WHERE usecase_system_id = ?',
      [2001],
    );
    expect(gkvCount[0].count).toBe(2);
  });
});
