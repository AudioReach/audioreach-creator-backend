/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import type {IdGenerationPort} from '@arc/core';
import {Subgraph, Sgkv} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {SubgraphInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/subgraph/subgraph.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const SUBGRAPH_SYS_ID = 10;
const SUBGRAPH_NATURAL_ID = 1;
// Helper subgraph pre-seeded directly for tests that need an SGKV FK anchor
const HELPER_SUBGRAPH_SYS_ID = 9001;
const KEY_DEF_ID = 40;
const VALUE_DEF_ID_1 = 201;
const VALUE_DEF_ID_2 = 202;
const VALUE_DEF_ID_3 = 203;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedFkDependencies(manager: EntityManager): Promise<void> {
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

  await manager.insert('KeyDefinition', {
    systemId: KEY_DEF_ID,
    fileSystemId: FILE_ID,
    keyId: 1,
    name: 'TestKey',
    version: 1,
  });

  for (const [systemId, valueId, valueName] of [
    [VALUE_DEF_ID_1, 1, 'v1'],
    [VALUE_DEF_ID_2, 2, 'v2'],
    [VALUE_DEF_ID_3, 3, 'v3'],
  ] as const) {
    await manager.insert('ValueDefinition', {
      systemId,
      keySystemId: KEY_DEF_ID,
      valueId,
      name: valueName,
      version: 1,
    });
  }
}

async function seedHelperSubgraph(manager: EntityManager): Promise<void> {
  await manager.insert('Subgraph', {
    systemId: HELPER_SUBGRAPH_SYS_ID,
    fileSystemId: FILE_ID,
    name: 'HelperSubgraph',
    subgraphId: 99,
    isImported: 0,
    version: 1,
  });
}

function buildSubgraph(sgkvs: {id: number; values: number[]}[]): Subgraph {
  return new Subgraph({
    systemId: SUBGRAPH_SYS_ID,
    subgraphId: SUBGRAPH_NATURAL_ID,
    name: 'TestSubgraph',
    isExported: false,
    fileSystemId: FILE_ID,
    sgkvs: sgkvs.map(
      ({id, values}) =>
        new Sgkv({systemId: id, valueDefinitionSystemIds: values}),
    ),
  });
}

function makeIdGenerator(): IdGenerationPort {
  let counter = 9000;
  return {
    getNextId: async () => ++counter,
    reserveBlock: async () => counter,
    persistLastUsedId: async () => undefined,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubgraphInserter — SGKV insertion', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: SubgraphInserter;

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
    inserter = new SubgraphInserter(manager, makeIdGenerator());
  });

  // ── Test 1: empty input ──────────────────────────────────────────────────

  it('returns ok immediately for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(`SELECT * FROM sgkv`);
    expect(rows).toHaveLength(0);
  });

  // ── Test 2: happy path ───────────────────────────────────────────────────

  it('inserts sgkv and sgkv_values rows for two SGKVs', async () => {
    const subgraph = buildSubgraph([
      {id: 1001, values: [VALUE_DEF_ID_1, VALUE_DEF_ID_2]},
      {id: 1002, values: [VALUE_DEF_ID_2, VALUE_DEF_ID_3]},
    ]);

    const result = await inserter.insert([subgraph]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got errors:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n---\n')}`,
      );
    }

    const sgkvRows = await dataSource.query(
      `SELECT * FROM sgkv WHERE subgraph_system_id = ${SUBGRAPH_SYS_ID} ORDER BY system_id`,
    );
    expect(sgkvRows).toHaveLength(2);

    const valuesFor1001 = await dataSource.query(
      `SELECT * FROM sgkv_values WHERE sgkv_system_id = 1001 ORDER BY value_def_system_id`,
    );
    expect(valuesFor1001).toHaveLength(2);
    expect(
      valuesFor1001.map(
        (r: {value_def_system_id: number}) => r.value_def_system_id,
      ),
    ).toEqual([VALUE_DEF_ID_1, VALUE_DEF_ID_2]);

    const valuesFor1002 = await dataSource.query(
      `SELECT * FROM sgkv_values WHERE sgkv_system_id = 1002 ORDER BY value_def_system_id`,
    );
    expect(valuesFor1002).toHaveLength(2);
    expect(
      valuesFor1002.map(
        (r: {value_def_system_id: number}) => r.value_def_system_id,
      ),
    ).toEqual([VALUE_DEF_ID_2, VALUE_DEF_ID_3]);
  });

  // ── Test 3: failure reported under subgraph natural ID ───────────────────

  it('reports failure grouped under the subgraph natural ID', async () => {
    await seedHelperSubgraph(manager);
    await manager.insert('Sgkv', {
      systemId: 2001,
      subgraphSystemId: HELPER_SUBGRAPH_SYS_ID,
      version: 1,
    });

    const subgraph = buildSubgraph([{id: 2001, values: [VALUE_DEF_ID_1]}]);

    const result = await inserter.insert([subgraph]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain(
      `subgraphId=${SUBGRAPH_NATURAL_ID}`,
    );
  });

  // ── Test 4: sibling isolation (values-level FK failure) ──────────────────

  it('rolls back bad SGKV and its values when value FK does not exist; good sibling survives', async () => {
    const NON_EXISTENT_VALUE_ID = 9999;
    const subgraph = buildSubgraph([
      {id: 3001, values: [VALUE_DEF_ID_1]},
      {id: 3002, values: [NON_EXISTENT_VALUE_ID]},
    ]);

    const result = await inserter.insert([subgraph]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);

    const goodSgkv = await dataSource.query(
      `SELECT * FROM sgkv WHERE system_id = 3001`,
    );
    expect(goodSgkv).toHaveLength(1);

    const goodValues = await dataSource.query(
      `SELECT * FROM sgkv_values WHERE sgkv_system_id = 3001`,
    );
    expect(goodValues).toHaveLength(1);

    const badSgkv = await dataSource.query(
      `SELECT * FROM sgkv WHERE system_id = 3002`,
    );
    expect(badSgkv).toHaveLength(0);

    const badValues = await dataSource.query(
      `SELECT * FROM sgkv_values WHERE sgkv_system_id = 3002`,
    );
    expect(badValues).toHaveLength(0);
  });

  // ── Test 5: sgkv_values skipped when parent sgkv row fails ───────────────

  it('skips sgkv_values rows when the parent sgkv insert fails', async () => {
    await seedHelperSubgraph(manager);
    await manager.insert('Sgkv', {
      systemId: 4001,
      subgraphSystemId: HELPER_SUBGRAPH_SYS_ID,
      version: 1,
    });

    const subgraph = buildSubgraph([
      {id: 4001, values: [VALUE_DEF_ID_1, VALUE_DEF_ID_2]},
    ]);

    await inserter.insert([subgraph]);

    const valueRows = await dataSource.query(
      `SELECT * FROM sgkv_values WHERE sgkv_system_id = 4001`,
    );
    expect(valueRows).toHaveLength(0);
  });
});
