/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * The single logging migration. It replaces `CreateLogEntries1755100000000`
 * and drops any table that migration created, so existing `logging.db` files
 * are rebuilt with the new columns; old log rows are not kept (design §11).
 */
export class CreateLogEntries1793682681675 implements MigrationInterface {
  name = 'CreateLogEntries1793682681675';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "log_entries"`);
    await queryRunner.query(`
      CREATE TABLE "log_entries" (
        "id"                  integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "level"               text NOT NULL,
        "timestamp"           datetime NOT NULL,
        "project_id"          text,
        "component"           text NOT NULL,
        "tag"                 text NOT NULL,
        "event_name"          text NOT NULL,
        "description"         text NOT NULL,
        "error"               text,
        "service_name"        text NOT NULL,
        "service_instance_id" text NOT NULL,
        "client_name"         text,
        "client_instance_id"  text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_log_entries_project_timestamp" ON "log_entries" ("project_id", "timestamp")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_log_entries_client_instance_project" ON "log_entries" ("client_instance_id", "project_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "log_entries"`);
  }
}
