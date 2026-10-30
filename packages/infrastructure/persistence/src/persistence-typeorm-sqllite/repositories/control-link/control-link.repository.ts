/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ControlLinkRepository,
  ControlLinkTopology,
  UnitOfWork,
  SessionChanged,
  EditOptions,
  ControlLinkIdResolution,
} from '@arc/core';
import {
  ControlLink,
  CONTROL_LINK_TYPE,
  SubsystemControlLink,
  CHANGE_OPERATION,
} from '@arc/core';
import {EditActionSchema} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {ControlPortRow} from '../../entity-schema/usecase-data/node/control-port.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import type {EffectiveSubsystemControlLinkRow} from '../../fetchers/link-overlay-fetcher.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
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
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly editActionsQs: EditActionsQueryService;
  private readonly intentFetcher: IntentFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    this.editActionsQs = new EditActionsQueryService(manager);
    this.linkFetcher = new LinkOverlayFetcher(manager, this.editActionsQs);
    this.nodeFetcher = new NodeOverlayFetcher(manager, this.editActionsQs);
    this.intentFetcher = new IntentFetcher(manager, this.editActionsQs);
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

  async findAllLinks(fileSystemId: number): Promise<ControlLinkTopology> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [rows, controlLinkRows] = await Promise.all([
      this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
    ]);
    const segmentsByLinkId = new Map<number, SubsystemControlLink[]>();
    const unresolvedSubsystemControlLinks: SubsystemControlLink[] = [];
    for (const row of rows) {
      const segment = baseToSubsystemControlLink(row);
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
        baseToControlLink(row, segmentsByLinkId.get(row.systemId) ?? []),
      ),
      unresolvedSubsystemControlLinks,
    };
  }

  private sessionId(): number | null {
    return this.uow.getWriteContext().session.sessionId;
  }

  async findSubsystemControlRouteContext(fileSystemId: number) {
    const rows = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
    );
    const nodeIds = [
      ...new Set(
        rows.flatMap(row => [row.peerNodeASystemId, row.peerNodeBSystemId]),
      ),
    ];
    const nodes = await this.nodeFetcher.fetchMany(
      nodeIds,
      fileSystemId,
      this.sessionId(),
    );
    return {
      subsystemControlLinks: rows.map(row => baseToSubsystemControlLink(row)),
      nodeTypeBySystemId: new Map(
        nodes.map(node => [node.systemId, node.type]),
      ),
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

  async getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]> {
    if (portSystemIds.length === 0) return [];

    const sessionId = this.uow.getWriteContext().session.sessionId;
    const filters = {
      $or: [
        {nodeAPortSystemId: portSystemIds},
        {nodeBPortSystemId: portSystemIds},
      ],
    };
    const [links, subsystemLinks] = await Promise.all([
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, filters),
      this.linkFetcher.loadSubsystemControlLinkRows(
        fileSystemId,
        sessionId,
        filters,
      ),
    ]);
    const portSet = new Set(portSystemIds);
    const entries: {linkSystemId: number; portSystemId: number}[] = [];
    for (const link of [...links, ...subsystemLinks]) {
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

  async findBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {systemId},
    );
    return rows.length > 0 ? baseToControlLink(rows[0]) : null;
  }

  async findCanonicalLinksByAnySystemIds(
    systemIds: readonly number[],
    fileSystemId: number,
  ): Promise<ControlLinkIdResolution[]> {
    if (systemIds.length === 0) return [];

    const sessionId = this.uow.getWriteContext().session.sessionId;
    const requestedIds = [...systemIds];
    const [canonicalRows, segmentRows] = await Promise.all([
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, {
        systemId: requestedIds,
      }),
      this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId, {
        systemId: requestedIds,
      }),
    ]);
    const canonicalBySystemId = new Map(
      canonicalRows.map(row => [row.systemId, row]),
    );
    const segmentBySystemId = new Map(
      segmentRows.map(row => [row.systemId, row]),
    );
    const missingParentIds = [
      ...new Set(
        segmentRows
          .map(segment => segment.controlLinkSystemId)
          .filter(
            (systemId): systemId is number =>
              systemId !== null && !canonicalBySystemId.has(systemId),
          ),
      ),
    ];
    if (missingParentIds.length > 0) {
      const parentRows = await this.linkFetcher.loadControlLinkRows(
        fileSystemId,
        sessionId,
        {systemId: missingParentIds},
      );
      for (const row of parentRows) {
        canonicalBySystemId.set(row.systemId, row);
      }
    }

    return systemIds.map(requestedSystemId => {
      const canonical = canonicalBySystemId.get(requestedSystemId);
      if (canonical) {
        return {
          requestedSystemId,
          isSegment: false,
          canonicalLink: baseToControlLink(canonical),
        };
      }
      const segment = segmentBySystemId.get(requestedSystemId);
      if (!segment) {
        return {requestedSystemId, isSegment: false, canonicalLink: null};
      }
      const parent =
        segment.controlLinkSystemId === null
          ? undefined
          : canonicalBySystemId.get(segment.controlLinkSystemId);
      return {
        requestedSystemId,
        isSegment: true,
        canonicalLink: parent ? baseToControlLink(parent) : null,
      };
    });
  }

  async resolveSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    controlLinkSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (subsystemControlLinks.length === 0) return;

    const {session} = this.uow.getWriteContext();
    await this.writer.writeDeltaBatch(
      subsystemControlLinks.map(segment => ({
        targetTable: ENTITY_NAMES.SubsystemControlLink,
        targetSystemId: segment.systemId,
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
          remainingSegments.map(segment => baseToSubsystemControlLink(segment)),
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

  async findBySystemIds(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<ControlLink[]> {
    if (systemIds.length === 0) return [];
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {systemId: systemIds},
    );
    const segments = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {controlLinkSystemId: systemIds},
    );
    const segmentsByLink = new Map<number, SubsystemControlLink[]>();
    for (const segment of segments) {
      if (segment.controlLinkSystemId === null) continue;
      const values = segmentsByLink.get(segment.controlLinkSystemId) ?? [];
      values.push(baseToSubsystemControlLink(segment));
      segmentsByLink.set(segment.controlLinkSystemId, values);
    }
    return rows.map(row =>
      baseToControlLink(row, segmentsByLink.get(row.systemId) ?? []),
    );
  }

  async findByPortPair(
    portA: number,
    portB: number,
    fileSystemId: number,
  ): Promise<{
    systemId: number;
    isDeleted: boolean;
    payload: Record<string, unknown>;
  } | null> {
    const {session} = this.uow.getWriteContext();
    const filter = {nodeAPortSystemId: portA, nodeBPortSystemId: portB};

    const baseRows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      null,
      filter,
    );
    if (baseRows.length > 0) {
      const row = baseRows[0];
      const actions = await this.editActionsQs.getByAggregateId(
        session.sessionId,
        row.systemId,
      );
      const isDeleted = actions.some(
        a =>
          a.targetTable === ENTITY_NAMES.ControlLink &&
          a.targetSystemId === row.systemId &&
          a.operation === 'DELETE',
      );
      return {systemId: row.systemId, isDeleted, payload: {...row}};
    }

    const sessionRows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      filter,
    );
    if (sessionRows.length > 0) {
      const row = sessionRows[0];
      return {systemId: row.systemId, isDeleted: false, payload: {...row}};
    }

    return null;
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

  async cancelDeleteControlLink(systemId: number): Promise<void> {
    const {session} = this.uow.getWriteContext();
    // A committed link is restored by cancelling its pending DELETE; it is not
    // a new entity and therefore must not produce a CREATE projection.
    await this.manager.delete(EditActionSchema, {
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.ControlLink,
      targetSystemId: systemId,
      operation: CHANGE_OPERATION.Delete,
    });
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

  async associateSubsystemControlLinks(
    subsystemLinkSystemIds: number[],
    controlLinkSystemId: number,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    for (const systemId of subsystemLinkSystemIds) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: systemId,
          aggregateId: systemId,
          delta: {controlLinkSystemId},
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async getAllSubsystemControlLinks(
    fileSystemId: number,
  ): Promise<SubsystemControlLink[]> {
    const rows = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
    );
    return rows.map(row => baseToSubsystemControlLink(row));
  }

  async getAllControlLinks(fileSystemId: number): Promise<ControlLink[]> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
    );
    return rows.map(row => baseToControlLink(row));
  }

  async getAllocatedIntentIds(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<{intentSystemId: number; intentId: number}[]> {
    const nodeSystemId = await this.getPortOwner(portSystemId, fileSystemId);
    const rows = await this.intentFetcher.fetchMany(
      [portSystemId],
      nodeSystemId,
      this.sessionId(),
    );
    return rows.map(row => ({
      intentSystemId: row.systemId,
      intentId: row.naturalId,
    }));
  }

  async createIntents(
    intents: {
      systemId: number;
      controlPortSystemId: number;
      intentId: number;
    }[],
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    for (const intent of intents) {
      const nodeSystemId = await this.getPortOwner(
        intent.controlPortSystemId,
        session.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.Intent,
          targetSystemId: intent.systemId,
          aggregateId: nodeSystemId,
          payload: {
            systemId: intent.systemId,
            controlPortSystemId: intent.controlPortSystemId,
            naturalId: intent.intentId,
          },
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async deleteIntents(
    ids: number[],
    controlPortSystemId: number,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const nodeSystemId = await this.getPortOwner(
      controlPortSystemId,
      session.fileSystemId,
    );
    for (const systemId of ids)
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.Intent,
          targetSystemId: systemId,
          aggregateId: nodeSystemId,
        },
        session.sessionId,
        this.manager,
      );
  }

  private async getPortOwner(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<number> {
    const port = (await this.manager
      .getRepository(ENTITY_NAMES.ControlPort)
      .createQueryBuilder('port')
      .innerJoin('port.node', 'node')
      .where('port.systemId = :portSystemId', {portSystemId})
      .andWhere('node.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as ControlPortRow | null;
    if (port !== null) return port.nodeSystemId;

    const sessionId = this.sessionId();
    if (sessionId !== null) {
      const actions = await this.editActionsQs.getByTable(
        sessionId,
        ENTITY_NAMES.ControlPort,
      );
      const created = actions.find(
        action =>
          action.targetSystemId === portSystemId &&
          action.operation === 'CREATE',
      );
      if (created !== undefined) return created.aggregateId;
    }
    throw new Error(
      `Control port ${portSystemId} not found in file ${fileSystemId}`,
    );
  }
}
