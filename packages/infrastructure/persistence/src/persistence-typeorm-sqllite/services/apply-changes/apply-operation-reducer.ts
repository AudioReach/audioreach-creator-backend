/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND, Result} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {ApplyIssueFactory} from './apply-issues.js';
import {sortEditActionRowsDeterministically} from './apply-changes.types.js';
import type {
  ApplyReductionRegistry,
  ReducedMainTableMutation,
} from './apply-changes.types.js';

/**
 * Coordinates the conversion of selected edit-session rows into permanent
 * main-table mutations. It groups the original rows by target table, dispatches
 * each table group to its registered entity-specific reduction rule, and
 * combines the rule outputs.
 *
 * Row-identity derivation and create/update/delete folding belong to the
 * registered rules. This class does not modify the selected rows, determine
 * database execution order, or execute writes.
 */
export class ApplyOperationReducer {
  constructor(private readonly registry: ApplyReductionRegistry) {}

  /**
   * Reduces the current staged rows selected for one edit session.
   *
   * The input contains the complete `EditActionRow` objects returned by the
   * edit-action query. Rows are grouped by `targetTable` and passed unchanged,
   * in deterministic order, to that table's registered reduction rule. Each
   * rule may combine several edit rows for one permanent row into one mutation,
   * or remove a sequence with no permanent effect such as create followed by
   * delete.
   *
   * Returns all reduced mutations for subsequent metadata validation,
   * dependency ordering, and execution. Reduction stops with a failed result
   * when a target table is unsupported or an entity-specific rule rejects its
   * rows.
   */
  reduce(
    rows: readonly EditActionRow[],
  ): Result<readonly ReducedMainTableMutation[]> {
    const tableGroups = new Map<string, EditActionRow[]>();
    for (const row of rows) {
      tableGroups.set(row.targetTable, [
        ...(tableGroups.get(row.targetTable) ?? []),
        row,
      ]);
    }

    const mutations: ReducedMainTableMutation[] = [];
    for (const targetTable of [...tableGroups.keys()].sort((a, b) =>
      a.localeCompare(b),
    )) {
      const rule = this.registry.get(targetTable);
      if (rule === undefined) {
        return Result.fail<readonly ReducedMainTableMutation[]>(
          ApplyIssueFactory.unsupportedTarget(targetTable),
        );
      }

      const result = rule.reduceToMainTableMutations(
        sortEditActionRowsDeterministically(tableGroups.get(targetTable) ?? []),
      );
      if (result.kind === RESULT_KIND.Fail) {
        return Result.fail<readonly ReducedMainTableMutation[]>(
          ...result.issues,
        );
      }
      mutations.push(...result.data);
    }

    return Result.ok<readonly ReducedMainTableMutation[]>(mutations);
  }
}
