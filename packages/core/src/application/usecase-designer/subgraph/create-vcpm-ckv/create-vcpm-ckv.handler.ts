/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {CreateVcpmCkvCommand} from './create-vcpm-ckv.command.js';
import type {CreateVcpmCkvDto} from '../dto/subgraph-write-result-types.js';

export class CreateVcpmCkvHandler implements CommandHandler<
  CreateVcpmCkvCommand,
  CreateVcpmCkvDto
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: CreateVcpmCkvCommand): Promise<CreateVcpmCkvDto> {
    throw new Error('CreateVcpmCkvHandler not implemented yet');
  }
}
