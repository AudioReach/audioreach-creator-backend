/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {TypeOrmSubsystemRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/subsystem/subsystem.repository.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';

const FILE_ID = 100;
const OTHER_FILE_ID = 101;
const SESSION_GROUP = 'orphan-subsystem-test';

async function seedProjectAndFiles(ds: DataSource): Promise<void> {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save([
    {
      systemId: FILE_ID,
      projectSystemId: 1,
      fileName: 'f.acdb',
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    },
    {
      systemId: OTHER_FILE_ID,
      projectSystemId: 1,
      fileName: 'other.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    },
  ]);
}

async function seedGraph(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, subgraph_id, name, is_imported, file_system_id)
     VALUES (10, 10, 'sg10', 0, ?), (20, 20, 'sg20', 0, ?),
            (110, 110, 'other-sg', 0, ?)`,
    [FILE_ID, FILE_ID, OTHER_FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id)
     VALUES
       (400, 'subsystem', NULL, ?),
       (500, 'subsystem', 400, ?),
       (600, 'subsystem', NULL, ?),
       (700, 'module', 500, ?),
       (701, 'module', 500, ?),
       (702, 'module', 400, ?),
       (800, 'subsystem', NULL, ?),
       (801, 'module', 800, ?)`,
    [
      FILE_ID,
      FILE_ID,
      FILE_ID,
      FILE_ID,
      FILE_ID,
      FILE_ID,
      OTHER_FILE_ID,
      OTHER_FILE_ID,
    ],
  );
  await ds.query(
    `INSERT INTO subsystems (system_id, name, subsystem_id)
     VALUES (400, 'root', 400), (500, 'nested', 500),
            (600, 'empty', 600), (800, 'other', 800)`,
  );
  await ds.query(
    `INSERT INTO processor_definitions
       (system_id, processor_definition_id, name, file_system_id)
     VALUES (900, 900, 'processor', ?), (901, 901, 'other-processor', ?)`,
    [FILE_ID, OTHER_FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_definitions
       (system_id, module_definition_id, name, stack_size,
        file_system_id, is_loaded_at_bootup, processor_system_id)
     VALUES (910, 910, 'definition', 0, ?, 0, 900),
            (911, 911, 'other-definition', 0, ?, 0, 901)`,
    [FILE_ID, OTHER_FILE_ID],
  );
  await ds.query(
    `INSERT INTO containers
       (system_id, container_id, container_type_system_id, file_system_id)
     VALUES (920, 920, NULL, ?), (921, 921, NULL, ?)`,
    [FILE_ID, OTHER_FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules
       (system_id, instance_id, alias, subgraph_system_id,
        container_system_id, definition_system_id, file_system_id)
     VALUES (700, 700, 'm700', 10, 920, 910, ?),
            (701, 701, 'm701', 20, 920, 910, ?),
            (702, 702, 'm702', 10, 920, 910, ?),
            (801, 801, 'other-m', 110, 921, 911, ?)`,
    [FILE_ID, FILE_ID, FILE_ID, OTHER_FILE_ID],
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

async function seedOverlayModule(
  ds: DataSource,
  sessionId: number,
): Promise<void> {
  await ds.query(
    `INSERT INTO edit_actions
       (session_id, aggregate_id, target_system_id, target_table, operation,
        field_path, new_value, source, change_status, group_id)
     VALUES (?, 703, 703, ?, 'CREATE', '$', ?, 'MANUAL', 'STAGED', ?)`,
    [
      sessionId,
      ENTITY_NAMES.Node,
      JSON.stringify({
        systemId: 703,
        type: 'module',
        parentSystemId: 400,
        fileSystemId: FILE_ID,
      }),
      SESSION_GROUP,
    ],
  );
  await ds.query(
    `INSERT INTO edit_actions
       (session_id, aggregate_id, target_system_id, target_table, operation,
        field_path, new_value, source, change_status, group_id)
     VALUES (?, 703, 703, ?, 'CREATE', '$', ?, 'MANUAL', 'STAGED', ?)`,
    [
      sessionId,
      ENTITY_NAMES.SpfModule,
      JSON.stringify({
        systemId: 703,
        naturalId: 703,
        alias: 'overlay-m',
        subgraphSystemId: 20,
        containerSystemId: 920,
        definitionSystemId: 910,
        fileSystemId: FILE_ID,
      }),
      SESSION_GROUP,
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
      groupId: SESSION_GROUP,
    }),
  } as never;
  return new TypeOrmSubsystemRepository(writer, manager, uow);
}

describe('TypeOrmSubsystemRepository orphan subsystem lookup (integration)', () => {
  let ds: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFiles(ds);
    await seedGraph(ds);
    const sessionId = await seedSession(ds);
    await seedOverlayModule(ds, sessionId);
    queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    (queryRunner as QueryRunner & {sessionId?: number}).sessionId = sessionId;
  });

  afterEach(async () => {
    if (queryRunner?.isReleased === false) await queryRunner.release();
  });

  it('returns sorted orphan subsystems, including nested and overlay-aware relationships', async () => {
    const sessionId = (queryRunner as QueryRunner & {sessionId: number})
      .sessionId;
    const repository = makeRepository(queryRunner.manager, sessionId);

    await expect(
      repository.findOrphanSubsystemSystemIds(FILE_ID),
    ).resolves.toEqual([600]);
    await expect(
      repository.findOrphanSubsystemSystemIds(OTHER_FILE_ID),
    ).resolves.toEqual([]);
  });
});
