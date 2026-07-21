/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {ControlLinkReadModel} from '../../../ports/persistence/query-services/link/control-link-read-model.js';
import type {DeleteControlLinkCommand} from './delete-control-link.command.js';

export class DeleteControlLinkHandler implements CommandHandler<
  DeleteControlLinkCommand,
  ControlLinkReadModel
> {
  constructor(private readonly uow: UnitOfWork) {}

  handle(_command: DeleteControlLinkCommand): Promise<ControlLinkReadModel> {
    if (this.uow == undefined) throw new Error('Input validation error');
    throw new Error('Not implemented');
  }
}
