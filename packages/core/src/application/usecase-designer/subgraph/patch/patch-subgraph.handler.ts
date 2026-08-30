/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {PatchSubgraphCommand} from './patch-subgraph.command.js';

export class PatchSubgraphHandler implements CommandHandler<
  PatchSubgraphCommand,
  {groupId: string}
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: PatchSubgraphCommand): Promise<{groupId: string}> {
    const {session, groupId} = this.uow.getWriteContext();

    const exists = await this.uow
      .getSubgraphRepository()
      .subgraphExists(command.subgraphSystemId, session.fileSystemId);
    if (!exists) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    if (command.name !== undefined) {
      await this.uow
        .getSubgraphRepository()
        .setName(command.subgraphSystemId, command.name);
    }

    return {groupId};
  }
}
