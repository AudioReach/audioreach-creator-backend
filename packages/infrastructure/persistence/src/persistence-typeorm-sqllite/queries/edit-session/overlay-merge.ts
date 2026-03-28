/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, type ChangeOperation} from '@arc/core';

/** Minimal shape needed for overlay — decoupled from EditActionRow */
export interface EditActionForOverlay {
  systemId: number;
  operation: ChangeOperation;
  payload: unknown;
}

/**
 * Apply overlay to a single base row.
 * - ADD:    returns payload as full entity (base row is null for new entities)
 * - UPDATE: merges partial payload over base row ({ ...baseRow, ...payload })
 * - DELETE: returns null (entity is gone)
 * - null action: returns base row as-is
 */

export function applyToSingle<T extends {systemId: number}>(
  baseRow: T | null,
  editAction: EditActionForOverlay | null,
): T | null {
  if (!editAction) return baseRow;

  if (editAction.operation === CHANGE_OPERATION.Delete) return null;

  if (editAction.operation === CHANGE_OPERATION.Create)
    return editAction.payload as T;

  if (!baseRow) return null; // invalid operation

  return {...baseRow, ...(editAction.payload as Partial<T>)};
}

/**
 * Apply overlay to a collection of base rows.
 * - Existing rows: delegates to applyToSingle per element
 * - ADD actions for entities not yet in actual table: appended to result
 */
export function applyToCollection<T extends {systemId: number}>(
  baseRows: T[],
  editActions: EditActionForOverlay[],
): T[] {
  const editActionsMap = new Map<number, EditActionForOverlay>(
    editActions.map(ea => [ea.systemId, ea]),
  );
  const baseSystemIdsSet = new Set(baseRows.map(row => row.systemId));
  const result: T[] = [];
  for (const row of baseRows) {
    const overlayRow = applyToSingle(
      row,
      editActionsMap.get(row.systemId) ?? null,
    );
    if (overlayRow != null) result.push(overlayRow);
  }

  for (const editAction of editActions)
    if (
      editAction.operation === CHANGE_OPERATION.Create &&
      !baseSystemIdsSet.has(editAction.systemId)
    ) {
      const added = editAction.payload as T;
      if (added != null) result.push(added);
    }

  return result;
}
