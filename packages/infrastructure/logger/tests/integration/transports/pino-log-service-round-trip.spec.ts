/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource as TypeOrmDataSource} from 'typeorm';
import type {DataSource} from 'typeorm';
import {
  LoggerFactory,
  SQLiteTransport,
  PinoLogService,
  DbLogQueryService,
  LogEntrySchema,
} from '../../../src/index.js';
import {LogLevel, LogSource} from '@arc/core';

describe('PinoLogService round-trip — level mapping', () => {
  let dataSource: DataSource;
  let logger: PinoLogService;
  let sqliteTransport: SQLiteTransport;
  let queryService: DbLogQueryService;

  beforeAll(async () => {
    dataSource = new TypeOrmDataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [LogEntrySchema],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM log_entries');

    sqliteTransport = new SQLiteTransport(dataSource);
    const factory = new LoggerFactory();
    const pinoLogger = factory.createLogger({
      level: 'trace',
      transports: [{transport: sqliteTransport, level: 'trace'}],
    });
    logger = new PinoLogService(pinoLogger);
    queryService = new DbLogQueryService(dataSource);
  });

  const makeData = (overrides = {}) => ({
    msg: 'test-op',
    description: 'test description',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    source: 'client-id',
    projectId: 'proj-42',
    component: 'TestComponent',
    tag: 'test-tag',
    ...overrides,
  });

  it('logVerbose stores level as "verbose", not "trace"', async () => {
    logger.logVerbose(makeData());
    await sqliteTransport.flush();

    const rows = await queryService.getLogsByProject('proj-42', 'client-id');
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe(LogLevel.Verbose);
  });

  it('logCritical stores level as "critical", not "fatal"', async () => {
    logger.logCritical(makeData());
    await sqliteTransport.flush();

    const rows = await queryService.getLogsByProject('proj-42', 'client-id');
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe(LogLevel.Critical);
  });

  it.each([
    ['logDebug', LogLevel.Debug],
    ['logInfo', LogLevel.Info],
    ['logWarn', LogLevel.Warn],
    ['logError', LogLevel.Error],
  ] as const)('%s stores level as "%s"', async (method, expected) => {
    logger[method](makeData());
    await sqliteTransport.flush();

    const rows = await queryService.getLogsByProject('proj-42', 'client-id');
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe(expected);
  });

  it('source defaults to "Server" when omitted', async () => {
    logger.logInfo(makeData({source: undefined, projectId: undefined}));
    await sqliteTransport.flush();

    const rows = (await dataSource.query(
      `SELECT source FROM log_entries WHERE source = ?`,
      [LogSource.Server],
    )) as {source: string}[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe(LogSource.Server);
  });
});
