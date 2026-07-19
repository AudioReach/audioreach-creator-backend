/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import type {ChangeOperation, ChangeStatus, Source} from '@arc/core';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import {SessionEntityVersionSchema} from '../entity-schema/edit-session/session-entity-version.schema.js';
import {EditActionSchema} from '../entity-schema/edit-session/edit-action.schema.js';
import type {QueryRunner} from 'typeorm';

/**
 * Plain-object shape for a single row to insert into `edit_actions`.
 * Matches the LLD1 schema columns minus auto-generated `changeId` and `createdAt`.
 */
export type PendingChangeInsert = {
  sessionId: number;
  aggregateId: number;
  targetSystemId: number;
  targetTable: EntityName;
  operation: ChangeOperation;
  fieldPath: string | null;
  newValue: Record<string, unknown>;
  source: Source;
  changeStatus: ChangeStatus;
  groupId: string | null;
  linkedEntityGroupId: string | null;
};

type VersionRow = {systemId: number; version: number};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const CHUNK_SIZE = 500;

/**
 * UoW-scoped in-memory buffer for bulk edit-action writes (spec §10).
 *
 * Persistence-internal only — core interacts with it only through
 * `uow.applyCachedActions()` which calls `flush()`.
 *
 * Lifecycle: one instance per UnitOfWork (per request).
 */
export class PendingChangeCache {
  private readonly rows: PendingChangeInsert[] = [];

  enqueueRow(row: PendingChangeInsert): void {
    this.rows.push(row);
  }

  size(): number {
    return this.rows.length;
  }

  isEmpty(): boolean {
    return this.rows.length === 0;
  }

  /**
   * Flush algorithm (spec §10.2).
   *
   * Step 1 — baseVersion capture:
   *   Collect (targetTable, targetSystemId) from every non-CREATE row.
   *   Group by targetTable, SELECT current version, INSERT OR IGNORE in 500-row chunks.
   *   sessionId is derived from the first enqueued row (all rows share the same session).
   *
   * Step 2 — edit_actions INSERT batch in 500-row chunks.
   *
   * Step 3 — clear buffer.
   */
  async flush(queryRunner: QueryRunner): Promise<void> {
    if (this.rows.length === 0) return;

    // All rows share the same sessionId — derive it from the first row.
    const sessionId = this.rows[0].sessionId;
    const mgr = queryRunner.manager;

    // ── Step 1: baseVersion capture for UPDATE / DELETE rows ──────────────────
    const captureTargets = this.rows.filter(
      r => r.operation !== CHANGE_OPERATION.Create,
    );

    if (captureTargets.length > 0) {
      const byTable = new Map<EntityName, number[]>();
      for (const r of captureTargets) {
        const ids = byTable.get(r.targetTable) ?? [];
        ids.push(r.targetSystemId);
        byTable.set(r.targetTable, ids);
      }

      const versionResults = await Promise.all(
        [...byTable.entries()].map(async ([table, systemIds]) => {
          const rows = (await mgr
            .createQueryBuilder(table, 'e')
            .select(['e.systemId', 'e.version'])
            .where('e.systemId IN (:...ids)', {ids: systemIds})
            .getMany()) as VersionRow[];
          return rows.map(row => ({
            sessionId,
            targetSystemId: row.systemId,
            baseVersion: row.version,
          }));
        }),
      );
      const versionTuples = versionResults.flat();

      for (const ch of chunk(versionTuples, CHUNK_SIZE)) {
        await mgr
          .createQueryBuilder()
          .insert()
          .into(SessionEntityVersionSchema)
          .values(
            ch.map(t => ({
              sessionId: t.sessionId,
              targetSystemId: t.targetSystemId,
              baseVersion: t.baseVersion,
            })),
          )
          .orIgnore()
          .execute();
      }
    }

    // ── Step 2: pending row INSERT batch ──────────────────────────────────────
    for (const ch of chunk(this.rows, CHUNK_SIZE)) {
      await mgr
        .createQueryBuilder()
        .insert()
        .into(EditActionSchema)
        .values(ch)
        .execute();
    }

    // ── Step 3: clear buffer ──────────────────────────────────────────────────
    this.rows.length = 0;
  }
}
