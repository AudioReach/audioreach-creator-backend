/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';

/**
 * Fetcher for UseCase → UseCaseCategory many-to-many relationship.
 * Owns the category query AND session overlay so no caller duplicates this logic.
 */
export class UseCaseCategoryFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns category names for the given usecases with session overlay applied.
   * Baseline: UseCase → UseCaseCategory many-to-many relation.
   * Overlay: CREATE adds a category association; DELETE removes one.
   *
   * @param usecaseSystemIds  Usecases whose category names are requested.
   * @param sessionId         Active session; null returns baseline only.
   */
  async fetchMany(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<Array<{usecaseSystemId: number; name: string}>> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = await this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .innerJoin('uc.categories', 'cat')
      .select('uc.systemId', 'usecaseSystemId')
      .addSelect('cat.name', 'name')
      .where('uc.systemId IN (:...ids)', {ids: usecaseSystemIds})
      .getRawMany<{usecaseSystemId: number; name: string}>();

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.UseCaseCategory,
    );
    if (actions.length === 0) return baseRows;

    // Group baseline names per usecase and apply CREATE/DELETE overlay
    const namesByUsecase = new Map<number, Set<string>>();
    for (const id of usecaseSystemIds) namesByUsecase.set(id, new Set());
    for (const row of baseRows) {
      namesByUsecase.get(row.usecaseSystemId)?.add(row.name);
    }

    for (const action of actions) {
      const p = action.newValue as Partial<{
        usecaseSystemId?: number;
        name?: string;
      }>;
      const ucId = p.usecaseSystemId;
      if (!ucId || !p.name || !namesByUsecase.has(ucId)) continue;
      const names = namesByUsecase.get(ucId)!;
      if (action.operation === CHANGE_OPERATION.Create) names.add(p.name);
      else if (action.operation === CHANGE_OPERATION.Delete)
        names.delete(p.name);
    }

    const result: Array<{usecaseSystemId: number; name: string}> = [];
    for (const [ucId, names] of namesByUsecase) {
      for (const name of names) result.push({usecaseSystemId: ucId, name});
    }
    return result;
  }
}
