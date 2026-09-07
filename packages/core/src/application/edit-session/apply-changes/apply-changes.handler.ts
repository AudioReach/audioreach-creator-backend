/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import {Result} from '../../shared/result/result.js';
import type {ApplyChangesSummary} from './apply-changes.types.js';
import type {ApplyChangesCommand} from './apply-changes.command.js';

export class ApplyChangesHandler implements CommandHandler<
  ApplyChangesCommand,
  Result<ApplyChangesSummary>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    _command: ApplyChangesCommand,
  ): Promise<Result<ApplyChangesSummary>> {
    await this.uow.startTransaction();
    try {
      const summary = await this.uow.applyChanges();

      // TODO: Run post-apply validation here while the transaction is active.

      await this.uow.commit();
      return Result.ok(summary);
    } catch (error) {
      if (this.uow.isInTransaction()) {
        await this.uow.rollback();
      }
      throw error;
    }
  }
}
