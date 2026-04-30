/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {AcknowledgeDataLossCommand} from './acknowledge-data-loss.command.js';
import {FILE_OPEN_STATUS} from '../../../domain/entities/usecase-data/project/arc-db-file.js';

/**
 * Handles AcknowledgeDataLossCommand.
 * Clears all stored DATA_LOSS issues and sets open_status to READY.
 * Called when the user accepts remaining data loss via POST /acknowledge-data-loss.
 * (REST endpoint deferred — see design doc section 9.1)
 */
export class AcknowledgeDataLossHandler implements CommandHandler<
  AcknowledgeDataLossCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: AcknowledgeDataLossCommand): Promise<void> {
    const repo = this.uow.getProjectRepository();
    await repo.updateFileStatus(
      command.fileSystemId,
      FILE_OPEN_STATUS.Ready,
      [],
    );
  }
}
