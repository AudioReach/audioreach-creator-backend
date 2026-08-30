/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import type {ElementData as ElementCalData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_VSID,
} from '../../../file-operations/shared/constants/spf-ids.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {UpdateSubgraphPropertyCommand} from './update-subgraph-property.command.js';

export class UpdateSubgraphPropertyHandler implements CommandHandler<
  UpdateSubgraphPropertyCommand,
  void
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: UpdateSubgraphPropertyCommand): Promise<void> {
    const {session} = this.uow.getWriteContext();

    const exists = await this.uow
      .getSubgraphRepository()
      .subgraphExists(command.subgraphSystemId, session.fileSystemId);
    if (!exists) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const defResult =
      await this.queryServices.subgraphPropertyDefQueryService.getSubgraphPropertyDefinitionWithElements(
        command.propertySystemId,
        session.fileSystemId,
      );
    if (defResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        `Property definition ${command.propertySystemId} not found`,
      );
    }
    const propDef = defResult.data;

    if (
      propDef.propertyId === SUB_GRAPH_PROP_ID_SCENARIO_ID ||
      propDef.propertyId === SUB_GRAPH_PROP_ID_VSID
    ) {
      const endpoint =
        propDef.propertyId === SUB_GRAPH_PROP_ID_SCENARIO_ID
          ? 'PATCH /subgraphs/:id/scenario'
          : 'PATCH /subgraphs/:id/vsid';
      throw new InvalidOperationException(
        `Property ${propDef.name} is reserved. Use ${endpoint} instead.`,
      );
    }

    const serialized = serializeParameterData(
      {
        systemId: propDef.systemId,
        isReadOnly: false,
        elementsStructure: propDef.elementsStructure,
      },
      command.elements as unknown as ElementCalData[],
    );
    if (!serialized.ok) {
      throw new InvalidOperationException(serialized.error);
    }

    await this.uow
      .getSubgraphRepository()
      .setPropertyData(
        command.subgraphSystemId,
        command.propertySystemId,
        serialized.value,
      );
  }
}
