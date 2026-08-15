/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateSubgraphVsidCommand} from './update-subgraph-vsid.command.js';
import type {VsidUpdateDto} from '../dto/subgraph-write-result-types.js';

export class UpdateSubgraphVsidHandler implements CommandHandler<
  UpdateSubgraphVsidCommand,
  VsidUpdateDto
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: UpdateSubgraphVsidCommand): Promise<VsidUpdateDto> {
    throw new Error('UpdateSubgraphVsidHandler not implemented yet');
  }
}
