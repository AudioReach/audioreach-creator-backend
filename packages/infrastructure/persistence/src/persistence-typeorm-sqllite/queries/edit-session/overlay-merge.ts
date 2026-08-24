/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  PENDING_CHANGE_STATUS,
  SOURCE,
} from '@arc/core';
import type {ChangeOperation, PendingChangeStatus} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {DiffEntry} from './field-path-reducer.js';
import {FieldPathReducer as FieldPathReducerImpl} from './field-path-reducer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

// ── Public types ──────────────────────────────────────────────────────────────

// Re-export so callers can reference the type without importing from @arc/core directly.
export type {PendingChangeStatus} from '@arc/core';

export type OverlayResult<T> = {
  effective: T;
  diffEntries: DiffEntry[];
  /**
   * Absent when the entity has no pending changes (base row returned as-is,
   * operation = NONE). Present when at least one pending row exists.
   */
  pendingChangeStatus?: PendingChangeStatus;
  /**
   * NONE    — entity has no pending changes (committed base row only).
   * CREATE  — entity was created in this session.
   * UPDATE  — entity has pending field changes on a committed base.
   * DELETE is never present in a returned result — tombstoned entities
   *         cause applyToSingle / applyToCollection to return null / exclude.
   */
  operation: Exclude<ChangeOperation, typeof CHANGE_OPERATION.Delete>;
};

export interface OverlayMerge {
  applyToSingle<T extends {systemId: number}>(
    baseRow: T | null,
    pendingRows: EditActionRow[],
  ): OverlayResult<T> | null;

  applyToCollection<T extends {systemId: number}>(
    baseRows: T[],
    pendingRows: EditActionRow[],
    createFilter?: (newValue: Record<string, unknown>) => boolean,
  ): OverlayResult<T>[];
}

// ── Implementation ────────────────────────────────────────────────────────────

export class OverlayMergeImpl implements OverlayMerge {
  private readonly fieldPathReducer = new FieldPathReducerImpl();

  applyToSingle<T extends {systemId: number}>(
    baseRow: T | null,
    pendingRows: EditActionRow[],
  ): OverlayResult<T> | null {
    if (pendingRows.length === 0) {
      if (baseRow === null) return null;
      // No pending changes — return committed base row; operation = NONE,
      // pendingChangeStatus absent (nothing is pending).
      return {
        effective: deepClone(baseRow),
        diffEntries: [],
        operation: CHANGE_OPERATION.None,
      };
    }
    return this.foldRows<T>(baseRow, pendingRows);
  }

  applyToCollection<T extends {systemId: number}>(
    baseRows: T[],
    pendingRows: EditActionRow[],
    createFilter?: (newValue: Record<string, unknown>) => boolean,
  ): OverlayResult<T>[] {
    const pendingBySystemId = groupByTargetSystemId(pendingRows);
    const baseSystemIds = new Set(baseRows.map(r => r.systemId));
    const results: OverlayResult<T>[] = [];

    for (const base of baseRows) {
      const rows = pendingBySystemId.get(base.systemId) ?? [];
      const result = this.applyToSingle<T>(base, rows);
      if (result !== null) results.push(result);
    }

    for (const [systemId, rows] of pendingBySystemId) {
      if (baseSystemIds.has(systemId)) continue;
      if (
        createFilter !== undefined &&
        !this.passesCreateFilter(rows, createFilter)
      )
        continue;
      const result = this.applyToSingle<T>(null, rows);
      if (result !== null) results.push(result);
    }

    return results;
  }

  private passesCreateFilter(
    rows: EditActionRow[],
    createFilter: (newValue: Record<string, unknown>) => boolean,
  ): boolean {
    const createRow = rows.find(r => r.operation === CHANGE_OPERATION.Create);
    if (!createRow) return false;
    const raw = createRow.newValue;
    const newValue: Record<string, unknown> =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as Record<string, unknown>);
    return createFilter(newValue);
  }

  private foldRows<T extends {systemId: number}>(
    baseRow: T | null,
    pendingRows: EditActionRow[],
  ): OverlayResult<T> | null {
    const sorted = sortPendingRows(pendingRows);
    const effective: Record<string, unknown> =
      baseRow === null ? {} : deepClone(baseRow as Record<string, unknown>);

    const diffEntries: DiffEntry[] = [];
    let operation: Exclude<ChangeOperation, typeof CHANGE_OPERATION.Delete> =
      CHANGE_OPERATION.Update;
    let tombstone = false;

    for (const row of sorted) {
      if (row.operation === CHANGE_OPERATION.Delete) {
        tombstone = true;
        break;
      }
      if (row.operation === CHANGE_OPERATION.Create) {
        operation = CHANGE_OPERATION.Create;
        // systemId is never stored in newValue — it is the targetSystemId of
        // the CREATE action. Inject it so synthesised rows carry the correct id.
        // Only inject if not yet set (guards against duplicate CREATE rows).
        if (baseRow === null && !('systemId' in effective)) {
          effective.systemId = row.targetSystemId;
        }
      }
      this.fieldPathReducer.applyRow(effective, row);
      diffEntries.push(
        ...this.fieldPathReducer.deriveDiffEntries(
          row,
          baseRow as Record<string, unknown> | null,
        ),
      );
    }

    if (tombstone) return null;

    return {
      effective: effective as T,
      diffEntries,
      pendingChangeStatus: computePendingChangeStatus(sorted),
      operation,
    };
  }
}

// ── Private utilities ─────────────────────────────────────────────────────────

function sortPendingRows(rows: EditActionRow[]): EditActionRow[] {
  return [...rows].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return diff === 0 ? a.changeId - b.changeId : diff;
  });
}

function groupByTargetSystemId(
  rows: EditActionRow[],
): Map<number, EditActionRow[]> {
  const map = new Map<number, EditActionRow[]>();
  for (const row of rows) {
    const bucket = map.get(row.targetSystemId);
    if (bucket) bucket.push(row);
    else map.set(row.targetSystemId, [row]);
  }
  return map;
}

function computePendingChangeStatus(
  rows: EditActionRow[],
): PendingChangeStatus {
  if (rows.length === 0) return PENDING_CHANGE_STATUS.Staged;
  let hasStaged = false;
  let hasUnstaged = false;
  for (const row of rows) {
    if (row.changeStatus === CHANGE_STATUS.Staged) hasStaged = true;
    if (row.changeStatus === CHANGE_STATUS.Unstaged) hasUnstaged = true;
    if (hasStaged && hasUnstaged) return PENDING_CHANGE_STATUS.Partial;
  }
  return hasUnstaged
    ? PENDING_CHANGE_STATUS.Unstaged
    : PENDING_CHANGE_STATUS.Staged;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

// ── Backwards-compat shims — LLD3 removes these when read services are rewritten ─

/**
 * Minimal shape used by existing read services to call the overlay.
 * @deprecated Use OverlayMergeImpl directly. Removed in LLD3.
 */
export interface EditActionForOverlay {
  targetSystemId: number;
  operation: ChangeOperation;
  newValue: unknown;
}

const _compat = new OverlayMergeImpl();

// eslint-disable-next-line sonarjs/deprecation -- this IS the deprecated compat shim; EditActionForOverlay is used internally here
function toEditActionRow(ea: EditActionForOverlay): EditActionRow {
  return {
    changeId: 0,
    sessionId: 0,
    aggregateId: 0,
    targetSystemId: ea.targetSystemId,
    targetTable: ENTITY_NAMES.EditAction,
    operation: ea.operation,
    fieldPath: null,
    newValue: ea.newValue,
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    groupId: null,
    linkedEntityGroupId: null,
    createdAt: new Date(0),
    validUntil: null,
  };
}

/** @deprecated Use OverlayMergeImpl.applyToSingle(). Removed in LLD3. */
export function applyToSingle<T extends {systemId: number}>(
  baseRow: T | null,
  // eslint-disable-next-line sonarjs/deprecation -- parameter type for this deprecated overload
  editAction: EditActionForOverlay | null,
): T | null {
  if (!editAction) return baseRow;
  return (
    _compat.applyToSingle<T>(baseRow, [toEditActionRow(editAction)])
      ?.effective ?? null
  );
}

/** @deprecated Use OverlayMergeImpl.applyToCollection(). Removed in LLD3. */
export function applyToCollection<T extends {systemId: number}>(
  baseRows: T[],
  // eslint-disable-next-line sonarjs/deprecation -- parameter type for this deprecated overload
  editActions: EditActionForOverlay[],
): T[] {
  return _compat
    .applyToCollection<T>(
      baseRows,
      editActions.map(ea => toEditActionRow(ea)),
    )
    .map(r => r.effective);
}
