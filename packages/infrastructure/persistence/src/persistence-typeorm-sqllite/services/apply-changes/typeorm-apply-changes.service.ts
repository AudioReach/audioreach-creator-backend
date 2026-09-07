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
import {orderMainTableMutations} from './apply-execution-order.js';
import type {ApplyExecutionSchedule} from './apply-execution-order.js';
import type {ApplyOperationReducer} from './apply-operation-reducer.js';
import type {TypeOrmMutationExecutor} from './typeorm-mutation-executor.js';

type ApplySessionRepository = {
  recordCommit(input: {
    sessionId: number;
    changeCount: number;
  }): Promise<number>;
  deleteAppliedActionHistory(
    sessionId: number,
    rows: readonly EditActionRow[],
  ): Promise<number>;
};

export class TypeOrmApplyChangesService {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly editActions: EditActionsQueryService,
    private readonly operationReducer: ApplyOperationReducer,
    private readonly executionSchedule: ApplyExecutionSchedule,
    private readonly mutationExecutor: TypeOrmMutationExecutor,
    private readonly sessionRepository: ApplySessionRepository,
  ) {}

  async apply(): Promise<ApplyChangesSummary> {
    const sessionId = this.writeContext.session.sessionId;

    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });

    // eslint-disable-next-line unicorn/no-array-reduce, unicorn/no-array-callback-reference -- ApplyOperationReducer.reduce() is the LLD-required API, not Array.reduce().
    const reductionResult = this.operationReducer.reduce(rows);
    if (reductionResult.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException(reductionResult.issues);
    }
    const mutations = reductionResult.data;

    this.mutationExecutor.validateMutations(mutations);
    const orderedMutations = orderMainTableMutations(
      mutations,
      this.executionSchedule,
    );

    for (const mutation of orderedMutations) {
      await this.mutationExecutor.execute(mutation);
    }

    const commitId = await this.sessionRepository.recordCommit({
      sessionId,
      changeCount: orderedMutations.length,
    });

    await this.sessionRepository.deleteAppliedActionHistory(sessionId, rows);

    return {
      commitId,
      appliedEntityCount: orderedMutations.length,
      appliedAggregateCount: countDistinctAggregateIds(orderedMutations),
    };
  }
}

function countDistinctAggregateIds(
  mutations: readonly Pick<EditActionRow, 'aggregateId'>[],
): number {
  return new Set(mutations.map(mutation => mutation.aggregateId)).size;
}
