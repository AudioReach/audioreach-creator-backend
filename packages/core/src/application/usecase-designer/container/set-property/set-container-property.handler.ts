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
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import {
  mapToElementData,
  serializeParameterData,
} from '../../shared/serialize-elements.js';
import {validateModuleCapabilityIntersection} from './validate-module-capability-intersection.js';
import {
  CONTAINER_PROP_ID_CAPABILITY_LIST,
  CONTAINER_HEAP_PROP_ID,
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

    // Step 3: reserved property guard
    // Container Heap has a dedicated endpoint because changing it also
    // changes the heap ID of every module in the container.
    if (propDef.naturalId === CONTAINER_HEAP_PROP_ID) {
      throw new InvalidOperationException(
        `Property ${propDef.name} is reserved and cannot be replaced through the generic property operation.`,
      );
    }

    // Step 4: serialize elements → Uint8Array
    // serializeParameterData reads dataType/min/max from elementsStructure (def),
    // not from the input elements — only input.type and input.value are accessed.
    // ParameterElementSummaryDto ({type, name, value}) is sufficient at runtime.
    const serialized = serializeParameterData(
      propDef,
      mapToElementData(command.elements),
    );
    if (!serialized.ok) {
      throw new InvalidInputException(serialized.error);
    }
    const payload = serialized.value;

    // Step 5: capability list — validate module/capability intersection before writing
    if (propDef.naturalId === CONTAINER_PROP_ID_CAPABILITY_LIST) {
      // Serialization above has already validated and normalized these UInt32 values.
      const values = command.elements.map(element => Number(element.value));
      const count = values[0] ?? 0;
      const capabilityIds = values.slice(1, count + 1);
      const modules = await this.uow
        .getModuleRepository()
        .findModulesByContainerId(command.containerSystemId, fileSystemId);
      const definitionSystemIds = [
        ...new Set(modules.map(module => module.definitionSystemId)),
      ];
      const definitions = await this.uow
        .getModuleDefinitionRepository()
        .findBySystemIds(definitionSystemIds, fileSystemId);
      const definitionsBySystemId = new Map(
        definitions.map(definition => [definition.systemId, definition]),
      );
      const missingDefinitionSystemIds = definitionSystemIds.filter(
        definitionSystemId => !definitionsBySystemId.has(definitionSystemId),
      );
      if (missingDefinitionSystemIds.length > 0) {
        throw new ResourceNotFoundException(
          `Module definition ${missingDefinitionSystemIds.join(', ')} not found`,
        );
      }
      const moduleDefinitions = modules.map(
        module => definitionsBySystemId.get(module.definitionSystemId)!,
      );
      // throws DomainRuleViolationException listing failing displayNames → HTTP 422
      validateModuleCapabilityIntersection(moduleDefinitions, capabilityIds);
    }

    // Step 6: write container property
    await this.uow.startTransaction();
    try {
      await this.uow
        .getContainerRepository()
        .setPropertyData(
          command.containerSystemId,
          command.propertySystemId,
          payload,
        );

      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
