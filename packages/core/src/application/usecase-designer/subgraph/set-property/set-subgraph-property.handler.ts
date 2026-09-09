/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidInputException} from '../../../../shared/exceptions/invalid-input.exception.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_VSID,
} from '../../../../domain/entities/definitions/subgraph/subgraph-ids.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SetSubgraphPropertyCommand} from './set-subgraph-property.command.js';

export class SetSubgraphPropertyHandler implements CommandHandler<
  SetSubgraphPropertyCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: SetSubgraphPropertyCommand): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const subgraphRepository = this.uow.getSubgraphRepository();

    const exists = await subgraphRepository.subgraphExists(
      command.subgraphSystemId,
      session.fileSystemId,
    );
    if (!exists) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const propertyDefinitions = await subgraphRepository.getPropertyDefinitions(
      session.fileSystemId,
    );
    const propDef = propertyDefinitions.find(
      definition => definition.systemId === command.propertySystemId,
    );
    if (!propDef) {
      throw new ResourceNotFoundException(
        `Property definition ${command.propertySystemId} not found`,
      );
    }

    if (
      propDef.naturalId === SUB_GRAPH_PROP_ID_SCENARIO_ID ||
      propDef.naturalId === SUB_GRAPH_PROP_ID_VSID
    ) {
      throw new InvalidOperationException(
        `Property ${propDef.name} is reserved and cannot be replaced through the generic property operation.`,
      );
    }

    const serialized = serializeParameterData(
      {
        systemId: propDef.systemId,
        elementsStructure: propDef.elementsStructure,
      },
      command.elements as unknown as ElementData[],
    );
    if (!serialized.ok) {
      throw new InvalidInputException(serialized.error);
    }

    await subgraphRepository.setPropertyData(
      command.subgraphSystemId,
      command.propertySystemId,
      serialized.value,
    );
  }
}
