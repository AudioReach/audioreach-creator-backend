/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {DeleteProjectCommand} from './delete-project.command.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';

export class DeleteProjectHandler implements CommandHandler<
  DeleteProjectCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(cmd: DeleteProjectCommand): Promise<void> {
    const exists = await this.uow
      .getProjectRepository()
      .projectExists(cmd.projectId);
    if (!exists) {
      throw new ResourceNotFoundException(
        `Project '${cmd.projectId}' not found.`,
      );
    }

    await this.uow.startTransaction();
    try {
      await this.uow.getProjectRepository().deleteProject(cmd.projectId);
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) {
        await this.uow.rollback();
      }
      throw error;
    }
  }
}
