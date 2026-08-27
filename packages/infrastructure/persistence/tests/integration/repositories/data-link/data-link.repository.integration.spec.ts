/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  NodeType,
  PORT_IO_TYPE,
  SOURCE,
} from '@arc/core';
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
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {EditActionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
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
const SUBGRAPH_ID = 400;
const NODE_A = 201;
const NODE_B = 202;
const PORT_SRC = 301;
const PORT_DST = 302;

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
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, node_system_id) VALUES (?, 1, ?, 1, ?)`,
    [PORT_SRC, PORT_IO_TYPE.Output, NODE_A],
  );
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, node_system_id) VALUES (?, 2, ?, 1, ?)`,
    [PORT_DST, PORT_IO_TYPE.Input, NODE_B],
  );
}

async function seedDataLink(
  ds: DataSource,
  systemId: number,
  srcPort: number,
  dstPort: number,
) {
  await ds.query(
    `INSERT INTO data_links (system_id, source_node_system_id, destination_node_system_id, source_port_system_id, destination_port_system_id, link_type, source_subgraph_system_id, dest_subgraph_system_id, file_system_id) VALUES (?, ?, ?, ?, ?, 'INTRA_SUBGRAPH', ?, ?, ?)`,
    [
      systemId,
      NODE_A,
      NODE_B,
      srcPort,
      dstPort,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
      FILE_ID,
    ],
  );
}

async function seedSubsystemDataLink(
  ds: DataSource,
  systemId: number,
  dataLinkSystemId: number,
) {
  await ds.query(
    `INSERT INTO subsystem_data_links
       (system_id, source_node_system_id, destination_node_system_id,
        source_port_system_id, destination_port_system_id,
        data_link_system_id, file_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [systemId, NODE_A, NODE_B, PORT_SRC, PORT_DST, dataLinkSystemId, FILE_ID],
  );
}

async function seedUnresolvedSubsystemDataLink(
  qr: QueryRunner,
  sessionId: number,
  systemId: number,
) {
  await qr.manager.getRepository(EditActionSchema).insert({
    sessionId,
    aggregateId: systemId,
    targetSystemId: systemId,
    targetTable: ENTITY_NAMES.SubsystemDataLink,
    operation: CHANGE_OPERATION.Create,
    fieldPath: '$',
    newValue: {
      sourceNodeSystemId: NODE_A,
      destinationNodeSystemId: NODE_B,
      sourcePortSystemId: PORT_SRC,
      destinationPortSystemId: PORT_DST,
      dataLinkSystemId: null,
      fileSystemId: FILE_ID,
    },
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    groupId: 'existing-group',
    linkedEntityGroupId: null,
  });
}

function makeRepo(
  qr: QueryRunner,
  sessionId: number,
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
  return new TypeOrmDataLinkRepository(
    new PendingChangeWriter(
      new EditActionsQueryService(qr.manager),
      new PendingChangeCache(),
    ),
    qr.manager,
    uow,
  );
}

async function getActiveActions(qr: QueryRunner, sessionId: number) {
  return qr.manager
    .getRepository(EditActionSchema)
    .createQueryBuilder('editAction')
    .where('editAction.sessionId = :sessionId', {sessionId})
    .andWhere('editAction.validUntil IS NULL')
    .orderBy('editAction.changeId', 'ASC')
    .getMany();
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

  it('returns [] when portSystemIds is empty', async () => {
    const repo = makeRepo(qr, sessionId);
    expect(await repo.getLinksByPortSystemIds([], FILE_ID)).toEqual([]);
  });

  it('returns links whose src port is in the list', async () => {
    await seedDataLink(ds, 999, PORT_SRC, PORT_DST);
    const repo = makeRepo(qr, sessionId);
    const result = await repo.getLinksByPortSystemIds([PORT_SRC], FILE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].linkSystemId).toBe(999);
    expect(result[0].portSystemId).toBe(PORT_SRC);
  });

  it('returns [] when no links exist for the given ports', async () => {
    const repo = makeRepo(qr, sessionId);
    expect(await repo.getLinksByPortSystemIds([9999], FILE_ID)).toEqual([]);
  });

  it('combines effective subsystem data links with overlaid node types', async () => {
    await seedDataLink(ds, 500, PORT_SRC, PORT_DST);
    await seedSubsystemDataLink(ds, 701, 500);
    await qr.manager.getRepository(EditActionSchema).insert({
      sessionId,
      aggregateId: NODE_B,
      targetSystemId: NODE_B,
      targetTable: ENTITY_NAMES.Node,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'type',
      newValue: NodeType.Subsystem,
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Unstaged,
      groupId: 'node-update',
      linkedEntityGroupId: null,
    });

    const result = await makeRepo(qr, sessionId).findSubsystemDataRouteContext(
      FILE_ID,
    );

    expect(result.subsystemDataLinks.map(link => link.systemId)).toEqual([701]);
    expect(result.nodeTypeBySystemId).toEqual(
      new Map([
        [NODE_A, NodeType.Module],
        [NODE_B, NodeType.Subsystem],
      ]),
    );
  });

  it('deletes a canonical link and every resolved subsystem segment', async () => {
    await seedDataLink(ds, 500, PORT_SRC, PORT_DST);
    await seedSubsystemDataLink(ds, 701, 500);
    await seedSubsystemDataLink(ds, 702, 500);

    await makeRepo(qr, sessionId).deleteAggregate(500, FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.map(action => ({
        targetTable: action.targetTable,
        targetSystemId: action.targetSystemId,
        operation: action.operation,
        groupId: action.groupId,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          targetTable: ENTITY_NAMES.DataLink,
          targetSystemId: 500,
          operation: CHANGE_OPERATION.Delete,
          groupId: 'test-group',
        },
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: 701,
          operation: CHANGE_OPERATION.Delete,
          groupId: 'test-group',
        },
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: 702,
          operation: CHANGE_OPERATION.Delete,
          groupId: 'test-group',
        },
      ]),
    );
  });

  it('deletes an unresolved segment without deleting a canonical link', async () => {
    await seedUnresolvedSubsystemDataLink(qr, sessionId, 703);

    await makeRepo(qr, sessionId).deleteSubsystemDataLinks([703], FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemDataLink &&
          action.targetSystemId === 703 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.DataLink &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(0);
  });

  it('deletes a resolved target and canonical link while nulling its sibling', async () => {
    await seedDataLink(ds, 500, PORT_SRC, PORT_DST);
    await seedSubsystemDataLink(ds, 701, 500);
    await seedSubsystemDataLink(ds, 702, 500);

    await makeRepo(qr, sessionId).deleteSubsystemDataLinks([701], FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemDataLink &&
          action.targetSystemId === 701 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.DataLink &&
          action.targetSystemId === 500 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions.find(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemDataLink &&
          action.targetSystemId === 702 &&
          action.operation === CHANGE_OPERATION.Update,
      )?.newValue,
    ).toEqual({dataLinkSystemId: null});
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemDataLink &&
          action.targetSystemId === 702 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(0);
  });

  it('deletes a shared canonical link once for multiple resolved targets', async () => {
    await seedDataLink(ds, 500, PORT_SRC, PORT_DST);
    await seedSubsystemDataLink(ds, 701, 500);
    await seedSubsystemDataLink(ds, 702, 500);
    await seedSubsystemDataLink(ds, 703, 500);

    await makeRepo(qr, sessionId).deleteSubsystemDataLinks([701, 702], FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.DataLink &&
          action.targetSystemId === 500 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions
        .filter(
          action =>
            action.targetTable === ENTITY_NAMES.SubsystemDataLink &&
            action.operation === CHANGE_OPERATION.Delete,
        )
        .map(action => action.targetSystemId)
        .sort((left, right) => left - right),
    ).toEqual([701, 702]);
    expect(
      actions.find(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemDataLink &&
          action.targetSystemId === 703 &&
          action.operation === CHANGE_OPERATION.Update,
      )?.newValue,
    ).toEqual({dataLinkSystemId: null});
  });
});
