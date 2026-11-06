/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import type {Logger} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {EntityBaseRow} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-base.js';
import {
  BatchInserter,
  DEFAULT_BATCH_SIZE,
  registerBatchInsertDiagnostics,
  type BatchInsertDiagnostics,
  type InsertRow,
} from '../../../../../src/persistence-typeorm-sqllite/repositories/bulk-import/common/batch-inserter.js';

interface TestRow extends EntityBaseRow {
  readonly name: string;
}

function createLogger(): jest.Mocked<Logger> {
  return {
    logVerbose: jest.fn(),
    logDebug: jest.fn(),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logCritical: jest.fn(),
  } as jest.Mocked<Logger>;
}

function diagnostics(
  logger: jest.Mocked<Logger>,
  enabled: boolean,
): BatchInsertDiagnostics {
  return {enabled, logger};
}

function row(systemId: number, name: string): InsertRow<TestRow> {
  return {systemId, name};
}

type QueryBuilderStub = {
  readonly insert: jest.Mock;
  readonly into: jest.Mock;
  readonly values: jest.Mock;
  readonly updateEntity: jest.Mock;
  readonly execute: jest.Mock;
};

function createManager(execute: jest.Mock): {
  readonly manager: EntityManager;
  readonly queryBuilder: QueryBuilderStub;
} {
  const queryBuilder: QueryBuilderStub = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    updateEntity: jest.fn(),
    execute,
  };
  queryBuilder.insert.mockReturnValue(queryBuilder);
  queryBuilder.into.mockReturnValue(queryBuilder);
  queryBuilder.values.mockReturnValue(queryBuilder);
  queryBuilder.updateEntity.mockReturnValue(queryBuilder);

  return {
    manager: {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as EntityManager,
    queryBuilder,
  };
}

describe('BatchInserter diagnostics', () => {
  it('uses the common default batch size', async () => {
    const execute = jest.fn(async () => undefined);
    const {manager, queryBuilder} = createManager(execute);
    const rows = Array.from({length: DEFAULT_BATCH_SIZE + 1}, (_, index) =>
      row(index + 1, `row-${index + 1}`),
    );

    await BatchInserter.insert<TestRow>(manager, 'TestRow', rows);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(queryBuilder.values.mock.calls[0][0]).toHaveLength(
      DEFAULT_BATCH_SIZE,
    );
    expect(queryBuilder.values.mock.calls[1][0]).toHaveLength(1);
    expect(queryBuilder.updateEntity).toHaveBeenNthCalledWith(1, false);
    expect(queryBuilder.updateEntity).toHaveBeenNthCalledWith(2, false);
  });

  it('does not log diagnostics when disabled', async () => {
    const logger = createLogger();
    const {manager} = createManager(jest.fn(async () => undefined));

    const result = await BatchInserter.insert<TestRow>(
      manager,
      'TestRow',
      [row(1, 'first')],
      {
        diagnostics: diagnostics(logger, false),
      },
    );

    expect(result).toEqual({success: true, failedEntities: []});
    expect(logger.logWarn).not.toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('does not log successful operations when diagnostics are enabled', async () => {
    const logger = createLogger();
    const {manager} = createManager(jest.fn(async () => undefined));

    await BatchInserter.insert<TestRow>(
      manager,
      'TestRow',
      [row(1, 'first'), row(2, 'second')],
      {
        batchSize: 2,
        diagnostics: diagnostics(logger, true),
      },
    );

    expect(logger.logWarn).not.toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('uses registered diagnostics for insert failures', async () => {
    const logger = createLogger();
    const {manager} = createManager(
      jest.fn(async () => {
        throw new Error('constraint failed');
      }),
    );
    registerBatchInsertDiagnostics(manager, diagnostics(logger, true));

    await BatchInserter.insert<TestRow>(manager, 'TestRow', [row(1, 'first')]);

    expect(logger.logError).toHaveBeenCalledTimes(2);
    registerBatchInsertDiagnostics(manager, diagnostics(logger, false));
  });

  it('logs batch and fallback-row failures', async () => {
    const logger = createLogger();
    let value: InsertRow<TestRow> | InsertRow<TestRow>[] | undefined;
    const execute = jest.fn(async () => {
      if (Array.isArray(value)) throw new Error('batch constraint failed');
      if (value?.systemId === 2) {
        throw new Error('row constraint failed');
      }
    });
    const {manager, queryBuilder} = createManager(execute);
    queryBuilder.values.mockImplementation(insertValue => {
      value = insertValue as InsertRow<TestRow> | InsertRow<TestRow>[];
      return queryBuilder;
    });

    const result = await BatchInserter.insert<TestRow>(
      manager,
      'TestRow',
      [row(1, 'first'), row(2, 'second')],
      {
        diagnostics: diagnostics(logger, true),
      },
    );

    expect(result.failedEntities).toEqual([
      {systemId: 2, message: 'row constraint failed'},
    ]);
    expect(queryBuilder.updateEntity).toHaveBeenCalledTimes(3);
    expect(queryBuilder.updateEntity).toHaveBeenCalledWith(false);
    expect(logger.logError).toHaveBeenCalledTimes(2);
    expect(logger.logError.mock.calls[0][0]).toEqual(
      expect.objectContaining({msg: 'bulk_insert_batch_failed'}),
    );
    expect(logger.logError.mock.calls[1][0]).toEqual(
      expect.objectContaining({msg: 'bulk_insert_fallback_row_failed'}),
    );
  });
});
