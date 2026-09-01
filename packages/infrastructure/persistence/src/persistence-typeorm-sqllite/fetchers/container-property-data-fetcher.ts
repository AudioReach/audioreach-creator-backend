/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  ContainerPropertyDataBase,
  ContainerPropertyDataRow,
} from '../entity-schema/usecase-data/container/container-property-data.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

/**
 * Optional column-level filters for ContainerPropertyData queries.
 * Fields map to ContainerPropertyDataBase column names.
 */
export type ContainerPropertyDataFilters = {
  systemId?: number | number[];
  propertySystemId?: number | number[];
  containerSystemId?: number | number[];
  $or?: ContainerPropertyDataFilters[];
};

/**
 * Fetches container_property_data rows with session overlay applied.
 * Separated from ContainerOverlayFetcher per §6 Rule A: ContainerPropertyData
 * has a direct FK to Container and owns its own overlay logic.
 * aggregateId = containerSystemId.
 */
export class ContainerPropertyDataFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    containerSystemId: number,
    sessionId: number | null,
    filters?: ContainerPropertyDataFilters,
  ): Promise<ContainerPropertyDataBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.ContainerPropertyData)
      .createQueryBuilder('cpd')
      .where('cpd.containerSystemId = :containerSystemId', {containerSystemId});
    if (filters) applyEntityFilters(qb, 'cpd', filters);
    const baseRows = (await qb.getMany()) as ContainerPropertyDataRow[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      containerSystemId,
    );
    const propActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.ContainerPropertyData,
    );
    if (propActions.length === 0) return baseRows;

    const createFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    return this.overlay
      .applyToCollection(baseRows, propActions, createFilter)
      .map(r => r.effective);
  }
}
