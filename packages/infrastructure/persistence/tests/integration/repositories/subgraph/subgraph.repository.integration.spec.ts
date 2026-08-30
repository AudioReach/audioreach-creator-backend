/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
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

const FILE_ID = 100;
const SG_A = 0xa000_0001;
const SG_B = 0xa000_0002;

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
  subgraphId: number,
  name: string,
): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, ?, ?, 0, ?)`,
    [systemId, name, subgraphId, FILE_ID],
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
  });

  // ── findIsMdfInScope ─────────────────────────────────────────────────────────

  describe('findIsMdfInScope', () => {
    it('returns [] for empty input', async () => {
      expect(await makeRepo(qr.manager).findIsMdfInScope(FILE_ID, [])).toEqual(
        [],
      );
    });

    it('returns SGs with exactly IPC_TX + IPC_RX modules', async () => {
      const SG_MDF = SG_A + 100;
      await ds.query(
        `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'mdf', 99, 0, ?)`,
        [SG_MDF, FILE_ID],
      );
      // Seed a processor_definition required by spf_module_definitions FK
      await ds.query(
        `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (1, 1, 'proc', ?)`,
        [FILE_ID],
      );
      await ds.query(
        `INSERT INTO containers (system_id, container_id, file_system_id) VALUES (800, 1, ?)`,
        [FILE_ID],
      );
      await ds.query(
        `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, processor_system_id, file_system_id) VALUES (9001, ${0x7001184}, 'IPC_TX', 1, ?)`,
        [FILE_ID],
      );
      await ds.query(
        `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, processor_system_id, file_system_id) VALUES (9002, ${0x7001185}, 'IPC_RX', 1, ?)`,
        [FILE_ID],
      );
      // spf_modules.system_id must exist in nodes (1:1 FK)
      await ds.query(
        `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (901, 'module', NULL, ?)`,
        [FILE_ID],
      );
      await ds.query(
        `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (902, 'module', NULL, ?)`,
        [FILE_ID],
      );
      await ds.query(
        `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (901, 1, 'm1', 9001, 800, ?, ?)`,
        [SG_MDF, FILE_ID],
      );
      await ds.query(
        `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (902, 2, 'm2', 9002, 800, ?, ?)`,
        [SG_MDF, FILE_ID],
      );

      const result = await makeRepo(qr.manager).findIsMdfInScope(FILE_ID, [
        SG_A,
        SG_MDF,
      ]);
      expect(result.map(s => s.systemId)).toEqual([SG_MDF]);
    });

    it('excludes SGs that match IDs but are not MDF', async () => {
      const result = await makeRepo(qr.manager).findIsMdfInScope(FILE_ID, [
        SG_A,
        SG_B,
      ]);
      expect(result).toEqual([]);
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
});
