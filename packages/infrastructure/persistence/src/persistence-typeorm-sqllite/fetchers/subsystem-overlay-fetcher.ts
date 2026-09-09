/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {NodeOverlayFetcher} from './node-overlay-fetcher.js';
import type {
  SubsystemBase,
  SubsystemFilteredKeyRow,
} from '../entity-schema/usecase-data/subsystem/subsystem.js';

export interface OverlaidSubsystem extends SubsystemBase {
  /** parentId from the effective Node row; undefined when the subsystem is a root. */
  parentId: number | undefined;
  /**
   * System IDs of key definitions in this subsystem's filtered-key relation.
   * These IDs are matched against usecase GKV key system IDs by the core
   * subsystem-filtered GKV algorithm.
   */
  filteredKeySystemIds: number[];
}

type FilteredKeyActionValue = {
  subsystemsSystemId?: number;
  keyDefinitionSystemIds?: unknown;
};

/**
 * Fetches subsystems, parent topology, filtered-key relations, and their
 * edit-session overlays in one persistence boundary.
 */
export class SubsystemOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly nodeFetcher: NodeOverlayFetcher,
  ) {}

  async fetchAll(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSubsystem[]> {
    const [rawSubsystemRows, nodeRows, filteredKeyRows] = await Promise.all([
      this.manager
        .getRepository(ENTITY_NAMES.Subsystem)
        .createQueryBuilder('sub')
        .innerJoin(ENTITY_NAMES.Node, 'n', 'n.system_id = sub.system_id')
        .where('n.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany() as Promise<SubsystemBase[]>,
      this.nodeFetcher.fetchAll(fileSystemId, sessionId),
      this.loadFilteredKeyRows(fileSystemId),
    ]);

    let subsystemRows = rawSubsystemRows;
    let filteredIdsBySubsystem = this.groupFilteredKeyRows(filteredKeyRows);

    if (sessionId !== null) {
      const [subsystemActions, filteredKeyActions] = await Promise.all([
        this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Subsystem),
        this.editActionsSvc.getByTable(
          sessionId,
          ENTITY_NAMES.SubsystemFilteredKey,
        ),
      ]);

      subsystemRows = this.overlay
        .applyToCollection(subsystemRows, subsystemActions)
        .map(result => result.effective);
      filteredIdsBySubsystem = this.applyFilteredKeyActions(
        filteredIdsBySubsystem,
        filteredKeyActions,
      );
    }

    const parentBySystemId = new Map<number, number | undefined>(
      nodeRows.map(node => [node.systemId, node.parentId]),
    );

    return subsystemRows.map(subsystem => ({
      ...subsystem,
      parentId: parentBySystemId.get(subsystem.systemId),
      filteredKeySystemIds: [
        ...(filteredIdsBySubsystem.get(subsystem.systemId) ?? []),
      ],
    }));
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
}
