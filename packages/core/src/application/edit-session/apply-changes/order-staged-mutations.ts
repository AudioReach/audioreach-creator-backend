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

type DependencyEdge = [string, string];

function validateMutationIdentities(
  mutations: readonly PlannedMutation[],
  registry: ApplyRuleRegistry,
): Map<string, PlannedMutation> {
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
  return byIdentity;
}

function collectDependencyEdges(
  mutations: readonly PlannedMutation[],
  byIdentity: ReadonlyMap<string, PlannedMutation>,
  registry: ApplyRuleRegistry,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const mutation of mutations) {
    const rule = registry.getRule(mutation.targetType);
    const dependencies = rule.dependencies(mutation, mutations);
    for (const dependency of dependencies) {
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
  return edges;
}

function slotKey(mutation: PlannedMutation): string {
  return `${mutation.executionSlot.phase}:${mutation.executionSlot.step}`;
}

function compareSlotKeys(a: string, b: string): number {
  const [aPhase, aStep] = a.split(':').map(Number);
  const [bPhase, bStep] = b.split(':').map(Number);
  return aPhase - bPhase || aStep - bStep;
}

function sortedSlotKeys(mutations: readonly PlannedMutation[]): string[] {
  const keys = new Set<string>();
  for (const mutation of mutations) keys.add(slotKey(mutation));
  return [...keys].sort(compareSlotKeys);
}

function buildSlotGraph(
  slotMutations: readonly PlannedMutation[],
  edges: readonly DependencyEdge[],
): {
  indegree: Map<string, number>;
  outgoing: Map<string, string[]>;
} {
  const slotIdentities = new Set<string>();
  for (const mutation of slotMutations) {
    slotIdentities.add(identity(mutation.targetType, mutation.mutationKey));
  }

  const indegree = new Map<string, number>();
  for (const mutationIdentity of slotIdentities) {
    indegree.set(mutationIdentity, 0);
  }

  const outgoing = new Map<string, string[]>();
  for (const [before, after] of edges) {
    if (!slotIdentities.has(before) || !slotIdentities.has(after)) continue;
    outgoing.set(before, [...(outgoing.get(before) ?? []), after]);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  }
  return {indegree, outgoing};
}

function orderSlotMutations(
  slotKeyValue: string,
  slotMutations: readonly PlannedMutation[],
  edges: readonly DependencyEdge[],
  byIdentity: ReadonlyMap<string, PlannedMutation>,
): PlannedMutation[] {
  const {indegree, outgoing} = buildSlotGraph(slotMutations, edges);
  const ready = slotMutations
    .filter(
      mutation =>
        indegree.get(identity(mutation.targetType, mutation.mutationKey)) === 0,
    )
    .sort(compareMutations);
  const ordered: PlannedMutation[] = [];

  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) break;
    ordered.push(next);
    const nextIdentity = identity(next.targetType, next.mutationKey);
    for (const dependentKey of outgoing.get(nextIdentity) ?? []) {
      const remaining = (indegree.get(dependentKey) ?? 0) - 1;
      indegree.set(dependentKey, remaining);
      if (remaining === 0) {
        const dependent = byIdentity.get(dependentKey);
        if (dependent !== undefined) ready.push(dependent);
        ready.sort(compareMutations);
      }
    }
  }

  if (ordered.length !== slotMutations.length) {
    throw new InvalidOperationException(
      `Staged mutation dependency cycle detected in execution slot ${slotKeyValue}`,
    );
  }
  return ordered;
}

/**
 * Orders only supplied staged mutations. It never loads database rows,
 * synthesizes dependencies, or removes a mutation.
 */
export function orderStagedMutations(
  mutations: readonly PlannedMutation[],
  registry: ApplyRuleRegistry,
): readonly PlannedMutation[] {
  const byIdentity = validateMutationIdentities(mutations, registry);
  const edges = collectDependencyEdges(mutations, byIdentity, registry);
  const ordered: PlannedMutation[] = [];
  for (const currentSlotKey of sortedSlotKeys(mutations)) {
    const slotMutations = mutations.filter(
      mutation => slotKey(mutation) === currentSlotKey,
    );
    ordered.push(
      ...orderSlotMutations(currentSlotKey, slotMutations, edges, byIdentity),
    );
  }

  if (ordered.length !== mutations.length) {
    throw new InvalidOperationException(
      'Staged mutation ordering changed the mutation count',
    );
  }
  return ordered;
}
