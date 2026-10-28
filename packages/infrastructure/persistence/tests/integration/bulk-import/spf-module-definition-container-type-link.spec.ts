/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {SpfModuleDefinition, type IdGenerationPort} from '@arc/core';
import {
  getTestDataSource,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';
import {SpfModuleDefinitionInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/spf-module-definition/spf-module-definition.inserter.js';

const FILE_ID = 100;
const PROCESSOR_DEFINITION_ID = 200;
const CONTAINER_TYPE_ID = 300;

async function seedDependencies(manager: EntityManager): Promise<void> {
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
  await manager.insert('ProcessorDefinition', {
    systemId: PROCESSOR_DEFINITION_ID,
    fileSystemId: FILE_ID,
    naturalId: 1,
    name: 'Test Processor',
    version: 1,
  });
  await manager.insert('ContainerType', {
    systemId: CONTAINER_TYPE_ID,
    name: 'Test Container Type',
    value: 1,
    version: 1,
  });
}

function makeIdGenerator(): IdGenerationPort {
  let nextId = 50_000;
  return {
    getNextId: async () => ++nextId,
    reserveBlock: async () => nextId,
    persistLastUsedId: async () => undefined,
  };
}

describe('SpfModuleDefinitionInserter - container-type links', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: SpfModuleDefinitionInserter;

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
    await seedDependencies(manager);
    inserter = new SpfModuleDefinitionInserter(manager, makeIdGenerator());
  });

  it('inserts more than 1000 container-type links without exceeding SQLite expression depth', async () => {
    const definitions = Array.from(
      {length: 1001},
      (_, index) =>
        new SpfModuleDefinition({
          systemId: 10_000 + index,
          naturalId: 20_000 + index,
          name: `Module-${index}`,
          displayName: `Module ${index}`,
          fileSystemId: FILE_ID,
          stackSize: 0,
          dataPortGroups: [],
          staticControlPorts: [],
          processorSystemId: PROCESSOR_DEFINITION_ID,
          containerTypesSystemIds: [CONTAINER_TYPE_ID],
        }),
    );

    const result = await inserter.insert(definitions);

    expect(result.ok).toBe(true);
    const links = await dataSource.query(
      `SELECT * FROM module_definition_container_types
       WHERE module_definition_system_id >= 10000`,
    );
    expect(links).toHaveLength(1001);
  });
});
