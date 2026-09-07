/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, Result} from '@arc/core';
import {ApplyIssueFactory} from './apply-issues.js';
import {
  mainTableRowIdentityKey,
  sortPendingActionsDeterministically,
} from './apply-changes.types.js';
import type {
  ApplyChangeOperation,
  EntityReductionRule,
  MainTableEntityWriteOperation,
  MainTableRowIdentity,
  PendingApplyAction,
} from './apply-changes.types.js';

const ALL_WRITE_OPERATIONS: readonly ApplyChangeOperation[] = [
  CHANGE_OPERATION.Create,
  CHANGE_OPERATION.Update,
  CHANGE_OPERATION.Delete,
];

/**
 * Reduces actions for entities whose permanent rows are identified by
 * `systemId`. Actions are grouped by that main-table identity and folded into
 * at most one create, update, delete, or no-operation result per row.
 *
 * This class does not access TypeORM or write to the database.
 */
export class SystemIdEntityReductionRule implements EntityReductionRule {
  constructor(
    private readonly entityName: string,
    readonly allowedOperations: readonly ApplyChangeOperation[] = ALL_WRITE_OPERATIONS,
  ) {}

  reduceToMainTableWriteOperations(
    actions: readonly PendingApplyAction[],
  ): ReturnType<EntityReductionRule['reduceToMainTableWriteOperations']> {
    if (actions.length === 0) {
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
      {target: MainTableRowIdentity; actions: PendingApplyAction[]}
    >();
    for (const action of actions) {
      const issue = this.validateAction(action);
      if (issue !== null) return Result.fail(issue);
      const target: MainTableRowIdentity = {
        entityName: this.entityName,
        rowIdentifier: {
          kind: 'SYSTEM_ID',
          values: {systemId: action.targetSystemId},
        },
      };
      const key = mainTableRowIdentityKey(target);
      const group = groups.get(key) ?? {target, actions: []};
      group.actions.push(action);
      groups.set(key, group);
    }

    const operations: MainTableEntityWriteOperation[] = [];
    for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      const group = groups.get(key);
      if (group === undefined) continue;
      const result = this.reduceRow(group.target, group.actions);
      if (result.kind === 'FAIL') return result;
      if (result.data !== null) operations.push(result.data);
    }
    return Result.ok(operations);
  }

  private validateAction(action: PendingApplyAction) {
    if (action.entityName !== this.entityName) {
      return ApplyIssueFactory.invalidAction(
        action.entityName,
        action.aggregateId,
        action.targetSystemId,
        `Action was dispatched to the ${this.entityName} reduction rule`,
      );
    }
    if (!this.allowedOperations.includes(action.operation)) {
      return ApplyIssueFactory.invalidOperation(
        action.entityName,
        action.aggregateId,
        action.targetSystemId,
        action.operation,
      );
    }
    if (!Number.isInteger(action.targetSystemId)) {
      return ApplyIssueFactory.invalidAction(
        action.entityName,
        action.aggregateId,
        action.targetSystemId,
        'targetSystemId must be an integer',
      );
    }
    return null;
  }

  private reduceRow(
    target: MainTableRowIdentity,
    actions: readonly PendingApplyAction[],
  ) {
    const aggregateIds = new Set(actions.map(action => action.aggregateId));
    if (aggregateIds.size !== 1) {
      return Result.fail<MainTableEntityWriteOperation | null>(
        ApplyIssueFactory.invalidAction(
          this.entityName,
          actions[0].aggregateId,
          actions[0].targetSystemId,
          'A main-table row has conflicting aggregate ownership',
        ),
      );
    }

    const ordered = sortPendingActionsDeterministically(actions);
    const creates = ordered.filter(
      action => action.operation === CHANGE_OPERATION.Create,
    );
    const deletes = ordered.filter(
      action => action.operation === CHANGE_OPERATION.Delete,
    );
    if (creates.length > 1 || deletes.length > 1) {
      return Result.fail<MainTableEntityWriteOperation | null>(
        ApplyIssueFactory.invalidAction(
          this.entityName,
          actions[0].aggregateId,
          actions[0].targetSystemId,
          'A main-table row has duplicate create or delete actions',
        ),
      );
    }
    if (creates.length === 1 && deletes.length === 1) return Result.ok(null);

    const aggregateId = actions[0].aggregateId;
    if (deletes.length === 1) {
      return Result.ok<MainTableEntityWriteOperation>({
        aggregateId,
        target,
        operation: CHANGE_OPERATION.Delete,
      });
    }

    const values: Record<string, unknown> = {};
    if (creates.length === 1) Object.assign(values, creates[0].newValue);
    for (const action of ordered) {
      if (action.operation === CHANGE_OPERATION.Update) {
        Object.assign(values, action.newValue);
      }
    }
    delete values.systemId;

    if (creates.length === 1) {
      return Result.ok<MainTableEntityWriteOperation>({
        aggregateId,
        target,
        operation: CHANGE_OPERATION.Create,
        ...(Object.keys(values).length === 0 ? {} : {values}),
      });
    }
    return Result.ok<MainTableEntityWriteOperation>({
      aggregateId,
      target,
      operation: CHANGE_OPERATION.Update,
      changes: values,
    });
  }
}
