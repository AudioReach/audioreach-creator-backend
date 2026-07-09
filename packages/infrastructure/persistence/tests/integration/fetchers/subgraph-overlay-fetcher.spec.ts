/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
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
import {SubgraphOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/subgraph-overlay-fetcher.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import type {SubgraphBase} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import type {SgkvBase} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph-sgkv-data.js';
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
const SUBGRAPH_ID = 42;

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
    fieldPath?: string | null;
  },
) {
  await ds.query(
    `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      opts.sessionId,
      opts.aggregateId,
      opts.targetSystemId,
      opts.targetTable,
      opts.operation,
      opts.fieldPath ?? null,
      opts.newValue,
      SOURCE.Manual,
      CHANGE_STATUS.Staged,
    ],
  );
}

// Minimal in-memory base rows — fetcher only applies overlay, never loads from DB
function makeSubgraph(overrides: Partial<SubgraphBase> = {}): SubgraphBase {
  return {
    systemId: SUBGRAPH_ID,
    subgraphId: 1,
    name: 'sg',
    isExported: false,
    fileSystemId: FILE_ID,
    ...overrides,
  };
}

function makeSgkvRow(overrides: Partial<SgkvBase> = {}): SgkvBase {
  return {
    systemId: 500,
    subgraphSystemId: SUBGRAPH_ID,
    ...overrides,
  };
}

function makePropRow(
  overrides: Partial<SubgraphPropertyDataBase> = {},
): SubgraphPropertyDataBase {
  return {
    systemId: 200,
    subgraphSystemId: SUBGRAPH_ID,
    subgraphPropertySystemId: 7,
    payload: null,
    ...overrides,
  };
}

describe('SubgraphOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: SubgraphOverlayFetcher;

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
    qr = ds.createQueryRunner();
    await qr.connect();
    fetcher = new SubgraphOverlayFetcher(
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  // ── applyToSubgraphs ──────────────────────────────────────────────────────

  describe('applyToSubgraphs', () => {
    it('returns base rows unchanged when session has no subgraph actions', async () => {
      const sessionId = await seedSession(ds);
      const result = await fetcher.applyToSubgraphs(
        [makeSubgraph()],
        FILE_ID,
        sessionId,
      );
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(SUBGRAPH_ID);
    });

    it('returns empty array when base is empty and session has no CREATE', async () => {
      const sessionId = await seedSession(ds);
      const result = await fetcher.applyToSubgraphs([], FILE_ID, sessionId);
      expect(result).toHaveLength(0);
    });

    it('injects CREATE-staged subgraph not in base', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: SUBGRAPH_ID,
        targetTable: ENTITY_NAMES.Subgraph,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          subgraphId: 1,
          name: 'sg-new',
          isExported: false,
          fileSystemId: FILE_ID,
        }),
      });
      const result = await fetcher.applyToSubgraphs([], FILE_ID, sessionId);
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(SUBGRAPH_ID);
      expect(result[0].name).toBe('sg-new');
    });

    it('tombstones DELETE-staged subgraph', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: SUBGRAPH_ID,
        targetTable: ENTITY_NAMES.Subgraph,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.applyToSubgraphs(
        [makeSubgraph()],
        FILE_ID,
        sessionId,
      );
      expect(result).toHaveLength(0);
    });
  });

  // ── applyToPropertyRows ───────────────────────────────────────────────────

  describe('applyToPropertyRows', () => {
    it('returns base rows unchanged when session has no property actions', async () => {
      const sessionId = await seedSession(ds);
      const result = await fetcher.applyToPropertyRows(
        [makePropRow()],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(1);
      expect(result[0].subgraphPropertySystemId).toBe(7);
    });

    it('returns empty array when base is empty and session has no CREATE', async () => {
      const sessionId = await seedSession(ds);
      const result = await fetcher.applyToPropertyRows(
        [],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(0);
    });

    it('injects CREATE-staged property row not in base', async () => {
      const propSystemId = 300;
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: propSystemId,
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({
          subgraphSystemId: SUBGRAPH_ID,
          subgraphPropertySystemId: 7,
          payload: null,
        }),
      });
      const result = await fetcher.applyToPropertyRows(
        [],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(propSystemId);
      expect(result[0].subgraphPropertySystemId).toBe(7);
    });

    it('applies UPDATE overlay to a base property row', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: 200,
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        operation: CHANGE_OPERATION.Update,
        fieldPath: 'payload',
        newValue: JSON.stringify([1, 2, 3]),
      });
      const result = await fetcher.applyToPropertyRows(
        [makePropRow()],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(200);
    });

    it('tombstones DELETE-staged property row', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: 200,
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.applyToPropertyRows(
        [makePropRow()],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(0);
    });
  });

  // ── applyToSgkvRows ───────────────────────────────────────────────────────

  describe('applyToSgkvRows', () => {
    it('returns base rows unchanged when session has no SGKV actions', async () => {
      const sessionId = await seedSession(ds);
      const result = await fetcher.applyToSgkvRows(
        [makeSgkvRow()],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(500);
    });

    it('returns empty array when base is empty and session has no CREATE', async () => {
      const sessionId = await seedSession(ds);
      const result = await fetcher.applyToSgkvRows([], SUBGRAPH_ID, sessionId);
      expect(result).toHaveLength(0);
    });

    it('injects CREATE-staged SGKV bin not in base', async () => {
      const sgkvSystemId = 600;
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: sgkvSystemId,
        targetTable: ENTITY_NAMES.Sgkv,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({subgraphSystemId: SUBGRAPH_ID}),
      });
      const result = await fetcher.applyToSgkvRows([], SUBGRAPH_ID, sessionId);
      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe(sgkvSystemId);
      expect(result[0].subgraphSystemId).toBe(SUBGRAPH_ID);
    });

    it('tombstones DELETE-staged SGKV bin', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: 500,
        targetTable: ENTITY_NAMES.Sgkv,
        operation: CHANGE_OPERATION.Delete,
        newValue: '{}',
      });
      const result = await fetcher.applyToSgkvRows(
        [makeSgkvRow()],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(0);
    });

    it('does not inject CREATE already present in base', async () => {
      const sessionId = await seedSession(ds);
      await seedEditAction(ds, {
        sessionId,
        aggregateId: SUBGRAPH_ID,
        targetSystemId: 500, // same systemId as the base row
        targetTable: ENTITY_NAMES.Sgkv,
        operation: CHANGE_OPERATION.Create,
        newValue: JSON.stringify({subgraphSystemId: SUBGRAPH_ID}),
      });
      const result = await fetcher.applyToSgkvRows(
        [makeSgkvRow()],
        SUBGRAPH_ID,
        sessionId,
      );
      expect(result).toHaveLength(1); // no duplicate
    });
  });
});
