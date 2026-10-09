/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import type {ChangeOperation, Result} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

/** Operations that can produce a physical write during apply. */
export type ApplyChangeOperation = Exclude<
  ChangeOperation,
  typeof CHANGE_OPERATION.None
>;

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
 * Final reducer output and mutation-executor input for one physical row.
 * Create carries insert values, update carries changed columns, and delete
 * requires only the resolved row identity.
 */
export type ReducedMainTableMutation =
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
 * reduced mutation or no mutation. It never schedules or executes database
 * changes.
 */
export interface EntityReductionRule {
  /**
   * Converts all selected actions for one entity into at most one mutation per
   * permanent row. This method does not schedule or execute mutations.
   */
  reduceToMainTableMutations(
    rows: readonly EditActionRow[],
  ): Result<readonly ReducedMainTableMutation[]>;
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

export function sortEditActionRowsDeterministically(
  rows: readonly EditActionRow[],
): EditActionRow[] {
  return [...rows].sort(
    (left, right) =>
      left.targetSystemId - right.targetSystemId ||
      (left.fieldPath ?? '').localeCompare(right.fieldPath ?? '') ||
      applyOperationSortOrder(left.operation) -
        applyOperationSortOrder(right.operation) ||
      JSON.stringify(left.newValue).localeCompare(
        JSON.stringify(right.newValue),
      ),
  );
}

function applyOperationSortOrder(operation: ChangeOperation): number {
  if (operation === CHANGE_OPERATION.Create) return 1;
  if (operation === CHANGE_OPERATION.Update) return 2;
  if (operation === CHANGE_OPERATION.Delete) return 3;
  return 4;
}
