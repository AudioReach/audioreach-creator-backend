/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {RawFailure} from '../batch-inserter.js';
import {okBulkInsert, errBulkInsert} from '@arc/core';
import type {BulkInsertResult} from '@arc/core';

export function groupRawFailures<T>(
  rawFailures: RawFailure[],
  aggregateById: Map<number, T>,
  describeAggregate: (item: T) => string,
): BulkInsertResult {
  if (rawFailures.length === 0) return okBulkInsert();

  const byAggregate = new Map<number, string[]>();
  for (const f of rawFailures) {
    const lines = byAggregate.get(f.systemId) ?? [];
    lines.push(`${f.entityLabel}: ${f.dbError}\n  ${f.failedRowJson}`);
    byAggregate.set(f.systemId, lines);
  }

  const errors = [...byAggregate.entries()].map(([systemId, lines]) => ({
    message: `Failed to insert ${describeAggregate(aggregateById.get(systemId)!)}`,
    details: lines.join('\n'),
  }));

  return errBulkInsert(errors);
}
