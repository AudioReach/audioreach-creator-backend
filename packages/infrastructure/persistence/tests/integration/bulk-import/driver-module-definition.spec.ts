/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {
  DriverModuleDefinition,
  DriverModuleParameterDefinition,
} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {DriverModuleDefinitionInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/driver-module-definition/driver-module-definition.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedFkDependencies(manager: EntityManager): Promise<void> {
  await manager.insert('Project', {
    systemId: 1,
    name: 'Test',
    description: '',
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
}

function buildDriverModuleDefinition(
  systemId: number,
  moduleDefinitionId: number,
  params: Array<{systemId: number; parameterId: number}> = [],
): DriverModuleDefinition {
  const parameters = params.map(
    ({systemId: paramSystemId, parameterId}) =>
      new DriverModuleParameterDefinition({
        systemId: paramSystemId,
        parameterId,
        name: `Param_${parameterId}`,
        description: 'Test parameter',
        maxSize: 100,
        paramStructure: JSON.stringify({type: 'test'}),
        defaultData: new Uint8Array([4, 5, 6]),
        driverModuleDefinitionSystemId: systemId,
      }),
  );

  return new DriverModuleDefinition({
    systemId,
    moduleDefinitionId,
    name: `Module_${moduleDefinitionId}`,
    displayName: `Module_${moduleDefinitionId}`,
    description: 'Test module',
    groupName: 'TestGroup',
    fileSystemId: FILE_ID,
    parameters,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DriverModuleDefinitionInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: DriverModuleDefinitionInserter;

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
    inserter = new DriverModuleDefinitionInserter(manager);
  });

  // ── Test 1: empty input ──────────────────────────────────────────────────

  it('returns ok immediately for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(
      `SELECT * FROM driver_module_definitions`,
    );
    expect(rows).toHaveLength(0);
  });

  // ── Test 2: happy path ───────────────────────────────────────────────────

  it('inserts all rows and returns ok', async () => {
    const def = buildDriverModuleDefinition(1001, 1, [
      {systemId: 2001, parameterId: 1},
      {systemId: 2002, parameterId: 2},
    ]);

    const result = await inserter.insert([def]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    const defRows = await dataSource.query(
      `SELECT * FROM driver_module_definitions WHERE system_id = 1001`,
    );
    expect(defRows).toHaveLength(1);
    expect(defRows[0].name).toBe('Module_1');

    const paramRows = await dataSource.query(
      `SELECT * FROM driver_module_parameter_definitions WHERE driver_module_definition_system_id = 1001 ORDER BY system_id`,
    );
    expect(paramRows).toHaveLength(2);
    expect(paramRows[0].system_id).toBe(2001);
    expect(paramRows[1].system_id).toBe(2002);
  });

  // ── Test 3: failure is reported with aggregate natural ID ─────────────────

  it('reports failure grouped under the aggregate natural ID', async () => {
    await manager.insert('DriverModuleDefinition', {
      systemId: 1002,
      moduleDefinitionId: 1,
      name: 'Existing',
      description: '',
      groupName: '',
      fileSystemId: FILE_ID,
      version: 1,
    });

    const def = buildDriverModuleDefinition(1002, 1);
    const result = await inserter.insert([def]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('DriverModuleDefinition');
    expect(result.errors[0].message).toContain('moduleDefinitionId');
    expect(result.errors[0].message).toContain('Module_1');
  });

  // ── Test 4: failure isolation (sibling entities survive) ─────────────────

  it('good sibling inserts successfully when one entity fails', async () => {
    await manager.insert('DriverModuleDefinition', {
      systemId: 1003,
      moduleDefinitionId: 2,
      name: 'Conflict',
      description: '',
      groupName: '',
      fileSystemId: FILE_ID,
      version: 1,
    });

    const bad = buildDriverModuleDefinition(1003, 2);
    const good = buildDriverModuleDefinition(1004, 3);

    const result = await inserter.insert([bad, good]);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);

    const goodRows = await dataSource.query(
      `SELECT * FROM driver_module_definitions WHERE system_id = 1004`,
    );
    expect(goodRows).toHaveLength(1);
  });

  // ── Test 5: parent failure skips children ─────────────────────────────────

  it('skips child rows when their parent fails', async () => {
    await manager.insert('DriverModuleDefinition', {
      systemId: 1005,
      moduleDefinitionId: 4,
      name: 'Conflict',
      description: '',
      groupName: '',
      fileSystemId: FILE_ID,
      version: 1,
    });

    const def = buildDriverModuleDefinition(1005, 4, [
      {systemId: 2005, parameterId: 5},
    ]);

    await inserter.insert([def]);

    const paramRows = await dataSource.query(
      `SELECT * FROM driver_module_parameter_definitions WHERE driver_module_definition_system_id = 1005`,
    );
    expect(paramRows).toHaveLength(0);
  });
});
