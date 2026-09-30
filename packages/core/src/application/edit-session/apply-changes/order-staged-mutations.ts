/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {InvalidOperationException} from '../../../shared/exceptions/invalid-operation.exception.js';
import type {
  ExecutionSlot,
  OperationDependency,
  PlannedMutation,
} from './apply-changes.types.js';
import type {ApplyRuleRegistry} from './apply-rule-registry.js';

function identity(targetType: string, mutationKey: string): string {
  return `${targetType}\u0000${mutationKey}`;
}

function compareSlots(a: ExecutionSlot, b: ExecutionSlot): number {
  return a.phase - b.phase || a.step - b.step;
}

function compareMutations(a: PlannedMutation, b: PlannedMutation): number {
  return (
    a.targetType.localeCompare(b.targetType) ||
    a.mutationKey.localeCompare(b.mutationKey)
  );
}

function edgeIdentity(edge: OperationDependency): [string, string] {
  return [
    identity(edge.beforeTargetType, edge.beforeMutationKey),
    identity(edge.afterTargetType, edge.afterMutationKey),
  ];
}

/**
 * Orders only supplied staged mutations. It never loads database rows,
 * synthesizes dependencies, or removes a mutation.
 */
export function orderStagedMutations(
  mutations: readonly PlannedMutation[],
  registry: ApplyRuleRegistry,
): readonly PlannedMutation[] {
  const byIdentity = new Map<string, PlannedMutation>();
  for (const mutation of mutations) {
    const key = identity(mutation.targetType, mutation.mutationKey);
    if (byIdentity.has(key)) {
      throw new InvalidOperationException(
        `Duplicate planned mutation: ${mutation.targetType} ${mutation.mutationKey}`,
      );
    }
    registry.getRule(mutation.targetType);
    byIdentity.set(key, mutation);
  }

  const edges: Array<[string, string]> = [];
  for (const mutation of mutations) {
    const rule = registry.getRule(mutation.targetType);
    for (const dependency of rule.dependencies(mutation, mutations)) {
      const [beforeKey, afterKey] = edgeIdentity(dependency);
      const before = byIdentity.get(beforeKey);
      const after = byIdentity.get(afterKey);
      if (before === undefined || after === undefined) continue;
      if (compareSlots(before.executionSlot, after.executionSlot) > 0) {
        throw new InvalidOperationException(
          `Dependency ${before.targetType} -> ${after.targetType} conflicts with the fixed apply schedule`,
        );
      }
      edges.push([beforeKey, afterKey]);
    }
  }

  const slotKeys = [
    ...new Set(
      mutations.map(
        mutation =>
          `${mutation.executionSlot.phase}:${mutation.executionSlot.step}`,
      ),
    ),
  ].sort((a, b) => {
    const [aPhase, aStep] = a.split(':').map(Number);
    const [bPhase, bStep] = b.split(':').map(Number);
    return aPhase - bPhase || aStep - bStep;
  });

  const ordered: PlannedMutation[] = [];
  for (const slotKey of slotKeys) {
    const slotMutations = mutations.filter(
      mutation =>
        `${mutation.executionSlot.phase}:${mutation.executionSlot.step}` ===
        slotKey,
    );
    const slotIdentities = new Set(
      slotMutations.map(mutation =>
        identity(mutation.targetType, mutation.mutationKey),
      ),
    );
    const indegree = new Map([...slotIdentities].map(key => [key, 0]));
    const outgoing = new Map<string, string[]>();
    for (const [before, after] of edges) {
      if (!slotIdentities.has(before) || !slotIdentities.has(after)) continue;
      outgoing.set(before, [...(outgoing.get(before) ?? []), after]);
      indegree.set(after, (indegree.get(after) ?? 0) + 1);
    }

    const ready = slotMutations
      .filter(
        mutation =>
          indegree.get(identity(mutation.targetType, mutation.mutationKey)) === 0,
      )
      .sort(compareMutations);
    let processed = 0;
    while (ready.length > 0) {
      const next = ready.shift()!;
      ordered.push(next);
      processed += 1;
      const nextIdentity = identity(next.targetType, next.mutationKey);
      for (const dependentKey of outgoing.get(nextIdentity) ?? []) {
        const remaining = (indegree.get(dependentKey) ?? 0) - 1;
        indegree.set(dependentKey, remaining);
        if (remaining === 0) {
          ready.push(byIdentity.get(dependentKey)!);
          ready.sort(compareMutations);
        }
      }
    }
    if (processed !== slotMutations.length) {
      throw new InvalidOperationException(
        `Staged mutation dependency cycle detected in execution slot ${slotKey}`,
      );
    }
  }

  if (ordered.length !== mutations.length) {
    throw new InvalidOperationException(
      'Staged mutation ordering changed the mutation count',
    );
  }
  return ordered;
}

