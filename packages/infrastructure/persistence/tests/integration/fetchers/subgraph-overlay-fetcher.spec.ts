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
import {SubgraphPropertyDataFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/subgraph-sgkv-fetcher.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {SubgraphPropertyDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
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

async function seedSubgraph(
  ds: DataSource,
  opts: {systemId: number; fileSystemId: number},
) {
  await ds.query(
    `INSERT INTO subgraphs (system_id, subgraph_id, name, is_imported, file_system_id) VALUES (?, 1, 'sg', 0, ?)`,
    [opts.systemId, opts.fileSystemId],
  );
}

async function seedSubgraphPropertyDef(ds: DataSource, systemId: number) {
  await getTestRepository(SubgraphPropertyDefinitionSchema).save({
    systemId,
    fileSystemId: FILE_ID,
    propertyId: systemId,
    name: `prop-${systemId}`,
    maxSize: 4,
    propertyType: 'SPF',
    elementsStructure: '[]',
    isVoice: false,
  });
}

async function seedSubgraphPropertyData(
  ds: DataSource,
  opts: {
    systemId: number;
    subgraphSystemId: number;
    subgraphPropertySystemId: number;
  },
) {
  await seedSubgraphPropertyDef(ds, opts.subgraphPropertySystemId);
  await ds.query(
    `INSERT INTO subgraph_property_data (system_id, subgraph_system_id, subgraph_property_system_id, payload) VALUES (?, ?, ?, x'')`,
    [opts.systemId, opts.subgraphSystemId, opts.subgraphPropertySystemId],
  );
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
      qr.manager,
      new EditActionsQueryService(qr.manager),
      new SubgraphPropertyDataFetcher(
        qr.manager,
        new EditActionsQueryService(qr.manager),
      ),
      new SubgraphSgkvFetcher(
        qr.manager,
        new EditActionsQueryService(qr.manager),
      ),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  it('returns null when no base row and sessionId is null', async () => {
    expect(await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, null)).toBeNull();
  });

  it('returns base subgraph with empty properties when sessionId is null', async () => {
    await seedSubgraph(ds, {systemId: SUBGRAPH_ID, fileSystemId: FILE_ID});
    const result = await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, null);
    expect(result).not.toBeNull();
    expect(result!.systemId).toBe(SUBGRAPH_ID);
    expect(result!.properties).toHaveLength(0);
  });

  it('returns base subgraph with base property rows when sessionId is null', async () => {
    await seedSubgraph(ds, {systemId: SUBGRAPH_ID, fileSystemId: FILE_ID});
    await seedSubgraphPropertyData(ds, {
      systemId: 200,
      subgraphSystemId: SUBGRAPH_ID,
      subgraphPropertySystemId: 7,
    });
    const result = await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, null);
    expect(result!.properties).toHaveLength(1);
    expect(result!.properties[0].propertySystemId).toBe(7); // normalised from subgraphPropertySystemId
  });

  it('returns CREATE-staged subgraph even with no base row', async () => {
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
        isImported: false,
        fileSystemId: FILE_ID,
      }),
    });
    const result = await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, sessionId);
    expect(result).not.toBeNull();
    expect(result!.systemId).toBe(SUBGRAPH_ID);
  });

  it('tombstones DELETE-staged subgraph', async () => {
    await seedSubgraph(ds, {systemId: SUBGRAPH_ID, fileSystemId: FILE_ID});
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBGRAPH_ID,
      targetSystemId: SUBGRAPH_ID,
      targetTable: ENTITY_NAMES.Subgraph,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    expect(await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, sessionId)).toBeNull();
  });

  it('includes CREATE-staged property when subgraph base row exists', async () => {
    await seedSubgraph(ds, {systemId: SUBGRAPH_ID, fileSystemId: FILE_ID});
    const sessionId = await seedSession(ds);
    const propSystemId = 300;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBGRAPH_ID,
      targetSystemId: propSystemId,
      targetTable: ENTITY_NAMES.SubgraphPropertyData,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({
        subgraphSystemId: SUBGRAPH_ID,
        propertySystemId: 7,
        payload: null,
      }),
    });
    const result = await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, sessionId);
    expect(
      result!.properties.find(p => p.systemId === propSystemId),
    ).toBeDefined();
    expect(result!.properties[0].propertySystemId).toBe(7);
  });

  it('applies UPDATE overlay to a base property payload', async () => {
    await seedSubgraph(ds, {systemId: SUBGRAPH_ID, fileSystemId: FILE_ID});
    await seedSubgraphPropertyData(ds, {
      systemId: 200,
      subgraphSystemId: SUBGRAPH_ID,
      subgraphPropertySystemId: 7,
    });
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
    const result = await fetcher.fetchOne(SUBGRAPH_ID, FILE_ID, sessionId);
    const prop = result!.properties.find(p => p.systemId === 200);
    expect(prop).toBeDefined();
  });
});
