/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  EditActionReducerError,
  reducePendingTarget,
  type EditActionMutationIntent,
  type EditActionTargetSnapshot,
} from '../../../src/persistence-typeorm-sqllite/services/pending-target-reducer.js';

const target = {
  sessionId: 1,
  targetTable: ENTITY_NAMES.SpfModule,
  targetSystemId: 10,
} as const;

function makeRow(overrides: Partial<EditActionRow> = {}): EditActionRow {
  return {
    changeId: 1,
    sessionId: target.sessionId,
    aggregateId: 1,
    targetSystemId: target.targetSystemId,
    targetTable: target.targetTable,
    operation: CHANGE_OPERATION.Update,
    fieldPath: 'alias',
    newValue: {alias: 'old'},
    source: SOURCE.DiffTool,
    changeStatus: CHANGE_STATUS.Unstaged,
    linkedEntityGroupId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function absentSnapshot(): EditActionTargetSnapshot {
  return {target, committed: {exists: false}, existingEditActionRows: []};
}

function updatedSnapshot(...rows: EditActionRow[]): EditActionTargetSnapshot {
  return {
    target,
    committed: {exists: true, version: 3},
    existingEditActionRows: rows,
  };
}

function createdSnapshot(
  overrides: Partial<EditActionRow> = {},
): EditActionTargetSnapshot {
  return {
    target,
    committed: {exists: false},
    existingEditActionRows: [
      makeRow({
        changeId: 7,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {alias: 'old', maxInputPorts: 2},
        ...overrides,
      }),
    ],
  };
}

function aliasSlot(overrides: Partial<EditActionRow> = {}): EditActionRow {
  return makeRow({fieldPath: 'alias', newValue: {alias: 'old'}, ...overrides});
}

function containerSlot(overrides: Partial<EditActionRow> = {}): EditActionRow {
  return makeRow({
    changeId: 2,
    fieldPath: 'containerSystemId',
    newValue: {containerSystemId: 8},
    ...overrides,
  });
}

function accumulatorSlot(
  overrides: Partial<EditActionRow> = {},
): EditActionRow {
  return makeRow({
    changeId: 3,
    fieldPath: null,
    newValue: {alias: 'old'},
    ...overrides,
  });
}

function groupSlot(overrides: Partial<EditActionRow> = {}): EditActionRow {
  return makeRow({
    changeId: 4,
    fieldPath: 'portLimits',
    newValue: {maxInputPorts: 2, maxOutputPorts: 2},
    ...overrides,
  });
}

function manualUpdate(
  newValue: Record<string, unknown>,
  fieldPath: string | null = null,
): EditActionMutationIntent {
  return {
    kind: CHANGE_OPERATION.Update,
    aggregateId: 1,
    fieldPath,
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    linkedEntityGroupId: null,
    newValue,
  };
}

function updateIntent(): EditActionMutationIntent {
  return manualUpdate({alias: 'new'});
}

function createIntent(): EditActionMutationIntent {
  return {
    kind: CHANGE_OPERATION.Create,
    aggregateId: 9,
    source: SOURCE.DiffTool,
    changeStatus: CHANGE_STATUS.Unstaged,
    linkedEntityGroupId: 'linked-create',
    newValue: {alias: 'created'},
  };
}

function deleteIntent(): EditActionMutationIntent {
  return {
    kind: CHANGE_OPERATION.Delete,
    aggregateId: 1,
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    linkedEntityGroupId: null,
  };
}

describe('reducePendingTarget', () => {
  it.each([
    ['ABSENT + UPDATE', absentSnapshot(), updateIntent()],
    ['ABSENT + DELETE', absentSnapshot(), deleteIntent()],
    [
      'COMMITTED_DELETED + UPDATE',
      updatedSnapshot(
        makeRow({
          operation: CHANGE_OPERATION.Delete,
          fieldPath: null,
          newValue: {},
        }),
      ),
      updateIntent(),
    ],
  ])('%s rejects without creating a row', (_name, snapshot, intent) => {
    expect(() => reducePendingTarget(snapshot, [intent])).toThrow(
      EditActionReducerError,
    );
  });

  it('creates one CREATE for an absent target', () => {
    const plan = reducePendingTarget(absentSnapshot(), [createIntent()]);
    expect(plan.newEditActionInserts).toEqual([
      expect.objectContaining({
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
      }),
    ]);
  });

  it('absorbs manual updates into CREATE while preserving CREATE metadata', () => {
    const plan = reducePendingTarget(
      createdSnapshot({
        changeId: 7,
        source: SOURCE.DiffTool,
        changeStatus: CHANGE_STATUS.Unstaged,
        linkedEntityGroupId: 'linked-1',
        newValue: {alias: 'old', maxInputPorts: 2},
      }),
      [manualUpdate({alias: 'new'})],
    );
    expect(plan.updatesToExistingEditActions).toEqual([
      {
        changeId: 7,
        newValue: {alias: 'new', maxInputPorts: 2},
        source: SOURCE.DiffTool,
      },
    ]);
  });

  it('updates an exact UPDATE slot in place and changes only its source', () => {
    const plan = reducePendingTarget(
      updatedSnapshot(
        aliasSlot({
          changeId: 8,
          source: SOURCE.DiffTool,
          changeStatus: CHANGE_STATUS.Unstaged,
          linkedEntityGroupId: 'linked-2',
        }),
      ),
      [manualUpdate({alias: 'new'}, 'alias')],
    );
    expect(plan.updatesToExistingEditActions).toEqual([
      {changeId: 8, newValue: {alias: 'new'}, source: SOURCE.Manual},
    ]);
    expect(plan.newEditActionInserts).toHaveLength(0);
  });

  it('partitions a multi-field update across existing independent slots', () => {
    const plan = reducePendingTarget(
      updatedSnapshot(aliasSlot({changeId: 10}), containerSlot({changeId: 11})),
      [manualUpdate({alias: 'new', containerSystemId: 9})],
    );
    expect(
      plan.updatesToExistingEditActions.map(update => update.changeId),
    ).toEqual([10, 11]);
  });

  it('expands an existing null accumulator with an unrepresented designer field', () => {
    const plan = reducePendingTarget(
      updatedSnapshot(
        accumulatorSlot({changeId: 12, newValue: {alias: 'old'}}),
      ),
      [manualUpdate({containerSystemId: 9})],
    );
    expect(plan.updatesToExistingEditActions[0]).toEqual(
      expect.objectContaining({
        changeId: 12,
        newValue: {alias: 'old', containerSystemId: 9},
      }),
    );
  });

  it('updates one member of a named group without dropping other members', () => {
    const plan = reducePendingTarget(
      updatedSnapshot(
        groupSlot({
          changeId: 13,
          newValue: {maxInputPorts: 2, maxOutputPorts: 2},
        }),
      ),
      [manualUpdate({maxInputPorts: 4}, 'maxInputPorts')],
    );
    expect(plan.updatesToExistingEditActions[0].newValue).toEqual({
      maxInputPorts: 4,
      maxOutputPorts: 2,
    });
  });

  it('rejects overlapping or implicit regrouping', () => {
    expect(() =>
      reducePendingTarget(updatedSnapshot(aliasSlot({changeId: 14})), [
        manualUpdate({alias: 'new', instanceId: 2}, 'identityGroup'),
      ]),
    ).toThrow(/overlap|regroup/i);
  });

  it('cancels a session-created target without inserting DELETE', () => {
    const plan = reducePendingTarget(createdSnapshot({changeId: 15}), [
      deleteIntent(),
    ]);
    expect(plan.changeIdsToDelete).toEqual([15]);
    expect(plan.newEditActionInserts).toHaveLength(0);
  });

  it('replaces committed UPDATE slots with one new DELETE', () => {
    const plan = reducePendingTarget(
      updatedSnapshot(aliasSlot({changeId: 16}), containerSlot({changeId: 17})),
      [deleteIntent()],
    );
    expect(plan.changeIdsToDelete).toEqual([16, 17]);
    expect(plan.newEditActionInserts).toEqual([
      expect.objectContaining({
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
      }),
    ]);
    expect(plan.deleteEntireTarget).toBe(true);
  });

  it('rejects corrupt CREATE+UPDATE, multiple CREATE, DELETE+UPDATE, and overlaps', () => {
    const corruptSnapshots = [
      updatedSnapshot(
        makeRow({operation: CHANGE_OPERATION.Create, fieldPath: '$'}),
        aliasSlot(),
      ),
      {
        target,
        committed: {exists: false},
        existingEditActionRows: [
          makeRow({operation: CHANGE_OPERATION.Create, fieldPath: '$'}),
          makeRow({
            changeId: 2,
            operation: CHANGE_OPERATION.Create,
            fieldPath: '$',
          }),
        ],
      },
      updatedSnapshot(
        makeRow({
          operation: CHANGE_OPERATION.Delete,
          fieldPath: null,
          newValue: {},
        }),
        aliasSlot(),
      ),
      updatedSnapshot(
        aliasSlot({newValue: {alias: 'one'}}),
        accumulatorSlot({newValue: {alias: 'two'}}),
      ),
    ];

    for (const snapshot of corruptSnapshots) {
      expect(() => reducePendingTarget(snapshot, [])).toThrow(
        EditActionReducerError,
      );
    }
  });
});
