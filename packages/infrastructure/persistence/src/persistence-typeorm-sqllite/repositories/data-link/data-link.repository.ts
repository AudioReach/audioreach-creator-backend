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
  EditOptions,
  SubsystemDataRouteContext,
} from '@arc/core';
import {DataLink, LINK_TYPE, SubsystemDataLink} from '@arc/core';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {EffectiveSubsystemDataLinkRow} from '../../fetchers/link-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

function baseToSubsystemDataLink(
  r: EffectiveSubsystemDataLinkRow,
): SubsystemDataLink {
  return new SubsystemDataLink({
    systemId: r.systemId,
    sourceNodeSystemId: r.sourceNodeSystemId,
    destinationNodeSystemId: r.destinationNodeSystemId,
    sourcePortSystemId: r.sourcePortSystemId,
    destinationPortSystemId: r.destinationPortSystemId,
    dataLinkSystemId: r.dataLinkSystemId,
    fileSystemId: r.fileSystemId,
  });
}

function baseToDataLink(
  r: DataLinkBase,
  subsystemDataLinks: SubsystemDataLink[] = [],
): DataLink {
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
    subsystemDataLinks,
  });
}

export class TypeOrmDataLinkRepository implements DataLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly writer: PendingChangeWriter;
  private readonly manager: EntityManager;
  private readonly uow: UnitOfWork;

  constructor(
    writer: PendingChangeWriter,
    manager: EntityManager,
    uow: UnitOfWork,
  ) {
    this.writer = writer;
    this.manager = manager;
    this.uow = uow;
    const editActions = new EditActionsQueryService(this.manager);
    this.linkFetcher = new LinkOverlayFetcher(this.manager, editActions);
    this.nodeFetcher = new NodeOverlayFetcher(this.manager, editActions);
  }

  private getWriter(): PendingChangeWriter {
    return this.writer;
  }

  async findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<DataLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {sourceNodeSystemId: moduleSystemId},
          {destinationNodeSystemId: moduleSystemId},
        ],
      },
    );
    const segments = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {dataLinkSystemId: rows.map(row => row.systemId)},
    );
    const segmentsByLink = new Map<number, SubsystemDataLink[]>();
    for (const segment of segments) {
      const list = segmentsByLink.get(segment.dataLinkSystemId ?? 0) ?? [];
      list.push(baseToSubsystemDataLink(segment));
      segmentsByLink.set(segment.dataLinkSystemId ?? 0, list);
    }
    return rows.map(row =>
      baseToDataLink(row, segmentsByLink.get(row.systemId) ?? []),
    );
  }

  async findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemDataLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {dataLinkSystemId: null},
    );
    const byNode = new Map<number, EffectiveSubsystemDataLinkRow[]>();
    for (const row of rows) {
      for (const nodeSystemId of [
        row.sourceNodeSystemId,
        row.destinationNodeSystemId,
      ]) {
        const links = byNode.get(nodeSystemId) ?? [];
        links.push(row);
        byNode.set(nodeSystemId, links);
      }
    }
    const queue = [moduleSystemId];
    const visitedNodes = new Set(queue);
    const visitedLinks = new Set<number>();
    while (queue.length > 0) {
      const nodeSystemId = queue.shift()!;
      for (const row of byNode.get(nodeSystemId) ?? []) {
        if (visitedLinks.has(row.systemId)) continue;
        visitedLinks.add(row.systemId);
        const nextNodeSystemId =
          row.sourceNodeSystemId === nodeSystemId
            ? row.destinationNodeSystemId
            : row.sourceNodeSystemId;
        if (!visitedNodes.has(nextNodeSystemId)) {
          visitedNodes.add(nextNodeSystemId);
          queue.push(nextNodeSystemId);
        }
      }
    }
    return rows
      .filter(row => visitedLinks.has(row.systemId))
      .map(row => baseToSubsystemDataLink(row));
  }

  async findSubsystemDataRouteContext(
    fileSystemId: number,
  ): Promise<SubsystemDataRouteContext> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
    );
    const nodeIds = [
      ...new Set(
        rows.flatMap(row => [
          row.sourceNodeSystemId,
          row.destinationNodeSystemId,
        ]),
      ),
    ];
    const nodes = await this.nodeFetcher.fetchMany(
      nodeIds,
      fileSystemId,
      sessionId,
    );

    return {
      subsystemDataLinks: rows.map(row => baseToSubsystemDataLink(row)),
      nodeTypeBySystemId: new Map(
        nodes.map(node => [node.systemId, node.type]),
      ),
    };
  }

  async deleteAggregate(
    dataLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const resolvedSegments = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {dataLinkSystemId},
    );
    const {session, groupId} = this.uow.getWriteContext();
    await this.getWriter().writeDelete(
      {
        targetTable: ENTITY_NAMES.DataLink,
        targetSystemId: dataLinkSystemId,
        aggregateId: dataLinkSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    for (const segment of resolvedSegments) {
      await this.getWriter().writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: segment.systemId,
          aggregateId: dataLinkSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async deleteSubsystemDataLinks(
    subsystemLinkSystemIds: number[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (subsystemLinkSystemIds.length === 0) return;
    const sessionId = this.uow.getWriteContext().session.sessionId;

    // 1. Load the requested segments in their effective session state.
    const targets = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {systemId: subsystemLinkSystemIds},
    );
    const targetIds = new Set(targets.map(target => target.systemId));

    // 2. Collect unique canonical links; null means the segment is unresolved.
    const resolvedDataLinkSystemIds = [
      ...new Set(
        targets.flatMap(target =>
          target.dataLinkSystemId === null ? [] : [target.dataLinkSystemId],
        ),
      ),
    ];

    // 3. Find all segments sharing the canonical links.
    const siblings =
      resolvedDataLinkSystemIds.length === 0
        ? []
        : await this.linkFetcher.loadSubsystemDataLinkRows(
            fileSystemId,
            sessionId,
            {dataLinkSystemId: resolvedDataLinkSystemIds},
          );
    const {session, groupId} = this.uow.getWriteContext();
    const writer = this.getWriter();

    // 4. Delete the requested subsystem segments.
    for (const target of targets) {
      await writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: target.systemId,
          aggregateId: target.systemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    // 5. Delete each referenced canonical data link once.
    for (const dataLinkSystemId of resolvedDataLinkSystemIds) {
      await writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.DataLink,
          targetSystemId: dataLinkSystemId,
          aggregateId: dataLinkSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    // 6. Detach non-target siblings for later unresolved-link resolution.
    for (const sibling of siblings) {
      if (targetIds.has(sibling.systemId)) continue;
      await writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: sibling.systemId,
          aggregateId: sibling.systemId,
          delta: {dataLinkSystemId: null},
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
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
