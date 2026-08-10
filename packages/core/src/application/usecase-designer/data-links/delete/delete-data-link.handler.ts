/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DeleteDataLinkCommand} from './delete-data-link.command.js';
import type {DataLinkDto} from '../../usecase/dto/component-collection-dto.js';

export class DeleteDataLinkHandler implements CommandHandler<
  DeleteDataLinkCommand,
  DataLinkDto
> {
  constructor(private readonly uow: UnitOfWork) {}

  handle(_command: DeleteDataLinkCommand): Promise<DataLinkDto> {
    if (this.uow == undefined) throw new Error('Input validation error');
    throw new Error('Not implemented');
  }
}
