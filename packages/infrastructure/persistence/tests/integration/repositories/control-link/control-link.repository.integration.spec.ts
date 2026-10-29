/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  CONTROL_LINK_TYPE,
  ControlLink,
  SOURCE,
  SubsystemControlLink,
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
const PORT_SEGMENT_A = 303;
const PORT_SEGMENT_B = 304;

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
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 3, 1, ?)`,
    [PORT_SEGMENT_A, NODE_A],
  );
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 4, 1, ?)`,
    [PORT_SEGMENT_B, NODE_B],
  );
}

async function seedControlLink(
  ds: DataSource,
  systemId: number,
  portA: number,
  portB: number,
) {
  await ds.query(
    `INSERT INTO control_links (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id, nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type, source_subgraph_system_id, dest_subgraph_system_id) VALUES (?, ?, ?, ?, ?, ?, 0, 'NORMAL', ?, ?)`,
    [systemId, FILE_ID, NODE_A, NODE_B, portA, portB, SUBGRAPH_ID, SUBGRAPH_ID],
  );
}

async function seedSubsystemControlLink(
  ds: DataSource,
  systemId: number,
  controlLinkSystemId: number,
  nodeAPortSystemId = PORT_CP_A,
  nodeBPortSystemId = PORT_CP_B,
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
      nodeAPortSystemId,
      nodeBPortSystemId,
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

  it('returns subsystem segments whose ports are not canonical link ports', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(
      ds,
      801,
      800,
      PORT_SEGMENT_A,
      PORT_SEGMENT_B,
    );

    const result = await makeRepo(qr, sessionId).getLinksByPortSystemIds(
      [PORT_SEGMENT_A, PORT_SEGMENT_B],
      FILE_ID,
    );

    expect(result).toEqual([
      {linkSystemId: 801, portSystemId: PORT_SEGMENT_A},
      {linkSystemId: 801, portSystemId: PORT_SEGMENT_B},
    ]);
  });

  it('returns [] when no links exist for the given ports', async () => {
    const repo = makeRepo(qr, sessionId);
    expect(await repo.getLinksByPortSystemIds([9999], FILE_ID)).toEqual([]);
  });

  it('groups attached and standalone subsystem control links', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
    await seedUnresolvedSubsystemControlLink(qr, sessionId, 803);

    const result = await makeRepo(qr, sessionId).findAllLinks(FILE_ID);

    expect(result.controlLinks.map(link => link.systemId)).toEqual([800]);
    expect(result.controlLinks[0]?.subsystemControlLinks).toHaveLength(1);
    expect(result.controlLinks[0]?.subsystemControlLinks[0].systemId).toBe(801);
    expect(
      result.unresolvedSubsystemControlLinks.map(link => link.systemId),
    ).toEqual([803]);
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
        linkedEntityGroupId: action.linkedEntityGroupId,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          targetTable: ENTITY_NAMES.ControlLink,
          targetSystemId: 800,
          operation: CHANGE_OPERATION.Delete,
          linkedEntityGroupId: null,
        },
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: 801,
          operation: CHANGE_OPERATION.Delete,
          linkedEntityGroupId: null,
        },
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: 802,
          operation: CHANGE_OPERATION.Delete,
          linkedEntityGroupId: null,
        },
      ]),
    );
  });

  it('creates a canonical link', async () => {
    const link = new ControlLink(
      800,
      FILE_ID,
      NODE_A,
      NODE_B,
      PORT_CP_A,
      PORT_CP_B,
      0,
      CONTROL_LINK_TYPE.Normal,
      SUBGRAPH_ID,
      SUBGRAPH_ID,
    );

    await makeRepo(qr, sessionId).createAggregate(link, FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetTable: ENTITY_NAMES.ControlLink,
          targetSystemId: 800,
          operation: CHANGE_OPERATION.Create,
          newValue: expect.objectContaining({
            fileSystemId: FILE_ID,
            peerNodeASystemId: NODE_A,
            peerNodeBSystemId: NODE_B,
          }),
        }),
      ]),
    );
  });

  it('deletes an unresolved segment without deleting a canonical link', async () => {
    await seedUnresolvedSubsystemControlLink(qr, sessionId, 803);

    const repo = makeRepo(qr, sessionId);
    const segment = (await repo.findAllLinks(FILE_ID))
      .unresolvedSubsystemControlLinks[0];
    await repo.deleteSubsystemControlLinks([segment], FILE_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 803,
      ),
    ).toHaveLength(0);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.ControlLink &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(0);
  });

  it('deletes the canonical link and detaches remaining resolved segments', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
    await seedSubsystemControlLink(ds, 802, 800);

    const repo = makeRepo(qr, sessionId);
    const segment = (await repo.findAllLinks(FILE_ID)).controlLinks[0]
      ?.subsystemControlLinks[0];
    await repo.deleteSubsystemControlLinks([segment!], FILE_ID);

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
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 802 &&
          action.operation === CHANGE_OPERATION.Delete,
      ),
    ).toHaveLength(0);
    expect(
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 802 &&
          action.operation === CHANGE_OPERATION.Update,
      ),
    ).toHaveLength(1);
    expect(
      actions.find(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 802 &&
          action.operation === CHANGE_OPERATION.Update,
      )?.newValue,
    ).toMatchObject({controlLinkSystemId: null});
  });

  it('deletes a canonical link when multiple segments are selected', async () => {
    await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
    await seedSubsystemControlLink(ds, 801, 800);
    await seedSubsystemControlLink(ds, 802, 800);
    await seedSubsystemControlLink(ds, 803, 800);

    const repo = makeRepo(qr, sessionId);
    const segments = (
      await repo.findAllLinks(FILE_ID)
    ).controlLinks[0]?.subsystemControlLinks.filter(segment =>
      [801, 802].includes(segment.systemId),
    );
    await repo.deleteSubsystemControlLinks(segments ?? [], FILE_ID);

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
      actions.filter(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 803 &&
          action.operation === CHANGE_OPERATION.Update,
      ),
    ).toHaveLength(1);
    expect(
      actions.find(
        action =>
          action.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          action.targetSystemId === 803 &&
          action.operation === CHANGE_OPERATION.Update,
      )?.newValue,
    ).toMatchObject({controlLinkSystemId: null});
  });

  describe('Phase-0 subsystem-link resolution', () => {
    it('normalizes canonical and segment IDs in request order', async () => {
      await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
      await seedSubsystemControlLink(ds, 801, 800);

      const resolutions = await makeRepo(
        qr,
        sessionId,
      ).findCanonicalLinksByAnySystemIds([800, 801, 999], FILE_ID);

      expect(
        resolutions.map(resolution => resolution.requestedSystemId),
      ).toEqual([800, 801, 999]);
      expect(resolutions[0]).toMatchObject({
        isSegment: false,
        canonicalLink: {systemId: 800},
      });
      expect(resolutions[1]).toMatchObject({
        isSegment: true,
        canonicalLink: {systemId: 800},
      });
      expect(resolutions[2]).toMatchObject({
        isSegment: false,
        canonicalLink: null,
      });
    });

    it('identifies an unresolved session-created segment without a canonical parent', async () => {
      await seedUnresolvedSubsystemControlLink(qr, sessionId, 803);

      const [resolution] = await makeRepo(
        qr,
        sessionId,
      ).findCanonicalLinksByAnySystemIds([803], FILE_ID);

      expect(resolution).toMatchObject({
        requestedSystemId: 803,
        isSegment: true,
        canonicalLink: null,
      });
    });

    it('short-circuits canonical-ID normalization for empty input', async () => {
      await expect(
        makeRepo(qr, sessionId).findCanonicalLinksByAnySystemIds([], FILE_ID),
      ).resolves.toEqual([]);
    });

    it('writes an UPDATE delta for a committed segment and exposes its new parent in the overlay', async () => {
      await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
      await seedControlLink(ds, 900, PORT_SEGMENT_A, PORT_SEGMENT_B);
      await seedSubsystemControlLink(ds, 801, 800);
      const repo = makeRepo(qr, sessionId);
      const segment = (await repo.findAllLinks(FILE_ID)).controlLinks[0]
        ?.subsystemControlLinks[0];

      await repo.resolveSubsystemControlLinks([segment!], 900, {
        source: SOURCE.Manual,
        linkedEntityGroupId: 'group-A',
      });

      const [action] = (await getActiveActions(qr, sessionId)).filter(
        candidate =>
          candidate.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          candidate.targetSystemId === 801,
      );
      expect(action).toMatchObject({
        operation: CHANGE_OPERATION.Update,
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: 'group-A',
        newValue: {controlLinkSystemId: 900},
      });
      expect(
        (await repo.findAllLinks(FILE_ID)).controlLinks
          .find(link => link.systemId === 900)
          ?.subsystemControlLinks.map(link => link.systemId),
      ).toEqual([801]);
    });

    it('absorbs resolution into a session-created segment payload and keeps CREATE metadata', async () => {
      await seedControlLink(ds, 800, PORT_CP_A, PORT_CP_B);
      await seedUnresolvedSubsystemControlLink(qr, sessionId, 803);
      const repo = makeRepo(qr, sessionId);
      const segment = (await repo.findAllLinks(FILE_ID))
        .unresolvedSubsystemControlLinks[0];

      await repo.resolveSubsystemControlLinks([segment], 800, {
        source: SOURCE.Manual,
        linkedEntityGroupId: 'group-A',
      });

      const [action] = (await getActiveActions(qr, sessionId)).filter(
        candidate =>
          candidate.targetTable === ENTITY_NAMES.SubsystemControlLink &&
          candidate.targetSystemId === 803,
      );
      expect(action).toMatchObject({
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
        newValue: {controlLinkSystemId: 800},
      });
      const topology = await repo.findAllLinks(FILE_ID);
      expect(topology.unresolvedSubsystemControlLinks).toEqual([]);
      expect(
        topology.controlLinks[0]?.subsystemControlLinks.map(
          link => link.systemId,
        ),
      ).toEqual([803]);
    });

    it('does not write when there are no subsystem segments to resolve', async () => {
      const repo = makeRepo(qr, sessionId);

      await repo.resolveSubsystemControlLinks([], 800, {
        source: SOURCE.Manual,
      });

      await expect(getActiveActions(qr, sessionId)).resolves.toEqual([]);
    });
  });
});
