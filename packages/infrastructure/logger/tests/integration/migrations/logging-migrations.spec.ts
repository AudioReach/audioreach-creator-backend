/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource} from 'typeorm';
import {getLoggingOrmBase} from '../../../src/index.js';

const newDataSource = (): DataSource =>
  new DataSource({
    type: 'sqlite',
    database: ':memory:',
    ...getLoggingOrmBase(),
  });

interface ColumnInfo {
  name: string;
  notnull: number;
}

describe('logging migrations', () => {
  let dataSource: DataSource;

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('creates a table that matches LogEntrySchema exactly', async () => {
    dataSource = newDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations();

    const pending = await dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map(q => q.query)).toEqual([]);
  });

  it('creates the new columns and no source or msg column', async () => {
    dataSource = newDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations();

    const columns = (await dataSource.query(
      `PRAGMA table_info("log_entries")`,
    )) as ColumnInfo[];
    const byName = new Map(columns.map(c => [c.name, c]));

    expect(byName.get('event_name')?.notnull).toBe(1);
    expect(byName.get('service_name')?.notnull).toBe(1);
    expect(byName.get('service_instance_id')?.notnull).toBe(1);
    expect(byName.get('client_name')?.notnull).toBe(0);
    expect(byName.get('client_instance_id')?.notnull).toBe(0);
    expect(byName.has('source')).toBe(false);
    expect(byName.has('msg')).toBe(false);
  });

  it('creates the two lookup indexes', async () => {
    dataSource = newDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations();

    const indexes = (await dataSource.query(
      `PRAGMA index_list("log_entries")`,
    )) as {name: string}[];
    expect(indexes.map(i => i.name).sort()).toEqual([
      'idx_log_entries_client_instance_project',
      'idx_log_entries_project_timestamp',
    ]);
  });

  it('rebuilds a table left by the previous logging migration', async () => {
    dataSource = newDataSource();
    await dataSource.initialize();
    // The shape CreateLogEntries1755100000000 created.
    await dataSource.query(`
      CREATE TABLE "log_entries" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT, "level" TEXT NOT NULL,
        "timestamp" DATETIME NOT NULL, "source" TEXT NOT NULL,
        "project_id" TEXT, "component" TEXT NOT NULL, "tag" TEXT NOT NULL,
        "msg" TEXT NOT NULL, "description" TEXT NOT NULL, "error" TEXT)`);
    await dataSource.query(
      `INSERT INTO "log_entries" (level, timestamp, source, component, tag, msg, description)
       VALUES ('info', '2026-01-01 00:00:00.000', 'Server', 'c', 't', 'm', 'd')`,
    );

    await dataSource.runMigrations();

    const columns = (await dataSource.query(
      `PRAGMA table_info("log_entries")`,
    )) as ColumnInfo[];
    expect(columns.map(c => c.name)).toContain('service_name');
    expect(columns.map(c => c.name)).not.toContain('source');
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS n FROM "log_entries"`,
    )) as {n: number}[];
    expect(rows[0].n).toBe(0);
  });
});
