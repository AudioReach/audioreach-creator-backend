/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import type {IdGenerationPort} from '@arc/core';
import {
  DriverModule,
  DkvData,
  ModuleParameterData,
  asSystemId,
} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {DriverModuleInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/driver-module/driver-module.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const DEFINITION_ID = 30;
const DEFINITION_ID_2 = 31;
const KEY_DEF_ID = 40;
const VALUE_DEF_ID_1 = 201;
const VALUE_DEF_ID_2 = 202;
const VALUE_DEF_ID_3 = 203;
const PARAM_DEF_ID_1 = 301;
const PARAM_DEF_ID_2 = 302;

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

  await manager.insert('DriverModuleDefinition', {
    systemId: DEFINITION_ID,
    fileSystemId: FILE_ID,
    moduleDefinitionId: 1,
    name: 'TestDriverModule',
    version: 1,
  });

  await manager.insert('DriverModuleDefinition', {
    systemId: DEFINITION_ID_2,
    fileSystemId: FILE_ID,
    moduleDefinitionId: 2,
    name: 'TestDriverModule2',
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

  for (const [systemId, parameterId] of [
    [PARAM_DEF_ID_1, 1],
    [PARAM_DEF_ID_2, 2],
  ] as const) {
    await manager.insert('DriverModuleParameterDefinition', {
      systemId,
      driverModuleDefinitionSystemId: DEFINITION_ID,
      parameterId,
      name: `Param_${parameterId}`,
      maxSize: 100,
      paramStructure: '{}',
      defaultData: new Uint8Array([1, 2, 3]),
      version: 1,
    });
  }
}

function buildDriverModule(
  moduleSystemId: number,
  dkvs: {
    id: number;
    values: number[];
    params: {paramDefSystemId: number; payload: Uint8Array}[];
  }[],
  definitionSystemId: number = DEFINITION_ID,
): DriverModule {
  const module = new DriverModule({
    systemId: moduleSystemId,
    definitionSystemId,
    fileSystemId: FILE_ID,
  });

  for (const dkv of dkvs) {
    const dkvData = new DkvData({
      systemId: dkv.id,
      valueDefinitionSystemIds: dkv.values,
    });

    for (const param of dkv.params) {
      dkvData.addParameterPayload(
        new ModuleParameterData(
          asSystemId(param.paramDefSystemId),
          param.payload,
        ),
      );
    }

    module.addDkvData(dkvData);
  }

  return module;
}

class MockIdGenerator implements IdGenerationPort {
  private counter = 5000;

  async getNextId(_fileSystemId: number): Promise<number> {
    return ++this.counter;
  }

  async reserveBlock(_fileSystemId: number, _count: number): Promise<number> {
    const start = this.counter + 1;
    this.counter += _count;
    return start;
  }

  async persistLastUsedId(_fileSystemId: number): Promise<void> {
    // No-op for tests
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DriverModuleInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: DriverModuleInserter;
  let idGenerator: MockIdGenerator;

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
    idGenerator = new MockIdGenerator();
    inserter = new DriverModuleInserter(manager, idGenerator);
  });

  // ── Test 1: empty input ──────────────────────────────────────────────────

  it('returns ok immediately for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(`SELECT * FROM driver_modules`);
    expect(rows).toHaveLength(0);
  });

  // ── Test 2: happy path - 4-table cascade ─────────────────────────────────

  it('inserts all 4 tables successfully (driver_modules → dkv → dkv_values → dkv_parameter_payload)', async () => {
    const module = buildDriverModule(1001, [
      {
        id: 2001,
        values: [VALUE_DEF_ID_1, VALUE_DEF_ID_2],
        params: [
          {paramDefSystemId: PARAM_DEF_ID_1, payload: new Uint8Array([10, 20])},
          {paramDefSystemId: PARAM_DEF_ID_2, payload: new Uint8Array([30, 40])},
        ],
      },
    ]);

    const result = await inserter.insert([module]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    // Verify driver_modules
    const moduleRows = await dataSource.query(
      `SELECT * FROM driver_modules WHERE system_id = 1001`,
    );
    expect(moduleRows).toHaveLength(1);
    expect(moduleRows[0].definition_system_id).toBe(DEFINITION_ID);

    // Verify dkv
    const dkvRows = await dataSource.query(
      `SELECT * FROM dkv WHERE system_id = 2001`,
    );
    expect(dkvRows).toHaveLength(1);
    expect(dkvRows[0].driver_module_system_id).toBe(1001);

    // Verify dkv_values
    const valueRows = await dataSource.query(
      `SELECT * FROM dkv_values WHERE dkv_system_id = 2001 ORDER BY value_def_system_id`,
    );
    expect(valueRows).toHaveLength(2);
    expect(valueRows[0].value_def_system_id).toBe(VALUE_DEF_ID_1);
    expect(valueRows[1].value_def_system_id).toBe(VALUE_DEF_ID_2);

    // Verify dkv_parameter_payload
    const paramRows = await dataSource.query(
      `SELECT * FROM dkv_parameter_payload WHERE dkv_system_id = 2001 ORDER BY parameter_system_id`,
    );
    expect(paramRows).toHaveLength(2);
    expect(paramRows[0].parameter_system_id).toBe(PARAM_DEF_ID_1);
    expect(paramRows[1].parameter_system_id).toBe(PARAM_DEF_ID_2);
  });

  // ── Test 3: root table failure skips all children ────────────────────────

  it('skips all child tables when driver_modules insert fails', async () => {
    // Create conflicting driver module
    await manager.insert('DriverModule', {
      systemId: 1002,
      moduleDefinitionId: 1,
      definitionSystemId: DEFINITION_ID,
      fileSystemId: FILE_ID,
      version: 1,
    });

    const module = buildDriverModule(1002, [
      {
        id: 2002,
        values: [VALUE_DEF_ID_1],
        params: [
          {paramDefSystemId: PARAM_DEF_ID_1, payload: new Uint8Array([1])},
        ],
      },
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');

    // Verify no child rows were inserted
    const dkvRows = await dataSource.query(
      `SELECT * FROM dkv WHERE system_id = 2002`,
    );
    expect(dkvRows).toHaveLength(0);

    const valueRows = await dataSource.query(
      `SELECT * FROM dkv_values WHERE dkv_system_id = 2002`,
    );
    expect(valueRows).toHaveLength(0);

    const paramRows = await dataSource.query(
      `SELECT * FROM dkv_parameter_payload WHERE dkv_system_id = 2002`,
    );
    expect(paramRows).toHaveLength(0);
  });

  // ── Test 4: DKV failure skips dkv_values and parameters ──────────────────

  it('skips dkv_values and dkv_parameter_payload when dkv insert fails', async () => {
    // Create conflicting DKV
    await manager.insert('DriverModule', {
      systemId: 1003,
      moduleDefinitionId: 2,
      definitionSystemId: DEFINITION_ID,
      fileSystemId: FILE_ID,
      version: 1,
    });

    await manager.insert('Dkv', {
      systemId: 2003,
      driverModuleSystemId: 1003,
      uiPersistence: null,
      version: 1,
    });

    const module = buildDriverModule(1003, [
      {
        id: 2003, // Conflict
        values: [VALUE_DEF_ID_1],
        params: [
          {paramDefSystemId: PARAM_DEF_ID_1, payload: new Uint8Array([1])},
        ],
      },
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);

    // Verify no child rows were inserted for the failed DKV
    const valueRows = await dataSource.query(
      `SELECT * FROM dkv_values WHERE dkv_system_id = 2003`,
    );
    expect(valueRows).toHaveLength(0);

    const paramRows = await dataSource.query(
      `SELECT * FROM dkv_parameter_payload WHERE dkv_system_id = 2003`,
    );
    expect(paramRows).toHaveLength(0);
  });

  // ── Test 5: DKV values failure triggers rollback ─────────────────────────

  it('deletes parent DKV when dkv_values insert fails (fallback rollback)', async () => {
    const module = buildDriverModule(1004, [
      {
        id: 2004,
        values: [999999], // Invalid value definition ID
        params: [],
      },
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');

    // Verify DKV was rolled back (deleted)
    const dkvRows = await dataSource.query(
      `SELECT * FROM dkv WHERE system_id = 2004`,
    );
    expect(dkvRows).toHaveLength(0);

    // Verify error details mention DKV Values
    expect(result.errors[0].details).toContain('DKV Values');
  });

  // ── Test 6: parameter payload failure ─────────────────────────────────────

  it('reports failure when dkv_parameter_payload insert fails', async () => {
    const module = buildDriverModule(1005, [
      {
        id: 2005,
        values: [VALUE_DEF_ID_1],
        params: [
          {paramDefSystemId: 999999, payload: new Uint8Array([1])}, // Invalid param def ID
        ],
      },
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');

    // Verify error details mention DKV Parameter
    expect(result.errors[0].details).toContain('DKV Parameter');
  });

  // ── Test 7: sibling isolation ─────────────────────────────────────────────

  it('good sibling inserts successfully when one module fails', async () => {
    // Create conflict for first module
    await manager.insert('DriverModule', {
      systemId: 1006,
      moduleDefinitionId: 5,
      definitionSystemId: DEFINITION_ID,
      fileSystemId: FILE_ID,
      version: 1,
    });

    const bad = buildDriverModule(1006, [
      {id: 2006, values: [VALUE_DEF_ID_1], params: []},
    ]);

    const good = buildDriverModule(
      1007,
      [{id: 2007, values: [VALUE_DEF_ID_2], params: []}],
      DEFINITION_ID_2,
    );

    const result = await inserter.insert([bad, good]);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);

    // Verify good module was inserted
    const goodModuleRows = await dataSource.query(
      `SELECT * FROM driver_modules WHERE system_id = 1007`,
    );
    expect(goodModuleRows).toHaveLength(1);

    const goodDkvRows = await dataSource.query(
      `SELECT * FROM dkv WHERE system_id = 2007`,
    );
    expect(goodDkvRows).toHaveLength(1);
  });

  // ── Test 8: multiple DKVs per module ──────────────────────────────────────

  it('handles multiple DKVs per module correctly', async () => {
    const module = buildDriverModule(1008, [
      {
        id: 2008,
        values: [VALUE_DEF_ID_1],
        params: [
          {paramDefSystemId: PARAM_DEF_ID_1, payload: new Uint8Array([1])},
        ],
      },
      {
        id: 2009,
        values: [VALUE_DEF_ID_2, VALUE_DEF_ID_3],
        params: [
          {paramDefSystemId: PARAM_DEF_ID_2, payload: new Uint8Array([2])},
        ],
      },
    ]);

    const result = await inserter.insert([module]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    // Verify both DKVs were inserted
    const dkvRows = await dataSource.query(
      `SELECT * FROM dkv WHERE driver_module_system_id = 1008 ORDER BY system_id`,
    );
    expect(dkvRows).toHaveLength(2);
    expect(dkvRows[0].system_id).toBe(2008);
    expect(dkvRows[1].system_id).toBe(2009);

    // Verify values for first DKV
    const values1 = await dataSource.query(
      `SELECT * FROM dkv_values WHERE dkv_system_id = 2008`,
    );
    expect(values1).toHaveLength(1);

    // Verify values for second DKV
    const values2 = await dataSource.query(
      `SELECT * FROM dkv_values WHERE dkv_system_id = 2009`,
    );
    expect(values2).toHaveLength(2);
  });

  // ── Test 9: error grouping by moduleDefinitionId ──────────────────────────

  it('groups all failures under the aggregate natural ID (moduleDefinitionId)', async () => {
    // Create conflicts at different levels
    await manager.insert('DriverModule', {
      systemId: 1009,
      moduleDefinitionId: 8,
      definitionSystemId: DEFINITION_ID,
      fileSystemId: FILE_ID,
      version: 1,
    });

    await manager.insert('Dkv', {
      systemId: 2010,
      driverModuleSystemId: 1009,
      uiPersistence: null,
      version: 1,
    });

    const module = buildDriverModule(1009, [
      {
        id: 2010, // DKV conflict
        values: [VALUE_DEF_ID_1],
        params: [],
      },
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');

    // Verify error message contains definitionSystemId in hex format
    expect(result.errors[0].message).toContain('DriverModule');
    expect(result.errors[0].message).toContain('definitionSystemId');
    expect(result.errors[0].message).toContain('0x'); // Hex format from BinaryUtils.toHexString
  });

  // ── Test 10: partial DKV failure isolation ────────────────────────────────

  it('continues processing other DKVs when one DKV fails', async () => {
    // Create a dummy driver module for the conflicting DKV
    await manager.insert('DriverModule', {
      systemId: 999,
      moduleDefinitionId: 999,
      definitionSystemId: DEFINITION_ID_2,
      fileSystemId: FILE_ID,
      version: 1,
    });

    // Create conflicting DKV (pre-insert it)
    await manager.insert('Dkv', {
      systemId: 2011,
      driverModuleSystemId: 999,
      uiPersistence: null,
      version: 1,
    });

    const module = buildDriverModule(1010, [
      {
        id: 2011, // Conflict - this DKV systemId already exists
        values: [VALUE_DEF_ID_1],
        params: [],
      },
      {
        id: 2012, // Should succeed
        values: [VALUE_DEF_ID_2],
        params: [],
      },
    ]);

    const result = await inserter.insert([module]);

    expect(result.ok).toBe(false);

    // Verify driver module was inserted
    const moduleRows = await dataSource.query(
      `SELECT * FROM driver_modules WHERE system_id = 1010`,
    );
    expect(moduleRows).toHaveLength(1);

    // Verify good DKV was inserted
    const goodDkvRows = await dataSource.query(
      `SELECT * FROM dkv WHERE system_id = 2012`,
    );
    expect(goodDkvRows).toHaveLength(1);

    // Verify good DKV's values were inserted
    const goodValueRows = await dataSource.query(
      `SELECT * FROM dkv_values WHERE dkv_system_id = 2012`,
    );
    expect(goodValueRows).toHaveLength(1);
  });
});
