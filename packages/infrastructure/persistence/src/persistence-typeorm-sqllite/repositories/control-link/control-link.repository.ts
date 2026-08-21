/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ControlLinkRepository,
  UnitOfWork,
  SessionChanged,
  EditOptions,
} from '@arc/core';
import {ControlLink, CONTROL_LINK_TYPE, SubsystemControlLink} from '@arc/core';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {ControlPortRow} from '../../entity-schema/usecase-data/node/control-port.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import type {EffectiveSubsystemControlLinkRow} from '../../fetchers/link-overlay-fetcher.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

function toControlLink(
  row: ControlLinkBase,
  subsystemControlLinks: SubsystemControlLink[] = [],
): ControlLink {
  return new ControlLink(
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
    subsystemControlLinks,
  );
}

function toScl(row: EffectiveSubsystemControlLinkRow): SubsystemControlLink {
  return new SubsystemControlLink(
    row.systemId,
    row.peerNodeASystemId,
    row.peerNodeBSystemId,
    row.nodeAPortSystemId,
    row.nodeBPortSystemId,
    row.controlLinkSystemId,
    row.fileSystemId,
    row.linkType ?? CONTROL_LINK_TYPE.Normal,
    row.version,
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

  private sessionId(): number | null {
    return this.uow.getWriteContext().session.sessionId;
  }

  async findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink[]> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {
        $or: [
          {peerNodeASystemId: moduleSystemId},
          {peerNodeBSystemId: moduleSystemId},
        ],
      },
    );
    const segments = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {controlLinkSystemId: rows.map(row => row.systemId)},
    );
    const segmentsByLink = new Map<number, SubsystemControlLink[]>();
    for (const segment of segments) {
      const linkId = segment.controlLinkSystemId;
      if (linkId === null) continue;
      const values = segmentsByLink.get(linkId) ?? [];
      values.push(toScl(segment));
      segmentsByLink.set(linkId, values);
    }
    return rows.map(row =>
      toControlLink(row, segmentsByLink.get(row.systemId) ?? []),
    );
  }

  async findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemControlLink[]> {
    const rows = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {controlLinkSystemId: null},
    );
    const byNode = new Map<number, typeof rows>();
    for (const row of rows) {
      for (const nodeId of [row.peerNodeASystemId, row.peerNodeBSystemId]) {
        byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), row]);
      }
    }
    const queue = [moduleSystemId];
    const visitedNodes = new Set(queue);
    const visitedLinks = new Set<number>();
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      for (const row of byNode.get(nodeId) ?? []) {
        if (visitedLinks.has(row.systemId)) continue;
        visitedLinks.add(row.systemId);
        const next =
          row.peerNodeASystemId === nodeId
            ? row.peerNodeBSystemId
            : row.peerNodeASystemId;
        if (!visitedNodes.has(next)) {
          visitedNodes.add(next);
          queue.push(next);
        }
      }
    }
    return rows
      .filter(row => visitedLinks.has(row.systemId))
      .map(row => toScl(row));
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
      subsystemControlLinks: rows.map(row => toScl(row)),
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
    const links = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {controlLinkSystemId},
    );
    await this.softDeleteControlLink(controlLinkSystemId, options);
    for (const link of links)
      await this.writeDelete(
        'SubsystemControlLink',
        link.systemId,
        controlLinkSystemId,
        options,
      );
  }

  async deleteSubsystemControlLinks(
    ids: number[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (ids.length === 0) return;
    const targets = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {systemId: ids},
    );
    const targetIds = new Set(targets.map(target => target.systemId));
    const controlLinkIds = [
      ...new Set(
        targets.flatMap(target =>
          target.controlLinkSystemId === null
            ? []
            : [target.controlLinkSystemId],
        ),
      ),
    ];
    const siblings =
      controlLinkIds.length === 0
        ? []
        : await this.linkFetcher.loadSubsystemControlLinkRows(
            fileSystemId,
            this.sessionId(),
            {controlLinkSystemId: controlLinkIds},
          );

    for (const target of targets) {
      await this.writeDelete(
        'SubsystemControlLink',
        target.systemId,
        target.systemId,
        options,
      );
    }
    for (const controlLinkId of controlLinkIds) {
      await this.writeDelete(
        'ControlLink',
        controlLinkId,
        controlLinkId,
        options,
      );
    }
    const {session, groupId} = this.uow.getWriteContext();
    for (const sibling of siblings) {
      if (targetIds.has(sibling.systemId)) continue;
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: sibling.systemId,
          aggregateId: sibling.systemId,
          delta: {controlLinkSystemId: null},
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
    if (portSystemIds.length === 0) return [];
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {
        $or: portSystemIds.flatMap(port => [
          {nodeAPortSystemId: port},
          {nodeBPortSystemId: port},
        ]),
      },
    );
    return rows.flatMap(row =>
      portSystemIds
        .filter(
          port =>
            row.nodeAPortSystemId === port || row.nodeBPortSystemId === port,
        )
        .map(portSystemId => ({linkSystemId: row.systemId, portSystemId})),
    );
  }

  async findIntraUcLinksForGivenSgPair(
    fileSystemId: number,
    peerSgASystemId: number,
    peerSgBSystemId: number,
  ): Promise<ControlLink[]> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {
        $or: [
          {
            sourceSubgraphSystemId: peerSgASystemId,
            destSubgraphSystemId: peerSgBSystemId,
          },
          {
            sourceSubgraphSystemId: peerSgBSystemId,
            destSubgraphSystemId: peerSgASystemId,
          },
        ],
      },
    );
    return rows
      .filter(row => row.linkType === CONTROL_LINK_TYPE.Normal)
      .map(row => toControlLink(row));
  }

  async findIntraUcLinksByFile(fileSystemId: number): Promise<ControlLink[]> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {linkType: CONTROL_LINK_TYPE.Normal},
    );
    return rows.map(row => toControlLink(row));
  }

  async findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<ControlLink>> {
    const sessionId = this.sessionId();
    if (sessionId === null) return {added: [], deleted: []};
    const changed = await this.linkFetcher.fetchChangedControlLinks(
      fileSystemId,
      sessionId,
    );
    return {
      added: changed.added.map(row => toControlLink(row)),
      deleted: changed.deleted.map(row => toControlLink(row)),
    };
  }

  async findBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {systemId},
    );
    if (!rows[0]) return null;
    const segments = await this.linkFetcher.loadSubsystemControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {controlLinkSystemId: systemId},
    );
    return toControlLink(
      rows[0],
      segments.map(row => toScl(row)),
    );
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
      values.push(toScl(segment));
      segmentsByLink.set(segment.controlLinkSystemId, values);
    }
    return rows.map(row =>
      toControlLink(row, segmentsByLink.get(row.systemId) ?? []),
    );
  }

  async findActiveByPortPair(
    portA: number,
    portB: number,
    fileSystemId: number,
  ): Promise<ControlLink | null> {
    const rows = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      this.sessionId(),
      {
        nodeAPortSystemId: portA,
        nodeBPortSystemId: portB,
      },
    );
    return rows[0] ? toControlLink(rows[0]) : null;
  }

  async findSoftDeletedByPortPair(
    _portA: number,
    _portB: number,
    _fileSystemId: number,
  ): Promise<ControlLink | null> {
    const {session} = this.uow.getWriteContext();
    const rows = await this.linkFetcher.loadControlLinkRows(
      _fileSystemId,
      null,
      {
        nodeAPortSystemId: _portA,
        nodeBPortSystemId: _portB,
      },
    );
    for (const row of rows) {
      const actions = await this.editActionsQs.getByAggregateId(
        session.sessionId,
        row.systemId,
      );
      const deleted = actions.some(
        action =>
          action.targetTable === ENTITY_NAMES.ControlLink &&
          action.targetSystemId === row.systemId &&
          action.operation === 'DELETE',
      );
      if (deleted) return toControlLink(row);
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
        payload: {...link, subsystemControlLinks: undefined},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async reactivateControlLink(link: ControlLink): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    // A DELETE removes the baseline row from the overlay. Replace it with a
    // CREATE, as an UPDATE cannot restore a row that no longer exists.
    // eslint-disable-next-line custom/no-raw-persistence-queries -- superseding a DELETE requires a conditional valid_until update
    await this.manager.query(
      'UPDATE edit_actions SET valid_until = $1 WHERE session_id = $2 AND target_system_id = $3 AND target_table = $4 AND valid_until IS NULL',
      [
        new Date().toISOString(),
        session.sessionId,
        link.systemId,
        ENTITY_NAMES.ControlLink,
      ],
    );
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: link.systemId,
        aggregateId: link.systemId,
        payload: {...link, subsystemControlLinks: undefined},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async softDeleteControlLink(
    systemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.ControlLink,
        targetSystemId: systemId,
        aggregateId: systemId,
        ...options,
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

  async createSubsystemControlLink(link: SubsystemControlLink): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
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
      groupId,
      this.manager,
    );
  }

  async associateSubsystemControlLinks(
    subsystemLinkSystemIds: number[],
    controlLinkSystemId: number,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const systemId of subsystemLinkSystemIds) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SubsystemControlLink,
          targetSystemId: systemId,
          aggregateId: systemId,
          delta: {controlLinkSystemId},
        },
        session.sessionId,
        groupId,
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
    return rows.map(row => toScl(row));
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
    const {session, groupId} = this.uow.getWriteContext();
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
        groupId,
        this.manager,
      );
    }
  }

  async deleteIntents(
    ids: number[],
    controlPortSystemId: number,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
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
        groupId,
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

  private async writeDelete(
    targetTable: keyof typeof ENTITY_NAMES,
    targetSystemId: number,
    aggregateId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES[targetTable],
        targetSystemId,
        aggregateId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }
}
