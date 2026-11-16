/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  BoundaryPortPayload,
  DataLink,
  DataLinkReadModel,
  DataLinkRepository,
  DataLinkTopology,
  DataLinkWithUsecaseIdsReadModel,
  EditOptions,
  ENTITY_TYPE,
  ReadOptions,
  SessionChanged,
  SubgraphPeerLinkFilter,
  SubsystemDataLink,
  SubsystemDataLinkReadModel,
  UnitOfWork,
} from '@arc/core';
import type {EffectiveSubsystemDataLinkRow} from '../../fetchers/link-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {DbDataLinkQueryService} from '../../queries/link/db-data-link-query-service.js';
import {createDataLinkQueryService} from '../../queries/link/create-data-link-query-service.js';
import {
  toDataLink,
  toSubsystemDataLink,
} from '../../queries/link/link-entity-mappers.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class TypeOrmDataLinkRepository implements DataLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly writer: PendingChangeWriter;
  private readonly manager: EntityManager;
  private readonly uow: UnitOfWork;
  /** Query reads, run on the unit-of-work manager. */
  private readonly queries: DbDataLinkQueryService;

  constructor(
    writer: PendingChangeWriter,
    manager: EntityManager,
    uow: UnitOfWork,
  ) {
    this.writer = writer;
    this.manager = manager;
    this.uow = uow;
    this.linkFetcher = new LinkOverlayFetcher(
      this.manager,
      new EditActionsQueryService(this.manager),
    );
    this.queries = createDataLinkQueryService(this.manager);
  }

  // ── Query reads (DataLinkQueryService) ──────────────────────────────────────

  findByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<DataLinkReadModel[]> {
    return this.queries.findByUsecaseIds(fileSystemId, usecaseSystemIds);
  }

  findBySubgraphIds(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<DataLinkReadModel[]> {
    return this.queries.findBySubgraphIds(fileSystemId, subgraphSystemIds);
  }

  findSubgraphPeerLinks(
    fileSystemId: number,
    filter: SubgraphPeerLinkFilter,
  ): Promise<DataLinkWithUsecaseIdsReadModel[]> {
    return this.queries.findSubgraphPeerLinks(fileSystemId, filter);
  }

  findSegmentsByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<SubsystemDataLinkReadModel[]> {
    return this.queries.findSegmentsByUsecaseIds(
      fileSystemId,
      usecaseSystemIds,
    );
  }

  findCanonicalLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<DataLink, typeof ENTITY_TYPE.DataLink>> {
    return this.queries.findCanonicalLinks(fileSystemId, systemIds);
  }

  findIntraUcLinks(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<DataLink[]> {
    return this.queries.findIntraUcLinks(fileSystemId, options);
  }

  findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<DataLink>> {
    return this.queries.findChangedInSession(fileSystemId);
  }

  findLinkIdsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    return this.queries.findLinkIdsByPorts(fileSystemId, portSystemIds);
  }

  findSegmentsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<SubsystemDataLinkReadModel[]> {
    return this.queries.findSegmentsByPorts(fileSystemId, portSystemIds);
  }

  findByPortPair(
    fileSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null> {
    return this.queries.findByPortPair(
      fileSystemId,
      sourcePortSystemId,
      destinationPortSystemId,
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

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
      if (segment.dataLinkSystemId === null) continue;
      const list = segmentsByLink.get(segment.dataLinkSystemId) ?? [];
      list.push(toSubsystemDataLink(segment));
      segmentsByLink.set(segment.dataLinkSystemId, list);
    }
    return rows.map(row =>
      toDataLink(row, segmentsByLink.get(row.systemId) ?? []),
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
      .map(row => toSubsystemDataLink(row));
  }

  async getAllLinks(fileSystemId: number): Promise<DataLinkTopology> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [rows, dataLinkRows] = await Promise.all([
      this.linkFetcher.loadSubsystemDataLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId),
    ]);
    const segmentsByLinkId = new Map<number, SubsystemDataLink[]>();
    const unresolvedSubsystemDataLinks: SubsystemDataLink[] = [];
    for (const row of rows) {
      const segment = toSubsystemDataLink(row);
      if (segment.dataLinkSystemId === null) {
        unresolvedSubsystemDataLinks.push(segment);
        continue;
      }
      const segments = segmentsByLinkId.get(segment.dataLinkSystemId) ?? [];
      segments.push(segment);
      segmentsByLinkId.set(segment.dataLinkSystemId, segments);
    }

    return {
      dataLinks: dataLinkRows.map(row =>
        toDataLink(row, segmentsByLinkId.get(row.systemId) ?? []),
      ),
      unresolvedSubsystemDataLinks,
    };
  }

  async deleteAggregate(
    dataLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;
    const resolvedSegments = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {dataLinkSystemId},
    );
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.DataLink,
        targetSystemId: dataLinkSystemId,
        aggregateId: dataLinkSystemId,
        ...options,
      },
      sessionId,
      this.manager,
    );
    for (const segment of resolvedSegments) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: segment.systemId,
          aggregateId: dataLinkSystemId,
          ...options,
        },
        sessionId,
        this.manager,
      );
    }
  }

  async resolveSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    dataLinkSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (subsystemDataLinks.length === 0) return;

    const {session} = this.uow.getWriteContext();
    await this.writer.writeDeltaBatch(
      subsystemDataLinks.map(segment => ({
        targetTable: ENTITY_NAMES.SubsystemDataLink,
        targetSystemId: segment.systemId,
        aggregateId: dataLinkSystemId,
        delta: {dataLinkSystemId},
        ...options,
      })),
      session.sessionId,
      this.manager,
    );
  }

  async createSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    for (const segment of subsystemDataLinks) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.dataLinkSystemId ?? segment.systemId,
          payload: {
            sourceNodeSystemId: segment.sourceNodeSystemId,
            destinationNodeSystemId: segment.destinationNodeSystemId,
            sourcePortSystemId: segment.sourcePortSystemId,
            destinationPortSystemId: segment.destinationPortSystemId,
            dataLinkSystemId: segment.dataLinkSystemId,
            fileSystemId,
          },
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async deleteSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (subsystemDataLinks.length === 0) return;

    const sessionId = this.uow.getWriteContext().session.sessionId;
    const requestedIds = [
      ...new Set(subsystemDataLinks.map(segment => segment.systemId)),
    ];
    const effectiveSegments = await this.linkFetcher.loadSubsystemDataLinkRows(
      fileSystemId,
      sessionId,
      {systemId: requestedIds},
    );
    if (effectiveSegments.length === 0) return;

    const {session} = this.uow.getWriteContext();
    for (const segment of effectiveSegments) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.dataLinkSystemId ?? segment.systemId,
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }

    const canonicalIds = [
      ...new Set(
        effectiveSegments
          .map(segment => segment.dataLinkSystemId)
          .filter((systemId): systemId is number => systemId !== null),
      ),
    ];
    if (canonicalIds.length === 0) return;

    const canonicalLinks = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {systemId: canonicalIds},
    );
    for (const canonical of canonicalLinks) {
      const remainingSegments =
        await this.linkFetcher.loadSubsystemDataLinkRows(
          fileSystemId,
          sessionId,
          {dataLinkSystemId: canonical.systemId},
        );
      if (remainingSegments.length > 0) {
        await this.detachRemainingSubsystemDataLinks(
          remainingSegments.map(segment => toSubsystemDataLink(segment)),
          options,
        );
      }
      await this.deleteAggregate(canonical.systemId, fileSystemId, options);
    }
  }

  private async detachRemainingSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    for (const segment of subsystemDataLinks) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: segment.systemId,
          aggregateId: segment.dataLinkSystemId ?? segment.systemId,
          delta: {dataLinkSystemId: null},
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async createDataLink(
    dataLink: DataLink,
    boundaryPortPayloads: BoundaryPortPayload[],
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const fileSystemId = dataLink.fileSystemId;
    const writer = this.requireWriter();

    // Boundary ports attach to subsystem nodes that already exist in the
    // base `nodes` table (see buildTraversalEntities — nodeSystemId always
    // comes from the pre-loaded nodeParentMap). Only the DataPort itself is
    // new, so no Node CREATE row is written here.
    await this.writeBoundaryPortCreates(
      boundaryPortPayloads,
      dataLink.systemId,
      session.sessionId,
      writer,
      options,
    );

    await writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.DataLink,
        targetSystemId: dataLink.systemId,
        aggregateId: dataLink.systemId,
        payload: {
          sourceNodeSystemId: dataLink.sourceNodeSystemId,
          destinationNodeSystemId: dataLink.destinationNodeSystemId,
          sourcePortSystemId: dataLink.sourcePortSystemId,
          destinationPortSystemId: dataLink.destinationPortSystemId,
          linkType: dataLink.linkType,
          sourceSubgraphSystemId: dataLink.sourceSubgraphSystemId,
          destSubgraphSystemId: dataLink.destSubgraphSystemId,
          fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      this.manager,
    );

    await this.writeSubsystemDataLinkCreates(
      dataLink.subsystemDataLinks,
      dataLink.systemId,
      fileSystemId,
      session.sessionId,
      writer,
      options,
    );
  }

  private async writeBoundaryPortCreates(
    boundaryPortPayloads: BoundaryPortPayload[],
    aggregateId: number,
    sessionId: number,
    writer: PendingChangeWriter,
    options?: EditOptions,
  ): Promise<void> {
    for (const bp of boundaryPortPayloads) {
      await writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.DataPort,
          targetSystemId: bp.portSystemId,
          aggregateId,
          payload: {
            dataPortId: bp.dataPortId,
            portIoType: bp.portIoType,
            isStatic: false,
            name: '',
            nodeSystemId: bp.nodeSystemId,
            fileSystemId: bp.fileSystemId,
          },
          ...options,
        },
        sessionId,
        this.manager,
      );
    }
  }

  private async writeSubsystemDataLinkCreates(
    subsystemDataLinks: SubsystemDataLink[],
    aggregateId: number,
    fileSystemId: number,
    sessionId: number,
    writer: PendingChangeWriter,
    options?: EditOptions,
  ): Promise<void> {
    for (const sls of subsystemDataLinks) {
      await writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: sls.systemId,
          aggregateId,
          payload: {
            sourceNodeSystemId: sls.sourceNodeSystemId,
            destinationNodeSystemId: sls.destinationNodeSystemId,
            sourcePortSystemId: sls.sourcePortSystemId,
            destinationPortSystemId: sls.destinationPortSystemId,
            dataLinkSystemId: sls.dataLinkSystemId,
            fileSystemId,
            linkType: sls.linkType,
          },
          ...options,
        },
        sessionId,
        this.manager,
      );
    }
  }

  async createSubsystemDataLink(
    sls: SubsystemDataLink,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const writer = this.requireWriter();
    await writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SubsystemDataLink,
        targetSystemId: sls.systemId,
        aggregateId: sls.systemId,
        payload: {
          sourceNodeSystemId: sls.sourceNodeSystemId,
          destinationNodeSystemId: sls.destinationNodeSystemId,
          sourcePortSystemId: sls.sourcePortSystemId,
          destinationPortSystemId: sls.destinationPortSystemId,
          dataLinkSystemId: null,
          fileSystemId: sls.fileSystemId,
          linkType: sls.linkType,
        },
        ...options,
      },
      session.sessionId,
      this.manager,
    );
  }

  private requireWriter(): NonNullable<typeof this.writer> {
    if (!this.writer) {
      throw new Error(
        'PendingChangeWriter is required for write operations on DataLinkRepository',
      );
    }
    return this.writer;
  }
}
