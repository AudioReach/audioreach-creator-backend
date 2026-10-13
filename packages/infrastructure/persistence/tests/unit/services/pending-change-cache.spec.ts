/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {PendingChangeCache} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import type {
  EditActionMutationIntent,
  EditActionTargetKey,
} from '../../../src/persistence-typeorm-sqllite/services/pending-target-reducer.js';

const moduleTarget: EditActionTargetKey = {
  sessionId: 1,
  targetTable: ENTITY_NAMES.SpfModule,
  targetSystemId: 100,
};

const containerTarget: EditActionTargetKey = {
  sessionId: 1,
  targetTable: ENTITY_NAMES.Container,
  targetSystemId: 100,
};

function updateIntent(alias: string): EditActionMutationIntent {
  return {
    kind: CHANGE_OPERATION.Update,
    aggregateId: 10,
    fieldPath: 'alias',
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    linkedEntityGroupId: null,
    newValue: {alias},
  };
}

describe('PendingChangeCache', () => {
  it('groups ordered intents by canonical target key', () => {
    const cache = new PendingChangeCache();
    const first = updateIntent('first');
    const second = updateIntent('second');
    const third = updateIntent('third');

    cache.enqueue(moduleTarget, first);
    cache.enqueue(moduleTarget, second);
    cache.enqueue(containerTarget, third);

    expect(cache.entries()).toEqual([
      {target: moduleTarget, intents: [first, second]},
      {target: containerTarget, intents: [third]},
    ]);
    expect(cache.size()).toBe(3);
    expect(cache.has(moduleTarget)).toBe(true);
  });

  it('keeps equal numeric IDs separate when target tables differ', () => {
    const cache = new PendingChangeCache();
    cache.enqueue(moduleTarget, updateIntent('module'));
    cache.enqueue(containerTarget, updateIntent('container'));

    expect(cache.entries()).toHaveLength(2);
    expect(cache.entries()[0].target.targetTable).toBe(ENTITY_NAMES.SpfModule);
    expect(cache.entries()[1].target.targetTable).toBe(ENTITY_NAMES.Container);
  });

  it('returns entry snapshots and clears only when the writer succeeds', () => {
    const cache = new PendingChangeCache();
    cache.enqueue(moduleTarget, updateIntent('value'));

    const entries = cache.entries();
    expect(entries[0].intents).toHaveLength(1);
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.isEmpty()).toBe(true);
    expect(cache.size()).toBe(0);
  });
});
