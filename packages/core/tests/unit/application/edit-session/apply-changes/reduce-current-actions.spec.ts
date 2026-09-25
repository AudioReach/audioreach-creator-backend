/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '../../../../../src/index.js';
import {ApplyRuleRegistry} from '../../../../../src/application/edit-session/apply-changes/apply-rule-registry.js';
import {reduceCurrentActions} from '../../../../../src/application/edit-session/apply-changes/reduce-current-actions.js';
import type {PendingApplyAction} from '../../../../../src/application/edit-session/apply-changes/apply-changes.types.js';

function update(
  targetType: string,
  targetSystemId: number,
): PendingApplyAction {
  return {
    aggregateId: targetSystemId,
    targetType,
    targetSystemId,
    operation: CHANGE_OPERATION.Update,
    fieldPath: 'alias',
    newValue: {alias: `${targetType}-${targetSystemId}`},
  };
}

describe('reduceCurrentActions', () => {
  const slots = {
    [CHANGE_OPERATION.Create]: {phase: 3, step: 1},
    [CHANGE_OPERATION.Update]: {phase: 3, step: 1},
    [CHANGE_OPERATION.Delete]: {phase: 1, step: 1},
  };

  it('keeps equal numeric IDs in different target tables independent', () => {
    const registry = new ApplyRuleRegistry(
      [
        {targetType: 'SpfModule', slots},
        {targetType: 'Node', slots},
      ],
      [],
    );

    const mutations = reduceCurrentActions(
      [update('SpfModule', 50), update('Node', 50)],
      registry,
    );

    expect(mutations).toHaveLength(2);
    expect(mutations.map(m => m.mutationKey).sort()).toEqual([
      'Node:50',
      'SpfModule:50',
    ]);
  });

  it('keeps different rows in the same table independent', () => {
    const registry = new ApplyRuleRegistry(
      [{targetType: 'SpfModule', slots}],
      [],
    );

    const mutations = reduceCurrentActions(
      [update('SpfModule', 50), update('SpfModule', 51)],
      registry,
    );

    expect(mutations.map(m => m.criteria)).toEqual([
      {systemId: 50},
      {systemId: 51},
    ]);
  });

  it('fails before producing mutations for an unregistered target', () => {
    const registry = new ApplyRuleRegistry([], []);

    expect(() =>
      reduceCurrentActions([update('UnknownTarget', 50)], registry),
    ).toThrow('Unsupported apply target');
  });
});
