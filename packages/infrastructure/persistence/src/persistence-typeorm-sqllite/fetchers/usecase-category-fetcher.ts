/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';
import type {
  UseCaseCategoryJoinRow,
  UseCaseCategoryRow,
} from '../entity-schema/usecase-data/use-case.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';

/**
 * Fetcher for UseCase → UseCaseCategory many-to-many relationship.
 * Owns the category query AND session overlay so no caller duplicates this logic.
 */
export class UseCaseCategoryFetcher {
  private readonly overlay = new OverlayMergeImpl();

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

    if (sessionId === null) {
      return this.fetchManyWithActions(usecaseSystemIds, []);
    }

    const actionGroups = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.UseCaseCategory),
      this.editActionsSvc.getByTable(
        sessionId,
        ENTITY_NAMES.UseCaseCategoryJoin,
      ),
    ]);
    const actions = actionGroups.flat();
    return this.fetchManyWithActions(usecaseSystemIds, actions);
  }

  async fetchManyWithActions(
    usecaseSystemIds: number[],
    actions: readonly EditActionRow[],
  ): Promise<Array<{usecaseSystemId: number; name: string}>> {
    if (usecaseSystemIds.length === 0) return [];

    const requestedUsecaseIds = new Set(usecaseSystemIds);
    const categoryActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.UseCaseCategory,
    );
    const joinActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.UseCaseCategoryJoin,
    );
    const baseLinks = await this.manager
      .getRepository<UseCaseCategoryJoinRow>(ENTITY_NAMES.UseCaseCategoryJoin)
      .createQueryBuilder('link')
      .where('link.useCaseSystemId IN (:...usecaseSystemIds)', {
        usecaseSystemIds,
      })
      .getMany();

    const categorySystemIds = new Set(
      baseLinks.map(link => link.categorySystemId),
    );
    for (const action of joinActions) {
      const value = action.newValue as Partial<UseCaseCategoryJoinRow>;
      if (value.categorySystemId !== undefined) {
        categorySystemIds.add(Number(value.categorySystemId));
      }
    }
    for (const action of categoryActions) {
      categorySystemIds.add(action.targetSystemId);
    }

    const baseCategories =
      categorySystemIds.size === 0
        ? []
        : await this.manager
            .getRepository<UseCaseCategoryRow>(ENTITY_NAMES.UseCaseCategory)
            .createQueryBuilder('category')
            .where('category.systemId IN (:...categorySystemIds)', {
              categorySystemIds: [...categorySystemIds],
            })
            .getMany();
    const effectiveCategories = this.overlay
      .applyToCollection(baseCategories, categoryActions)
      .map(result => result.effective);
    const categoryNameById = new Map(
      effectiveCategories.map(category => [category.systemId, category.name]),
    );
    const effectiveLinks = this.overlay
      .applyToCollection(baseLinks, joinActions, {
        matchesEffective: link => requestedUsecaseIds.has(link.useCaseSystemId),
      })
      .map(result => result.effective);

    return effectiveLinks.flatMap(link => {
      const name = categoryNameById.get(link.categorySystemId);
      return name === undefined
        ? []
        : [{usecaseSystemId: link.useCaseSystemId, name}];
    });
  }
}
