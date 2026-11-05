/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {validate} from 'class-validator';
import {plainToInstance} from 'class-transformer';
import {LogController} from '../../../../../../src/presentation/rest/modules/logging/logging.controller.js';
import {
  CreateLogEntryRequestDto,
  LOG_IDENTIFIER_MAX_LENGTH,
} from '../../../../../../src/presentation/rest/modules/logging/dto/create-log-entry-request.dto.js';
import {
  ClientInstancesRequestDto,
  ProjectLogsRequestDto,
} from '../../../../../../src/presentation/rest/modules/logging/dto/log-search-request.dto.js';
import {CLIENT_NAME_MAX_LENGTH} from '../../../../../../src/presentation/rest/modules/authentication/dto/authentication.dto.js';
import {BadRequestException} from '@nestjs/common';
import {LogLevel} from '@arc/core';
import {
  InvalidLogCursorError,
  LOG_SEARCH_DEFAULT_LIMIT,
  LOG_SEARCH_MAX_LIMIT,
  LogOrigin,
  LogSortOrder,
} from '@arc/logger';
import type {
  ClientInstanceReadModel,
  LogEntryReadModel,
  LogQueryService,
  ClientLogWriter,
} from '@arc/logger';

const UI = 'audioreach-creator-ui';
const UI_LAUNCH = '6AA7BF9E-2D6F-4DF7-B87B-9812A493BC52';
const SERVER_RUN = '11111111-1111-4111-8111-111111111111';

const makeCreatePlain = (overrides: Record<string, unknown> = {}) => ({
  level: LogLevel.Info,
  eventName: 'project.open.succeeded',
  description: 'Opened project Demo',
  timestamp: '2026-01-01T00:00:00.000Z',
  component: 'ProjectView',
  tag: 'project',
  ...overrides,
});

const readModel = (
  overrides: Partial<LogEntryReadModel> = {},
): LogEntryReadModel => ({
  systemId: 7,
  level: LogLevel.Warn,
  timestamp: '2026-01-01T00:00:00.000Z',
  eventName: 'project.open.slow',
  description: 'Opening project Demo took 4 s',
  component: 'ProjectView',
  tag: 'project',
  origin: LogOrigin.Server,
  clientName: UI,
  clientInstanceId: UI_LAUNCH.toLowerCase(),
  serverInstanceId: SERVER_RUN,
  projectId: 'proj-42',
  ...overrides,
});

const instance: ClientInstanceReadModel = {
  clientName: UI,
  clientInstanceId: UI_LAUNCH.toLowerCase(),
  projectIds: ['proj-1', 'proj-2'],
  firstTimestamp: '2026-01-01T00:00:00.000Z',
  lastTimestamp: '2026-01-01T00:05:00.000Z',
  recordCount: 12,
  errorCount: 1,
};

const setup = () => {
  const write = jest.fn<ClientLogWriter['write']>();
  const searchProjectLogs = jest.fn<LogQueryService['searchProjectLogs']>();
  const listClientInstances = jest.fn<LogQueryService['listClientInstances']>();
  const controller = new LogController(
    {write},
    {searchProjectLogs, listClientInstances},
  );
  return {controller, write, searchProjectLogs, listClientInstances};
};

const errorsFor = async <T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<string[]> =>
  (await validate(plainToInstance(cls, plain))).map(e => e.property);

describe('LogController', () => {
  describe('POST /arc-api/v1/logs', () => {
    it('writes the record under the token client name and the header launch', () => {
      const {controller, write} = setup();

      controller.log(
        plainToInstance(
          CreateLogEntryRequestDto,
          makeCreatePlain({projectId: 'proj-42', error: 'boom'}),
        ),
        UI,
        UI_LAUNCH.toLowerCase(),
      );

      expect(write).toHaveBeenCalledWith({
        level: LogLevel.Info,
        eventName: 'project.open.succeeded',
        description: 'Opened project Demo',
        component: 'ProjectView',
        tag: 'project',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        projectId: 'proj-42',
        error: 'boom',
        clientName: UI,
        clientInstanceId: UI_LAUNCH.toLowerCase(),
      });
    });
  });

  describe('GET /arc-api/v1/projects/:projectId/logs', () => {
    it('applies the default page size and newest-first order', async () => {
      const {controller, searchProjectLogs} = setup();
      searchProjectLogs.mockResolvedValue({items: []});

      await controller.getProjectLogs('proj-42', new ProjectLogsRequestDto());

      expect(searchProjectLogs).toHaveBeenCalledWith({
        projectId: 'proj-42',
        clientName: undefined,
        clientInstanceId: undefined,
        origin: undefined,
        minLevel: undefined,
        limit: LOG_SEARCH_DEFAULT_LIMIT,
        order: LogSortOrder.Desc,
        cursor: undefined,
      });
    });

    it('passes the filters and paging parameters', async () => {
      const {controller, searchProjectLogs} = setup();
      searchProjectLogs.mockResolvedValue({items: []});

      await controller.getProjectLogs(
        'proj-42',
        plainToInstance(ProjectLogsRequestDto, {
          clientName: UI,
          clientInstanceId: UI_LAUNCH,
          origin: 'CLIENT',
          minLevel: 'WARN',
          limit: '5',
          order: 'asc',
          cursor: 'abc',
        }),
      );

      expect(searchProjectLogs).toHaveBeenCalledWith({
        projectId: 'proj-42',
        clientName: UI,
        clientInstanceId: UI_LAUNCH.toLowerCase(),
        origin: LogOrigin.Client,
        minLevel: LogLevel.Warn,
        limit: 5,
        order: LogSortOrder.Asc,
        cursor: 'abc',
      });
    });

    it('maps the page to response DTOs with a string systemId', async () => {
      const {controller, searchProjectLogs} = setup();
      searchProjectLogs.mockResolvedValue({
        items: [
          readModel(),
          readModel({
            systemId: 8,
            origin: LogOrigin.Client,
            serverInstanceId: undefined,
          }),
        ],
        nextCursor: 'next',
      });

      const result = await controller.getProjectLogs(
        'proj-42',
        new ProjectLogsRequestDto(),
      );

      expect(result.data?.nextCursor).toBe('next');
      expect(result.data?.items).toHaveLength(2);
      expect({...result.data?.items[0]}).toEqual({
        ...readModel(),
        systemId: '7',
        error: undefined,
      });
      expect(result.data?.items[1]).toMatchObject({
        systemId: '8',
        origin: LogOrigin.Client,
        serverInstanceId: undefined,
      });
    });

    it('omits nextCursor on the last page', async () => {
      const {controller, searchProjectLogs} = setup();
      searchProjectLogs.mockResolvedValue({items: [readModel()]});

      const result = await controller.getProjectLogs(
        'proj-42',
        new ProjectLogsRequestDto(),
      );

      expect(result.data).not.toHaveProperty('nextCursor');
    });

    it('returns totalCount when the query service gives one', async () => {
      const {controller, searchProjectLogs} = setup();
      searchProjectLogs.mockResolvedValue({items: [], totalCount: 0});

      const result = await controller.getProjectLogs(
        'proj-42',
        new ProjectLogsRequestDto(),
      );

      expect(result.data?.totalCount).toBe(0);
    });

    it('omits totalCount when the query service gives none', async () => {
      const {controller, searchProjectLogs} = setup();
      searchProjectLogs.mockResolvedValue({items: [readModel()]});

      const result = await controller.getProjectLogs(
        'proj-42',
        new ProjectLogsRequestDto(),
      );

      expect(result.data).not.toHaveProperty('totalCount');
    });

    it('turns an invalid cursor into 400 ERR_1004', async () => {
      const {controller, searchProjectLogs} = setup();
      const failure = new InvalidLogCursorError('order mismatch');
      searchProjectLogs.mockRejectedValue(failure);

      const rejection = controller.getProjectLogs(
        'proj-42',
        new ProjectLogsRequestDto(),
      );

      await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejection).rejects.toMatchObject({
        message: 'Invalid log cursor: order mismatch',
        response: {errorCode: 'ERR_1004'},
        cause: failure,
      });
    });

    it('lets a database failure reach the exception filter unchanged', async () => {
      const {controller, searchProjectLogs} = setup();
      const failure = new Error('DB error');
      searchProjectLogs.mockRejectedValue(failure);

      await expect(
        controller.getProjectLogs('proj-42', new ProjectLogsRequestDto()),
      ).rejects.toBe(failure);
    });
  });

  describe('GET /arc-api/v1/client-instances', () => {
    it('applies the default page size', async () => {
      const {controller, listClientInstances} = setup();
      listClientInstances.mockResolvedValue({items: []});

      await controller.getClientInstances(new ClientInstancesRequestDto());

      expect(listClientInstances).toHaveBeenCalledWith({
        clientName: undefined,
        limit: LOG_SEARCH_DEFAULT_LIMIT,
        cursor: undefined,
      });
    });

    it('passes the filter and paging parameters', async () => {
      const {controller, listClientInstances} = setup();
      listClientInstances.mockResolvedValue({items: []});

      await controller.getClientInstances(
        plainToInstance(ClientInstancesRequestDto, {
          clientName: UI,
          limit: '3',
          cursor: 'abc',
        }),
      );

      expect(listClientInstances).toHaveBeenCalledWith({
        clientName: UI,
        limit: 3,
        cursor: 'abc',
      });
    });

    it('maps the page to response DTOs', async () => {
      const {controller, listClientInstances} = setup();
      listClientInstances.mockResolvedValue({
        items: [instance],
        nextCursor: 'next',
      });

      const result = await controller.getClientInstances(
        new ClientInstancesRequestDto(),
      );

      expect(result.data?.nextCursor).toBe('next');
      expect({...result.data?.items[0]}).toEqual(instance);
    });

    it('turns an invalid cursor into 400 ERR_1004', async () => {
      const {controller, listClientInstances} = setup();
      listClientInstances.mockRejectedValue(
        new InvalidLogCursorError('filter mismatch'),
      );

      await expect(
        controller.getClientInstances(new ClientInstancesRequestDto()),
      ).rejects.toMatchObject({
        status: 400,
        response: {errorCode: 'ERR_1004'},
      });
    });

    it('omits nextCursor on the last page', async () => {
      const {controller, listClientInstances} = setup();
      listClientInstances.mockResolvedValue({items: [instance]});

      const result = await controller.getClientInstances(
        new ClientInstancesRequestDto(),
      );

      expect(result.data).not.toHaveProperty('nextCursor');
    });

    it('returns totalCount when the query service gives one, else omits it', async () => {
      const {controller, listClientInstances} = setup();
      listClientInstances.mockResolvedValueOnce({
        items: [instance],
        totalCount: 3,
      });
      listClientInstances.mockResolvedValueOnce({items: [instance]});

      const first = await controller.getClientInstances(
        new ClientInstancesRequestDto(),
      );
      const later = await controller.getClientInstances(
        new ClientInstancesRequestDto(),
      );

      expect(first.data?.totalCount).toBe(3);
      expect(later.data).not.toHaveProperty('totalCount');
    });
  });

  describe('CreateLogEntryRequestDto validation', () => {
    it('accepts a valid record', async () => {
      expect(
        await errorsFor(CreateLogEntryRequestDto, makeCreatePlain()),
      ).toEqual([]);
    });

    it.each(['eventName', 'component', 'tag'])(
      'limits %s to the identifier length',
      async field => {
        const atLimit = 'a'.repeat(LOG_IDENTIFIER_MAX_LENGTH);
        expect(
          await errorsFor(
            CreateLogEntryRequestDto,
            makeCreatePlain({[field]: atLimit}),
          ),
        ).toEqual([]);
        expect(
          await errorsFor(
            CreateLogEntryRequestDto,
            makeCreatePlain({[field]: `${atLimit}a`}),
          ),
        ).toEqual([field]);
      },
    );

    it('does not limit description or error per field', async () => {
      const long = 'a'.repeat(10_000);
      expect(
        await errorsFor(
          CreateLogEntryRequestDto,
          makeCreatePlain({description: long, error: long}),
        ),
      ).toEqual([]);
    });

    it.each(['eventName', 'component'])('requires %s', async field => {
      expect(
        await errorsFor(
          CreateLogEntryRequestDto,
          makeCreatePlain({[field]: undefined}),
        ),
      ).toEqual([field]);
    });

    it.each([
      ['a non-date string', 'not-a-date'],
      ['an empty string', ''],
    ])('rejects %s as timestamp', async (_label, timestamp) => {
      expect(
        await errorsFor(CreateLogEntryRequestDto, makeCreatePlain({timestamp})),
      ).toEqual(['timestamp']);
    });

    it.each([
      'msg',
      'serviceName',
      'serviceInstanceId',
      'clientName',
      'clientInstanceId',
    ])(
      'rejects the %s field under the global whitelist settings',
      async field => {
        const errors = await validate(
          plainToInstance(
            CreateLogEntryRequestDto,
            makeCreatePlain({[field]: 'x'}),
          ),
          {whitelist: true, forbidNonWhitelisted: true},
        );
        expect(errors.map(e => e.property)).toEqual([field]);
      },
    );
  });

  describe('log search request validation', () => {
    it.each([
      ['0', ['limit']],
      ['1', []],
      [String(LOG_SEARCH_MAX_LIMIT), []],
      [String(LOG_SEARCH_MAX_LIMIT + 1), ['limit']],
      ['ten', ['limit']],
    ])('limit=%s gives errors %j', async (limit, expected) => {
      expect(await errorsFor(ProjectLogsRequestDto, {limit})).toEqual(expected);
      expect(await errorsFor(ClientInstancesRequestDto, {limit})).toEqual(
        expected,
      );
    });

    it('rejects an unknown order', async () => {
      expect(await errorsFor(ProjectLogsRequestDto, {order: 'up'})).toEqual([
        'order',
      ]);
    });

    it('rejects an unknown origin', async () => {
      expect(await errorsFor(ProjectLogsRequestDto, {origin: 'ui'})).toEqual([
        'origin',
      ]);
    });

    it('rejects an unknown minLevel', async () => {
      expect(
        await errorsFor(ProjectLogsRequestDto, {minLevel: 'warning'}),
      ).toEqual(['minLevel']);
    });

    it.each([
      ['origin', 'client'],
      ['minLevel', 'warn'],
    ])('rejects lowercase %s=%s', async (field, value) => {
      expect(await errorsFor(ProjectLogsRequestDto, {[field]: value})).toEqual([
        field,
      ]);
    });

    it('rejects a non-UUID clientInstanceId', async () => {
      expect(
        await errorsFor(ProjectLogsRequestDto, {clientInstanceId: 'x'}),
      ).toEqual(['clientInstanceId']);
    });

    it.each([ProjectLogsRequestDto, ClientInstancesRequestDto])(
      '%p limits clientName to the registration limit',
      async cls => {
        const atLimit = 'a'.repeat(CLIENT_NAME_MAX_LENGTH);
        expect(await errorsFor(cls, {clientName: atLimit})).toEqual([]);
        expect(await errorsFor(cls, {clientName: `${atLimit}a`})).toEqual([
          'clientName',
        ]);
        expect(await errorsFor(cls, {clientName: ''})).toEqual(['clientName']);
      },
    );

    it('does not accept order on client-instances', async () => {
      const errors = await validate(
        plainToInstance(ClientInstancesRequestDto, {order: 'asc'}),
        {whitelist: true, forbidNonWhitelisted: true},
      );
      expect(errors.map(e => e.property)).toEqual(['order']);
    });
  });
});
