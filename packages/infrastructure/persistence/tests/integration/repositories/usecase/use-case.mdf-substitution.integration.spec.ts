/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import {Result, SOURCE, USECASE_TYPE, UseCase} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmUsecaseRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/usecase/use-case.repository.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {
  getTestDataSource,
  getTestRepository,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../../helpers/test-database-setup.js';

const FILE_ID = 100;
const USECASE_ID = 700;
const OLD_SOURCE = 10;
const OLD_DESTINATION = 20;
const MDF_SUBGRAPH = 30;

interface NormalizedEditAction {
  readonly entity: 'usecase' | 'usecase_subgraph' | 'usecase_data_link';
  readonly operation: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly aggregateSystemId: number;
  readonly groupId: string;
  readonly sourceSubgraphSystemId: number | null;
  readonly destSubgraphSystemId: number | null;
  readonly subgraphSystemId: number | null;
  readonly sgkvAssignments: readonly {
    subgraphSystemId: number;
    valueDefinitionSystemIds: readonly number[];
  }[];
}

interface MdfPersistenceHarness {
  readonly dataSource: DataSource;
  routeSingleHop(): Promise<ReturnType<typeof Result.ok>>;
  failNextReplacementPairWrite(): void;
  wipeStagedActions(): Promise<void>;
  loadNormalizedEditActions(): Promise<ReadonlyArray<NormalizedEditAction>>;
  loadRootUsecaseDelta(): Promise<Record<string, unknown>>;
  loadOverlayTopology(usecaseSystemId: number): Promise<{
    members: readonly number[];
    pairs: readonly [number, number][];
    gkv: readonly [number, number][];
    type: string;
  }>;
  close(): Promise<void>;
}

async function seedProjectAndFile(dataSource: DataSource): Promise<void> {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'MDF project',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'mdf.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
  await dataSource.query(
    `INSERT INTO arc_keys
     (system_id, file_system_id, key_id, name, is_calibration_key, is_graph_key, is_spf_key, is_voice, is_dynamic)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0)`,
    [10, FILE_ID, 1, 'mdf-key'],
  );
  await dataSource.query(
    `INSERT INTO arc_values
     (system_id, keys_system_id, value_id, name)
     VALUES (?, ?, ?, ?)`,
    [100, 10, 100, 'mdf-value'],
  );
  await dataSource.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id)
     VALUES (?, ?, ?, 0, ?), (?, ?, ?, 0, ?), (?, ?, ?, 0, ?)`,
    [
      OLD_SOURCE,
      'sg-10',
      OLD_SOURCE,
      FILE_ID,
      MDF_SUBGRAPH,
      'sg-30',
      MDF_SUBGRAPH,
      FILE_ID,
      OLD_DESTINATION,
      'sg-20',
      OLD_DESTINATION,
      FILE_ID,
    ],
  );
  await dataSource.query(
    `INSERT INTO use_cases (system_id, alias_id, alias, type, file_system_id)
     VALUES (?, ?, ?, ?, ?)`,
    [USECASE_ID, 1, 'mdf-uc', USECASE_TYPE.Linked, FILE_ID],
  );
  await dataSource.query(
    `INSERT INTO usecase_gkv_values (usecase_system_id, value_def_system_id)
     VALUES (?, ?)`,
    [USECASE_ID, 100],
  );
  await dataSource.query(
    `INSERT INTO use_case_subgraphs (system_id, usecase_system_id, subgraph_system_id)
     VALUES (20001, ?, ?), (20002, ?, ?)`,
    [USECASE_ID, OLD_SOURCE, USECASE_ID, OLD_DESTINATION],
  );
  await dataSource.query(
    `INSERT INTO use_case_subgraph_pairs
     (system_id, usecase_system_id, source_subgraph_system_id, dest_subgraph_system_id)
     VALUES (20003, ?, ?, ?)`,
    [USECASE_ID, OLD_SOURCE, OLD_DESTINATION],
  );
}

async function createMdfPersistenceHarness(): Promise<MdfPersistenceHarness> {
  const dataSource = getTestDataSource();
  const session = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'mdf-user',
    clientId: 'mdf-client',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  const writer = new PendingChangeWriter(
    new EditActionsQueryService(queryRunner.manager),
    new PendingChangeCache(),
  );
  let nextGeneratedId = 30000;
  const repository = new TypeOrmUsecaseRepository(
    writer,
    queryRunner.manager,
    {
      getWriteContext: () => ({
        session: {
          sessionId: session.sessionId,
          fileSystemId: FILE_ID,
          mode: SESSION_MODE.Designer,
          projectId: '1',
        },
        groupId: 'mdf-group',
      }),
    } as never,
    {
      getNextId: async () => nextGeneratedId++,
      reserveBlock: async () => nextGeneratedId,
      persistLastUsedId: async () => undefined,
    },
  );
  let failPairWrite = false;
  const originalWriteCreate = writer.writeCreate.bind(writer);
  writer.writeCreate = async (
    ...args: Parameters<PendingChangeWriter['writeCreate']>
  ) => {
    const request = args[0] as {targetTable?: string};
    if (
      failPairWrite &&
      request.targetTable === ENTITY_NAMES.UseCaseSubgraphPair
    ) {
      failPairWrite = false;
      throw new Error('replacement pair write failed');
    }
    return originalWriteCreate(...args);
  };

  const projection = {
    addedSubgraphSystemIds: [MDF_SUBGRAPH],
    removedSubgraphSystemIds: [],
    addedPairs: [
      {
        sourceSubgraphSystemId: OLD_SOURCE,
        destSubgraphSystemId: MDF_SUBGRAPH,
      },
      {
        sourceSubgraphSystemId: MDF_SUBGRAPH,
        destSubgraphSystemId: OLD_DESTINATION,
      },
    ],
    removedPairs: [
      {
        sourceSubgraphSystemId: OLD_SOURCE,
        destSubgraphSystemId: OLD_DESTINATION,
      },
    ],
    resultingSubgraphSystemIds: [OLD_SOURCE, MDF_SUBGRAPH, OLD_DESTINATION],
    resultingPairs: [
      {
        sourceSubgraphSystemId: OLD_SOURCE,
        destSubgraphSystemId: MDF_SUBGRAPH,
      },
      {
        sourceSubgraphSystemId: MDF_SUBGRAPH,
        destSubgraphSystemId: OLD_DESTINATION,
      },
    ],
    resultingType: USECASE_TYPE.Linked,
    sgkvAssignments: [
      {subgraphSystemId: MDF_SUBGRAPH, valueDefinitionSystemIds: []},
    ],
  } as never;

  async function routeSingleHop(): Promise<ReturnType<typeof Result.ok>> {
    await queryRunner.startTransaction();
    try {
      const committed = new UseCase({
        systemId: USECASE_ID,
        fileSystemId: FILE_ID,
        keyVector: {valueSystemIds: [100]},
        subgraphSystemIds: [OLD_SOURCE, OLD_DESTINATION],
        subgraphPairs: [
          {
            sourceSubgraphSystemId: OLD_SOURCE,
            destSubgraphSystemId: OLD_DESTINATION,
          },
        ],
        type: USECASE_TYPE.Linked,
      });
      await repository.applyStructuralChange(
        USECASE_ID,
        {
          addedSgSystemIds: projection.addedSubgraphSystemIds,
          removedPairs: projection.removedPairs,
          addedPairs: projection.addedPairs,
        },
        {source: SOURCE.AutoRouting},
        undefined,
        projection.sgkvAssignments,
      );
      await queryRunner.commitTransaction();
      return Result.ok({emittedChanges: [], issues: [], groupId: 'mdf-group'});
    } catch {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      return Result.fail({
        code: 'TEST-PERSISTENCE-FAILURE',
        message: 'Injected replacement pair write failure',
        severity: 'ERROR',
      });
    } finally {
    }
  }

  async function loadNormalizedEditActions(): Promise<
    ReadonlyArray<NormalizedEditAction>
  > {
    const rows: Array<Record<string, unknown>> = await dataSource.query(
      `SELECT target_table, target_system_id, operation, aggregate_id, group_id, new_value
       FROM edit_actions WHERE session_id = ? ORDER BY change_id`,
      [session.sessionId],
    );
    const actions = await Promise.all(
      rows.map(async row => {
        const table = String(row.target_table);
        const operation = String(
          row.operation,
        ) as NormalizedEditAction['operation'];
        const payload = row.new_value ? JSON.parse(String(row.new_value)) : {};
        if (
          operation === 'DELETE' &&
          table === ENTITY_NAMES.UseCaseSubgraphPair
        ) {
          const [pair] = await dataSource.query(
            `SELECT source_subgraph_system_id, dest_subgraph_system_id
           FROM use_case_subgraph_pairs WHERE system_id = ?`,
            [Number(row.target_system_id)],
          );
          if (pair !== undefined) {
            payload.sourceSubgraphSystemId = pair.source_subgraph_system_id;
            payload.destSubgraphSystemId = pair.dest_subgraph_system_id;
          }
        }
        const entity =
          table === ENTITY_NAMES.UseCase
            ? 'usecase'
            : table === ENTITY_NAMES.UseCaseSubgraph
              ? 'usecase_subgraph'
              : 'usecase_data_link';
        return {
          entity,
          operation,
          aggregateSystemId: Number(row.aggregate_id),
          groupId: String(row.group_id),
          sourceSubgraphSystemId: payload.sourceSubgraphSystemId ?? null,
          destSubgraphSystemId: payload.destSubgraphSystemId ?? null,
          subgraphSystemId: payload.subgraphSystemId ?? null,
          sgkvAssignments: payload.sgkvAssignments ?? [],
        };
      }),
    );
    return actions.sort((left, right) => {
      const entityOrder = {
        usecase: 0,
        usecase_subgraph: 1,
        usecase_data_link: 2,
      } as const;
      const operationOrder = {UPDATE: 0, DELETE: 1, CREATE: 2} as const;
      return (
        entityOrder[left.entity] - entityOrder[right.entity] ||
        operationOrder[left.operation] - operationOrder[right.operation] ||
        (left.sourceSubgraphSystemId ?? -1) -
          (right.sourceSubgraphSystemId ?? -1) ||
        (left.destSubgraphSystemId ?? -1) -
          (right.destSubgraphSystemId ?? -1) ||
        (left.subgraphSystemId ?? -1) - (right.subgraphSystemId ?? -1)
      );
    });
  }

  async function loadOverlayTopology(usecaseSystemId: number) {
    const [usecase] = await repository.findBySystemIds(FILE_ID, [
      usecaseSystemId,
    ]);
    return {
      members: [...usecase.subgraphSystemIds],
      pairs: usecase.subgraphPairs.map(
        pair =>
          [pair.sourceSubgraphSystemId, pair.destSubgraphSystemId] as [
            number,
            number,
          ],
      ),
      gkv: usecase.keyVector.valueSystemIds.map(
        valueSystemId => [1, valueSystemId] as [number, number],
      ),
      type: usecase.type ?? 'UNSPECIFIED',
    };
  }

  async function loadRootUsecaseDelta(): Promise<Record<string, unknown>> {
    const rows: Array<{new_value: string | null}> = await dataSource.query(
      `SELECT new_value
       FROM edit_actions
      WHERE session_id = ?
        AND target_table = ?
        AND aggregate_id = ?
        AND operation = 'UPDATE'
      ORDER BY change_id
      LIMIT 1`,
      [session.sessionId, ENTITY_NAMES.UseCase, USECASE_ID],
    );
    const value = rows[0]?.new_value;
    return value === null || value === undefined
      ? {}
      : (JSON.parse(value) as Record<string, unknown>);
  }

  async function wipeStagedActions(): Promise<void> {
    await dataSource.query('DELETE FROM edit_actions WHERE session_id = ?', [
      session.sessionId,
    ]);
  }

  return {
    dataSource,
    routeSingleHop,
    failNextReplacementPairWrite: () => {
      failPairWrite = true;
    },
    wipeStagedActions,
    loadNormalizedEditActions,
    loadRootUsecaseDelta,
    loadOverlayTopology,
    close: async () => {
      if (!queryRunner.isReleased) await queryRunner.release();
    },
  };
}

describe('TypeOrm MDF substitution persistence', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    await seedProjectAndFile(getTestDataSource());
  });

  it('persists one grouped aggregate delta for a single-hop substitution', async () => {
    const harness = await createMdfPersistenceHarness();
    const result = await harness.routeSingleHop();
    const actions = await harness.loadNormalizedEditActions();
    const rootDelta = await harness.loadRootUsecaseDelta();

    expect(result.kind).toBe('OK');
    expect(Object.prototype.hasOwnProperty.call(rootDelta, 'type')).toBe(false);
    expect(rootDelta.sgkvAssignments).toEqual([
      {subgraphSystemId: MDF_SUBGRAPH, valueDefinitionSystemIds: []},
    ]);
    expect(actions).toEqual([
      expect.objectContaining({
        entity: 'usecase',
        operation: 'UPDATE',
        aggregateSystemId: USECASE_ID,
        sgkvAssignments: [
          {subgraphSystemId: MDF_SUBGRAPH, valueDefinitionSystemIds: []},
        ],
      }),
      expect.objectContaining({
        entity: 'usecase_subgraph',
        operation: 'CREATE',
        aggregateSystemId: USECASE_ID,
        subgraphSystemId: MDF_SUBGRAPH,
      }),
      expect.objectContaining({
        entity: 'usecase_data_link',
        operation: 'DELETE',
        aggregateSystemId: USECASE_ID,
        sourceSubgraphSystemId: OLD_SOURCE,
        destSubgraphSystemId: OLD_DESTINATION,
      }),
      expect.objectContaining({
        entity: 'usecase_data_link',
        operation: 'CREATE',
        aggregateSystemId: USECASE_ID,
        sourceSubgraphSystemId: OLD_SOURCE,
        destSubgraphSystemId: MDF_SUBGRAPH,
      }),
      expect.objectContaining({
        entity: 'usecase_data_link',
        operation: 'CREATE',
        aggregateSystemId: USECASE_ID,
        sourceSubgraphSystemId: MDF_SUBGRAPH,
        destSubgraphSystemId: OLD_DESTINATION,
      }),
    ]);
    expect(new Set(actions.map(action => action.groupId)).size).toBe(1);
    expect(new Set(actions.map(action => action.aggregateSystemId))).toEqual(
      new Set([USECASE_ID]),
    );
    await harness.close();
  });

  it('hydrates only the replacement topology and reproduces it after wiping staged actions', async () => {
    const harness = await createMdfPersistenceHarness();
    await harness.routeSingleHop();
    const firstActions = await harness.loadNormalizedEditActions();
    const firstOverlay = await harness.loadOverlayTopology(USECASE_ID);

    expect(firstOverlay).toEqual({
      members: [OLD_SOURCE, OLD_DESTINATION, MDF_SUBGRAPH],
      pairs: [
        [OLD_SOURCE, MDF_SUBGRAPH],
        [MDF_SUBGRAPH, OLD_DESTINATION],
      ],
      gkv: [[1, 100]],
      type: USECASE_TYPE.Linked,
    });
    expect(firstOverlay.pairs).not.toContainEqual([
      OLD_SOURCE,
      OLD_DESTINATION,
    ]);

    await harness.wipeStagedActions();
    await harness.routeSingleHop();

    expect(await harness.loadNormalizedEditActions()).toEqual(firstActions);
    expect(await harness.loadOverlayTopology(USECASE_ID)).toEqual(firstOverlay);
    await harness.close();
  });

  it('rolls back the root and all child actions when one replacement-pair write fails', async () => {
    const harness = await createMdfPersistenceHarness();
    harness.failNextReplacementPairWrite();

    const result = await harness.routeSingleHop();

    expect(result.kind).toBe('FAIL');
    expect(await harness.loadNormalizedEditActions()).toEqual([]);
    expect(await harness.loadOverlayTopology(USECASE_ID)).toEqual({
      members: [OLD_SOURCE, OLD_DESTINATION],
      pairs: [[OLD_SOURCE, OLD_DESTINATION]],
      gkv: [[1, 100]],
      type: USECASE_TYPE.Linked,
    });
    await harness.close();
  });
});
