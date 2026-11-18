/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead, EntityType} from '@arc/core';
import {FAILED_ENTITY_REASON} from '@arc/core';
import {inRequestOrder} from './in-request-order.js';

/**
 * Runs `read` against the session state, then reads the IDs it reports as
 * `NOT_FOUND` again against committed data (`sessionId: null`). Used by the
 * identity reads, so an entity deleted in the session is still named as the
 * user last saw it. System IDs are unique per file, so the two reads can
 * never return different entities for one ID.
 */
export async function withCommittedFallback<
  T extends {systemId: number},
  E extends EntityType,
>(
  sessionId: number | null,
  requestedIds: readonly number[],
  read: (
    sessionId: number | null,
    ids: readonly number[],
  ) => Promise<BatchRead<T, E>>,
): Promise<BatchRead<T, E>> {
  const current = await read(sessionId, requestedIds);
  const notFoundIds = current.failed
    .filter(entity => entity.reason === FAILED_ENTITY_REASON.NotFound)
    .map(entity => entity.systemId);
  if (sessionId === null || notFoundIds.length === 0) return current;

  const committed = await read(null, notFoundIds);
  return {
    entityType: current.entityType,
    items: inRequestOrder(
      [...new Set(requestedIds)],
      [...current.items, ...committed.items],
    ),
    failed: [
      ...current.failed.filter(
        entity => entity.reason !== FAILED_ENTITY_REASON.NotFound,
      ),
      ...committed.failed,
    ],
  };
}
