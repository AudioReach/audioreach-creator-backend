/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';

export interface LinkOverlayEntry {
  linkSystemId: number;
  portSystemId: number;
}

/**
 * Internal fetcher — applies session edit_actions overlay to data and control links.
 * Not exported from @arc/persistence; shared between edit repos only.
 *
 * Overlay semantics:
 *   CREATE  → new link included if its src or dst port is in the requested portSystemIds
 *   DELETE  → base link excluded (tombstoned)
 *   UPDATE on links is not a LLD2 operation; UPDATE actions are ignored here
 */
export class LinkOverlayFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchDataLinks(
    portSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<LinkOverlayEntry[]> {
    if (portSystemIds.length === 0) return [];
    const base = await this.loadBaseDataLinks(portSystemIds, fileSystemId);
    if (sessionId === null) return base;
    return this.applyOverlay(
      base,
      sessionId,
      portSystemIds,
      ENTITY_NAMES.DataLink,
      'sourcePortSystemId',
      'destinationPortSystemId',
    );
  }

  async fetchControlLinks(
    portSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<LinkOverlayEntry[]> {
    if (portSystemIds.length === 0) return [];
    const base = await this.loadBaseControlLinks(portSystemIds, fileSystemId);
    if (sessionId === null) return base;
    return this.applyOverlay(
      base,
      sessionId,
      portSystemIds,
      ENTITY_NAMES.ControlLink,
      'nodeAPortSystemId',
      'nodeBPortSystemId',
    );
  }

  private async loadBaseDataLinks(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<LinkOverlayEntry[]> {
    // Do NOT join data_ports — a port may be staged (only in edit_actions, not yet in data_ports).
    // The caller already has the portSystemIds from the overlay-aware PortOverlayFetcher, so they
    // are authoritative. We query data_links directly and match in memory.
    const rows = await this.manager
      .getRepository(ENTITY_NAMES.DataLink)
      .createQueryBuilder('dl')
      .select('dl.systemId', 'linkSystemId')
      .addSelect('dl.sourcePortSystemId', 'srcPort')
      .addSelect('dl.destinationPortSystemId', 'dstPort')
      .where(
        '(dl.sourcePortSystemId IN (:...portSystemIds) OR dl.destinationPortSystemId IN (:...portSystemIds))',
        {portSystemIds},
      )
      .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{linkSystemId: number; srcPort: number; dstPort: number}>();
    const portSet = new Set(portSystemIds);
    const entries: LinkOverlayEntry[] = [];
    for (const row of rows) {
      if (portSet.has(Number(row.srcPort)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.srcPort),
        });
      if (portSet.has(Number(row.dstPort)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.dstPort),
        });
    }
    return entries;
  }

  private async loadBaseControlLinks(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<LinkOverlayEntry[]> {
    // Same pattern as loadBaseDataLinks — no join with control_ports.
    const rows = await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .select('cl.systemId', 'linkSystemId')
      .addSelect('cl.nodeAPortSystemId', 'portA')
      .addSelect('cl.nodeBPortSystemId', 'portB')
      .where(
        '(cl.nodeAPortSystemId IN (:...portSystemIds) OR cl.nodeBPortSystemId IN (:...portSystemIds))',
        {portSystemIds},
      )
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{linkSystemId: number; portA: number; portB: number}>();
    const portSet = new Set(portSystemIds);
    const entries: LinkOverlayEntry[] = [];
    for (const row of rows) {
      if (portSet.has(Number(row.portA)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.portA),
        });
      if (portSet.has(Number(row.portB)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.portB),
        });
    }
    return entries;
  }

  private async applyOverlay(
    base: LinkOverlayEntry[],
    sessionId: number,
    portSystemIds: number[],
    targetTable: EntityName,
    srcCol: string,
    dstCol: string,
  ): Promise<LinkOverlayEntry[]> {
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      targetTable,
    );
    const deleted = new Set(
      actions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const portIdSet = new Set(portSystemIds);
    const result = base.filter(r => !deleted.has(r.linkSystemId));
    for (const action of actions.filter(
      a => a.operation === CHANGE_OPERATION.Create,
    )) {
      const payload = action.newValue as Record<string, number | undefined>;
      for (const portId of [payload[srcCol], payload[dstCol]]) {
        if (portId !== undefined && portIdSet.has(portId)) {
          result.push({
            linkSystemId: action.targetSystemId,
            portSystemId: portId,
          });
        }
      }
    }
    return result;
  }
}
