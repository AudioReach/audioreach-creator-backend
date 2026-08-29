/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {DbVcpmQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/vcpm/db-vcpm-query-service.js';
import {VcpmOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-overlay-fetcher.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;
const SUBGRAPH_ID = 400;
const VCPM_DEF_ID = 10;
const VCPM_INSTANCE_ID = 20;
const CKV_ID = 30;
const VALUE_DEF_ID = 50;
const KEY_DEF_ID = 1;
const PARAM_DEF_ID = 60;
const PAYLOAD_ID = 70;

async function seedAll(ds: DataSource) {
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
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (?, 1, 'vcpm_def', ?)`,
    [VCPM_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_instances (system_id, subgraph_system_id, vcpm_definition_id) VALUES (?, ?, ?)`,
    [VCPM_INSTANCE_ID, SUBGRAPH_ID, VCPM_DEF_ID],
  );
  await ds.query(
    `INSERT INTO arc_keys (system_id, key_id, name, file_system_id) VALUES (?, 1, 'mode', ?)`,
    [KEY_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO arc_values (system_id, value_id, name, keys_system_id) VALUES (?, 1, 'hifi', ?)`,
    [VALUE_DEF_ID, KEY_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_ckv (system_id, vcpm_instance_system_id) VALUES (?, ?)`,
    [CKV_ID, VCPM_INSTANCE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_ckv_values (vcpm_ckv_system_id, value_def_system_id) VALUES (?, ?)`,
    [CKV_ID, VALUE_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID, VCPM_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [PAYLOAD_ID, PARAM_DEF_ID, CKV_ID, Buffer.alloc(4)],
  );
}

async function seedSession(ds: DataSource): Promise<number> {
  const row = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'u',
    clientId: 'c',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  return row.sessionId;
}

async function seedEditAction(
  ds: DataSource,
  opts: {
    sessionId: number;
    aggregateId: number;
    targetSystemId: number;
    targetTable: string;
    operation: string;
    newValue: string;
    validUntil?: string | null;
  },
) {
  await ds.query(
    `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, valid_until)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
    [
      opts.sessionId,
      opts.aggregateId,
      opts.targetSystemId,
      opts.targetTable,
      opts.operation,
      opts.newValue,
      SOURCE.Manual,
      CHANGE_STATUS.Staged,
      opts.validUntil ?? null,
    ],
  );
}

describe('DbVcpmQueryService (integration)', () => {
  let ds: DataSource;
  let svc: DbVcpmQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    const editSvc = new EditActionsQueryService(ds.manager);
    const sessionRepo = new TypeOrmSessionRepository(ds.manager);
    const keyValueSvc = new DbKeyValueDefQueryService(ds, editSvc);
    const fetcher = new VcpmOverlayFetcher(ds.manager, editSvc);
    svc = new DbVcpmQueryService(fetcher, keyValueSvc, sessionRepo);
  });

  describe('getVcpmInstanceBySubgraph', () => {
    it('returns VcpmInstanceReadModel for a committed instance', async () => {
      await seedAll(ds);
      const result = await svc.getVcpmInstanceBySubgraph(SUBGRAPH_ID, FILE_ID);
      expect(result).not.toBeNull();
      expect(result!.systemId).toBe(VCPM_INSTANCE_ID);
      expect(result!.subgraphSystemId).toBe(SUBGRAPH_ID);
    });

    it('returns null when no instance exists', async () => {
      // Seed only project/file/subgraph — no vcpm_instance
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
      await ds.query(
        `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
        [SUBGRAPH_ID, FILE_ID],
      );
      const result = await svc.getVcpmInstanceBySubgraph(SUBGRAPH_ID, FILE_ID);
      expect(result).toBeNull();
    });
  });

  describe('getVcpmCkvsByInstance', () => {
    it('returns VcpmCkvReadModel[] with resolved KeyValueInfoDto values', async () => {
      await seedAll(ds);
      const results = await svc.getVcpmCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        FILE_ID,
      );
      expect(results).toHaveLength(1);
      expect(results[0].systemId).toBe(CKV_ID);
      expect(results[0].values).toHaveLength(1);
      expect(results[0].values[0].key.name).toBe('mode');
      expect(results[0].values[0].value.name).toBe('hifi');
    });
  });

  describe('getVcpmCkv', () => {
    it('returns VcpmCkvReadModel for a CKV that belongs to the subgraph', async () => {
      await seedAll(ds);
      const result = await svc.getVcpmCkv(CKV_ID, SUBGRAPH_ID, FILE_ID);
      expect(result).not.toBeNull();
      expect(result!.systemId).toBe(CKV_ID);
      expect(result!.values[0].key.name).toBe('mode');
    });

    it('returns null when CKV does not exist', async () => {
      await seedAll(ds);
      const result = await svc.getVcpmCkv(9999, SUBGRAPH_ID, FILE_ID);
      expect(result).toBeNull();
    });
  });

  describe('getVcpmParameterPayloads', () => {
    it('returns all payloads for a CKV when no filter', async () => {
      await seedAll(ds);
      const results = await svc.getVcpmParameterPayloads(
        CKV_ID,
        SUBGRAPH_ID,
        FILE_ID,
      );
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].vcpmCkvSystemId).toBe(CKV_ID);
    });

    it('returns only matching payloads when paramSystemIds filter provided', async () => {
      await seedAll(ds);
      await ds.query(
        `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 2, 64, 'TYPE_A', 1, '[]', 0, ?)`,
        [PARAM_DEF_ID + 1, VCPM_DEF_ID],
      );
      await ds.query(
        `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
        [PAYLOAD_ID + 1, PARAM_DEF_ID + 1, CKV_ID, Buffer.alloc(4)],
      );
      const results = await svc.getVcpmParameterPayloads(
        CKV_ID,
        SUBGRAPH_ID,
        FILE_ID,
        [PARAM_DEF_ID],
      );
      expect(results).toHaveLength(1);
      expect(results[0].vcpmParameterSystemId).toBe(PARAM_DEF_ID);
    });
  });

  describe('getVcpmParameterDefinitions', () => {
    it('returns empty array for empty input without querying DB', async () => {
      const result = await svc.getVcpmParameterDefinitions([]);
      expect(result).toEqual([]);
    });

    it('returns VcpmParameterDefinitionReadModel[] for seeded definitions', async () => {
      await seedAll(ds);
      const results = await svc.getVcpmParameterDefinitions([PARAM_DEF_ID]);
      expect(results).toHaveLength(1);
      expect(results[0].systemId).toBe(PARAM_DEF_ID);
      expect(results[0].paramId).toBe(1);
      expect(results[0].name).toBe(''); // name is nullable in schema, seeded without name
      expect(results[0].isReadOnly).toBe(false);
      expect(results[0].elementsStructure).toBe('[]');
    });
  });

  describe('session overlay', () => {
    it('staged-created CKV appears in getVcpmCkvsByInstance', async () => {
      await seedAll(ds);
      // Delete the committed CKV so we only test the staged-created one
      await ds.query(`DELETE FROM vcpm_ckv WHERE system_id = ?`, [CKV_ID]);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: CKV_ID,
        targetTable: ENTITY_NAMES.VcpmCkv,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          vcpmInstanceSystemId: VCPM_INSTANCE_ID,
          values: [],
        }),
      });
      const results = await svc.getVcpmCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        FILE_ID,
      );
      expect(results.some(r => r.systemId === CKV_ID)).toBe(true);
    });

    it('staged-deleted CKV is absent from getVcpmCkvsByInstance', async () => {
      await seedAll(ds);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: CKV_ID,
        targetTable: ENTITY_NAMES.VcpmCkv,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const results = await svc.getVcpmCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        FILE_ID,
      );
      expect(results.every(r => r.systemId !== CKV_ID)).toBe(true);
    });
  });
});
