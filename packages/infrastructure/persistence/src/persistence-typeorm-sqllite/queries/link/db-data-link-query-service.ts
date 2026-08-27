/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {DataLinkQueryService, Result, DataLinkReadModel} from '@arc/core';
import {Result as R, IssueFactory} from '@arc/core';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
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
      const subgraphIds =
        await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
          usecaseSystemIds,
          sessionId,
        );
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
