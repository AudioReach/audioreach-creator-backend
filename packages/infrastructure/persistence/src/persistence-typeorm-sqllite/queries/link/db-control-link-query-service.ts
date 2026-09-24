/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ControlLinkQueryService,
  Result,
  ControlLinkReadModel,
  ControlLinkWithUsecaseIdsReadModel,
  SubgraphPeerLinkFilter,
} from '@arc/core';
import {Result as R, IssueFactory} from '@arc/core';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {
  LinkOverlayFetcher,
  type ControlLinkFilters,
} from '../../fetchers/link-overlay-fetcher.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';

/**
 * Database implementation of ControlLinkQueryService.
 *
 * Scoping logic (by usecase JOINs, by subgraph OR) lives here.
 * Overlay (CREATE/UPDATE/DELETE) delegated to LinkOverlayFetcher.loadBaseControlLinkRows (FR-3).
 */
export class DbControlLinkQueryService implements ControlLinkQueryService {
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
  ): Promise<Result<ControlLinkReadModel[]>> {
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
      return R.ok(
        links.map(cl =>
          UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load control links for usecases',
        ),
      );
    }
  }

  async findSubgraphPeerLinks(
    filter: SubgraphPeerLinkFilter,
    fileSystemId: number,
  ): Promise<Result<ControlLinkWithUsecaseIdsReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const links = await this.linkFetcher.loadControlLinkRows(
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
          link: UseCaseQueryMappers.mapToComponentControlLinkReadModel(link),
          usecaseSystemIds: usecases
            .filter(usecase =>
              usecase.subgraphPairs.some(
                pair =>
                  (pair.sourceSubgraphSystemId ===
                    link.sourceSubgraphSystemId &&
                    pair.destSubgraphSystemId === link.destSubgraphSystemId) ||
                  (pair.sourceSubgraphSystemId === link.destSubgraphSystemId &&
                    pair.destSubgraphSystemId === link.sourceSubgraphSystemId),
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
            : 'Failed to load subgraph-peer control links',
        ),
      );
    }
  }

  private buildCandidateFilters(
    filter: SubgraphPeerLinkFilter,
  ): ControlLinkFilters | undefined {
    // Build a broad OR prefilter for the database query. The final subgraph
    // and module-port intersection is applied by matchesSubgraphPeerFilter.
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

    const matchesSubgraph =
      filter.subgraphSystemId === undefined ||
      ((link.sourceSubgraphSystemId === filter.subgraphSystemId ||
        link.destSubgraphSystemId === filter.subgraphSystemId) &&
        link.sourceSubgraphSystemId !== link.destSubgraphSystemId);

    return matchesSubgraph && matchesModulePort;
  }

  async findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      const links = await this.linkFetcher.loadControlLinkRows(
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
        links.map(cl =>
          UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load control links for subgraph',
        ),
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────
}
