/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {DataLinkRepository, UnitOfWork} from '@arc/core';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

export class TypeOrmDataLinkRepository implements DataLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;

  constructor(
    manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    this.linkFetcher = new LinkOverlayFetcher(
      manager,
      new EditActionsQueryService(manager),
    );
  }

  async getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    return this.linkFetcher.fetchDataLinks(
      portSystemIds,
      fileSystemId,
      sessionId,
    );
  }
}
