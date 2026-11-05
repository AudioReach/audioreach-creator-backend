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
  PinoClientLogWriter,
  DbLogQueryService,
  AsyncLocalStorageLogContextProvider,
  getLoggingOrmBase,
  LogOrigin,
  LogSortOrder,
} from '../../../src/index.js';
import type {
  LogEntryReadModel,
  LogProducerIdentity,
} from '../../../src/index.js';
import {LogLevel} from '@arc/core';
import type {LogData} from '@arc/core';

const producer: LogProducerIdentity = {
  serviceName: 'audioreach-creator-api',
  serviceInstanceId: '11111111-1111-4111-8111-111111111111',
};
const UI_LAUNCH = '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52';
const OTHER_LAUNCH = '7bb8c0af-3e7f-4e08-a98a-a923b5a4cd63';

interface StoredRow {
  event_name: string;
  service_name: string;
  service_instance_id: string;
  client_name: string | null;
  client_instance_id: string | null;
  error: string | null;
}

describe('Pino to SQLite round-trip', () => {
  let dataSource: DataSource;
  let sqliteTransport: SQLiteTransport;
  let logContext: AsyncLocalStorageLogContextProvider;
  let logger: PinoLogService;
  let clientWriter: PinoClientLogWriter;
  let queryService: DbLogQueryService;

  beforeAll(async () => {
    dataSource = new TypeOrmDataSource({
      type: 'sqlite',
      database: ':memory:',
      ...getLoggingOrmBase(),
      migrationsRun: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM log_entries');

    sqliteTransport = new SQLiteTransport(dataSource);
    const pinoLogger = new LoggerFactory().createLogger({
      level: 'trace',
      transports: [{transport: sqliteTransport, level: 'trace'}],
    });
    logContext = new AsyncLocalStorageLogContextProvider();
    logger = new PinoLogService(pinoLogger, producer, logContext);
    clientWriter = new PinoClientLogWriter(pinoLogger);
    queryService = new DbLogQueryService(dataSource);
  });

  const makeData = (overrides: Partial<LogData> = {}): LogData => ({
    msg: 'test.op',
    description: 'test description',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    projectId: 'proj-42',
    component: 'TestComponent',
    tag: 'test-tag',
    ...overrides,
  });

  const readProject = async (): Promise<LogEntryReadModel[]> =>
    (
      await queryService.searchProjectLogs({
        projectId: 'proj-42',
        limit: 200,
        order: LogSortOrder.Asc,
      })
    ).items;

  const readRows = async (): Promise<StoredRow[]> =>
    (await dataSource.query(
      `SELECT event_name, service_name, service_instance_id, client_name, client_instance_id, error FROM log_entries ORDER BY id`,
    )) as StoredRow[];

  describe('level mapping', () => {
    it('logVerbose stores level as VERBOSE, not trace', async () => {
      logger.logVerbose(makeData());
      await sqliteTransport.flush();

      expect((await readProject())[0].level).toBe(LogLevel.Verbose);
    });

    it('logCritical stores level as CRITICAL, not fatal', async () => {
      logger.logCritical(makeData());
      await sqliteTransport.flush();

      expect((await readProject())[0].level).toBe(LogLevel.Critical);
    });

    it.each([
      ['logDebug', LogLevel.Debug],
      ['logInfo', LogLevel.Info],
      ['logWarn', LogLevel.Warn],
      ['logError', LogLevel.Error],
    ] as const)('%s stores level as "%s"', async (method, expected) => {
      logger[method](makeData());
      await sqliteTransport.flush();

      const rows = await readProject();
      expect(rows).toHaveLength(1);
      expect(rows[0].level).toBe(expected);
    });
  });

  describe('server records', () => {
    it('store msg as event_name and the producer identity', async () => {
      logger.logInfo(makeData({projectId: undefined}));
      await sqliteTransport.flush();

      expect(await readRows()).toEqual([
        {
          event_name: 'test.op',
          service_name: producer.serviceName,
          service_instance_id: producer.serviceInstanceId,
          client_name: null,
          client_instance_id: null,
          error: null,
        },
      ]);
    });

    it('store the client and project of the active request context', async () => {
      logContext.run(
        {
          clientName: 'audioreach-creator-ui',
          clientInstanceId: UI_LAUNCH,
          projectId: 'proj-42',
        },
        () => {
          logger.logInfo(makeData({projectId: undefined}));
        },
      );
      await sqliteTransport.flush();

      const [row] = await readProject();
      expect(row).toMatchObject({
        origin: LogOrigin.Server,
        clientName: 'audioreach-creator-ui',
        clientInstanceId: UI_LAUNCH,
        serverInstanceId: producer.serviceInstanceId,
        projectId: 'proj-42',
      });
    });

    it('persist an Error with both message and stack', async () => {
      const error = new Error('database connection failed');
      error.stack = 'Error: database connection failed\n    at test.ts:1:1';

      logger.logError(makeData({error}));
      await sqliteTransport.flush();

      const [row] = await readRows();
      expect(JSON.parse(row.error ?? '')).toEqual({
        message: error.message,
        stack: error.stack,
      });
    });
  });

  describe('client records', () => {
    it('store the client as producer and owner, ignoring the request context', async () => {
      logContext.run(
        {clientName: 'other', clientInstanceId: OTHER_LAUNCH},
        () => {
          clientWriter.write({
            level: LogLevel.Warn,
            eventName: 'project.open.slow',
            description: 'Opening project Demo took 4 s',
            component: 'ProjectView',
            tag: 'project',
            timestamp: new Date('2026-01-01T00:00:05.000Z'),
            projectId: 'proj-42',
            clientName: 'audioreach-creator-ui',
            clientInstanceId: UI_LAUNCH,
          });
        },
      );
      await sqliteTransport.flush();

      const [row] = await readProject();
      expect(row).toMatchObject({
        level: LogLevel.Warn,
        eventName: 'project.open.slow',
        timestamp: '2026-01-01T00:00:05.000Z',
        origin: LogOrigin.Client,
        clientName: 'audioreach-creator-ui',
        clientInstanceId: UI_LAUNCH,
      });
      expect(row.serverInstanceId).toBeUndefined();
      expect(await readRows()).toEqual([
        expect.objectContaining({
          service_name: 'audioreach-creator-ui',
          service_instance_id: UI_LAUNCH,
        }),
      ]);
    });
  });
});
