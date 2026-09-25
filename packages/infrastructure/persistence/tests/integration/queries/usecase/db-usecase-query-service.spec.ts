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
  DATA_LINK_TYPE,
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
import {LinkOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/link-overlay-fetcher.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {UseCaseSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/use-case.js';
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
      new LinkOverlayFetcher(dataSource.manager, editActions),
    );
  });

  it('projects a session-created EC UseCase with matching overlay links', async () => {
    const createChangeId = await seedCreateActions();

    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: USECASE_ID,
        changeId: createChangeId,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.DiffTool,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([
      {
        systemId: USECASE_ID,
        changeId: createChangeId,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.DiffTool,
        before: null,
        after: {
          isEc: true,
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
          dataLinks: [
            {
              systemId: 906,
              sourceNodeSystemId: 1,
              destinationNodeSystemId: 2,
              sourcePortSystemId: 3,
              destinationPortSystemId: 4,
              linkType: DATA_LINK_TYPE.Normal,
            },
          ],
          controlLinks: [
            {
              systemId: 908,
              peerNodeASystemId: 5,
              peerNodeBSystemId: 6,
              nodeAPortSystemId: 7,
              nodeBPortSystemId: 8,
              heapId: 9,
              linkType: DATA_LINK_TYPE.Normal,
            },
          ],
        },
      },
    ]);
  });

  it('uses committed before and latest overlay after for updates', async () => {
    await seedCommittedUsecase();
    const changeId = await seedAction({
      groupId: 'update-group',
      targetSystemId: USECASE_ID,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Update,
      payload: {alias: 'updated'},
    });

    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: USECASE_ID,
        changeId,
        operation: CHANGE_OPERATION.Update,
        source: SOURCE.AutoRouting,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        source: SOURCE.AutoRouting,
        before: expect.objectContaining({alias: 'committed', isEc: false}),
        after: expect.objectContaining({alias: 'updated', isEc: false}),
      }),
    );
  });

  it('preserves descriptor order and source metadata', async () => {
    const firstChangeId = await seedCreateActions();
    const secondUsecaseId = USECASE_ID + 1;
    const secondChangeId = await seedAction({
      aggregateId: secondUsecaseId,
      groupId: 'second-create-group',
      targetSystemId: secondUsecaseId,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Create,
      payload: {
        aliasId: 92,
        alias: 'second-created',
        type: USECASE_TYPE.Island,
        fileSystemId: FILE_ID,
      },
    });

    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: secondUsecaseId,
        changeId: secondChangeId,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.AutoRouting,
      },
      {
        systemId: USECASE_ID,
        changeId: firstChangeId,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.Manual,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.map(change => [change.systemId, change.source])).toEqual(
      [
        [secondUsecaseId, SOURCE.AutoRouting],
        [USECASE_ID, SOURCE.Manual],
      ],
    );
  });

  it('uses the complete latest overlay relationships across multiple action groups', async () => {
    const createChangeId = await seedCreateActions();
    await seedAction({
      groupId: 'latest-category-group',
      targetSystemId: 911,
      targetTable: ENTITY_NAMES.UseCaseCategory,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, name: 'media'},
    });

    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: USECASE_ID,
        changeId: createChangeId,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.AutoRouting,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({categories: ['voice', 'media']}),
      }),
    );
  });

  it('returns every matching supporting link in ascending systemId order', async () => {
    const createChangeId = await seedCreateActions();
    await seedAction({
      groupId: 'additional-data-link-group',
      targetSystemId: 909,
      targetTable: ENTITY_NAMES.DataLink,
      operation: CHANGE_OPERATION.Create,
      payload: {
        fileSystemId: FILE_ID,
        sourceNodeSystemId: 11,
        destinationNodeSystemId: 12,
        sourcePortSystemId: 13,
        destinationPortSystemId: 14,
        linkType: DATA_LINK_TYPE.Normal,
        sourceSubgraphSystemId: 501,
        destSubgraphSystemId: 502,
        isEc: false,
      },
    });
    await seedAction({
      groupId: 'additional-control-link-group',
      targetSystemId: 910,
      targetTable: ENTITY_NAMES.ControlLink,
      operation: CHANGE_OPERATION.Create,
      payload: {
        fileSystemId: FILE_ID,
        peerNodeASystemId: 15,
        peerNodeBSystemId: 16,
        nodeAPortSystemId: 17,
        nodeBPortSystemId: 18,
        heapId: 19,
        linkType: DATA_LINK_TYPE.Normal,
        sourceSubgraphSystemId: 501,
        destSubgraphSystemId: 502,
      },
    });

    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: USECASE_ID,
        changeId: createChangeId,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.AutoRouting,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0]?.after?.dataLinks.map(link => link.systemId)).toEqual(
      [906, 909],
    );
    expect(
      result.data[0]?.after?.controlLinks.map(link => link.systemId),
    ).toEqual([908, 910]);
  });

  it('rejects duplicate emitted UseCase IDs', async () => {
    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: USECASE_ID,
        changeId: 1,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.Manual,
      },
      {
        systemId: USECASE_ID,
        changeId: 2,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.DiffTool,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('projects committed state as before and null after for deletes', async () => {
    await seedCommittedUsecase();
    const changeId = await seedAction({
      groupId: 'delete-group',
      targetSystemId: USECASE_ID,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Delete,
      payload: {},
    });

    const result = await service.getChangeDetails(FILE_ID, [
      {
        systemId: USECASE_ID,
        changeId,
        operation: CHANGE_OPERATION.Delete,
        source: SOURCE.Manual,
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({alias: 'committed'}),
        after: null,
      }),
    );
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

  async function seedCommittedUsecase(): Promise<void> {
    await getTestRepository(UseCaseSchema).save({
      systemId: USECASE_ID,
      aliasId: 90,
      alias: 'committed',
      type: USECASE_TYPE.Linked,
      fileSystemId: FILE_ID,
    });
  }

  async function seedCreateActions(): Promise<number> {
    const rootChangeId = await seedAction({
      groupId: 'create-group',
      targetSystemId: USECASE_ID,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Create,
      payload: {
        aliasId: 91,
        alias: 'session-created',
        type: USECASE_TYPE.Ec,
        fileSystemId: FILE_ID,
      },
    });
    await seedAction({
      groupId: 'create-group',
      targetSystemId: 901,
      targetTable: ENTITY_NAMES.UsecaseGkvValues,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, valueDefSystemId: 700},
    });
    await seedAction({
      groupId: 'create-group',
      targetSystemId: 902,
      targetTable: ENTITY_NAMES.UseCaseCategory,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, name: 'voice'},
    });
    await seedAction({
      groupId: 'create-group',
      targetSystemId: 903,
      targetTable: ENTITY_NAMES.UseCaseSubgraph,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, subgraphSystemId: 501},
    });
    await seedAction({
      groupId: 'create-group',
      targetSystemId: 904,
      targetTable: ENTITY_NAMES.UseCaseSubgraph,
      operation: CHANGE_OPERATION.Create,
      payload: {usecaseSystemId: USECASE_ID, subgraphSystemId: 502},
    });
    await seedAction({
      groupId: 'create-group',
      targetSystemId: 905,
      targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
      operation: CHANGE_OPERATION.Create,
      payload: {
        usecaseSystemId: USECASE_ID,
        sourceSubgraphSystemId: 501,
        destSubgraphSystemId: 502,
      },
    });
    await seedAction({
      groupId: 'link-group',
      targetSystemId: 906,
      targetTable: ENTITY_NAMES.DataLink,
      operation: CHANGE_OPERATION.Create,
      payload: {
        fileSystemId: FILE_ID,
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 2,
        sourcePortSystemId: 3,
        destinationPortSystemId: 4,
        linkType: DATA_LINK_TYPE.Normal,
        sourceSubgraphSystemId: 501,
        destSubgraphSystemId: 502,
        isEc: true,
      },
    });
    await seedAction({
      groupId: 'link-group',
      targetSystemId: 907,
      targetTable: ENTITY_NAMES.DataLink,
      operation: CHANGE_OPERATION.Create,
      payload: {
        fileSystemId: FILE_ID,
        sourceNodeSystemId: 2,
        destinationNodeSystemId: 1,
        sourcePortSystemId: 4,
        destinationPortSystemId: 3,
        linkType: DATA_LINK_TYPE.Normal,
        sourceSubgraphSystemId: 502,
        destSubgraphSystemId: 501,
        isEc: false,
      },
    });
    await seedAction({
      groupId: 'link-group',
      targetSystemId: 908,
      targetTable: ENTITY_NAMES.ControlLink,
      operation: CHANGE_OPERATION.Create,
      payload: {
        fileSystemId: FILE_ID,
        peerNodeASystemId: 5,
        peerNodeBSystemId: 6,
        nodeAPortSystemId: 7,
        nodeBPortSystemId: 8,
        heapId: 9,
        linkType: DATA_LINK_TYPE.Normal,
        sourceSubgraphSystemId: 502,
        destSubgraphSystemId: 501,
      },
    });
    return rootChangeId;
  }

  async function seedAction(input: {
    aggregateId?: number;
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
        input.aggregateId ?? USECASE_ID,
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
