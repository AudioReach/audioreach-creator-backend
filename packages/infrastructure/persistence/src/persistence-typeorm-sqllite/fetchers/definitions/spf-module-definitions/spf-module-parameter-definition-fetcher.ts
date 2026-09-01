/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {SpfModuleParameterDefinitionBase} from '../../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/** Optional scalar filters for SPF module parameter definitions. */
export type SpfModuleParameterDefinitionFilters = {
  systemId?: number | number[];
  paramId?: number | number[];
  name?: string | string[];
  pidType?: string | string[];
  isPersistent?: boolean | boolean[];
  toolPolicies?: string | string[];
  spfModuleDefinitionSystemId?: number | number[];
  $or?: SpfModuleParameterDefinitionFilters[];
};

/**
 * Fetches SPF module parameter definitions with session overlay applied.
 * The module definition system IDs are the child-row scope.
 */
export class SpfModuleParameterDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /** Loads overlaid parameters for one or more SPF module definitions. */
  async fetchMany(
    spfModuleDefinitionSystemIds: number[],
    sessionId: number | null,
    filters?: SpfModuleParameterDefinitionFilters,
  ): Promise<SpfModuleParameterDefinitionBase[]> {
    if (spfModuleDefinitionSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('param')
      .where('param.spfModuleDefinitionSystemId IN (:...defSystemIds)', {
        defSystemIds: spfModuleDefinitionSystemIds,
      });
    if (filters) applyEntityFilters(qb, 'param', filters);
    const baseRows = (await qb.getMany()) as SpfModuleParameterDefinitionBase[];

    if (sessionId === null) return baseRows;

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.SpfModuleParameterDefinition,
    );
    const definitionIdSet = new Set(spfModuleDefinitionSystemIds);
    const relevantActions = allActions.filter(action =>
      definitionIdSet.has(action.aggregateId),
    );
    const createFilter = (newValue: Record<string, unknown>) => {
      const ownerId = newValue.spfModuleDefinitionSystemId;
      return (
        typeof ownerId === 'number' &&
        definitionIdSet.has(ownerId) &&
        (filters === undefined || matchesEntityFilters(newValue, filters))
      );
    };

    return this.overlay
      .applyToCollection(baseRows, relevantActions, createFilter)
      .map(row => row.effective);
  }

  /**
   * Returns one overlaid parameter definition, or null when it is absent.
   * The owning definition is resolved first, then collection loading and
   * overlay remain owned by fetchMany.
   */
  async fetchOne(
    parameterSystemId: number,
    sessionId: number | null,
  ): Promise<SpfModuleParameterDefinitionBase | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('param')
      .select(['param.systemId', 'param.spfModuleDefinitionSystemId'])
      .where('param.systemId = :parameterSystemId', {parameterSystemId})
      .getOne()) as {
      systemId: number;
      spfModuleDefinitionSystemId: number;
    } | null;

    if (baseRow === null) return null;

    const rows = await this.fetchMany(
      [baseRow.spfModuleDefinitionSystemId],
      sessionId,
      {systemId: parameterSystemId},
    );
    return rows[0] ?? null;
  }
}
