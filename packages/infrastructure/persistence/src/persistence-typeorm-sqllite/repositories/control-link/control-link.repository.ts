/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {ControlLinkRepository, UnitOfWork, ControlLink, SubsystemControlLink} from '@arc/core';
import {ControlLink as ControlLinkEntity, SubsystemControlLink as SclEntity, CHANGE_OPERATION} from '@arc/core';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {ControlLinkRow} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {SubsystemControlLinkRow} from '../../entity-schema/usecase-data/Links/subsystem-control-link.schema.js';
import type {IntentBase} from '../../entity-schema/usecase-data/node/control-port.js';

export class TypeOrmControlLinkRepository implements ControlLinkRepository {
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly editActionsQs: EditActionsQueryService;

  constructor(
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly writer: PendingChangeWriter,
  ) {
    this.editActionsQs = new EditActionsQueryService(manager);
    this.linkFetcher = new LinkOverlayFetcher(manager, this.editActionsQs);
  }

  async getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    return this.linkFetcher.fetchControlLinks(portSystemIds, fileSystemId, sessionId);
  }

  async findBySystemId(systemId: number, fileSystemId: number): Promise<ControlLink | null> {
    const results = await this.findBySystemIds([systemId], fileSystemId);
    return results[0] ?? null;
  }

  async findBySystemIds(systemIds: number[], fileSystemId: number): Promise<ControlLink[]> {
    if (systemIds.length === 0) return [];

    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    // Load base rows
    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.systemId IN (:...ids)', {ids: systemIds})
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as ControlLinkRow[];

    // Apply session overlay (CREATE/DELETE actions)
    const overlaidRows = await this.applyControlLinkOverlay(rows, systemIds, sessionId, fileSystemId);

    return overlaidRows.map(row =>
      new ControlLinkEntity(
        row.systemId,
        row.fileSystemId,
        row.peerNodeASystemId,
        row.peerNodeBSystemId,
        row.nodeAPortSystemId,
        row.nodeBPortSystemId,
        row.heapId,
        row.linkType,
        row.sourceSubgraphSystemId,
        row.destSubgraphSystemId,
      ),
    );
  }

  async findActiveByPortPair(
    portASystemId: number,
    portBSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    // Check base rows
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.nodeAPortSystemId = :portA', {portA: portASystemId})
      .andWhere('cl.nodeBPortSystemId = :portB', {portB: portBSystemId})
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as unknown as ControlLinkRow | null;

    if (baseRow !== null) {
      // Check if it's been deleted in the session
      if (sessionId !== null) {
        const actions = await this.editActionsQs.getByAggregateId(sessionId, baseRow.systemId);
        const isDeleted = actions.some(a => a.operation === CHANGE_OPERATION.Delete);
        if (isDeleted) return null;
      }
      return this.rowToEntity(baseRow, fileSystemId);
    }

    // Check session CREATE actions
    if (sessionId !== null) {
      const created = await this.findCreatedByPortPair(portASystemId, portBSystemId, sessionId, fileSystemId);
      if (created !== null) return created;
    }

    return null;
  }

  async findSoftDeletedByPortPair(
    portASystemId: number,
    portBSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.nodeAPortSystemId = :portA', {portA: portASystemId})
      .andWhere('cl.nodeBPortSystemId = :portB', {portB: portBSystemId})
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as unknown as ControlLinkRow | null;

    if (baseRow !== null && sessionId !== null) {
      const actions = await this.editActionsQs.getByAggregateId(sessionId, baseRow.systemId);
      const isDeleted = actions.some(a => a.operation === CHANGE_OPERATION.Delete);
      if (isDeleted) return this.rowToEntity(baseRow, fileSystemId);
    }

    return null;
  }

  async createControlLink(link: ControlLink): Promise<void> {
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
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async reactivateControlLink(systemId: number): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    // The link was staged as DELETE — we need to undo that by writing a CREATE or
    // removing the DELETE action. In our staging model, the simplest approach is
    // to write an UPDATE action that "undeletes" by restoring via a delta.
    // Since deleted rows don't have a `deleted` column tracked in our ControlLink schema,
    // we re-use a DELETE action removal: write a compensating CREATE payload.
    // For this implementation we record a synthetic UPDATE that signals reactivation.
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: systemId,
        aggregateId: systemId,
        delta: {deleted: false},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async softDeleteControlLink(systemId: number): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: systemId,
        aggregateId: systemId,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async updateHeapId(systemId: number, heapId: number): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: systemId,
        aggregateId: systemId,
        delta: {heapId},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async createSubsystemControlLink(scl: SubsystemControlLink): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SubsystemControlLink,
        targetSystemId: scl.systemId,
        aggregateId: scl.controlLinkSystemId ?? scl.systemId,
        payload: {
          peerNodeASystemId: scl.peerNodeASystemId,
          peerNodeBSystemId: scl.peerNodeBSystemId,
          nodeAPortSystemId: scl.nodeAPortSystemId,
          nodeBPortSystemId: scl.nodeBPortSystemId,
          controlLinkSystemId: scl.controlLinkSystemId,
          fileSystemId: scl.fileSystemId,
        },
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async getAllSubsystemControlLinks(fileSystemId: number): Promise<SubsystemControlLink[]> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.SubsystemControlLink)
      .createQueryBuilder('scl')
      .where('scl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as SubsystemControlLinkRow[];

    if (sessionId === null) {
      return baseRows.map(r => this.sclRowToEntity(r));
    }

    // Apply overlay
    const sclActions = await this.editActionsQs.getByTable(sessionId, ENTITY_NAMES.SubsystemControlLink);

    const deletedIds = new Set(
      sclActions.filter(a => a.operation === CHANGE_OPERATION.Delete).map(a => a.targetSystemId),
    );

    const surviving = baseRows.filter(r => !deletedIds.has(r.systemId)).map(r => this.sclRowToEntity(r));

    const createdScls: SclEntity[] = sclActions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .map(a => {
        const p = a.newValue as Partial<SubsystemControlLinkRow>;
        return new SclEntity(
          a.targetSystemId,
          p.peerNodeASystemId ?? 0,
          p.peerNodeBSystemId ?? 0,
          p.nodeAPortSystemId ?? 0,
          p.nodeBPortSystemId ?? 0,
          p.controlLinkSystemId ?? null,
          p.fileSystemId ?? fileSystemId,
          1,
        );
      });

    return [...surviving, ...createdScls];
  }

  async getAllocatedIntentIds(portSystemId: number, _fileSystemId: number): Promise<{intentSystemId: number; intentId: number}[]> {
    const {session} = this.uow.getWriteContext();
    const sessionId = session.sessionId;

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Intent)
      .createQueryBuilder('i')
      .select(['i.systemId', 'i.controlPortSystemId', 'i.intentId'])
      .where('i.controlPortSystemId = :portSystemId', {portSystemId})
      .getMany()) as unknown as IntentBase[];

    if (sessionId === null) {
      return baseRows.map(r => ({intentSystemId: r.systemId, intentId: r.intentId}));
    }

    // Apply overlay
    const intentActions = await this.editActionsQs.getByTable(sessionId, ENTITY_NAMES.Intent);

    const deletedIds = new Set(
      intentActions.filter(a => a.operation === CHANGE_OPERATION.Delete).map(a => a.targetSystemId),
    );

    const surviving = baseRows
      .filter(r => !deletedIds.has(r.systemId))
      .map(r => ({intentSystemId: r.systemId, intentId: r.intentId}));

    const created = intentActions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .map(a => {
        const p = a.newValue as {intentId?: number};
        return {intentSystemId: a.targetSystemId, intentId: p.intentId ?? 0};
      });

    return [...surviving, ...created];
  }

  async createIntents(intents: {systemId: number; controlPortSystemId: number; intentId: number}[]): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const intent of intents) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.Intent,
          targetSystemId: intent.systemId,
          aggregateId: intent.controlPortSystemId,
          payload: {
            controlPortSystemId: intent.controlPortSystemId,
            intentId: intent.intentId,
            fileSystemId: session.fileSystemId,
          },
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async deleteIntents(intentSystemIds: number[], controlPortSystemId: number): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const systemId of intentSystemIds) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.Intent,
          targetSystemId: systemId,
          aggregateId: controlPortSystemId,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private rowToEntity(row: ControlLinkRow, fileSystemId: number): ControlLink {
    return new ControlLinkEntity(
      row.systemId,
      fileSystemId,
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

  private sclRowToEntity(row: SubsystemControlLinkRow): SubsystemControlLink {
    return new SclEntity(
      row.systemId,
      row.peerNodeASystemId,
      row.peerNodeBSystemId,
      row.nodeAPortSystemId,
      row.nodeBPortSystemId,
      row.controlLinkSystemId,
      row.fileSystemId,
      1,
    );
  }

  private async applyControlLinkOverlay(
    baseRows: ControlLinkRow[],
    requestedIds: number[],
    sessionId: number | null,
    fileSystemId: number,
  ): Promise<ControlLinkRow[]> {
    if (sessionId === null) return baseRows;

    const clActions = await this.editActionsQs.getByTable(sessionId, ENTITY_NAMES.ControlLink);

    const deletedIds = new Set(
      clActions.filter(a => a.operation === CHANGE_OPERATION.Delete).map(a => a.targetSystemId),
    );

    const surviving = baseRows.filter(r => !deletedIds.has(r.systemId));

    // Apply UPDATE deltas
    const surviving2 = surviving.map(row => {
      const updates = clActions.filter(
        a => a.operation === CHANGE_OPERATION.Update && a.targetSystemId === row.systemId,
      );
      if (updates.length === 0) return row;
      const merged = {...row};
      for (const upd of updates) {
        Object.assign(merged, upd.newValue);
      }
      return merged;
    });

    // Inject CREATE actions for requested IDs not in base
    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: ControlLinkRow[] = clActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          requestedIds.includes(a.targetSystemId) &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<ControlLinkRow>;
        return {
          systemId: a.targetSystemId,
          fileSystemId: p.fileSystemId ?? fileSystemId,
          peerNodeASystemId: p.peerNodeASystemId ?? 0,
          peerNodeBSystemId: p.peerNodeBSystemId ?? 0,
          nodeAPortSystemId: p.nodeAPortSystemId ?? 0,
          nodeBPortSystemId: p.nodeBPortSystemId ?? 0,
          heapId: p.heapId ?? 1,
          linkType: p.linkType ?? 'INTRA_SUBGRAPH',
          sourceSubgraphSystemId: p.sourceSubgraphSystemId ?? 0,
          destSubgraphSystemId: p.destSubgraphSystemId ?? 0,
        } as ControlLinkRow;
      });

    return [...surviving2, ...created];
  }

  private async findCreatedByPortPair(
    portASystemId: number,
    portBSystemId: number,
    sessionId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const clActions = await this.editActionsQs.getByTable(sessionId, ENTITY_NAMES.ControlLink);
    const created = clActions.find(a => {
      if (a.operation !== CHANGE_OPERATION.Create) return false;
      const p = a.newValue as Partial<ControlLinkRow>;
      return p.nodeAPortSystemId === portASystemId && p.nodeBPortSystemId === portBSystemId;
    });

    if (!created) return null;

    const p = created.newValue as Partial<ControlLinkRow>;
    return new ControlLinkEntity(
      created.targetSystemId,
      p.fileSystemId ?? fileSystemId,
      p.peerNodeASystemId ?? 0,
      p.peerNodeBSystemId ?? 0,
      portASystemId,
      portBSystemId,
      p.heapId ?? 1,
      p.linkType ?? 'INTRA_SUBGRAPH',
      p.sourceSubgraphSystemId ?? 0,
      p.destSubgraphSystemId ?? 0,
    );
  }
}
