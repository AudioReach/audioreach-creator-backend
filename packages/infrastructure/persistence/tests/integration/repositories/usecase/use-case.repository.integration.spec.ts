/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  USECASE_TYPE,
  SOURCE,
  CHANGE_OPERATION,
  READ_MODE,
  type IdGenerationPort,
} from '@arc/core';
import {UseCase} from '@arc/core';
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
import {TypeOrmUsecaseRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/usecase/use-case.repository.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
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
  afterEach,
} from '@jest/globals';

const FILE_ID = 100;
const SG_ID_1 = 500;
const SG_ID_2 = 501;
let nextRelationshipId = 20_000;
let nextGeneratedId = 30_000;

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

async function seedSubgraph(ds: DataSource, sgId: number): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg${sgId}', ${sgId}, 0, ?)`,
    [sgId, FILE_ID],
  );
}

async function seedUseCase(
  ds: DataSource,
  ucId: number,
  aliasId: number,
  alias: string,
  type: string,
): Promise<void> {
  await ds.query(
    `INSERT INTO use_cases (system_id, alias_id, alias, type, file_system_id) VALUES (?, ?, ?, ?, ?)`,
    [ucId, aliasId, alias, type, FILE_ID],
  );
}

async function linkSg(
  ds: DataSource,
  ucId: number,
  sgId: number,
): Promise<number> {
  const systemId = nextRelationshipId++;
  await ds.query(
    `INSERT INTO use_case_subgraphs (system_id, usecase_system_id, subgraph_system_id) VALUES (?, ?, ?)`,
    [systemId, ucId, sgId],
  );
  return systemId;
}

async function linkPair(
  ds: DataSource,
  ucId: number,
  srcSg: number,
  destSg: number,
): Promise<number> {
  const systemId = nextRelationshipId++;
  await ds.query(
    `INSERT INTO use_case_subgraph_pairs (system_id, usecase_system_id, source_subgraph_system_id, dest_subgraph_system_id) VALUES (?, ?, ?, ?)`,
    [systemId, ucId, srcSg, destSg],
  );
  return systemId;
}

function makeWriter(manager: QueryRunner['manager']): PendingChangeWriter {
  return new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
}

function makeUow(sessionId: number) {
  return {
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
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId: number,
): TypeOrmUsecaseRepository {
  const idGeneration: IdGenerationPort = {
    getNextId: async fileId => {
      expect(fileId).toBe(FILE_ID);
      return nextGeneratedId++;
    },
    reserveBlock: async () => nextGeneratedId,
    persistLastUsedId: async () => undefined,
  };
  return new TypeOrmUsecaseRepository(
    makeWriter(manager),
    manager,
    makeUow(sessionId),
    idGeneration,
  );
}

describe('TypeOrmUsecaseRepository (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let sessionId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    nextRelationshipId = 20_000;
    nextGeneratedId = 30_000;
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    await seedSubgraph(ds, SG_ID_1);
    await seedSubgraph(ds, SG_ID_2);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    if (qr?.isReleased === false) {
      await qr.release();
    }
  });

  // ── findBySystemIds ──────────────────────────────────────────────────────────

  describe('findBySystemIds', () => {
    it('returns [] when ucSystemIds is empty', async () => {
      const repo = makeRepo(qr.manager, sessionId);
      expect(await repo.findBySystemIds(FILE_ID, [])).toEqual([]);
    });

    it('returns UCs matching provided systemIds', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await seedUseCase(ds, 1001, 2, 'uc-b', USECASE_TYPE.Island);
      const repo = makeRepo(qr.manager, sessionId);
      const result = await repo.findBySystemIds(FILE_ID, [1000]);
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(1000);
      expect(result[0].type).toBe(USECASE_TYPE.Linked);
    });

    it('includes only the requested session-created usecase', async () => {
      const repo = makeRepo(qr.manager, sessionId);
      await qr.startTransaction();
      await repo.create(
        new UseCase({
          systemId: 9001,
          fileSystemId: FILE_ID,
          alias: 'session-created',
          keyVector: {valueSystemIds: []},
          subgraphSystemIds: [],
          subgraphPairs: [],
        }),
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      await expect(repo.findBySystemIds(FILE_ID, [9001])).resolves.toEqual([
        expect.objectContaining({systemId: 9001}),
      ]);
      await expect(repo.findBySystemIds(FILE_ID, [9002])).resolves.toEqual([]);
    });

    it('hydrates session-created GKV values and applies their DELETE payload', async () => {
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 9001,
        fileSystemId: FILE_ID,
        alias: 'gkv-overlay',
        keyVector: {valueSystemIds: [7001, 7002]},
        subgraphSystemIds: [],
        subgraphPairs: [],
      });
      await qr.startTransaction();
      const result = await repo.create(uc, {source: SOURCE.AutoRouting});
      await qr.commitTransaction();

      expect(
        (await repo.findBySystemIds(FILE_ID, [uc.systemId]))[0].keyVector
          .valueSystemIds,
      ).toEqual([7001, 7002]);

      await qr.startTransaction();
      await makeWriter(qr.manager).writeDelete(
        {
          targetTable: ENTITY_NAMES.UsecaseGkvValues,
          targetSystemId: 9003,
          aggregateId: uc.systemId,
          payload: {usecaseSystemId: uc.systemId, valueDefSystemId: 7001},
          source: SOURCE.AutoRouting,
        },
        sessionId,
        'test-group',
        qr.manager,
      );
      await qr.commitTransaction();

      expect(
        (await repo.findBySystemIds(FILE_ID, [uc.systemId]))[0].keyVector
          .valueSystemIds,
      ).toEqual([7002]);
    });

    it('hydrates subgraphSystemIds and subgraphPairs', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await linkSg(ds, 1000, SG_ID_1);
      await linkSg(ds, 1000, SG_ID_2);
      await linkPair(ds, 1000, SG_ID_1, SG_ID_2);
      const repo = makeRepo(qr.manager, sessionId);
      const [uc] = await repo.findBySystemIds(FILE_ID, [1000]);
      expect(uc.subgraphSystemIds.sort()).toEqual([SG_ID_1, SG_ID_2]);
      expect(uc.subgraphPairs).toEqual([
        {sourceSubgraphSystemId: SG_ID_1, destSubgraphSystemId: SG_ID_2},
      ]);
    });

    it('Committed mode returns base table state ignoring session edits', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      const membershipSystemId = await linkSg(ds, 1000, SG_ID_1);
      // Stage a DELETE on the UseCaseSubgraph junction
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'UseCaseSubgraph', 'DELETE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1000, membershipSystemId],
      );
      const repo = makeRepo(qr.manager, sessionId);
      const committed = await repo.findBySystemIds(FILE_ID, [1000], {
        readMode: READ_MODE.Committed,
      });
      expect(committed[0].subgraphSystemIds).toContain(SG_ID_1);
    });

    it('applies relationship DELETE actions by internal row systemId', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await linkSg(ds, 1000, SG_ID_1);
      const repo = makeRepo(qr.manager, sessionId);

      await qr.startTransaction();
      await repo.applyStructuralChange(
        1000,
        {removedSgSystemIds: [SG_ID_1]},
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      const [overlaid] = await repo.findBySystemIds(FILE_ID, [1000]);
      expect(overlaid.subgraphSystemIds).toEqual([]);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all UCs on the file', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await seedUseCase(ds, 1001, 2, 'uc-b', USECASE_TYPE.Ec);
      const repo = makeRepo(qr.manager, sessionId);
      const result = await repo.findAll(FILE_ID);
      expect(result.map(u => u.systemId).sort()).toEqual([1000, 1001]);
    });
  });

  // ── findWithActiveEdits ──────────────────────────────────────────────────────

  describe('findWithActiveManualEdits', () => {
    it('returns UCs with active MANUAL source edit_actions', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'UseCase', 'CREATE', NULL, '{}', 'MANUAL', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1000, 1000],
      );
      const repo = makeRepo(qr.manager, sessionId);
      const result = await repo.findWithActiveManualEdits(FILE_ID);
      expect(result).toEqual([
        expect.objectContaining({
          usecase: expect.objectContaining({systemId: 1000}),
          operation: CHANGE_OPERATION.Create,
          referencedComponents: null,
        }),
      ]);
    });

    it('excludes AUTO_ROUTING edits', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'UseCase', 'CREATE', NULL, '{}', 'AUTO_ROUTING', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1000, 1000],
      );
      const repo = makeRepo(qr.manager, sessionId);
      expect(await repo.findWithActiveManualEdits(FILE_ID)).toEqual([]);
    });

    it('preserves each manual action metadata and hydrated usecase', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'UseCase', 'UPDATE', NULL, ?, 'MANUAL', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [
          sessionId,
          1000,
          1000,
          JSON.stringify({
            referencedComponents: {
              sgSystemIds: [SG_ID_1],
              dataLinkSystemIds: [600],
              controlLinkSystemIds: [],
            },
          }),
        ],
      );

      const [result] = await makeRepo(
        qr.manager,
        sessionId,
      ).findWithActiveManualEdits(FILE_ID);
      expect(result).toEqual(
        expect.objectContaining({
          changeId: expect.any(Number),
          operation: CHANGE_OPERATION.Update,
          usecase: expect.objectContaining({systemId: 1000}),
          referencedComponents: {
            sgSystemIds: [SG_ID_1],
            dataLinkSystemIds: [600],
            controlLinkSystemIds: [],
          },
        }),
      );
    });

    it('retains a manual action when its effective usecase is missing', async () => {
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'UseCase', 'UPDATE', NULL, '{}', 'MANUAL', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 9999, 9999],
      );

      await expect(
        makeRepo(qr.manager, sessionId).findWithActiveManualEdits(FILE_ID),
      ).resolves.toEqual([
        expect.objectContaining({
          changeId: expect.any(Number),
          operation: CHANGE_OPERATION.Update,
          usecase: null,
          referencedComponents: null,
        }),
      ]);
    });

    it('excludes superseded edits', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'UseCase', 'CREATE', NULL, '{}', 'MANUAL', 'UNSTAGED', NULL, datetime('now'), datetime('now'))`,
        [sessionId, 1000, 1000],
      );
      const repo = makeRepo(qr.manager, sessionId);
      expect(await repo.findWithActiveManualEdits(FILE_ID)).toEqual([]);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('emits CREATE edit_actions for UseCase + SG junctions + pair junctions', async () => {
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 1000,
        fileSystemId: FILE_ID,
        aliasId: 1,
        alias: 'uc-a',
        type: USECASE_TYPE.Linked,
        subgraphSystemIds: [SG_ID_1, SG_ID_2],
        subgraphPairs: [
          {sourceSubgraphSystemId: SG_ID_1, destSubgraphSystemId: SG_ID_2},
        ],
        keyVector: {valueSystemIds: []},
      });
      const result = await repo.create(uc, {source: SOURCE.AutoRouting});
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT change_id, target_system_id, target_table, operation, source, change_status FROM edit_actions WHERE session_id = ? AND aggregate_id = ? ORDER BY change_id`,
        [sessionId, 1000],
      );
      expect(rows.map((r: any) => r.target_table).sort()).toEqual([
        'UseCase',
        'UseCaseSubgraph',
        'UseCaseSubgraph',
        'UseCaseSubgraphPair',
      ]);
      for (const r of rows) {
        expect(r.operation).toBe('CREATE');
        expect(r.source).toBe('AUTO_ROUTING');
        expect(r.change_status).toBe('UNSTAGED');
      }
      const relationshipIds = rows
        .filter((r: any) => r.target_table !== 'UseCase')
        .map((r: any) => r.target_system_id);
      expect(new Set(relationshipIds).size).toBe(3);
      expect(relationshipIds).not.toContain(SG_ID_1);
      expect(relationshipIds).not.toContain(SG_ID_2);
      const rootRow = rows.find((row: any) => row.target_table === 'UseCase');
      expect(result).toEqual({systemId: 1000, changeId: rootRow.change_id});
    });

    it('creates distinct edit targets when usecases share an SG and pair', async () => {
      const pair = {
        sourceSubgraphSystemId: SG_ID_1,
        destSubgraphSystemId: SG_ID_2,
      };
      const repo = makeRepo(qr.manager, sessionId);
      await qr.startTransaction();
      await repo.create(
        new UseCase({
          systemId: 1000,
          fileSystemId: FILE_ID,
          alias: 'uc-a',
          keyVector: {valueSystemIds: []},
          subgraphSystemIds: [SG_ID_1, SG_ID_2],
          subgraphPairs: [pair],
        }),
        {source: SOURCE.AutoRouting},
      );
      await repo.create(
        new UseCase({
          systemId: 1001,
          fileSystemId: FILE_ID,
          alias: 'uc-b',
          keyVector: {valueSystemIds: []},
          subgraphSystemIds: [SG_ID_1, SG_ID_2],
          subgraphPairs: [pair],
        }),
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT target_system_id FROM edit_actions
          WHERE session_id = ? AND target_table IN ('UseCaseSubgraph', 'UseCaseSubgraphPair')`,
        [sessionId],
      );
      expect(rows).toHaveLength(6);
      expect(new Set(rows.map(r => r.target_system_id)).size).toBe(6);
    });

    it('stages GKV relationship actions in the usecase change group', async () => {
      const repo = makeRepo(qr.manager, sessionId);
      await qr.startTransaction();
      await repo.create(
        new UseCase({
          systemId: 1000,
          fileSystemId: FILE_ID,
          alias: 'gkv-actions',
          keyVector: {valueSystemIds: [7001, 7002]},
          subgraphSystemIds: [SG_ID_1, SG_ID_2],
          subgraphPairs: [
            {
              sourceSubgraphSystemId: SG_ID_1,
              destSubgraphSystemId: SG_ID_2,
            },
          ],
        }),
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      const rows: Array<{
        target_table: string;
        target_system_id: number;
        group_id: string;
        new_value: string;
      }> = await ds.query(
        `SELECT target_table, target_system_id, group_id, new_value
           FROM edit_actions WHERE session_id = ? AND aggregate_id = ?`,
        [sessionId, 1000],
      );
      const gkvRows = rows.filter(
        row => row.target_table === 'UsecaseGkvValues',
      );
      expect(rows).toHaveLength(6);
      expect(gkvRows).toHaveLength(2);
      expect(new Set(rows.map(row => row.group_id))).toEqual(
        new Set(['test-group']),
      );
      expect(new Set(rows.map(row => row.target_system_id)).size).toBe(6);
      expect(gkvRows.map(row => JSON.parse(row.new_value))).toEqual(
        expect.arrayContaining([
          {usecaseSystemId: 1000, valueDefSystemId: 7001},
          {usecaseSystemId: 1000, valueDefSystemId: 7002},
        ]),
      );
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('emits DELETE edit_action on UseCase', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 1000,
        fileSystemId: FILE_ID,
        aliasId: 1,
        alias: 'uc-a',
        type: USECASE_TYPE.Linked,
        subgraphSystemIds: [],
        subgraphPairs: [],
        keyVector: {valueSystemIds: []},
      });
      const result = await repo.delete(uc.systemId, {
        source: SOURCE.AutoRouting,
      });
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT change_id, operation, source FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND target_table = 'UseCase'`,
        [sessionId, 1000],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].operation).toBe('DELETE');
      expect(rows[0].source).toBe('AUTO_ROUTING');
      expect(result).toEqual({systemId: 1000, changeId: rows[0].change_id});
    });

    it('returns null when the edit is deferred to the pending-change cache', async () => {
      await qr.startTransaction();
      const result = await makeRepo(qr.manager, sessionId).delete(1000, {
        cache: true,
        source: SOURCE.AutoRouting,
      });
      await qr.commitTransaction();

      expect(result).toBeNull();
      const rows: any[] = await ds.query(
        `SELECT change_id FROM edit_actions WHERE session_id = ? AND target_system_id = ?`,
        [sessionId, 1000],
      );
      expect(rows).toEqual([]);
    });
  });

  // ── changeType ───────────────────────────────────────────────────────────────

  describe('changeType', () => {
    it('emits UPDATE delta with new type on UseCase', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 1000,
        fileSystemId: FILE_ID,
        aliasId: 1,
        alias: 'uc-a',
        type: USECASE_TYPE.Linked,
        subgraphSystemIds: [],
        subgraphPairs: [],
        keyVector: {valueSystemIds: []},
      });
      const result = await repo.changeType(uc.systemId, USECASE_TYPE.Island, {
        source: SOURCE.AutoRouting,
      });
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT change_id, operation, source, new_value FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND target_table = 'UseCase'`,
        [sessionId, 1000],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].operation).toBe('UPDATE');
      expect(JSON.parse(rows[0].new_value).type).toBe(USECASE_TYPE.Island);
      expect(result).toEqual({systemId: 1000, changeId: rows[0].change_id});
    });
  });

  // ── reverseDirection ─────────────────────────────────────────────────────────

  describe('reverseDirection', () => {
    it('emits UPDATE on UseCaseSubgraphPair with reversed source/dest', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Island);
      await linkSg(ds, 1000, SG_ID_1);
      await linkSg(ds, 1000, SG_ID_2);
      const pairSystemId = await linkPair(ds, 1000, SG_ID_1, SG_ID_2);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 1000,
        fileSystemId: FILE_ID,
        aliasId: 1,
        alias: 'uc-a',
        type: USECASE_TYPE.Island,
        subgraphSystemIds: [SG_ID_1, SG_ID_2],
        subgraphPairs: [
          {sourceSubgraphSystemId: SG_ID_1, destSubgraphSystemId: SG_ID_2},
        ],
        keyVector: {valueSystemIds: []},
      });
      const result = await repo.reverseSgPairDirection(uc.systemId, SG_ID_1, SG_ID_2, {
        source: SOURCE.AutoRouting,
      });
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT target_system_id, operation, field_path, new_value FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND target_table = 'UseCaseSubgraphPair'`,
        [sessionId, 1000],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].target_system_id).toBe(pairSystemId);
      expect(rows[0].operation).toBe('UPDATE');
      expect(rows[0].field_path).toBe('direction');
      const nv = JSON.parse(rows[0].new_value);
      expect(nv.sourceSubgraphSystemId).toBe(SG_ID_2);
      expect(nv.destSubgraphSystemId).toBe(SG_ID_1);

      const rootRows: any[] = await ds.query(
        `SELECT change_id, new_value FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND target_table = 'UseCase'`,
        [sessionId, 1000],
      );
      expect(rootRows).toEqual([
        expect.objectContaining({new_value: '{}'}),
      ]);
      expect(result).toEqual({systemId: 1000, changeId: rootRows[0].change_id});

      const [overlaid] = await repo.findBySystemIds(FILE_ID, [1000]);
      expect(overlaid.subgraphPairs).toEqual([
        {sourceSubgraphSystemId: SG_ID_2, destSubgraphSystemId: SG_ID_1},
      ]);
    });

    it('returns null without a root marker when the reversal is deferred', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Island);
      await linkPair(ds, 1000, SG_ID_1, SG_ID_2);
      await qr.startTransaction();

      const result = await makeRepo(qr.manager, sessionId).reverseSgPairDirection(
        1000,
        SG_ID_1,
        SG_ID_2,
        {cache: true, source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      expect(result).toBeNull();
      const rows: any[] = await ds.query(
        `SELECT change_id FROM edit_actions WHERE session_id = ? AND aggregate_id = ?`,
        [sessionId, 1000],
      );
      expect(rows).toEqual([]);
    });
  });

  // ── applyStructuralChange ────────────────────────────────────────────────────

  describe('applyStructuralChange', () => {
    it('emits a root marker for structural-only changes', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await linkSg(ds, 1000, SG_ID_1);
      await linkPair(ds, 1000, SG_ID_1, SG_ID_2);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 1000,
        fileSystemId: FILE_ID,
        aliasId: 1,
        alias: 'uc-a',
        type: USECASE_TYPE.Linked,
        subgraphSystemIds: [],
        subgraphPairs: [],
        keyVector: {valueSystemIds: []},
      });
      const result = await repo.applyStructuralChange(
        uc.systemId,
        {
          removedPairs: [
            {sourceSubgraphSystemId: SG_ID_1, destSubgraphSystemId: SG_ID_2},
          ],
          removedSgSystemIds: [SG_ID_1],
          addedSgSystemIds: [SG_ID_2],
          addedPairs: [
            {sourceSubgraphSystemId: SG_ID_2, destSubgraphSystemId: SG_ID_1},
          ],
        },
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT change_id, target_table, operation, new_value FROM edit_actions WHERE session_id = ? AND aggregate_id = ? ORDER BY change_id`,
        [sessionId, 1000],
      );
      expect(rows.map((r: any) => `${r.target_table}:${r.operation}`)).toEqual([
        'UseCaseSubgraphPair:DELETE',
        'UseCaseSubgraph:DELETE',
        'UseCaseSubgraph:CREATE',
        'UseCaseSubgraphPair:CREATE',
        'UseCase:UPDATE',
      ]);
      const rootRow = rows.find((row: any) => row.target_table === 'UseCase');
      expect(rootRow.new_value).toBe('{}');
      expect(result).toEqual({systemId: 1000, changeId: rootRow.change_id});
    });

    it('returns null without emitting a marker for a structural no-op', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await qr.startTransaction();
      const result = await makeRepo(qr.manager, sessionId).applyStructuralChange(
        1000,
        {},
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      expect(result).toBeNull();
      const rows: any[] = await ds.query(
        `SELECT change_id FROM edit_actions WHERE session_id = ? AND aggregate_id = ?`,
        [sessionId, 1000],
      );
      expect(rows).toEqual([]);
    });

    it('returns null without a root marker when a structural change is deferred', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await qr.startTransaction();

      const result = await makeRepo(qr.manager, sessionId).applyStructuralChange(
        1000,
        {addedSgSystemIds: [SG_ID_1]},
        {cache: true, source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      expect(result).toBeNull();
      const rows: any[] = await ds.query(
        `SELECT change_id FROM edit_actions WHERE session_id = ? AND aggregate_id = ?`,
        [sessionId, 1000],
      );
      expect(rows).toEqual([]);
    });

    it('emits a UseCase UPDATE when newType is provided', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);

      await repo.applyStructuralChange(
        1000,
        {newType: USECASE_TYPE.Island},
        {source: SOURCE.AutoRouting},
      );
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT target_table, operation, new_value FROM edit_actions WHERE session_id = ? AND aggregate_id = ? ORDER BY change_id`,
        [sessionId, 1000],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].target_table).toBe('UseCase');
      expect(rows[0].operation).toBe('UPDATE');
      expect(JSON.parse(rows[0].new_value)).toEqual({
        type: USECASE_TYPE.Island,
      });

      const [overlaid] = await repo.findBySystemIds(FILE_ID, [1000]);
      expect(overlaid.type).toBe(USECASE_TYPE.Island);
    });

    it('merges newType and referencedComponents into one UseCase UPDATE', async () => {
      await seedUseCase(ds, 1000, 1, 'uc-a', USECASE_TYPE.Linked);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const uc = new UseCase({
        systemId: 1000,
        fileSystemId: FILE_ID,
        aliasId: 1,
        alias: 'uc-a',
        type: USECASE_TYPE.Linked,
        subgraphSystemIds: [],
        subgraphPairs: [],
        keyVector: {valueSystemIds: []},
      });
      await repo.applyStructuralChange(
        uc.systemId,
        {
          addedSgSystemIds: [SG_ID_1],
          newType: USECASE_TYPE.Island,
        },
        {source: SOURCE.AutoRouting},
        {
          sgSystemIds: [SG_ID_1],
          dataLinkSystemIds: [],
          controlLinkSystemIds: [],
        },
      );
      await qr.commitTransaction();

      const rows: any[] = await ds.query(
        `SELECT target_table, operation, new_value FROM edit_actions WHERE session_id = ? AND aggregate_id = ? ORDER BY change_id`,
        [sessionId, 1000],
      );
      expect(rows.map((r: any) => `${r.target_table}:${r.operation}`)).toEqual([
        'UseCaseSubgraph:CREATE',
        'UseCase:UPDATE',
      ]);
      const ucRow = rows.find((r: any) => r.target_table === 'UseCase');
      expect(JSON.parse(ucRow.new_value)).toEqual({
        type: USECASE_TYPE.Island,
        referencedComponents: {
          sgSystemIds: [SG_ID_1],
          dataLinkSystemIds: [],
          controlLinkSystemIds: [],
        },
      });
    });
  });
});
