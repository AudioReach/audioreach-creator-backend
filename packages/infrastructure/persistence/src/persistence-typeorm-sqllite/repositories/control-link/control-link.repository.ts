/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {ControlLinkRepository, UnitOfWork} from '@arc/core';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

export class TypeOrmControlLinkRepository implements ControlLinkRepository {
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
    const links = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {nodeAPortSystemId: portSystemIds},
          {nodeBPortSystemId: portSystemIds},
        ],
      },
    );
    const portSet = new Set(portSystemIds);
    const entries: {linkSystemId: number; portSystemId: number}[] = [];
    for (const link of links) {
      if (portSet.has(link.nodeAPortSystemId))
        entries.push({
          linkSystemId: link.systemId,
          portSystemId: link.nodeAPortSystemId,
        });
      if (portSet.has(link.nodeBPortSystemId))
        entries.push({
          linkSystemId: link.systemId,
          portSystemId: link.nodeBPortSystemId,
        });
    }
    return entries;
  }
}
