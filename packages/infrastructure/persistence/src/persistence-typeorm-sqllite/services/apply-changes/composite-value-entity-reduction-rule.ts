/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, RESULT_KIND, Result} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {ApplyIssueFactory} from './apply-issues.js';
import {mainTableRowIdentityKey} from './apply-changes.types.js';
import type {
  EntityReductionRule,
  MainTableRowIdentity,
  ReducedMainTableMutation,
} from './apply-changes.types.js';

type CompositeValueReductionConfig = {
  entityName: string;
  parentKey: string;
};

type ResolvedCompositeAction = {
  row: EditActionRow;
  target: MainTableRowIdentity;
};

/**
 * Builds the canonical edit-session slot for the secondary component of a
 * composite value-row key. `PendingChangeWriter` stores this path and the apply
 * rule later verifies that it identifies the same `valueDefSystemId` as the
 * staged payload.
 */
export function compositeValueFieldPath(valueDefSystemId: number): string {
  return `$key:valueDefSystemId=${String(valueDefSystemId)}`;
}

/**
 * Reduces edit-session rows for key-only value tables whose permanent identity
 * consists of a configurable parent system ID and `valueDefSystemId`.
 *
 * The edit-action schema has only one `targetSystemId`, so this rule reads the
 * complete composite key from `newValue`, verifies it against
 * `targetSystemId` and `fieldPath`, and then folds create/delete actions for
 * each permanent row. It does not order or execute database writes.
 */
export class CompositeValueEntityReductionRule implements EntityReductionRule {
  /**
   * Configures the permanent entity name and the payload property containing
   * its parent key, such as `sgkvSystemId` for `SgkvValues`.
   */
  constructor(private readonly config: CompositeValueReductionConfig) {}

  /**
   * Converts all selected current edit rows for the configured table into at
   * most one create or delete mutation per complete composite primary key.
   *
   * Every row is first resolved into its original `EditActionRow` plus a
   * derived `MainTableRowIdentity`. Resolved rows are grouped by both key
   * values and each group is folded independently. Returns a failed result when
   * identity data is inconsistent or the action sequence is ambiguous;
   * otherwise its mutations are returned through `ApplyOperationReducer` for
   * ordering and execution.
   */
  reduceToMainTableMutations(
    rows: readonly EditActionRow[],
  ): ReturnType<EntityReductionRule['reduceToMainTableMutations']> {
    if (rows.length === 0) {
      return Result.fail(
        ApplyIssueFactory.invalidAction(
          this.config.entityName,
          0,
          0,
          'Cannot reduce an empty entity action group',
        ),
      );
    }

    const groups = new Map<string, ResolvedCompositeAction[]>();
    for (const row of rows) {
      const resolved = this.resolveRow(row);
      if (resolved.kind === RESULT_KIND.Fail) return resolved;
      const key = mainTableRowIdentityKey(resolved.data.target);
      groups.set(key, [...(groups.get(key) ?? []), resolved.data]);
    }

    const mutations: ReducedMainTableMutation[] = [];
    for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      const group = groups.get(key);
      if (group === undefined) continue;
      const reduced = this.reduceRow(group);
      if (reduced.kind === RESULT_KIND.Fail) return reduced;
      if (reduced.data !== null) mutations.push(reduced.data);
    }
    return Result.ok(mutations);
  }

  /**
   * Validates and resolves one persisted edit row into its permanent composite
   * identity. The parent key and `valueDefSystemId` are read from `newValue`;
   * the parent must equal `targetSystemId`, and `fieldPath` must encode the same
   * secondary key. The returned value retains the original row and adds the
   * identity consumed by grouping and mutation execution.
   */
  private resolveRow(row: EditActionRow) {
    if (row.targetTable !== this.config.entityName) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidAction(
          row.targetTable,
          row.aggregateId,
          row.targetSystemId,
          `Action was dispatched to the ${this.config.entityName} reduction rule`,
        ),
      );
    }
    if (
      row.operation !== CHANGE_OPERATION.Create &&
      row.operation !== CHANGE_OPERATION.Delete
    ) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidOperation(
          row.targetTable,
          row.aggregateId,
          row.targetSystemId,
          row.operation,
        ),
      );
    }
    if (!isRecord(row.newValue)) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidSpecialKey(
          row.targetTable,
          row.aggregateId,
          row.targetSystemId,
          'newValue must be an object containing composite key fields',
        ),
      );
    }

    const parentSystemId = row.newValue[this.config.parentKey];
    const valueDefSystemId = row.newValue.valueDefSystemId;
    if (
      typeof parentSystemId !== 'number' ||
      typeof valueDefSystemId !== 'number' ||
      !Number.isInteger(parentSystemId) ||
      !Number.isInteger(valueDefSystemId) ||
      parentSystemId !== row.targetSystemId
    ) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidSpecialKey(
          row.targetTable,
          row.aggregateId,
          row.targetSystemId,
          this.config.parentKey,
        ),
      );
    }

    const expectedFieldPath = compositeValueFieldPath(valueDefSystemId);
    if (row.fieldPath !== expectedFieldPath) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidSpecialKey(
          row.targetTable,
          row.aggregateId,
          row.targetSystemId,
          `fieldPath must be ${expectedFieldPath}`,
        ),
      );
    }

    return Result.ok<ResolvedCompositeAction>({
      row,
      target: {
        entityName: this.config.entityName,
        rowIdentifier: {
          kind: 'COMPOSITE',
          values: {
            [this.config.parentKey]: parentSystemId,
            valueDefSystemId,
          },
        },
      },
    });
  }

  /**
   * Folds all resolved actions for one composite primary key. A single create
   * or delete becomes the corresponding identity-only mutation. A create and
   * delete cancel each other, while duplicate lifecycle actions or conflicting
   * aggregate owners produce a failed result.
   *
   * The mutation contains no separate values payload because the executor can
   * insert or delete these key-only rows using `target.rowIdentifier.values`.
   */
  private reduceRow(rows: readonly ResolvedCompositeAction[]) {
    const aggregateIds = new Set(rows.map(({row}) => row.aggregateId));
    if (aggregateIds.size !== 1) {
      return Result.fail<ReducedMainTableMutation | null>(
        ApplyIssueFactory.invalidAction(
          this.config.entityName,
          rows[0].row.aggregateId,
          rows[0].row.targetSystemId,
          'A main-table row has conflicting aggregate ownership',
        ),
      );
    }

    const creates = rows.filter(
      ({row}) => row.operation === CHANGE_OPERATION.Create,
    );
    const deletes = rows.filter(
      ({row}) => row.operation === CHANGE_OPERATION.Delete,
    );
    if (creates.length > 1 || deletes.length > 1) {
      return Result.fail<ReducedMainTableMutation | null>(
        ApplyIssueFactory.invalidAction(
          this.config.entityName,
          rows[0].row.aggregateId,
          rows[0].row.targetSystemId,
          'A composite main-table row has duplicate actions',
        ),
      );
    }
    // A relationship created and deleted in one session has no permanent-table
    // mutation.
    if (creates.length === 1 && deletes.length === 1) return Result.ok(null);

    return Result.ok<ReducedMainTableMutation>({
      aggregateId: rows[0].row.aggregateId,
      target: rows[0].target,
      operation:
        creates.length === 1
          ? CHANGE_OPERATION.Create
          : CHANGE_OPERATION.Delete,
    });
  }
}

/** Ensures a staged payload can be inspected for composite-key properties. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
