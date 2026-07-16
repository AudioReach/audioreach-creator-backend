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
import {Subsystem} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {SubsystemInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/subsystem/subsystem.inserter.js';

const FILE_ID = 100;
const KEY_SYSTEM_ID = 700;

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
    fileName: 'test.awsp',
    description: '',
    metadata: '{}',
    isTarget: 0,
    lastReservedId: 0,
    version: 1,
  });
  await manager.insert('KeyDefinition', {
    systemId: KEY_SYSTEM_ID,
    fileSystemId: FILE_ID,
    keyId: 0xab000000,
    name: 'GraphKey',
    version: 1,
  });
}

function buildSubsystem(
  systemId: number,
  name: string,
  subsystemId: number,
  filteredKeySystemIds: number[] = [],
  parentId?: number,
): Subsystem {
  return new Subsystem({
    systemId,
    fileSystemId: FILE_ID,
    parentId,
    name,
    subsystemId,
    filteredKeySystemIds,
    dataPorts: [],
    controlPorts: [],
  });
}

describe('SubsystemInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;

  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(async () => {
    await setupEachTest();
    dataSource = getTestDataSource();
    manager = dataSource.manager;
    await createFkDependencies(manager);
  });

  it('should insert a subsystem with real name and subsystemId', async () => {
    const s = buildSubsystem(200, 'StreamRx_ULL', 0xf0100001);
    const inserter = new SubsystemInserter(manager);
    const result = await inserter.insert([s]);
    expect(result.ok).toBe(true);
    const rows = await dataSource.query(
      `SELECT name, subsystem_id FROM subsystems WHERE system_id = ?`,
      [200],
    );
    expect(rows[0].name).toBe('StreamRx_ULL');
    expect(rows[0].subsystem_id).toBe(0xf0100001);
  });

  it('should insert filteredKeys join rows', async () => {
    const s = buildSubsystem(201, 'S', 0xf0100002, [KEY_SYSTEM_ID]);
    const inserter = new SubsystemInserter(manager);
    await inserter.insert([s]);
    const rows = await dataSource.query(
      `SELECT * FROM subsystem_filtered_keys_key_definition WHERE subsystems_system_id = ?`,
      [201],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].key_definition_system_id).toBe(KEY_SYSTEM_ID);
  });

  it('should insert child subsystem with parentId set', async () => {
    const parent = buildSubsystem(202, 'Parent', 0xf0100003);
    const child = buildSubsystem(203, 'Child', 0xf0100004, [], 202);
    const inserter = new SubsystemInserter(manager);
    await inserter.insert([parent, child]);
    const rows = await dataSource.query(
      `SELECT parent_id FROM nodes WHERE system_id = ?`,
      [203],
    );
    expect(rows[0].parent_id).toBe(202);
  });

  it('should insert a subsystem with empty name and zero subsystemId', async () => {
    const s = buildSubsystem(210, '', 0);
    const inserter = new SubsystemInserter(manager);
    await inserter.insert([s]);
    const rows = await dataSource.query(
      `SELECT name, subsystem_id FROM subsystems WHERE system_id = ?`,
      [210],
    );
    expect(rows[0].name).toBe('');
    expect(rows[0].subsystem_id).toBe(0);
  });
});
