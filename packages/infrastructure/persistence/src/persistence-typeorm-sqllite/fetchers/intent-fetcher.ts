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
   * A single getByAggregateId call scopes to the parent Node aggregate.
   */
  async fetchMany(
    controlPortSystemIds: number[],
    nodeSystemId: number,
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

    const allActions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      nodeSystemId,
    );
    const intentActions = allActions.filter(
      a => a.targetTable === ENTITY_NAMES.Intent,
    );
    if (intentActions.length === 0) return baseRows;

    const cpIdSet = new Set(controlPortSystemIds);
    const createFilter = (nv: Record<string, unknown>) => {
      const cpId = (nv as {controlPortSystemId?: number}).controlPortSystemId;
      return cpId !== undefined && cpIdSet.has(cpId);
    };

    return this.overlay
      .applyToCollection(baseRows, intentActions, createFilter)
      .map(r => r.effective);
  }
}
