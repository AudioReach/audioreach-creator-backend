/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from '../../../../shared/types/logger.interface.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {ModuleDeletionService} from './module-deletion.service.js';
import type {DeleteSpfModuleCommand} from './delete-spf-module.command.js';

export type DeleteSpfModuleInternalResult = {
  groupId: string;
  response: import('../dto/delete-spf-module-result.schema.js').DeleteSpfModuleResult;
};

export class DeleteSpfModuleHandler implements CommandHandler<
  DeleteSpfModuleCommand,
  DeleteSpfModuleInternalResult
> {
  private readonly deletionService: ModuleDeletionService;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly logger?: Logger,
  ) {
    this.deletionService = new ModuleDeletionService(uow);
  }

  async handle(
    command: DeleteSpfModuleCommand,
  ): Promise<DeleteSpfModuleInternalResult> {
    await this.uow.startTransaction();
    try {
      const fileSystemId = this.uow.getWriteContext().session.fileSystemId;
      const {response, deletedModule} = await this.deletionService.deleteModule(
        command.spfModuleSystemId,
        fileSystemId,
        command.linkDeletionMode,
      );
      await this.uow.commit();
      this.logger?.logInfo({
        msg: `Deleted module '${deletedModule.alias ?? 'unknown'}' (${BinaryUtils.toHexString(deletedModule.systemId)})`,
        description: 'SPF module delete committed.',
        component: 'DeleteSpfModuleHandler',
        tag: 'module-delete',
        timestamp: new Date(),
      });
      return {
        groupId: this.uow.getWriteContext().groupId,
        response,
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      this.logger?.logError({
        msg: `Delete module failed (${BinaryUtils.toHexString(command.spfModuleSystemId)})`,
        description: 'SPF module delete rolled back.',
        component: 'DeleteSpfModuleHandler',
        tag: 'module-delete',
        timestamp: new Date(),
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }
}
