/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from '@arc/core';
import type {EntityBaseRow} from '../../../entity-schema/entity-base.js';
import {
  getSqliteInsertBatchSize,
  getSqliteMaxBindVariables,
} from './sqlite-insert-batch-size.js';
import {
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
  type QueryDeepPartialEntity,
} from 'typeorm';

export const DEFAULT_BATCH_SIZE = 500;

export interface BatchInsertDiagnostics {
  readonly enabled: boolean;
  readonly logger: Logger;
}

const diagnosticsByManager = new WeakMap<
  EntityManager,
  BatchInsertDiagnostics
>();

export function registerBatchInsertDiagnostics(
  manager: EntityManager,
  diagnostics?: BatchInsertDiagnostics,
): void {
  if (diagnostics?.enabled === true) {
    diagnosticsByManager.set(manager, diagnostics);
  } else {
    diagnosticsByManager.delete(manager);
  }
}

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

export interface BatchInsertOptions {
  readonly batchSize?: number;
  readonly diagnostics?: BatchInsertDiagnostics;
}

/** Rows from batches that failed during the first-pass insert. */
export type BatchInsertWithoutRetryResult<TRow> = {
  readonly failedRows: readonly TRow[];
};

export type BatchInsertWithoutRetryOptions = {
  /** Preserve SQLite INSERT OR IGNORE behavior for idempotent association rows. */
  readonly ignoreConflicts?: boolean;
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

function getTargetName<TEntity>(target: EntityTarget<TEntity>): string {
  if (typeof target === 'string') return target;
  if (typeof target === 'function') return target.name;
  if ('options' in target) return target.options.name;
  return target.name;
}

function getBatchInsertErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Carries either a successful insert or the original error for fallback handling.
type InsertAttempt =
  | {readonly success: true}
  | {readonly success: false; readonly error: unknown};

async function tryInsert<TEntity extends EntityBaseRow & ObjectLiteral>(
  manager: EntityManager,
  target: EntityTarget<TEntity>,
  value: InsertRow<TEntity> | InsertRow<TEntity>[],
): Promise<InsertAttempt> {
  try {
    // EntityManager.insert() keeps entity updates enabled. Because SQLite does
    // not support RETURNING, TypeORM would reload default/version columns with
    // a SELECT after each successful bulk insert.
    await manager
      .createQueryBuilder()
      .insert()
      .into(target)
      .values(value)
      .updateEntity(false)
      .execute();
    return {success: true};
  } catch (error: unknown) {
    return {success: false, error};
  }
}

async function insertFallbackRows<
  TEntity extends EntityBaseRow & ObjectLiteral,
>(
  manager: EntityManager,
  target: EntityTarget<TEntity>,
  batch: InsertRow<TEntity>[],
  batchStartIndex: number,
  batchIndex: number,
  targetName: string,
  diagnostics: BatchInsertDiagnostics | undefined,
): Promise<BatchInsertError[]> {
  const failedEntities: BatchInsertError[] = [];

  // A failed batch is retried row by row so valid rows can still be imported.
  for (const [offset, row] of batch.entries()) {
    const rowIndex = batchStartIndex + offset;
    const attempt = await tryInsert(manager, target, row);

    if (attempt.success) continue;

    failedEntities.push({
      systemId: row.systemId,
      message: getBatchInsertErrorMessage(attempt.error),
    });
    logInsertFailure(
      diagnostics,
      'bulk_insert_fallback_row_failed',
      `target=${targetName} operation=insert batchIndex=${batchIndex} rowIndex=${rowIndex}`,
      attempt.error,
    );
  }

  return failedEntities;
}

function logInsertFailure(
  diagnostics: BatchInsertDiagnostics | undefined,
  msg: string,
  description: string,
  error: unknown,
): void {
  if (diagnostics?.enabled !== true) return;

  diagnostics.logger.logError({
    msg,
    description,
    component: 'BatchInserter',
    tag: 'database-persistence',
    error: error instanceof Error ? error : new Error(String(error)),
  });
}

export const BatchInserter = {
  async insert<TEntity extends EntityBaseRow & ObjectLiteral>(
    manager: EntityManager,
    target: EntityTarget<TEntity>,
    rows: InsertRow<TEntity>[],
    options: BatchInsertOptions = {},
  ): Promise<BatchInsertResult> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    if (batchSize <= 0) {
      throw new Error('batchSize must be > 0');
    }

    const diagnostics =
      options.diagnostics ?? diagnosticsByManager.get(manager);
    const targetName = getTargetName(target);

    const result: BatchInsertResult = {
      success: true,
      failedEntities: [],
    };

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const batchIndex = i / batchSize;
      const attempt = await tryInsert(manager, target, batch);

      if (!attempt.success) {
        logInsertFailure(
          diagnostics,
          'bulk_insert_batch_failed',
          `target=${targetName} operation=insert batchIndex=${batchIndex} rowCount=${batch.length}`,
          attempt.error,
        );

        const failedEntities = await insertFallbackRows(
          manager,
          target,
          batch,
          i,
          batchIndex,
          targetName,
          diagnostics,
        );
        result.failedEntities.push(...failedEntities);
        if (failedEntities.length > 0) result.success = false;
      }
    }

    return result;
  },
};

/**
 * Inserts rows in SQLite-safe batches without retrying failed batches.
 * Callers receive the failed rows and apply their own fallback logic.
 */
export const BatchInserterWithoutRetry = {
  async insert<
    TEntity extends ObjectLiteral,
    TRow extends QueryDeepPartialEntity<TEntity>,
  >(
    manager: EntityManager,
    target: EntityTarget<TEntity>,
    rows: readonly TRow[],
    options: BatchInsertWithoutRetryOptions = {},
  ): Promise<BatchInsertWithoutRetryResult<TRow>> {
    const maxBindVariables = await getSqliteMaxBindVariables(manager);
    const batchSize = getSqliteInsertBatchSize(
      manager.connection.getMetadata(target),
      maxBindVariables,
    );
    const failedRows: TRow[] = [];

    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      try {
        const queryBuilder = manager
          .createQueryBuilder()
          .insert()
          .into(target)
          .values(batch)
          .updateEntity(false);
        if (options.ignoreConflicts) queryBuilder.orIgnore();
        await queryBuilder.execute();
      } catch {
        failedRows.push(...batch);
      }
    }

    return {failedRows};
  },
};
