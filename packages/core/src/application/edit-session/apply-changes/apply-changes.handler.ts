/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {ApplyChangesResult} from './apply-changes.types.js';
import type {ApplyChangesCommand} from './apply-changes.command.js';

export class ApplyChangesHandler
  implements CommandHandler<ApplyChangesCommand, ApplyChangesResult>
{
  constructor(private readonly uow: UnitOfWork) {}

  async handle(_command: ApplyChangesCommand): Promise<ApplyChangesResult> {
    await this.uow.startTransaction();
    try {
      const result = await this.uow.getApplyChangesPort().apply();
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
