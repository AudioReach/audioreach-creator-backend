/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateSubgraphContainerIdCommand} from './update-subgraph-container-id.command.js';

export class UpdateSubgraphContainerIdHandler implements CommandHandler<
  UpdateSubgraphContainerIdCommand,
  void
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: UpdateSubgraphContainerIdCommand): Promise<void> {
    throw new Error('UpdateSubgraphContainerIdHandler not implemented yet');
  }
}
