/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '@arc/core';
import {ApplyIssueFactory} from './apply-issues.js';
import {mainTableRowIdentityKey} from './apply-changes.types.js';
import type {
  ApplyChangeOperation,
  ReducedMainTableMutation,
} from './apply-changes.types.js';

/**
 * Fixed dependency position assigned to one entity-operation pair.
 *
 * `phase` selects the broad merge stage, `step` orders dependency levels within
 * that stage, and `sequence` orders entities that share a phase and step. Lower
 * values execute first for every field.
 */
export type ApplyExecutionOrder = {
  phase: number;
  step: number;
  sequence: number;
};

/**
 * Maps the key produced by `applyExecutionScheduleKey()` to the fixed execution
 * position for that entity-operation pair. Every mutation emitted by reduction
 * must have exactly one corresponding schedule entry before writes begin.
 */
export type ApplyExecutionSchedule = ReadonlyMap<string, ApplyExecutionOrder>;

/**
 * Combines a permanent entity name and effective mutation operation into the
 * internal schedule key. The null separator prevents ambiguous concatenations;
 * callers must use this function both when building and reading the schedule.
 */
export function applyExecutionScheduleKey(
  entityName: string,
  operation: ApplyChangeOperation,
): string {
  return `${entityName}\u0000${operation}`;
}

/**
 * Resolves the configured dependency position for one reduced mutation using
 * its permanent entity name and effective operation. A missing entry means the
 * target inventory and execution schedule disagree, so the method raises a
 * domain-rule violation before any mutation is executed.
 */
function getExecutionOrder(
  mutation: ReducedMainTableMutation,
  schedule: ApplyExecutionSchedule,
): ApplyExecutionOrder {
  const executionOrder = schedule.get(
    applyExecutionScheduleKey(mutation.target.entityName, mutation.operation),
  );
  if (executionOrder === undefined) {
    throw new DomainRuleViolationException([
      ApplyIssueFactory.invalidTargetMetadata(
        mutation,
        `No execution schedule exists for operation ${mutation.operation}`,
      ),
    ]);
  }
  return executionOrder;
}

/**
 * Compares two configured dependency positions in execution priority order:
 * phase first, then step, then sequence. A zero result means row identity must
 * provide the deterministic tie-breaker.
 */
function compareExecutionOrders(
  left: ApplyExecutionOrder,
  right: ApplyExecutionOrder,
): number {
  return (
    left.phase - right.phase ||
    left.step - right.step ||
    left.sequence - right.sequence
  );
}

/**
 * Provides stable ordering between mutations assigned the same dependency
 * position. This comparison does not express a database dependency; it only
 * makes repeated applies produce the same row order.
 */
function compareRowIdentities(
  left: ReducedMainTableMutation,
  right: ReducedMainTableMutation,
): number {
  return mainTableRowIdentityKey(left.target).localeCompare(
    mainTableRowIdentityKey(right.target),
  );
}

/**
 * Verifies that reducer output can be scheduled safely. Each permanent row may
 * appear only once because its edit actions should already have been folded
 * into one final mutation, and every entity-operation pair must be registered
 * in the supplied schedule. The function validates only and does not alter the
 * mutations.
 */
function validateMutations(
  mutations: readonly ReducedMainTableMutation[],
  schedule: ApplyExecutionSchedule,
): void {
  const identities = new Set<string>();
  for (const mutation of mutations) {
    const identity = mainTableRowIdentityKey(mutation.target);
    if (identities.has(identity)) {
      throw new DomainRuleViolationException([
        ApplyIssueFactory.invalidTargetMetadata(
          mutation,
          'More than one reduced operation targets the same main-table row',
        ),
      ]);
    }
    identities.add(identity);
    getExecutionOrder(mutation, schedule);
  }
}

/**
 * Orders the `ReducedMainTableMutation[]` produced by `ApplyOperationReducer`
 * for sequential execution by `TypeOrmMutationExecutor`.
 *
 * The method first rejects duplicate permanent-row mutations and missing
 * schedule entries. It then copies the input array and sorts that copy by the
 * configured phase, step, and sequence, followed by permanent-row identity for
 * deterministic ties. Mutation objects are returned unchanged, and no
 * dependency graph or runtime relationship resolution is performed.
 */
export function orderMainTableMutations(
  mutations: readonly ReducedMainTableMutation[],
  schedule: ApplyExecutionSchedule,
): readonly ReducedMainTableMutation[] {
  validateMutations(mutations, schedule);
  return [...mutations].sort((left, right) => {
    const orderComparison = compareExecutionOrders(
      getExecutionOrder(left, schedule),
      getExecutionOrder(right, schedule),
    );
    return orderComparison || compareRowIdentities(left, right);
  });
}
