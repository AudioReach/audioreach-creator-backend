/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, RESULT_KIND, Result} from '@arc/core';
import {ApplyIssueFactory} from './apply-issues.js';
import {mainTableRowIdentityKey} from './apply-changes.types.js';
import type {
  ApplyChangeOperation,
  EntityReductionRule,
  MainTableEntityWriteOperation,
  MainTableRowIdentity,
  PendingApplyAction,
} from './apply-changes.types.js';

type CompositeValueReductionConfig = {
  entityName: string;
  parentKey: string;
};

type ResolvedCompositeAction = {
  action: PendingApplyAction;
  target: MainTableRowIdentity;
};

export function compositeValueFieldPath(valueDefSystemId: number): string {
  return `$key:valueDefSystemId=${String(valueDefSystemId)}`;
}

/**
 * Reduces key-only value relationship actions whose permanent rows use a
 * parent-system-ID plus `valueDefSystemId` composite identity. It validates the
 * canonical action slot and emits one create, delete, or no-operation result
 * per relationship row.
 *
 * This class resolves write identities but does not execute database writes.
 */
export class CompositeValueEntityReductionRule implements EntityReductionRule {
  readonly allowedOperations: readonly ApplyChangeOperation[] = [
    CHANGE_OPERATION.Create,
    CHANGE_OPERATION.Delete,
  ];

  constructor(private readonly config: CompositeValueReductionConfig) {}

  reduceToMainTableWriteOperations(
    actions: readonly PendingApplyAction[],
  ): ReturnType<EntityReductionRule['reduceToMainTableWriteOperations']> {
    if (actions.length === 0) {
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
    for (const action of actions) {
      const resolved = this.resolveAction(action);
      if (resolved.kind === RESULT_KIND.Fail) return resolved;
      const key = mainTableRowIdentityKey(resolved.data.target);
      groups.set(key, [...(groups.get(key) ?? []), resolved.data]);
    }

    const operations: MainTableEntityWriteOperation[] = [];
    for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      const group = groups.get(key);
      if (group === undefined) continue;
      const reduced = this.reduceRow(group);
      if (reduced.kind === RESULT_KIND.Fail) return reduced;
      if (reduced.data !== null) operations.push(reduced.data);
    }
    return Result.ok(operations);
  }

  private resolveAction(action: PendingApplyAction) {
    if (action.entityName !== this.config.entityName) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidAction(
          action.entityName,
          action.aggregateId,
          action.targetSystemId,
          `Action was dispatched to the ${this.config.entityName} reduction rule`,
        ),
      );
    }
    if (!this.allowedOperations.includes(action.operation)) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidOperation(
          action.entityName,
          action.aggregateId,
          action.targetSystemId,
          action.operation,
        ),
      );
    }

    const parentSystemId = action.newValue[this.config.parentKey];
    const valueDefSystemId = action.newValue.valueDefSystemId;
    if (
      typeof parentSystemId !== 'number' ||
      typeof valueDefSystemId !== 'number' ||
      !Number.isInteger(parentSystemId) ||
      !Number.isInteger(valueDefSystemId) ||
      parentSystemId !== action.targetSystemId
    ) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidSpecialKey(
          action.entityName,
          action.aggregateId,
          action.targetSystemId,
          this.config.parentKey,
        ),
      );
    }

    const expectedFieldPath = compositeValueFieldPath(valueDefSystemId);
    if (action.fieldPath !== expectedFieldPath) {
      return Result.fail<ResolvedCompositeAction>(
        ApplyIssueFactory.invalidSpecialKey(
          action.entityName,
          action.aggregateId,
          action.targetSystemId,
          `fieldPath must be ${expectedFieldPath}`,
        ),
      );
    }

    return Result.ok<ResolvedCompositeAction>({
      action,
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

  private reduceRow(actions: readonly ResolvedCompositeAction[]) {
    const aggregateIds = new Set(actions.map(({action}) => action.aggregateId));
    if (aggregateIds.size !== 1) {
      return Result.fail<MainTableEntityWriteOperation | null>(
        ApplyIssueFactory.invalidAction(
          this.config.entityName,
          actions[0].action.aggregateId,
          actions[0].action.targetSystemId,
          'A main-table row has conflicting aggregate ownership',
        ),
      );
    }

    const creates = actions.filter(
      ({action}) => action.operation === CHANGE_OPERATION.Create,
    );
    const deletes = actions.filter(
      ({action}) => action.operation === CHANGE_OPERATION.Delete,
    );
    if (creates.length > 1 || deletes.length > 1) {
      return Result.fail<MainTableEntityWriteOperation | null>(
        ApplyIssueFactory.invalidAction(
          this.config.entityName,
          actions[0].action.aggregateId,
          actions[0].action.targetSystemId,
          'A composite main-table row has duplicate actions',
        ),
      );
    }
    if (creates.length === 1 && deletes.length === 1) return Result.ok(null);

    return Result.ok<MainTableEntityWriteOperation>({
      aggregateId: actions[0].action.aggregateId,
      target: actions[0].target,
      operation:
        creates.length === 1
          ? CHANGE_OPERATION.Create
          : CHANGE_OPERATION.Delete,
    });
  }
}
