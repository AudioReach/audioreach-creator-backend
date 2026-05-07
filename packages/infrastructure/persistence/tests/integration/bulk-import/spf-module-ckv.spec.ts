/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import type {IdGenerationPort} from '@arc/core';
import {SpfModule, KvData} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {SpfModuleInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/spf-module/spf-module.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const SUBGRAPH_ID = 10;
const CONTAINER_ID = 20;
const DEFINITION_ID = 30;
const KEY_DEF_ID = 40;
const VALUE_DEF_ID_1 = 201;
const VALUE_DEF_ID_2 = 202;
const VALUE_DEF_ID_3 = 203;

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
    fileSystemId: FILE_ID,
    name: 'TestSubgraph',
    subgraphId: 1,
    isExported: 0,
    version: 1,
  });

  await manager.insert('Container', {
    systemId: CONTAINER_ID,
    fileSystemId: FILE_ID,
    type: 'APM',
    containerId: 1,
    version: 1,
  });

  await manager.insert('SpfModuleDefinition', {
    systemId: DEFINITION_ID,
    fileSystemId: FILE_ID,
    moduleDefinitionId: 1,
    name: 'TestModuleDefinition',
    version: 1,
  });

  await manager.insert('KeyDefinition', {
    systemId: KEY_DEF_ID,
    fileSystemId: FILE_ID,
    keyId: 1,
    keyName: 'TestKey',
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
      valueName,
      version: 1,
    });
  }
}

function buildModule(
  moduleSystemId: number,
  ckvs: {id: number; values: number[]}[],
): SpfModule {
  const module = new SpfModule({
    systemId: moduleSystemId,
    instanceId: moduleSystemId * 10,
    definitionSystemId: DEFINITION_ID,
    containerSystemId: CONTAINER_ID,
    subgraphSystemId: SUBGRAPH_ID,
    fileSystemId: FILE_ID,
    dataPorts: [],
    controlPorts: [],
  });

  for (const {id, values} of ckvs) {
    module.addModuleCkv(
      new KvData({
        systemId: id,
        valueDefinitionSystemIds: values,
        uiPersistence: null,
      }),
    );
  }
  return module;
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

describe('SpfModuleInserter — CKV insertion', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: SpfModuleInserter;

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
    inserter = new SpfModuleInserter(manager, makeIdGenerator());
  });

  it('inserts ckv and ckv_values rows for a single CKV', async () => {
    const module = buildModule(1000, [
      {id: 200, values: [VALUE_DEF_ID_1, VALUE_DEF_ID_2, VALUE_DEF_ID_3]},
    ]);

    const result = await inserter.insert([module]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got errors:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n---\n')}`,
      );
    }

    const ckvRows = await dataSource.query(
      `SELECT * FROM ckv WHERE spf_module_system_id = 1000`,
    );
    expect(ckvRows).toHaveLength(1);
    expect(ckvRows[0].system_id).toBe(200);

    const valueRows = await dataSource.query(
      `SELECT * FROM ckv_values WHERE ckv_system_id = 200 ORDER BY value_def_system_id`,
    );
    expect(valueRows).toHaveLength(3);
    expect(
      valueRows.map(
        (r: {value_def_system_id: number}) => r.value_def_system_id,
      ),
    ).toEqual([VALUE_DEF_ID_1, VALUE_DEF_ID_2, VALUE_DEF_ID_3]);
  });

  it('inserts separate ckv_values rows for two CKVs with different value sets', async () => {
    const module = buildModule(1001, [
      {id: 210, values: [VALUE_DEF_ID_1, VALUE_DEF_ID_2, VALUE_DEF_ID_3]},
      {id: 211, values: [VALUE_DEF_ID_1, VALUE_DEF_ID_2]},
    ]);

    const result = await inserter.insert([module]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got errors:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n---\n')}`,
      );
    }

    const ckvRows = await dataSource.query(
      `SELECT * FROM ckv WHERE spf_module_system_id = 1001 ORDER BY system_id`,
    );
    expect(ckvRows).toHaveLength(2);

    const valuesForCkv210 = await dataSource.query(
      `SELECT * FROM ckv_values WHERE ckv_system_id = 210`,
    );
    expect(valuesForCkv210).toHaveLength(3);

    const valuesForCkv211 = await dataSource.query(
      `SELECT * FROM ckv_values WHERE ckv_system_id = 211`,
    );
    expect(valuesForCkv211).toHaveLength(2);
  });

  it('rolls back ckv row and reports failure when a value FK does not exist', async () => {
    const NON_EXISTENT_VALUE_ID = 9999;
    const module = buildModule(1002, [
      {id: 220, values: [VALUE_DEF_ID_1, NON_EXISTENT_VALUE_ID]},
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('systemId=1002');
    expect(result.errors[0].details).toContain('CKV');

    // ckv row must be deleted on rollback
    const ckvRows = await dataSource.query(
      `SELECT * FROM ckv WHERE system_id = 220`,
    );
    expect(ckvRows).toHaveLength(0);

    // no partial values left
    const valueRows = await dataSource.query(
      `SELECT * FROM ckv_values WHERE ckv_system_id = 220`,
    );
    expect(valueRows).toHaveLength(0);
  });

  it('isolates failure — good CKV survives when sibling CKV has bad value FK', async () => {
    const NON_EXISTENT_VALUE_ID = 9999;
    const module = buildModule(1003, [
      {id: 230, values: [VALUE_DEF_ID_1]}, // valid
      {id: 231, values: [NON_EXISTENT_VALUE_ID]}, // bad FK
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);

    // CKV 230 (valid) must exist with its value
    const validCkvRows = await dataSource.query(
      `SELECT * FROM ckv WHERE system_id = 230`,
    );
    expect(validCkvRows).toHaveLength(1);

    const validValueRows = await dataSource.query(
      `SELECT * FROM ckv_values WHERE ckv_system_id = 230`,
    );
    expect(validValueRows).toHaveLength(1);

    // CKV 231 (bad) must be rolled back
    const badCkvRows = await dataSource.query(
      `SELECT * FROM ckv WHERE system_id = 231`,
    );
    expect(badCkvRows).toHaveLength(0);

    const badValueRows = await dataSource.query(
      `SELECT * FROM ckv_values WHERE ckv_system_id = 231`,
    );
    expect(badValueRows).toHaveLength(0);
  });
});
