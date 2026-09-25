/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../shared/result/result.js';
import type {Result as ResultType} from '../../../shared/result/result.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {RemoveStaleManualUsecaseEditCommand} from './remove-stale-manual-usecase-edit.command.js';

export class RemoveStaleManualUsecaseEditHandler implements CommandHandler<
  RemoveStaleManualUsecaseEditCommand,
  ResultType<void>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: RemoveStaleManualUsecaseEditCommand,
  ): Promise<ResultType<void>> {
    await this.uow.startTransaction();
    try {
      const sessionId = this.uow.getWriteContext().session.sessionId;
      await this.uow
        .getSessionRepository()
        .deleteEditActionsByChangeIds(sessionId, command.changeIds);
      await this.uow.commit();
      return Result.ok();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
