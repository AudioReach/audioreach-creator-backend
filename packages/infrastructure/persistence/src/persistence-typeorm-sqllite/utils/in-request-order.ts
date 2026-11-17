/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Rows reordered to match `requestedIds`; missing IDs are skipped. A
 * repeated ID repeats its row, so callers pass deduplicated IDs.
 */
export function inRequestOrder<T extends {systemId: number}>(
  requestedIds: readonly number[],
  rows: readonly T[],
): T[] {
  const byId = new Map(rows.map(row => [row.systemId, row]));
  return requestedIds
    .map(id => byId.get(id))
    .filter((row): row is T => row !== undefined);
}
