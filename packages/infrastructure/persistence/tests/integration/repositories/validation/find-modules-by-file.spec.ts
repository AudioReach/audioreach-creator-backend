/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmValidationQueryRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/validation/typeorm-validation-query.repository.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;
const MOD_A_ID = 50;
const MOD_B_ID = 51;
const MOD_C_ID = 52;
const DEF_ID = 200;
const CONTAINER_ID = 300;
const SUBGRAPH_ID = 400;
const CKV_A_ID = 10;
const CKV_B_ID = 11;
const CKV_C_ZERO_ID = 20;
const CKV_C_NONZERO_ID = 21;
const KEY_DEF_ID = 5000;
const VALUE_DEF_ID = 1001;

async function seedProjectAndFile(ds: DataSource) {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'f.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
}

async function seedSharedDefs(ds: DataSource) {
  await ds.query(
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (1, 1, 'proc', ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (?, 1, 5, ?)`,
    [CONTAINER_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (?, 1, 'def', 0, ?, 0, 1)`,
    [DEF_ID, FILE_ID],
  );
}

async function seedModule(
  ds: DataSource,
  moduleId: number,
  instanceId: number,
  alias: string,
) {
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [moduleId, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [moduleId, instanceId, alias, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
}

async function seedValueDefs(ds: DataSource) {
  await ds.query(
    `INSERT INTO arc_keys (system_id, key_id, name, file_system_id) VALUES (?, 1, 'key', ?)`,
    [KEY_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO arc_values (system_id, value_id, name, keys_system_id) VALUES (?, 1, 'val', ?)`,
    [VALUE_DEF_ID, KEY_DEF_ID],
  );
  await ds.query(
    `INSERT INTO arc_values (system_id, value_id, name, keys_system_id) VALUES (?, 2, 'val2', ?)`,
    [VALUE_DEF_ID + 1, KEY_DEF_ID],
  );
}

describe('TypeOrmValidationQueryRepository.findModulesByFile', () => {
  let ds: DataSource;
  let repo: TypeOrmValidationQueryRepository;

  beforeAll(async () => {
    await setupIntegrationTest();
    ds = getTestDataSource();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    repo = new TypeOrmValidationQueryRepository(ds);
  });

  it('should return empty array when file has no modules', async () => {
    const result = await repo.findModulesByFile(FILE_ID);
    expect(result).toHaveLength(0);
  });

  it('should load module with zero-key CKV (no ckv_values rows)', async () => {
    await seedProjectAndFile(ds);
    await seedSharedDefs(ds);
    await seedModule(ds, MOD_A_ID, 1, 'mod-a');
    await ds.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [CKV_A_ID, MOD_A_ID],
    );

    const result = await repo.findModulesByFile(FILE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(MOD_A_ID);
    expect(result[0].naturalId).toBe(1);
    expect(result[0].alias).toBe('mod-a');
    expect(result[0].ckvs).toHaveLength(1);
    expect(result[0].ckvs[0].valueDefinitionSystemIds).toHaveLength(0);
  });

  it('should load module with no CKVs', async () => {
    await seedProjectAndFile(ds);
    await seedSharedDefs(ds);
    await seedModule(ds, MOD_A_ID, 1, 'mod-a');

    const result = await repo.findModulesByFile(FILE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(MOD_A_ID);
    expect(result[0].ckvs).toHaveLength(0);
  });

  it('should load module with non-zero CKV', async () => {
    await seedProjectAndFile(ds);
    await seedSharedDefs(ds);
    await seedValueDefs(ds);
    await seedModule(ds, MOD_B_ID, 2, 'mod-b');
    await ds.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [CKV_B_ID, MOD_B_ID],
    );
    await ds.query(
      `INSERT INTO ckv_values (ckv_system_id, value_def_system_id) VALUES (?, ?)`,
      [CKV_B_ID, VALUE_DEF_ID],
    );

    const result = await repo.findModulesByFile(FILE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(MOD_B_ID);
    expect(result[0].ckvs).toHaveLength(1);
    expect(result[0].ckvs[0].valueDefinitionSystemIds).toEqual([VALUE_DEF_ID]);
  });

  it('should load module with mixed CKVs — ARC-MOD-005 case', async () => {
    await seedProjectAndFile(ds);
    await seedSharedDefs(ds);
    await seedValueDefs(ds);
    await seedModule(ds, MOD_A_ID, 1, 'mod-a');
    await seedModule(ds, MOD_B_ID, 2, 'mod-b');
    await seedModule(ds, MOD_C_ID, 3, 'mod-c');
    // Module A: zero-key only
    await ds.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [CKV_A_ID, MOD_A_ID],
    );
    // Module B: non-zero only
    await ds.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [CKV_B_ID, MOD_B_ID],
    );
    await ds.query(
      `INSERT INTO ckv_values (ckv_system_id, value_def_system_id) VALUES (?, ?)`,
      [CKV_B_ID, VALUE_DEF_ID],
    );
    // Module C: mixed (zero-key + non-zero) — ARC-MOD-005 case
    await ds.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [CKV_C_ZERO_ID, MOD_C_ID],
    );
    await ds.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [CKV_C_NONZERO_ID, MOD_C_ID],
    );
    await ds.query(
      `INSERT INTO ckv_values (ckv_system_id, value_def_system_id) VALUES (?, ?)`,
      [CKV_C_NONZERO_ID, VALUE_DEF_ID + 1],
    );

    const result = await repo.findModulesByFile(FILE_ID);
    expect(result).toHaveLength(3);

    const modC = result.find(m => m.systemId === MOD_C_ID)!;
    expect(modC).toBeDefined();
    expect(modC.ckvs).toHaveLength(2);
    expect(modC.ckvs.some(c => c.valueDefinitionSystemIds.length === 0)).toBe(
      true,
    );
    expect(modC.ckvs.some(c => c.valueDefinitionSystemIds.length > 0)).toBe(
      true,
    );
  });
});
