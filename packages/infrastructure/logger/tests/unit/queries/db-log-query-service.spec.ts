/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource} from 'typeorm';
import {LogEntrySchema} from '../../../src/entity-schema/log-entry.schema.js';
import {DbLogQueryService} from '../../../src/queries/db-log-query-service.js';

describe('DbLogQueryService', () => {
  let dataSource: DataSource;
  let service: DbLogQueryService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [LogEntrySchema],
      synchronize: true,
    });
    await dataSource.initialize();
    service = new DbLogQueryService(dataSource);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('returns entries matching clientId and projectId', async () => {
    await dataSource.query(
      `INSERT INTO log_entries (level, timestamp, source, project_id, component, tag, msg, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'info',
        '2026-08-15T10:00:00.000Z',
        'client-1',
        'proj-1',
        'TestComp',
        'test',
        'test-msg',
        'test-desc',
      ],
    );
    await dataSource.query(
      `INSERT INTO log_entries (level, timestamp, source, project_id, component, tag, msg, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'info',
        '2026-08-15T09:00:00.000Z',
        'client-2',
        'proj-1',
        'OtherComp',
        'test',
        'other-msg',
        'other-desc',
      ],
    );

    const result = await service.getLogsByProject('proj-1', 'client-1');

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('client-1');
    expect(result[0].msg).toBe('test-msg');
  });

  it('includes entries with null projectId for the matching clientId', async () => {
    await dataSource.query(
      `INSERT INTO log_entries (level, timestamp, source, project_id, component, tag, msg, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'info',
        '2026-08-15T10:00:00.000Z',
        'client-1',
        null,
        'TestComp',
        'test',
        'server-msg',
        'server-desc',
      ],
    );

    const result = await service.getLogsByProject('proj-1', 'client-1');

    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe('server-msg');
  });

  it('returns empty array when no entries match', async () => {
    const result = await service.getLogsByProject('proj-99', 'client-99');
    expect(result).toHaveLength(0);
  });
});
