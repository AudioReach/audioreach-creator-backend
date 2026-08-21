/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SetContainerPropertyCommand} from './set-container-property.command.js';
import {
  ResourceNotFoundException,
  InvalidInputException,
} from '../../../../shared/exceptions/index.js';
import {
  mapToElementData,
  serializeParameterData,
} from '../../shared/serialize-elements.js';
import {BinaryDataReader} from '../../shared/utils/binary-data-reader.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {validateModuleCapabilityIntersection} from './validate-module-capability-intersection.js';
import {
  CONTAINER_PROP_ID_CAPABILITY_LIST,
  CONTAINER_HEAP_PROP_ID,
  HEAP_ID_LOW_POWER,
} from '../../../../domain/entities/definitions/container/container-property-ids.js';

export class SetContainerPropertyHandler implements CommandHandler<
  SetContainerPropertyCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: SetContainerPropertyCommand): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;

    // Step 1: validate container exists
    const exists = await this.uow
      .getContainerRepository()
      .containerExists(command.containerSystemId, fileSystemId);
    if (!exists) {
      throw new ResourceNotFoundException(
        `Container ${command.containerSystemId} not found`,
      );
    }

    // Step 2: fetch property definition with elementsStructure
    const propDef = await this.uow
      .getContainerRepository()
      .getPropertyDefinitionBySystemId(fileSystemId, command.propertySystemId);
    if (propDef === null) {
      throw new ResourceNotFoundException(
        `Property definition ${command.propertySystemId} not found`,
      );
    }

    // Step 3: serialize elements → Uint8Array
    const paramDef: ParameterDefinitionBase = {
      systemId: propDef.systemId,
      isReadOnly: false,
      elementsStructure: propDef.elementsStructure,
    };
    // serializeParameterData reads dataType/min/max from elementsStructure (def),
    // not from the input elements — only input.type and input.value are accessed.
    // ParameterElementSummaryDto ({type, name, value}) is sufficient at runtime.
    const serialized = serializeParameterData(
      paramDef,
      mapToElementData(command.elements),
    );
    if (!serialized.ok) {
      throw new InvalidInputException(serialized.error);
    }
    const payload = serialized.value;

    // Step 4: capability list — validate module/capability intersection before writing
    if (propDef.naturalId === CONTAINER_PROP_ID_CAPABILITY_LIST) {
      const reader = new BinaryDataReader(payload);
      const count = reader.readUInt32();
      const capabilityIds = Array.from({length: count}, () =>
        reader.readUInt32(),
      );
      const modules = await this.uow
        .getModuleRepository()
        .findModuleDefinitionInfoByContainerId(
          command.containerSystemId,
          fileSystemId,
        );
      // throws DomainRuleViolationException listing failing displayNames → HTTP 422
      validateModuleCapabilityIntersection(modules, capabilityIds);
    }

    // Step 5 + 6: write container property and heap cascade — one transaction
    await this.uow.startTransaction();
    try {
      // Step 5: write container property
      await this.uow
        .getContainerRepository()
        .setPropertyData(
          command.containerSystemId,
          command.propertySystemId,
          payload,
        );

      // Step 6: heap cascade — only fires for Low Power; Default leaves modules as-is
      if (propDef.naturalId === CONTAINER_HEAP_PROP_ID) {
        const heapId = new BinaryDataReader(payload).readUInt32();
        if (heapId === HEAP_ID_LOW_POWER) {
          const modules = await this.uow
            .getModuleRepository()
            .findModulesByContainerId(command.containerSystemId, fileSystemId);
          if (modules.length > 0) {
            // Promise.all is safe: all writes share the same QueryRunner (same connection,
            // same transaction). SQLite serialises DB writes at the connection level.
            await Promise.all(
              modules.map(mod =>
                this.uow
                  .getModuleRepository()
                  .updateHeapId(mod.systemId, heapId),
              ),
            );
          }
        }
      }

      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
