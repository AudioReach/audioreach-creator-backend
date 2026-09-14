/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {
  NODE_TYPE,
  type NodeBase,
} from '../entity-schema/usecase-data/node/node.schema.js';
import type {SubsystemBase} from '../entity-schema/usecase-data/subsystem/subsystem.js';

export interface OverlaidSubsystem extends SubsystemBase {
  /** parentSystemId from Node.parentSystemId — undefined when the subsystem is a root. */
  parentSystemId: number | undefined;
}

/**
 * Fetches subsystems with session overlay applied (FR-3).
 *
 * The Subsystem entity shares a PK with Node (one-to-one, same system_id).
 * parentSystemId lives on Node, not Subsystem — the base query JOINs Node to
 * retrieve it alongside the subsystem name.
 *
 * Two overlay passes:
 *   1. Node table — establishes effective file/type ownership and parentSystemId.
 *   2. Subsystem table — handles name UPDATE, entity DELETE, entity CREATE.
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
   * Returns all overlaid subsystems for the given file with their parentSystemId.
   */
  async fetchAll(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSubsystem[]> {
    // Base query — JOIN Node to pick up parentSystemId (Node column, not Subsystem).
    const rawRows = await this.manager
      .getRepository(ENTITY_NAMES.Subsystem)
      .createQueryBuilder('sub')
      .innerJoin(ENTITY_NAMES.Node, 'n', 'n.system_id = sub.system_id')
      .addSelect('n.parentSystemId', 'parentSystemId')
      .where('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawAndEntities();

    // Build parentSystemId lookup from the JOIN result.
    const parentSystemIdBySystemId = new Map<number, number | undefined>(
      rawRows.raw.map((r: Record<string, unknown>) => [
        Number(r['sub_system_id']),
        r['parentSystemId'] == null ? undefined : Number(r['parentSystemId']),
      ]),
    );

    let rows = rawRows.entities as SubsystemBase[];

    if (sessionId === null) {
      return this.buildResult(rows, parentSystemIdBySystemId);
    }

    // Pass 1 — Node overlay. Node is the file-scoped half of the shared-PK
    // aggregate, so its effective row determines whether a Subsystem row is
    // in scope. Applying all actions also captures parent UPDATEs and DELETEs.
    const [subsystemActions, nodeActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Subsystem),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node),
    ]);

    const baseNodes: NodeBase[] = rows.map(row => ({
      systemId: row.systemId,
      parentSystemId: parentSystemIdBySystemId.get(row.systemId),
      type: NODE_TYPE.Subsystem,
      fileSystemId,
    }));
    const effectiveNodes = this.overlay
      .applyToCollection(baseNodes, nodeActions, {
        matchesEffective: node =>
          node.fileSystemId === fileSystemId &&
          node.type === NODE_TYPE.Subsystem,
      })
      .map(result => result.effective);
    const effectiveParentSystemIds = new Map(
      effectiveNodes.map(node => [node.systemId, node.parentSystemId]),
    );
    const inScopeSystemIds = new Set(effectiveParentSystemIds.keys());

    // Pass 2 — Subsystem overlay (name UPDATE, CREATE, DELETE).
    rows = this.overlay
      .applyToCollection(rows, subsystemActions, {
        matchesEffective: row => inScopeSystemIds.has(row.systemId),
      })
      .map(r => r.effective);

    return this.buildResult(rows, effectiveParentSystemIds);
  }

  private buildResult(
    rows: SubsystemBase[],
    parentSystemIdBySystemId: Map<number, number | undefined>,
  ): OverlaidSubsystem[] {
    return rows.map(row => ({
      ...row,
      parentSystemId: parentSystemIdBySystemId.get(row.systemId),
    }));
  }
}
