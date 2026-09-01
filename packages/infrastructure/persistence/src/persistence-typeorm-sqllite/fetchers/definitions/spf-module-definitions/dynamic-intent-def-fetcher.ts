/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {DynamicIntentDefinitionBase} from '../../../entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/** Optional scalar filters for DynamicIntentDefinition queries. */
export type DynamicIntentDefinitionFilters = {
  systemId?: number | number[];
  intentId?: number | number[];
  name?: string | string[];
  maxPort?: number | number[];
  moduleDefinitionSystemId?: number | number[];
  $or?: DynamicIntentDefinitionFilters[];
};

/** Fetches dynamic intents owned by an SpfModuleDefinition. */
export class DynamicIntentDefFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    defSystemId: number,
    sessionId: number | null,
    filters?: DynamicIntentDefinitionFilters,
  ): Promise<DynamicIntentDefinitionBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.DynamicIntentDefinition)
      .createQueryBuilder('did')
      .where('did.moduleDefinitionSystemId = :defSystemId', {defSystemId});
    if (filters) applyEntityFilters(qb, 'did', filters);
    const baseRows = (await qb.getMany()) as DynamicIntentDefinitionBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const dynamicIntentActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.DynamicIntentDefinition,
    );
    const createFilter = (newValue: Record<string, unknown>) =>
      newValue.moduleDefinitionSystemId === defSystemId &&
      (filters === undefined || matchesEntityFilters(newValue, filters));

    return this.overlay
      .applyToCollection(baseRows, dynamicIntentActions, createFilter)
      .map(row => row.effective);
  }
}
