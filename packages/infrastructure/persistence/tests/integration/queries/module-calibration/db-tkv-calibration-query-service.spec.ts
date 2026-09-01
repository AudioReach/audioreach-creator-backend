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
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {DbTkvCalibrationQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/module-calibration/db-tkv-calibration-query-service.js';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
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

const FILE_ID = 300;
const MODULE_ID = 70;
const TAG_DEF_ID = 95;
const TAG_MAP_ID = 80;
const TKV_ID = 90;
const DEF_SYSTEM_ID = 310;
const PARAM_DEF_ID = 25;
const PAYLOAD_ID = 35;
const SUBGRAPH_ID = 410;
const CONTAINER_ID = 510;

async function seedAll(ds: DataSource) {
  await getTestRepository(ProjectSchema).save({
    systemId: 2,
    name: 'P2',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID,
    projectSystemId: 2,
    fileName: 'g.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
  await ds.query(
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (2, 2, 'proc2', ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg2', 2, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (?, 2, 5, ?)`,
    [CONTAINER_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (?, 2, 'mod2', 0, ?, 0, 2)`,
    [DEF_SYSTEM_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [MODULE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 2, 'mod2', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_SYSTEM_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO tag_definitions (system_id, tag_id, name, is_voice, file_system_id) VALUES (${TAG_DEF_ID}, 2, 'mode', 0, ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (${TAG_MAP_ID}, ${MODULE_ID}, ${TAG_DEF_ID})`,
  );
  await ds.query(
    `INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (${TKV_ID}, ${TAG_MAP_ID})`,
  );
  await ds.query(
    `INSERT OR IGNORE INTO spf_module_parameter_definitions (system_id, param_id, name, max_size, is_persistent, elements_structure, is_read_only, pid_type, spf_module_definition_system_id) VALUES (${PARAM_DEF_ID}, 1, 'gain', 64, 1, '[]', 0, 'PID', ${DEF_SYSTEM_ID})`,
  );
  await ds.query(
    `INSERT INTO tkv_parameter_payload (system_id, tkv_system_id, parameter_system_id, payload) VALUES (${PAYLOAD_ID}, ${TKV_ID}, ${PARAM_DEF_ID}, X'05000000')`,
  );
}

function makeService(ds: DataSource): DbTkvCalibrationQueryService {
  const editSvc = new EditActionsQueryService(ds.manager);
  const kvSvc = new DbKeyValueDefQueryService(ds, editSvc);
  return new DbTkvCalibrationQueryService(ds, editSvc, kvSvc);
}

describe('DbTkvCalibrationQueryService', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  describe('getTkv', () => {
    it('returns TkvReadModel for existing TKV (no session)', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const result = await svc.getTkv(FILE_ID, MODULE_ID, TAG_MAP_ID, TKV_ID);
      expect(result).not.toBeNull();
      expect(result?.systemId).toBe(TKV_ID);
      expect(result?.moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
    });

    it('returns null for unknown tkvSystemId', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      expect(await svc.getTkv(FILE_ID, MODULE_ID, TAG_MAP_ID, 9999)).toBeNull();
    });

    it('returns null when tkvSystemId is under wrong moduleTagIdMapSystemId', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      expect(await svc.getTkv(FILE_ID, MODULE_ID, 9999, TKV_ID)).toBeNull();
    });
  });

  describe('getTkvPayloads', () => {
    it('returns all payloads for the TKV (no session)', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const payloads = await svc.getTkvPayloads(FILE_ID, MODULE_ID, TKV_ID);
      expect(payloads).toHaveLength(1);
      expect(payloads[0].systemId).toBe(PAYLOAD_ID);
      expect(payloads[0].parameterSystemId).toBe(PARAM_DEF_ID);
      expect(payloads[0].payload).toBeInstanceOf(Uint8Array);
    });

    it('filters to requested paramSystemIds (payload PKs)', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const payloads = await svc.getTkvPayloads(FILE_ID, MODULE_ID, TKV_ID, [
        PAYLOAD_ID,
      ]);
      expect(payloads).toHaveLength(1);
      expect(payloads[0].systemId).toBe(PAYLOAD_ID);
    });

    it('returns empty array when paramSystemIds has no matches', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const payloads = await svc.getTkvPayloads(
        FILE_ID,
        MODULE_ID,
        TKV_ID,
        [9999],
      );
      expect(payloads).toHaveLength(0);
    });
  });
});
