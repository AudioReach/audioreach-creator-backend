/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityBaseRow} from 'persistence-typeorm-sqllite/entity-schema/entity-base.js';
import {
  EntityManager,
  type EntityTarget,
  type ObjectLiteral,
  type QueryDeepPartialEntity,
} from 'typeorm';

export interface BatchInsertError {
  /** System ID of the failing entity */
  systemId: number;

  message: string;
}

export interface BatchInsertResult {
  success: boolean;
  failedEntities: BatchInsertError[];
}

export type InsertRow<TEntity> = QueryDeepPartialEntity<TEntity> & {
  systemId: number;
};

/**
 * Internal raw failure produced by each private insert method in an inserter.
 * Inserters group these by `moduleSystemId` to build the final
 * `BulkInsertError[]` returned to callers.
 */
export type RawFailure = {
  /** systemId of the aggregate (e.g. SpfModule) that owns the failed entity. */
  readonly systemId: number;
  /** Domain-friendly entity label, e.g. "Control Port", "CKV". */
  readonly entityLabel: string;
  /** JSON-serialized insert row that failed. */
  readonly failedRowJson: string;
  /** Database error message. */
  readonly dbError: string;
};

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const BatchInserter = {
  async insert<TEntity extends EntityBaseRow & ObjectLiteral>(
    manager: EntityManager,
    target: EntityTarget<TEntity>,
    rows: InsertRow<TEntity>[],
    batchSize = 100,
  ): Promise<BatchInsertResult> {
    if (batchSize <= 0) {
      throw new Error('batchSize must be > 0');
    }

    const result: BatchInsertResult = {
      success: true,
      failedEntities: [],
    };

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      try {
        await manager.insert<TEntity>(target, batch);
      } catch {
        // fallback to isolate failing rows
        for (const row of batch) {
          try {
            await manager.insert<TEntity>(target, row);
          } catch (rowError: unknown) {
            const message = extractErrorMessage(rowError);

            result.failedEntities.push({
              systemId: row.systemId,
              message,
            });

            result.success = false;
          }
        }
      }
    }

    return result;
  },
};
