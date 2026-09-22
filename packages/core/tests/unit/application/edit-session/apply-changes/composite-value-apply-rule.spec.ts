/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  RESULT_KIND,
} from '../../../../../src/index.js';
import {CompositeValueApplyRule} from '../../../../../src/application/edit-session/apply-changes/composite-value-apply-rule.js';
import type {PendingApplyAction} from '../../../../../src/application/edit-session/apply-changes/apply-changes.types.js';

const cases = [
  ['UsecaseGkvValues', 'usecaseSystemId'],
  ['CkvValues', 'ckvSystemId'],
  ['TkvValues', 'tkvSystemId'],
  ['SgkvValues', 'sgkvSystemId'],
  ['DkvValues', 'dkvSystemId'],
  ['VcpmCkvValues', 'vcpmCkvSystemId'],
] as const;

function buildAction(
  targetType: string,
  parentKey: string,
  operation: PendingApplyAction['operation'],
  valueDefSystemId = 20,
): PendingApplyAction {
  return {
    aggregateId: 100,
    targetType,
    targetSystemId: 100,
    operation,
    fieldPath: `$key:valueDefSystemId=${valueDefSystemId}`,
    newValue: {[parentKey]: 100, valueDefSystemId},
  };
}

describe.each(cases)('CompositeValueApplyRule %s', (targetType, parentKey) => {
  const rule = new CompositeValueApplyRule({
    targetType,
    parentKey,
    createSlot: {phase: 3, step: 9},
    deleteSlot: {phase: 1, step: 3},
  });

  it('creates complete composite criteria and values', () => {
    const result = rule.reduce([
      buildAction(targetType, parentKey, CHANGE_OPERATION.Create),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) return;
    expect(result.data.mutationKey).toBe(`${targetType}:100:20`);
    expect(result.data.criteria).toEqual({
      [parentKey]: 100,
      valueDefSystemId: 20,
    });
    expect(result.data.values).toEqual({
      [parentKey]: 100,
      valueDefSystemId: 20,
    });
  });

  it('creates a delete with both key columns', () => {
    const result = rule.reduce([
      buildAction(targetType, parentKey, CHANGE_OPERATION.Delete),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) return;
    expect(result.data.operation).toBe(CHANGE_OPERATION.Delete);
    expect(result.data.criteria).toEqual({
      [parentKey]: 100,
      valueDefSystemId: 20,
    });
    expect(result.data.values).toBeUndefined();
  });

  it('rejects update because the row contains key columns only', () => {
    const result = rule.reduce([
      buildAction(targetType, parentKey, CHANGE_OPERATION.Update),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('rejects a missing secondary key', () => {
    const invalid = buildAction(
      targetType,
      parentKey,
      CHANGE_OPERATION.Create,
    );
    invalid.newValue = {[parentKey]: 100};

    const result = rule.reduce([invalid]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('rejects a field path that conflicts with the payload key', () => {
    const invalid = buildAction(
      targetType,
      parentKey,
      CHANGE_OPERATION.Create,
    );
    invalid.fieldPath = '$key:valueDefSystemId=21';

    const result = rule.reduce([invalid]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });
});

