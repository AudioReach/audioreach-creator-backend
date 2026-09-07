/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  RESULT_KIND,
  Result,
  SOURCE,
} from '@arc/core';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {CompositeValueEntityReductionRule} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/composite-value-entity-reduction-rule.js';
import {ApplyOperationReducer} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-operation-reducer.js';
import {SystemIdEntityReductionRule} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/system-id-entity-reduction-rule.js';
import type {
  ApplyChangeOperation,
  ApplyReductionRegistry,
  EntityReductionRule,
  ReducedMainTableMutation,
} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-changes.types.js';

let nextChangeId = 1;

function action(
  targetTable: string,
  targetSystemId: number,
  operation: ApplyChangeOperation,
  fieldPath: string | null,
  newValue: unknown,
  aggregateId = targetSystemId,
): EditActionRow {
  return {
    changeId: nextChangeId++,
    sessionId: 1,
    aggregateId,
    targetSystemId,
    targetTable: targetTable as EditActionRow['targetTable'],
    operation,
    fieldPath,
    newValue,
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    groupId: null,
    linkedEntityGroupId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
  };
}

describe('persistence apply reduction', () => {
  beforeEach(() => {
    nextChangeId = 1;
  });

  it('groups original edit-action rows by target table before dispatching to a registered rule', () => {
    const receivedRows: EditActionRow[] = [];
    const rule: EntityReductionRule = {
      reduceToMainTableMutations(rows) {
        receivedRows.push(...rows);
        return Result.ok<readonly ReducedMainTableMutation[]>([]);
      },
    };
    const row = action('SpfModule', 50, CHANGE_OPERATION.Update, 'alias', {
      alias: 'voice',
    });

    const result = new ApplyOperationReducer(
      new Map([['SpfModule', rule]]),
    ).reduce([row]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(receivedRows).toHaveLength(1);
    expect(receivedRows[0]).toBe(row);
  });

  it('groups by target table and then by main-table row identity', () => {
    const registry: ApplyReductionRegistry = new Map([
      ['SpfModule', new SystemIdEntityReductionRule('SpfModule')],
      ['Node', new SystemIdEntityReductionRule('Node')],
    ]);

    const result = new ApplyOperationReducer(registry).reduce([
      action('SpfModule', 50, CHANGE_OPERATION.Update, 'alias', {
        alias: 'voice',
      }),
      action('Node', 50, CHANGE_OPERATION.Update, 'type', {type: 2}),
      action('SpfModule', 51, CHANGE_OPERATION.Update, 'alias', {
        alias: 'music',
      }),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([
      {
        aggregateId: 50,
        target: {
          entityName: 'Node',
          rowIdentifier: {kind: 'SYSTEM_ID', values: {systemId: 50}},
        },
        operation: CHANGE_OPERATION.Update,
        changes: {type: 2},
      },
      {
        aggregateId: 50,
        target: {
          entityName: 'SpfModule',
          rowIdentifier: {kind: 'SYSTEM_ID', values: {systemId: 50}},
        },
        operation: CHANGE_OPERATION.Update,
        changes: {alias: 'voice'},
      },
      {
        aggregateId: 51,
        target: {
          entityName: 'SpfModule',
          rowIdentifier: {kind: 'SYSTEM_ID', values: {systemId: 51}},
        },
        operation: CHANGE_OPERATION.Update,
        changes: {alias: 'music'},
      },
    ]);
  });

  it('merges updates into create values while keeping systemId in the row identity', () => {
    const rule = new SystemIdEntityReductionRule('SpfModule');

    const result = rule.reduceToMainTableMutations([
      action('SpfModule', 120, CHANGE_OPERATION.Create, '$', {
        systemId: 999,
        alias: 'old',
      }),
      action('SpfModule', 120, CHANGE_OPERATION.Update, 'alias', {
        alias: 'new',
      }),
    ]);

    expect(result).toEqual({
      kind: RESULT_KIND.Ok,
      data: [
        {
          aggregateId: 120,
          target: {
            entityName: 'SpfModule',
            rowIdentifier: {kind: 'SYSTEM_ID', values: {systemId: 120}},
          },
          operation: CHANGE_OPERATION.Create,
          values: {alias: 'new'},
        },
      ],
    });
  });

  it('removes only the root write for a create-delete pair', () => {
    const rule = new SystemIdEntityReductionRule('SpfModule');

    const result = rule.reduceToMainTableMutations([
      action('SpfModule', 120, CHANGE_OPERATION.Create, '$', {alias: 'new'}),
      action('SpfModule', 120, CHANGE_OPERATION.Delete, null, {}),
      action('SpfModule', 121, CHANGE_OPERATION.Update, 'alias', {
        alias: 'other',
      }),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].target.rowIdentifier.values).toEqual({systemId: 121});
  });

  it('rejects conflicting aggregate ownership for one main-table row', () => {
    const rule = new SystemIdEntityReductionRule('SpfModule');

    const result = rule.reduceToMainTableMutations([
      action(
        'SpfModule',
        120,
        CHANGE_OPERATION.Update,
        'alias',
        {alias: 'one'},
        900,
      ),
      action(
        'SpfModule',
        120,
        CHANGE_OPERATION.Update,
        'containerSystemId',
        {containerSystemId: 20},
        901,
      ),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('creates key-only composite writes and rejects update', () => {
    const rule = new CompositeValueEntityReductionRule({
      entityName: 'SgkvValues',
      parentKey: 'sgkvSystemId',
    });
    const create = action(
      'SgkvValues',
      120,
      CHANGE_OPERATION.Create,
      '$key:valueDefSystemId=300',
      {sgkvSystemId: 120, valueDefSystemId: 300},
      900,
    );

    expect(rule.reduceToMainTableMutations([create])).toEqual({
      kind: RESULT_KIND.Ok,
      data: [
        {
          aggregateId: 900,
          target: {
            entityName: 'SgkvValues',
            rowIdentifier: {
              kind: 'COMPOSITE',
              values: {sgkvSystemId: 120, valueDefSystemId: 300},
            },
          },
          operation: CHANGE_OPERATION.Create,
        },
      ],
    });

    expect(
      rule.reduceToMainTableMutations([
        {...create, operation: CHANGE_OPERATION.Update},
      ]),
    ).toMatchObject({kind: RESULT_KIND.Fail});
  });

  it('fails reduction for an entity without a registry entry', () => {
    const result = new ApplyOperationReducer(new Map()).reduce([
      action('UnknownTarget', 50, CHANGE_OPERATION.Update, 'alias', {}),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('rejects malformed required payloads instead of replacing them with empty objects', () => {
    const rule = new SystemIdEntityReductionRule('SpfModule');

    const result = rule.reduceToMainTableMutations([
      action('SpfModule', 120, CHANGE_OPERATION.Update, 'alias', null),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });
});
