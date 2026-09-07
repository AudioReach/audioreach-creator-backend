/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, Result} from '@arc/core';
import type {ChangeOperation} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {ApplyIssueFactory} from './apply-issues.js';
import {
  mainTableRowIdentityKey,
  sortEditActionRowsDeterministically,
} from './apply-changes.types.js';
import type {
  ApplyChangeOperation,
  EntityReductionRule,
  MainTableRowIdentity,
  ReducedMainTableMutation,
} from './apply-changes.types.js';

/**
 * Reduces edit-session rows for an entity whose permanent table uses one
 * `systemId` primary key. The rule derives that permanent identity from each
 * row's `targetSystemId`, groups actions affecting the same permanent row, and
 * folds each group into one create, update, delete, or no mutation.
 *
 * It does not load permanent rows, determine cross-table execution order, or
 * execute database writes. Its output is returned through
 * `ApplyOperationReducer` to the validation and execution stages.
 */
export class SystemIdEntityReductionRule implements EntityReductionRule {
  /**
   * Configures the single permanent table handled by this rule. System-ID
   * entities support every write operation in `CHANGE_OPERATION` except None.
   */
  constructor(private readonly entityName: string) {}

  /**
   * Converts all selected current edit rows for `entityName` into at most one
   * mutation per permanent `systemId` row.
   *
   * Each original `EditActionRow` is validated, mapped from
   * `targetSystemId` to a `MainTableRowIdentity`, and grouped with other rows
   * resolving to the same permanent row. Each group is then folded separately;
   * therefore actions for system IDs 120 and 121 produce independent outputs.
   *
   * Returns a failed result when any row is malformed or a row group has an
   * ambiguous lifecycle. Otherwise, returns the mutations consumed by
   * `ApplyOperationReducer`; a create-delete group contributes no mutation.
   */
  reduceToMainTableMutations(
    rows: readonly EditActionRow[],
  ): ReturnType<EntityReductionRule['reduceToMainTableMutations']> {
    if (rows.length === 0) {
      return Result.fail(
        ApplyIssueFactory.invalidAction(
          this.entityName,
          0,
          0,
          'Cannot reduce an empty entity action group',
        ),
      );
    }

    const groups = new Map<
      string,
      {target: MainTableRowIdentity; rows: EditActionRow[]}
    >();
    for (const row of rows) {
      const issue = this.validateRow(row);
      if (issue !== null) return Result.fail(issue);
      const target: MainTableRowIdentity = {
        entityName: this.entityName,
        rowIdentifier: {
          kind: 'SYSTEM_ID',
          values: {systemId: row.targetSystemId},
        },
      };
      const key = mainTableRowIdentityKey(target);
      const group = groups.get(key) ?? {target, rows: []};
      group.rows.push(row);
      groups.set(key, group);
    }

    const mutations: ReducedMainTableMutation[] = [];
    for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      const group = groups.get(key);
      if (group === undefined) continue;
      const result = this.reduceRow(group.target, group.rows);
      if (result.kind === 'FAIL') return result;
      if (result.data !== null) mutations.push(result.data);
    }
    return Result.ok(mutations);
  }

  /**
   * Checks one persisted edit row before identity derivation and folding. It
   * verifies table ownership, operation support, integer row identity, and the
   * object payload required by create and update actions. It returns the first
   * domain issue found, or `null` without changing the row.
   */
  private validateRow(row: EditActionRow) {
    if (row.targetTable !== this.entityName) {
      return ApplyIssueFactory.invalidAction(
        row.targetTable,
        row.aggregateId,
        row.targetSystemId,
        `Action was dispatched to the ${this.entityName} reduction rule`,
      );
    }
    if (!isApplyChangeOperation(row.operation)) {
      return ApplyIssueFactory.invalidOperation(
        row.targetTable,
        row.aggregateId,
        row.targetSystemId,
        row.operation,
      );
    }
    if (!Number.isInteger(row.targetSystemId)) {
      return ApplyIssueFactory.invalidAction(
        row.targetTable,
        row.aggregateId,
        row.targetSystemId,
        'targetSystemId must be an integer',
      );
    }
    if (
      (row.operation === CHANGE_OPERATION.Create ||
        row.operation === CHANGE_OPERATION.Update) &&
      !isRecord(row.newValue)
    ) {
      return ApplyIssueFactory.invalidAction(
        row.targetTable,
        row.aggregateId,
        row.targetSystemId,
        'newValue must be an object for create and update operations',
      );
    }
    return null;
  }

  /**
   * Folds all edit rows already resolved to the same permanent table row.
   * Create values form the initial payload and update payloads overwrite those
   * values in deterministic order. Delete produces an identity-only mutation,
   * while create followed by delete produces `null` because the session has no
   * lasting effect on the permanent table.
   *
   * The returned mutation carries the group's single aggregate owner and is
   * later validated, ordered against other tables, and executed by the apply
   * pipeline.
   */
  private reduceRow(
    target: MainTableRowIdentity,
    rows: readonly EditActionRow[],
  ) {
    const aggregateIds = new Set(rows.map(row => row.aggregateId));
    if (aggregateIds.size !== 1) {
      return Result.fail<ReducedMainTableMutation | null>(
        ApplyIssueFactory.invalidAction(
          this.entityName,
          rows[0].aggregateId,
          rows[0].targetSystemId,
          'A main-table row has conflicting aggregate ownership',
        ),
      );
    }

    const ordered = sortEditActionRowsDeterministically(rows);
    const creates = ordered.filter(
      row => row.operation === CHANGE_OPERATION.Create,
    );
    const deletes = ordered.filter(
      row => row.operation === CHANGE_OPERATION.Delete,
    );
    if (creates.length > 1 || deletes.length > 1) {
      return Result.fail<ReducedMainTableMutation | null>(
        ApplyIssueFactory.invalidAction(
          this.entityName,
          rows[0].aggregateId,
          rows[0].targetSystemId,
          'A main-table row has duplicate create or delete actions',
        ),
      );
    }
    // A row created and deleted within one edit session has no permanent effect.
    if (creates.length === 1 && deletes.length === 1) return Result.ok(null);

    const aggregateId = rows[0].aggregateId;
    if (deletes.length === 1) {
      return Result.ok<ReducedMainTableMutation>({
        aggregateId,
        target,
        operation: CHANGE_OPERATION.Delete,
      });
    }

    const values: Record<string, unknown> = {};
    if (creates.length === 1 && isRecord(creates[0].newValue)) {
      Object.assign(values, creates[0].newValue);
    }
    for (const row of ordered) {
      if (row.operation === CHANGE_OPERATION.Update && isRecord(row.newValue)) {
        Object.assign(values, row.newValue);
      }
    }
    // The resolved row identity owns the primary key; payload data cannot
    // replace it.
    delete values.systemId;

    if (creates.length === 1) {
      return Result.ok<ReducedMainTableMutation>({
        aggregateId,
        target,
        operation: CHANGE_OPERATION.Create,
        ...(Object.keys(values).length === 0 ? {} : {values}),
      });
    }
    return Result.ok<ReducedMainTableMutation>({
      aggregateId,
      target,
      operation: CHANGE_OPERATION.Update,
      changes: values,
    });
  }
}

/** Narrows a persisted operation to the three operations that can write data. */
function isApplyChangeOperation(
  operation: ChangeOperation,
): operation is ApplyChangeOperation {
  return (
    operation === CHANGE_OPERATION.Create ||
    operation === CHANGE_OPERATION.Update ||
    operation === CHANGE_OPERATION.Delete
  );
}

/** Ensures create and update payloads are non-null, non-array objects. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
