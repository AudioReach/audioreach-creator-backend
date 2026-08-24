/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ControlLinkQueryService,
  Result,
  ControlLinkReadModel,
} from '@arc/core';
import {Result as R, IssueFactory} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';

/**
 * Database implementation of ControlLinkQueryService.
 *
 * All overlay delegated to LinkOverlayFetcher (FR-3):
 *   fetchControlLinksByUsecaseIds — INTRA_SUBGRAPH + INTRA_USECASE links for
 *     the given usecases (two parallel baseline queries, one overlay pass)
 *   fetchControlLinksBySubgraphId — all links where the subgraph is source OR
 *     destination (covers links from/to other usecases)
 */
export class DbControlLinkQueryService implements ControlLinkQueryService {
  private readonly linkFetcher: LinkOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQuerySvc: EditActionsQueryService,
  ) {
    this.linkFetcher = new LinkOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
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
      const links = await this.linkFetcher.fetchControlLinksByUsecaseIds(
        usecaseSystemIds,
        fileSystemId,
        sessionId,
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

  async findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const links = await this.linkFetcher.fetchControlLinksBySubgraphId(
        subgraphId,
        fileSystemId,
        sessionId,
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
