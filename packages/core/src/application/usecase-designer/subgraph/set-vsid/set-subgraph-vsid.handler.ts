/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidInputException} from '../../../../shared/exceptions/invalid-input.exception.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {BinaryDataReader} from '../../shared/utils/binary-data-reader.js';
import {
  SUB_GRAPH_PROP_ID_VSID,
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
} from '../../../../domain/entities/definitions/subgraph/subgraph-ids.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SetSubgraphVsidCommand} from './set-subgraph-vsid.command.js';
import type {VsidUpdateDto} from '../dto/subgraph-write-result-types.js';
import type {
  SubgraphRepository,
  SubgraphWithProperties,
} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';

export class SetSubgraphVsidHandler implements CommandHandler<
  SetSubgraphVsidCommand,
  VsidUpdateDto
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: SetSubgraphVsidCommand): Promise<VsidUpdateDto> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const subgraphRepository = this.uow.getSubgraphRepository();

    const subgraph = await subgraphRepository.getAggregate(
      command.subgraphSystemId,
      fileSystemId,
    );
    if (!subgraph) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const definitions =
      await subgraphRepository.getPropertyDefinitions(fileSystemId);
    const vsidDef = definitions.find(
      definition => definition.naturalId === SUB_GRAPH_PROP_ID_VSID,
    );
    if (!vsidDef) {
      throw new ResourceNotFoundException('VSID property definition not found');
    }

    const scenarioDef = definitions.find(
      definition => definition.naturalId === SUB_GRAPH_PROP_ID_SCENARIO_ID,
    );

    const vsidProp = subgraph.properties.find(
      p => p.propertySystemId === vsidDef.systemId,
    );
    const currentVsid = vsidProp?.payload
      ? new BinaryDataReader(vsidProp.payload).readUInt32()
      : undefined;

    const requestedVsid = Number(command.elements[0]?.value);

    if (currentVsid === requestedVsid) {
      return {groupId, affectedSubgraphSystemIds: []};
    }

    const serialized = serializeParameterData(
      {
        systemId: vsidDef.systemId,
        elementsStructure: vsidDef.elementsStructure,
      },
      command.elements as unknown as ElementData[],
    );
    if (!serialized.ok) {
      throw new InvalidInputException(serialized.error);
    }

    // BFS across usecases
    const toWrite = await this.collectSubgraphsToUpdate(
      command.subgraphSystemId,
      fileSystemId,
      vsidDef.systemId,
      scenarioDef?.systemId,
      requestedVsid,
      subgraph,
      subgraphRepository,
    );

    await this.uow.startTransaction();
    try {
      await Promise.all(
        [...toWrite].map(sgId =>
          subgraphRepository.setPropertyData(
            sgId,
            vsidDef.systemId,
            serialized.value,
          ),
        ),
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    return {groupId, affectedSubgraphSystemIds: [...toWrite].map(String)};
  }

  private async collectSubgraphsToUpdate(
    startId: number,
    fileSystemId: number,
    vsidDefSystemId: number,
    scenarioDefSystemId: number | undefined,
    requestedVsid: number,
    startSubgraph: SubgraphWithProperties,
    subgraphRepository: SubgraphRepository,
  ): Promise<Set<number>> {
    // Pass 1: BFS to collect all reachable IDs
    const reachableIds = await this.bfsReachableIds(
      startId,
      subgraphRepository,
    );

    // Pass 2: batch-fetch properties for linked subgraphs only (startId already fetched)
    const linkedIds = [...reachableIds].filter(id => id !== startId);
    const subgraphMap =
      linkedIds.length > 0
        ? await subgraphRepository.getAggregates(linkedIds, fileSystemId)
        : new Map<number, SubgraphWithProperties>();

    // Seed the map with the already-fetched start subgraph
    subgraphMap.set(startId, startSubgraph);

    // Pass 3: filter — determine which IDs need a VSID write
    const toWrite = new Set<number>([startId]);
    for (const [id, sg] of subgraphMap) {
      if (id === startId) continue;
      if (
        this.shouldUpdateVsid(
          sg,
          vsidDefSystemId,
          scenarioDefSystemId,
          requestedVsid,
        )
      ) {
        toWrite.add(id);
      }
    }
    return toWrite;
  }

  private shouldUpdateVsid(
    sg: SubgraphWithProperties,
    vsidDefSystemId: number,
    scenarioDefSystemId: number | undefined,
    requestedVsid: number,
  ): boolean {
    if (scenarioDefSystemId !== undefined) {
      const scenarioProp = sg.properties.find(
        p => p.propertySystemId === scenarioDefSystemId,
      );
      const scenarioVal = scenarioProp?.payload
        ? new BinaryDataReader(scenarioProp.payload).readUInt32()
        : undefined;
      if (scenarioVal !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL)
        return false;
    }
    const vsidProp = sg.properties.find(
      p => p.propertySystemId === vsidDefSystemId,
    );
    const linkedVsid = vsidProp?.payload
      ? new BinaryDataReader(vsidProp.payload).readUInt32()
      : undefined;
    return linkedVsid !== requestedVsid;
  }

  private async bfsReachableIds(
    startId: number,
    subgraphRepository: SubgraphRepository,
  ): Promise<Set<number>> {
    const visited = new Set<number>([startId]);
    let frontier = [startId];

    while (frontier.length > 0) {
      const linked =
        await subgraphRepository.findSubgraphIdsSharingUsecases(frontier);
      frontier = linked.filter(id => !visited.has(id));
      for (const id of frontier) visited.add(id);
    }
    return visited;
  }
}
