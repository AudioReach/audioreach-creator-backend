/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DeleteDataLinkCommand} from './delete-data-link.command.js';
import type {DeleteDataLinkResult} from '../dto/delete-data-link-result.schema.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {DataLinkDeletionService} from './data-link-deletion.service.js';

export class DeleteDataLinkHandler implements CommandHandler<
  DeleteDataLinkCommand,
  DeleteDataLinkResult
> {
  private readonly deletionService: DataLinkDeletionService;

  constructor(private readonly uow: UnitOfWork) {
    this.deletionService = new DataLinkDeletionService(uow);
  }

  async handle(command: DeleteDataLinkCommand): Promise<DeleteDataLinkResult> {
    await this.uow.startTransaction();
    try {
      const fileSystemId = this.uow.getWriteContext().session.fileSystemId;
      const deleted = await this.deletionService.deleteBySystemId(
        command.dataLinkSystemId,
        fileSystemId,
      );
      if (!deleted) {
        throw new ResourceNotFoundException(
          `DataLink ${command.dataLinkSystemId} was not found.`,
          [
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.DataLink,
              command.dataLinkSystemId,
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
