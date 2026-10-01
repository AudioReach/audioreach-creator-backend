/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ConflictException} from '../../../../shared/exceptions/conflict.exception.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SetSubgraphCommand} from './set-subgraph.command.js';

export class SetSubgraphHandler implements CommandHandler<
  SetSubgraphCommand,
  {groupId: string}
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: SetSubgraphCommand): Promise<{groupId: string}> {
    const {session, groupId} = this.uow.getWriteContext();
    const subgraphRepository = this.uow.getSubgraphRepository();

    const exists = await subgraphRepository.subgraphExists(
      command.subgraphSystemId,
      session.fileSystemId,
    );
    if (!exists) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    if (command.name !== undefined) {
      const nameExists = await subgraphRepository.nameExists(
        command.name,
        session.fileSystemId,
        command.subgraphSystemId,
      );
      if (nameExists) {
        throw new ConflictException(
          `Subgraph name '${command.name}' already exists in this file`,
        );
      }
      await subgraphRepository.rename(command.subgraphSystemId, command.name);
    }

    return {groupId};
  }
}
