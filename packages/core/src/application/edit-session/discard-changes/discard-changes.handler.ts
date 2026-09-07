/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import {Result} from '../../shared/result/result.js';
import type {DiscardChangesCommand} from './discard-changes.command.js';
import type {DiscardChangesSummary} from './discard-changes.types.js';

export class DiscardChangesHandler implements CommandHandler<
  DiscardChangesCommand,
  Result<DiscardChangesSummary>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    _command: DiscardChangesCommand,
  ): Promise<Result<DiscardChangesSummary>> {
    await this.uow.startTransaction();
    try {
      const summary = await this.uow.discardChanges();
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
