/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_STATUS,
  DomainRuleViolationException,
  RESULT_KIND,
  type ApplyChangesSummary,
  type WriteContext,
} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {
  ApplyActionSlot,
  ApplyReductionRegistry,
} from './apply-changes.types.js';
import {orderPersistenceOperations} from './apply-execution-order.js';
import type {ApplyExecutionSchedule} from './apply-execution-order.js';
import {mapEditActionRow} from './map-edit-action-row.js';
import {reducePendingActions} from './reduce-pending-actions.js';
import type {TypeOrmOperationExecutor} from './typeorm-operation-executor.js';

type ApplySessionRepository = {
  recordCommit(input: {
    sessionId: number;
    changeCount: number;
  }): Promise<number>;
  deleteAppliedActionHistory(
    sessionId: number,
    slots: readonly ApplyActionSlot[],
  ): Promise<number>;
};

/**
 * Applies current staged actions through QueryRunner-bound persistence
 * services. The core command handler owns the surrounding transaction.
 */
export class TypeOrmApplyChangesService {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly editActions: EditActionsQueryService,
    private readonly reductionRegistry: ApplyReductionRegistry,
    private readonly executionSchedule: ApplyExecutionSchedule,
    private readonly operationExecutor: TypeOrmOperationExecutor,
    private readonly sessionRepository: ApplySessionRepository,
  ) {}

  async apply(): Promise<ApplyChangesSummary> {
    const sessionId = this.writeContext.session.sessionId;

    // Step 1: select only current staged rows and preserve their cleanup slots.
    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });
    const cleanupSlots = uniqueActionSlots(rows);

    // Step 2: map each edit row one-to-one, then reduce it by entity and row.
    const actions = rows.map(row => mapEditActionRow(row));
    const reduction = reducePendingActions(actions, this.reductionRegistry);
    if (reduction.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException(reduction.issues);
    }

    // Step 3: validate metadata and apply the fixed phase-step-sequence order.
    const operations = reduction.data;
    this.operationExecutor.validateOperations(operations);
    const orderedOperations = orderPersistenceOperations(
      operations,
      this.executionSchedule,
    );

    // Step 4: execute each final main-table row write in the resolved order.
    for (const operation of orderedOperations) {
      await this.operationExecutor.execute(operation);
    }

    // Step 5: record the commit and clean selected action history before the
    // core handler commits. Any failure rolls back writes and cleanup together.
    const commitId = await this.sessionRepository.recordCommit({
      sessionId,
      changeCount: orderedOperations.length,
    });
    await this.sessionRepository.deleteAppliedActionHistory(
      sessionId,
      cleanupSlots,
    );

    return {
      commitId,
      appliedEntityCount: orderedOperations.length,
      appliedAggregateCount: new Set(
        orderedOperations.map(operation => operation.aggregateId),
      ).size,
    };
  }
}

/** Deduplicates source slots because several history rows may share one slot. */
function uniqueActionSlots(
  rows: readonly Pick<
    EditActionRow,
    'targetTable' | 'targetSystemId' | 'fieldPath'
  >[],
): readonly ApplyActionSlot[] {
  const slots = new Map<string, ApplyActionSlot>();
  for (const row of rows) {
    const key = `${row.targetTable}\u0000${row.targetSystemId}\u0000${row.fieldPath ?? ''}`;
    slots.set(key, {
      targetTable: row.targetTable,
      targetSystemId: row.targetSystemId,
      fieldPath: row.fieldPath,
    });
  }
  return [...slots.values()];
}
