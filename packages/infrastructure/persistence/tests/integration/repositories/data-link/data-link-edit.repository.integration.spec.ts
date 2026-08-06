/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {PORT_IO_TYPE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmDataLinkRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/data-link/data-link.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProjectSessionSchema,
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
const SUBGRAPH_ID = 400;
const NODE_A = 201;
const NODE_B = 202;
const PORT_SRC = 301;
const PORT_DST = 302;
const DATA_LINK_ID = 601;

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
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_exported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
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
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, node_system_id) VALUES (?, 1, ?, 1, ?)`,
    [PORT_SRC, PORT_IO_TYPE.Output, NODE_A],
  );
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, node_system_id) VALUES (?, 2, ?, 1, ?)`,
    [PORT_DST, PORT_IO_TYPE.Input, NODE_B],
  );
}

async function seedDeletedDataLink(
  ds: DataSource,
  sessionId: number,
  groupId: string,
) {
  await ds.query(
    `INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, source_subgraph_system_id, dest_subgraph_system_id, file_system_id) VALUES (?, ?, ?, ?, ?, 'INTRA_SUBGRAPH', ?, ?, ?)`,
    [
      DATA_LINK_ID,
      NODE_A,
      NODE_B,
      PORT_SRC,
      PORT_DST,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
      FILE_ID,
    ],
  );
  await ds.query(
    `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id) VALUES (?, ?, ?, 'DataLink', 'DELETE', NULL, '{}', 'MANUAL', 'STAGED', ?)`,
    [sessionId, DATA_LINK_ID, DATA_LINK_ID, groupId],
  );
}

function makeRepo(
  qr: QueryRunner,
  sessionId: number,
): TypeOrmDataLinkRepository {
  const cache = new PendingChangeCache();
  const editSvc = new EditActionsQueryService(qr.manager);
  const writer = new PendingChangeWriter(editSvc, cache);
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
  return new TypeOrmDataLinkRepository(qr.manager, uow, writer);
}

describe('TypeOrmDataLinkRepository (integration)', () => {
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

  it('findByPortPair returns null when no link exists', async () => {
    const repo = makeRepo(qr, sessionId);
    const result = await repo.findByPortPair(PORT_SRC, PORT_DST, FILE_ID);
    expect(result).toBeNull();
  });

  it('findByPortPair returns {isDeleted: true} when a base link has a DELETE edit_action', async () => {
    await seedDeletedDataLink(ds, sessionId, 'grp1');
    const repo = makeRepo(qr, sessionId);
    const result = await repo.findByPortPair(PORT_SRC, PORT_DST, FILE_ID);
    expect(result).not.toBeNull();
    expect(result!.isDeleted).toBe(true);
    expect(result!.systemId).toBe(DATA_LINK_ID);
  });

  it('reactivateDataLink supersedes DELETE row and inserts new CREATE row', async () => {
    await seedDeletedDataLink(ds, sessionId, 'grp1');
    await qr.startTransaction();
    const repo = makeRepo(qr, sessionId);
    const payload = {
      sourcePortSystemId: PORT_SRC,
      destinationPortSystemId: PORT_DST,
      fileSystemId: FILE_ID,
    };
    await repo.reactivateDataLink(DATA_LINK_ID, DATA_LINK_ID, payload);
    await qr.commitTransaction();

    const rows: Array<Record<string, unknown>> = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND target_table = 'DataLink' ORDER BY change_id`,
      [sessionId, DATA_LINK_ID],
    );
    expect(rows.length).toBe(2);
    const deleteRow = rows.find(r => r['operation'] === 'DELETE');
    const createRow = rows.find(r => r['operation'] === 'CREATE');
    expect(deleteRow).toBeDefined();
    expect(createRow).toBeDefined();
    expect(deleteRow!['valid_until']).not.toBeNull();
    expect(createRow!['valid_until']).toBeNull();
    expect(createRow!['change_status']).toBe('STAGED');
  });
});
