/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ControlLinkRepository,
  ControlLinkGraph,
  UnitOfWork,
  SessionChanged,
  EditOptions,
} from '@arc/core';
import {ControlLink, CONTROL_LINK_TYPE, SubsystemControlLink} from '@arc/core';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {EffectiveSubsystemControlLinkRow} from '../../fetchers/link-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

function baseToSubsystemControlLink(
  r: EffectiveSubsystemControlLinkRow,
): SubsystemControlLink {
  return new SubsystemControlLink(
    r.systemId,
    r.peerNodeASystemId,
    r.peerNodeBSystemId,
    r.nodeAPortSystemId,
    r.nodeBPortSystemId,
    r.controlLinkSystemId,
    r.fileSystemId,
    r.linkType,
    r.version,
  );
}

function baseToControlLink(
  r: ControlLinkBase,
  subsystemControlLinks: SubsystemControlLink[] = [],
): ControlLink {
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
    subsystemControlLinks,
  );
}

export class TypeOrmControlLinkRepository implements ControlLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;
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
  }

  private getWriter(): PendingChangeWriter {
    return this.writer;
  }

  async findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {peerNodeASystemId: moduleSystemId},
          {peerNodeBSystemId: moduleSystemId},
        ],
      },
    );
    const segments = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      sessionId,
      {controlLinkSystemId: rows.map(row => row.systemId)},
    );
    const segmentsByLink = new Map<number, SubsystemControlLink[]>();
    for (const segment of segments) {
      if (segment.controlLinkSystemId === null) continue;
      const list = segmentsByLink.get(segment.controlLinkSystemId) ?? [];
      list.push(baseToSubsystemControlLink(segment));
      segmentsByLink.set(segment.controlLinkSystemId, list);
    }
    return rows.map(row =>
      baseToControlLink(row, segmentsByLink.get(row.systemId) ?? []),
    );
  }

  async findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemControlLink[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      sessionId,
      {controlLinkSystemId: null},
    );
    const byNode = new Map<number, EffectiveSubsystemControlLinkRow[]>();
    for (const row of rows) {
      for (const nodeSystemId of [
        row.peerNodeASystemId,
        row.peerNodeBSystemId,
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
          row.peerNodeASystemId === nodeSystemId
            ? row.peerNodeBSystemId
            : row.peerNodeASystemId;
        if (!visitedNodes.has(nextNodeSystemId)) {
          visitedNodes.add(nextNodeSystemId);
          queue.push(nextNodeSystemId);
        }
      }
    }
    return rows
      .filter(row => visitedLinks.has(row.systemId))
      .map(row => baseToSubsystemControlLink(row));
  }

  async findAllLinks(fileSystemId: number): Promise<ControlLinkGraph> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [rows, controlLinkRows] = await Promise.all([
      this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
    ]);
    const segmentsByLinkId = new Map<number, SubsystemControlLink[]>();
    const standaloneSubsystemControlLinks: SubsystemControlLink[] = [];
    for (const row of rows) {
      const segment = baseToSubsystemControlLink(row);
      if (segment.controlLinkSystemId === null) {
        standaloneSubsystemControlLinks.push(segment);
        continue;
      }
      const segments = segmentsByLinkId.get(segment.controlLinkSystemId) ?? [];
      segments.push(segment);
      segmentsByLinkId.set(segment.controlLinkSystemId, segments);
    }

    return {
      controlLinks: controlLinkRows.map(row =>
        baseToControlLink(row, segmentsByLinkId.get(row.systemId) ?? []),
      ),
      standaloneSubsystemControlLinks,
    };
  }

  async deleteAggregate(
    controlLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const resolvedSegments =
      await this.linkFetcher.loadSubsystemControlLinkRows(
        fileSystemId,
        sessionId,
        {controlLinkSystemId},
      );
    const {session, groupId} = this.uow.getWriteContext();
    await this.getWriter().writeDelete(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: controlLinkSystemId,
        aggregateId: controlLinkSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    for (const segment of resolvedSegments) {
      await this.getWriter().writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: segment.systemId,
          aggregateId: controlLinkSystemId,
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
        linkType: CONTROL_LINK_TYPE.Normal,
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
      {linkType: CONTROL_LINK_TYPE.Normal},
    );
    return rows.map(row => baseToControlLink(row));
  }

  async createSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const segment of subsystemControlLinks) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.controlLinkSystemId ?? segment.systemId,
          payload: {
            peerNodeASystemId: segment.peerNodeASystemId,
            peerNodeBSystemId: segment.peerNodeBSystemId,
            nodeAPortSystemId: segment.nodeAPortSystemId,
            nodeBPortSystemId: segment.nodeBPortSystemId,
            controlLinkSystemId: segment.controlLinkSystemId,
            fileSystemId,
            version: segment.version,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async deleteSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    _fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const segment of subsystemControlLinks) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.controlLinkSystemId ?? segment.systemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
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
