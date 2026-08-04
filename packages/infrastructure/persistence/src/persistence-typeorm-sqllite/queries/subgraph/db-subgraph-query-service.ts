/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SubgraphQueryService,
  type PropertyPayloadReadModel,
  type ISessionRepository,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

export class DbSubgraphQueryService implements SubgraphQueryService {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;

  constructor(
    dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.subgraphFetcher = new SubgraphOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  async findPropertyPayloads(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyPayloadReadModel[] | null>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const overlaid = await this.subgraphFetcher.fetchOne(
        subgraphSystemId,
        fileSystemId,
        session?.sessionId ?? null,
      );
      if (!overlaid) return Result.ok(null);
      return Result.ok(
        overlaid.properties.map(p => ({
          systemId: p.systemId,
          propertySystemId: p.propertySystemId,
          payload: p.payload as Uint8Array | null,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph properties',
        severity: IssueSeverity.Error,
      });
    }
  }
}
