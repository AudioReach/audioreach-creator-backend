/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {DataSource as TypeOrmDataSource} from 'typeorm';
import {DbLogQueryService, LogEntrySchema} from '../../../src/index.js';

const INSERT_LOG = `
  INSERT INTO log_entries (level, timestamp, source, project_id, component, tag, msg, description, error)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

async function insertLog(
  dataSource: DataSource,
  overrides: {
    source?: string;
    projectId?: string | null;
    level?: string;
    msg?: string;
  } = {},
): Promise<void> {
  await dataSource.query(INSERT_LOG, [
    overrides.level ?? 'info',
    '2026-01-01T00:00:00.000Z',
    overrides.source ?? 'client-id',
    overrides.projectId !== undefined ? overrides.projectId : 'proj-42',
    'TestComponent',
    'test-tag',
    overrides.msg ?? 'test-msg',
    'test description',
    null,
  ]);
}

describe('DbLogQueryService', () => {
  let dataSource: DataSource;
  let service: DbLogQueryService;

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
    service = new DbLogQueryService(dataSource);
  });

  it('returns empty array when no entries exist', async () => {
    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result).toEqual([]);
  });

  it('returns entries matching source and projectId', async () => {
    await insertLog(dataSource, {source: 'client-id', projectId: 'proj-42'});

    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('client-id');
    expect(result[0].projectId).toBe('proj-42');
  });

  it('includes entries where projectId is NULL (server-generated logs)', async () => {
    await insertLog(dataSource, {source: 'client-id', projectId: null});

    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBeUndefined();
  });

  it('excludes entries from a different source', async () => {
    await insertLog(dataSource, {source: 'other-client', projectId: 'proj-42'});

    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result).toEqual([]);
  });

  it('excludes entries from a different projectId', async () => {
    await insertLog(dataSource, {source: 'client-id', projectId: 'proj-99'});

    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result).toEqual([]);
  });

  it('returns entries ordered by timestamp DESC', async () => {
    await dataSource.query(INSERT_LOG, [
      'info',
      '2026-01-01T10:00:00.000Z',
      'client-id',
      'proj-42',
      'Comp',
      'tag',
      'first',
      'desc',
      null,
    ]);
    await dataSource.query(INSERT_LOG, [
      'info',
      '2026-01-01T12:00:00.000Z',
      'client-id',
      'proj-42',
      'Comp',
      'tag',
      'second',
      'desc',
      null,
    ]);

    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result).toHaveLength(2);
    expect(result[0].msg).toBe('second');
    expect(result[1].msg).toBe('first');
  });

  it('returns all fields correctly mapped', async () => {
    await insertLog(dataSource, {
      source: 'client-id',
      projectId: 'proj-42',
      level: 'warn',
      msg: 'something-happened',
    });

    const result = await service.getLogsByProject('proj-42', 'client-id');
    expect(result[0]).toMatchObject({
      level: 'warn',
      msg: 'something-happened',
      component: 'TestComponent',
      tag: 'test-tag',
      description: 'test description',
      source: 'client-id',
      projectId: 'proj-42',
    });
  });
});
