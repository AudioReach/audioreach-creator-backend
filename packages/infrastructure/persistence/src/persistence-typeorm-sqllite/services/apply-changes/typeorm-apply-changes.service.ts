/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_STATUS,
  orderStagedMutations,
  reduceCurrentActions,
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
    const actions = rows.map(mapEditActionRow);
    const mutations = reduceCurrentActions(actions, this.ruleRegistry);
    const orderedMutations = orderStagedMutations(
      mutations,
      this.ruleRegistry,
    );

    for (const mutation of orderedMutations) {
      await this.operationExecutor.execute(mutation);
    }

    const commitId = await this.sessionRepository.recordCommit({
      sessionId,
      changeCount: orderedMutations.length,
    });
    await this.sessionRepository.cleanupAfterSuccessfulApply(sessionId);

    return {
      commitId,
      appliedEntityCount: orderedMutations.length,
      appliedAggregateCount: new Set(
        orderedMutations.map(mutation => mutation.aggregateId),
      ).size,
    };
  }
}
