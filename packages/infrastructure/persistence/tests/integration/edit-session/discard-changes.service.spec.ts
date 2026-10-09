/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import type {DataSource} from 'typeorm';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {TypeOrmDiscardChangesService} from '../../../src/persistence-typeorm-sqllite/services/discard-changes/typeorm-discard-changes.service.js';
import {TypeOrmSessionRepository} from '../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {
  getTestDataSource,
  getTestRepository,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

describe('TypeOrmDiscardChangesService', () => {
  let dataSource: DataSource;
  let sessionId: number;

  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);

  beforeEach(async () => {
    await setupEachTest();
    dataSource = getTestDataSource();
    await getTestRepository(ProjectSchema).save({
      systemId: 1,
      name: 'P',
      description: '',
      type: 'Offline',
    });
    await getTestRepository(ArcDbFileSchema).save({
      systemId: 100,
      projectSystemId: 1,
      fileName: 'f.acdb',
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    const session = await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: 100,
      userId: 'u',
      clientId: 'c',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    sessionId = session.sessionId;
  });

  it('deletes staged, unstaged, current, and stale rows for only the active session', async () => {
    await dataSource.query(
      `INSERT INTO edit_actions
        (session_id, aggregate_id, target_system_id, target_table, operation,
         field_path, new_value, source, change_status, group_id, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        1,
        10,
        ENTITY_NAMES.UseCaseCategory,
        CHANGE_OPERATION.Update,
        'name',
        JSON.stringify({name: 'staged'}),
        SOURCE.Manual,
        CHANGE_STATUS.Staged,
        'g1',
        null,
        sessionId,
        1,
        11,
        ENTITY_NAMES.UseCaseCategory,
        CHANGE_OPERATION.Update,
        'name',
        JSON.stringify({name: 'unstaged'}),
        SOURCE.AutoRouting,
        CHANGE_STATUS.Unstaged,
        'g2',
        null,
        sessionId,
        1,
        12,
        ENTITY_NAMES.UseCaseCategory,
        CHANGE_OPERATION.Update,
        'name',
        JSON.stringify({name: 'stale'}),
        SOURCE.Manual,
        CHANGE_STATUS.Staged,
        'g3',
        '2026-01-01 00:00:00',
      ],
    );

    const result = await new TypeOrmDiscardChangesService(
      {
        session: {
          sessionId,
          fileSystemId: 100,
          mode: SESSION_MODE.Designer,
          projectId: '1',
        },
        groupId: 'discard-test',
      },
      new TypeOrmSessionRepository(dataSource.manager),
    ).discard();

    expect(result).toEqual({discardedEditActionCount: 3});
    await expect(
      dataSource.query('SELECT * FROM edit_actions WHERE session_id = ?', [
        sessionId,
      ]),
    ).resolves.toEqual([]);
  });

  it('is idempotent when the session has no edit actions', async () => {
    await expect(
      new TypeOrmDiscardChangesService(
        {
          session: {
            sessionId,
            fileSystemId: 100,
            mode: SESSION_MODE.Designer,
            projectId: '1',
          },
          groupId: 'discard-test',
        },
        new TypeOrmSessionRepository(dataSource.manager),
      ).discard(),
    ).resolves.toEqual({discardedEditActionCount: 0});
  });
});
