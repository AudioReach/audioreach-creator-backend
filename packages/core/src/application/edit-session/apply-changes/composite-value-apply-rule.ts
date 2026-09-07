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
  ExecutionSlot,
  PendingApplyAction,
  PlannedMutation,
} from './apply-changes.types.js';

export type CompositeValueApplyRuleConfig = {
  targetType: string;
  parentKey: string;
  createSlot: ExecutionSlot;
  deleteSlot: ExecutionSlot;
  dependencies?: ApplyDependencyResolver;
};

type CompositeIdentity = {
  parentSystemId: number;
  valueDefSystemId: number;
  criteria: Readonly<Record<string, number>>;
};

export function compositeValueFieldPath(valueDefSystemId: number): string {
  return `$key:valueDefSystemId=${String(valueDefSystemId)}`;
}

export class CompositeValueApplyRule implements ApplyRule {
  readonly allowedOperations: readonly ChangeOperation[] = [
    CHANGE_OPERATION.Create,
    CHANGE_OPERATION.Delete,
  ];

  readonly targetType: string;
  private readonly parentKey: string;
  private readonly createSlot: ExecutionSlot;
  private readonly deleteSlot: ExecutionSlot;
  private readonly dependencyResolver: ApplyDependencyResolver;

  constructor(config: CompositeValueApplyRuleConfig) {
    this.targetType = config.targetType;
    this.parentKey = config.parentKey;
    this.createSlot = config.createSlot;
    this.deleteSlot = config.deleteSlot;
    this.dependencyResolver = config.dependencies ?? (() => []);
  }

  actionSlot(action: PendingApplyAction): ApplyRuleResult<string> {
    const identity = this.identity(action);
    if (identity.kind !== RESULT_KIND.Ok) {
      return Result.fail<string>(...identity.issues);
    }
    return Result.ok(
      `${this.targetType}:${identity.data.parentSystemId}:${identity.data.valueDefSystemId}`,
    );
  }

  mutationKey(action: PendingApplyAction): ApplyRuleResult<string> {
    return this.actionSlot(action);
  }

  reduce(
    actions: readonly PendingApplyAction[],
  ): ApplyRuleResult<PlannedMutation | null> {
    if (actions.length === 0) {
      return Result.fail<PlannedMutation | null>(
        IssueFactory.invalidApplyAction(
          this.targetType,
          0,
          0,
          'Cannot reduce an empty action group',
        ),
      );
    }

    const identities: CompositeIdentity[] = [];
    for (const action of actions) {
      const identity = this.identity(action);
      if (identity.kind !== RESULT_KIND.Ok) {
        return Result.fail<PlannedMutation | null>(...identity.issues);
      }
      identities.push(identity.data);
    }
    const first = identities[0];
    if (
      identities.some(
        identity =>
          identity.parentSystemId !== first.parentSystemId ||
          identity.valueDefSystemId !== first.valueDefSystemId,
      )
    ) {
      return Result.fail<PlannedMutation | null>(
        IssueFactory.invalidApplyAction(
          this.targetType,
          actions[0].aggregateId,
          actions[0].targetSystemId,
          'A rule group contains more than one composite target',
        ),
      );
    }

    const create = actions.find(
      action => action.operation === CHANGE_OPERATION.Create,
    );
    const deleteAction = actions.find(
      action => action.operation === CHANGE_OPERATION.Delete,
    );
    if (create !== undefined && deleteAction !== undefined) {
      return Result.ok<PlannedMutation | null>(null);
    }
    if (actions.length !== 1) {
      return Result.fail<PlannedMutation | null>(
        IssueFactory.invalidApplyAction(
          this.targetType,
          actions[0].aggregateId,
          actions[0].targetSystemId,
          'A composite target has duplicate actions',
        ),
      );
    }

    const operation = actions[0].operation;
    return Result.ok<PlannedMutation | null>({
      mutationKey: `${this.targetType}:${first.parentSystemId}:${first.valueDefSystemId}`,
      targetType: this.targetType,
      aggregateId: actions[0].aggregateId,
      operation,
      criteria: first.criteria,
      ...(operation === CHANGE_OPERATION.Create
        ? {values: first.criteria}
        : {}),
      executionSlot:
        operation === CHANGE_OPERATION.Create
          ? this.createSlot
          : this.deleteSlot,
    });
  }

  dependencies(
    mutation: PlannedMutation,
    candidates: readonly PlannedMutation[],
  ) {
    return this.dependencyResolver(mutation, candidates);
  }

  private identity(
    action: PendingApplyAction,
  ): ApplyRuleResult<CompositeIdentity> {
    if (action.targetType !== this.targetType) {
      return Result.fail<CompositeIdentity>(
        IssueFactory.invalidApplyAction(
          action.targetType,
          action.aggregateId,
          action.targetSystemId,
          `Action was dispatched to the ${this.targetType} rule`,
        ),
      );
    }
    if (!this.allowedOperations.includes(action.operation)) {
      return Result.fail<CompositeIdentity>(
        IssueFactory.invalidApplyOperation(
          action.targetType,
          action.aggregateId,
          action.targetSystemId,
          action.operation,
        ),
      );
    }

    const parentSystemId = action.newValue[this.parentKey];
    const valueDefSystemId = action.newValue.valueDefSystemId;
    if (
      typeof parentSystemId !== 'number' ||
      typeof valueDefSystemId !== 'number' ||
      !Number.isInteger(parentSystemId) ||
      !Number.isInteger(valueDefSystemId) ||
      parentSystemId !== action.targetSystemId
    ) {
      return Result.fail<CompositeIdentity>(
        IssueFactory.invalidApplySpecialKey(
          action.targetType,
          action.aggregateId,
          action.targetSystemId,
          this.parentKey,
        ),
      );
    }

    const expectedFieldPath = compositeValueFieldPath(valueDefSystemId);
    if (action.fieldPath !== expectedFieldPath) {
      return Result.fail<CompositeIdentity>(
        IssueFactory.invalidApplySpecialKey(
          action.targetType,
          action.aggregateId,
          action.targetSystemId,
          `fieldPath must be ${expectedFieldPath}`,
        ),
      );
    }

    return Result.ok<CompositeIdentity>({
      parentSystemId,
      valueDefSystemId,
      criteria: {
        [this.parentKey]: parentSystemId,
        valueDefSystemId,
      },
    });
  }
}
