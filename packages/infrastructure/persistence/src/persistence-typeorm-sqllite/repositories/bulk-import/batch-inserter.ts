/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '@arc/core';
import type {EntityBaseRow} from 'persistence-typeorm-sqllite/entity-schema/entity-base.js';
import {EntityManager, type EntityTarget, type ObjectLiteral} from 'typeorm';
import type {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';

/**
 * Represents the result of a insert operation.
 * Provides a simple success/failure indicator along with error details.
 */
export interface BatchInsertResult {
  /**
   * Indicates whether the insert operation was successful.
   * True if all entities were inserted successfully, false otherwise.
   */
  success: boolean;

  /**
   * Array of errors for entities that failed to insert.
   * Empty array if all insertions were successful.
   */
  failedEntities: BaseInsertError[];
}

export const BatchInserter = {
  async insert<TEntity extends EntityBaseRow & ObjectLiteral>(
    manager: EntityManager,
    target: EntityTarget<TEntity>,
    rows: QueryDeepPartialEntity<TEntity>[],
    batchSize = 100,
  ): Promise<BatchInsertResult> {
    const result: BatchInsertResult = {
      success: true,
      failedEntities: [],
    };

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        await manager.insert<TEntity>(target, batch);
      } catch {
        result.success = false;
        for (const row of batch) {
          try {
            await manager.insert<TEntity>(target, row);
          } catch (rowError) {
            result.failedEntities.push({
              systemId: (row as TEntity).systemId,
              message: (rowError as Error).message,
            } as BaseInsertError);
          }
        }
      }
    }

    return result;
  },
};
