/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_STATUS,
  CHANGE_OPERATION,
  SOURCE,
  DomainRuleViolationException,
  IssueFactory,
  compositeValueFieldPath,
} from '@arc/core';
import type {ChangeStatus, Logger, Source} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {PendingChangeCache} from './pending-change-cache.js';
import {serializeBlobs} from '../utils/blob-serialization.js';
import {isCompositeApplyTarget} from './apply-changes/apply-target-registry.js';

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
  /** Canonical composite slot when the target has a value relationship key. */
  fieldPath?: string | null;
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
  payload?: Record<string, unknown>;
  /** Canonical composite slot when the target has a value relationship key. */
  fieldPath?: string | null;
  linkedEntityGroupId?: string;
  cache?: boolean;
  source?: Source;
};

// ── Internal row type ─────────────────────────────────────────────────────────

type EditActionRow = {
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
    private readonly logger?: Logger,
  ) {}

  async writeDelta(
    spec: WriteDeltaSpec,
    sessionId: number,
    groupId: string,
    manager: EntityManager,
  ): Promise<number | null> {
    const fieldGroup = spec.fieldGroup ?? null;

    if (isCompositeApplyTarget(spec.targetTable)) {
      throw new DomainRuleViolationException([
        IssueFactory.invalidApplyOperation(
          spec.targetTable,
          spec.aggregateId,
          spec.targetSystemId,
          CHANGE_OPERATION.Update,
        ),
      ]);
    }

    if (spec.cache === true && fieldGroup === null) {
      throw new Error(
        'cache=true is invalid for accumulator writes (fieldGroup=null). ' +
          'Accumulator mode requires read-modify-write and cannot defer.',
      );
    }

    const source = spec.source ?? SOURCE.Manual;
    const changeStatus = this.resolveChangeStatus(source, spec.changeStatus);

    if (fieldGroup === null) {
      return this.writeAccumulator(
        spec,
        sessionId,
        groupId,
        changeStatus,
        manager,
      );
    } else {
      return this.writePerSlot(
        spec,
        fieldGroup,
        sessionId,
        groupId,
        changeStatus,
        manager,
      );
    }
  }

  async writeDeltaBatch(
    specs: WriteDeltaSpec[],
    sessionId: number,
    groupId: string,
    manager: EntityManager,
  ): Promise<void> {
    if (specs.length === 0) return;

    const rows: EditActionRow[] = [];

    for (const spec of specs) {
      // Per-slot writes are not yet implemented in batch mode — they require a
      // different path (no read-modify-write, just supersede + insert per slot).
      // Extend this method when per-slot batch support is needed.
      if (spec.fieldGroup !== undefined) {
        throw new Error(
          'writeDeltaBatch only supports accumulator mode (fieldGroup must be omitted)',
        );
      }
      // cache=true is invalid for accumulator mode: accumulator requires a
      // read-modify-write (fetch → merge → supersede) that cannot be deferred.
      // If per-slot support is added above, cache=true would be valid for that
      // path since per-slot writes have no merge step.
      if (spec.cache === true) {
        throw new Error('writeDeltaBatch does not support cache=true');
      }

      const source = spec.source ?? SOURCE.Manual;
      const changeStatus = this.resolveChangeStatus(source, spec.changeStatus);

      const existing = await this.queryService.findCurrentRow(
        sessionId,
        spec.targetSystemId,
        spec.targetTable,
        null,
      );

      const mergedPayload: Record<string, unknown> = existing
        ? {...(existing.newValue as Record<string, unknown>), ...spec.delta}
        : {...spec.delta};

      if (existing) {
        await this.supersedeCurrent(
          sessionId,
          spec.targetSystemId,
          spec.targetTable,
          null,
          manager,
        );
      } else {
        await this.captureBaseVersion(
          sessionId,
          spec.targetTable,
          spec.targetSystemId,
          manager,
        );
      }

      rows.push({
        sessionId,
        aggregateId: spec.aggregateId,
        targetSystemId: spec.targetSystemId,
        targetTable: spec.targetTable,
        operation: CHANGE_OPERATION.Update,
        fieldPath: null,
        newValue: mergedPayload,
        source,
        changeStatus,
        groupId,
        linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
      });
    }

    await this.insertRows(rows, manager);
  }

  async writeCreate(
    spec: WriteCreateSpec,
    sessionId: number,
    groupId: string,
    manager: EntityManager,
  ): Promise<number | null> {
    const source = spec.source ?? SOURCE.Manual;
    const changeStatus = this.resolveChangeStatus(source, spec.changeStatus);

    const row = {
      sessionId,
      aggregateId: spec.aggregateId,
      targetSystemId: spec.targetSystemId,
      targetTable: spec.targetTable,
      operation: CHANGE_OPERATION.Create,
      fieldPath: actionFieldPath(
        spec.targetTable,
        spec.payload,
        spec.fieldPath,
      ),
      newValue: spec.payload,
      source,
      changeStatus,
      groupId,
      linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
    };

    if (spec.cache === true) {
      this.pendingChangeCache.enqueueRow(row);
      return null;
    } else {
      return this.insertRow(row, manager);
    }
  }

  async writeDelete(
    spec: WriteDeleteSpec,
    sessionId: number,
    groupId: string,
    manager: EntityManager,
  ): Promise<number | null> {
    const source = spec.source ?? SOURCE.Manual;
    const changeStatus = this.resolveChangeStatus(source);

    const payload = spec.payload ?? {};
    const fieldPath = actionFieldPath(
      spec.targetTable,
      payload,
      spec.fieldPath,
    );

    await this.supersedeCurrent(
      sessionId,
      spec.targetSystemId,
      spec.targetTable,
      fieldPath,
      manager,
    );

    const row = {
      sessionId,
      aggregateId: spec.aggregateId,
      targetSystemId: spec.targetSystemId,
      targetTable: spec.targetTable,
      operation: CHANGE_OPERATION.Delete,
      fieldPath,
      newValue: payload,
      source,
      changeStatus,
      groupId,
      linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
    };

    if (spec.cache === true) {
      this.pendingChangeCache.enqueueRow(row);
      // baseVersion capture is derived from operation type in PendingChangeCache.flush()
      return null;
    } else {
      if (!isCompositeApplyTarget(spec.targetTable)) {
        await this.captureBaseVersion(
          sessionId,
          spec.targetTable,
          spec.targetSystemId,
          manager,
        );
      }
      return this.insertRow(row, manager);
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
    manager: EntityManager,
  ): Promise<number> {
    const existing = await this.queryService.findCurrentRow(
      sessionId,
      spec.targetSystemId,
      spec.targetTable,
      null,
    );

    this.logDebug(
      'checkedCurrentAction',
      spec,
      sessionId,
      null,
      existing !== null,
    );

    const mergedPayload: Record<string, unknown> = existing
      ? {...(existing.newValue as Record<string, unknown>), ...spec.delta}
      : {...spec.delta};

    if (existing) {
      await this.supersedeCurrent(
        sessionId,
        spec.targetSystemId,
        spec.targetTable,
        null,
        manager,
      );
      this.logDebug('supersededCurrentAction', spec, sessionId, null, true);
    } else {
      await this.captureBaseVersion(
        sessionId,
        spec.targetTable,
        spec.targetSystemId,
        manager,
      );
    }

    return this.insertRow(
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
      manager,
    );
  }

  private async writePerSlot(
    spec: WriteDeltaSpec,
    fieldGroup: string,
    sessionId: number,
    groupId: string,
    changeStatus: ChangeStatus,
    manager: EntityManager,
  ): Promise<number | null> {
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

    await this.supersedeCurrent(
      sessionId,
      spec.targetSystemId,
      spec.targetTable,
      fieldGroup,
      manager,
    );

    this.logDebug('supersededCurrentAction', spec, sessionId, fieldGroup, true);

    if (spec.cache === true) {
      this.pendingChangeCache.enqueueRow(row);
      return null;
    } else {
      return this.insertRow(row, manager);
    }
  }

  private async supersedeCurrent(
    sessionId: number,
    targetSystemId: number,
    targetTable: EntityName,
    fieldPath: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const fieldPathClause =
      fieldPath === null ? 'field_path IS NULL' : 'field_path = $5';
    const params: unknown[] =
      fieldPath === null
        ? [new Date().toISOString(), sessionId, targetSystemId, targetTable]
        : [
            new Date().toISOString(),
            sessionId,
            targetSystemId,
            targetTable,
            fieldPath,
          ];
    // eslint-disable-next-line custom/no-raw-persistence-queries -- dynamic fieldPath clause (null vs value) cannot be expressed with TypeORM QueryBuilder
    await manager.query(
      `UPDATE edit_actions SET valid_until = $1 WHERE session_id = $2 AND target_system_id = $3 AND target_table = $4 AND ${fieldPathClause} AND valid_until IS NULL`,
      params,
    );
  }

  private logDebug(
    msg: string,
    spec: Pick<WriteDeltaSpec, 'targetTable' | 'targetSystemId'>,
    sessionId: number,
    fieldPath: string | null,
    existing?: boolean,
  ): void {
    const existingSuffix =
      existing === undefined ? '' : `, existing=${existing}`;
    this.logger?.logDebug({
      msg,
      description: `edit_actions key session=${sessionId}, table=${spec.targetTable}, target=${spec.targetSystemId}, fieldPath=${fieldPath ?? '<null>'}${existingSuffix}`,
      component: 'PendingChangeWriter',
      tag: 'edit-actions',
    });
  }

  private async captureBaseVersion(
    sessionId: number,
    targetTable: EntityName,
    targetSystemId: number,
    manager: EntityManager,
  ): Promise<void> {
    // Use TypeORM's entity metadata to resolve the actual table name from the entity name.
    // Directly embedding targetTable in raw SQL would fail because ENTITY_NAMES values are
    // TypeORM entity names (e.g. 'SpfModule') while SQLite expects physical table names (e.g. 'spf_modules').
    let row: {version: number} | undefined;
    try {
      row = await manager
        .createQueryBuilder(targetTable, 'e')
        .select('e.version', 'version')
        .where('e.systemId = :targetSystemId', {targetSystemId})
        .getRawOne<{version: number}>();
    } catch {
      // Entity schema has no `version` column (e.g., junction tables such as
      // UseCaseSubgraph and UseCaseSubgraphPair). Nothing to capture.
      return;
    }
    if (!row) return;
    // eslint-disable-next-line custom/no-raw-persistence-queries -- INSERT OR IGNORE semantics (capture-once) are not supported by TypeORM QueryBuilder
    await manager.query(
      `INSERT OR IGNORE INTO session_entity_versions (session_id, target_system_id, base_version) VALUES ($1, $2, $3)`,
      [sessionId, targetSystemId, row.version],
    );
  }

  private async insertRow(
    row: EditActionRow,
    manager: EntityManager,
  ): Promise<number> {
    this.logDebug('insertingAction', row, row.sessionId, row.fieldPath);

    let result: unknown;
    try {
      // eslint-disable-next-line custom/no-raw-persistence-queries -- manual JSON serialization of newValue requires raw INSERT; manager.insert() does not support column-level JSON.stringify
      result = await manager.query(
        `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, linked_entity_group_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING change_id`,
        [
          row.sessionId,
          row.aggregateId,
          row.targetSystemId,
          row.targetTable,
          row.operation,
          row.fieldPath,
          JSON.stringify(serializeBlobs(row.newValue)),
          row.source,
          row.changeStatus,
          row.groupId,
          row.linkedEntityGroupId,
        ],
      );
    } catch (error) {
      this.logger?.logError({
        msg: 'insertActionFailed',
        description: `Failed to insert edit_actions key session=${row.sessionId}, table=${row.targetTable}, target=${row.targetSystemId}, fieldPath=${row.fieldPath ?? '<null>'}, operation=${row.operation}, groupId=${row.groupId ?? '<null>'}`,
        component: 'PendingChangeWriter',
        tag: 'edit-actions',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
    const returnedChangeId = getGeneratedChangeId(result);
    if (returnedChangeId !== undefined) return returnedChangeId;

    // Some SQLite drivers discard rows from INSERT ... RETURNING. This query
    // runs on the same manager/connection as the INSERT, so it remains scoped
    // to the edit action just written.
    // eslint-disable-next-line custom/no-raw-persistence-queries -- SQLite connection-local generated-ID fallback when RETURNING rows are unavailable
    const fallback: unknown = await manager.query(
      'SELECT last_insert_rowid() AS change_id',
    );
    const fallbackChangeId = getGeneratedChangeId(fallback);
    if (fallbackChangeId === undefined) {
      throw new Error('Failed to obtain the generated edit action change ID.');
    }
    return fallbackChangeId;
  }

  private async insertRows(
    rows: EditActionRow[],
    manager: EntityManager,
  ): Promise<void> {
    if (rows.length === 0) return;
    const params: unknown[] = [];
    const placeholders: string[] = [];
    for (const [i, row] of rows.entries()) {
      const b = i * 11;
      placeholders.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11})`,
      );
      params.push(
        row.sessionId,
        row.aggregateId,
        row.targetSystemId,
        row.targetTable,
        row.operation,
        row.fieldPath,
        JSON.stringify(serializeBlobs(row.newValue)),
        row.source,
        row.changeStatus,
        row.groupId,
        row.linkedEntityGroupId,
      );
    }
    // eslint-disable-next-line custom/no-raw-persistence-queries -- multi-row INSERT requires raw SQL; manager.insert() does not support column-level JSON.stringify
    await manager.query(
      `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id, linked_entity_group_id) VALUES ${placeholders.join(', ')}`,
      params,
    );
  }
}

function actionFieldPath(
  targetTable: EntityName,
  payload: Record<string, unknown>,
  explicitFieldPath: string | null | undefined,
): string | null {
  if (!isCompositeApplyTarget(targetTable)) return explicitFieldPath ?? '$';
  const valueDefSystemId = payload.valueDefSystemId;
  if (
    typeof valueDefSystemId !== 'number' ||
    !Number.isInteger(valueDefSystemId)
  ) {
    throw new DomainRuleViolationException([
      IssueFactory.invalidApplySpecialKey(
        targetTable,
        0,
        0,
        'valueDefSystemId',
      ),
    ]);
  }
  const expected = compositeValueFieldPath(valueDefSystemId);
  if (explicitFieldPath !== undefined && explicitFieldPath !== expected) {
    throw new DomainRuleViolationException([
      IssueFactory.invalidApplySpecialKey(
        targetTable,
        0,
        0,
        `fieldPath must be ${expected}`,
      ),
    ]);
  }
  return expected;
}

function getGeneratedChangeId(result: unknown): number | undefined {
  if (!isUnknownArray(result)) return undefined;
  const row = result[0];
  if (!isRecord(row)) return undefined;
  const changeId = row['change_id'];
  return typeof changeId === 'number' ? changeId : undefined;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
