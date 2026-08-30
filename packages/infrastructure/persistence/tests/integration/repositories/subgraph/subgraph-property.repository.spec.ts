/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import type {DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmSubgraphRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/subgraph/subgraph.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';

const FILE_ID = 200;
const SG_ID = 50;
const PROP_DEF_SYS_ID = 101;
const PROP_DATA_SYS_ID = 301;

beforeAll(async () => setupIntegrationTest());
afterAll(async () => teardownIntegrationTest());
beforeEach(async () => setupEachTest());

async function seedBase(ds: DataSource) {
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
    `INSERT INTO subgraphs (system_id, subgraph_id, name, is_imported, file_system_id) VALUES (?, 10, 'sg', 0, ?)`,
    [SG_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO subgraph_property_definitions (system_id, property_id, name, property_type, is_voice, file_system_id, max_size, elements_structure) VALUES (?, 55, 'gain', 'SPF', 0, ?, 4, '[]')`,
    [PROP_DEF_SYS_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO subgraph_property_data (system_id, subgraph_system_id, subgraph_property_system_id, payload) VALUES (?, ?, ?, X'00000000')`,
    [PROP_DATA_SYS_ID, SG_ID, PROP_DEF_SYS_ID],
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

function makeRepo(
  ds: DataSource,
  sessionId: number,
  fileSystemId = FILE_ID,
): TypeOrmSubgraphRepository {
  const editActionsQs = new EditActionsQueryService(ds);
  const cache = new PendingChangeCache();
  const writer = new PendingChangeWriter(editActionsQs, cache);
  const uow = {
    getWriteContext: () => ({
      session: {sessionId, fileSystemId},
      groupId: 'g1',
    }),
  } as any;
  const idGeneration = {
    getNextId: async () => Math.floor(Math.random() * 100_000) + 10_000,
  } as any;
  return new TypeOrmSubgraphRepository(writer, ds.manager, uow, idGeneration);
}

describe('TypeOrmSubgraphRepository — setName', () => {
  it('writes a delta edit_action row on the Subgraph row', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const repo = makeRepo(ds, sessionId);

    await repo.setName(SG_ID, 'renamed');

    const rows = await ds.manager
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.targetTable = :t AND ea.targetSystemId = :id', {
        t: 'Subgraph',
        id: SG_ID,
      })
      .getMany();
    expect(rows).toHaveLength(1);
    // newValue holds the serialized field update
    expect(rows[0]!.newValue).toBeDefined();
  });
});

describe('TypeOrmSubgraphRepository — setPropertyData', () => {
  it('writes a delta edit_action row on SubgraphPropertyData', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const repo = makeRepo(ds, sessionId);

    await repo.setPropertyData(
      SG_ID,
      PROP_DEF_SYS_ID,
      new Uint8Array([1, 2, 3, 4]),
    );

    const rows = await ds.manager
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.targetTable = :t AND ea.targetSystemId = :id', {
        t: 'SubgraphPropertyData',
        id: PROP_DATA_SYS_ID,
      })
      .getMany();
    expect(rows).toHaveLength(1);
  });

  it('throws when property row does not exist on subgraph', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const repo = makeRepo(ds, sessionId);

    await expect(
      repo.setPropertyData(SG_ID, 9999, new Uint8Array([1])),
    ).rejects.toThrow();
  });
});

describe('TypeOrmSubgraphRepository — getSubgraphWithProperties', () => {
  it('returns subgraph with property rows from base data', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const repo = makeRepo(ds, sessionId);

    const result = await repo.getSubgraphWithProperties(SG_ID, FILE_ID);
    expect(result).not.toBeNull();
    expect(result!.systemId).toBe(SG_ID);
    expect(result!.properties).toHaveLength(1);
  });

  it('returns null when subgraph does not exist', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const repo = makeRepo(ds, sessionId);

    const result = await repo.getSubgraphWithProperties(9999, FILE_ID);
    expect(result).toBeNull();
  });
});

describe('TypeOrmSubgraphRepository — getSubgraphIdsInSameUsecases', () => {
  it('returns empty array when subgraph has no usecases', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const repo = makeRepo(ds, sessionId);

    const result = await repo.getSubgraphIdsInSameUsecases(SG_ID, FILE_ID);
    expect(result).toEqual([]);
  });
});
