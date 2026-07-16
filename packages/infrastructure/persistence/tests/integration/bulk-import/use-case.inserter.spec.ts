/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, EntityManager} from 'typeorm';
import {UseCase, USECASE_TYPE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {UseCaseInserter} from '../../../src/persistence-typeorm-sqllite/repositories/bulk-import/use-case/use-case.inserter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_ID = 100;
const SG1_ID = 401;
const SG2_ID = 402;
const SG3_ID = 403;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createBaseDependencies(manager: EntityManager): Promise<void> {
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

  for (const [systemId, sgId] of [
    [SG1_ID, 1],
    [SG2_ID, 2],
    [SG3_ID, 3],
  ]) {
    await manager.insert('Subgraph', {
      systemId,
      subgraphId: sgId,
      name: `subgraph-${sgId}`,
      isExported: 0,
      fileSystemId: FILE_ID,
      version: 1,
    });
  }
}

async function createGkvDependencies(manager: EntityManager): Promise<void> {
  await manager.insert('KeyDefinition', {
    systemId: 5001,
    fileSystemId: FILE_ID,
    keyId: 1,
    name: 'TestKey',
    version: 1,
  });
  for (const [systemId, valueId] of [
    [6001, 1],
    [6002, 2],
  ]) {
    await manager.insert('ValueDefinition', {
      systemId,
      keySystemId: 5001,
      valueId,
      name: `Value${valueId}`,
      fileSystemId: FILE_ID,
      aliasId: systemId,
      alias: `Value${valueId}`,
      version: 1,
    });
  }
}

function buildUseCase(
  systemId: number,
  opts: {
    subgraphSystemIds?: number[];
    subgraphPairs?: {
      sourceSubgraphSystemId: number;
      destSubgraphSystemId: number;
    }[];
    valueSystemIds?: number[];
    alias?: string;
    type?: string;
  } = {},
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: FILE_ID,
    aliasId: systemId,
    alias: opts.alias ?? `UseCase${systemId}`,
    keyVector: {valueSystemIds: opts.valueSystemIds ?? []},
    subgraphSystemIds: opts.subgraphSystemIds ?? [],
    subgraphPairs: opts.subgraphPairs ?? [],
    type: opts.type,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UseCaseInserter', () => {
  let dataSource: DataSource;
  let manager: EntityManager;
  let inserter: UseCaseInserter;

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
    await createBaseDependencies(manager);
    inserter = new UseCaseInserter(manager);
  });

  // ── Empty input ────────────────────────────────────────────────────────────

  it('returns okBulkInsert for empty input', async () => {
    const result = await inserter.insert([]);
    expect(result.ok).toBe(true);
  });

  // ── Root row ───────────────────────────────────────────────────────────────

  it('inserts use_cases root row', async () => {
    const uc = buildUseCase(1001, {alias: 'VoiceCall'});

    const result = await inserter.insert([uc]);

    expect(result.ok).toBe(true);
    const rows = await dataSource.query(
      `SELECT * FROM use_cases WHERE system_id = 1001`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].alias).toBe('VoiceCall');
    expect(rows[0].file_system_id).toBe(FILE_ID);
  });

  // ── GKV values ─────────────────────────────────────────────────────────────

  it('inserts usecase_gkv_values for each key-vector entry', async () => {
    await createGkvDependencies(manager);
    const uc = buildUseCase(1001, {valueSystemIds: [6001, 6002]});

    await inserter.insert([uc]);

    const rows = await dataSource.query(
      `SELECT * FROM usecase_gkv_values WHERE usecase_system_id = 1001`,
    );
    expect(rows).toHaveLength(2);
    const ids = rows
      .map((r: {value_def_system_id: number}) => r.value_def_system_id)
      .sort();
    expect(ids).toEqual([6001, 6002]);
  });

  it('inserts root row with no gkv values when keyVector is empty', async () => {
    const uc = buildUseCase(1001, {valueSystemIds: []});

    const result = await inserter.insert([uc]);

    expect(result.ok).toBe(true);
    const ucRows = await dataSource.query(
      `SELECT * FROM use_cases WHERE system_id = 1001`,
    );
    expect(ucRows).toHaveLength(1);
    const gkvRows = await dataSource.query(
      `SELECT * FROM usecase_gkv_values WHERE usecase_system_id = 1001`,
    );
    expect(gkvRows).toHaveLength(0);
  });

  // ── Subgraph membership ────────────────────────────────────────────────────

  it('inserts use_case_subgraphs for each subgraph in the usecase', async () => {
    const uc = buildUseCase(1001, {subgraphSystemIds: [SG1_ID, SG2_ID]});

    await inserter.insert([uc]);

    const rows = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1001`,
    );
    expect(rows).toHaveLength(2);
    const sgIds = rows
      .map((r: {subgraph_system_id: number}) => r.subgraph_system_id)
      .sort();
    expect(sgIds).toEqual([SG1_ID, SG2_ID].sort());
  });

  it('inserts no use_case_subgraphs for a usecase with no subgraphs', async () => {
    const uc = buildUseCase(1001, {subgraphSystemIds: []});

    await inserter.insert([uc]);

    const rows = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1001`,
    );
    expect(rows).toHaveLength(0);
  });

  // ── Subgraph pairs ─────────────────────────────────────────────────────────

  it('inserts use_case_subgraph_pairs for each directed pair', async () => {
    const uc = buildUseCase(1001, {
      subgraphSystemIds: [SG1_ID, SG2_ID, SG3_ID],
      subgraphPairs: [
        {sourceSubgraphSystemId: SG1_ID, destSubgraphSystemId: SG2_ID},
        {sourceSubgraphSystemId: SG2_ID, destSubgraphSystemId: SG3_ID},
      ],
    });

    await inserter.insert([uc]);

    const rows = await dataSource.query(
      `SELECT * FROM use_case_subgraph_pairs WHERE usecase_system_id = 1001`,
    );
    expect(rows).toHaveLength(2);
  });

  it('inserts no pairs for a usecase with no subgraph pairs', async () => {
    const uc = buildUseCase(1001, {
      subgraphSystemIds: [SG1_ID],
      subgraphPairs: [],
    });

    await inserter.insert([uc]);

    const rows = await dataSource.query(
      `SELECT * FROM use_case_subgraph_pairs WHERE usecase_system_id = 1001`,
    );
    expect(rows).toHaveLength(0);
  });

  // ── Subgraph sharing across usecases ───────────────────────────────────────

  it('two usecases sharing the same subgraph each get their own membership row', async () => {
    // Business rule: same subgraph (SG1) appears in both U1 and U2.
    // Each usecase gets its own row in use_case_subgraphs.
    const u1 = buildUseCase(1001, {subgraphSystemIds: [SG1_ID, SG2_ID]});
    const u2 = buildUseCase(1002, {subgraphSystemIds: [SG1_ID, SG3_ID]});

    await inserter.insert([u1, u2]);

    const u1Rows = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1001`,
    );
    const u2Rows = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1002`,
    );
    expect(u1Rows).toHaveLength(2);
    expect(u2Rows).toHaveLength(2);
  });

  it('same subgraph pair in two usecases inserts two separate pair rows', async () => {
    // Business rule: (SG1, SG2) pair is declared in both U1 and U2.
    // Each usecase owns its own pair row; the intra-usecase links are shared
    // (stored once in data_links), but the pair membership is per-usecase.
    const pair = {sourceSubgraphSystemId: SG1_ID, destSubgraphSystemId: SG2_ID};
    const u1 = buildUseCase(1001, {
      subgraphSystemIds: [SG1_ID, SG2_ID],
      subgraphPairs: [pair],
    });
    const u2 = buildUseCase(1002, {
      subgraphSystemIds: [SG1_ID, SG2_ID],
      subgraphPairs: [pair],
    });

    await inserter.insert([u1, u2]);

    const rows = await dataSource.query(
      `SELECT * FROM use_case_subgraph_pairs
       WHERE source_subgraph_system_id = ? AND dest_subgraph_system_id = ?`,
      [SG1_ID, SG2_ID],
    );
    expect(rows).toHaveLength(2);
  });

  // ── Failure isolation ──────────────────────────────────────────────────────

  it('skips gkv/subgraph/pair rows when root insert fails', async () => {
    await createGkvDependencies(manager);
    // First insert succeeds, establishing systemId 1001
    await inserter.insert([
      buildUseCase(1001, {subgraphSystemIds: [SG1_ID], valueSystemIds: [6001]}),
    ]);

    // Second insert with same systemId triggers PK violation on use_cases
    const duplicate = buildUseCase(1001, {
      subgraphSystemIds: [SG2_ID],
      valueSystemIds: [6002],
    });
    const result = await inserter.insert([duplicate]);

    expect(result.ok).toBe(false);

    // Subgraph row for SG2 must NOT have been written (root failed)
    const sgRows = await dataSource.query(
      `SELECT * FROM use_case_subgraphs
       WHERE usecase_system_id = 1001 AND subgraph_system_id = ?`,
      [SG2_ID],
    );
    expect(sgRows).toHaveLength(0);
  });

  it('good sibling inserts when one usecase root fails', async () => {
    // Pre-insert systemId 1001 to cause PK collision
    await manager.insert('UseCase', {
      systemId: 1001,
      aliasId: 0,
      alias: 'existing',
      fileSystemId: FILE_ID,
      version: 1,
    });

    const bad = buildUseCase(1001, {subgraphSystemIds: [SG1_ID]});
    const good = buildUseCase(1002, {subgraphSystemIds: [SG2_ID]});

    const result = await inserter.insert([bad, good]);

    expect(result.ok).toBe(false);

    const goodRow = await dataSource.query(
      `SELECT * FROM use_cases WHERE system_id = 1002`,
    );
    expect(goodRow).toHaveLength(1);

    const goodSg = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1002`,
    );
    expect(goodSg).toHaveLength(1);

    const badSg = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1001`,
    );
    expect(badSg).toHaveLength(0);
  });

  // ── Full insertion ─────────────────────────────────────────────────────────

  it('inserts all four tables in a single call', async () => {
    await createGkvDependencies(manager);
    const uc = buildUseCase(1001, {
      alias: 'FullUseCase',
      valueSystemIds: [6001, 6002],
      subgraphSystemIds: [SG1_ID, SG2_ID],
      subgraphPairs: [
        {sourceSubgraphSystemId: SG1_ID, destSubgraphSystemId: SG2_ID},
      ],
    });

    const result = await inserter.insert([uc]);

    expect(result.ok).toBe(true);

    const [ucRows, gkvRows, sgRows, pairRows] = await Promise.all([
      dataSource.query(`SELECT * FROM use_cases WHERE system_id = 1001`),
      dataSource.query(
        `SELECT * FROM usecase_gkv_values WHERE usecase_system_id = 1001`,
      ),
      dataSource.query(
        `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1001`,
      ),
      dataSource.query(
        `SELECT * FROM use_case_subgraph_pairs WHERE usecase_system_id = 1001`,
      ),
    ]);

    expect(ucRows).toHaveLength(1);
    expect(gkvRows).toHaveLength(2);
    expect(sgRows).toHaveLength(2);
    expect(pairRows).toHaveLength(1);
    expect(pairRows[0].source_subgraph_system_id).toBe(SG1_ID);
    expect(pairRows[0].dest_subgraph_system_id).toBe(SG2_ID);
  });

  // ── Fallback paths (bulk fails → individual retry) ─────────────────────

  it('gkv fallback: valid value inserted when batch fails due to invalid sibling', async () => {
    // Provide only one valid value definition; 9999 does not exist (FK fail).
    // The bulk insert of both rows fails; fallback retries individually.
    // The valid row (6001) is committed; the invalid row (9999) records a failure.
    await createGkvDependencies(manager);
    const uc = buildUseCase(1001, {valueSystemIds: [6001, 9999]});

    const result = await inserter.insert([uc]);

    expect(result.ok).toBe(false);

    const gkvRows = await dataSource.query(
      `SELECT * FROM usecase_gkv_values WHERE usecase_system_id = 1001`,
    );
    expect(gkvRows).toHaveLength(1);
    expect(gkvRows[0].value_def_system_id).toBe(6001);
  });

  it('subgraph fallback: valid subgraph inserted when batch fails due to invalid sibling', async () => {
    // SG1_ID exists; 9999 does not — batch fails, fallback retries individually.
    const uc = buildUseCase(1001, {subgraphSystemIds: [SG1_ID, 9999]});

    const result = await inserter.insert([uc]);

    expect(result.ok).toBe(false);

    const sgRows = await dataSource.query(
      `SELECT * FROM use_case_subgraphs WHERE usecase_system_id = 1001`,
    );
    expect(sgRows).toHaveLength(1);
    expect(sgRows[0].subgraph_system_id).toBe(SG1_ID);
  });

  it('pair fallback: valid pair inserted when batch fails due to invalid sibling', async () => {
    // (SG1_ID, SG2_ID) is valid; (SG1_ID, 9999) references a non-existent subgraph.
    // Batch fails, fallback retries individually.
    const uc = buildUseCase(1001, {
      subgraphSystemIds: [SG1_ID, SG2_ID],
      subgraphPairs: [
        {sourceSubgraphSystemId: SG1_ID, destSubgraphSystemId: SG2_ID},
        {sourceSubgraphSystemId: SG1_ID, destSubgraphSystemId: 9999},
      ],
    });

    const result = await inserter.insert([uc]);

    expect(result.ok).toBe(false);

    const pairRows = await dataSource.query(
      `SELECT * FROM use_case_subgraph_pairs WHERE usecase_system_id = 1001`,
    );
    expect(pairRows).toHaveLength(1);
    expect(pairRows[0].dest_subgraph_system_id).toBe(SG2_ID);
  });

  // ── type field ─────────────────────────────────────────────────────────────

  it('should persist the type field when provided', async () => {
    const uc = buildUseCase(2001, {type: USECASE_TYPE.Ec});
    await inserter.insert([uc]);
    const rows = await dataSource.query(
      `SELECT type FROM use_cases WHERE system_id = ?`,
      [uc.systemId],
    );
    expect(rows[0].type).toBe(USECASE_TYPE.Ec);
  });

  it('should persist NULL type when type is undefined', async () => {
    const uc = buildUseCase(2002, {type: undefined});
    await inserter.insert([uc]);
    const rows = await dataSource.query(
      `SELECT type FROM use_cases WHERE system_id = ?`,
      [uc.systemId],
    );
    expect(rows[0].type).toBeNull();
  });
});
