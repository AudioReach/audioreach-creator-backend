/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {EntityManager, EntityTarget} from 'typeorm';
import {
  BatchInserterWithoutRetry,
  insertWithoutEntityUpdate,
} from '../../../../../src/persistence-typeorm-sqllite/repositories/bulk-import/common/batch-inserter.js';

type TestRow = {readonly value: number};

function createManager(
  execute: jest.Mock,
  maxBindVariables = 999,
): {
  readonly manager: EntityManager;
  readonly queryBuilder: {
    readonly orIgnore: jest.Mock;
    readonly updateEntity: jest.Mock;
    readonly values: jest.Mock;
  };
} {
  const queryBuilder = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    updateEntity: jest.fn(),
    orIgnore: jest.fn(),
    execute,
  };
  queryBuilder.insert.mockReturnValue(queryBuilder);
  queryBuilder.into.mockReturnValue(queryBuilder);
  queryBuilder.values.mockReturnValue(queryBuilder);
  queryBuilder.updateEntity.mockReturnValue(queryBuilder);
  queryBuilder.orIgnore.mockReturnValue(queryBuilder);

  const manager = {
    connection: {
      getMetadata: jest.fn().mockReturnValue({
        name: 'TestRow',
        columns: [
          {isInsert: true, isVirtual: false},
          {isInsert: true, isVirtual: false},
          {isInsert: true, isVirtual: false},
        ],
      }),
    },
    query: jest.fn().mockResolvedValue([
      {
        max_variable_number: maxBindVariables,
      },
    ]),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  } as unknown as EntityManager;

  return {manager, queryBuilder};
}

describe('insertWithoutEntityUpdate', () => {
  it('executes a shared insert without TypeORM entity updates', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const {manager, queryBuilder} = createManager(execute);
    const row = {value: 1};

    await insertWithoutEntityUpdate(
      manager,
      'TestRow' as EntityTarget<TestRow>,
      row,
    );

    expect(queryBuilder.insert).toHaveBeenCalledTimes(1);
    expect(queryBuilder.into).toHaveBeenCalledWith('TestRow');
    expect(queryBuilder.values).toHaveBeenCalledWith(row);
    expect(queryBuilder.updateEntity).toHaveBeenCalledWith(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('propagates the database error from the shared insert', async () => {
    const error = new Error('constraint failed');
    const {manager} = createManager(jest.fn().mockRejectedValue(error));

    await expect(
      insertWithoutEntityUpdate(manager, 'TestRow' as EntityTarget<TestRow>, {
        value: 1,
      }),
    ).rejects.toThrow(error);
  });
});

describe('BatchInserterWithoutRetry', () => {
  it('returns no failed rows when every batch succeeds', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const rows = Array.from({length: 334}, (_, value) => ({value}));
    const {manager, queryBuilder} = createManager(execute);

    const result = await BatchInserterWithoutRetry.insert(
      manager,
      'TestRow' as EntityTarget<TestRow>,
      rows,
    );

    expect(execute).toHaveBeenCalledTimes(2);
    expect(queryBuilder.updateEntity).toHaveBeenNthCalledWith(1, false);
    expect(queryBuilder.updateEntity).toHaveBeenNthCalledWith(2, false);
    expect(result).toEqual({failedRows: []});
  });

  it('uses SQLite runtime bind limit to size each batch', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const rows = Array.from({length: 10_923}, (_, value) => ({value}));
    const {manager} = createManager(execute, 32_766);

    const result = await BatchInserterWithoutRetry.insert(
      manager,
      'TestRow' as EntityTarget<TestRow>,
      rows,
    );

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({failedRows: []});
  });

  it('omits a failed batch without retrying its rows', async () => {
    const failure = new Error('constraint failed');
    const execute = jest
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const rows = Array.from({length: 334}, (_, value) => ({value}));
    const {manager} = createManager(execute);

    const result = await BatchInserterWithoutRetry.insert(
      manager,
      'TestRow' as EntityTarget<TestRow>,
      rows,
    );

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({failedRows: rows.slice(0, 333)});
  });

  it('uses conflict-ignore mode for idempotent association batches', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const {manager, queryBuilder} = createManager(execute);
    const rows = [{value: 1}];

    const insertResult = await BatchInserterWithoutRetry.insert(
      manager,
      'TestRow' as EntityTarget<TestRow>,
      rows,
      {ignoreConflicts: true},
    );

    expect(queryBuilder.orIgnore).toHaveBeenCalledTimes(1);
    expect(queryBuilder.updateEntity).toHaveBeenCalledWith(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(insertResult).toEqual({failedRows: []});
  });
});
