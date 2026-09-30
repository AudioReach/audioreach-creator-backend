/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  DataLinkQueryService,
  Result,
  DataLinkReadModel,
  DataLinkWithUsecaseIdsReadModel,
  ModulePortLinkFilter,
  SubgraphLinkFilter,
  SubgraphPeerLinkFilter,
} from '@arc/core';
import {Result as R, IssueFactory} from '@arc/core';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {
  LinkOverlayFetcher,
  type DataLinkFilters,
} from '../../fetchers/link-overlay-fetcher.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';

/**
 * Database implementation of DataLinkQueryService.
 *
 * Scoping logic (by usecase JOINs, by subgraph OR) lives here.
 * Overlay (CREATE/UPDATE/DELETE) delegated to LinkOverlayFetcher.loadBaseDataLinkRows (FR-3).
 */
export class DbDataLinkQueryService implements DataLinkQueryService {
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly usecaseFetcher: UsecaseOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    usecaseFetcher: UsecaseOverlayFetcher,
    linkFetcher: LinkOverlayFetcher,
  ) {
    this.linkFetcher = linkFetcher;
    this.usecaseFetcher = usecaseFetcher;
  }

  async findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return R.ok([]);

    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Resolve subgraph IDs via the usecase fetcher (UseCase → Subgraph relation).
      const usecases = await this.usecaseFetcher.getUsecases(
        fileSystemId,
        sessionId,
        usecaseSystemIds,
      );
      const subgraphIds = [
        ...new Set(usecases.flatMap(uc => uc.subgraphSystemIds)),
      ];
      if (subgraphIds.length === 0) return R.ok([]);

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
      return R.ok(
        links.map(dl =>
          UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load data links for usecases',
        ),
      );
    }
  }

  async findSubgraphPeerLinks(
    filter: SubgraphPeerLinkFilter,
    fileSystemId: number,
  ): Promise<Result<DataLinkWithUsecaseIdsReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const links = await this.linkFetcher.loadDataLinkRows(
        fileSystemId,
        sessionId,
        this.buildCandidateFilters(filter),
      );
      const matchingLinks = links.filter(link =>
        this.matchesSubgraphPeerFilter(link, filter),
      );
      if (matchingLinks.length === 0) return R.ok([]);

      const usecases = await this.usecaseFetcher.getUsecases(
        fileSystemId,
        sessionId,
      );

      return R.ok(
        matchingLinks.map(link => ({
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
        })),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph-peer data links',
        ),
      );
    }
  }

  async findByModulePort(
    filter: ModulePortLinkFilter,
    fileSystemId: number,
  ): Promise<Result<DataLinkWithUsecaseIdsReadModel[]>> {
    return this.findSubgraphPeerLinks(
      {
        moduleSystemId: filter.moduleSystemId,
        portSystemId: filter.portSystemId,
      },
      fileSystemId,
    );
  }

  async findBySubgraph(
    filter: SubgraphLinkFilter,
    fileSystemId: number,
  ): Promise<Result<DataLinkWithUsecaseIdsReadModel[]>> {
    return this.findSubgraphPeerLinks(
      {
        subgraphSystemId: filter.subgraphSystemId,
        subgraphPeerSystemId: filter.subgraphPeerSystemId,
      },
      fileSystemId,
    );
  }

  private buildCandidateFilters(
    filter: SubgraphPeerLinkFilter,
  ): DataLinkFilters | undefined {
    // Build a broad OR prefilter for the database query. The final subgraph
    // and module-port intersection is applied by matchesSubgraphPeerFilter.
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

    const matchesSubgraph = this.matchesSubgraphFilter(link, filter);

    return matchesSubgraph && matchesModulePort;
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

  async findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Single $or call covers source OR destination subgraph in one SQL query.
      const links = await this.linkFetcher.loadDataLinkRows(
        fileSystemId,
        sessionId,
        {
          $or: [
            {sourceSubgraphSystemId: subgraphId},
            {destSubgraphSystemId: subgraphId},
          ],
        },
      );

      return R.ok(
        links.map(dl =>
          UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load data links for subgraph',
        ),
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────
}
