/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateContainerPropertyCommand} from './update-container-property.command.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import {
  mapToElementData,
  serializeParameterData,
} from '../../shared/serialize-elements.js';
import {BinaryDataReader} from '../../shared/utils/binary-data-reader.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {validateModuleCapabilityIntersection} from '../patch-property/validate-module-capability-intersection.js';
import {
  CONTAINER_CAPABILITY_PROP_ID,
  CONTAINER_HEAP_PROP_ID,
  HEAP_ID_LOW_POWER,
} from '../container-property-ids/container-property-ids.js';

export class UpdateContainerPropertyHandler implements CommandHandler<
  UpdateContainerPropertyCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: UpdateContainerPropertyCommand): Promise<void> {
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
      .getPropertyDefinitionsRepository()
      .findContainerPropertyDefinition(command.propertySystemId, fileSystemId);
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
      throw new InvalidOperationException(serialized.error);
    }
    const payload = serialized.value;

    // Step 4: capability list — validate module/capability intersection before writing
    if (propDef.propertyId === CONTAINER_CAPABILITY_PROP_ID) {
      const reader = new BinaryDataReader(payload);
      const count = reader.readUInt32();
      const capabilityIds = Array.from({length: count}, () =>
        reader.readUInt32(),
      );
      const modules = await this.uow
        .getModuleRepository()
        .getModulesByContainerId(command.containerSystemId, fileSystemId);
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
      if (propDef.propertyId === CONTAINER_HEAP_PROP_ID) {
        const heapId = new BinaryDataReader(payload).readUInt32();
        if (heapId === HEAP_ID_LOW_POWER) {
          const modules = await this.uow
            .getModuleRepository()
            .getModulesByContainerId(command.containerSystemId, fileSystemId);
          if (modules.length > 0) {
            // Promise.all is safe: all writes share the same QueryRunner (same connection,
            // same transaction). SQLite serialises DB writes at the connection level.
            await Promise.all(
              modules.map(mod =>
                this.uow
                  .getModuleRepository()
                  .updateHeapId(mod.moduleSystemId, heapId),
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
