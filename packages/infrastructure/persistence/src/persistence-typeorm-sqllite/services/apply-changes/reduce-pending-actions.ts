/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND, Result} from '@arc/core';
import {ApplyIssueFactory} from './apply-issues.js';
import type {
  ApplyReductionRegistry,
  MainTableEntityWriteOperation,
  PendingApplyAction,
} from './apply-changes.types.js';

/**
 * Groups mapped edit actions by entity and delegates each group to its
 * registered reduction rule. The returned operations are final main-table
 * write descriptions, but they are not yet scheduled or executed.
 */
export function reducePendingActions(
  actions: readonly PendingApplyAction[],
  registry: ApplyReductionRegistry,
) {
  const entityGroups = new Map<string, PendingApplyAction[]>();
  for (const action of actions) {
    entityGroups.set(action.entityName, [
      ...(entityGroups.get(action.entityName) ?? []),
      action,
    ]);
  }

  const operations: MainTableEntityWriteOperation[] = [];
  for (const entityName of [...entityGroups.keys()].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const rule = registry.get(entityName);
    if (rule === undefined) {
      return Result.fail<readonly MainTableEntityWriteOperation[]>(
        ApplyIssueFactory.unsupportedTarget(entityName),
      );
    }
    const result = rule.reduceToMainTableWriteOperations(
      entityGroups.get(entityName) ?? [],
    );
    if (result.kind === RESULT_KIND.Fail) {
      return Result.fail<readonly MainTableEntityWriteOperation[]>(
        ...result.issues,
      );
    }
    operations.push(...result.data);
  }
  return Result.ok<readonly MainTableEntityWriteOperation[]>(operations);
}
