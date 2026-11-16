/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  ControlLink,
  ControlLinkReadModel,
  ControlLinkRepository,
  ControlLinkTopology,
  ControlLinkWithUsecaseIdsReadModel,
  EditOptions,
  ENTITY_TYPE,
  SessionChanged,
  SubgraphPeerLinkFilter,
  SubsystemControlLink,
  UnitOfWork,
} from '@arc/core';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import type {EffectiveSubsystemControlLinkRow} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {DbControlLinkQueryService} from '../../queries/link/db-control-link-query-service.js';
import {createControlLinkQueryService} from '../../queries/link/create-control-link-query-service.js';
import {findControlPortOwner} from '../../queries/link/find-control-port-owner.js';
import {
  toControlLink,
  toSubsystemControlLink,
} from '../../queries/link/link-entity-mappers.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class TypeOrmControlLinkRepository implements ControlLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly editActionsQs: EditActionsQueryService;
  /** Query reads, run on the unit-of-work manager. */
  private readonly queries: DbControlLinkQueryService;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    this.editActionsQs = new EditActionsQueryService(manager);
    this.linkFetcher = new LinkOverlayFetcher(manager, this.editActionsQs);
    this.queries = createControlLinkQueryService(manager);
  }

  // ── Query reads (ControlLinkQueryService) ───────────────────────────────────

  findByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    return this.queries.findByUsecaseIds(fileSystemId, usecaseSystemIds);
  }

  findBySubgraphIds(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    return this.queries.findBySubgraphIds(fileSystemId, subgraphSystemIds);
  }

  findSubgraphPeerLinks(
    fileSystemId: number,
    filter: SubgraphPeerLinkFilter,
  ): Promise<ControlLinkWithUsecaseIdsReadModel[]> {
    return this.queries.findSubgraphPeerLinks(fileSystemId, filter);
  }

  findControlLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>> {
    return this.queries.findControlLinks(fileSystemId, systemIds);
  }

  findControlLinkSegments(
    fileSystemId: number,
    linkSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    return this.queries.findControlLinkSegments(fileSystemId, linkSystemIds);
  }

  findSegmentsByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]> {
    return this.queries.findSegmentsByUsecaseIds(
      fileSystemId,
      usecaseSystemIds,
    );
  }

  findCanonicalLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>> {
    return this.queries.findCanonicalLinks(fileSystemId, systemIds);
  }

  findIntraUcLinks(fileSystemId: number): Promise<ControlLink[]> {
    return this.queries.findIntraUcLinks(fileSystemId);
  }

  findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<ControlLink>> {
    return this.queries.findChangedInSession(fileSystemId);
  }

  findLinkIdsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    return this.queries.findLinkIdsByPorts(fileSystemId, portSystemIds);
  }

  findByPortPair(
    fileSystemId: number,
    portASystemId: number,
    portBSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null> {
    return this.queries.findByPortPair(
      fileSystemId,
      portASystemId,
      portBSystemId,
    );
  }

  findAllocatedIntents(
    fileSystemId: number,
    controlPortSystemId: number,
  ): Promise<{intentSystemId: number; intentId: number}[]> {
    return this.queries.findAllocatedIntents(fileSystemId, controlPortSystemId);
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

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
      list.push(toSubsystemControlLink(segment));
      segmentsByLink.set(segment.controlLinkSystemId, list);
    }
    return rows.map(row =>
      toControlLink(row, segmentsByLink.get(row.systemId) ?? []),
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
      .map(row => toSubsystemControlLink(row));
  }

  async getAllLinks(fileSystemId: number): Promise<ControlLinkTopology> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [rows, controlLinkRows] = await Promise.all([
      this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
    ]);
    const segmentsByLinkId = new Map<number, SubsystemControlLink[]>();
    const unresolvedSubsystemControlLinks: SubsystemControlLink[] = [];
    for (const row of rows) {
      const segment = toSubsystemControlLink(row);
      if (segment.controlLinkSystemId === null) {
        unresolvedSubsystemControlLinks.push(segment);
        continue;
      }
      const segments = segmentsByLinkId.get(segment.controlLinkSystemId) ?? [];
      segments.push(segment);
      segmentsByLinkId.set(segment.controlLinkSystemId, segments);
    }

    return {
      controlLinks: controlLinkRows.map(row =>
        toControlLink(row, segmentsByLinkId.get(row.systemId) ?? []),
      ),
      unresolvedSubsystemControlLinks,
    };
  }

  async deleteAggregate(
    controlLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;
    const resolvedSegments =
      await this.linkFetcher.loadSubsystemControlLinkRows(
        fileSystemId,
        sessionId,
        {controlLinkSystemId},
      );
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: controlLinkSystemId,
        aggregateId: controlLinkSystemId,
        ...options,
      },
      sessionId,
      this.manager,
    );
    for (const segment of resolvedSegments) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: segment.systemId,
          aggregateId: controlLinkSystemId,
          ...options,
        },
        sessionId,
        this.manager,
      );
    }
  }

  async createAggregate(
    controlLink: ControlLink,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: controlLink.systemId,
        aggregateId: controlLink.systemId,
        payload: {
          fileSystemId,
          peerNodeASystemId: controlLink.peerNodeASystemId,
          peerNodeBSystemId: controlLink.peerNodeBSystemId,
          nodeAPortSystemId: controlLink.nodeAPortSystemId,
          nodeBPortSystemId: controlLink.nodeBPortSystemId,
          heapId: controlLink.heapId,
          linkType: controlLink.linkType,
          sourceSubgraphSystemId: controlLink.sourceSubgraphSystemId,
          destSubgraphSystemId: controlLink.destSubgraphSystemId,
        },
        ...options,
      },
      session.sessionId,
      this.manager,
    );
  }

  async resolveSubsystemControlLinks(
    subsystemLinkSystemIds: readonly number[],
    controlLinkSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (subsystemLinkSystemIds.length === 0) return;

    const {session} = this.uow.getWriteContext();
    await this.writer.writeDeltaBatch(
      subsystemLinkSystemIds.map(systemId => ({
        targetTable: ENTITY_NAMES.SubsystemControlLink,
        targetSystemId: systemId,
        aggregateId: controlLinkSystemId,
        delta: {controlLinkSystemId},
        ...options,
      })),
      session.sessionId,
      this.manager,
    );
  }

  async createSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
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
          },
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async deleteSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (subsystemControlLinks.length === 0) return;

    const sessionId = this.uow.getWriteContext().session.sessionId;
    const requestedIds = [
      ...new Set(subsystemControlLinks.map(segment => segment.systemId)),
    ];
    const effectiveSegments =
      await this.linkFetcher.loadSubsystemControlLinkRows(
        fileSystemId,
        sessionId,
        {systemId: requestedIds},
      );
    if (effectiveSegments.length === 0) return;

    const {session} = this.uow.getWriteContext();
    for (const segment of effectiveSegments) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.controlLinkSystemId ?? segment.systemId,
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }

    const canonicalIds = [
      ...new Set(
        effectiveSegments
          .map(segment => segment.controlLinkSystemId)
          .filter((systemId): systemId is number => systemId !== null),
      ),
    ];
    if (canonicalIds.length === 0) return;

    const canonicalLinks = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {systemId: canonicalIds},
    );
    for (const canonical of canonicalLinks) {
      const remainingSegments =
        await this.linkFetcher.loadSubsystemControlLinkRows(
          fileSystemId,
          sessionId,
          {controlLinkSystemId: canonical.systemId},
        );
      if (remainingSegments.length > 0) {
        await this.detachRemainingSubsystemControlLinks(
          remainingSegments.map(segment => toSubsystemControlLink(segment)),
          options,
        );
      }
      await this.deleteAggregate(canonical.systemId, fileSystemId, options);
    }
  }

  private async detachRemainingSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    for (const segment of subsystemControlLinks) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.controlLinkSystemId ?? segment.systemId,
          delta: {controlLinkSystemId: null},
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async createControlLink(link: ControlLink): Promise<void> {
    const {session} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: link.systemId,
        aggregateId: link.systemId,
        payload: {...link, subsystemControlLinks: undefined},
      },
      session.sessionId,
      this.manager,
    );
    for (const segment of link.subsystemControlLinks)
      await this.createSubsystemControlLink(segment);
  }

  async updateHeapId(systemId: number, heapId: number): Promise<void> {
    const {session} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: systemId,
        aggregateId: systemId,
        delta: {heapId},
      },
      session.sessionId,
      this.manager,
    );
  }

  async createSubsystemControlLink(link: SubsystemControlLink): Promise<void> {
    const {session} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SubsystemControlLink,
        targetSystemId: link.systemId,
        aggregateId: link.controlLinkSystemId ?? link.systemId,
        payload: {
          peerNodeASystemId: link.peerNodeASystemId,
          peerNodeBSystemId: link.peerNodeBSystemId,
          nodeAPortSystemId: link.nodeAPortSystemId,
          nodeBPortSystemId: link.nodeBPortSystemId,
          controlLinkSystemId: link.controlLinkSystemId,
          fileSystemId: link.fileSystemId,
        },
      },
      session.sessionId,
      this.manager,
    );
  }

  async updateIntents(
    controlPortSystemId: number,
    toCreate: {systemId: number; intentId: number}[],
    toDelete: number[],
  ): Promise<void> {
    if (toCreate.length === 0 && toDelete.length === 0) return;
    const {session} = this.uow.getWriteContext();
    const nodeSystemId = await findControlPortOwner(
      this.manager,
      this.editActionsQs,
      session.sessionId,
      controlPortSystemId,
      session.fileSystemId,
    );
    for (const systemId of toDelete)
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.Intent,
          targetSystemId: systemId,
          aggregateId: nodeSystemId,
        },
        session.sessionId,
        this.manager,
      );
    for (const intent of toCreate)
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.Intent,
          targetSystemId: intent.systemId,
          aggregateId: nodeSystemId,
          payload: {
            systemId: intent.systemId,
            controlPortSystemId,
            naturalId: intent.intentId,
          },
        },
        session.sessionId,
        this.manager,
      );
  }
}
