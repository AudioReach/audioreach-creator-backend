/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CommitValidationFailedException} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {
  ApplyChangeOperation,
  ReducedEditAction,
} from './apply-changes.types.js';

/**
 * Converts staged edit-action rows into permanent-table operations.
 *
 * One reduced action represents one table row, identified uniformly by
 * `systemId`. The reducer validates executable persistence metadata, combines
 * compatible field updates, and records the staged rows represented by each
 * operation. Routing metadata is removed; graph state is not pre-validated.
 */
export class ApplyEditActionReducer {
  constructor(private readonly manager: EntityManager) {}

  reduce(
    rows: readonly EditActionRow[],
  ): Promise<readonly ReducedEditAction[]> {
    try {
      return Promise.resolve(this.reduceRows(rows));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Groups staged rows by the permanent row they change, then reduces each
   * group into one action for the fixed-order executor.
   *
   * `targetTable` keeps rows for different tables separate even when their
   * system IDs match. `targetSystemId` keeps edits for different rows in the
   * same table separate. Multiple field edits for one table row are therefore
   * merged into one CREATE, UPDATE, or DELETE action.
   */
  private reduceRows(
    rows: readonly EditActionRow[],
  ): readonly ReducedEditAction[] {
    const grouped = new Map<string, EditActionRow[]>();
    for (const row of rows) {
      // This identifies exactly one row in one permanent table.
      const key = `${row.targetTable}|${row.targetSystemId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    const result: ReducedEditAction[] = [];
    for (const key of [...grouped.keys()].sort((a, b) => a.localeCompare(b))) {
      // A group may contain separate staged edits for different columns.
      result.push(this.reduceEditActionRows(grouped.get(key) ?? []));
    }
    this.validateSourceCoverage(rows, result);
    return result;
  }

  private getPersistedPayload(row: EditActionRow): Record<string, unknown> {
    const payload = toPayload(row);
    const knownProperties = new Set(
      this.manager
        .getRepository(row.targetTable)
        .metadata.columns.map(column => column.propertyName),
    );
    if (!knownProperties.has('systemId')) {
      this.fail(row, 'Target does not expose a systemId identity');
    }
    return this.sanitizePayload(row, payload, knownProperties);
  }

  private sanitizePayload(
    row: EditActionRow,
    payload: Record<string, unknown>,
    knownProperties: ReadonlySet<string>,
  ): Record<string, unknown> {
    const result = {...payload};
    if (row.targetTable === ENTITY_NAMES.UseCase) {
      // These fields support routing workflows but have no UseCase table column.
      delete result.referencedComponents;
      delete result.sgkvAssignments;
    }
    for (const property of Object.keys(result)) {
      if (!knownProperties.has(property)) {
        this.fail(row, `Unknown persistence property '${property}'`);
      }
    }
    return result;
  }

  private validateSourceCoverage(
    rows: readonly EditActionRow[],
    actions: readonly ReducedEditAction[],
  ): void {
    // Cleanup must remove exactly the staged rows represented by executed work.
    const selected = [...new Set(rows.map(row => row.changeId))].sort(
      (a, b) => a - b,
    );
    const reduced = [
      ...new Set(actions.flatMap(action => action.sourceEditActionIds)),
    ].sort((a, b) => a - b);
    if (!arraysEqual(selected, reduced)) {
      throw new CommitValidationFailedException(
        'Selected edit actions are not fully represented by reduced operations.',
        {selectedChangeIds: selected, reducedSourceEditActionIds: reduced},
      );
    }
  }

  /**
   * Converts one permanent-row group into the single action the executor
   * applies. CREATE and UPDATE merge persisted fields; DELETE needs only the
   * common target system ID.
   */
  private reduceEditActionRows(
    rows: readonly EditActionRow[],
  ): ReducedEditAction {
    if (rows.length === 0) {
      throw new CommitValidationFailedException(
        'Cannot reduce an empty edit-action group.',
      );
    }
    const first = rows[0];

    this.validateEditActionGroup(rows, first);
    const operation = first.operation as ApplyChangeOperation;
    const targetSystemId = first.targetSystemId;
    const base = {
      tableName: first.targetTable,
      operation,
      targetSystemId,
      sourceEditActionIds: [...new Set(rows.map(row => row.changeId))].sort(
        (left, right) => left - right,
      ),
    };

    if (operation === CHANGE_OPERATION.Delete) return base;

    const values = this.mergeEditActionValues(rows, targetSystemId);
    if (
      operation === CHANGE_OPERATION.Update &&
      Object.keys(values).length === 0
    ) {
      this.fail(first, 'UPDATE contains no persisted values');
    }
    return Object.keys(values).length === 0 ? base : {...base, values};
  }

  /**
   * Ensures rows already grouped by table and systemId can be combined safely.
   * It checks persistence metadata and operation consistency;
   * database constraints and graph relationships are validated during writes.
   */
  private validateEditActionGroup(
    rows: readonly EditActionRow[],
    first: EditActionRow,
  ): void {
    for (const row of rows) {
      if (!isApplyOperation(row.operation)) {
        this.fail(row, `Unsupported operation ${row.operation}`);
      }
      this.getPersistedPayload(row);
    }

    const operations = new Set(rows.map(row => row.operation));
    if (operations.size !== 1) {
      this.fail(first, 'Mixed operations target the same permanent row');
    }
    if (
      first.operation === CHANGE_OPERATION.Delete &&
      rows.some(row => Object.keys(this.getPersistedPayload(row)).length > 0)
    ) {
      this.fail(first, 'DELETE must not contain persisted values');
    }
  }

  private mergeEditActionValues(
    rows: readonly EditActionRow[],
    targetSystemId: number,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const row of rows) {
      for (const [property, value] of Object.entries(
        this.getPersistedPayload(row),
      )) {
        if (property === 'systemId') {
          if (targetSystemId !== value) {
            this.fail(
              row,
              `Identity property '${property}' conflicts with target system ID`,
            );
          }
          continue;
        }
        if (Object.hasOwn(values, property)) {
          this.fail(row, `Overlapping field coverage for '${property}'`);
        }
        values[property] = value;
      }
    }
    return values;
  }

  private fail(row: EditActionRow, reason: string): never {
    throw new CommitValidationFailedException(
      `Commit validation failed for ${row.targetTable} ` +
        `(targetSystemId=${row.targetSystemId}): ${reason}`,
      {
        targetTable: row.targetTable,
        targetSystemId: row.targetSystemId,
      },
    );
  }
}

function isApplyOperation(
  operation: EditActionRow['operation'],
): operation is ApplyChangeOperation {
  return (
    operation === CHANGE_OPERATION.Create ||
    operation === CHANGE_OPERATION.Update ||
    operation === CHANGE_OPERATION.Delete
  );
}

function toPayload(row: EditActionRow): Record<string, unknown> {
  if (row.operation === CHANGE_OPERATION.Delete && !isRecord(row.newValue)) {
    return {};
  }
  if (!isRecord(row.newValue)) {
    throw new CommitValidationFailedException(
      `Commit validation failed for ${row.targetTable}: newValue must be an object.`,
    );
  }
  return {...row.newValue};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
