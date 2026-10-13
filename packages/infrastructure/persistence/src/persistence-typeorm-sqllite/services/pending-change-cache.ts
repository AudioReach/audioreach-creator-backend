/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  editActionTargetKeyString,
  type EditActionMutationIntent,
  type EditActionTargetKey,
} from './pending-target-reducer.js';

export type PendingTargetIntents = {
  target: EditActionTargetKey;
  intents: readonly EditActionMutationIntent[];
};

type MutablePendingTargetIntents = {
  target: EditActionTargetKey;
  intents: EditActionMutationIntent[];
};

/**
 * UoW-scoped ordered intent buffer. It deliberately does not load state,
 * reduce mutations, execute SQL, or own transaction policy.
 */
export class PendingChangeCache {
  private readonly targets = new Map<string, MutablePendingTargetIntents>();

  enqueue(target: EditActionTargetKey, intent: EditActionMutationIntent): void {
    const key = editActionTargetKeyString(target);
    const entry = this.targets.get(key) ?? {target, intents: []};
    entry.intents.push(intent);
    this.targets.set(key, entry);
  }

  has(target: EditActionTargetKey): boolean {
    return this.targets.has(editActionTargetKeyString(target));
  }

  entries(): PendingTargetIntents[] {
    return [...this.targets.values()].map(entry => ({
      target: entry.target,
      intents: [...entry.intents],
    }));
  }

  size(): number {
    let count = 0;
    for (const entry of this.targets.values()) count += entry.intents.length;
    return count;
  }

  isEmpty(): boolean {
    return this.targets.size === 0;
  }

  clear(): void {
    this.targets.clear();
  }
}
