/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {ModuleManagerData} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {ModuleManagerDataInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/module-manager-data/module-manager-data.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const PROCESSOR_DEF_ID = 10;
const MODULE_DEF_ID = 20;

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

  await manager.insert('ProcessorDefinition', {
    systemId: PROCESSOR_DEF_ID,
    fileSystemId: FILE_ID,
    processorDefinitionId: 1,
    name: 'TestProcessor',
    version: 1,
  });

  await manager.insert('SpfModuleDefinition', {
    systemId: MODULE_DEF_ID,
    fileSystemId: FILE_ID,
    moduleDefinitionId: 1,
    name: 'TestModule',
    version: 1,
  });

  await manager.insert('SpfModuleDefinition', {
    systemId: 21,
    fileSystemId: FILE_ID,
    moduleDefinitionId: 2,
    name: 'TestModule2',
    version: 1,
  });
}

function buildModuleManagerData(systemId: number): ModuleManagerData {
  return new ModuleManagerData({
    systemId,
    processorDefinitionSystemId: PROCESSOR_DEF_ID,
    moduleDefinitionSystemId: MODULE_DEF_ID,
    fileSystemId: FILE_ID,
    moduleType: 2,
    interfaceType: 2,
    interfaceVersion: 3,
    fileName: 'test.so',
    tag: 'test-tag',
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ModuleManagerDataInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: ModuleManagerDataInserter;

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
    inserter = new ModuleManagerDataInserter(manager);
  });

  // ── Test 1: empty input ──────────────────────────────────────────────────

  it('returns ok immediately for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(`SELECT * FROM module_manager_data`);
    expect(rows).toHaveLength(0);
  });

  // ── Test 2: happy path ───────────────────────────────────────────────────

  it('inserts all rows and returns ok', async () => {
    const data = buildModuleManagerData(1001);

    const result = await inserter.insert([data]);

    if (!result.ok) {
      throw new Error(
        `Expected ok=true but got:\n${result.errors.map(e => `${e.message}\n${e.details}`).join('\n')}`,
      );
    }

    const rows = await dataSource.query(
      `SELECT * FROM module_manager_data WHERE system_id = 1001`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].processor_definition_system_id).toBe(PROCESSOR_DEF_ID);
    expect(rows[0].module_definition_system_id).toBe(MODULE_DEF_ID);
    expect(rows[0].file_name).toBe('test.so');
  });

  // ── Test 3: failure is reported with aggregate natural ID ─────────────────

  it('reports failure grouped under the aggregate natural ID', async () => {
    await manager.insert('ModuleManagerData', {
      systemId: 1002,
      processorDefinitionSystemId: PROCESSOR_DEF_ID,
      moduleDefinitionSystemId: MODULE_DEF_ID,
      fileSystemId: FILE_ID,
      moduleType: 1,
      interfaceType: 2,
      interfaceVersion: 3,
      fileName: 'existing.so',
      tag: 'existing',
      version: 1,
    });

    const data = buildModuleManagerData(1002);
    const result = await inserter.insert([data]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('ModuleManagerData');
    expect(result.errors[0].message).toContain('processorId');
    expect(result.errors[0].message).toContain('moduleId');
  });

  // ── Test 4: failure isolation (sibling entities survive) ─────────────────

  it('good sibling inserts successfully when one entity fails', async () => {
    await manager.insert('ModuleManagerData', {
      systemId: 1003,
      processorDefinitionSystemId: PROCESSOR_DEF_ID,
      moduleDefinitionSystemId: MODULE_DEF_ID,
      fileSystemId: FILE_ID,
      moduleType: 1,
      interfaceType: 2,
      interfaceVersion: 3,
      fileName: 'conflict.so',
      tag: 'conflict',
      version: 1,
    });

    const bad = buildModuleManagerData(1003);
    const good = new ModuleManagerData({
      systemId: 1004,
      processorDefinitionSystemId: PROCESSOR_DEF_ID,
      moduleDefinitionSystemId: 21,
      fileSystemId: FILE_ID,
      moduleType: 2,
      interfaceType: 2,
      interfaceVersion: 3,
      fileName: 'test.so',
      tag: 'test-tag',
    });

    const result = await inserter.insert([bad, good]);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);

    const goodRows = await dataSource.query(
      `SELECT * FROM module_manager_data WHERE system_id = 1004`,
    );
    expect(goodRows).toHaveLength(1);
  });
});
