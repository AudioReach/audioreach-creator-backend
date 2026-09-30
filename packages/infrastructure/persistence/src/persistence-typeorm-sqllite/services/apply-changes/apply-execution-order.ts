/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '@arc/core';
import {ApplyIssueFactory} from './apply-issues.js';
import {mainTableRowIdentityKey} from './apply-changes.types.js';
import type {
  ApplyChangeOperation,
  MainTableEntityWriteOperation,
} from './apply-changes.types.js';

/** Complete hardcoded position assigned to an entity-operation pair. */
export type ApplyExecutionOrder = {
  phase: number;
  step: number;
  sequence: number;
};

/** Maps each supported entity-operation pair to its fixed execution position. */
export type ApplyExecutionSchedule = ReadonlyMap<string, ApplyExecutionOrder>;

/** Builds the schedule lookup key for one entity-operation pair. */
export function applyExecutionScheduleKey(
  entityName: string,
  operation: ApplyChangeOperation,
): string {
  return `${entityName}\u0000${operation}`;
}

/** Resolves and validates the hardcoded order for one reduced row operation. */
function getExecutionOrder(
  operation: MainTableEntityWriteOperation,
  schedule: ApplyExecutionSchedule,
): ApplyExecutionOrder {
  const executionOrder = schedule.get(
    applyExecutionScheduleKey(operation.target.entityName, operation.operation),
  );
  if (executionOrder === undefined) {
    throw new DomainRuleViolationException([
      ApplyIssueFactory.invalidTargetMetadata(
        operation,
        `No execution schedule exists for operation ${operation.operation}`,
      ),
    ]);
  }
  return executionOrder;
}

/** Compares the complete phase, step, and sequence tuple. */
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

/** Provides deterministic ordering for rows sharing one entity-operation. */
function compareRowIdentities(
  left: MainTableEntityWriteOperation,
  right: MainTableEntityWriteOperation,
): number {
  return mainTableRowIdentityKey(left.target).localeCompare(
    mainTableRowIdentityKey(right.target),
  );
}

/** Rejects duplicate writes and missing schedule entries before execution. */
function validateOperations(
  operations: readonly MainTableEntityWriteOperation[],
  schedule: ApplyExecutionSchedule,
): void {
  const identities = new Set<string>();
  for (const operation of operations) {
    const identity = mainTableRowIdentityKey(operation.target);
    if (identities.has(identity)) {
      throw new DomainRuleViolationException([
        ApplyIssueFactory.invalidTargetMetadata(
          operation,
          'More than one reduced operation targets the same main-table row',
        ),
      ]);
    }
    identities.add(identity);
    getExecutionOrder(operation, schedule);
  }
}

/**
 * Orders final row writes by the complete hardcoded entity-operation schedule.
 * No dependency graph or runtime relationship resolution is performed.
 */
export function orderPersistenceOperations(
  operations: readonly MainTableEntityWriteOperation[],
  schedule: ApplyExecutionSchedule,
): readonly MainTableEntityWriteOperation[] {
  // Step 1: validate every row write and its schedule registration.
  validateOperations(operations, schedule);
  // Step 2: apply the hardcoded order, then a deterministic row tie-breaker.
  return [...operations].sort((left, right) => {
    const orderComparison = compareExecutionOrders(
      getExecutionOrder(left, schedule),
      getExecutionOrder(right, schedule),
    );
    return orderComparison || compareRowIdentities(left, right);
  });
}
