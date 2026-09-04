/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {validate} from 'class-validator';
import {plainToInstance} from 'class-transformer';
import {LogController} from '../../../../../../src/presentation/rest/modules/logging/logging.controller.js';
import {CreateLogEntryRequestDto} from '../../../../../../src/presentation/rest/modules/logging/dto/create-log-entry-request.dto.js';
import {LogLevel} from '@arc/core';
import type {Logger1, LogEntryReadModel} from '@arc/core';

const makeLogger = (): jest.Mocked<Logger1> => ({
  logVerbose: jest.fn(),
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
  logCritical: jest.fn(),
});

const makeQueryBus = () => ({
  execute: jest.fn(),
});

const makeDto = (
  overrides: Partial<CreateLogEntryRequestDto> = {},
): CreateLogEntryRequestDto => ({
  level: LogLevel.Info,
  description: 'test description',
  timestamp: '2026-01-01T00:00:00.000Z',
  msg: 'test-msg',
  component: 'TestComponent',
  tag: 'test-tag',
  ...overrides,
});

describe('LogController', () => {
  describe('log() — POST /arc-api/v1/logs', () => {
    it('calls logInfo for level Info', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);

      controller.log(makeDto({level: LogLevel.Info}), 'client-id');

      expect(logger.logInfo).toHaveBeenCalledTimes(1);
      expect(logger.logInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'test-msg',
          description: 'test description',
          component: 'TestComponent',
          tag: 'test-tag',
          source: 'client-id',
        }),
      );
    });

    it('calls logVerbose for level Verbose', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(makeDto({level: LogLevel.Verbose}), '');
      expect(logger.logVerbose).toHaveBeenCalledTimes(1);
    });

    it('calls logDebug for level Debug', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(makeDto({level: LogLevel.Debug}), '');
      expect(logger.logDebug).toHaveBeenCalledTimes(1);
    });

    it('calls logWarn for level Warn', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(makeDto({level: LogLevel.Warn}), '');
      expect(logger.logWarn).toHaveBeenCalledTimes(1);
    });

    it('calls logError for level Error', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(makeDto({level: LogLevel.Error}), '');
      expect(logger.logError).toHaveBeenCalledTimes(1);
    });

    it('calls logCritical for level Critical', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(makeDto({level: LogLevel.Critical}), '');
      expect(logger.logCritical).toHaveBeenCalledTimes(1);
    });

    it('passes dto.error string through verbatim', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(
        makeDto({level: LogLevel.Error, error: 'something went wrong'}),
        '',
      );
      const call = (logger.logError as jest.Mock).mock.calls[0][0] as any;
      expect(call.error).toBe('something went wrong');
    });

    it('leaves error undefined when dto.error is absent', () => {
      const logger = makeLogger();
      const controller = new LogController(logger, makeQueryBus() as any);
      controller.log(makeDto({level: LogLevel.Info}), '');
      const call = (logger.logInfo as jest.Mock).mock.calls[0][0] as any;
      expect(call.error).toBeUndefined();
    });
  });

  describe('getLogs() — GET /arc-api/v1/projects/:projectId/logs', () => {
    it('executes GetLogsByProjectQuery and returns mapped DTOs', async () => {
      const logger = makeLogger();
      const queryBus = makeQueryBus();
      const entries: LogEntryReadModel[] = [
        {
          id: 1,
          level: 'info',
          description: 'desc',
          timestamp: '2026-01-01T00:00:00.000Z',
          msg: 'test-msg',
          component: 'Comp',
          tag: 'tag',
          source: 'client-id',
          projectId: 'proj-42',
        },
      ];
      (queryBus.execute as jest.Mock).mockResolvedValue(entries);

      const controller = new LogController(logger, queryBus as any);
      const result = await controller.getLogs('proj-42', 'client-id');

      expect(queryBus.execute).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]).toMatchObject({
        id: 1,
        level: 'info',
        description: 'desc',
        msg: 'test-msg',
        source: 'client-id',
        projectId: 'proj-42',
      });
    });

    it('returns empty data array when no entries match', async () => {
      const queryBus = makeQueryBus();
      (queryBus.execute as jest.Mock).mockResolvedValue([]);

      const controller = new LogController(makeLogger(), queryBus as any);
      const result = await controller.getLogs('proj-99', 'client-id');

      expect(result.data).toEqual([]);
    });
  });

  describe('CreateLogEntryRequestDto — timestamp validation', () => {
    const makeValidPlain = () => ({
      level: LogLevel.Info,
      description: 'desc',
      timestamp: '2026-01-01T00:00:00.000Z',
      msg: 'msg',
      component: 'Comp',
      tag: 'tag',
    });

    it('accepts a valid ISO-8601 timestamp', async () => {
      const dto = plainToInstance(CreateLogEntryRequestDto, makeValidPlain());
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'timestamp')).toBeUndefined();
    });

    it('rejects a non-date string', async () => {
      const dto = plainToInstance(CreateLogEntryRequestDto, {
        ...makeValidPlain(),
        timestamp: 'not-a-date',
      });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'timestamp')).toBeDefined();
    });

    it('rejects an empty timestamp', async () => {
      const dto = plainToInstance(CreateLogEntryRequestDto, {
        ...makeValidPlain(),
        timestamp: '',
      });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'timestamp')).toBeDefined();
    });
  });
});
