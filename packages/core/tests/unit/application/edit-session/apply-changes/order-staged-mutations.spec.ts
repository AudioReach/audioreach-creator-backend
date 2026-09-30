/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, Result} from '../../../../../src/index.js';
import {ApplyRuleRegistry} from '../../../../../src/application/edit-session/apply-changes/apply-rule-registry.js';
import {orderStagedMutations} from '../../../../../src/application/edit-session/apply-changes/order-staged-mutations.js';
import type {
  ApplyRule,
  OperationDependency,
  PendingApplyAction,
  PlannedMutation,
} from '../../../../../src/application/edit-session/apply-changes/apply-changes.types.js';

function mutation(
  targetType: string,
  mutationKey: string,
  phase: number,
  step: number,
  operation = CHANGE_OPERATION.Create,
  aggregateId = 1,
): PlannedMutation {
  return {
    targetType,
    mutationKey,
    aggregateId,
    operation,
    criteria: {systemId: Number(mutationKey.replace(/\D/g, '')) || 1},
    values: operation === CHANGE_OPERATION.Delete ? undefined : {},
    executionSlot: {phase, step},
  };
}

class DependencyRule implements ApplyRule {
  readonly allowedOperations = [
    CHANGE_OPERATION.Create,
    CHANGE_OPERATION.Update,
    CHANGE_OPERATION.Delete,
  ];

  constructor(
    readonly targetType: string,
    private readonly resolveDependencies: (
      mutation: PlannedMutation,
      candidates: readonly PlannedMutation[],
    ) => readonly OperationDependency[] = () => [],
  ) {}

  actionSlot(action: PendingApplyAction) {
    return Result.ok(`${action.targetType}:${action.targetSystemId}`);
  }

  mutationKey(action: PendingApplyAction) {
    return Result.ok(`${action.targetType}:${action.targetSystemId}`);
  }

  reduce(_actions: readonly PendingApplyAction[]) {
    return Result.ok<PlannedMutation | null>(null);
  }

  dependencies(
    candidate: PlannedMutation,
    candidates: readonly PlannedMutation[],
  ) {
    return this.resolveDependencies(candidate, candidates);
  }
}

function edge(before: PlannedMutation, after: PlannedMutation) {
  return {
    beforeTargetType: before.targetType,
    beforeMutationKey: before.mutationKey,
    afterTargetType: after.targetType,
    afterMutationKey: after.mutationKey,
  };
}

describe('orderStagedMutations', () => {
  it('orders non-empty slots by phase and step', () => {
    const registry = new ApplyRuleRegistry([], [
      new DependencyRule('Phase5'),
      new DependencyRule('Phase1Step2'),
      new DependencyRule('Phase1Step1'),
      new DependencyRule('Phase3'),
    ]);
    const input = [
      mutation('Phase5', 'm5', 5, 1),
      mutation('Phase1Step2', 'm12', 1, 2),
      mutation('Phase3', 'm3', 3, 1),
      mutation('Phase1Step1', 'm11', 1, 1),
    ];

    expect(orderStagedMutations(input, registry).map(m => m.mutationKey)).toEqual(
      ['m11', 'm12', 'm3', 'm5'],
    );
  });

  it('uses target type and mutation key as deterministic same-slot ties', () => {
    const registry = new ApplyRuleRegistry([], [
      new DependencyRule('B'),
      new DependencyRule('A'),
    ]);
    const input = [
      mutation('B', '2', 3, 1),
      mutation('A', '2', 3, 1),
      mutation('A', '1', 3, 1),
    ];

    expect(orderStagedMutations(input, registry).map(m => `${m.targetType}:${m.mutationKey}`)).toEqual(
      ['A:1', 'A:2', 'B:2'],
    );
  });

  it('orders only dependencies whose two mutations are staged', () => {
    const parent = mutation('Parent', 'parent-1', 3, 1);
    const child = mutation('Child', 'child-1', 3, 1);
    const registry = new ApplyRuleRegistry([], [
      new DependencyRule('Parent'),
      new DependencyRule('Child', current => [edge(parent, current)]),
    ]);

    expect(orderStagedMutations([child, parent], registry)).toEqual([
      parent,
      child,
    ]);
    expect(orderStagedMutations([child], registry)).toEqual([child]);
  });

  it('preserves staged child create, update, and delete before a root delete', () => {
    const rootDelete = mutation(
      'Root',
      'root-1',
      1,
      3,
      CHANGE_OPERATION.Delete,
    );
    const children = [
      mutation('Child', 'child-create', 1, 3, CHANGE_OPERATION.Create),
      mutation('Child', 'child-update', 1, 3, CHANGE_OPERATION.Update),
      mutation('Child', 'child-delete', 1, 3, CHANGE_OPERATION.Delete),
    ];
    const registry = new ApplyRuleRegistry([], [
      new DependencyRule('Child'),
      new DependencyRule('Root', current =>
        children.map(child => edge(child, current)),
      ),
    ]);

    const ordered = orderStagedMutations(
      [rootDelete, ...children],
      registry,
    );

    expect(ordered).toHaveLength(4);
    expect(ordered.at(-1)).toBe(rootDelete);
    expect(new Set(ordered)).toEqual(new Set([rootDelete, ...children]));
  });

  it('rejects a dependency that reverses the fixed slot order', () => {
    const early = mutation('Early', 'early-1', 1, 1);
    const late = mutation('Late', 'late-1', 3, 1);
    const registry = new ApplyRuleRegistry([], [
      new DependencyRule('Early', current => [edge(late, current)]),
      new DependencyRule('Late'),
    ]);

    expect(() => orderStagedMutations([early, late], registry)).toThrow(
      'conflicts with the fixed apply schedule',
    );
  });

  it('rejects a dependency cycle before returning an order', () => {
    const first = mutation('First', 'first-1', 3, 1);
    const second = mutation('Second', 'second-1', 3, 1);
    const registry = new ApplyRuleRegistry([], [
      new DependencyRule('First', current => [edge(second, current)]),
      new DependencyRule('Second', current => [edge(first, current)]),
    ]);

    expect(() => orderStagedMutations([first, second], registry)).toThrow(
      'dependency cycle',
    );
  });
});

