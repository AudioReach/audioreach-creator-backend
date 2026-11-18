/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {ENTITY_TYPE, FAILED_ENTITY_REASON} from '@arc/core';
import {withCommittedFallback} from '../../../src/persistence-typeorm-sqllite/utils/with-committed-fallback.js';
import {withNotFound} from '../../../src/persistence-typeorm-sqllite/utils/with-not-found.js';

/** An entity as a read returns it; `state` says which state it came from. */
type Item = {systemId: number; state: 'session' | 'committed'};

const SESSION_ID = 7;
const UNRESOLVED_ID = 4;

/**
 * Fake read over two states. IDs 1 and 4 exist in the session, 2 and 3
 * only in committed data (deleted in the session); 4 is unresolved.
 */
function fakeRead() {
  const calls: {sessionId: number | null; ids: readonly number[]}[] = [];
  const read = (sessionId: number | null, ids: readonly number[]) => {
    calls.push({sessionId, ids});
    const existing = sessionId === null ? [2, 3] : [1];
    const items: Item[] = ids
      .filter(id => existing.includes(id))
      .map(systemId => ({
        systemId,
        state: sessionId === null ? 'committed' : 'session',
      }));
    const failed = ids.includes(UNRESOLVED_ID)
      ? [
          {
            systemId: UNRESOLVED_ID,
            reason: FAILED_ENTITY_REASON.UnresolvedReference,
          },
        ]
      : [];
    return Promise.resolve(
      withNotFound(
        ENTITY_TYPE.Subgraph,
        ids,
        items,
        item => item.systemId,
        failed,
      ),
    );
  };
  return {read, calls};
}

describe('withCommittedFallback', () => {
  it('reads entities deleted in the session from committed data, in request order', async () => {
    const {read, calls} = fakeRead();

    const result = await withCommittedFallback(SESSION_ID, [3, 1, 2], read);

    expect(result.items).toEqual([
      {systemId: 3, state: 'committed'},
      {systemId: 1, state: 'session'},
      {systemId: 2, state: 'committed'},
    ]);
    expect(result.failed).toEqual([]);
    expect(calls).toEqual([
      {sessionId: SESSION_ID, ids: [3, 1, 2]},
      {sessionId: null, ids: [3, 2]},
    ]);
  });

  it('reports an ID found in neither state as not found', async () => {
    const {read} = fakeRead();

    const result = await withCommittedFallback(SESSION_ID, [1, 99], read);

    expect(result.items.map(item => item.systemId)).toEqual([1]);
    expect(result.failed).toEqual([
      {systemId: 99, reason: FAILED_ENTITY_REASON.NotFound},
    ]);
  });

  it('keeps an unresolved entity of the session without reading it again', async () => {
    const {read, calls} = fakeRead();

    const result = await withCommittedFallback(
      SESSION_ID,
      [UNRESOLVED_ID],
      read,
    );

    expect(result.failed).toEqual([
      {
        systemId: UNRESOLVED_ID,
        reason: FAILED_ENTITY_REASON.UnresolvedReference,
      },
    ]);
    expect(calls).toHaveLength(1);
  });

  it('reads once when there is no session', async () => {
    const {read, calls} = fakeRead();

    const result = await withCommittedFallback(null, [2, 99], read);

    expect(result.items.map(item => item.systemId)).toEqual([2]);
    expect(result.failed).toEqual([
      {systemId: 99, reason: FAILED_ENTITY_REASON.NotFound},
    ]);
    expect(calls).toHaveLength(1);
  });
});
