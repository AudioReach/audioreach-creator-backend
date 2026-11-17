/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  FailedEntity,
  IdentifiedEntityRef,
  DataLink,
  DataLinkQueryService,
  DataLinkReadModel,
  DataLinkWithUsecaseIdsReadModel,
  ReadOptions,
  SessionChanged,
  SubgraphPeerLinkFilter,
  SubsystemDataLink,
  SubsystemDataLinkReadModel,
} from '@arc/core';
import {
  CHANGE_OPERATION,
  DATA_LINK_TYPE,
  ENTITY_TYPE,
  FAILED_ENTITY_REASON,
  READ_MODE,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import type {
  DataLinkFilters,
  LinkOverlayFetcher,
} from '../../fetchers/link-overlay-fetcher.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import {toDataLink, toSubsystemDataLink} from './link-entity-mappers.js';
import {resolveCanonicalLinks} from './resolve-canonical-links.js';
import {
  NodeIdentityReader,
  pairEndpoints,
  type EndpointKey,
} from '../shared/node-identity-reader.js';
import {inRequestOrder} from '../../utils/in-request-order.js';
import {withNotFound} from '../../utils/with-not-found.js';

/**
 * Database implementation of DataLinkQueryService. Build it with
 * createDataLinkQueryService.
 */
export class DbDataLinkQueryService implements DataLinkQueryService {
  private readonly nodeIdentities: NodeIdentityReader;

  constructor(
    private readonly manager: EntityManager,
    private readonly editActions: EditActionsQueryService,
    private readonly usecaseFetcher: UsecaseOverlayFetcher,
    private readonly linkFetcher: LinkOverlayFetcher,
  ) {
    this.nodeIdentities = new NodeIdentityReader(manager, editActions);
  }

  async findByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<DataLinkReadModel[]> {
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
    if (subgraphIds.length === 0) return [];
    const links = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {
        sourceSubgraphSystemId: subgraphIds,
        destSubgraphSystemId: subgraphIds,
      },
    );
    return links.map(link =>
      UseCaseQueryMappers.mapToComponentDataLinkReadModel(link),
    );
  }

  async findBySubgraphIds(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<DataLinkReadModel[]> {
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
  ): Promise<DataLinkWithUsecaseIdsReadModel[]> {
    const sessionId = await this.sessionId(fileSystemId);
    const links = await this.linkFetcher.loadDataLinkRows(
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
    return matchingLinks.map(link => ({
      link: UseCaseQueryMappers.mapToComponentDataLinkReadModel(link),
      usecaseSystemIds: usecases
        .filter(usecase =>
          usecase.subgraphPairs.some(
            pair =>
              pair.sourceSubgraphSystemId === link.sourceSubgraphSystemId &&
              pair.destSubgraphSystemId === link.destSubgraphSystemId,
          ),
        )
        .map(usecase => usecase.systemId),
    }));
  }

  async findSegmentsByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<SubsystemDataLinkReadModel[]> {
    if (usecaseSystemIds.length === 0) return [];
    const sessionId = await this.sessionId(fileSystemId);
    const usecaseSubgraphIds = new Set(
      await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
        [...usecaseSystemIds],
        sessionId,
      ),
    );
    if (usecaseSubgraphIds.size === 0) return [];

    const [dataLinks, segments] = await Promise.all([
      this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadSubsystemDataLinkRows(fileSystemId, sessionId),
    ]);
    const dataLinkById = new Map(dataLinks.map(link => [link.systemId, link]));
    return segments.flatMap(segment => {
      const link =
        segment.dataLinkSystemId === null
          ? undefined
          : dataLinkById.get(segment.dataLinkSystemId);
      if (
        link === undefined ||
        !(
          usecaseSubgraphIds.has(link.sourceSubgraphSystemId) &&
          usecaseSubgraphIds.has(link.destSubgraphSystemId)
        )
      ) {
        return [];
      }
      // The segment takes its endpoints from itself and the rest from its
      // data link.
      return [
        UseCaseQueryMappers.mapToSubsystemDataLinkReadModel({
          ...link,
          systemId: segment.systemId,
          sourceNodeSystemId: segment.sourceNodeSystemId,
          destinationNodeSystemId: segment.destinationNodeSystemId,
          sourcePortSystemId: segment.sourcePortSystemId,
          destinationPortSystemId: segment.destinationPortSystemId,
        }),
      ];
    });
  }

  async findCanonicalLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<DataLink, typeof ENTITY_TYPE.DataLink>> {
    if (systemIds.length === 0)
      return {entityType: ENTITY_TYPE.DataLink, items: [], failed: []};
    const sessionId = await this.sessionId(fileSystemId);
    const requestedIds = [...systemIds];
    const [links, segments] = await Promise.all([
      this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId, {
        systemId: requestedIds,
      }),
      this.linkFetcher.loadSubsystemDataLinkRows(fileSystemId, sessionId, {
        systemId: requestedIds,
      }),
    ]);
    const resolved = await resolveCanonicalLinks(
      ENTITY_TYPE.DataLink,
      requestedIds,
      {
        links,
        segments,
        segmentSystemId: segment => segment.systemId,
        parentSystemId: segment => segment.dataLinkSystemId,
        loadLinks: ids =>
          this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId, {
            systemId: ids,
          }),
      },
    );
    return {
      ...resolved,
      items: await this.toDataLinks(fileSystemId, sessionId, resolved.items),
    };
  }

  async findDataLinkIdentities(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.DataLink>,
      typeof ENTITY_TYPE.DataLink
    >
  > {
    const requested = [...new Set(systemIds)];
    if (requested.length === 0)
      return {entityType: ENTITY_TYPE.DataLink, items: [], failed: []};

    const sessionId = await this.sessionId(fileSystemId);
    const links = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {systemId: requested},
    );
    const endpoints = await this.nodeIdentities.readEndpoints(
      fileSystemId,
      sessionId,
      'data',
      links.flatMap(link => dataLinkEndpoints(link)),
    );

    const items: IdentifiedEntityRef<typeof ENTITY_TYPE.DataLink>[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.DataLink>[] = [];
    for (const link of links) {
      const pair = pairEndpoints(endpoints, ...dataLinkEndpoints(link));
      if ('missingRef' in pair) {
        failed.push({
          systemId: link.systemId,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          missingRef: pair.missingRef,
        });
        continue;
      }
      items.push({
        entityType: ENTITY_TYPE.DataLink,
        systemId: link.systemId,
        identity: {source: pair[0], destination: pair[1]},
      });
    }
    return withNotFound(
      ENTITY_TYPE.DataLink,
      requested,
      inRequestOrder(requested, items),
      item => item.systemId,
      failed,
    );
  }

  async findIntraUcLinks(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<DataLink[]> {
    const sessionId =
      (options?.readMode ?? READ_MODE.Overlay) === READ_MODE.Committed
        ? null
        : await this.sessionId(fileSystemId);
    const rows = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {linkType: [DATA_LINK_TYPE.Normal, DATA_LINK_TYPE.Ec]},
    );
    // A column filter cannot compare two columns, so links inside one
    // subgraph are dropped here.
    return rows
      .filter(row => row.sourceSubgraphSystemId !== row.destSubgraphSystemId)
      .map(row => toDataLink(row));
  }

  async findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<DataLink>> {
    const sessionId = await this.sessionId(fileSystemId);
    if (sessionId === null) return {added: [], deleted: []};
    const changed = await this.linkFetcher.fetchChangedDataLinks(
      fileSystemId,
      sessionId,
    );
    return {
      added: changed.added.map(row => toDataLink(row)),
      deleted: changed.deleted.map(row => toDataLink(row)),
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
      $or: [{sourcePortSystemId: ports}, {destinationPortSystemId: ports}],
    };
    const [links, segments] = await Promise.all([
      this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId, filters),
      this.linkFetcher.loadSubsystemDataLinkRows(
        fileSystemId,
        sessionId,
        filters,
      ),
    ]);
    const portSet = new Set(ports);
    return [...links, ...segments].flatMap(link =>
      [link.sourcePortSystemId, link.destinationPortSystemId]
        .filter(portSystemId => portSet.has(portSystemId))
        .map(portSystemId => ({linkSystemId: link.systemId, portSystemId})),
    );
  }

  async findSegmentsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<SubsystemDataLinkReadModel[]> {
    if (portSystemIds.length === 0) return [];
    const ports = [...portSystemIds];
    const segments = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      await this.sessionId(fileSystemId),
      {$or: [{sourcePortSystemId: ports}, {destinationPortSystemId: ports}]},
    );
    return segments.map(segment =>
      UseCaseQueryMappers.mapToSubsystemDataLinkReadModel(segment),
    );
  }

  async findByPortPair(
    fileSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null> {
    const filter = {sourcePortSystemId, destinationPortSystemId};
    const sessionId = await this.sessionId(fileSystemId);

    // A committed link wins, even when the session deleted it.
    const committedRows = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      null,
      filter,
    );
    const committed = committedRows.at(0);
    if (committed !== undefined) {
      const actions =
        sessionId === null
          ? []
          : await this.editActions.getByTable(sessionId, ENTITY_NAMES.DataLink);
      const isDeleted = actions.some(
        action =>
          action.targetSystemId === committed.systemId &&
          action.operation === CHANGE_OPERATION.Delete,
      );
      return {systemId: committed.systemId, isDeleted};
    }

    if (sessionId === null) return null;
    const sessionRows = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      filter,
    );
    const created = sessionRows.at(0);
    return created === undefined
      ? null
      : {systemId: created.systemId, isDeleted: false};
  }

  /** Maps link rows to DataLinks, each with its subsystem segments. */
  private async toDataLinks(
    fileSystemId: number,
    sessionId: number | null,
    links: readonly DataLinkBase[],
  ): Promise<DataLink[]> {
    if (links.length === 0) return [];
    const segments = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {dataLinkSystemId: links.map(link => link.systemId)},
    );
    const segmentsByLink = new Map<number, SubsystemDataLink[]>();
    for (const segment of segments) {
      if (segment.dataLinkSystemId === null) continue;
      const list = segmentsByLink.get(segment.dataLinkSystemId) ?? [];
      list.push(toSubsystemDataLink(segment));
      segmentsByLink.set(segment.dataLinkSystemId, list);
    }
    return links.map(link =>
      toDataLink(link, segmentsByLink.get(link.systemId)),
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
  ): Promise<DataLinkReadModel[]> {
    if (subgraphIds.length === 0) return [];
    const links = await this.linkFetcher.loadDataLinkRows(
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
      UseCaseQueryMappers.mapToComponentDataLinkReadModel(link),
    );
  }

  /**
   * A broad OR prefilter for the database query; matchesSubgraphPeerFilter
   * applies the exact subgraph and module-port match.
   */
  private buildCandidateFilters(
    filter: SubgraphPeerLinkFilter,
  ): DataLinkFilters | undefined {
    const {subgraphSystemId, moduleSystemId, portSystemId} = filter;
    const candidateFilters: DataLinkFilters[] = [];

    if (subgraphSystemId !== undefined) {
      candidateFilters.push(
        {sourceSubgraphSystemId: subgraphSystemId},
        {destSubgraphSystemId: subgraphSystemId},
      );
    }

    if (moduleSystemId !== undefined && portSystemId !== undefined) {
      candidateFilters.push(
        {
          sourceNodeSystemId: moduleSystemId,
          sourcePortSystemId: portSystemId,
        },
        {
          destinationNodeSystemId: moduleSystemId,
          destinationPortSystemId: portSystemId,
        },
      );
    }

    return candidateFilters.length > 0 ? {$or: candidateFilters} : undefined;
  }

  private matchesSubgraphPeerFilter(
    link: DataLinkBase,
    filter: SubgraphPeerLinkFilter,
  ): boolean {
    const hasModulePortFilter =
      filter.moduleSystemId !== undefined || filter.portSystemId !== undefined;
    const matchesModulePort =
      filter.moduleSystemId !== undefined && filter.portSystemId !== undefined
        ? (link.sourceNodeSystemId === filter.moduleSystemId &&
            link.sourcePortSystemId === filter.portSystemId) ||
          (link.destinationNodeSystemId === filter.moduleSystemId &&
            link.destinationPortSystemId === filter.portSystemId)
        : !hasModulePortFilter;

    return this.matchesSubgraphFilter(link, filter) && matchesModulePort;
  }

  private matchesSubgraphFilter(
    link: DataLinkBase,
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

/** The two endpoints of a link, as read by `NodeIdentityReader`. */
function dataLinkEndpoints(
  link: DataLinkBase,
): readonly [EndpointKey, EndpointKey] {
  return [
    {
      nodeSystemId: link.sourceNodeSystemId,
      portSystemId: link.sourcePortSystemId,
    },
    {
      nodeSystemId: link.destinationNodeSystemId,
      portSystemId: link.destinationPortSystemId,
    },
  ];
}
