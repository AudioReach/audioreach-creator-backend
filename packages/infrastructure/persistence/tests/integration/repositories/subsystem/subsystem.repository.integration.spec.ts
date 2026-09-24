/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {DataPort, PORT_IO_TYPE, Subsystem} from '@arc/core';
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
import {TypeOrmSubsystemRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/subsystem/subsystem.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {EditActionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
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
const ROOT_SUBSYSTEM_ID = 10;
const CHILD_SUBSYSTEM_ID = 11;
const MODULE_ID = 20;
const EXISTING_DATA_PORT_ID = 1000;
const EXISTING_CONTROL_PORT_ID = 1001;

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

async function seedSubsystemGraph(ds: DataSource) {
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'subsystem', NULL, ?)`,
    [ROOT_SUBSYSTEM_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'subsystem', ?, ?)`,
    [CHILD_SUBSYSTEM_ID, ROOT_SUBSYSTEM_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', ?, ?)`,
    [MODULE_ID, CHILD_SUBSYSTEM_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO subsystems (system_id, name, subsystem_id) VALUES (?, 'Root', 1)`,
    [ROOT_SUBSYSTEM_ID],
  );
  await ds.query(
    `INSERT INTO subsystems (system_id, name, subsystem_id) VALUES (?, 'Child', 2)`,
    [CHILD_SUBSYSTEM_ID],
  );
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, name, node_system_id) VALUES (?, 1, 'INPUT_OUTPUT', 0, 'data', ?)`,
    [EXISTING_DATA_PORT_ID, ROOT_SUBSYSTEM_ID],
  );
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 1, 0, ?)`,
    [EXISTING_CONTROL_PORT_ID, ROOT_SUBSYSTEM_ID],
  );
}

function makeUow(sessionId: number) {
  return {
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
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId: number,
): TypeOrmSubsystemRepository {
  return new TypeOrmSubsystemRepository(
    new PendingChangeWriter(
      new EditActionsQueryService(manager),
      new PendingChangeCache(),
    ),
    manager,
    makeUow(sessionId),
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

describe('TypeOrmSubsystemRepository (integration)', () => {
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
    await seedSubsystemGraph(ds);
    sessionId = await seedSession(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  it('returns effective subsystem summaries with hierarchy parents', async () => {
    const summaries = await makeRepo(qr.manager, sessionId).getSubsystems(
      FILE_ID,
    );

    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          systemId: ROOT_SUBSYSTEM_ID,
          naturalId: 1,
          name: 'Root',
          parentSystemId: null,
          moduleSystemIds: [],
          subsystemSystemIds: [CHILD_SUBSYSTEM_ID],
        }),
        expect.objectContaining({
          systemId: CHILD_SUBSYSTEM_ID,
          naturalId: 2,
          name: 'Child',
          parentSystemId: ROOT_SUBSYSTEM_ID,
          moduleSystemIds: [MODULE_ID],
          subsystemSystemIds: [],
        }),
      ]),
    );
  });

  it('returns session-aware node topology', async () => {
    const repo = makeRepo(qr.manager, sessionId);
    const before = await repo.getAllNodesWithParents(FILE_ID);
    expect(before).toEqual(
      expect.arrayContaining([
        {systemId: ROOT_SUBSYSTEM_ID, parentSystemId: null, type: 'subsystem'},
        {
          systemId: CHILD_SUBSYSTEM_ID,
          parentSystemId: ROOT_SUBSYSTEM_ID,
          type: 'subsystem',
        },
        {
          systemId: MODULE_ID,
          parentSystemId: CHILD_SUBSYSTEM_ID,
          type: 'module',
        },
      ]),
    );

    await makeWriter(qr.manager).writeDelta(
      {
        targetTable: ENTITY_NAMES.Node,
        targetSystemId: MODULE_ID,
        aggregateId: MODULE_ID,
        delta: {parentSystemId: ROOT_SUBSYSTEM_ID},
      },
      sessionId,
      'move-group',
      qr.manager,
    );

    const after = await repo.getAllNodesWithParents(FILE_ID);
    expect(after.find(row => row.systemId === MODULE_ID)?.parentSystemId).toBe(
      ROOT_SUBSYSTEM_ID,
    );
  });

  it('loads subsystem ports and applies staged port changes', async () => {
    const repo = makeRepo(qr.manager, sessionId);
    const subsystem = await repo.getSubsystem(ROOT_SUBSYSTEM_ID, FILE_ID);
    expect(subsystem).toBeInstanceOf(Subsystem);
    expect(subsystem?.dataPorts).toHaveLength(1);
    expect(subsystem?.dataPorts[0].systemId).toBe(EXISTING_DATA_PORT_ID);
    expect(subsystem?.controlPorts).toHaveLength(1);
    expect(subsystem?.controlPorts[0].systemId).toBe(EXISTING_CONTROL_PORT_ID);

    await repo.addDataPort(
      new DataPort({
        systemId: 1002,
        dataPortId: 2,
        portIoType: PORT_IO_TYPE.OutputInput,
        isStatic: false,
        name: 'new-data',
      }),
      ROOT_SUBSYSTEM_ID,
    );

    const updated = await repo.getSubsystem(ROOT_SUBSYSTEM_ID, FILE_ID);
    expect(updated?.dataPorts.map(port => port.systemId)).toEqual(
      expect.arrayContaining([EXISTING_DATA_PORT_ID, 1002]),
    );
  });

  it('stages parent and port writes in one session group', async () => {
    const repo = makeRepo(qr.manager, sessionId);
    await repo.updateParentId(MODULE_ID, ROOT_SUBSYSTEM_ID);
    await repo.removeDataPort(EXISTING_DATA_PORT_ID, ROOT_SUBSYSTEM_ID);

    const actions = await getActiveActions(qr, sessionId);
    expect(
      actions.map(action => [action.targetTable, action.targetSystemId]),
    ).toEqual(
      expect.arrayContaining([
        [ENTITY_NAMES.Node, MODULE_ID],
        [ENTITY_NAMES.DataPort, EXISTING_DATA_PORT_ID],
      ]),
    );
    expect(new Set(actions.map(action => action.groupId))).toEqual(
      new Set(['test-group']),
    );
  });
});

function makeWriter(manager: QueryRunner['manager']): PendingChangeWriter {
  return new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
}
