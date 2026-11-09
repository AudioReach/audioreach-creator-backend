/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager, EntityMetadata} from 'typeorm';

// SQLite 3.32+ (2020) raised SQLITE_MAX_VARIABLE_NUMBER from 999 to 32766.
// better-sqlite3 ships SQLite 3.43+, so 32766 is the correct safe default.
export const DEFAULT_SQLITE_MAX_BIND_VARIABLES = 32_766;

type MaxVariableNumberRow = {readonly max_variable_number: number};

const maxBindVariablesByDataSource = new WeakMap<object, Promise<number>>();

/** Reads SQLite's runtime variable limit once for each initialized data source. */
export function getSqliteMaxBindVariables(
  manager: EntityManager,
): Promise<number> {
  const dataSource = manager.connection;
  const cached = maxBindVariablesByDataSource.get(dataSource);
  if (cached) return cached;

  const maxBindVariables = manager
    // eslint-disable-next-line custom/no-raw-persistence-queries -- PRAGMA is the only API to read SQLite's runtime variable limit
    .query('PRAGMA max_variable_number')
    .then((rows: readonly MaxVariableNumberRow[]) => {
      const value = rows[0]?.max_variable_number;
      return Number.isSafeInteger(value) && value > 0
        ? value
        : DEFAULT_SQLITE_MAX_BIND_VARIABLES;
    })
    .catch(() => DEFAULT_SQLITE_MAX_BIND_VARIABLES);

  maxBindVariablesByDataSource.set(dataSource, maxBindVariables);
  return maxBindVariables;
}

/**
 * Returns the maximum SQLite insert row count for an entity without exceeding
 * SQLite's bind-variable limit.
 */
export function getSqliteInsertBatchSize(
  metadata: EntityMetadata,
  maxBindVariables = DEFAULT_SQLITE_MAX_BIND_VARIABLES,
): number {
  const columnCount = metadata.columns.filter(
    column => column.isInsert && !column.isVirtual,
  ).length;
  if (columnCount === 0) {
    throw new Error(
      `Entity '${metadata.name}' must define at least one insertable column`,
    );
  }

  const batchSize = Math.floor(maxBindVariables / columnCount);
  if (batchSize === 0) {
    throw new Error(
      `SQLite bind-variable limit (${maxBindVariables}) is lower than the insertable column count (${columnCount}) for '${metadata.name}'`,
    );
  }

  return batchSize;
}
