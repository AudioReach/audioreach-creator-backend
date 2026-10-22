/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ApplyEditActionReducer} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-edit-action-reducer.js';

function row(overrides: Partial<EditActionRow> = {}): EditActionRow {
  return {
    changeId: 1,
    sessionId: 10,
    aggregateId: 20,
    targetSystemId: 30,
    targetTable: ENTITY_NAMES.SpfModule,
    operation: CHANGE_OPERATION.Update,
    fieldPath: null,
    newValue: {alias: 'updated'},
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    linkedEntityGroupId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function manager(
  columns: readonly string[] = ['systemId', 'alias', 'containerSystemId'],
  rowsByTable: Readonly<
    Record<string, readonly Record<string, unknown>[]>
  > = {},
): EntityManager {
  return {
    getRepository: (tableName: string) => ({
      metadata: {
        columns: (tableName === ENTITY_NAMES.SubsystemFilteredKey
          ? ['systemId', 'subsystemsSystemId', 'keyDefinitionSystemId']
          : columns
        ).map(propertyName => ({propertyName})),
      },
      find: async () => rowsByTable[tableName] ?? [],
    }),
  } as unknown as EntityManager;
}

describe('ApplyEditActionReducer', () => {
  it('reduces a system-id CREATE into identity, values, and source IDs', async () => {
    const actions = await new ApplyEditActionReducer(manager()).reduce([
      row({
        changeId: 7,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {systemId: 30, alias: 'created'},
      }),
    ]);

    expect(actions).toEqual([
      {
        tableName: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Create,
        targetSystemId: 30,
        values: {alias: 'created'},
        sourceEditActionIds: [7],
      },
    ]);
  });

  it('merges disjoint UPDATE rows for one physical target', async () => {
    const actions = await new ApplyEditActionReducer(manager()).reduce([
      row({changeId: 4, fieldPath: 'alias', newValue: {alias: 'updated'}}),
      row({
        changeId: 2,
        fieldPath: 'containerSystemId',
        newValue: {containerSystemId: 99},
      }),
    ]);

    expect(actions).toEqual([
      expect.objectContaining({
        operation: CHANGE_OPERATION.Update,
        targetSystemId: 30,
        values: {alias: 'updated', containerSystemId: 99},
        sourceEditActionIds: [2, 4],
      }),
    ]);
  });

  it('reduces DELETE to identity only', async () => {
    const actions = await new ApplyEditActionReducer(manager()).reduce([
      row({
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
        newValue: {},
      }),
    ]);

    expect(actions).toEqual([
      {
        tableName: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Delete,
        targetSystemId: 30,
        sourceEditActionIds: [1],
      },
    ]);
  });

  it('rejects mixed latest-state operations for one physical target', async () => {
    const reducer = new ApplyEditActionReducer(manager());

    await expect(
      reducer.reduce([
        row({operation: CHANGE_OPERATION.Update}),
        row({changeId: 2, operation: CHANGE_OPERATION.Delete, newValue: {}}),
      ]),
    ).rejects.toMatchObject({errorCode: 'COMMIT_VALIDATION_FAILED'});
  });

  it('reduces relationship rows directly by their synthetic system ID', async () => {
    const actions = await new ApplyEditActionReducer(
      manager(['systemId', 'ckvSystemId', 'valueDefSystemId']),
    ).reduce([
      row({
        changeId: 9,
        targetTable: ENTITY_NAMES.CkvValues,
        targetSystemId: 901,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {
          ckvSystemId: 55,
          valueDefSystemId: 77,
        },
      }),
    ]);

    expect(actions).toEqual([
      {
        tableName: ENTITY_NAMES.CkvValues,
        operation: CHANGE_OPERATION.Create,
        targetSystemId: 901,
        values: {ckvSystemId: 55, valueDefSystemId: 77},
        sourceEditActionIds: [9],
      },
    ]);
  });

  it('reduces a direct UsecaseGkvValues CREATE from its payload key', async () => {
    const actions = await new ApplyEditActionReducer(
      manager(['systemId', 'usecaseSystemId', 'valueDefSystemId']),
    ).reduce([
      row({
        changeId: 11,
        targetTable: ENTITY_NAMES.UsecaseGkvValues,
        targetSystemId: 9001,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {usecaseSystemId: 30, valueDefSystemId: 77},
      }),
    ]);

    expect(actions).toEqual([
      {
        tableName: ENTITY_NAMES.UsecaseGkvValues,
        operation: CHANGE_OPERATION.Create,
        targetSystemId: 9001,
        values: {usecaseSystemId: 30, valueDefSystemId: 77},
        sourceEditActionIds: [11],
      },
    ]);
  });

  it('rejects NONE and legacy relationship metadata on parent rows', async () => {
    const reducer = new ApplyEditActionReducer(manager());

    await expect(
      reducer.reduce([row({operation: CHANGE_OPERATION.None})]),
    ).rejects.toMatchObject({errorCode: 'COMMIT_VALIDATION_FAILED'});
    await expect(
      reducer.reduce([
        row({
          targetTable: ENTITY_NAMES.Ckv,
          operation: CHANGE_OPERATION.Create,
          fieldPath: '$',
          newValue: {valueDefinitionSystemIds: [77]},
        }),
      ]),
    ).rejects.toMatchObject({errorCode: 'COMMIT_VALIDATION_FAILED'});
  });

  it('reduces Subsystem filtered-key rows without reading parent state', async () => {
    const actions = await new ApplyEditActionReducer(
      manager(['systemId', 'subsystemsSystemId', 'keyDefinitionSystemId']),
    ).reduce([
      row({
        changeId: 12,
        targetTable: ENTITY_NAMES.SubsystemFilteredKey,
        targetSystemId: 501,
        operation: CHANGE_OPERATION.Delete,
        newValue: {},
      }),
      row({
        changeId: 13,
        targetTable: ENTITY_NAMES.SubsystemFilteredKey,
        targetSystemId: 502,
        operation: CHANGE_OPERATION.Create,
        newValue: {subsystemsSystemId: 30, keyDefinitionSystemId: 3},
      }),
    ]);

    expect(actions).toEqual([
      {
        tableName: ENTITY_NAMES.SubsystemFilteredKey,
        operation: CHANGE_OPERATION.Delete,
        targetSystemId: 501,
        sourceEditActionIds: [12],
      },
      {
        tableName: ENTITY_NAMES.SubsystemFilteredKey,
        operation: CHANGE_OPERATION.Create,
        targetSystemId: 502,
        values: {subsystemsSystemId: 30, keyDefinitionSystemId: 3},
        sourceEditActionIds: [13],
      },
    ]);
  });

  it('strips UseCase metadata before physical reduction', async () => {
    const actions = await new ApplyEditActionReducer(
      manager(['systemId', 'type']),
    ).reduce([
      row({
        targetTable: ENTITY_NAMES.UseCase,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {
          type: 'MANUAL',
          referencedComponents: {sgSystemIds: [70]},
          sgkvAssignments: [
            {subgraphSystemId: 70, valueDefinitionSystemIds: [6, 5]},
          ],
        },
      }),
    ]);

    expect(actions).toHaveLength(1);
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: ENTITY_NAMES.UseCase,
          values: {type: 'MANUAL'},
        }),
      ]),
    );
  });

  it('reduces direct SGKV rows while stripping UseCase metadata', async () => {
    const actions = await new ApplyEditActionReducer(
      manager([
        'systemId',
        'type',
        'subgraphSystemId',
        'sgkvSystemId',
        'valueDefSystemId',
      ]),
    ).reduce([
      row({
        changeId: 20,
        targetTable: ENTITY_NAMES.Sgkv,
        targetSystemId: 80,
        operation: CHANGE_OPERATION.Create,
        newValue: {subgraphSystemId: 70},
      }),
      row({
        changeId: 21,
        targetTable: ENTITY_NAMES.SgkvValues,
        targetSystemId: 81,
        operation: CHANGE_OPERATION.Create,
        newValue: {sgkvSystemId: 80, valueDefSystemId: 5},
      }),
      row({
        changeId: 22,
        targetTable: ENTITY_NAMES.UseCase,
        operation: CHANGE_OPERATION.Create,
        newValue: {
          type: 'MANUAL',
          sgkvAssignments: [
            {subgraphSystemId: 70, valueDefinitionSystemIds: [5]},
          ],
        },
      }),
    ]);

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: ENTITY_NAMES.SgkvValues,
          targetSystemId: 81,
          values: {sgkvSystemId: 80, valueDefSystemId: 5},
        }),
      ]),
    );
  });

  it('ignores UseCase SGKV assignment metadata during reduction', async () => {
    const actions = await new ApplyEditActionReducer(
      manager(['systemId', 'type']),
    ).reduce([
      row({
        targetTable: ENTITY_NAMES.UseCase,
        newValue: {
          type: 'MANUAL',
          sgkvAssignments: 'not-an-assignment-array',
        },
      }),
    ]);

    expect(actions).toEqual([
      expect.objectContaining({
        tableName: ENTITY_NAMES.UseCase,
        values: {type: 'MANUAL'},
      }),
    ]);
  });
});
