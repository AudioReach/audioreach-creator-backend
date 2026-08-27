/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, NodeType, SOURCE} from '@arc/core';
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

async function seedSubsystemControlLink(
  ds: DataSource,
  systemId: number,
  controlLinkSystemId: number,
) {
  await ds.query(
    `INSERT INTO subsystem_control_links
       (system_id, peer_nodeA_system_id, peer_nodeB_system_id,
        nodeA_port_system_id, nodeB_port_system_id,
        control_link_system_id, file_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      systemId,
      NODE_A,
      NODE_B,
      PORT_CP_A,
      PORT_CP_B,
      controlLinkSystemId,
      FILE_ID,
    ],
  );
}

async function seedUnresolvedSubsystemControlLink(
  qr: QueryRunner,
  sessionId: number,
  systemId: number,
) {
  await qr.manager.getRepository(EditActionSchema).insert({
    sessionId,
    aggregateId: systemId,
    targetSystemId: systemId,
    targetTable: ENTITY_NAMES.SubsystemControlLink,
    operation: CHANGE_OPERATION.Create,
    fieldPath: '$',
    newValue: {
      peerNodeASystemId: NODE_A,
      peerNodeBSystemId: NODE_B,
      nodeAPortSystemId: PORT_CP_A,
      nodeBPortSystemId: PORT_CP_B,
      controlLinkSystemId: null,
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
  return new TypeOrmControlLinkRepository(
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

  it('combines effective subsystem links with overlaid node types at repository level', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
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

    const result = await makeRepo(
      qr,
      sessionId,
    ).findSubsystemControlRouteContext(FILE_ID);

    expect(result.subsystemControlLinks).toHaveLength(1);
    expect(result.subsystemControlLinks[0].systemId).toBe(801);
    expect(result.nodeTypeBySystemId).toEqual(
      new Map([
        [NODE_A, NodeType.Module],
        [NODE_B, NodeType.Subsystem],
      ]),
    );
  });

  it('deletes a canonical link and every resolved subsystem segment', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
    await seedSubsystemControlLink(ds, 802, 800);

    await makeRepo(qr, sessionId).deleteAggregate(800, FILE_ID);

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
          targetTable: ENTITY_NAMES.ControlLink,
          targetSystemId: 800,
          operation: CHANGE_OPERATION.Delete,
          groupId: 'test-group',
        },
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: 801,
          operation: CHANGE_OPERATION.Delete,
          groupId: 'test-group',
        },
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: 802,
          operation: CHANGE_OPERATION.Delete,
          groupId: 'test-group',
        },
      ]),
    );
  });

  it('deletes an unresolved segment without deleting a canonical link', async () => {
    await seedUnresolvedSubsystemControlLink(qr, sessionId, 803);

    await makeRepo(qr, sessionId).deleteSubsystemControlLinks([803], FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 803 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.ControlLink &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(0);
  });

  it('deletes a resolved target and canonical link while nulling its sibling', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
    await seedSubsystemControlLink(ds, 802, 800);

    await makeRepo(qr, sessionId).deleteSubsystemControlLinks([801], FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 801 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.ControlLink &&
          action.targetSystemId === 800 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions.find(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 802 &&
          action.operation === CHANGE_OPERATION.Update,
      )?.newValue,
    ).toEqual({controlLinkSystemId: null});
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 802 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(0);
  });

  it('deletes a shared canonical link once for multiple resolved targets', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
    await seedSubsystemControlLink(ds, 802, 800);
    await seedSubsystemControlLink(ds, 803, 800);

    await makeRepo(qr, sessionId).deleteSubsystemControlLinks(
      [801, 802],
      FILE_ID,
    );

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.ControlLink &&
          action.targetSystemId === 800 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(1);
    expect(
      actions
        .filter(
          action =>
            action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
            action.operation === CHANGE_OPERATION.Delete,
        )
        .map(action => action.targetSystemId)
        .sort((left, right) => left - right),
    ).toEqual([801, 802]);
    expect(
      actions.find(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 803 &&
          action.operation === CHANGE_OPERATION.Update,
      )?.newValue,
    ).toEqual({controlLinkSystemId: null});
  });
});
