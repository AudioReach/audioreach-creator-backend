/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SetContainerHeapIdCommand} from './set-container-heap-id.command.js';
import type {SetContainerHeapIdResult} from './set-container-heap-id.result.js';
import {
  InvalidInputException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {
  mapToElementData,
  serializeParameterData,
} from '../../shared/serialize-elements.js';
import {
  CONTAINER_HEAP_PROP_ID,
  HEAP_ID_DEFAULT,
  HEAP_ID_LOW_POWER,
} from '../../../../domain/entities/definitions/container/container-property-ids.js';

export class SetContainerHeapIdHandler implements CommandHandler<
  SetContainerHeapIdCommand,
  SetContainerHeapIdResult
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: SetContainerHeapIdCommand,
  ): Promise<SetContainerHeapIdResult> {
    const {session} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;

    if (
      command.heapId !== HEAP_ID_DEFAULT &&
      command.heapId !== HEAP_ID_LOW_POWER
    ) {
      throw new InvalidInputException(
        `Unsupported container heap ID: ${command.heapId}`,
      );
    }

    const containerRepository = this.uow.getContainerRepository();
    const exists = await containerRepository.containerExists(
      command.containerSystemId,
      fileSystemId,
    );
    if (!exists) {
      throw new ResourceNotFoundException(
        `Container ${command.containerSystemId} not found`,
      );
    }

    const propertyDefinition =
      await containerRepository.getPropertyDefinitionByPropertyId(
        fileSystemId,
        CONTAINER_HEAP_PROP_ID,
      );
    if (propertyDefinition === null) {
      throw new ResourceNotFoundException(
        'Container heap property definition not found',
      );
    }

    const serialized = serializeParameterData(
      propertyDefinition,
      mapToElementData([
        {type: 'ConfigElement', value: String(command.heapId)},
      ]),
    );
    if (!serialized.ok) {
      throw new InvalidInputException(serialized.error);
    }

    await this.uow.startTransaction();
    try {
      await containerRepository.setPropertyData(
        command.containerSystemId,
        propertyDefinition.systemId,
        serialized.value,
      );

      const modules = await this.uow
        .getModuleRepository()
        .findModulesByContainerId(command.containerSystemId, fileSystemId);
      await Promise.all(
        modules.map(module =>
          this.uow
            .getModuleRepository()
            .updateHeapId(module.systemId, command.heapId),
        ),
      );
      const updatedModuleHeapIds = modules.map(module => ({
        moduleSystemId: module.systemId,
        heapId: command.heapId,
      }));

      await this.uow.commit();
      return {
        containerSystemId: command.containerSystemId,
        heapId: command.heapId,
        updatedModuleHeapIds,
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
