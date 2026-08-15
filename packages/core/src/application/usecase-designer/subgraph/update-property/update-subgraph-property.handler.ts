/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateSubgraphPropertyCommand} from './update-subgraph-property.command.js';

export class UpdateSubgraphPropertyHandler implements CommandHandler<
  UpdateSubgraphPropertyCommand,
  void
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: UpdateSubgraphPropertyCommand): Promise<void> {
    throw new Error('UpdateSubgraphPropertyHandler not implemented yet');
  }
}
