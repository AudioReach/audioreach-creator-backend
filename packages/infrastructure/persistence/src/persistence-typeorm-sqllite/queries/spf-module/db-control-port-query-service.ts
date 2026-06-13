/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ControlPortQueryService,
  ControlPortReadModel,
  IntentReadModel,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {
  ControlPortRow,
  IntentRow,
} from '../../entity-schema/usecase-data/node/control-port.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

/**
 * Database implementation of ControlPortQueryService.
 *
 * Loads control ports with intents for a single node (SpfModule or Subsystem).
 * Three-tier session overlay pattern applied.
 * totalLinksAtPort counts committed + staged control_links at each port.
 * Intent name is generated as 'Intent_{intentId}' — no name column in DB.
 */
export class DbControlPortQueryService implements ControlPortQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<ControlPortReadModel[]> {
    // Step 1 — baseline control port rows with intents
    const baseRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ControlPort)
      .createQueryBuilder('cp')
      .leftJoinAndSelect('cp.allocatedIntents', 'intent')
      .where('cp.nodeSystemId = :nodeSystemId', {nodeSystemId})
      .getMany()) as ControlPortRow[];
    // SQL:
    // SELECT cp.*, intent.*
    // FROM control_ports cp
    // LEFT JOIN intents intent ON intent.control_port_system_id = cp.system_id
    // WHERE cp.node_system_id = ?

    if (baseRows.length === 0) return [];

    // Step 2 — link counts (overlay-aware)
    const portIds = baseRows.map(r => r.systemId);
    const linkCounts = await this.countLinksPerPort(
      portIds,
      fileSystemId,
      applyOverlay,
    );

    // Step 3 — three-tier overlay
    const session = applyOverlay
      ? await this.editActionsSvc.findActiveSession(fileSystemId)
      : null;

    const portEditActionMap = new Map<number, EditActionRow>();
    if (session) {
      const actions = await this.editActionsSvc.getEditActionsByAggregateId(
        session.sessionId,
        nodeSystemId,
      );
      for (const action of actions.filter(
        a => a.tableName === ENTITY_NAMES.ControlPort,
      )) {
        portEditActionMap.set(action.systemId, action);
      }
    }

    const portRows: ControlPortRow[] =
      portEditActionMap.size > 0
        ? applyToCollection(baseRows, [...portEditActionMap.values()])
        : baseRows;

    // Step 4 — map to read model
    return portRows.map(row => ({
      systemId: row.systemId,
      portId: row.portId,
      name: row.name ?? '',
      isStatic: row.isStatic,
      allocatedIntents: (row.allocatedIntents ?? []).map(i =>
        this.mapToIntentReadModel(i),
      ),
      totalLinksAtPort: linkCounts.get(row.systemId) ?? 0,
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async countLinksPerPort(
    portSystemIds: number[],
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();

    const rows: Array<{port_id: number; link_count: string}> =
      await this.dataSource.query(
        `SELECT cp.system_id AS port_id, COUNT(cl.system_id) AS link_count
         FROM control_ports cp
         LEFT JOIN control_links cl
           ON cl.nodeA_port_system_id = cp.system_id
           OR cl.nodeB_port_system_id = cp.system_id
         WHERE cp.system_id IN (${portSystemIds.map(() => '?').join(',')})
         GROUP BY cp.system_id`,
        portSystemIds,
      );

    const countMap = new Map<number, number>(
      rows.map(r => [r.port_id, Number(r.link_count)]),
    );

    if (!applyOverlay) return countMap;

    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session) return countMap;

    const linkDrafts = await this.editActionsSvc.getEditActionsByTable(
      session.sessionId,
      ENTITY_NAMES.ControlLink,
    );

    for (const draft of linkDrafts) {
      const p = JSON.parse(draft.payload as string) as {
        nodeAPortSystemId?: number;
        nodeBPortSystemId?: number;
      };
      for (const portId of [p.nodeAPortSystemId, p.nodeBPortSystemId]) {
        if (!portId || !portSystemIds.includes(portId)) continue;
        const current = countMap.get(portId) ?? 0;
        if (draft.operation === 'CREATE') countMap.set(portId, current + 1);
        if (draft.operation === 'DELETE')
          countMap.set(portId, Math.max(0, current - 1));
      }
    }

    return countMap;
  }

  private mapToIntentReadModel(row: IntentRow): IntentReadModel {
    return {
      systemId: row.systemId,
      intentId: row.intentId,
      name: `Intent_${row.intentId}`, // no name column in intents table
    };
  }
}
