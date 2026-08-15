/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {PatchSubgraphCommand} from './patch-subgraph.command.js';

export class PatchSubgraphHandler implements CommandHandler<
  PatchSubgraphCommand,
  void
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: PatchSubgraphCommand): Promise<void> {
    throw new Error('PatchSubgraphHandler not implemented yet');
  }
}
