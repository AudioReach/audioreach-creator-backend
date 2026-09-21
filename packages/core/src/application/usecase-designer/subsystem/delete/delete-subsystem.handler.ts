/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  DomainRuleViolationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {DeleteSubsystemCommand} from './delete-subsystem.command.js';

export type DeleteSubsystemResult = {
  groupId: string;
  deletedSubsystemSnapshot: {
    systemId: number;
    naturalId: number;
    name: string;
    parentSystemId: number | null;
  };
};

export class DeleteSubsystemHandler implements CommandHandler<
  DeleteSubsystemCommand,
  DeleteSubsystemResult
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: DeleteSubsystemCommand,
  ): Promise<DeleteSubsystemResult> {
    await this.uow.startTransaction();
    try {
      const subsystems = await this.uow
        .getSubsystemRepository()
        .getSubsystems(command.fileSystemId);
      const subsystem = subsystems.find(
        item => item.systemId === command.subsystemSystemId,
      );
      if (!subsystem) {
        throw new ResourceNotFoundException(
          `Subsystem ${command.subsystemSystemId} not found.`,
          [
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.Subsystem,
              command.subsystemSystemId,
            ),
          ],
        );
      }

      const hasChildren =
        subsystem.moduleSystemIds.length > 0 ||
        subsystem.subsystemSystemIds.length > 0;
      if (hasChildren) {
        throw new DomainRuleViolationException([
          IssueFactory.subsystemNotEmpty(command.subsystemSystemId),
        ]);
      }

      await this.uow
        .getSubsystemRepository()
        .deleteSubsystem(command.subsystemSystemId);
      await this.uow.commit();

      return {
        groupId: this.uow.getWriteContext().groupId,
        deletedSubsystemSnapshot: {
          systemId: subsystem.systemId,
          naturalId: subsystem.naturalId,
          name: subsystem.name,
          parentSystemId: subsystem.parentSystemId,
        },
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
