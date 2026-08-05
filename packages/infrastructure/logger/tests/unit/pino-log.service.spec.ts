/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {PinoLogService} from '../../src/pino-log.service.js';
import type {LogData1} from '@arc/core';

const makeData = (): LogData1 => ({
  msg: 'test-msg',
  description: 'test description',
  timestamp: new Date('2026-01-01T00:00:00Z'),
  component: 'TestComponent',
  tag: 'test-tag',
  source: 'client-id',
});

describe('PinoLogService', () => {
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
    const svc = new PinoLogService(pino as never);
    const data = makeData();
    svc.logVerbose(data);
    expect(pino.trace).toHaveBeenCalledWith(data);
  });

  it('logDebug delegates to pinoLogger.debug', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never);
    const data = makeData();
    svc.logDebug(data);
    expect(pino.debug).toHaveBeenCalledWith(data);
  });

  it('logInfo delegates to pinoLogger.info', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never);
    const data = makeData();
    svc.logInfo(data);
    expect(pino.info).toHaveBeenCalledWith(data);
  });

  it('logWarn delegates to pinoLogger.warn', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never);
    const data = makeData();
    svc.logWarn(data);
    expect(pino.warn).toHaveBeenCalledWith(data);
  });

  it('logError delegates to pinoLogger.error', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never);
    const data = makeData();
    svc.logError(data);
    expect(pino.error).toHaveBeenCalledWith(data);
  });

  it('logCritical delegates to pinoLogger.fatal', () => {
    const pino = makePinoLogger();
    const svc = new PinoLogService(pino as never);
    const data = makeData();
    svc.logCritical(data);
    expect(pino.fatal).toHaveBeenCalledWith(data);
  });
});
