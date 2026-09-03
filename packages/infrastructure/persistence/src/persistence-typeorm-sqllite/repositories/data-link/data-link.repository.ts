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
  BoundaryPortPayload,
  EditOptions,
  SubsystemDataLink,
} from '@arc/core';
import {DataLink, LINK_TYPE, CHANGE_OPERATION} from '@arc/core';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

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
  private readonly editActionsQueryService: EditActionsQueryService;

  constructor(
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly writer?: PendingChangeWriter,
  ) {
    this.editActionsQueryService = new EditActionsQueryService(manager);
    this.linkFetcher = new LinkOverlayFetcher(
      manager,
      this.editActionsQueryService,
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

  async createDataLink(
    dataLink: DataLink,
    boundaryPortPayloads: BoundaryPortPayload[],
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = dataLink.fileSystemId;
    const writer = this.requireWriter();

    for (const bp of boundaryPortPayloads) {
      await writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.Node,
          targetSystemId: bp.nodeSystemId,
          aggregateId: dataLink.systemId,
          payload: {
            type: 'subsystem',
            parentId: bp.nodeParentId ?? null,
            fileSystemId: bp.fileSystemId,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    for (const bp of boundaryPortPayloads) {
      await writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.DataPort,
          targetSystemId: bp.portSystemId,
          aggregateId: dataLink.systemId,
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
        session.sessionId,
        groupId,
        this.manager,
      );
    }

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
          isEc: dataLink.isEc ?? null,
          fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );

    for (const sls of dataLink.subsystemDataLinks) {
      await writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.SubsystemDataLink,
          targetSystemId: sls.systemId,
          aggregateId: dataLink.systemId,
          payload: {
            sourceNodeSystemId: sls.sourceNodeSystemId,
            destinationNodeSystemId: sls.destinationNodeSystemId,
            sourcePortSystemId: sls.sourcePortSystemId,
            destinationPortSystemId: sls.destinationPortSystemId,
            dataLinkSystemId: sls.dataLinkSystemId,
            fileSystemId,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async findByPortPair(
    sourcePortSystemId: number,
    destPortSystemId: number,
    fileSystemId: number,
  ): Promise<{
    systemId: number;
    isDeleted: boolean;
    payload: Record<string, unknown>;
  } | null> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    const baseRow = await this.manager
      .createQueryBuilder()
      .select('dl.systemId')
      .from(ENTITY_NAMES.DataLink, 'dl')
      .where(
        'dl.sourcePortSystemId = :srcPort AND dl.destinationPortSystemId = :dstPort AND dl.fileSystemId = :fileSystemId',
        {srcPort: sourcePortSystemId, dstPort: destPortSystemId, fileSystemId},
      )
      .getRawOne<{dl_system_id: number}>();

    if (baseRow) {
      const systemId = Number(baseRow.dl_system_id);
      const actions = await this.editActionsQueryService.getByTable(
        sessionId,
        ENTITY_NAMES.DataLink,
      );
      const isDeleted = actions.some(
        a =>
          a.targetSystemId === systemId &&
          a.operation === CHANGE_OPERATION.Delete,
      );
      return {
        systemId,
        isDeleted,
        payload: {
          sourcePortSystemId,
          destinationPortSystemId: destPortSystemId,
          fileSystemId,
        },
      };
    }

    const actions = await this.editActionsQueryService.getByTable(
      sessionId,
      ENTITY_NAMES.DataLink,
    );
    for (const action of actions) {
      if (action.operation !== CHANGE_OPERATION.Create) continue;
      const p = action.newValue as Record<string, unknown>;
      if (
        Number(p['sourcePortSystemId']) === sourcePortSystemId &&
        Number(p['destinationPortSystemId']) === destPortSystemId &&
        Number(p['fileSystemId']) === fileSystemId
      ) {
        return {systemId: action.targetSystemId, isDeleted: false, payload: p};
      }
    }

    return null;
  }

  async reactivateDataLink(
    systemId: number,
    aggregateId: number,
    payload: Record<string, unknown>,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const writer = this.requireWriter();
    // eslint-disable-next-line custom/no-raw-persistence-queries -- conditional UPDATE with IS NULL on valid_until cannot be expressed with TypeORM QueryBuilder
    await this.manager.query(
      `UPDATE edit_actions SET valid_until = $1 WHERE session_id = $2 AND target_system_id = $3 AND field_path IS NULL AND valid_until IS NULL`,
      [new Date().toISOString(), session.sessionId, systemId],
    );
    await writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.DataLink,
        targetSystemId: systemId,
        aggregateId,
        payload,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async createSubsystemDataLink(
    sls: SubsystemDataLink,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
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
        },
        ...options,
      },
      session.sessionId,
      groupId,
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
