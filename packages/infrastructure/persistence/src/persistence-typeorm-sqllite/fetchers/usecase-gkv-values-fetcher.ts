/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {UsecaseGkvValuesBase} from '../entity-schema/usecase-data/use-case.js';

/**
 * Fetcher for UseCase → UsecaseGkvValues (GKV entries) relationship.
 * Owns the GKV query AND session overlay so no caller duplicates this logic.
 */
export class UsecaseGkvValuesFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all GKV value entries for the given usecases with session overlay applied.
   * Baseline: usecase_gkv_values table.
   * Overlay: CREATE adds a GKV association; DELETE removes one.
   *
   * @param usecaseSystemIds  Usecases whose GKV entries are requested.
   * @param sessionId         Active session; null returns baseline only.
   */
  async fetchMany(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<UsecaseGkvValuesBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UsecaseGkvValues)
      .createQueryBuilder('gkv')
      .select(['gkv.usecaseSystemId', 'gkv.valueDefSystemId'])
      .where('gkv.usecaseSystemId IN (:...ids)', {ids: usecaseSystemIds})
      .getMany()) as UsecaseGkvValuesBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.UsecaseGkvValues,
    );
    if (actions.length === 0) return baseRows;

    // Group baseline entries per usecase (keyed by valueDefSystemId) and apply overlay
    const entriesByUsecase = new Map<
      number,
      Map<number, UsecaseGkvValuesBase>
    >();
    for (const id of usecaseSystemIds) entriesByUsecase.set(id, new Map());
    for (const row of baseRows) {
      entriesByUsecase.get(row.usecaseSystemId)?.set(row.valueDefSystemId, row);
    }

    for (const action of actions) {
      const p = action.newValue as Partial<{
        usecaseSystemId?: number;
        valueDefSystemId?: number;
      }>;
      const ucId = p.usecaseSystemId;
      const vdId = p.valueDefSystemId;
      if (!ucId || !vdId || !entriesByUsecase.has(ucId)) continue;
      const entries = entriesByUsecase.get(ucId)!;
      if (action.operation === CHANGE_OPERATION.Create) {
        if (!entries.has(vdId))
          entries.set(vdId, {usecaseSystemId: ucId, valueDefSystemId: vdId});
      } else if (action.operation === CHANGE_OPERATION.Delete) {
        entries.delete(vdId);
      }
    }

    const result: UsecaseGkvValuesBase[] = [];
    for (const entries of entriesByUsecase.values()) {
      result.push(...entries.values());
    }
    return result;
  }
}
