/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {MigrationInterface, QueryRunner} from 'typeorm';

export class CreateLogEntries1755100000000 implements MigrationInterface {
  name = 'CreateLogEntries1755100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "log_entries" (
        "id"          INTEGER PRIMARY KEY AUTOINCREMENT,
        "level"       TEXT NOT NULL,
        "timestamp"   DATETIME NOT NULL,
        "source"      TEXT NOT NULL,
        "project_id"  TEXT,
        "component"   TEXT NOT NULL,
        "tag"         TEXT NOT NULL,
        "msg"         TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "error"       TEXT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_log_entries_source_project_timestamp" ON "log_entries" ("source", "project_id", "timestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_log_entries_source_project_timestamp"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "log_entries"`);
  }
}
