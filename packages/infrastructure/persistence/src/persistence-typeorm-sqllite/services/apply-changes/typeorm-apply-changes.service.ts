/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_STATUS,
  orderStagedMutations,
  reduceCurrentActions,
  type ApplyActionSlot,
  type ApplyChangesPort,
  type ApplyChangesResult,
  type ApplyRuleRegistry,
  type ISessionRepository,
  type WriteContext,
} from '@arc/core';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {mapEditActionRow} from './map-edit-action-row.js';
import type {TypeOrmOperationExecutor} from './typeorm-operation-executor.js';

/**
 * Applies the current staged edit set through the QueryRunner-bound services.
 * The command handler owns the surrounding transaction and rollback policy.
 */
export class TypeOrmApplyChangesService implements ApplyChangesPort {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly editActions: EditActionsQueryService,
    private readonly ruleRegistry: ApplyRuleRegistry,
    private readonly operationExecutor: TypeOrmOperationExecutor,
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async apply(): Promise<ApplyChangesResult> {
    const sessionId = this.writeContext.session.sessionId;
    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });

    const cleanupSlots = uniqueActionSlots(rows);
    const actions = rows.map(row => mapEditActionRow(row));
    const mutations = reduceCurrentActions(actions, this.ruleRegistry);
    const orderedMutations = orderStagedMutations(mutations, this.ruleRegistry);

    for (const mutation of orderedMutations) {
      await this.operationExecutor.execute(mutation);
    }

    const commitId = await this.sessionRepository.recordCommit({
      sessionId,
      changeCount: orderedMutations.length,
    });
    // Cleanup is deliberately before the handler commits. If deleting current
    // rows or their older versions fails, the physical writes and commit row
    // must roll back with the edit-action cleanup.
    await this.sessionRepository.deleteAppliedActionHistory(
      sessionId,
      cleanupSlots,
    );

    return {
      commitId,
      appliedEntityCount: orderedMutations.length,
      appliedAggregateCount: new Set(
        orderedMutations.map(mutation => mutation.aggregateId),
      ).size,
    };
  }
}

function uniqueActionSlots(
  rows: readonly {
    targetTable: string;
    targetSystemId: number;
    fieldPath: string | null;
  }[],
): readonly ApplyActionSlot[] {
  const slots = new Map<string, ApplyActionSlot>();
  for (const row of rows) {
    const key = `${row.targetTable}\u0000${row.targetSystemId}\u0000${row.fieldPath ?? ''}`;
    slots.set(key, {
      targetType: row.targetTable,
      targetSystemId: row.targetSystemId,
      fieldPath: row.fieldPath,
    });
  }
  return [...slots.values()];
}
