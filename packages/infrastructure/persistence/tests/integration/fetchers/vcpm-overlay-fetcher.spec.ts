/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {VcpmOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/vcpm-overlay-fetcher.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';

const FILE_ID = 100;
const SUBGRAPH_ID = 400;
const VCPM_DEF_ID = 10;
const VCPM_INSTANCE_ID = 20;
const CKV_ID = 30;
const VALUE_DEF_ID = 50;
const PARAM_DEF_ID = 60;
const PAYLOAD_ID = 70;

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

async function seedSubgraph(ds: DataSource) {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
}

async function seedVcpmDefinition(ds: DataSource) {
  await ds.query(
    `INSERT INTO vcpm_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (?, 1, 'vcpm_def', ?)`,
    [VCPM_DEF_ID, FILE_ID],
  );
}

async function seedVcpmInstance(ds: DataSource) {
  await ds.query(
    `INSERT INTO vcpm_instances (system_id, subgraph_system_id, vcpm_definition_id) VALUES (?, ?, ?)`,
    [VCPM_INSTANCE_ID, SUBGRAPH_ID, VCPM_DEF_ID],
  );
}

async function seedKeyDef(ds: DataSource) {
  await ds.query(
    `INSERT INTO arc_keys (system_id, key_id, name, file_system_id) VALUES (1, 1, 'mode', ?)`,
    [FILE_ID],
  );
  await ds.query(
    `INSERT INTO arc_values (system_id, value_id, name, keys_system_id) VALUES (?, 1, 'hifi', 1)`,
    [VALUE_DEF_ID],
  );
}

async function seedVcpmCkv(ds: DataSource, ckvSystemId = CKV_ID) {
  await ds.query(
    `INSERT INTO vcpm_ckv (system_id, vcpm_instance_system_id) VALUES (?, ?)`,
    [ckvSystemId, VCPM_INSTANCE_ID],
  );
}

async function seedVcpmCkvValues(ds: DataSource, ckvSystemId = CKV_ID) {
  await ds.query(
    `INSERT INTO vcpm_ckv_values (vcpm_ckv_system_id, value_def_system_id) VALUES (?, ?)`,
    [ckvSystemId, VALUE_DEF_ID],
  );
}

async function seedVcpmParamDef(ds: DataSource) {
  await ds.query(
    `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID, VCPM_DEF_ID],
  );
}

async function seedVcpmPayload(
  ds: DataSource,
  payloadSystemId = PAYLOAD_ID,
  ckvSystemId = CKV_ID,
) {
  await ds.query(
    `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [payloadSystemId, PARAM_DEF_ID, ckvSystemId, Buffer.alloc(4)],
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

describe('VcpmOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let fetcher: VcpmOverlayFetcher;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    await seedSubgraph(ds);
    await seedVcpmDefinition(ds);
    fetcher = new VcpmOverlayFetcher(
      ds.manager,
      new EditActionsQueryService(ds.manager),
    );
  });

  // ── fetchInstanceBySubgraph ──────────────────────────────────────────────────

  describe('fetchInstanceBySubgraph', () => {
    it('returns null when no instance exists and sessionId is null', async () => {
      const result = await fetcher.fetchInstanceBySubgraph(SUBGRAPH_ID, null);
      expect(result).toBeNull();
    });

    it('returns the committed instance when sessionId is null', async () => {
      await seedVcpmInstance(ds);
      const result = await fetcher.fetchInstanceBySubgraph(SUBGRAPH_ID, null);
      expect(result).not.toBeNull();
      expect(result!.systemId).toBe(VCPM_INSTANCE_ID);
      expect(result!.subgraphSystemId).toBe(SUBGRAPH_ID);
    });

    it('returns null when instance is staged-deleted in session', async () => {
      await seedVcpmInstance(ds);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: VCPM_INSTANCE_ID,
        targetTable: ENTITY_NAMES.VcpmInstance,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.fetchInstanceBySubgraph(
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toBeNull();
    });

    it('returns staged-created instance when not in DB', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: VCPM_INSTANCE_ID,
        targetTable: ENTITY_NAMES.VcpmInstance,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          subgraphSystemId: SUBGRAPH_ID,
          vcpmDefinitionId: VCPM_DEF_ID,
        }),
      });
      const result = await fetcher.fetchInstanceBySubgraph(
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).not.toBeNull();
      expect(result!.systemId).toBe(VCPM_INSTANCE_ID);
      expect(result!.subgraphSystemId).toBe(SUBGRAPH_ID);
    });

    it('returns null for CREATE-then-DELETE tombstone', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: VCPM_INSTANCE_ID,
        targetTable: ENTITY_NAMES.VcpmInstance,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          subgraphSystemId: SUBGRAPH_ID,
          vcpmDefinitionId: VCPM_DEF_ID,
        }),
        validUntil: '2099-01-01T00:00:00.000Z',
      });
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: VCPM_INSTANCE_ID,
        targetTable: ENTITY_NAMES.VcpmInstance,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.fetchInstanceBySubgraph(
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toBeNull();
    });
  });

  // ── fetchCkvsByInstance ──────────────────────────────────────────────────────

  describe('fetchCkvsByInstance', () => {
    it('returns committed CKVs with their values rows', async () => {
      await seedVcpmInstance(ds);
      await seedKeyDef(ds);
      await seedVcpmCkv(ds, CKV_ID);
      await seedVcpmCkv(ds, CKV_ID + 1);
      await seedVcpmCkvValues(ds, CKV_ID);
      await seedVcpmCkvValues(ds, CKV_ID + 1);
      const results = await fetcher.fetchCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        null,
      );
      expect(results).toHaveLength(2);
      expect(results.every(r => r.values.length === 1)).toBe(true);
    });

    it('hides a staged-deleted CKV', async () => {
      await seedVcpmInstance(ds);
      await seedVcpmCkv(ds);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: CKV_ID,
        targetTable: ENTITY_NAMES.VcpmCkv,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const results = await fetcher.fetchCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        sessionId,
      );
      expect(results).toHaveLength(0);
    });

    it('includes a staged-created CKV', async () => {
      await seedVcpmInstance(ds);
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
      const results = await fetcher.fetchCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        sessionId,
      );
      expect(results).toHaveLength(1);
      expect(results[0].systemId).toBe(CKV_ID);
    });

    it('excludes a CREATE-then-DELETE tombstoned CKV', async () => {
      await seedVcpmInstance(ds);
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
        validUntil: '2099-01-01T00:00:00.000Z',
      });
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: CKV_ID,
        targetTable: ENTITY_NAMES.VcpmCkv,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const results = await fetcher.fetchCkvsByInstance(
        VCPM_INSTANCE_ID,
        SUBGRAPH_ID,
        sessionId,
      );
      expect(results).toHaveLength(0);
    });
  });

  // ── fetchCkv ────────────────────────────────────────────────────────────────

  describe('fetchCkv', () => {
    it('returns null when CKV does not exist', async () => {
      await seedVcpmInstance(ds);
      const result = await fetcher.fetchCkv(CKV_ID, SUBGRAPH_ID, null);
      expect(result).toBeNull();
    });

    it('returns CKV belonging to the subgraph', async () => {
      await seedVcpmInstance(ds);
      await seedKeyDef(ds);
      await seedVcpmCkv(ds);
      await seedVcpmCkvValues(ds);
      const result = await fetcher.fetchCkv(CKV_ID, SUBGRAPH_ID, null);
      expect(result).not.toBeNull();
      expect(result!.systemId).toBe(CKV_ID);
      expect(result!.values).toHaveLength(1);
      expect(result!.values[0].valueDefSystemId).toBe(VALUE_DEF_ID);
    });

    it('returns null when CKV is staged-deleted', async () => {
      await seedVcpmInstance(ds);
      await seedVcpmCkv(ds);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: CKV_ID,
        targetTable: ENTITY_NAMES.VcpmCkv,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.fetchCkv(CKV_ID, SUBGRAPH_ID, sessionId);
      expect(result).toBeNull();
    });

    it('returns staged-created CKV', async () => {
      await seedVcpmInstance(ds);
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
      const result = await fetcher.fetchCkv(CKV_ID, SUBGRAPH_ID, sessionId);
      expect(result).not.toBeNull();
      expect(result!.systemId).toBe(CKV_ID);
    });
  });

  // ── fetchParameterPayloads ───────────────────────────────────────────────────

  describe('fetchParameterPayloads', () => {
    it('returns all payloads for a CKV without filter', async () => {
      await seedVcpmInstance(ds);
      await seedVcpmCkv(ds);
      await seedVcpmParamDef(ds);
      await seedVcpmPayload(ds, PAYLOAD_ID);
      await ds.query(
        `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 2, 64, 'TYPE_A', 1, '[]', 0, ?)`,
        [PARAM_DEF_ID + 1, VCPM_DEF_ID],
      );
      await ds.query(
        `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
        [PAYLOAD_ID + 1, PARAM_DEF_ID + 1, CKV_ID, Buffer.alloc(4)],
      );
      const results = await fetcher.fetchParameterPayloads(
        CKV_ID,
        SUBGRAPH_ID,
        null,
      );
      expect(results).toHaveLength(2);
    });

    it('returns only matching payloads when paramSystemIds provided', async () => {
      await seedVcpmInstance(ds);
      await seedVcpmCkv(ds);
      await seedVcpmParamDef(ds);
      await seedVcpmPayload(ds, PAYLOAD_ID);
      await ds.query(
        `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 2, 64, 'TYPE_A', 1, '[]', 0, ?)`,
        [PARAM_DEF_ID + 1, VCPM_DEF_ID],
      );
      await ds.query(
        `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
        [PAYLOAD_ID + 1, PARAM_DEF_ID + 1, CKV_ID, Buffer.alloc(4)],
      );
      const results = await fetcher.fetchParameterPayloads(
        CKV_ID,
        SUBGRAPH_ID,
        null,
        [PARAM_DEF_ID],
      );
      expect(results).toHaveLength(1);
      expect(results[0].vcpmParameterSystemId).toBe(PARAM_DEF_ID);
    });

    it('reflects staged-created payload', async () => {
      await seedVcpmInstance(ds);
      await seedVcpmCkv(ds);
      await seedVcpmParamDef(ds);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: PAYLOAD_ID,
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          vcpmParameterSystemId: PARAM_DEF_ID,
          vcpmCkvSystemId: CKV_ID,
        }),
      });
      const results = await fetcher.fetchParameterPayloads(
        CKV_ID,
        SUBGRAPH_ID,
        sessionId,
      );
      expect(results.some(r => r.systemId === PAYLOAD_ID)).toBe(true);
    });

    it('hides staged-deleted payload', async () => {
      await seedVcpmInstance(ds);
      await seedVcpmCkv(ds);
      await seedVcpmParamDef(ds);
      await seedVcpmPayload(ds);
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: PAYLOAD_ID,
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const results = await fetcher.fetchParameterPayloads(
        CKV_ID,
        SUBGRAPH_ID,
        sessionId,
      );
      expect(results).toHaveLength(0);
    });
  });

  // ── fetchParameterDefinitions ────────────────────────────────────────────────

  describe('fetchParameterDefinitions', () => {
    it('returns empty array for empty input', async () => {
      const result = await fetcher.fetchParameterDefinitions([]);
      expect(result).toEqual([]);
    });

    it('returns definitions for given system IDs', async () => {
      await seedVcpmParamDef(ds);
      const result = await fetcher.fetchParameterDefinitions([PARAM_DEF_ID]);
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(PARAM_DEF_ID);
      expect(result[0].paramId).toBe(1);
      expect(result[0].isReadOnly).toBe(false);
      expect(result[0].elementsStructure).toBe('[]');
    });
  });
});
