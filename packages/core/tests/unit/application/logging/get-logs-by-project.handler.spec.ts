/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetLogsByProjectHandler} from '../../../../src/application/logging/get-logs/get-logs-by-project.handler.js';
import {GetLogsByProjectQuery} from '../../../../src/application/logging/get-logs/get-logs-by-project.query.js';
import type {QueryServices} from '../../../../src/application/ports/persistence/query-services/query-services.js';
import type {LogEntryReadModel} from '../../../../src/application/ports/persistence/query-services/logging/log-entry-read-model.js';

describe('GetLogsByProjectHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      logQueryService: {
        getLogsByProject: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('delegates to logQueryService with projectId and clientId from query', async () => {
    const queryServices = buildQueryServices();
    const entries: LogEntryReadModel[] = [
      {
        id: 1,
        level: 'info',
        description: 'test description',
        timestamp: '2026-01-01T00:00:00.000Z',
        msg: 'test-msg',
        component: 'TestComponent',
        tag: 'test-tag',
        source: 'client-id',
        projectId: 'proj-42',
      },
    ];
    (
      queryServices.logQueryService.getLogsByProject as jest.Mock
    ).mockResolvedValue(entries);

    const handler = new GetLogsByProjectHandler(queryServices);
    const query = new GetLogsByProjectQuery('proj-42', 'client-id');

    const result = await handler.handle(query);

    expect(queryServices.logQueryService.getLogsByProject).toHaveBeenCalledWith(
      'proj-42',
      'client-id',
    );
    expect(result).toBe(entries);
  });

  it('returns empty array when no log entries match', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.logQueryService.getLogsByProject as jest.Mock
    ).mockResolvedValue([]);

    const handler = new GetLogsByProjectHandler(queryServices);
    const query = new GetLogsByProjectQuery('proj-99', 'client-id');

    const result = await handler.handle(query);

    expect(result).toEqual([]);
  });

  it('propagates rejection from logQueryService', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.logQueryService.getLogsByProject as jest.Mock
    ).mockRejectedValue(new Error('DB error'));

    const handler = new GetLogsByProjectHandler(queryServices);
    const query = new GetLogsByProjectQuery('proj-42', 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('DB error');
  });
});
