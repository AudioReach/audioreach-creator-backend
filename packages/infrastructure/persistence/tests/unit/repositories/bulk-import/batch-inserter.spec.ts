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
} from '../../../../src/persistence-typeorm-sqllite/repositories/bulk-import/batch-inserter.js';

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
  return {enabled, logger, slowThresholdMs: 0};
}

function row(systemId: number, name: string): InsertRow<TestRow> {
  return {systemId, name};
}

describe('BatchInserter diagnostics', () => {
  it('uses the common default batch size', async () => {
    const manager = {
      insert: jest.fn(async () => undefined),
    } as unknown as EntityManager;
    const rows = Array.from({length: DEFAULT_BATCH_SIZE + 1}, (_, index) =>
      row(index + 1, `row-${index + 1}`),
    );

    await BatchInserter.insert<TestRow>(manager, 'TestRow', rows);

    expect(manager.insert).toHaveBeenCalledTimes(2);
    expect(manager.insert.mock.calls[0][1]).toHaveLength(DEFAULT_BATCH_SIZE);
    expect(manager.insert.mock.calls[1][1]).toHaveLength(1);
  });

  it('does not log or measure diagnostics when disabled', async () => {
    const logger = createLogger();
    const manager = {
      insert: jest.fn(async () => undefined),
    } as unknown as EntityManager;

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

  it('logs only slow operations when enabled', async () => {
    const logger = createLogger();
    const manager = {
      insert: jest.fn(async () => undefined),
    } as unknown as EntityManager;

    await BatchInserter.insert<TestRow>(
      manager,
      'TestRow',
      [row(1, 'first'), row(2, 'second')],
      {
        batchSize: 2,
        diagnostics: diagnostics(logger, true),
      },
    );

    expect(logger.logWarn).toHaveBeenCalled();
    expect(logger.logWarn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        msg: 'bulk_insert_slow',
        component: 'BatchInserter',
      }),
    );
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('uses diagnostics registered for the manager', async () => {
    const logger = createLogger();
    const manager = {
      insert: jest.fn(async () => undefined),
    } as unknown as EntityManager;
    registerBatchInsertDiagnostics(manager, diagnostics(logger, true));

    await BatchInserter.insert<TestRow>(manager, 'TestRow', [row(1, 'first')]);

    expect(logger.logWarn).toHaveBeenCalled();
    registerBatchInsertDiagnostics(manager, diagnostics(logger, false));
  });

  it('logs batch and fallback-row failures', async () => {
    const logger = createLogger();
    const manager = {
      insert: jest.fn(async (_target: unknown, value: unknown) => {
        if (Array.isArray(value)) throw new Error('batch constraint failed');
        if ((value as TestRow).systemId === 2) {
          throw new Error('row constraint failed');
        }
      }),
    } as unknown as EntityManager;

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
    expect(logger.logError).toHaveBeenCalledTimes(2);
    expect(logger.logError.mock.calls[0][0]).toEqual(
      expect.objectContaining({msg: 'bulk_insert_batch_failed'}),
    );
    expect(logger.logError.mock.calls[1][0]).toEqual(
      expect.objectContaining({msg: 'bulk_insert_fallback_row_failed'}),
    );
  });
});
