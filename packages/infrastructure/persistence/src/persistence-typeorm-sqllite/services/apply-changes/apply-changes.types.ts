/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import type {ChangeOperation, Result} from '@arc/core';

/** Operations that can produce a physical write during apply. */
export type ApplyChangeOperation = Exclude<
  ChangeOperation,
  typeof CHANGE_OPERATION.None
>;

/**
 * One-to-one persistence representation of a selected edit_actions row.
 * Reducers consume this source action; it is not itself a main-table write.
 */
export type PendingApplyAction = {
  /** Aggregate ownership retained for validation, logging, and summaries. */
  aggregateId: number;
  /** Canonical TypeORM entity name copied from edit_actions.targetTable. */
  entityName: string;
  /** Source row anchor; the reducer decides how it identifies a main-table row. */
  targetSystemId: number;
  operation: ApplyChangeOperation;
  /** Identifies the edited field or the canonical slot for a composite target. */
  fieldPath: string | null;
  /** Values recorded by the edit operation before entity-specific reduction. */
  newValue: Readonly<Record<string, unknown>>;
};

/**
 * Identifies one table-qualified edit-action slot selected for cleanup after a
 * successful apply. It is separate from the permanent main-table row identity.
 */
export type ApplyActionSlot = {
  targetTable: string;
  targetSystemId: number;
  fieldPath: string | null;
};

/** Identifies a main-table row whose physical primary key is systemId. */
export type SystemIdRowIdentifier = {
  kind: 'SYSTEM_ID';
  values: {systemId: number};
};

/** Identifies a main-table row that requires every component of a composite key. */
export type CompositeRowIdentifier = {
  kind: 'COMPOSITE';
  values: Readonly<Record<string, string | number | boolean>>;
};

/** Complete primary-key shape accepted by the main-table writer. */
export type RowIdentifier = SystemIdRowIdentifier | CompositeRowIdentifier;

/**
 * Complete identity of one existing or intended row in a permanent entity
 * table. It contains identity only and never loaded main-table data.
 */
export type MainTableRowIdentity = {
  entityName: string;
  rowIdentifier: RowIdentifier;
};

/**
 * Final reducer output and main-table writer input for one physical row.
 * Create carries insert values, update carries changed columns, and delete
 * requires only the resolved row identity.
 */
export type MainTableEntityWriteOperation =
  | {
      aggregateId: number;
      target: MainTableRowIdentity;
      operation: typeof CHANGE_OPERATION.Create;
      values?: Readonly<Record<string, unknown>>;
    }
  | {
      aggregateId: number;
      target: MainTableRowIdentity;
      operation: typeof CHANGE_OPERATION.Update;
      changes: Readonly<Record<string, unknown>>;
    }
  | {
      aggregateId: number;
      target: MainTableRowIdentity;
      operation: typeof CHANGE_OPERATION.Delete;
    };

/**
 * Entity-specific reduction policy. A rule validates edit-action operations,
 * resolves permanent-row identities, and folds actions for each row into one
 * final write or no write. It never schedules or executes database changes.
 */
export interface EntityReductionRule {
  readonly allowedOperations: readonly ApplyChangeOperation[];

  /**
   * Converts all selected actions for one entity into at most one write per
   * permanent row. This method does not schedule or execute writes.
   */
  reduceToMainTableWriteOperations(
    actions: readonly PendingApplyAction[],
  ): Result<readonly MainTableEntityWriteOperation[]>;
}

/** Dispatches each entity action group to its explicitly registered reducer. */
export type ApplyReductionRegistry = ReadonlyMap<string, EntityReductionRule>;

export function mainTableRowIdentityKey(target: MainTableRowIdentity): string {
  const values = Object.entries(target.rowIdentifier.values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('|');
  return `${target.entityName}|${values}`;
}

export function sortPendingActionsDeterministically(
  actions: readonly PendingApplyAction[],
): PendingApplyAction[] {
  const operationOrder: Readonly<Record<ApplyChangeOperation, number>> = {
    [CHANGE_OPERATION.Create]: 1,
    [CHANGE_OPERATION.Update]: 2,
    [CHANGE_OPERATION.Delete]: 3,
  };
  return [...actions].sort(
    (left, right) =>
      left.targetSystemId - right.targetSystemId ||
      (left.fieldPath ?? '').localeCompare(right.fieldPath ?? '') ||
      operationOrder[left.operation] - operationOrder[right.operation] ||
      JSON.stringify(left.newValue).localeCompare(
        JSON.stringify(right.newValue),
      ),
  );
}
