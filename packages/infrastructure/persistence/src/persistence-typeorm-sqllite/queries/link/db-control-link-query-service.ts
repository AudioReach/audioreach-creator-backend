/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  ControlLink,
  ControlLinkQueryService,
  ControlLinkReadModel,
  ControlLinkWithUsecaseIdsReadModel,
  SessionChanged,
  SubgraphPeerLinkFilter,
  SubsystemControlLink,
} from '@arc/core';
import {CHANGE_OPERATION, CONTROL_LINK_TYPE, ENTITY_TYPE} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import type {
  ControlLinkFilters,
  LinkOverlayFetcher,
} from '../../fetchers/link-overlay-fetcher.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import type {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {toControlLink, toSubsystemControlLink} from './link-entity-mappers.js';
import {resolveCanonicalLinks} from './resolve-canonical-links.js';
import {findControlPortOwner} from './find-control-port-owner.js';

/**
 * Database implementation of ControlLinkQueryService. Build it with
 * createControlLinkQueryService.
 */
export class DbControlLinkQueryService implements ControlLinkQueryService {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActions: EditActionsQueryService,
    private readonly usecaseFetcher: UsecaseOverlayFetcher,
    private readonly linkFetcher: LinkOverlayFetcher,
    private readonly intentFetcher: IntentFetcher,
  ) {}

  async findByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    if (usecaseSystemIds.length === 0) return [];
    const sessionId = await this.sessionId(fileSystemId);
    const usecases = await this.usecaseFetcher.getUsecases(
      fileSystemId,
      sessionId,
      [...usecaseSystemIds],
    );
    const subgraphIds = [
      ...new Set(usecases.flatMap(uc => uc.subgraphSystemIds)),
    ];
    return this.loadBySubgraphIds(fileSystemId, sessionId, subgraphIds);
  }

  async findBySubgraphIds(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    if (subgraphSystemIds.length === 0) return [];
    return this.loadBySubgraphIds(
      fileSystemId,
      await this.sessionId(fileSystemId),
      [...subgraphSystemIds],
    );
  }

  async findSubgraphPeerLinks(
    fileSystemId: number,
    filter: SubgraphPeerLinkFilter,
  ): Promise<ControlLinkWithUsecaseIdsReadModel[]> {
    const sessionId = await this.sessionId(fileSystemId);
    const links = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      this.buildCandidateFilters(filter),
    );
    const matchingLinks = links.filter(link =>
      this.matchesSubgraphPeerFilter(link, filter),
    );
    if (matchingLinks.length === 0) return [];

    const usecases = await this.usecaseFetcher.getUsecases(
      fileSystemId,
      sessionId,
    );
    // Control links are undirected: a usecase pair matches either way.
    return matchingLinks.map(link => ({
      link: UseCaseQueryMappers.mapToComponentControlLinkReadModel(link),
      usecaseSystemIds: usecases
        .filter(usecase =>
          usecase.subgraphPairs.some(
            pair =>
              (pair.sourceSubgraphSystemId === link.sourceSubgraphSystemId &&
                pair.destSubgraphSystemId === link.destSubgraphSystemId) ||
              (pair.sourceSubgraphSystemId === link.destSubgraphSystemId &&
                pair.destSubgraphSystemId === link.sourceSubgraphSystemId),
          ),
        )
        .map(usecase => usecase.systemId),
    }));
  }

  async findControlLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>> {
    if (systemIds.length === 0)
      return {entityType: ENTITY_TYPE.ControlLink, items: [], failed: []};
    const sessionId = await this.sessionId(fileSystemId);
    const ids = [...systemIds];
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {systemId: ids},
    );
    return withNotFound(
      ENTITY_TYPE.ControlLink,
      ids,
      await this.toControlLinks(fileSystemId, sessionId, rows),
      link => link.systemId,
    );
  }

  async findControlLinkSegments(
    fileSystemId: number,
    linkSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    if (linkSystemIds.length === 0) return [];
    const sessionId = await this.sessionId(fileSystemId);
    const ids = [...linkSystemIds];
    const segments = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      sessionId,
      {$or: [{controlLinkSystemId: ids}, {systemId: ids}]},
    );
    const parentIds = [
      ...new Set(
        segments
          .map(segment => segment.controlLinkSystemId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const parents =
      parentIds.length === 0
        ? []
        : await this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, {
            systemId: parentIds,
          });
    const heapIdByLink = new Map(parents.map(l => [l.systemId, l.heapId]));
    return segments.map(segment => ({
      systemId: segment.systemId,
      peerNodeASystemId: segment.peerNodeASystemId,
      peerNodeBSystemId: segment.peerNodeBSystemId,
      nodeAPortSystemId: segment.nodeAPortSystemId,
      nodeBPortSystemId: segment.nodeBPortSystemId,
      heapId:
        (segment.controlLinkSystemId === null
          ? undefined
          : heapIdByLink.get(segment.controlLinkSystemId)) ?? 1,
      linkType: segment.linkType,
    }));
  }

  async findSegmentsByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    if (usecaseSystemIds.length === 0) return [];
    const sessionId = await this.sessionId(fileSystemId);
    const usecaseSubgraphIds = new Set(
      await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
        [...usecaseSystemIds],
        sessionId,
      ),
    );
    if (usecaseSubgraphIds.size === 0) return [];

    const [controlLinks, segments] = await Promise.all([
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId),
    ]);
    const controlLinkById = new Map(
      controlLinks.map(link => [link.systemId, link]),
    );
    return segments.flatMap(segment => {
      const link =
        segment.controlLinkSystemId === null
          ? undefined
          : controlLinkById.get(segment.controlLinkSystemId);
      if (
        link === undefined ||
        !(
          usecaseSubgraphIds.has(link.sourceSubgraphSystemId) ||
          usecaseSubgraphIds.has(link.destSubgraphSystemId)
        )
      ) {
        return [];
      }
      // The segment takes its endpoints from itself and the rest from its
      // control link.
      return [
        UseCaseQueryMappers.mapToComponentControlLinkReadModel({
          ...link,
          systemId: segment.systemId,
          peerNodeASystemId: segment.peerNodeASystemId,
          peerNodeBSystemId: segment.peerNodeBSystemId,
          nodeAPortSystemId: segment.nodeAPortSystemId,
          nodeBPortSystemId: segment.nodeBPortSystemId,
        }),
      ];
    });
  }

  async findCanonicalLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>> {
    if (systemIds.length === 0)
      return {entityType: ENTITY_TYPE.ControlLink, items: [], failed: []};
    const sessionId = await this.sessionId(fileSystemId);
    const requestedIds = [...systemIds];
    const [links, segments] = await Promise.all([
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, {
        systemId: requestedIds,
      }),
      this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId, {
        systemId: requestedIds,
      }),
    ]);
    const resolved = await resolveCanonicalLinks(
      ENTITY_TYPE.ControlLink,
      requestedIds,
      {
        links,
        segments,
        segmentSystemId: segment => segment.systemId,
        parentSystemId: segment => segment.controlLinkSystemId,
        loadLinks: ids =>
          this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, {
            systemId: ids,
          }),
      },
    );
    return {
      ...resolved,
      items: await this.toControlLinks(fileSystemId, sessionId, resolved.items),
    };
  }

  async findIntraUcLinks(fileSystemId: number): Promise<ControlLink[]> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      await this.sessionId(fileSystemId),
      {linkType: CONTROL_LINK_TYPE.Normal},
    );
    return rows.map(row => toControlLink(row));
  }

  async findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<ControlLink>> {
    const sessionId = await this.sessionId(fileSystemId);
    if (sessionId === null) return {added: [], deleted: []};
    const changed = await this.linkFetcher.fetchChangedControlLinks(
      fileSystemId,
      sessionId,
    );
    return {
      added: changed.added.map(row => toControlLink(row)),
      deleted: changed.deleted.map(row => toControlLink(row)),
    };
  }

  async findLinkIdsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    if (portSystemIds.length === 0) return [];
    const sessionId = await this.sessionId(fileSystemId);
    const ports = [...portSystemIds];
    const filters = {
      $or: [{nodeAPortSystemId: ports}, {nodeBPortSystemId: ports}],
    };
    const [links, segments] = await Promise.all([
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, filters),
      this.linkFetcher.loadSubsystemControlLinkRows(
        fileSystemId,
        sessionId,
        filters,
      ),
    ]);
    const portSet = new Set(ports);
    return [...links, ...segments].flatMap(link =>
      [link.nodeAPortSystemId, link.nodeBPortSystemId]
        .filter(portSystemId => portSet.has(portSystemId))
        .map(portSystemId => ({linkSystemId: link.systemId, portSystemId})),
    );
  }

  async findByPortPair(
    fileSystemId: number,
    portASystemId: number,
    portBSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null> {
    const filter = {
      nodeAPortSystemId: portASystemId,
      nodeBPortSystemId: portBSystemId,
    };
    const sessionId = await this.sessionId(fileSystemId);

    // A committed link wins, even when the session deleted it.
    const committedRows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      null,
      filter,
    );
    const committed = committedRows.at(0);
    if (committed !== undefined) {
      const actions =
        sessionId === null
          ? []
          : await this.editActions.getByAggregateId(
              sessionId,
              committed.systemId,
            );
      const isDeleted = actions.some(
        action =>
          action.targetTable === ENTITY_NAMES.ControlLink &&
          action.targetSystemId === committed.systemId &&
          action.operation === CHANGE_OPERATION.Delete,
      );
      return {systemId: committed.systemId, isDeleted};
    }

    if (sessionId === null) return null;
    const sessionRows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      filter,
    );
    const created = sessionRows.at(0);
    return created === undefined
      ? null
      : {systemId: created.systemId, isDeleted: false};
  }

  async findAllocatedIntents(
    fileSystemId: number,
    controlPortSystemId: number,
  ): Promise<{intentSystemId: number; intentId: number}[]> {
    const sessionId = await this.sessionId(fileSystemId);
    const nodeSystemId = await findControlPortOwner(
      this.manager,
      this.editActions,
      sessionId,
      controlPortSystemId,
      fileSystemId,
    );
    const rows = await this.intentFetcher.fetchMany(
      [controlPortSystemId],
      nodeSystemId,
      sessionId,
    );
    return rows.map(row => ({
      intentSystemId: row.systemId,
      intentId: row.naturalId,
    }));
  }

  /** Maps link rows to ControlLinks, each with its subsystem segments. */
  private async toControlLinks(
    fileSystemId: number,
    sessionId: number | null,
    links: readonly ControlLinkBase[],
  ): Promise<ControlLink[]> {
    if (links.length === 0) return [];
    const segments = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      sessionId,
      {controlLinkSystemId: links.map(link => link.systemId)},
    );
    const segmentsByLink = new Map<number, SubsystemControlLink[]>();
    for (const segment of segments) {
      if (segment.controlLinkSystemId === null) continue;
      const list = segmentsByLink.get(segment.controlLinkSystemId) ?? [];
      list.push(toSubsystemControlLink(segment));
      segmentsByLink.set(segment.controlLinkSystemId, list);
    }
    return links.map(link =>
      toControlLink(link, segmentsByLink.get(link.systemId)),
    );
  }

  private sessionId(fileSystemId: number): Promise<number | null> {
    return resolveActiveSessionId(this.manager, fileSystemId);
  }

  /**
   * Links with an endpoint in one of the subgraphs, including links to
   * other subgraphs.
   */
  private async loadBySubgraphIds(
    fileSystemId: number,
    sessionId: number | null,
    subgraphIds: number[],
  ): Promise<ControlLinkReadModel[]> {
    if (subgraphIds.length === 0) return [];
    const links = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {sourceSubgraphSystemId: subgraphIds},
          {destSubgraphSystemId: subgraphIds},
        ],
      },
    );
    return links.map(link =>
      UseCaseQueryMappers.mapToComponentControlLinkReadModel(link),
    );
  }

  /**
   * A broad OR prefilter for the database query; matchesSubgraphPeerFilter
   * applies the exact subgraph and module-port match.
   */
  private buildCandidateFilters(
    filter: SubgraphPeerLinkFilter,
  ): ControlLinkFilters | undefined {
    const {subgraphSystemId, moduleSystemId, portSystemId} = filter;
    const candidateFilters: ControlLinkFilters[] = [];

    if (subgraphSystemId !== undefined) {
      candidateFilters.push(
        {sourceSubgraphSystemId: subgraphSystemId},
        {destSubgraphSystemId: subgraphSystemId},
      );
    }

    if (moduleSystemId !== undefined && portSystemId !== undefined) {
      candidateFilters.push(
        {
          peerNodeASystemId: moduleSystemId,
          nodeAPortSystemId: portSystemId,
        },
        {
          peerNodeBSystemId: moduleSystemId,
          nodeBPortSystemId: portSystemId,
        },
      );
    }

    return candidateFilters.length > 0 ? {$or: candidateFilters} : undefined;
  }

  private matchesSubgraphPeerFilter(
    link: ControlLinkBase,
    filter: SubgraphPeerLinkFilter,
  ): boolean {
    const hasModulePortFilter =
      filter.moduleSystemId !== undefined || filter.portSystemId !== undefined;
    const matchesModulePort =
      filter.moduleSystemId !== undefined && filter.portSystemId !== undefined
        ? (link.peerNodeASystemId === filter.moduleSystemId &&
            link.nodeAPortSystemId === filter.portSystemId) ||
          (link.peerNodeBSystemId === filter.moduleSystemId &&
            link.nodeBPortSystemId === filter.portSystemId)
        : !hasModulePortFilter;

    return this.matchesSubgraphFilter(link, filter) && matchesModulePort;
  }

  private matchesSubgraphFilter(
    link: ControlLinkBase,
    filter: SubgraphPeerLinkFilter,
  ): boolean {
    if (filter.subgraphSystemId === undefined) return true;
    if (link.sourceSubgraphSystemId === link.destSubgraphSystemId) return false;

    const selectedSubgraph = filter.subgraphSystemId;
    const peerSubgraph = filter.subgraphPeerSystemId;
    const matchesSelected =
      link.sourceSubgraphSystemId === selectedSubgraph ||
      link.destSubgraphSystemId === selectedSubgraph;
    if (!matchesSelected) return false;

    if (peerSubgraph === undefined) return true;

    return (
      (link.sourceSubgraphSystemId === selectedSubgraph &&
        link.destSubgraphSystemId === peerSubgraph) ||
      (link.sourceSubgraphSystemId === peerSubgraph &&
        link.destSubgraphSystemId === selectedSubgraph)
    );
  }
}
