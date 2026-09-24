/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {ControlLinkRepository} from '../../../ports/persistence/repositories/control-link/control-link.repository.js';
import {ControlIntentPropagationService} from '../../../../domain/services/subsystem-control-links/control-intent-propagation.service.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import type {DeleteControlLinkResult} from '../dto/delete-control-link-result.schema.js';
import {LINK_DELETION_MODE} from '../../spf-module/delete/link-deletion-mode.js';
import type {LinkDeletionMode} from '../../spf-module/delete/link-deletion-mode.js';
import {
  planUnresolvedDeletion,
  sortIds,
} from '../../shared/unresolved-deletion-plan.js';

export type ControlLinkDeletionResult = {
  controlLinks: {
    systemId: string;
    subsystemLinks?: {systemId: string}[];
  }[];
  unresolvedSubsystemControlLinks: {systemId: string}[];
  ssIntentsClearedPorts: {
    subsystemSystemId: number;
    controlPortSystemId: number;
  }[];
};

const id = (systemId: number) => ({systemId: String(systemId)});

export class ControlLinkDeletionService {
  constructor(private readonly uow: UnitOfWork) {}

  /**
   * Deletes a canonical ControlLink or a subsystem segment identified by system
   * ID. Removing a resolved segment breaks its parent route, while a standalone
   * segment has no canonical parent to remove.
   */
  async deleteBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<DeleteControlLinkResult | null> {
    const repository = this.uow.getControlLinkRepository();
    const graph = await repository.findAllLinks(fileSystemId);
    const allSegments = this.allSegments(graph);
    const canonical = graph.controlLinks.find(
      link => link.systemId === systemId,
    );
    if (canonical) {
      await this.deleteResolvedSegments(
        repository,
        canonical,
        canonical.subsystemControlLinks,
        fileSystemId,
        LINK_DELETION_MODE.Full,
      );
      const clearedPorts = await this.clearIntentsAfterDeleting(
        allSegments,
        canonical.subsystemControlLinks,
        fileSystemId,
      );
      return this.toDeleteResult(
        [canonical],
        canonical.subsystemControlLinks,
        clearedPorts,
      );
    }

    for (const link of graph.controlLinks) {
      const segment = link.subsystemControlLinks.find(
        candidate => candidate.systemId === systemId,
      );
      if (!segment) continue;
      await this.deleteResolvedSegments(
        repository,
        link,
        [segment],
        fileSystemId,
        LINK_DELETION_MODE.SegmentOnly,
      );
      const clearedPorts = await this.clearIntentsAfterDeleting(
        allSegments,
        [segment],
        fileSystemId,
      );
      return this.toDeleteResult([link], [segment], clearedPorts);
    }

    const unresolved = graph.standaloneSubsystemControlLinks.find(
      segment => segment.systemId === systemId,
    );
    if (!unresolved) return null;

    await repository.deleteSubsystemControlLinks([unresolved], fileSystemId);
    const clearedPorts = await this.clearIntentsAfterDeleting(
      allSegments,
      [unresolved],
      fileSystemId,
    );
    return this.toDeleteResult([], [unresolved], clearedPorts);
  }

  async deleteConnected(
    moduleSystemId: number,
    fileSystemId: number,
    mode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ): Promise<ControlLinkDeletionResult> {
    const repository = this.uow.getControlLinkRepository();
    const [links, reachableUnresolved, linkGraph, topology] = await Promise.all(
      [
        repository.findLinksConnectedToModule(moduleSystemId, fileSystemId),
        repository.findUnresolvedSubsystemLinksFromModule(
          moduleSystemId,
          fileSystemId,
        ),
        repository.findAllLinks(fileSystemId),
        this.uow.getSubsystemRepository().getAllNodesWithParents(fileSystemId),
      ],
    );
    const nodeTypeBySystemId = new Map(
      topology.map(node => [node.systemId, node.type]),
    );
    const standaloneSegmentsById = new Map(
      [
        ...linkGraph.standaloneSubsystemControlLinks,
        ...reachableUnresolved,
      ].map(segment => [segment.systemId, segment]),
    );
    const unresolvedPlan = planUnresolvedDeletion({
      moduleSystemId,
      reachableSegments: reachableUnresolved,
      routeSegments: linkGraph.standaloneSubsystemControlLinks,
      getSystemId: segment => segment.systemId,
      isUnresolved: segment => segment.controlLinkSystemId === null,
      getNodeSystemIds: segment => [
        segment.peerNodeASystemId,
        segment.peerNodeBSystemId,
      ],
      classify: unresolvedSegments => {
        const resolution = ControlChainResolutionService.resolve({
          unresolvedSubsystemlinks: [...unresolvedSegments],
          nodeTypeMap: new Map(nodeTypeBySystemId),
        });
        return {
          completeChains: resolution.completeChains.map(chain => ({
            segmentSystemIds: chain.ssLinksSystemIds,
            nodeSystemIds: [
              chain.peerAModuleSystemId,
              chain.peerBModuleSystemId,
            ],
          })),
          incompleteChains: resolution.incompleteChains.map(chain => ({
            segmentSystemIds: chain.ssLinksSystemIds,
            nodeSystemIds: chain.reachableNodeIds,
          })),
        };
      },
    });
    const deletedSegmentIds = new Set<number>();
    const controlLinks: ControlLinkDeletionResult['controlLinks'] = [];

    for (const link of links) {
      const deletedSegments =
        mode === LINK_DELETION_MODE.Full
          ? link.subsystemControlLinks
          : link.subsystemControlLinks.filter(segment =>
              [segment.peerNodeASystemId, segment.peerNodeBSystemId].includes(
                moduleSystemId,
              ),
            );
      for (const segment of deletedSegments) {
        deletedSegmentIds.add(segment.systemId);
      }
      controlLinks.push(this.toSummary(link.systemId, deletedSegments));
    }
    const unresolvedIds =
      mode === LINK_DELETION_MODE.Full
        ? unresolvedPlan.fullModeIds
        : unresolvedPlan.segmentOnlyIds;
    for (const systemId of unresolvedIds) deletedSegmentIds.add(systemId);
    const allSegments = this.allSegments(linkGraph);
    const clearedPorts = this.findPortsToClear(
      allSegments,
      sortIds(deletedSegmentIds),
      nodeTypeBySystemId,
    );

    for (const link of links) {
      const deletedSegments =
        mode === LINK_DELETION_MODE.Full
          ? link.subsystemControlLinks
          : link.subsystemControlLinks.filter(segment =>
              [segment.peerNodeASystemId, segment.peerNodeBSystemId].includes(
                moduleSystemId,
              ),
            );
      await this.deleteResolvedSegments(
        repository,
        link,
        deletedSegments,
        fileSystemId,
        mode,
      );
    }
    await repository.deleteSubsystemControlLinks(
      unresolvedIds
        .map(systemId => standaloneSegmentsById.get(systemId))
        .filter(
          (segment): segment is SubsystemControlLink => segment !== undefined,
        ),
      fileSystemId,
    );
    await this.uow
      .getSubsystemRepository()
      .clearControlPortIntents(clearedPorts, fileSystemId);

    return {
      controlLinks,
      unresolvedSubsystemControlLinks: unresolvedIds.map(systemId =>
        id(systemId),
      ),
      ssIntentsClearedPorts: clearedPorts,
    };
  }

  private toSummary(
    linkSystemId: number,
    deletedSegments: SubsystemControlLink[],
  ): ControlLinkDeletionResult['controlLinks'][number] {
    const subsystemLinks = deletedSegments.map(segment => id(segment.systemId));
    return {
      systemId: String(linkSystemId),
      ...(subsystemLinks.length > 0 ? {subsystemLinks} : {}),
    };
  }

  private async deleteResolvedSegments(
    repository: ControlLinkRepository,
    link: ControlLink,
    deletedSegments: readonly SubsystemControlLink[],
    fileSystemId: number,
    mode: LinkDeletionMode,
  ): Promise<void> {
    if (mode === LINK_DELETION_MODE.Full) {
      await repository.deleteAggregate(link.systemId, fileSystemId);
      return;
    }

    await repository.deleteSubsystemControlLinks(deletedSegments, fileSystemId);
    await repository.deleteCanonical(link.systemId, fileSystemId);
    await repository.detachSubsystemControlLinks(
      link.subsystemControlLinks.filter(
        segment =>
          !deletedSegments.some(
            deleted => deleted.systemId === segment.systemId,
          ),
      ),
      fileSystemId,
    );
  }

  private allSegments(graph: {
    controlLinks: ControlLink[];
    standaloneSubsystemControlLinks: SubsystemControlLink[];
  }): SubsystemControlLink[] {
    return [
      ...graph.standaloneSubsystemControlLinks,
      ...graph.controlLinks.flatMap(link => link.subsystemControlLinks),
    ];
  }

  private async clearIntentsAfterDeleting(
    allSegments: readonly SubsystemControlLink[],
    deletedSegments: readonly SubsystemControlLink[],
    fileSystemId: number,
  ): Promise<ControlLinkDeletionResult['ssIntentsClearedPorts']> {
    const topology = await this.uow
      .getSubsystemRepository()
      .getAllNodesWithParents(fileSystemId);
    const nodeTypeBySystemId = new Map(
      topology.map(node => [node.systemId, node.type]),
    );
    const clearedPorts = this.findPortsToClear(
      allSegments,
      deletedSegments.map(segment => segment.systemId),
      nodeTypeBySystemId,
    );
    await this.uow
      .getSubsystemRepository()
      .clearControlPortIntents(clearedPorts, fileSystemId);
    return clearedPorts;
  }

  private findPortsToClear(
    allSegments: readonly SubsystemControlLink[],
    deletedSegmentIds: readonly number[],
    nodeTypeBySystemId: ReadonlyMap<number, NodeType>,
  ): ControlLinkDeletionResult['ssIntentsClearedPorts'] {
    return ControlIntentPropagationService.findPortsToClearAfterDeletingLinks({
      allSubsystemControlLinks: allSegments,
      deletedSubsystemControlLinkSystemIds: deletedSegmentIds,
      nodeTypeMap: nodeTypeBySystemId,
    }).portsToClear;
  }

  private toDeleteResult(
    controlLinks: readonly ControlLink[],
    subsystemControlLinks: readonly SubsystemControlLink[],
    clearedPorts: ControlLinkDeletionResult['ssIntentsClearedPorts'],
  ): DeleteControlLinkResult {
    const portIdsBySubsystem = new Map<number, Set<number>>();
    for (const {subsystemSystemId, controlPortSystemId} of clearedPorts) {
      const portIds = portIdsBySubsystem.get(subsystemSystemId) ?? new Set();
      portIds.add(controlPortSystemId);
      portIdsBySubsystem.set(subsystemSystemId, portIds);
    }
    return {
      deleted: {
        controlLinks: controlLinks.map(link => id(link.systemId)),
        subsystemControlLinks: subsystemControlLinks.map(link =>
          id(link.systemId),
        ),
      },
      updated: {
        subsystems: [...portIdsBySubsystem.entries()]
          .map(([subsystemSystemId, controlPortSystemIds]) => ({
            systemId: String(subsystemSystemId),
            intentsClearedControlPorts: [...controlPortSystemIds]
              .sort((left, right) => left - right)
              .map(controlPortSystemId => id(controlPortSystemId)),
          }))
          .sort(
            (left, right) => Number(left.systemId) - Number(right.systemId),
          ),
      },
    };
  }
}
