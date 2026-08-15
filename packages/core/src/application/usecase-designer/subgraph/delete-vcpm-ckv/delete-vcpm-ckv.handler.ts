/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DeleteVcpmCkvCommand} from './delete-vcpm-ckv.command.js';

export class DeleteVcpmCkvHandler implements CommandHandler<
  DeleteVcpmCkvCommand,
  void
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: DeleteVcpmCkvCommand): Promise<void> {
    throw new Error('DeleteVcpmCkvHandler not implemented yet');
  }
}
