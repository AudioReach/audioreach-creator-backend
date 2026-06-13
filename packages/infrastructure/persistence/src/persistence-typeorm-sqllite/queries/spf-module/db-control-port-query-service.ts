/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ControlPortQueryService,
  SpfControlPortReadModel,
  SpfIntentReadModel,
} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
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
  ): Promise<SpfControlPortReadModel[]> {
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

    if (!baseRows.length) return [];

    // Step 2 — three-tier overlay
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
        ? (applyToCollection(baseRows, [
            ...portEditActionMap.values(),
          ]) as ControlPortRow[])
        : baseRows;

    // Step 3 — map to read model
    return portRows.map(row => ({
      systemId: row.systemId,
      changeInfo: portEditActionMap.has(row.systemId)
        ? {
            changeType: portEditActionMap.get(row.systemId)!.operation,
            changeId: portEditActionMap.get(row.systemId)!.changeId,
            changeStatus: portEditActionMap.get(row.systemId)!.changeStatus,
          }
        : {changeType: CHANGE_OPERATION.None},
      portId: row.portId,
      name: row.name ?? '',
      isStatic: row.isStatic,
      allocatedIntents: (row.allocatedIntents ?? []).map(i =>
        this.mapToIntentReadModel(i),
      ),
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private mapToIntentReadModel(row: IntentRow): SpfIntentReadModel {
    return {
      systemId: row.systemId,
      intentId: row.intentId,
      name: `Intent_${row.intentId}`, // no name column in intents table
    };
  }
}
