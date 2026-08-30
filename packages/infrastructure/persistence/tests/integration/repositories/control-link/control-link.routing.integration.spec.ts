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
import {TypeOrmControlLinkRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/control-link/control-link.repository.js';
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
const PORT_CP_A_BASE = 301;
const PORT_CP_B_BASE = 302;

let linkSeqPort = 0;

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
  // Seed 4 control ports to allow 2 unique links
  for (let i = 0; i < 4; i++) {
    const portA = PORT_CP_A_BASE + i * 2;
    const portB = PORT_CP_B_BASE + i * 2;
    await ds.query(
      `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, ?, 1, ?)`,
      [portA, i * 2 + 1, NODE_A],
    );
    await ds.query(
      `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, ?, 1, ?)`,
      [portB, i * 2 + 2, NODE_B],
    );
  }
}

async function seedControlLink(
  ds: DataSource,
  systemId: number,
  linkType: string,
  srcSg: number,
  destSg: number,
): Promise<void> {
  linkSeqPort += 1;
  const portA = PORT_CP_A_BASE + (linkSeqPort - 1) * 2;
  const portB = PORT_CP_B_BASE + (linkSeqPort - 1) * 2;
  await ds.query(
    `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id, nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type, source_subgraph_system_id, dest_subgraph_system_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [systemId, FILE_ID, NODE_A, NODE_B, portA, portB, linkType, srcSg, destSg],
  );
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId = 0,
): TypeOrmControlLinkRepository {
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
  return new TypeOrmControlLinkRepository(manager, uow);
}

describe('TypeOrmControlLinkRepository — routing methods (integration)', () => {
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
    it('returns [] when no control link exists between the two SGs', async () => {
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_1,
        SG_2,
      );
      expect(result).toEqual([]);
    });

    it('returns INTRA_USECASE control links stored as (peerA, peerB)', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_1,
        SG_2,
      );
      expect(result.map(l => l.systemId)).toEqual([2001]);
    });

    it('returns INTRA_USECASE control links stored as (peerB, peerA) — undirected match', async () => {
      // Stored direction depends on port-ID ordering; here we simulate it as (SG_2, SG_1).
      await seedControlLink(ds, 2002, LINK_TYPE.IntraUsecase, SG_2, SG_1);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_1,
        SG_2,
      );
      expect(result.map(l => l.systemId)).toEqual([2002]);
    });

    it('returns links from both stored directions between the two SGs', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      await seedControlLink(ds, 2002, LINK_TYPE.IntraUsecase, SG_2, SG_1);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_1,
        SG_2,
      );
      expect(result.map(l => l.systemId).sort()).toEqual([2001, 2002]);
    });

    it('argument order (peerA, peerB) vs (peerB, peerA) yields the same result', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      const forward = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_1,
        SG_2,
      );
      const reverse = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_2,
        SG_1,
      );
      expect(forward.map(l => l.systemId)).toEqual(
        reverse.map(l => l.systemId),
      );
    });

    it('excludes INTRA_SUBGRAPH link type', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      await seedControlLink(ds, 2002, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      const result = await makeRepo(qr.manager).findIntraUcLinksForGivenSgPair(
        FILE_ID,
        SG_1,
        SG_2,
      );
      expect(result.map(l => l.systemId)).toEqual([2002]);
    });
  });

  describe('findIntraUcLinksByFile', () => {
    it('returns all intra-usecase control links in the file', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      await seedControlLink(ds, 2002, LINK_TYPE.IntraUsecase, SG_2, SG_1);
      const sessionId = await seedSession(ds);
      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).findIntraUcLinksByFile(FILE_ID);
      expect(result.map(l => l.systemId).sort()).toEqual([2001, 2002]);
    });

    it('excludes non-intra-usecase link types', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraUsecase, SG_1, SG_2);
      await seedControlLink(ds, 2002, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).findIntraUcLinksByFile(FILE_ID);
      expect(result.map(l => l.systemId)).toEqual([2001]);
    });

    it('returns [] when file has no intra-usecase control links', async () => {
      const sessionId = await seedSession(ds);
      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).findIntraUcLinksByFile(FILE_ID);
      expect(result).toEqual([]);
    });
  });

  describe('findChangedInSession', () => {
    it('returns ControlLinks that have any active edit_action (any source/status)', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'ControlLink', 'CREATE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 2001, 2001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added.map(l => l.systemId)).toContain(2001);
      expect(result.deleted).toEqual([]);
    });

    it('includes edits regardless of source', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'ControlLink', 'CREATE', NULL, '{}', 'AUTO_ROUTING', 'UNSTAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 2001, 2001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added.map(l => l.systemId)).toContain(2001);
      expect(result.deleted).toEqual([]);
    });

    it('excludes superseded edit_actions', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'ControlLink', 'CREATE', NULL, '{}', 'MANUAL', 'STAGED', NULL, datetime('now'), datetime('now'))`,
        [sessionId, 2001, 2001],
      );
      expect(
        await makeRepo(qr.manager, sessionId).findChangedInSession(FILE_ID),
      ).toEqual({added: [], deleted: []});
    });

    it('puts DELETE-operation targets in the deleted bucket', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'ControlLink', 'DELETE', NULL, NULL, 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 2001, 2001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result.added).toEqual([]);
      expect(result.deleted.map(l => l.systemId)).toEqual([2001]);
    });

    it('excludes UPDATE-operation edit_actions from both buckets', async () => {
      await seedControlLink(ds, 2001, LINK_TYPE.IntraSubgraph, SG_1, SG_2);
      const sessionId = await seedSession(ds);
      await ds.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, created_at, valid_until)
         VALUES (?, ?, ?, 'ControlLink', 'UPDATE', 'heapId', '99', 'MANUAL', 'STAGED', NULL, datetime('now'), NULL)`,
        [sessionId, 2001, 2001],
      );
      const result = await makeRepo(qr.manager, sessionId).findChangedInSession(
        FILE_ID,
      );
      expect(result).toEqual({added: [], deleted: []});
    });
  });
});
