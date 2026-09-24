/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {SOURCE, Subgraph} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmSubgraphRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/subgraph/subgraph.repository.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import {SubgraphPropertyDefinition} from '@arc/core';

const FILE_ID = 100;
const OTHER_FILE_ID = 200;
const SG_A = 0xa000_0001;
const SG_B = 0xa000_0002;
const KEY_A = 1001;
const KEY_B = 1002;
const VALUE_A = 1101;
const VALUE_B = 1102;
const OTHER_FILE_VALUE = 2101;

async function seedProjectAndFile(ds: DataSource): Promise<void> {
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

async function seedSubgraph(
  ds: DataSource,
  systemId: number,
  naturalId: number,
  name: string,
): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, ?, ?, 0, ?)`,
    [systemId, name, naturalId, FILE_ID],
  );
}

async function seedSgkv(
  ds: DataSource,
  sgkvSystemId: number,
  subgraphSystemId: number,
): Promise<void> {
  await ds.query(
    `INSERT INTO sgkv (system_id, subgraph_system_id) VALUES (?, ?)`,
    [sgkvSystemId, subgraphSystemId],
  );
}

async function seedVcpmData(
  ds: DataSource,
  subgraphSystemId: number,
): Promise<void> {
  await ds.query(
    `INSERT INTO vcpm_module_definitions
       (system_id, module_definition_id, name, file_system_id)
     VALUES (800, 1, 'vcpm', ?)`,
    [FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_parameter_definitions
       (system_id, param_id, max_size, pid_type, is_persistent, is_read_only,
        vcpm_module_definition_system_id)
     VALUES (801, 1, 4, 'UINT32', 0, 0, 800)`,
  );
  await ds.query(
    `INSERT INTO vcpm_instances
       (system_id, subgraph_system_id, vcpm_definition_id)
     VALUES (802, ?, 800)`,
    [subgraphSystemId],
  );
  await ds.query(
    `INSERT INTO vcpm_ckv (system_id, vcpm_instance_system_id)
     VALUES (803, 802)`,
  );
  await ds.query(
    `INSERT INTO vcpm_parameter_payload
       (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload)
     VALUES (804, 801, 803, x'01')`,
  );
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId = 0,
): TypeOrmSubgraphRepository {
  const writer = new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
  const uow = {
    getWriteContext: () => ({
      session: {
        sessionId,
        fileSystemId: FILE_ID,
        mode: SESSION_MODE.Designer,
        projectId: '1',
      },
      groupId: 'test-group',
    }),
  } as any;
  return new TypeOrmSubgraphRepository(writer, manager, uow);
}

describe('TypeOrmSubgraphRepository (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;

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
    await seedSubgraph(ds, SG_A, 1, 'sg-a');
    await seedSubgraph(ds, SG_B, 2, 'sg-b');
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    if (qr?.isReleased === false) {
      await qr.release();
    }
  });

  // ── getSgkvs ────────────────────────────────────────────────────────────────

  describe('getSgkvs', () => {
    it('returns [] when sgSystemIds is empty', async () => {
      expect(await makeRepo(qr.manager).getSgkvs(FILE_ID, [])).toEqual([]);
    });

    it('groups rows by sgkvSystemId with keyValues', async () => {
      await seedSgkv(ds, 500, SG_A);
      await ds.query(
        `INSERT OR IGNORE INTO arc_keys (system_id, name, key_id, file_system_id) VALUES (1, 'K1', 256, ?)`,
        [FILE_ID],
      );
      await ds.query(
        `INSERT OR IGNORE INTO arc_values (system_id, name, value_id, keys_system_id) VALUES (10, 'V10', 1, 1)`,
      );
      await ds.query(
        `INSERT INTO sgkv_values (sgkv_system_id, value_def_system_id) VALUES (500, 10)`,
      );

      const result = await makeRepo(qr.manager).getSgkvs(FILE_ID, [SG_A]);
      expect(result).toHaveLength(1);
      expect(result[0].sgSystemId).toBe(SG_A);
      expect(result[0].sgkvSystemId).toBe(500);
      expect(result[0].keyValues).toEqual([
        {keyDefSystemId: 1, valueDefSystemId: 10},
      ]);
    });

    it('returns empty keyValues for SGKV with no linked arc_values', async () => {
      await seedSgkv(ds, 500, SG_A);
      const result = await makeRepo(qr.manager).getSgkvs(FILE_ID, [SG_A]);
      expect(result).toHaveLength(1);
      expect(result[0].keyValues).toEqual([]);
    });

    it('scopes to fileSystemId', async () => {
      await getTestRepository(ArcDbFileSchema).save({
        systemId: 200,
        projectSystemId: 1,
        fileName: 'f2.acdb',
        description: '',
        metadata: '{}',
        isTarget: false,
        lastReservedId: 0,
      });
      await ds.query(
        `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (9999, 'sg-x', 99, 0, 200)`,
      );
      await ds.query(
        `INSERT INTO sgkv (system_id, subgraph_system_id) VALUES (700, 9999)`,
      );

      const result = await makeRepo(qr.manager).getSgkvs(FILE_ID, [SG_A, 9999]);
      expect(result.map(s => s.sgkvSystemId)).not.toContain(700);
    });
  });

  describe('resolveKeyValues', () => {
    it('resolves arbitrary same-file values in one deterministic batch', async () => {
      await getTestRepository(ArcDbFileSchema).save({
        systemId: OTHER_FILE_ID,
        projectSystemId: 1,
        fileName: 'f2.acdb',
        description: '',
        metadata: '{}',
        isTarget: false,
        lastReservedId: 0,
      });
      await ds.query(
        `INSERT INTO arc_keys (system_id, name, key_id, file_system_id)
         VALUES (?, 'K1', 1, ?), (?, 'K2', 2, ?), (?, 'K-other', 3, ?)`,
        [KEY_A, FILE_ID, KEY_B, FILE_ID, 2001, OTHER_FILE_ID],
      );
      await ds.query(
        `INSERT INTO arc_values (system_id, name, value_id, keys_system_id)
         VALUES (?, 'V1', 1, ?), (?, 'V2', 2, ?), (?, 'V-other', 3, ?)`,
        [VALUE_A, KEY_A, VALUE_B, KEY_B, OTHER_FILE_VALUE, 2001],
      );

      const repository = makeRepo(qr.manager);

      await expect(
        repository.resolveKeyValues(FILE_ID, [VALUE_B, VALUE_A, VALUE_A]),
      ).resolves.toEqual([
        {keyDefSystemId: KEY_A, valueDefSystemId: VALUE_A},
        {keyDefSystemId: KEY_B, valueDefSystemId: VALUE_B},
      ]);
      await expect(
        repository.resolveKeyValues(FILE_ID, [OTHER_FILE_VALUE, 999999]),
      ).resolves.toEqual([]);
      await expect(repository.resolveKeyValues(FILE_ID, [])).resolves.toEqual(
        [],
      );
    });

    it('uses effective session value-to-key relationships', async () => {
      await ds.query(
        `INSERT INTO arc_keys (system_id, name, key_id, file_system_id)
         VALUES (?, 'K1', 1, ?), (?, 'K2', 2, ?)`,
        [KEY_A, FILE_ID, KEY_B, FILE_ID],
      );
      await ds.query(
        `INSERT INTO arc_values (system_id, name, value_id, keys_system_id)
         VALUES (?, 'V1', 1, ?)`,
        [VALUE_A, KEY_A],
      );
      const sessionId = await seedSession(ds);
      await new PendingChangeWriter(
        new EditActionsQueryService(qr.manager),
        new PendingChangeCache(),
      ).writeDelta(
        {
          targetTable: ENTITY_NAMES.ValueDefinition,
          targetSystemId: VALUE_A,
          aggregateId: VALUE_A,
          delta: {keySystemId: KEY_B},
        },
        sessionId,
        'definition-update',
        qr.manager,
      );

      await expect(
        makeRepo(qr.manager, sessionId).resolveKeyValues(FILE_ID, [VALUE_A]),
      ).resolves.toEqual([{keyDefSystemId: KEY_B, valueDefSystemId: VALUE_A}]);
    });
  });

  describe('getPropertyDefinitions', () => {
    it('returns overlaid subgraph property definitions as domain entities', async () => {
      await ds.query(
        `INSERT INTO subgraph_property_definitions
          (system_id, file_system_id, property_id, name, description, max_size, property_type, elements_structure, is_voice)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          900,
          FILE_ID,
          0x08_00_10_12,
          'Subgraph Property',
          'Base description',
          4,
          'SPF',
          '{}',
          1,
        ],
      );
      const sessionId = await seedSession(ds);
      await new PendingChangeWriter(
        new EditActionsQueryService(qr.manager),
        new PendingChangeCache(),
      ).writeDelta(
        {
          targetTable: ENTITY_NAMES.SubgraphPropertyDefinition,
          targetSystemId: 900,
          aggregateId: 900,
          delta: {name: 'Effective Subgraph Property'},
        },
        sessionId,
        'definition-update',
        qr.manager,
      );

      const definitions = await makeRepo(
        qr.manager,
        sessionId,
      ).getPropertyDefinitions(FILE_ID);

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toBeInstanceOf(SubgraphPropertyDefinition);
      expect(definitions[0]).toMatchObject({
        systemId: 900,
        naturalId: 0x08_00_10_12,
        name: 'Effective Subgraph Property',
        type: 'SPF',
        isVoice: true,
      });
    });
  });

  describe('createSubgraph', () => {
    it('uses unique SubgraphPropertyData IDs for multiple properties', async () => {
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      const subgraphSystemId = 9001;

      await qr.startTransaction();
      await repo.createSubgraph(
        new Subgraph({
          systemId: subgraphSystemId,
          naturalId: 91,
          subgraphId: 91,
          name: 'session-created-with-properties',
          isImported: false,
          isExported: false,
          fileSystemId: FILE_ID,
          sgkvs: [],
          properties: [
            {
              systemId: 9000,
              propertyDefinitionSystemId: 5001,
              getPayloadCopy: () => new Uint8Array([1]),
            },
            {
              systemId: 9001,
              propertyDefinitionSystemId: 5002,
              getPayloadCopy: () => new Uint8Array([2]),
            },
          ] as any,
        }),
      );
      await qr.commitTransaction();

      const rows = await ds.query(
        `SELECT target_system_id, aggregate_id, target_table, field_path
         FROM edit_actions
         WHERE session_id = ? AND target_table = 'SubgraphPropertyData'
         ORDER BY target_system_id`,
        [sessionId],
      );

      expect(rows).toEqual([
        {
          target_system_id: 9000,
          aggregate_id: subgraphSystemId,
          target_table: 'SubgraphPropertyData',
          field_path: '$',
        },
        {
          target_system_id: 9001,
          aggregate_id: subgraphSystemId,
          target_table: 'SubgraphPropertyData',
          field_path: '$',
        },
      ]);
    });
  });

  // ── findByIds ────────────────────────────────────────────────────────────────

  describe('findByIds', () => {
    it('returns [] for empty input', async () => {
      expect(await makeRepo(qr.manager).findByIds(FILE_ID, [])).toEqual([]);
    });

    it('returns hydrated Subgraph objects for matching systemIds', async () => {
      const result = await makeRepo(qr.manager).findByIds(FILE_ID, [SG_A]);
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(SG_A);
      expect(result[0].name).toBe('sg-a');
    });

    it('silently omits missing IDs', async () => {
      const result = await makeRepo(qr.manager).findByIds(FILE_ID, [
        SG_A,
        9999,
      ]);
      expect(result.map(s => s.systemId)).toEqual([SG_A]);
    });

    it('includes only the requested session-created subgraph', async () => {
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      await qr.startTransaction();
      await repo.createSubgraph(
        new Subgraph({
          systemId: 9001,
          subgraphId: 91,
          name: 'session-created',
          isExported: false,
          fileSystemId: FILE_ID,
          sgkvs: [],
        }),
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      await expect(repo.findByIds(FILE_ID, [9001])).resolves.toEqual([
        expect.objectContaining({systemId: 9001}),
      ]);
      await expect(repo.findByIds(FILE_ID, [9002])).resolves.toEqual([]);
    });
  });

  // ── findChangedInSession ─────────────────────────────────────────────────────

  describe('findChangedInSession', () => {
    it('returns Subgraphs that have any active edit_action in the current session', async () => {
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'Subgraph', 'CREATE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, SG_A, SG_A],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added.map(s => s.systemId)).toContain(SG_A);
      expect(result.deleted).toEqual([]);
    });

    it('includes edits regardless of source', async () => {
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'Subgraph', 'CREATE', NULL, '{}', 'AUTO_ROUTING', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [sessionId, SG_A, SG_A],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added.map(s => s.systemId)).toContain(SG_A);
      expect(result.deleted).toEqual([]);
    });

    it('excludes superseded edit_actions (valid_until non-null)', async () => {
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'Subgraph', 'CREATE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), datetime('now'))`,
        [sessionId, SG_A, SG_A],
      );
      expect(
        await makeRepo(qr.manager, sessionId).findChangedInSession(FILE_ID),
      ).toEqual({added: [], deleted: []});
    });

    it('puts DELETE-operation targets in the deleted bucket', async () => {
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'Subgraph', 'DELETE', NULL, NULL, 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, SG_A, SG_A],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added).toEqual([]);
      expect(result.deleted.map(s => s.systemId)).toEqual([SG_A]);
    });

    it('excludes UPDATE-operation edit_actions from both buckets', async () => {
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'Subgraph', 'UPDATE', 'name', '"renamed"', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, SG_A, SG_A],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result).toEqual({added: [], deleted: []});
    });
  });

  describe('deleteSubgraph', () => {
    it('stages deletes for the effective VCPM hierarchy before the subgraph', async () => {
      const sessionId = await seedSession(ds);
      await seedVcpmData(ds, SG_A);

      await makeRepo(qr.manager, sessionId).deleteSubgraph(SG_A, FILE_ID);

      const actions = await ds.query<
        Array<{targetSystemId: number; targetTable: string}>
      >(
        `SELECT target_system_id AS targetSystemId, target_table AS targetTable
         FROM edit_actions
         WHERE session_id = ?`,
        [sessionId],
      );
      expect(actions).toEqual(
        expect.arrayContaining([
          {targetSystemId: 804, targetTable: ENTITY_NAMES.VcpmParameterPayload},
          {targetSystemId: 803, targetTable: ENTITY_NAMES.VcpmCkv},
          {targetSystemId: 802, targetTable: ENTITY_NAMES.VcpmInstance},
          {targetSystemId: SG_A, targetTable: ENTITY_NAMES.Subgraph},
        ]),
      );
    });
  });
});
