/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead, FailedEntity} from '@arc/core';
import {FAILED_ENTITY_REASON} from '@arc/core';

/**
 * Appends `NOT_FOUND` entries for every requested systemId that is neither
 * loaded nor already failed.
 */
export function withNotFound<T>(
  requestedIds: readonly number[],
  items: T[],
  getSystemId: (item: T) => number,
  failed: FailedEntity[] = [],
): BatchRead<T> {
  const seen = new Set<number>([
    ...items.map(item => getSystemId(item)),
    ...failed.map(f => f.systemId),
  ]);
  const notFound: FailedEntity[] = [];
  for (const id of new Set(requestedIds)) {
    if (!seen.has(id)) {
      notFound.push({systemId: id, reason: FAILED_ENTITY_REASON.NotFound});
    }
  }
  return {items, failed: [...failed, ...notFound]};
}
