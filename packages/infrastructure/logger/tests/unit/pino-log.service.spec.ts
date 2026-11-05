/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {PinoLogService} from '../../src/pino-log.service.js';
import type {ServerLogRecord} from '../../src/pino-log.service.js';
import {AsyncLocalStorageLogContextProvider} from '../../src/context/async-local-storage-log-context-provider.js';
import type {LogProducerIdentity} from '../../src/identity/log-producer-identity.js';
import type {LogData} from '@arc/core';

const makeData = (): LogData => ({
  msg: 'test-msg',
  description: 'test description',
  timestamp: new Date('2026-01-01T00:00:00Z'),
  component: 'TestComponent',
  tag: 'test-tag',
});

const producer: LogProducerIdentity = {
  serviceName: 'test-service',
  serviceInstanceId: '11111111-1111-4111-8111-111111111111',
};

const CLIENT_ID = '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52';

describe('PinoLogService', () => {
  let logContext: AsyncLocalStorageLogContextProvider;

  beforeEach(() => {
    logContext = new AsyncLocalStorageLogContextProvider();
  });

  const makePinoLogger = () => ({
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  });

  it('logVerbose delegates to pinoLogger.trace', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data = makeData();
    svc.logVerbose(data);
    expect(pino.trace).toHaveBeenCalledWith(expect.objectContaining(data));
  });

  it('logDebug delegates to pinoLogger.debug', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data = makeData();
    svc.logDebug(data);
    expect(pino.debug).toHaveBeenCalledWith(expect.objectContaining(data));
  });

  it('logInfo delegates to pinoLogger.info', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data = makeData();
    svc.logInfo(data);
    expect(pino.info).toHaveBeenCalledWith(expect.objectContaining(data));
  });

  it('logWarn delegates to pinoLogger.warn', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data = makeData();
    svc.logWarn(data);
    expect(pino.warn).toHaveBeenCalledWith(expect.objectContaining(data));
  });

  it('logError delegates to pinoLogger.error', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data = makeData();
    svc.logError(data);
    expect(pino.error).toHaveBeenCalledWith(expect.objectContaining(data));
  });

  it('logCritical delegates to pinoLogger.fatal', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data = makeData();
    svc.logCritical(data);
    expect(pino.fatal).toHaveBeenCalledWith(expect.objectContaining(data));
  });

  it('defaults the timestamp when it is omitted', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);
    const data: LogData = {
      msg: 'test-msg',
      description: 'test description',
      component: 'TestComponent',
      tag: 'test-tag',
    };

    svc.logInfo(data);

    const loggedData = (pino.info as jest.Mock).mock.calls[0][0] as LogData;
    expect(loggedData.timestamp).toBeInstanceOf(Date);
  });

  it('adds the producer identity to every record', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);

    svc.logInfo(makeData());

    const record = (pino.info as jest.Mock).mock.calls[0][0] as ServerLogRecord;
    expect(record.serviceName).toBe('test-service');
    expect(record.serviceInstanceId).toBe(producer.serviceInstanceId);
  });

  it('omits the context fields outside a log context', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);

    svc.logInfo(makeData());

    const record = (pino.info as jest.Mock).mock.calls[0][0] as ServerLogRecord;
    expect(record).not.toHaveProperty('clientName');
    expect(record).not.toHaveProperty('clientInstanceId');
    expect(record).not.toHaveProperty('projectId');
  });

  it('adds clientName, clientInstanceId and projectId from the active log context', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);

    logContext.run(
      {
        clientName: 'audioreach-creator-ui',
        clientInstanceId: CLIENT_ID,
        projectId: 'route-project',
      },
      () => {
        svc.logWarn(makeData());
      },
    );
    svc.logWarn(makeData());

    const calls = (pino.warn as jest.Mock).mock.calls as [ServerLogRecord][];
    expect(calls[0][0]).toEqual(
      expect.objectContaining({
        clientName: 'audioreach-creator-ui',
        clientInstanceId: CLIENT_ID,
        projectId: 'route-project',
      }),
    );
    expect(calls[1][0]).not.toHaveProperty('clientInstanceId');
  });

  it('keeps a projectId the caller passes over the context projectId', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never, producer, logContext);

    logContext.run({projectId: 'route-project'}, () => {
      svc.logError({...makeData(), projectId: 'explicit-project'});
    });

    const record = (pino.error as jest.Mock).mock
      .calls[0][0] as ServerLogRecord;
    expect(record.projectId).toBe('explicit-project');
  });
});
