/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
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
const SUBGRAPH_ID = 400;
const NODE_A = 201;
const NODE_B = 202;
const PORT_CP_A = 301;
const PORT_CP_B = 302;

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

async function seedFkDependencies(ds: DataSource) {
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [NODE_A, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [NODE_B, FILE_ID],
  );
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 1, 1, ?)`,
    [PORT_CP_A, NODE_A],
  );
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 2, 1, ?)`,
    [PORT_CP_B, NODE_B],
  );
}

async function seedControlLink(
  ds: DataSource,
  systemId: number,
  portA: number,
  portB: number,
) {
  await ds.query(
    `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id, nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type, source_subgraph_system_id, dest_subgraph_system_id) VALUES (?, ?, ?, ?, ?, ?, 0, 'INTRA_SUBGRAPH', ?, ?)`,
    [systemId, FILE_ID, NODE_A, NODE_B, portA, portB, SUBGRAPH_ID, SUBGRAPH_ID],
  );
}

function makeRepo(
  qr: QueryRunner,
  sessionId: number,
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
  return new TypeOrmControlLinkRepository(qr.manager, uow);
}

describe('TypeOrmControlLinkRepository (integration)', () => {
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
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    await seedFkDependencies(ds);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  it('returns [] when portSystemIds is empty', async () => {
    const repo = makeRepo(qr, sessionId);
    expect(await repo.getLinksByPortSystemIds([], FILE_ID)).toEqual([]);
  });

  it('returns links whose port is in the list', async () => {
    await seedControlLink(ds, 888, PORT_CP_A, PORT_CP_B);
    const repo = makeRepo(qr, sessionId);
    const result = await repo.getLinksByPortSystemIds([PORT_CP_A], FILE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].linkSystemId).toBe(888);
    expect(result[0].portSystemId).toBe(PORT_CP_A);
  });

  it('returns [] when no links exist for the given ports', async () => {
    const repo = makeRepo(qr, sessionId);
    expect(await repo.getLinksByPortSystemIds([9999], FILE_ID)).toEqual([]);
  });
});
