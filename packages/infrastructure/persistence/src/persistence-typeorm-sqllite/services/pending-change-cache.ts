/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  editActionTargetKeyString,
  type EditActionMutation,
  type EditActionTargetKey,
} from './pending-target-reducer.js';

export type PendingTargetMutations = {
  target: EditActionTargetKey;
  mutations: readonly EditActionMutation[];
};

type MutablePendingTargetMutations = {
  target: EditActionTargetKey;
  mutations: EditActionMutation[];
};

/**
 * UoW-scoped ordered mutation buffer. It deliberately does not load state,
 * reduce mutations, execute SQL, or own transaction policy.
 */
export class PendingChangeCache {
  private readonly targets = new Map<string, MutablePendingTargetMutations>();

  enqueue(target: EditActionTargetKey, mutation: EditActionMutation): void {
    const key = editActionTargetKeyString(target);
    const entry = this.targets.get(key) ?? {target, mutations: []};
    entry.mutations.push(mutation);
    this.targets.set(key, entry);
  }

  has(target: EditActionTargetKey): boolean {
    return this.targets.has(editActionTargetKeyString(target));
  }

  entries(): PendingTargetMutations[] {
    return [...this.targets.values()].map(entry => ({
      target: entry.target,
      mutations: [...entry.mutations],
    }));
  }

  size(): number {
    let count = 0;
    for (const entry of this.targets.values()) count += entry.mutations.length;
    return count;
  }

  isEmpty(): boolean {
    return this.targets.size === 0;
  }

  clear(): void {
    this.targets.clear();
  }
}
