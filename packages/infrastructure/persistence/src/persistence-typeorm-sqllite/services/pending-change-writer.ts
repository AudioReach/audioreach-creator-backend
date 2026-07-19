/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_STATUS, CHANGE_OPERATION, SOURCE} from '@arc/core';
import type {ChangeStatus, Source} from '@arc/core';
import type {QueryRunner} from 'typeorm';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {PendingChangeCache} from './pending-change-cache.js';

// ── Spec types ────────────────────────────────────────────────────────────────

export type WriteDeltaSpec = {
  targetTable: EntityName;
  targetSystemId: number;
  aggregateId: number;
  delta: Record<string, unknown>;
  /** null / omitted = accumulator mode; string = per-slot mode. */
  fieldGroup?: string;
  linkedEntityGroupId?: string;
  /** Enqueue to PendingChangeCache instead of immediate INSERT. Invalid when fieldGroup is null. */
  cache?: boolean;
  source?: Source;
  /** Honored only when source = DIFF_TOOL. */
  changeStatus?: ChangeStatus;
};

export type WriteCreateSpec = {
  targetTable: EntityName;
  targetSystemId: number;
  aggregateId: number;
  payload: Record<string, unknown>;
  linkedEntityGroupId?: string;
  cache?: boolean;
  source?: Source;
  /** Honored only when source = DIFF_TOOL (REQ-EA-05 revised).
   *  MANUAL CREATE is always STAGED; AUTO_ROUTING is always UNSTAGED. */
  changeStatus?: ChangeStatus;
};

export type WriteDeleteSpec = {
  targetTable: EntityName;
  targetSystemId: number;
  aggregateId: number;
  linkedEntityGroupId?: string;
  cache?: boolean;
  source?: Source;
};

// ── Writer ────────────────────────────────────────────────────────────────────

/**
 * Low-level persistence service that writes rows to `edit_actions` (spec §9).
 *
 * Called by aggregate edit repos (LLD2+). Write methods receive the already-resolved
 * `sessionId`, `groupId`, and `QueryRunner` from the caller — no UnitOfWork
 * dependency here, keeping this service free of core-layer coupling.
 *
 * Aggregate edit repos obtain sessionId/groupId via `uow.getWriteContext()` (core)
 * and the QueryRunner from `TypeOrmUnitOfWork.getQueryRunner()` (persistence adapter).
 */
export class PendingChangeWriter {
  constructor(
    private readonly queryService: EditActionsQueryService,
    private readonly pendingChangeCache: PendingChangeCache,
  ) {}

  async writeDelta(
    spec: WriteDeltaSpec,
    sessionId: number,
    groupId: string,
    qr: QueryRunner,
  ): Promise<void> {
    const fieldGroup = spec.fieldGroup ?? null;

    if (spec.cache === true && fieldGroup === null) {
      throw new Error(
        'cache=true is invalid for accumulator writes (fieldGroup=null). ' +
          'Accumulator mode requires read-modify-write and cannot defer.',
      );
    }

    const source = spec.source ?? SOURCE.Manual;
    const changeStatus = this.resolveChangeStatus(source, spec.changeStatus);

    if (fieldGroup === null) {
      await this.writeAccumulator(spec, sessionId, groupId, changeStatus, qr);
    } else {
      await this.writePerSlot(
        spec,
        fieldGroup,
        sessionId,
        groupId,
        changeStatus,
        qr,
      );
    }
  }

  async writeCreate(
    spec: WriteCreateSpec,
    sessionId: number,
    groupId: string,
    qr: QueryRunner,
  ): Promise<void> {
    const source = spec.source ?? SOURCE.Manual;
    const changeStatus = this.resolveChangeStatus(source, spec.changeStatus);

    const row = {
      sessionId,
      aggregateId: spec.aggregateId,
      targetSystemId: spec.targetSystemId,
      targetTable: spec.targetTable,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$' as string | null,
      newValue: spec.payload,
      source,
      changeStatus,
      groupId,
      linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
    };

    if (spec.cache === true) {
      this.pendingChangeCache.enqueueRow(row);
    } else {
      await this.insertRow(row, qr);
    }
  }

  async writeDelete(
    spec: WriteDeleteSpec,
    sessionId: number,
    groupId: string,
    qr: QueryRunner,
  ): Promise<void> {
    const source = spec.source ?? SOURCE.Manual;
    const changeStatus = this.resolveChangeStatus(source);

    await this.supersedeCurrent(sessionId, spec.targetSystemId, null, qr);

    const row = {
      sessionId,
      aggregateId: spec.aggregateId,
      targetSystemId: spec.targetSystemId,
      targetTable: spec.targetTable,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: null as string | null,
      newValue: {} as Record<string, unknown>,
      source,
      changeStatus,
      groupId,
      linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
    };

    if (spec.cache === true) {
      this.pendingChangeCache.enqueueRow(row);
      // baseVersion capture is derived from operation type in PendingChangeCache.flush()
    } else {
      await this.captureBaseVersion(
        sessionId,
        spec.targetTable,
        spec.targetSystemId,
        qr,
      );
      await this.insertRow(row, qr);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private resolveChangeStatus(
    source: Source,
    override?: ChangeStatus,
  ): ChangeStatus {
    if (source === SOURCE.Manual) {
      if (override !== undefined)
        throw new Error(
          'MANUAL source does not accept an explicit changeStatus. MANUAL writes are always STAGED.',
        );
      return CHANGE_STATUS.Staged;
    }
    if (source === SOURCE.AutoRouting) {
      if (override !== undefined)
        throw new Error(
          'AUTO_ROUTING source does not accept an explicit changeStatus. AUTO_ROUTING writes are always UNSTAGED.',
        );
      return CHANGE_STATUS.Unstaged;
    }
    return override ?? CHANGE_STATUS.Unstaged;
  }

  private async writeAccumulator(
    spec: WriteDeltaSpec,
    sessionId: number,
    groupId: string,
    changeStatus: ChangeStatus,
    qr: QueryRunner,
  ): Promise<void> {
    const existing = await this.queryService.findCurrentRow(
      sessionId,
      spec.targetSystemId,
      null,
    );

    const mergedPayload: Record<string, unknown> = existing
      ? {...(existing.newValue as Record<string, unknown>), ...spec.delta}
      : {...spec.delta};

    if (existing) {
      await this.supersedeCurrent(sessionId, spec.targetSystemId, null, qr);
    } else {
      await this.captureBaseVersion(
        sessionId,
        spec.targetTable,
        spec.targetSystemId,
        qr,
      );
    }

    await this.insertRow(
      {
        sessionId,
        aggregateId: spec.aggregateId,
        targetSystemId: spec.targetSystemId,
        targetTable: spec.targetTable,
        operation: CHANGE_OPERATION.Update,
        fieldPath: null,
        newValue: mergedPayload,
        source: spec.source ?? SOURCE.Manual,
        changeStatus,
        groupId,
        linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
      },
      qr,
    );
  }

  private async writePerSlot(
    spec: WriteDeltaSpec,
    fieldGroup: string,
    sessionId: number,
    groupId: string,
    changeStatus: ChangeStatus,
    qr: QueryRunner,
  ): Promise<void> {
    const row = {
      sessionId,
      aggregateId: spec.aggregateId,
      targetSystemId: spec.targetSystemId,
      targetTable: spec.targetTable,
      operation: CHANGE_OPERATION.Update,
      fieldPath: fieldGroup as string | null,
      newValue: spec.delta,
      source: spec.source ?? SOURCE.Manual,
      changeStatus,
      groupId,
      linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
    };

    await this.supersedeCurrent(sessionId, spec.targetSystemId, fieldGroup, qr);

    if (spec.cache === true) {
      this.pendingChangeCache.enqueueRow(row);
    } else {
      await this.insertRow(row, qr);
    }
  }

  private async supersedeCurrent(
    sessionId: number,
    targetSystemId: number,
    fieldPath: string | null,
    qr: QueryRunner,
  ): Promise<void> {
    const fieldPathClause =
      fieldPath === null ? 'field_path IS NULL' : 'field_path = $4';
    const params: unknown[] =
      fieldPath === null
        ? [new Date().toISOString(), sessionId, targetSystemId]
        : [new Date().toISOString(), sessionId, targetSystemId, fieldPath];
    // eslint-disable-next-line custom/no-raw-persistence-queries -- dynamic fieldPath clause (null vs value) cannot be expressed with TypeORM QueryBuilder
    await qr.query(
      `UPDATE edit_actions SET valid_until = $1 WHERE session_id = $2 AND target_system_id = $3 AND ${fieldPathClause} AND valid_until IS NULL`,
      params,
    );
  }

  private async captureBaseVersion(
    sessionId: number,
    targetTable: EntityName,
    targetSystemId: number,
    qr: QueryRunner,
  ): Promise<void> {
    // eslint-disable-next-line custom/no-raw-persistence-queries -- dynamic table name in SELECT prevents using manager.find; used only for base-version capture
    const versions = (await qr.query(
      `SELECT version FROM ${targetTable} WHERE system_id = $1`,
      [targetSystemId],
    )) as Array<{version: number}>;
    if (versions.length === 0) return;
    // eslint-disable-next-line custom/no-raw-persistence-queries -- INSERT OR IGNORE semantics (capture-once) are not supported by TypeORM QueryBuilder
    await qr.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES ($1, $2, $3)`,
      [sessionId, targetSystemId, versions[0].version],
    );
  }

  private async insertRow(
    row: {
      sessionId: number;
      aggregateId: number;
      targetSystemId: number;
      targetTable: EntityName;
      operation: string;
      fieldPath: string | null;
      newValue: Record<string, unknown>;
      source: string;
      changeStatus: string;
      groupId: string | null;
      linkedEntityGroupId: string | null;
    },
    qr: QueryRunner,
  ): Promise<void> {
    // eslint-disable-next-line custom/no-raw-persistence-queries -- manual JSON serialization of newValue requires raw INSERT; manager.insert() does not support column-level JSON.stringify
    await qr.query(
      `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, linked_entity_group_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        row.sessionId,
        row.aggregateId,
        row.targetSystemId,
        row.targetTable,
        row.operation,
        row.fieldPath,
        JSON.stringify(row.newValue),
        row.source,
        row.changeStatus,
        row.groupId,
        row.linkedEntityGroupId,
      ],
    );
  }
}
