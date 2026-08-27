/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {UpdateProjectCommand} from './update-project.command.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../shared/exceptions/invalid-operation.exception.js';

export class UpdateProjectHandler implements CommandHandler<
  UpdateProjectCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(cmd: UpdateProjectCommand): Promise<void> {
    if (cmd.name === undefined && cmd.description === undefined) {
      throw new InvalidOperationException(
        'At least one of name or description must be provided.',
      );
    }

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
      const updates: {name?: string; description?: string} = {};
      if (cmd.name !== undefined) updates.name = cmd.name;
      if (cmd.description !== undefined) updates.description = cmd.description;

      await this.uow
        .getProjectRepository()
        .updateProject(cmd.projectId, updates);
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) {
        await this.uow.rollback();
      }
      throw error;
    }
  }
}
