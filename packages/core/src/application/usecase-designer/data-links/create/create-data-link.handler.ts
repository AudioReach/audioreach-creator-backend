/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {CreateDataLinkCommand} from './create-data-link.command.js';
import type {UseCaseComponentsReadModel} from '../../../../application/ports/persistence/query-services/usecase/query-models/usecase-components-read-model.js';

export class CreateDataLinkHandler implements CommandHandler<
  CreateDataLinkCommand,
  UseCaseComponentsReadModel
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  handle(_command: CreateDataLinkCommand): Promise<UseCaseComponentsReadModel> {
    if (
      this.uow == undefined ||
      this.queryServices == undefined ||
      this.idGeneration == undefined
    )
      throw new Error('Input validation error');
    throw new Error('Not implemented');
  }
}
