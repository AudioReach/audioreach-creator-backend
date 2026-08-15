/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateContainerPropertyCommand} from './update-container-property.command.js';

export class UpdateContainerPropertyHandler implements CommandHandler<
  UpdateContainerPropertyCommand,
  void
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: UpdateContainerPropertyCommand): Promise<void> {
    throw new Error('UpdateContainerPropertyHandler not implemented yet');
  }
}
