/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {ValueDefinitionBase} from '../../../entity-schema/definitions/key-value/value-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/** Optional scalar filters for ValueDefinition queries. */
export type ValueDefinitionFilters = {
  systemId?: number | number[];
  keySystemId?: number | number[];
  valueId?: number | number[];
  name?: string | string[];
  $or?: ValueDefinitionFilters[];
};

/**
 * Fetches ValueDefinition rows with session overlay applied.
 * The primary scope is always ValueDefinition.systemId; relationships to a
 * parent key are expressed through ValueDefinitionFilters.keySystemId.
 */
export class ValueDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /** Loads values by their own system IDs, or all values matching filters. */
  async fetchMany(
    valueSystemIds: number[] | 'all',
    sessionId: number | null,
    filters?: ValueDefinitionFilters,
  ): Promise<ValueDefinitionBase[]> {
    if (Array.isArray(valueSystemIds) && valueSystemIds.length === 0) {
      return [];
    }

    const qb = this.manager
      .getRepository(ENTITY_NAMES.ValueDefinition)
      .createQueryBuilder('v');
    if (valueSystemIds !== 'all') {
      qb.where('v.systemId IN (:...valueSystemIds)', {valueSystemIds});
    }
    if (filters) applyEntityFilters(qb, 'v', filters);
    const baseRows = (await qb.getMany()) as ValueDefinitionBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ValueDefinition,
    );
    const requestedValueIds =
      valueSystemIds === 'all' ? undefined : new Set(valueSystemIds);
    const relevantActions = actions.filter(action =>
      requestedValueIds === undefined
        ? true
        : requestedValueIds.has(action.targetSystemId),
    );
    const createFilter = (newValue: Record<string, unknown>) =>
      filters === undefined || matchesEntityFilters(newValue, filters);

    return this.overlay
      .applyToCollection(baseRows, relevantActions, createFilter)
      .map(row => row.effective);
  }

  /** Returns one value by its system ID, constrained by its parent key. */
  async fetchOne(
    valueSystemId: number,
    keySystemId: number,
    sessionId: number | null,
  ): Promise<ValueDefinitionBase | null> {
    const rows = await this.fetchMany([valueSystemId], sessionId, {
      keySystemId,
    });
    return rows[0] ?? null;
  }
}
