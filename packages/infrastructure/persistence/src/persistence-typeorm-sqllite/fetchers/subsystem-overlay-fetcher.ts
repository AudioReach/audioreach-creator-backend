/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {NODE_TYPE} from '../entity-schema/usecase-data/node/node.schema.js';
import type {SubsystemBase} from '../entity-schema/usecase-data/subsystem/subsystem.js';

export interface OverlaidSubsystem extends SubsystemBase {
  /** parentId from Node.parentId — undefined when the subsystem is a root. */
  parentId: number | undefined;
}

/**
 * Fetches subsystems with session overlay applied (FR-3).
 *
 * The Subsystem entity shares a PK with Node (one-to-one, same system_id).
 * parentId lives on Node, not Subsystem — the base query JOINs Node to
 * retrieve it alongside the subsystem name.
 *
 * Two overlay passes:
 *   1. Subsystem table — handles name UPDATE, entity DELETE, entity CREATE.
 *   2. Node table — supplements parentId for session-created subsystems.
 *      CREATE actions on Node of type Subsystem carry parentId in the payload;
 *      these are not in the Subsystem action since parentId is a Node column.
 *
 * Both passes use getByTable (one call each) so the total overlay cost is
 * fixed at two DB calls regardless of subsystem count (FR-5).
 */
export class SubsystemOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all overlaid subsystems for the given file with their parentId.
   */
  async fetchAll(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSubsystem[]> {
    // Base query — JOIN Node to pick up parentId (Node column, not Subsystem).
    const rawRows = await this.manager
      .getRepository(ENTITY_NAMES.Subsystem)
      .createQueryBuilder('sub')
      .innerJoin(ENTITY_NAMES.Node, 'n', 'n.system_id = sub.system_id')
      .addSelect('n.parentId', 'parentId')
      .where('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawAndEntities();

    // Build parentId lookup from the JOIN result.
    const parentIdBySystemId = new Map<number, number | undefined>(
      rawRows.raw.map((r: Record<string, unknown>) => [
        Number(r['sub_system_id']),
        r['parentId'] == null ? undefined : Number(r['parentId']),
      ]),
    );

    let rows = rawRows.entities as SubsystemBase[];

    if (sessionId === null) {
      return this.buildResult(rows, parentIdBySystemId);
    }

    // Pass 1 — Subsystem overlay (name UPDATE, CREATE, DELETE).
    const [subsystemActions, nodeActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Subsystem),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node),
    ]);

    if (subsystemActions.length > 0) {
      rows = this.overlay
        .applyToCollection(rows, subsystemActions)
        .map(r => r.effective);
    }

    // Pass 2 — supplement parentId for session-created subsystems.
    // CREATE actions on Node of type Subsystem carry parentId in the payload;
    // the Subsystem CREATE action itself does not include parentId because it
    // lives on the Node table.
    this.supplementParentIds(parentIdBySystemId, nodeActions);

    return this.buildResult(rows, parentIdBySystemId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Populates parentIdBySystemId from Node CREATE actions for subsystems.
   * Called after the Subsystem overlay is applied so newly added subsystem
   * systemIds are present in the map.
   */
  private supplementParentIds(
    parentIdBySystemId: Map<number, number | undefined>,
    nodeActions: Awaited<ReturnType<EditActionsQueryService['getByTable']>>,
  ): void {
    for (const action of nodeActions) {
      if (
        action.operation !== CHANGE_OPERATION.Create ||
        action.fieldPath !== '$'
      )
        continue;
      const payload = action.newValue as Record<string, unknown>;
      if (
        payload.type === NODE_TYPE.Subsystem &&
        !parentIdBySystemId.has(action.targetSystemId)
      ) {
        parentIdBySystemId.set(
          action.targetSystemId,
          payload.parentId == null ? undefined : Number(payload.parentId),
        );
      }
    }
  }

  private buildResult(
    rows: SubsystemBase[],
    parentIdBySystemId: Map<number, number | undefined>,
  ): OverlaidSubsystem[] {
    return rows.map(row => ({
      ...row,
      parentId: parentIdBySystemId.get(row.systemId),
    }));
  }
}
