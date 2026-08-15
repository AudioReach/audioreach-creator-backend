/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateVcpmCalDataCommand} from './update-vcpm-cal-data.command.js';

export class UpdateVcpmCalDataHandler implements CommandHandler<
  UpdateVcpmCalDataCommand,
  void
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: UpdateVcpmCalDataCommand): Promise<void> {
    throw new Error('UpdateVcpmCalDataHandler not implemented yet');
  }
}
