/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {FAILED_ENTITY_REASON} from '@arc/core';
import {withNotFound} from '../../../src/persistence-typeorm-sqllite/utils/with-not-found.js';

type Item = {systemId: number};
const id = (item: Item) => item.systemId;

describe('withNotFound', () => {
  it('reports requested ids that were not loaded as NOT_FOUND', () => {
    const read = withNotFound([1, 2, 3], [{systemId: 2}], id);

    expect(read.items).toEqual([{systemId: 2}]);
    expect(read.failed).toEqual([
      {systemId: 1, reason: FAILED_ENTITY_REASON.NotFound},
      {systemId: 3, reason: FAILED_ENTITY_REASON.NotFound},
    ]);
  });

  it('does not report an id twice when it is already failed', () => {
    const unresolved = {
      systemId: 1,
      reason: FAILED_ENTITY_REASON.UnresolvedReference,
      missingRef: {entityType: 'ValueDefinition' as const, systemId: 9},
    };

    const read = withNotFound([1, 1, 2], [], id, [unresolved]);

    expect(read.failed).toEqual([
      unresolved,
      {systemId: 2, reason: FAILED_ENTITY_REASON.NotFound},
    ]);
  });

  it('returns no failures when every id was loaded', () => {
    expect(withNotFound([1], [{systemId: 1}], id).failed).toEqual([]);
  });
});
