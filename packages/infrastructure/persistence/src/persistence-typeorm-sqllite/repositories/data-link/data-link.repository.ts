/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  DataLinkRepository,
  UnitOfWork,
  SubgraphPair,
  LinksForPair,
  SessionChanged,
} from '@arc/core';
import {DataLink, LINK_TYPE} from '@arc/core';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

function baseToDataLink(r: DataLinkBase): DataLink {
  return new DataLink({
    systemId: r.systemId,
    sourceNodeSystemId: r.sourceNodeSystemId,
    destinationNodeSystemId: r.destinationNodeSystemId,
    sourcePortSystemId: r.sourcePortSystemId,
    destinationPortSystemId: r.destinationPortSystemId,
    linkType: r.linkType,
    sourceSubgraphSystemId: r.sourceSubgraphSystemId,
    destSubgraphSystemId: r.destSubgraphSystemId,
    isEc: r.isEc ?? undefined,
    fileSystemId: r.fileSystemId,
  });
}

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
    const links = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {sourcePortSystemId: portSystemIds},
          {destinationPortSystemId: portSystemIds},
        ],
      },
    );
    const portSet = new Set(portSystemIds);
    const entries: {linkSystemId: number; portSystemId: number}[] = [];
    for (const link of links) {
      if (portSet.has(link.sourcePortSystemId))
        entries.push({
          linkSystemId: link.systemId,
          portSystemId: link.sourcePortSystemId,
        });
      if (portSet.has(link.destinationPortSystemId))
        entries.push({
          linkSystemId: link.systemId,
          portSystemId: link.destinationPortSystemId,
        });
    }
    return entries;
  }

  async findIntraUcLinksForGivenSgPair(
    fileSystemId: number,
    pairs: readonly SubgraphPair[],
  ): Promise<LinksForPair<DataLink>[]> {
    if (pairs.length === 0) return [];
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {
        linkType: LINK_TYPE.IntraUsecase,
        $or: pairs.map(p => ({
          sourceSubgraphSystemId: p.sourceSubgraphSystemId,
          destSubgraphSystemId: p.destSubgraphSystemId,
        })),
      },
    );
    const result: LinksForPair<DataLink>[] = pairs.map(pair => ({
      pair,
      links: [],
    }));
    const pairIndex = new Map(
      pairs.map((p, i) => [
        `${p.sourceSubgraphSystemId}:${p.destSubgraphSystemId}`,
        i,
      ]),
    );
    for (const row of rows) {
      const idx = pairIndex.get(
        `${row.sourceSubgraphSystemId}:${row.destSubgraphSystemId}`,
      );
      if (idx !== undefined) result[idx].links.push(baseToDataLink(row));
    }
    return result;
  }

  async findIntraUcLinksByFile(fileSystemId: number): Promise<DataLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {linkType: LINK_TYPE.IntraUsecase},
    );
    return rows.map(row => baseToDataLink(row));
  }

  async findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<DataLink>> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const changed = await this.linkFetcher.fetchChangedDataLinks(
      fileSystemId,
      sessionId,
    );
    return {
      added: changed.added.map(row => baseToDataLink(row)),
      deleted: changed.deleted.map(row => baseToDataLink(row)),
    };
  }
}
