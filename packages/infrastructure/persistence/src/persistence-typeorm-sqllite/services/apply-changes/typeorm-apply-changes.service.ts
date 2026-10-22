/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_STATUS,
  CommitValidationFailedException,
  NoStagedChangesException,
} from '@arc/core';
import type {WriteContext} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {EditActionsQueryFilters} from '../../queries/edit-session/edit-actions-query-service.js';
import type {ReducedEditAction} from './apply-changes.types.js';
import type {ApplyEditActionReducer} from './apply-edit-action-reducer.js';
import {executeReducedEditActionsInFixedOrder} from './fixed-order-executor.js';

type EditActionReader = {
  query(filters: EditActionsQueryFilters): Promise<EditActionRow[]>;
};

type ApplySessionRepository = {
  deleteStagedEditActionsByIds(
    sessionId: number,
    changeIds: readonly number[],
  ): Promise<number>;
  countStagedChangesForSession(sessionId: number): Promise<number>;
};

type FixedExecutor = (
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
) => Promise<void>;

export class TypeOrmApplyChangesService {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly manager: EntityManager,
    private readonly editActions: EditActionReader,
    private readonly reducer: Pick<ApplyEditActionReducer, 'reduce'>,
    private readonly sessionRepository: ApplySessionRepository,
    private readonly execute: FixedExecutor = executeReducedEditActionsInFixedOrder,
  ) {}

  async apply(): Promise<void> {
    const sessionId = this.writeContext.session.sessionId;
    const rows = await this.editActions.query({
      sessionId,
      changeStatus: CHANGE_STATUS.Staged,
    });
    if (rows.length === 0) {
      throw new NoStagedChangesException();
    }

    const selectedChangeIds = [...new Set(rows.map(row => row.changeId))].sort(
      (left, right) => left - right,
    );
    if (selectedChangeIds.length !== rows.length) {
      throw new CommitValidationFailedException(
        'The staged edit-action selection contains duplicate change IDs.',
      );
    }

    // eslint-disable-next-line unicorn/no-array-reduce, unicorn/no-array-callback-reference -- ApplyEditActionReducer.reduce() is the service API.
    const actions = await this.reducer.reduce(rows);
    validateSourceCoverage(selectedChangeIds, actions);
    await this.execute(this.manager, actions);

    const deleted = await this.sessionRepository.deleteStagedEditActionsByIds(
      sessionId,
      selectedChangeIds,
    );
    if (deleted !== selectedChangeIds.length) {
      throw new Error(
        `Expected to delete ${selectedChangeIds.length} staged edit action(s), deleted ${deleted}.`,
      );
    }
    const remaining =
      await this.sessionRepository.countStagedChangesForSession(sessionId);
    if (remaining !== 0) {
      throw new Error(
        `Commit cleanup is incomplete: ${remaining} staged edit action(s) remain.`,
      );
    }
  }
}

function validateSourceCoverage(
  selectedChangeIds: readonly number[],
  actions: readonly ReducedEditAction[],
): void {
  const reducedIds = [
    ...new Set(actions.flatMap(action => action.sourceEditActionIds)),
  ].sort((left, right) => left - right);
  if (
    selectedChangeIds.length !== reducedIds.length ||
    selectedChangeIds.some((changeId, index) => changeId !== reducedIds[index])
  ) {
    throw new CommitValidationFailedException(
      'Reduced actions do not cover the complete staged edit-action selection.',
      {selectedChangeIds, reducedSourceEditActionIds: reducedIds},
    );
  }
}
