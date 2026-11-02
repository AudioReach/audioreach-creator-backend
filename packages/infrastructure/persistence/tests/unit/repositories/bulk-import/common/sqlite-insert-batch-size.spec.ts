/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {DataSource, EntityManager, EntityMetadata} from 'typeorm';
import {
  DEFAULT_SQLITE_MAX_BIND_VARIABLES,
  getSqliteMaxBindVariables,
  getSqliteInsertBatchSize,
} from '../../../../../src/persistence-typeorm-sqllite/repositories/bulk-import/common/sqlite-insert-batch-size.js';

describe('getSqliteInsertBatchSize', () => {
  it('derives the row limit from TypeORM insertable columns', () => {
    const metadata = {
      name: 'ThreeColumnAssociation',
      columns: [
        {isInsert: true, isVirtual: false},
        {isInsert: true, isVirtual: false},
        {isInsert: true, isVirtual: false},
        {isInsert: false, isVirtual: false},
        {isInsert: true, isVirtual: true},
      ],
    } as EntityMetadata;

    expect(getSqliteInsertBatchSize(metadata)).toBe(
      Math.floor(DEFAULT_SQLITE_MAX_BIND_VARIABLES / 3),
    );
  });

  it('uses the detected SQLite variable limit when calculating rows', () => {
    const metadata = {
      name: 'FiveColumnEntity',
      columns: Array.from({length: 5}, () => ({
        isInsert: true,
        isVirtual: false,
      })),
    } as EntityMetadata;

    expect(getSqliteInsertBatchSize(metadata, 32_766)).toBe(6_553);
  });
});

describe('getSqliteMaxBindVariables', () => {
  it('reads the SQLite runtime variable limit', async () => {
    const dataSource = {} as DataSource;
    const query = jest
      .fn<EntityManager['query']>()
      .mockResolvedValue([{max_variable_number: 32_766}]);
    const manager = {connection: dataSource, query} as unknown as EntityManager;

    await expect(getSqliteMaxBindVariables(manager)).resolves.toBe(32_766);
    expect(query).toHaveBeenCalledWith('PRAGMA max_variable_number');
  });

  it('uses the safe default when SQLite does not report a variable limit', async () => {
    const dataSource = {} as DataSource;
    const query = jest.fn<EntityManager['query']>().mockResolvedValue([]);
    const manager = {connection: dataSource, query} as unknown as EntityManager;

    await expect(getSqliteMaxBindVariables(manager)).resolves.toBe(
      DEFAULT_SQLITE_MAX_BIND_VARIABLES,
    );
  });

  it('queries the runtime variable limit only once for each data source', async () => {
    const dataSource = {} as DataSource;
    const firstQuery = jest
      .fn<EntityManager['query']>()
      .mockResolvedValue([{max_variable_number: 32_766}]);
    const secondQuery = jest.fn<EntityManager['query']>();
    const firstManager = {
      connection: dataSource,
      query: firstQuery,
    } as unknown as EntityManager;
    const secondManager = {
      connection: dataSource,
      query: secondQuery,
    } as unknown as EntityManager;

    await expect(getSqliteMaxBindVariables(firstManager)).resolves.toBe(32_766);
    await expect(getSqliteMaxBindVariables(secondManager)).resolves.toBe(
      32_766,
    );
    expect(firstQuery).toHaveBeenCalledTimes(1);
    expect(secondQuery).not.toHaveBeenCalled();
  });

  it('uses the safe default if reading the runtime limit fails', async () => {
    const dataSource = {} as DataSource;
    const query = jest
      .fn<EntityManager['query']>()
      .mockRejectedValue(new Error('PRAGMA unavailable'));
    const manager = {connection: dataSource, query} as unknown as EntityManager;

    await expect(getSqliteMaxBindVariables(manager)).resolves.toBe(
      DEFAULT_SQLITE_MAX_BIND_VARIABLES,
    );
  });
});
