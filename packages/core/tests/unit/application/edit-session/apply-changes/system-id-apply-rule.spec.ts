/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, RESULT_KIND} from '../../../../../src/index.js';
import {SystemIdApplyRule} from '../../../../../src/application/edit-session/apply-changes/system-id-apply-rule.js';
import type {PendingApplyAction} from '../../../../../src/application/edit-session/apply-changes/apply-changes.types.js';

const slots = {
  [CHANGE_OPERATION.Create]: {phase: 3, step: 8},
  [CHANGE_OPERATION.Update]: {phase: 3, step: 1},
  [CHANGE_OPERATION.Delete]: {phase: 1, step: 3},
};

function action(
  operation: PendingApplyAction['operation'],
  fieldPath: string | null,
  newValue: Record<string, unknown>,
): PendingApplyAction {
  return {
    aggregateId: 50,
    targetType: 'SpfModule',
    targetSystemId: 50,
    operation,
    fieldPath,
    newValue,
  };
}

describe('SystemIdApplyRule', () => {
  const rule = new SystemIdApplyRule({targetType: 'SpfModule', slots});

  it('combines updates for different fields into one physical mutation', () => {
    const result = rule.reduce([
      action(CHANGE_OPERATION.Update, 'alias', {alias: 'voice'}),
      action(CHANGE_OPERATION.Update, 'containerSystemId', {
        containerSystemId: 20,
      }),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) return;
    expect(result.data).toEqual({
      mutationKey: 'SpfModule:50',
      targetType: 'SpfModule',
      aggregateId: 50,
      operation: CHANGE_OPERATION.Update,
      criteria: {systemId: 50},
      values: {alias: 'voice', containerSystemId: 20},
      executionSlot: {phase: 3, step: 1},
    });
  });

  it('merges updates into a staged create', () => {
    const result = rule.reduce([
      action(CHANGE_OPERATION.Create, '$', {
        systemId: 50,
        alias: 'old',
      }),
      action(CHANGE_OPERATION.Update, 'alias', {alias: 'new'}),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) return;
    expect(result.data.operation).toBe(CHANGE_OPERATION.Create);
    expect(result.data.values).toEqual({systemId: 50, alias: 'new'});
  });

  it('adds the authoritative target system id to a generic create', () => {
    const result = rule.reduce([
      action(CHANGE_OPERATION.Create, '$', {alias: 'new'}),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) return;
    expect(result.data.values).toEqual({systemId: 50, alias: 'new'});
  });

  it('returns no mutation for create followed by delete', () => {
    const result = rule.reduce([
      action(CHANGE_OPERATION.Create, '$', {systemId: 50}),
      action(CHANGE_OPERATION.Delete, null, {}),
    ]);

    expect(result).toEqual({kind: RESULT_KIND.Ok, data: null});
  });

  it('uses terminal delete instead of applying earlier updates', () => {
    const result = rule.reduce([
      action(CHANGE_OPERATION.Update, 'alias', {alias: 'unused'}),
      action(CHANGE_OPERATION.Delete, null, {}),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) return;
    expect(result.data.operation).toBe(CHANGE_OPERATION.Delete);
    expect(result.data.criteria).toEqual({systemId: 50});
    expect(result.data.values).toBeUndefined();
  });

  it('rejects NONE operations', () => {
    const result = rule.reduce([
      action(CHANGE_OPERATION.None, null, {alias: 'invalid'}),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });
});
