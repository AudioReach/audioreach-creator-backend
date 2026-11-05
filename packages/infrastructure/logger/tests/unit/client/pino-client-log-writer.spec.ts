/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {LogLevel} from '@arc/core';
import {PinoClientLogWriter} from '../../../src/client/pino-client-log-writer.js';
import type {ClientLogRecord} from '../../../src/client/client-log-writer.js';

const makePinoLogger = () => ({
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
});

const record = (level: LogLevel): ClientLogRecord => ({
  level,
  eventName: 'project.open.succeeded',
  description: 'Opened project Demo',
  component: 'ProjectView',
  tag: 'project',
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
  clientName: 'audioreach-creator-ui',
  clientInstanceId: '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52',
});

describe('PinoClientLogWriter', () => {
  it.each([
    [LogLevel.Verbose, 'trace'],
    [LogLevel.Debug, 'debug'],
    [LogLevel.Info, 'info'],
    [LogLevel.Warn, 'warn'],
    [LogLevel.Error, 'error'],
    [LogLevel.Critical, 'fatal'],
  ] as const)('writes %s through pino.%s', (level, method) => {
    const pino = makePinoLogger();
    new PinoClientLogWriter(pino as never).write(record(level));
    expect(pino[method]).toHaveBeenCalledTimes(1);
  });

  it('writes the fields, with the client as producer, without the level key', () => {
    const pino = makePinoLogger();
    new PinoClientLogWriter(pino as never).write(record(LogLevel.Info));

    const {level: _level, ...fields} = record(LogLevel.Info);
    expect(pino.info).toHaveBeenCalledWith({
      ...fields,
      serviceName: 'audioreach-creator-ui',
      serviceInstanceId: '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52',
    });
  });
});
