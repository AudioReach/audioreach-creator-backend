/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {DiscardChangesCommand} from './discard-changes.command.js';
import type {DiscardChangesResult} from './discard-changes.types.js';

export class DiscardChangesHandler implements CommandHandler<
  DiscardChangesCommand,
  DiscardChangesResult
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(_command: DiscardChangesCommand): Promise<DiscardChangesResult> {
    await this.uow.startTransaction();
    try {
      const result = await this.uow.getDiscardChangesPort().discard();
      await this.uow.commit();
      return result;
    } catch (error) {
      if (this.uow.isInTransaction()) {
        await this.uow.rollback();
      }
      throw error;
    }
  }
}
