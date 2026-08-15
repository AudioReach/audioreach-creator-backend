/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateSubgraphScenarioCommand} from './update-subgraph-scenario.command.js';
import type {ScenarioChangeDto} from '../dto/subgraph-write-result-types.js';

export class UpdateSubgraphScenarioHandler implements CommandHandler<
  UpdateSubgraphScenarioCommand,
  ScenarioChangeDto
> {
  constructor(_uow: UnitOfWork) {}

  handle(_command: UpdateSubgraphScenarioCommand): Promise<ScenarioChangeDto> {
    throw new Error('UpdateSubgraphScenarioHandler not implemented yet');
  }
}
