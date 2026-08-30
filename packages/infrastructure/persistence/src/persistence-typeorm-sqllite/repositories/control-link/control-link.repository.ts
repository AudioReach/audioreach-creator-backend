/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ControlLinkRepository,
  UnitOfWork,
  SessionChanged,
} from '@arc/core';
import {ControlLink, LINK_TYPE} from '@arc/core';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

function baseToControlLink(r: ControlLinkBase): ControlLink {
  return new ControlLink(
    r.systemId,
    r.fileSystemId,
    r.peerNodeASystemId,
    r.peerNodeBSystemId,
    r.nodeAPortSystemId,
    r.nodeBPortSystemId,
    r.heapId,
    r.linkType,
    r.sourceSubgraphSystemId,
    r.destSubgraphSystemId,
  );
}

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

  async findIntraUcLinksForGivenSgPair(
    fileSystemId: number,
    peerASystemId: number,
    peerBSystemId: number,
  ): Promise<ControlLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    // Control links are undirected — match both stored directions.
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {
        linkType: LINK_TYPE.IntraUsecase,
        $or: [
          {
            sourceSubgraphSystemId: peerASystemId,
            destSubgraphSystemId: peerBSystemId,
          },
          {
            sourceSubgraphSystemId: peerBSystemId,
            destSubgraphSystemId: peerASystemId,
          },
        ],
      },
    );
    return rows.map(row => baseToControlLink(row));
  }

  async findIntraUcLinksByFile(fileSystemId: number): Promise<ControlLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {linkType: LINK_TYPE.IntraUsecase},
    );
    return rows.map(row => baseToControlLink(row));
  }

  async findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<ControlLink>> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const changed = await this.linkFetcher.fetchChangedControlLinks(
      fileSystemId,
      sessionId,
    );
    return {
      added: changed.added.map(row => baseToControlLink(row)),
      deleted: changed.deleted.map(row => baseToControlLink(row)),
    };
  }
}
