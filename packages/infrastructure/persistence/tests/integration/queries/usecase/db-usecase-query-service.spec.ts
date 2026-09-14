/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  RESULT_KIND,
  Result,
  SOURCE,
  USECASE_TYPE,
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
import {DbUseCaseQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/usecase/db-usecase-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {UsecaseOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/usecase-overlay-fetcher.js';
import {UsecaseGkvValuesFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/usecase-gkv-values-fetcher.js';
import {UseCaseCategoryFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/usecase-category-fetcher.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;
const USECASE_ID = 900;
const CREATE_GROUP = 'create-group';
const DELETE_GROUP = 'delete-group';

describe('DbUseCaseQueryService.getChangeDetails (integration)', () => {
  let dataSource: DataSource;
  let service: DbUseCaseQueryService;
  let sessionId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    dataSource = getTestDataSource();
    await seedProjectFileAndSession();

    const editActions = new EditActionsQueryService(dataSource.manager);
    const usecaseFetcher = new UsecaseOverlayFetcher(
      dataSource.manager,
      editActions,
      new UseCaseCategoryFetcher(dataSource.manager, editActions),
      new UsecaseGkvValuesFetcher(dataSource.manager, editActions),
    );
    service = new DbUseCaseQueryService(
      dataSource,
      {
        getKeyValueSummaryForGivenValues: async (valueSystemIds: number[]) =>
          Result.ok(
            valueSystemIds.includes(700)
              ? [
                  {
                    key: {systemId: 70, naturalId: 7, name: 'Device'},
                    value: {systemId: 700, naturalId: 70, name: 'Speaker'},
                  },
                ]
              : [],
          ),
      } as any,
      {} as any,
      new TypeOrmSessionRepository(dataSource.manager),
      editActions,
      usecaseFetcher,
      {} as any,
    );
  });

  it('returns a session-created UseCase as the before snapshot after its deletion', async () => {
    await seedCreateActions();
    await dataSource.query(
      `UPDATE edit_actions SET valid_until = datetime('now')
       WHERE session_id = ? AND target_system_id = ? AND target_table = ?`,
      [sessionId, USECASE_ID, ENTITY_NAMES.UseCase],
    );
    const deleteChangeId = await seedAction({
      groupId: DELETE_GROUP,
      targetSystemId: USECASE_ID,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Delete,
      payload: {},
    });

    const result = await service.getChangeDetails(FILE_ID, DELETE_GROUP);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([
      expect.objectContaining({
        systemId: USECASE_ID,
        changeId: deleteChangeId,
        operation: CHANGE_OPERATION.Delete,
        after: null,
        before: expect.objectContaining({
          systemId: USECASE_ID,
          type: USECASE_TYPE.Linked,
          alias: 'session-created',
          aliasId: 91,
          gkv: [
            {
              key: {systemId: 70, naturalId: 7, name: 'Device'},
              value: {systemId: 700, naturalId: 70, name: 'Speaker'},
            },
          ],
          categories: ['voice'],
          subgraphSystemIds: [501, 502],
          subgraphPairs: [
            {sourceSubgraphSystemId: 501, destSubgraphSystemId: 502},
          ],
        }),
      }),
    ]);
  });

  async function seedProjectFileAndSession(): Promise<void> {
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
    const session = await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: FILE_ID,
      userId: 'u',
      clientId: 'c',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    sessionId = session.sessionId;
  }

  async function seedCreateActions(): Promise<void> {
    await seedAction({
      groupId: CREATE_GROUP,
      targetSystemId: USECASE_ID,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Create,
      payload: {
        aliasId: 91,
        alias: 'session-created',
        type: USECASE_TYPE.Linked,
        fileSystemId: FILE_ID,
      },
    });
    await seedAction({
      groupId: CREATE_GROUP,
      targetSystemId: 901,
      targetTable: ENTITY_NAMES.UsecaseGkvValues,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, valueDefSystemId: 700},
    });
    await seedAction({
      groupId: CREATE_GROUP,
      targetSystemId: 902,
      targetTable: ENTITY_NAMES.UseCaseCategory,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, name: 'voice'},
    });
    await seedAction({
      groupId: CREATE_GROUP,
      targetSystemId: 903,
      targetTable: ENTITY_NAMES.UseCaseSubgraph,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, subgraphSystemId: 501},
    });
    await seedAction({
      groupId: CREATE_GROUP,
      targetSystemId: 904,
      targetTable: ENTITY_NAMES.UseCaseSubgraph,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, subgraphSystemId: 502},
    });
    await seedAction({
      groupId: CREATE_GROUP,
      targetSystemId: 905,
      targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
      operation: CHANGE_OPERATION.Create,
      payload: {
        usecaseSystemId: USECASE_ID,
        sourceSubgraphSystemId: 501,
        destSubgraphSystemId: 502,
      },
    });
  }

  async function seedAction(input: {
    groupId: string;
    targetSystemId: number;
    targetTable: string;
    operation: string;
    payload: Record<string, unknown>;
  }): Promise<number> {
    await dataSource.query(
      `INSERT INTO edit_actions
       (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        sessionId,
        USECASE_ID,
        input.targetSystemId,
        input.targetTable,
        input.operation,
        JSON.stringify(input.payload),
        SOURCE.Manual,
        CHANGE_STATUS.Staged,
        input.groupId,
      ],
    );
    const result: Array<{id: number}> = await dataSource.query(
      'SELECT last_insert_rowid() AS id',
    );
    return result[0].id;
  }
});
