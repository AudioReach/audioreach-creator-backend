/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND} from '../../shared/result/result.js';
import {DomainRuleViolationException} from '../../../shared/exceptions/domain-rule-violation.exception.js';
import type {
  PendingApplyAction,
  PlannedMutation,
} from './apply-changes.types.js';
import type {ApplyRuleRegistry} from './apply-rule-registry.js';

export function reduceCurrentActions(
  actions: readonly PendingApplyAction[],
  registry: ApplyRuleRegistry,
): readonly PlannedMutation[] {
  const groups = new Map<string, PendingApplyAction[]>();

  for (const action of actions) {
    const rule = registry.getRule(action.targetType);
    const keyResult = rule.mutationKey(action);
    if (keyResult.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException(keyResult.issues);
    }
    const groupKey = `${rule.targetType}\u0000${keyResult.data}`;
    const group = groups.get(groupKey) ?? [];
    group.push(action);
    groups.set(groupKey, group);
  }

  const mutations: PlannedMutation[] = [];
  const sortedGroupKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const groupKey of sortedGroupKeys) {
    const group = groups.get(groupKey);
    if (group === undefined) continue;
    const rule = registry.getRule(group[0].targetType);
    const reduce = rule.reduce.bind(rule);
    const result = reduce(group);
    if (result.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException(result.issues);
    }
    if (result.data !== null) mutations.push(result.data);
  }
  return mutations;
}
