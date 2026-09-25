/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '../../shared/change-vocabulary.js';
import type {ChangeOperation} from '../../shared/change-vocabulary.js';
import {RESULT_KIND, Result} from '../../shared/result/result.js';
import {IssueFactory} from '../../../shared/issues/factories.js';
import type {
  ApplyDependencyResolver,
  ApplyRule,
  ApplyRuleResult,
  ApplyRuleSlots,
  ExecutionSlot,
  PendingApplyAction,
  PlannedMutation,
} from './apply-changes.types.js';

export type SystemIdApplyRuleConfig = {
  targetType: string;
  slots: ApplyRuleSlots;
  dependencies?: ApplyDependencyResolver;
  sanitizeValues?: (
    values: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
};

const OPERATION_ORDER: Readonly<Record<string, number>> = {
  [CHANGE_OPERATION.Create]: 1,
  [CHANGE_OPERATION.Update]: 2,
  [CHANGE_OPERATION.Delete]: 3,
};

function compareActions(a: PendingApplyAction, b: PendingApplyAction): number {
  const fieldComparison = (a.fieldPath ?? '').localeCompare(b.fieldPath ?? '');
  if (fieldComparison !== 0) return fieldComparison;
  const operationComparison =
    (OPERATION_ORDER[a.operation] ?? Number.MAX_SAFE_INTEGER) -
    (OPERATION_ORDER[b.operation] ?? Number.MAX_SAFE_INTEGER);
  if (operationComparison !== 0) return operationComparison;
  return JSON.stringify(a.newValue).localeCompare(JSON.stringify(b.newValue));
}

export class SystemIdApplyRule implements ApplyRule {
  readonly allowedOperations: readonly ChangeOperation[] = [
    CHANGE_OPERATION.Create,
    CHANGE_OPERATION.Update,
    CHANGE_OPERATION.Delete,
  ];

  readonly targetType: string;
  private readonly slots: ApplyRuleSlots;
  private readonly dependencyResolver: ApplyDependencyResolver;
  private readonly sanitizeValues: (
    values: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;

  constructor(config: SystemIdApplyRuleConfig) {
    this.targetType = config.targetType;
    this.slots = config.slots;
    this.dependencyResolver = config.dependencies ?? (() => []);
    this.sanitizeValues = config.sanitizeValues ?? (values => values);
  }

  actionSlot(action: PendingApplyAction): ApplyRuleResult<string> {
    const validation = this.validateAction(action);
    if (validation !== null) return Result.fail<string>(validation);
    return Result.ok(
      `${this.targetType}:${action.targetSystemId}:${action.fieldPath ?? '$'}`,
    );
  }

  mutationKey(action: PendingApplyAction): ApplyRuleResult<string> {
    const validation = this.validateAction(action);
    if (validation !== null) return Result.fail<string>(validation);
    return Result.ok(`${this.targetType}:${action.targetSystemId}`);
  }

  reduce(
    actions: readonly PendingApplyAction[],
  ): ApplyRuleResult<PlannedMutation | null> {
    const validationIssue = this.validateActions(actions);
    if (validationIssue !== null) {
      return Result.fail<PlannedMutation | null>(validationIssue);
    }

    const ordered = [...actions].sort(compareActions);
    const creates = ordered.filter(
      action => action.operation === CHANGE_OPERATION.Create,
    );
    const deletes = ordered.filter(
      action => action.operation === CHANGE_OPERATION.Delete,
    );
    if (creates.length > 1 || deletes.length > 1) {
      return Result.fail<PlannedMutation | null>(
        IssueFactory.invalidApplyAction(
          this.targetType,
          actions[0].aggregateId,
          actions[0].targetSystemId,
          'A physical target has duplicate create or delete actions',
        ),
      );
    }

    if (creates.length === 1 && deletes.length === 1) {
      return Result.ok<PlannedMutation | null>(null);
    }

    const operation = this.operationFor(creates.length, deletes.length);
    const executionSlot = this.slotFor(operation, actions[0]);
    if (executionSlot.kind !== RESULT_KIND.Ok) {
      return Result.fail<PlannedMutation | null>(...executionSlot.issues);
    }

    const values = this.mergeValues(creates[0]?.newValue, ordered);
    const physicalValues =
      operation === CHANGE_OPERATION.Create
        ? {...values, systemId: actions[0].targetSystemId}
        : values;

    return Result.ok<PlannedMutation | null>({
      mutationKey: `${this.targetType}:${actions[0].targetSystemId}`,
      targetType: this.targetType,
      aggregateId: actions[0].aggregateId,
      operation,
      criteria: {systemId: actions[0].targetSystemId},
      ...(operation === CHANGE_OPERATION.Delete
        ? {}
        : {values: this.sanitizeValues(physicalValues)}),
      executionSlot: executionSlot.data,
    });
  }

  dependencies(
    mutation: PlannedMutation,
    candidates: readonly PlannedMutation[],
  ) {
    return this.dependencyResolver(mutation, candidates);
  }

  private validateAction(action: PendingApplyAction) {
    if (action.targetType !== this.targetType) {
      return IssueFactory.invalidApplyAction(
        action.targetType,
        action.aggregateId,
        action.targetSystemId,
        `Action was dispatched to the ${this.targetType} rule`,
      );
    }
    if (!this.allowedOperations.includes(action.operation)) {
      return IssueFactory.invalidApplyOperation(
        action.targetType,
        action.aggregateId,
        action.targetSystemId,
        action.operation,
      );
    }
    return null;
  }

  private validateActions(actions: readonly PendingApplyAction[]) {
    if (actions.length === 0) {
      return IssueFactory.invalidApplyAction(
        this.targetType,
        0,
        0,
        'Cannot reduce an empty action group',
      );
    }

    for (const action of actions) {
      const issue = this.validateAction(action);
      if (issue !== null) return issue;
      if (action.targetSystemId !== actions[0].targetSystemId) {
        return IssueFactory.invalidApplyAction(
          this.targetType,
          action.aggregateId,
          action.targetSystemId,
          'A rule group contains more than one physical target',
        );
      }
    }
    return null;
  }

  private operationFor(
    createCount: number,
    deleteCount: number,
  ): ChangeOperation {
    if (deleteCount === 1) return CHANGE_OPERATION.Delete;
    if (createCount === 1) return CHANGE_OPERATION.Create;
    return CHANGE_OPERATION.Update;
  }

  private mergeValues(
    createValues: Readonly<Record<string, unknown>> | undefined,
    actions: readonly PendingApplyAction[],
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    if (createValues !== undefined) Object.assign(values, createValues);
    for (const action of actions) {
      if (action.operation === CHANGE_OPERATION.Update) {
        Object.assign(values, action.newValue);
      }
    }
    return values;
  }

  private slotFor(
    operation: ChangeOperation,
    action: PendingApplyAction,
  ): ApplyRuleResult<ExecutionSlot> {
    const slot = this.slots[operation];
    if (slot === undefined) {
      return Result.fail<ExecutionSlot>(
        IssueFactory.invalidApplyOperation(
          action.targetType,
          action.aggregateId,
          action.targetSystemId,
          action.operation,
        ),
      );
    }
    return Result.ok(slot);
  }
}
