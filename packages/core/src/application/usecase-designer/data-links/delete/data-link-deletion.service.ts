/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DataLinkRepository} from '../../../ports/persistence/repositories/data-link/data-link.repository.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubsystemDataLink} from '../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import type {DeleteDataLinkResult} from '../dto/delete-data-link-result.schema.js';
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

  /**
   * Deletes a canonical DataLink or a subsystem segment identified by system ID.
   * A resolved segment breaks its parent route, so the canonical link is deleted
   * and sibling segments become unresolved. Standalone segments have no parent.
   */
  async deleteBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<DeleteDataLinkResult | null> {
    const repository = this.uow.getDataLinkRepository();
    const graph = await repository.findAllLinks(fileSystemId);
    const canonical = graph.dataLinks.find(link => link.systemId === systemId);
    if (canonical) {
      await this.deleteResolvedSegments(
        repository,
        canonical,
        canonical.subsystemDataLinks,
        fileSystemId,
        LINK_DELETION_MODE.Full,
      );
      return this.toDeleteResult([canonical], canonical.subsystemDataLinks);
    }

    for (const link of graph.dataLinks) {
      const segment = link.subsystemDataLinks.find(
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
      return this.toDeleteResult([link], [segment]);
    }

    const unresolved = graph.standaloneSubsystemDataLinks.find(
      segment => segment.systemId === systemId,
    );
    if (!unresolved) return null;

    await repository.deleteSubsystemDataLinks([unresolved], fileSystemId);
    return this.toDeleteResult([], [unresolved]);
  }

  async deleteConnected(
    moduleSystemId: number,
    fileSystemId: number,
    mode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ): Promise<DataLinkDeletionResult> {
    const repository = this.uow.getDataLinkRepository();
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
      [...linkGraph.standaloneSubsystemDataLinks, ...reachableUnresolved].map(
        segment => [segment.systemId, segment],
      ),
    );
    const unresolvedPlan = planUnresolvedDeletion({
      moduleSystemId,
      reachableSegments: reachableUnresolved,
      routeSegments: linkGraph.standaloneSubsystemDataLinks,
      getSystemId: segment => segment.systemId,
      isUnresolved: segment => segment.dataLinkSystemId === null,
      getNodeSystemIds: segment => [
        segment.sourceNodeSystemId,
        segment.destinationNodeSystemId,
      ],
      classify: unresolvedSegments => {
        const resolution = ChainResolutionService.resolve({
          unresolvedSubsystemLinks: [...unresolvedSegments],
          nodeTypeMap: new Map(nodeTypeBySystemId),
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

      await this.deleteResolvedSegments(
        repository,
        link,
        deletedSegments,
        fileSystemId,
        mode,
      );
      dataLinks.push(this.toSummary(link.systemId, deletedSegments));
    }
    const unresolvedIds =
      mode === LINK_DELETION_MODE.Full
        ? unresolvedPlan.fullModeIds
        : unresolvedPlan.segmentOnlyIds;
    await repository.deleteSubsystemDataLinks(
      unresolvedIds
        .map(systemId => standaloneSegmentsById.get(systemId))
        .filter(
          (segment): segment is SubsystemDataLink => segment !== undefined,
        ),
      fileSystemId,
    );

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

  private async deleteResolvedSegments(
    repository: DataLinkRepository,
    link: DataLink,
    deletedSegments: readonly SubsystemDataLink[],
    fileSystemId: number,
    mode: LinkDeletionMode,
  ): Promise<void> {
    if (mode === LINK_DELETION_MODE.Full) {
      await repository.deleteAggregate(link.systemId, fileSystemId);
      return;
    }

    await repository.deleteSubsystemDataLinks(deletedSegments, fileSystemId);
    await repository.deleteCanonical(link.systemId, fileSystemId);
    await repository.detachSubsystemDataLinks(
      link.subsystemDataLinks.filter(
        segment =>
          !deletedSegments.some(
            deleted => deleted.systemId === segment.systemId,
          ),
      ),
      fileSystemId,
    );
  }

  private toDeleteResult(
    dataLinks: readonly DataLink[],
    subsystemDataLinks: readonly SubsystemDataLink[],
  ): DeleteDataLinkResult {
    return {
      deleted: {
        dataLinks: dataLinks.map(link => id(link.systemId)),
        subsystemDataLinks: subsystemDataLinks.map(link => id(link.systemId)),
      },
    };
  }
}
