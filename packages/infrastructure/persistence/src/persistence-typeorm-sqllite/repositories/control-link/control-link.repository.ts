/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ControlLinkRepository,
  ControlLinkDelta,
  EditOptions,
  SubsystemControlLinkSpec,
  UnitOfWork,
} from '@arc/core';
import {ControlLink, CHANGE_OPERATION, SOURCE} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {ControlLinkRow} from '../../entity-schema/usecase-data/Links/control-link.js';

export class TypeOrmControlLinkRepository implements ControlLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly editActionsQs: EditActionsQueryService;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    this.editActionsQs = new EditActionsQueryService(manager);
    this.linkFetcher = new LinkOverlayFetcher(manager, this.editActionsQs);
  }

  async getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    return this.linkFetcher.fetchControlLinks(
      portSystemIds,
      fileSystemId,
      sessionId,
    );
  }

  async findNonDeletedByPort(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink[]> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    const deletedIds = new Set<number>();
    const stagedLinks: ControlLink[] = [];

    const actions = await this.editActionsQs.getByTable(
      sessionId,
      ENTITY_NAMES.ControlLink,
    );
    for (const a of actions) {
      if (a.operation === CHANGE_OPERATION.Delete) {
        deletedIds.add(a.targetSystemId);
      } else if (a.operation === CHANGE_OPERATION.Create) {
        const p = a.newValue as Record<string, number>;
        if (
          p['nodeAPortSystemId'] === portSystemId ||
          p['nodeBPortSystemId'] === portSystemId
        ) {
          stagedLinks.push(
            this.rowToControlLink(a.newValue as ControlLinkRow, a.targetSystemId),
          );
        }
      }
    }

    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where(
        '(cl.nodeAPortSystemId = :port OR cl.nodeBPortSystemId = :port)',
        {port: portSystemId},
      )
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as ControlLinkRow[];

    const committedLinks = rows
      .filter(r => !deletedIds.has(r.systemId))
      .map(r => this.rowToControlLink(r, r.systemId));

    return [...committedLinks, ...stagedLinks];
  }

  async findNonDeletedByPortPair(
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    // Check staged CREATEs first (link exists only in edit_actions)
    const actions = await this.editActionsQs.getByTable(
      sessionId,
      ENTITY_NAMES.ControlLink,
    );
    const createAction = actions.find(a => {
      if (a.operation !== CHANGE_OPERATION.Create) return false;
      const p = a.newValue as Record<string, number>;
      return (
        p['nodeAPortSystemId'] === nodeAPortSystemId &&
        p['nodeBPortSystemId'] === nodeBPortSystemId
      );
    });
    if (createAction) {
      return this.rowToControlLink(
        createAction.newValue as ControlLinkRow,
        createAction.targetSystemId,
      );
    }

    const row = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.nodeAPortSystemId = :portA', {portA: nodeAPortSystemId})
      .andWhere('cl.nodeBPortSystemId = :portB', {portB: nodeBPortSystemId})
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as ControlLinkRow | null;

    if (!row) return null;

    // Check if this committed row has a pending DELETE in the session
    const isDeleted = actions.some(
      a =>
        a.operation === CHANGE_OPERATION.Delete &&
        a.targetSystemId === row.systemId,
    );
    if (isDeleted) return null;

    return this.rowToControlLink(row, row.systemId);
  }

  async findSoftDeletedByPortPair(
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    const row = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.nodeAPortSystemId = :portA', {portA: nodeAPortSystemId})
      .andWhere('cl.nodeBPortSystemId = :portB', {portB: nodeBPortSystemId})
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as ControlLinkRow | null;

    if (!row) return null;

    const actions = await this.editActionsQs.getByTable(
      sessionId,
      ENTITY_NAMES.ControlLink,
    );
    const isDeleted = actions.some(
      a =>
        a.operation === CHANGE_OPERATION.Delete &&
        a.targetSystemId === row.systemId,
    );
    return isDeleted ? this.rowToControlLink(row, row.systemId) : null;
  }

  async createControlLink(
    link: ControlLink,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: link.systemId,
        aggregateId: link.systemId,
        payload: {
          fileSystemId: link.fileSystemId,
          peerNodeASystemId: link.peerNodeASystemId,
          peerNodeBSystemId: link.peerNodeBSystemId,
          nodeAPortSystemId: link.nodeAPortSystemId,
          nodeBPortSystemId: link.nodeBPortSystemId,
          heapId: link.heapId,
          linkType: link.linkType,
          sourceSubgraphSystemId: link.sourceSubgraphSystemId,
          destSubgraphSystemId: link.destSubgraphSystemId,
        },
        source: SOURCE.Manual,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async createSubsystemControlLink(
    scl: SubsystemControlLinkSpec,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SubsystemControlLink,
        targetSystemId: scl.systemId,
        aggregateId: scl.systemId,
        payload: {
          peerNodeASystemId: scl.peerNodeASystemId,
          peerNodeBSystemId: scl.peerNodeBSystemId,
          nodeAPortSystemId: scl.nodeAPortSystemId,
          nodeBPortSystemId: scl.nodeBPortSystemId,
          controlLinkSystemId: scl.controlLinkSystemId,
          fileSystemId: scl.fileSystemId,
        },
        source: SOURCE.Manual,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async stageControlPortCreate(args: {
    systemId: number;
    nodeSystemId: number;
    portId: number;
    isStatic: boolean;
    fileSystemId: number;
  }): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlPort,
        targetSystemId: args.systemId,
        aggregateId: args.nodeSystemId,
        payload: {
          portId: args.portId,
          isStatic: args.isStatic,
          name: '',
          nodeSystemId: args.nodeSystemId,
          fileSystemId: args.fileSystemId,
        },
        source: SOURCE.Manual,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async stageIntentCreate(args: {
    systemId: number;
    controlPortSystemId: number;
    intentId: number;
  }): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Intent,
        targetSystemId: args.systemId,
        aggregateId: args.controlPortSystemId,
        payload: {
          intentId: args.intentId,
          controlPortSystemId: args.controlPortSystemId,
        },
        source: SOURCE.Manual,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async patchControlLink(
    systemId: number,
    delta: ControlLinkDelta,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: systemId,
        aggregateId: systemId,
        delta: delta as Record<string, unknown>,
        source: SOURCE.Manual,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  private rowToControlLink(row: ControlLinkRow, systemId: number): ControlLink {
    return new ControlLink(
      systemId,
      row.fileSystemId,
      row.peerNodeASystemId,
      row.peerNodeBSystemId,
      row.nodeAPortSystemId,
      row.nodeBPortSystemId,
      row.heapId,
      row.linkType,
      row.sourceSubgraphSystemId,
      row.destSubgraphSystemId,
    );
  }
}
