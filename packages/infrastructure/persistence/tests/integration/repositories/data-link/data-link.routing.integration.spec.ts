/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {LINK_TYPE} from '@arc/core';
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
import {TypeOrmDataLinkRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/data-link/data-link.repository.js';
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
const SG_1 = 400;
const SG_2 = 401;
const NODE_A = 201;
const NODE_B = 202;
const PORT_SRC_1 = 301;
const PORT_DST_1 = 302;
const PORT_SRC_2 = 303;
const PORT_DST_2 = 304;

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

async function seedFkDependencies(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg1', 1, 0, ?)`,
    [SG_1, FILE_ID],
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg2', 2, 0, ?)`,
    [SG_2, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [NODE_A, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [NODE_B, FILE_ID],
  );
  // Seed enough ports for 4 links (each link needs 2 unique ports)
  for (let i = 0; i < 4; i++) {
    const srcPort = PORT_SRC_1 + i * 2;
    const dstPort = PORT_DST_1 + i * 2;
    await ds.query(
      `INSERT INTO data_ports (system_id, data_port_id, name, port_io_type, is_static, node_system_id) VALUES (?, ?, ?, 'OUTPUT', 1, ?)`,
      [srcPort, 2 * i + 1, `p${2 * i + 1}`, NODE_A],
    );
    await ds.query(
      `INSERT INTO data_ports (system_id, data_port_id, name, port_io_type, is_static, node_system_id) VALUES (?, ?, ?, 'INPUT', 1, ?)`,
      [dstPort, 2 * i + 2, `p${2 * i + 2}`, NODE_B],
    );
  }
}

let linkSeqPort = 0;

async function seedDataLink(
  ds: DataSource,
  systemId: number,
  linkType: string,
  srcSg: number,
  destSg: number,
): Promise<void> {
  linkSeqPort += 1;
  const srcPort = PORT_SRC_1 + (linkSeqPort - 1) * 2;
  const dstPort = PORT_DST_1 + (linkSeqPort - 1) * 2;
  await ds.query(
    `INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, source_subgraph_system_id, dest_subgraph_system_id, is_ec, file_system_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      systemId,
      NODE_A,
      NODE_B,
      srcPort,
      dstPort,
      linkType,
      srcSg,
      destSg,
      FILE_ID,
    ],
  );
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId = 0,
): TypeOrmDataLinkRepository {
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
  return new TypeOrmDataLinkRepository(manager, uow);
}

describe('TypeOrmDataLinkRepository — routing methods (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    linkSeqPort = 0;
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    await seedFkDependencies(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    if (qr?.isReleased === false) {
      await qr.release();
    }
  });

  describe('findIntraUcLinksForGivenSgPair', () => {
    it('returns [] for empty pairs input', async () => {
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        [],
      );
      expect(result).toEqual([]);
    });

    it('returns one LinksForPair entry per input pair in the same order; entries with no matching links have links: []', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        [
          {sourceSubgraphSystemId: SG_1, destSubgraphSystemId: SG_2},
          {sourceSubgraphSystemId: SG_2, destSubgraphSystemId: SG_1},
        ],
      );
      expect(result).toHaveLength(2);
      expect(result[0].pair).toEqual({
        sourceSubgraphSystemId: SG_1,
        destSubgraphSystemId: SG_2,
      });
      expect(result[0].links.map(l => l.systemId)).toEqual([1001]);
      expect(result[1].pair).toEqual({
        sourceSubgraphSystemId: SG_2,
        destSubgraphSystemId: SG_1,
      });
      expect(result[1].links).toEqual([]);
    });

    it('returns only INTRA_USECASE links matching the exact directional pair', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraUsecase, SG_1, SG_2); // A→B match
      await seedDataLink(ds, 1002, LINK_TYPE.IntraUsecase, SG_2, SG_1); // B→A wrong direction
      await seedDataLink(ds, 1003, LINK_TYPE.IntraSubgraph, SG_1, SG_2); // wrong link_type
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        [{sourceSubgraphSystemId: SG_1, destSubgraphSystemId: SG_2}],
      );
      expect(result).toHaveLength(1);
      expect(result[0].links.map(l => l.systemId)).toEqual([1001]);
    });

    it('batches multiple pairs in one call and correctly attributes links to their pairs', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      await seedDataLink(ds, 1002, LINK_TYPE.IntraUsecase, SG_2, SG_1);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        [
          {sourceSubgraphSystemId: SG_1, destSubgraphSystemId: SG_2},
          {sourceSubgraphSystemId: SG_2, destSubgraphSystemId: SG_1},
        ],
      );
      expect(result).toHaveLength(2);
      expect(result[0].links.map(l => l.systemId)).toEqual([1001]);
      expect(result[1].links.map(l => l.systemId)).toEqual([1002]);
    });

    it('excludes INTRA_SUBGRAPH link type', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      await seedDataLink(ds, 1002, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        [{sourceSubgraphSystemId: SG_1, destSubgraphSystemId: SG_2}],
      );
      expect(result[0].links.map(l => l.systemId)).toEqual([1002]);
    });
  });

  describe('findIntraUcLinksByFile', () => {
    it('returns all intra-usecase data links in the file', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      await seedDataLink(ds, 1002, LINK_TYPE.IntraUsecase, SG_2, SG_1);
      const sessionId = await seedSession(ds);
      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).findIntraUcLinksByFile(FILE_ID);
      expect(result.map(l => l.systemId).sort()).toEqual([1001, 1002]);
    });

    it('excludes non-intra-usecase link types', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      await seedDataLink(ds, 1002, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).findIntraUcLinksByFile(FILE_ID);
      expect(result.map(l => l.systemId)).toEqual([1001]);
    });

    it('returns [] when file has no intra-usecase links', async () => {
      const sessionId = await seedSession(ds);
      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).findIntraUcLinksByFile(FILE_ID);
      expect(result).toEqual([]);
    });
  });

  describe('findChangedInSession', () => {
    it('returns DataLinks that have any active edit_action (any source/status)', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'DataLink', 'CREATE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1001, 1001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added.map(l => l.systemId)).toContain(1001);
      expect(result.deleted).toEqual([]);
    });

    it('includes edits regardless of source', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'DataLink', 'CREATE', NULL, '{}', 'AUTO_ROUTING', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1001, 1001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added.map(l => l.systemId)).toContain(1001);
      expect(result.deleted).toEqual([]);
    });

    it('excludes superseded edit_actions', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'DataLink', 'CREATE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), datetime('now'))`,
        [sessionId, 1001, 1001],
      );
      expect(
        await makeRepo(qr.manager, sessionId).findChangedInSession(FILE_ID),
      ).toEqual({added: [], deleted: []});
    });

    it('puts DELETE-operation targets in the deleted bucket', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'DataLink', 'DELETE', NULL, NULL, 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1001, 1001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added).toEqual([]);
      expect(result.deleted.map(l => l.systemId)).toEqual([1001]);
    });

    it('excludes UPDATE-operation edit_actions from both buckets', async () => {
      await seedDataLink(ds, 1001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'DataLink', 'UPDATE', 'isEc', 'true', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 1001, 1001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result).toEqual({added: [], deleted: []});
    });
  });
});
