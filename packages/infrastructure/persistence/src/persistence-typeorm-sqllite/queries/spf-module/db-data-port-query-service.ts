/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {DataPortQueryService, SpfDataPortReadModel} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {DataPortRow} from '../../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

/**
 * Database implementation of DataPortQueryService.
 *
 * Loads data ports for a single node (SpfModule or Subsystem).
 * Three-tier session overlay pattern applied.
 * totalLinksAtPort counts committed + staged data_links at each port.
 */
export class DbDataPortQueryService implements DataPortQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<SpfDataPortReadModel[]> {
    // Step 1 — baseline port rows for this node
    const baseRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.DataPort)
      .createQueryBuilder('dp')
      .where('dp.nodeSystemId = :nodeSystemId', {nodeSystemId})
      .getMany()) as DataPortRow[];
    // SQL: SELECT * FROM data_ports WHERE node_system_id = ?

    if (!baseRows.length) return [];

    // Step 2 — link counts (overlay-aware)
    const portIds = baseRows.map(r => r.systemId);
    const linkCounts = await this.countLinksPerPort(
      portIds,
      fileSystemId,
      applyOverlay,
    );

    // Step 3 — three-tier overlay on port rows
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
        a => a.tableName === ENTITY_NAMES.DataPort,
      )) {
        portEditActionMap.set(action.systemId, action);
      }
    }

    const portRows: DataPortRow[] =
      portEditActionMap.size > 0
        ? (applyToCollection(baseRows, [
            ...portEditActionMap.values(),
          ]) as DataPortRow[])
        : baseRows;

    // Step 4 — map to read model
    return portRows.map(row => ({
      systemId: row.systemId,
      changeInfo: portEditActionMap.has(row.systemId)
        ? {
            changeType: portEditActionMap.get(row.systemId)!.operation,
            changeId: portEditActionMap.get(row.systemId)!.changeId,
            changeStatus: portEditActionMap.get(row.systemId)!.changeStatus,
          }
        : {changeType: CHANGE_OPERATION.None},
      portId: row.dataPortId,
      name: row.name ?? '',
      portIoType: row.portIoType,
      isStatic: row.isStatic,
      totalLinksAtPort: linkCounts.get(row.systemId) ?? 0,
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async countLinksPerPort(
    portSystemIds: number[],
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<number, number>> {
    if (!portSystemIds.length) return new Map();

    const rows: Array<{port_id: number; link_count: string}> =
      await this.dataSource.query(
        `SELECT p.system_id AS port_id, COUNT(dl.system_id) AS link_count
         FROM data_ports p
         LEFT JOIN data_links dl
           ON dl.source_port_system_id      = p.system_id
           OR dl.destination_port_system_id = p.system_id
         WHERE p.system_id IN (${portSystemIds.map(() => '?').join(',')})
         GROUP BY p.system_id`,
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
      ENTITY_NAMES.DataLink,
    );

    for (const draft of linkDrafts) {
      const p = JSON.parse(draft.payload as string) as {
        sourcePortSystemId?: number;
        destinationPortSystemId?: number;
      };
      for (const portId of [p.sourcePortSystemId, p.destinationPortSystemId]) {
        if (!portId || !portSystemIds.includes(portId)) continue;
        const current = countMap.get(portId) ?? 0;
        if (draft.operation === 'CREATE') countMap.set(portId, current + 1);
        if (draft.operation === 'DELETE')
          countMap.set(portId, Math.max(0, current - 1));
      }
    }

    return countMap;
  }
}
