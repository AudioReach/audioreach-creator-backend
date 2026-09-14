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
import {SubsystemOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/subsystem-overlay-fetcher.js';
import {TypeOrmSubsystemRepository} from '../../../src/persistence-typeorm-sqllite/repositories/subsystem/subsystem.repository.js';
import {PendingChangeWriter} from '../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {NODE_TYPE} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
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
const SUBSYSTEM_ID = 200;

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

async function seedSubsystem(
  ds: DataSource,
  parentSystemId: number | null = null,
): Promise<void> {
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id)
     VALUES (?, ?, ?, ?)`,
    [SUBSYSTEM_ID, NODE_TYPE.Subsystem, parentSystemId, FILE_ID],
  );
  await ds.query(
    `INSERT INTO subsystems (system_id, name, subsystem_id)
     VALUES (?, 'base', 1)`,
    [SUBSYSTEM_ID],
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

async function seedEditAction(
  ds: DataSource,
  options: {
    sessionId: number;
    aggregateId: number;
    targetSystemId: number;
    targetTable: string;
    operation: string;
    newValue: string;
    fieldPath?: string | null;
  },
): Promise<void> {
  await ds.query(
    `INSERT INTO edit_actions
       (session_id, aggregate_id, target_system_id, target_table, operation,
        field_path, new_value, source, change_status, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      options.sessionId,
      options.aggregateId,
      options.targetSystemId,
      options.targetTable,
      options.operation,
      options.fieldPath ?? null,
      options.newValue,
      SOURCE.Manual,
      CHANGE_STATUS.Staged,
    ],
  );
}

function makeRepository(
  manager: QueryRunner['manager'],
  sessionId: number,
): TypeOrmSubsystemRepository {
  const writer = new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
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
  return new TypeOrmSubsystemRepository(writer, manager, uow);
}

describe('SubsystemOverlayFetcher (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;
  let fetcher: SubsystemOverlayFetcher;

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
    fetcher = new SubsystemOverlayFetcher(
      qr.manager,
      new EditActionsQueryService(qr.manager),
    );
  });
  afterEach(async () => {
    await qr.release();
  });

  it('applies a Node parentSystemId update to the effective subsystem', async () => {
    await seedSubsystem(ds, 10);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBSYSTEM_ID,
      targetSystemId: SUBSYSTEM_ID,
      targetTable: ENTITY_NAMES.Node,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'parentSystemId',
      newValue: '20',
    });

    await expect(fetcher.fetchAll(FILE_ID, sessionId)).resolves.toEqual([
      expect.objectContaining({systemId: SUBSYSTEM_ID, parentSystemId: 20}),
    ]);
  });

  it('excludes a subsystem when its effective Node type changes', async () => {
    await seedSubsystem(ds);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBSYSTEM_ID,
      targetSystemId: SUBSYSTEM_ID,
      targetTable: ENTITY_NAMES.Node,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'type',
      newValue: JSON.stringify(NODE_TYPE.Module),
    });

    await expect(fetcher.fetchAll(FILE_ID, sessionId)).resolves.toEqual([]);
  });

  it('excludes a subsystem when its effective Node is deleted', async () => {
    await seedSubsystem(ds);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBSYSTEM_ID,
      targetSystemId: SUBSYSTEM_ID,
      targetTable: ENTITY_NAMES.Node,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });

    await expect(fetcher.fetchAll(FILE_ID, sessionId)).resolves.toEqual([]);
  });

  it('includes a subsystem created through its Node and Subsystem actions', async () => {
    const sessionId = await seedSession(ds);
    const createdId = 201;
    await seedEditAction(ds, {
      sessionId,
      aggregateId: createdId,
      targetSystemId: createdId,
      targetTable: ENTITY_NAMES.Node,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({
        type: NODE_TYPE.Subsystem,
        parentSystemId: 10,
        fileSystemId: FILE_ID,
      }),
    });
    await seedEditAction(ds, {
      sessionId,
      aggregateId: createdId,
      targetSystemId: createdId,
      targetTable: ENTITY_NAMES.Subsystem,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({name: 'created', subsystemId: 2}),
    });

    await expect(fetcher.fetchAll(FILE_ID, sessionId)).resolves.toEqual([
      expect.objectContaining({
        systemId: createdId,
        name: 'created',
        parentSystemId: 10,
      }),
    ]);
  });

  it('uses effective subsystem ports when clearing control-port intents', async () => {
    await seedSubsystem(ds);
    await ds.query(
      `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id)
       VALUES (300, 1, 1, ?)`,
      [SUBSYSTEM_ID],
    );
    await ds.query(
      `INSERT INTO intents (system_id, intent_id, control_port_system_id)
       VALUES (301, 1, 300)`,
    );
    const sessionId = await seedSession(ds);

    await makeRepository(qr.manager, sessionId).clearControlPortIntents(
      [{subsystemSystemId: SUBSYSTEM_ID, controlPortSystemId: 300}],
      FILE_ID,
    );

    await expect(
      ds.query(
        `SELECT target_table AS targetTable, target_system_id AS targetSystemId
         FROM edit_actions
         WHERE session_id = ?`,
        [sessionId],
      ),
    ).resolves.toEqual([
      {targetTable: ENTITY_NAMES.Intent, targetSystemId: 301},
    ]);
  });
});
