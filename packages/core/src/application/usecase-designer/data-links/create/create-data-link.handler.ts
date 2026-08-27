/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {CreateDataLinkCommand} from './create-data-link.command.js';
import type {ComponentCollectionDto} from '../../usecase/dto/component-collection-dto.js';

export class CreateDataLinkHandler implements CommandHandler<
  CreateDataLinkCommand,
  ComponentCollectionDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  handle(_command: CreateDataLinkCommand): Promise<ComponentCollectionDto> {
    if (this.uow == undefined || this.idGeneration == undefined)
      throw new Error('Input validation error');
    throw new Error('Not implemented');
  }
}
