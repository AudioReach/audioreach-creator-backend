/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  IntentBase,
  IntentRow,
} from '../entity-schema/usecase-data/node/control-port.js';

/**
 * Fetches intent rows for a set of ControlPorts with session overlay applied.
 * Separated from PortOverlayFetcher per §6 Rule A: Intent has a direct FK
 * to ControlPort and owns its own overlay logic.
 * aggregateId = nodeSystemId (the owning Node's PK).
 */
export class IntentFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid intents for the given control port IDs.
   * Single-node reads scope by aggregate; multi-node reads load the Intent
   * table overlay once and filter it to the requested Node aggregates.
   */
  async fetchMany(
    controlPortSystemIds: number[],
    nodeSystemIds: number | readonly number[],
    sessionId: number | null,
  ): Promise<IntentBase[]> {
    if (controlPortSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Intent)
      .createQueryBuilder('i')
      .where('i.controlPortSystemId IN (:...cpIds)', {
        cpIds: controlPortSystemIds,
      })
      .getMany()) as IntentRow[];

    if (sessionId === null) return baseRows;

    const isBatch = typeof nodeSystemIds !== 'number';
    const aggregateIds = new Set(isBatch ? nodeSystemIds : [nodeSystemIds]);
    const allActions = isBatch
      ? await this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Intent)
      : await this.editActionsSvc.getByAggregateId(sessionId, nodeSystemIds);
    const intentActions = allActions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.Intent &&
        aggregateIds.has(action.aggregateId),
    );
    if (intentActions.length === 0) return baseRows;

    const cpIdSet = new Set(controlPortSystemIds);
    return this.overlay
      .applyToCollection(baseRows, intentActions, {
        matchesEffective: row => cpIdSet.has(row.controlPortSystemId),
      })
      .map(r => r.effective);
  }
}
