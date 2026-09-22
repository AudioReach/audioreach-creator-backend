/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeOperation} from '../../shared/change-vocabulary.js';
import type {Result} from '../../shared/result/result.js';

export type PendingApplyAction = {
  aggregateId: number;
  targetType: string;
  targetSystemId: number;
  operation: ChangeOperation;
  fieldPath: string | null;
  newValue: Readonly<Record<string, unknown>>;
};

export type MutationCriteria = Readonly<
  Record<string, string | number | boolean | null>
>;

export type ExecutionSlot = {
  phase: number;
  step: number;
};

export type PlannedMutation = {
  mutationKey: string;
  targetType: string;
  aggregateId: number;
  operation: ChangeOperation;
  criteria: MutationCriteria;
  values?: Readonly<Record<string, unknown>>;
  executionSlot: ExecutionSlot;
};

export type OperationDependency = {
  beforeTargetType: string;
  beforeMutationKey: string;
  afterTargetType: string;
  afterMutationKey: string;
};

export type ApplyChangesResult = {
  commitId: number;
  appliedEntityCount: number;
  appliedAggregateCount: number;
};

export type ApplyRuleResult<T> = Result<T>;

export interface ApplyRule {
  readonly targetType: string;
  readonly allowedOperations: readonly ChangeOperation[];

  actionSlot(action: PendingApplyAction): ApplyRuleResult<string>;
  mutationKey(action: PendingApplyAction): ApplyRuleResult<string>;
  reduce(
    actions: readonly PendingApplyAction[],
  ): ApplyRuleResult<PlannedMutation | null>;
  dependencies(
    mutation: PlannedMutation,
    candidates: readonly PlannedMutation[],
  ): readonly OperationDependency[];
}

export type ApplyRuleSlots = Partial<
  Readonly<Record<ChangeOperation, ExecutionSlot>>
>;

export type ApplyDependencyResolver = (
  mutation: PlannedMutation,
  candidates: readonly PlannedMutation[],
) => readonly OperationDependency[];

