/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SubsystemDataLink} from '../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import {ChainResolutionService} from '../../../../domain/services/subsystem-data-links/datalink-chain-resolution.service.js';
import {planUnresolvedDeletion} from '../../shared/unresolved-deletion-plan.js';
import {LINK_DELETION_MODE} from '../../spf-module/delete/link-deletion-mode.js';
import type {LinkDeletionMode} from '../../spf-module/delete/link-deletion-mode.js';

export type DeletedLinkSummary = {
  systemId: string;
  subsystemLinks?: {systemId: string}[];
};

export type DataLinkDeletionResult = {
  dataLinks: DeletedLinkSummary[];
  unresolvedSubsystemDataLinks: {systemId: string}[];
};

const id = (systemId: number) => ({systemId: String(systemId)});

export class DataLinkDeletionService {
  constructor(private readonly uow: UnitOfWork) {}

  async deleteConnected(
    moduleSystemId: number,
    fileSystemId: number,
    mode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ): Promise<DataLinkDeletionResult> {
    const repository = this.uow.getDataLinkRepository();
    const [links, reachableUnresolved, routeContext] = await Promise.all([
      repository.findLinksConnectedToModule(moduleSystemId, fileSystemId),
      repository.findUnresolvedSubsystemLinksFromModule(
        moduleSystemId,
        fileSystemId,
      ),
      repository.findSubsystemDataRouteContext(fileSystemId),
    ]);
    const unresolvedPlan = planUnresolvedDeletion({
      moduleSystemId,
      reachableSegments: reachableUnresolved,
      routeSegments: routeContext.subsystemDataLinks,
      getSystemId: segment => segment.systemId,
      isUnresolved: segment => segment.dataLinkSystemId === null,
      getNodeSystemIds: segment => [
        segment.sourceNodeSystemId,
        segment.destinationNodeSystemId,
      ],
      classify: unresolvedSegments => {
        const resolution = ChainResolutionService.resolve({
          unresolvedSubsystemLinks: [...unresolvedSegments],
          nodeTypeMap: new Map(routeContext.nodeTypeBySystemId),
        });
        return {
          completeChains: resolution.completeChains.map(chain => ({
            segmentSystemIds: chain.ssLinkSystemIds,
            nodeSystemIds: [
              chain.sourceModuleSystemId,
              chain.destModuleSystemId,
            ],
          })),
          incompleteChains: resolution.incompleteChains.map(chain => ({
            segmentSystemIds: chain.ssLinkSystemIds,
            nodeSystemIds: [chain.startModuleSystemId],
          })),
        };
      },
    });
    const dataLinks: DeletedLinkSummary[] = [];

    for (const link of links) {
      const deletedSegments =
        mode === LINK_DELETION_MODE.Full
          ? link.subsystemDataLinks
          : link.subsystemDataLinks.filter(segment =>
              [
                segment.sourceNodeSystemId,
                segment.destinationNodeSystemId,
              ].includes(moduleSystemId),
            );

      if (mode === LINK_DELETION_MODE.Full || deletedSegments.length === 0) {
        await repository.deleteAggregate(link.systemId, fileSystemId);
      } else {
        await repository.deleteSubsystemDataLinks(
          deletedSegments.map(segment => segment.systemId),
          fileSystemId,
        );
      }
      dataLinks.push(this.toSummary(link.systemId, deletedSegments));
    }
    const unresolvedIds =
      mode === LINK_DELETION_MODE.Full
        ? unresolvedPlan.fullModeIds
        : unresolvedPlan.segmentOnlyIds;
    await repository.deleteSubsystemDataLinks(unresolvedIds, fileSystemId);

    return {
      dataLinks,
      unresolvedSubsystemDataLinks: unresolvedIds.map(systemId => id(systemId)),
    };
  }

  private toSummary(
    linkSystemId: number,
    deletedSegments: SubsystemDataLink[],
  ): DeletedLinkSummary {
    const subsystemLinks = deletedSegments.map(segment => id(segment.systemId));
    return {
      systemId: String(linkSystemId),
      ...(subsystemLinks.length > 0 ? {subsystemLinks} : {}),
    };
  }
}
