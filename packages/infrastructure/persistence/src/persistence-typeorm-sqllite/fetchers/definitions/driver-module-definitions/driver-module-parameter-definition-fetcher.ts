/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {DriverModuleParameterDefinitionBase} from '../../../entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/**
 * Optional scalar filters for driver module parameter-definition queries.
 * All defined fields are ANDed; scalar values use equality and arrays use IN.
 */
export type DriverModuleParameterDefinitionFilters = {
  systemId?: number | number[];
  parameterId?: number | number[];
  name?: string | string[];
  description?: string | string[];
  maxSize?: number | number[];
  paramStructure?: string | string[];
  driverModuleDefinitionSystemId?: number | number[];
  $or?: DriverModuleParameterDefinitionFilters[];
};

/**
 * Fetches driver module parameter definitions with session overlay applied.
 * The driver module definition system IDs are the child-row scope.
 */
export class DriverModuleParameterDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Loads overlaid parameters for one or more driver module definitions.
   */
  async fetchMany(
    driverModuleDefinitionSystemIds: number[],
    sessionId: number | null,
    filters?: DriverModuleParameterDefinitionFilters,
  ): Promise<DriverModuleParameterDefinitionBase[]> {
    if (driverModuleDefinitionSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.DriverModuleParameterDefinition)
      .createQueryBuilder('param')
      .where('param.driverModuleDefinitionSystemId IN (:...defSystemIds)', {
        defSystemIds: driverModuleDefinitionSystemIds,
      });
    if (filters) applyEntityFilters(qb, 'param', filters);
    const baseRows =
      (await qb.getMany()) as DriverModuleParameterDefinitionBase[];

    if (sessionId === null) return baseRows;

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.DriverModuleParameterDefinition,
    );
    const definitionIdSet = new Set(driverModuleDefinitionSystemIds);
    const relevantActions = allActions.filter(action =>
      definitionIdSet.has(action.aggregateId),
    );
    const createFilter = filters
      ? (newValue: Record<string, unknown>) =>
          matchesEntityFilters(newValue, filters)
      : undefined;

    return this.overlay
      .applyToCollection(baseRows, relevantActions, createFilter)
      .map(row => row.effective);
  }

  /**
   * Returns one overlaid parameter definition, or null when it is absent.
   * The owner definition ID supplies the child scope for fetchMany.
   */
  async fetchOne(
    parameterSystemId: number,
    driverModuleDefinitionSystemId: number,
    sessionId: number | null,
  ): Promise<DriverModuleParameterDefinitionBase | null> {
    const rows = await this.fetchMany(
      [driverModuleDefinitionSystemId],
      sessionId,
      {systemId: parameterSystemId},
    );
    return rows[0] ?? null;
  }
}
