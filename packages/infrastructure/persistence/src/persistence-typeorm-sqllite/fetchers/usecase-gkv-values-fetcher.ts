/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';
import type {UsecaseGkvValuesBase} from '../entity-schema/usecase-data/use-case.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';

/**
 * Fetcher for UseCase → UsecaseGkvValues (GKV entries) relationship.
 * Owns the GKV query AND session overlay so no caller duplicates this logic.
 */
export class UsecaseGkvValuesFetcher {
  private readonly overlay = new OverlayMergeImpl();

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

    const actions =
      sessionId === null
        ? []
        : await this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.UsecaseGkvValues,
          );
    return this.fetchManyWithActions(usecaseSystemIds, actions);
  }

  async fetchManyWithActions(
    usecaseSystemIds: number[],
    actions: readonly EditActionRow[],
  ): Promise<UsecaseGkvValuesBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UsecaseGkvValues)
      .createQueryBuilder('gkv')
      .select(['gkv.systemId', 'gkv.usecaseSystemId', 'gkv.valueDefSystemId'])
      .where('gkv.usecaseSystemId IN (:...ids)', {ids: usecaseSystemIds})
      .getMany()) as UsecaseGkvValuesBase[];

    if (actions.length === 0) return baseRows;

    const requestedUsecases = new Set(usecaseSystemIds);
    return this.overlay
      .applyToCollection(baseRows, [...actions], {
        matchesEffective: row => requestedUsecases.has(row.usecaseSystemId),
      })
      .map(result => result.effective);
  }
}
