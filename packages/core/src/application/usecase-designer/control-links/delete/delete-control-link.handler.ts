/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DeleteControlLinkCommand} from './delete-control-link.command.js';
import type {DeleteControlLinkResult} from '../dto/delete-control-link-result.schema.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ControlLinkDeletionService} from './control-link-deletion.service.js';

export class DeleteControlLinkHandler implements CommandHandler<
  DeleteControlLinkCommand,
  DeleteControlLinkResult
> {
  private readonly deletionService: ControlLinkDeletionService;

  constructor(private readonly uow: UnitOfWork) {
    this.deletionService = new ControlLinkDeletionService(uow);
  }

  async handle(
    command: DeleteControlLinkCommand,
  ): Promise<DeleteControlLinkResult> {
    await this.uow.startTransaction();
    try {
      const fileSystemId = this.uow.getWriteContext().session.fileSystemId;
      const deleted = await this.deletionService.deleteBySystemId(
        command.controlLinkSystemId,
        fileSystemId,
      );
      if (!deleted) {
        throw new ResourceNotFoundException(
          `ControlLink ${command.controlLinkSystemId} was not found.`,
          [
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.ControlLink,
              command.controlLinkSystemId,
            ),
          ],
        );
      }

      await this.uow.commit();
      return deleted;
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
