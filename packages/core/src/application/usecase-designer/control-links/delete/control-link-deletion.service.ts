/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ControlIntentPropagationService} from '../../../../domain/services/subsystem-control-links/control-intent-propagation.service.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
import type {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
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

  async deleteConnected(
    moduleSystemId: number,
    fileSystemId: number,
    mode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ): Promise<ControlLinkDeletionResult> {
    const repository = this.uow.getControlLinkRepository();
    const [links, reachableUnresolved, routeContext] = await Promise.all([
      repository.findLinksConnectedToModule(moduleSystemId, fileSystemId),
      repository.findUnresolvedSubsystemLinksFromModule(
        moduleSystemId,
        fileSystemId,
      ),
      repository.findSubsystemControlRouteContext(fileSystemId),
    ]);
    const unresolvedPlan = planUnresolvedDeletion({
      moduleSystemId,
      reachableSegments: reachableUnresolved,
      routeSegments: routeContext.subsystemControlLinks,
      getSystemId: segment => segment.systemId,
      isUnresolved: segment => segment.controlLinkSystemId === null,
      getNodeSystemIds: segment => [
        segment.peerNodeASystemId,
        segment.peerNodeBSystemId,
      ],
      classify: unresolvedSegments => {
        const resolution = ControlChainResolutionService.resolve({
          unresolvedSubsystemlinks: [...unresolvedSegments],
          nodeTypeMap: new Map(routeContext.nodeTypeBySystemId),
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
    const clearedPorts =
      ControlIntentPropagationService.findPortsToClearAfterDeletingLinks({
        allSubsystemControlLinks: routeContext.subsystemControlLinks,
        deletedSubsystemControlLinkSystemIds: sortIds(deletedSegmentIds),
        nodeTypeMap: routeContext.nodeTypeBySystemId,
      }).portsToClear;

    for (const link of links) {
      const deletedSegments =
        mode === LINK_DELETION_MODE.Full
          ? link.subsystemControlLinks
          : link.subsystemControlLinks.filter(segment =>
              [segment.peerNodeASystemId, segment.peerNodeBSystemId].includes(
                moduleSystemId,
              ),
            );
      if (mode === LINK_DELETION_MODE.Full || deletedSegments.length === 0) {
        await repository.deleteAggregate(link.systemId, fileSystemId);
      } else {
        await repository.deleteSubsystemControlLinks(
          deletedSegments.map(segment => segment.systemId),
          fileSystemId,
        );
      }
    }
    await repository.deleteSubsystemControlLinks(unresolvedIds, fileSystemId);
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
}
