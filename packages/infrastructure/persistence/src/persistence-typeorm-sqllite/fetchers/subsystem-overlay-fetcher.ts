/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {
  NODE_TYPE,
  type NodeBase,
} from '../entity-schema/usecase-data/node/node.schema.js';
import type {
  SubsystemBase,
  SubsystemFilteredKeyRow,
} from '../entity-schema/usecase-data/subsystem/subsystem.js';

export interface OverlaidSubsystem extends SubsystemBase {
  /** parentSystemId from Node.parentSystemId — null when the subsystem is a root. */
  parentSystemId: number | null;
  /** Effective filtered key-definition IDs for the subsystem. */
  filteredKeySystemIds: number[];
}

type FilteredKeyActionValue = {
  keyDefinitionSystemIds?: unknown;
};

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

    const filteredKeyRows = await this.loadFilteredKeyRows(fileSystemId);

    // Build parentSystemId lookup from the JOIN result.
    const parentSystemIdBySubsystemSystemId = new Map<number, number | null>(
      rawRows.raw.map((r: Record<string, unknown>) => [
        Number(r['sub_system_id']),
        r['parentSystemId'] == null ? null : Number(r['parentSystemId']),
      ]),
    );

    const subsystemRows = rawRows.entities as SubsystemBase[];
    let filteredIdsBySubsystem = this.groupFilteredKeyRows(filteredKeyRows);
    let rows: Array<SubsystemBase & {filteredKeySystemIds?: number[]}> =
      subsystemRows.map(row => ({
        ...row,
        filteredKeySystemIds: [
          ...(filteredIdsBySubsystem.get(row.systemId) ?? []),
        ],
      }));

    if (sessionId === null) {
      return this.buildResult(
        rows,
        parentSystemIdBySubsystemSystemId,
        filteredIdsBySubsystem,
      );
    }

    // Pass 1 — Node overlay. Node is the file-scoped half of the shared-PK
    // aggregate, so its effective row determines whether a Subsystem row is
    // in scope. Applying all actions also captures parent UPDATEs and DELETEs.
    const [subsystemActions, nodeActions, filteredKeyActions] =
      await Promise.all([
        this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Subsystem),
        this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node),
        this.editActionsSvc.getByTable(
          sessionId,
          ENTITY_NAMES.SubsystemFilteredKey,
        ),
      ]);

    const baseNodes: NodeBase[] = rows.map(row => ({
      systemId: row.systemId,
      parentSystemId:
        parentSystemIdBySubsystemSystemId.get(row.systemId) ?? null,
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

    filteredIdsBySubsystem = this.applyFilteredKeyActions(
      filteredIdsBySubsystem,
      filteredKeyActions,
    );

    return this.buildResult(
      rows,
      effectiveParentSystemIds,
      filteredIdsBySubsystem,
    );
  }

  private async loadFilteredKeyRows(
    fileSystemId: number,
  ): Promise<SubsystemFilteredKeyRow[]> {
    return this.manager
      .getRepository<SubsystemFilteredKeyRow>(ENTITY_NAMES.SubsystemFilteredKey)
      .createQueryBuilder('filtered')
      .innerJoin(
        ENTITY_NAMES.Node,
        'n',
        'n.system_id = filtered.subsystems_system_id',
      )
      .select(['filtered.subsystemsSystemId', 'filtered.keyDefinitionSystemId'])
      .where('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany();
  }

  private groupFilteredKeyRows(
    rows: SubsystemFilteredKeyRow[],
  ): Map<number, number[]> {
    const result = new Map<number, number[]>();
    for (const row of rows) {
      const ids = result.get(row.subsystemsSystemId) ?? [];
      ids.push(row.keyDefinitionSystemId);
      result.set(row.subsystemsSystemId, ids);
    }
    return result;
  }

  private applyFilteredKeyActions(
    baseline: Map<number, number[]>,
    actions: Awaited<ReturnType<EditActionsQueryService['getByTable']>>,
  ): Map<number, number[]> {
    const result = new Map(
      [...baseline].map(([subsystemId, keyIds]) => [subsystemId, [...keyIds]]),
    );

    for (const action of actions) {
      if (
        action.operation === CHANGE_OPERATION.Delete &&
        action.fieldPath === null
      ) {
        result.delete(action.targetSystemId);
        continue;
      }

      if (
        action.operation !== CHANGE_OPERATION.Update ||
        action.fieldPath !== null
      ) {
        continue;
      }

      const value = action.newValue as FilteredKeyActionValue;
      if (!Array.isArray(value.keyDefinitionSystemIds)) continue;
      result.set(
        action.targetSystemId,
        value.keyDefinitionSystemIds
          .map(Number)
          .filter(value => Number.isFinite(value)),
      );
    }

    return result;
  }

  private buildResult(
    rows: Array<SubsystemBase & {filteredKeySystemIds?: number[]}>,
    parentSystemIdBySubsystemSystemId: Map<number, number | null | undefined>,
    filteredKeyIdsBySubsystem: ReadonlyMap<number, readonly number[]>,
  ): OverlaidSubsystem[] {
    return rows.map(row => ({
      ...row,
      parentSystemId:
        parentSystemIdBySubsystemSystemId.get(row.systemId) ?? null,
      filteredKeySystemIds: [
        ...(filteredKeyIdsBySubsystem.get(row.systemId) ?? []),
      ],
    }));
  }
}
