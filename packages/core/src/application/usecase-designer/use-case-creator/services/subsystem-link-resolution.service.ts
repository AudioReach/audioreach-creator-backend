/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';
import {SOURCE} from '../../../shared/change-vocabulary.js';
import {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {CONTROL_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/control-link-type.js';
import {ChainResolutionService} from '../../../../domain/services/subsystem-data-links/datalink-chain-resolution.service.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
import {v4 as uuidv4} from 'uuid';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';

/**
 * Resolves subsystem link chains needed before routing input construction.
 *
 * Used by `AutoRoutingPreparationService` and `CreateManualUsecasesHandler`.
 */
export class SubsystemLinkResolutionService {
  async resolveAllChains(
    uow: UnitOfWork,
    idGeneration: IdGenerationPort,
  ): Promise<ResultType<void>> {
    const fileSystemId = uow.getWriteContext().session.fileSystemId;
    const dataLinkRepository = uow.getDataLinkRepository();
    const controlLinkRepository = uow.getControlLinkRepository();
    const subsystemRepository = uow.getSubsystemRepository();
    const [dataTopology, controlTopology, nodeTopology] = await Promise.all([
      dataLinkRepository.findAllLinks(fileSystemId),
      controlLinkRepository.findAllLinks(fileSystemId),
      subsystemRepository.getAllNodesWithParents(fileSystemId),
    ]);

    if (
      dataTopology.unresolvedSubsystemDataLinks.length === 0 &&
      controlTopology.unresolvedSubsystemControlLinks.length === 0
    ) {
      return Result.ok();
    }

    const nodeTypeMap = new Map(
      nodeTopology.map(node => [node.systemId, node.type]),
    );
    const dataResult = ChainResolutionService.resolve({
      unresolvedSubsystemLinks: dataTopology.unresolvedSubsystemDataLinks,
      nodeTypeMap,
    });
    const controlResult = ControlChainResolutionService.resolve({
      unresolvedSubsystemlinks: controlTopology.unresolvedSubsystemControlLinks,
      nodeTypeMap,
    });
    const issues = [
      ...dataResult.incompleteChains.map(chain =>
        RoutingIssueFactory.incompleteDataChain(
          chain.ssLinkSystemIds,
          chain.startModuleSystemId,
          chain.lastReachableNodeSystemId,
        ),
      ),
      ...controlResult.incompleteChains.map(chain =>
        RoutingIssueFactory.incompleteControlChain(
          chain.ssLinksSystemIds,
          chain.reachableNodeIds,
        ),
      ),
    ];
    if (issues.length > 0) return Result.fail(...issues);

    const moduleRepository = uow.getModuleRepository();
    const dataSegmentBySystemId = new Map(
      dataTopology.unresolvedSubsystemDataLinks.map(segment => [
        segment.systemId,
        segment,
      ]),
    );
    for (const chain of dataResult.completeChains) {
      const [sourceModule, destinationModule] = await Promise.all([
        moduleRepository.findModulePortsForLink(
          chain.sourceModuleSystemId,
          fileSystemId,
        ),
        moduleRepository.findModulePortsForLink(
          chain.destModuleSystemId,
          fileSystemId,
        ),
      ]);
      if (sourceModule === null)
        return Result.fail(
          IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.SpfModule,
            chain.sourceModuleSystemId,
          ),
        );
      if (destinationModule === null)
        return Result.fail(
          IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.SpfModule,
            chain.destModuleSystemId,
          ),
        );
      const systemId = await idGeneration.getNextId(fileSystemId);
      const dataLink = new DataLink({
        systemId,
        sourceNodeSystemId: chain.sourceModuleSystemId,
        destinationNodeSystemId: chain.destModuleSystemId,
        sourcePortSystemId: chain.sourcePortSystemId,
        destinationPortSystemId: chain.destPortSystemId,
        linkType: DATA_LINK_TYPE.Normal,
        sourceSubgraphSystemId: sourceModule.subgraphSystemId,
        destSubgraphSystemId: destinationModule.subgraphSystemId,
        fileSystemId,
        subsystemDataLinks: [],
      });
      const options = {
        source: SOURCE.Manual,
        linkedEntityGroupId: uuidv4(),
      };
      await dataLinkRepository.createDataLink(dataLink, [], options);
      const segments = chain.ssLinkSystemIds.flatMap(segmentSystemId => {
        const segment = dataSegmentBySystemId.get(segmentSystemId);
        return segment === undefined ? [] : [segment];
      });
      await dataLinkRepository.resolveSubsystemDataLinks(
        segments,
        systemId,
        options,
      );
    }

    const controlSegmentBySystemId = new Map(
      controlTopology.unresolvedSubsystemControlLinks.map(segment => [
        segment.systemId,
        segment,
      ]),
    );
    for (const chain of controlResult.completeChains) {
      const [peerAModule, peerBModule] = await Promise.all([
        moduleRepository.findModuleById(
          chain.peerAModuleSystemId,
          fileSystemId,
        ),
        moduleRepository.findModuleById(
          chain.peerBModuleSystemId,
          fileSystemId,
        ),
      ]);
      if (peerAModule === null)
        return Result.fail(
          IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.SpfModule,
            chain.peerAModuleSystemId,
          ),
        );
      if (peerBModule === null)
        return Result.fail(
          IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.SpfModule,
            chain.peerBModuleSystemId,
          ),
        );
      const systemId = await idGeneration.getNextId(fileSystemId);
      const controlLink = new ControlLink(
        systemId,
        fileSystemId,
        chain.peerAModuleSystemId,
        chain.peerBModuleSystemId,
        chain.peerAPortSystemId,
        chain.peerBPortSystemId,
        0,
        CONTROL_LINK_TYPE.Normal,
        peerAModule.subgraphSystemId,
        peerBModule.subgraphSystemId,
        [],
      );
      const options = {
        source: SOURCE.Manual,
        linkedEntityGroupId: uuidv4(),
      };
      await controlLinkRepository.createAggregate(
        controlLink,
        fileSystemId,
        options,
      );
      const segments = chain.ssLinksSystemIds.flatMap(segmentSystemId => {
        const segment = controlSegmentBySystemId.get(segmentSystemId);
        return segment === undefined ? [] : [segment];
      });
      await controlLinkRepository.resolveSubsystemControlLinks(
        segments,
        systemId,
        options,
      );
    }

    return Result.ok();
  }
}
