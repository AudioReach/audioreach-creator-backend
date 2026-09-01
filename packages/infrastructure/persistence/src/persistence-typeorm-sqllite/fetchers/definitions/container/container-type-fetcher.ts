/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {ContainerTypeBase} from '../../../entity-schema/definitions/container/container-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/**
 * Optional scalar filters for ContainerType queries.
 * All defined fields are ANDed; scalar values use equality and arrays use IN.
 */
export type ContainerTypeFilters = {
  systemId?: number | number[];
  name?: string | string[];
  value?: number | number[];
  $or?: ContainerTypeFilters[];
};

/**
 * Fetches container_types by system ID with session overlay applied.
 *
 * ContainerType has no fileSystemId — it is a system-wide lookup table.
 * Overlay is scoped to the provided system IDs via getByTable + in-memory filter.
 *
 * Used when assembling container type info for definition summary read models (FR-3).
 */
export class ContainerTypeFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid container types for the given system IDs.
   */
  async fetchMany(
    containerTypeSystemIds: number[],
    sessionId: number | null,
    filters?: ContainerTypeFilters,
  ): Promise<ContainerTypeBase[]> {
    if (containerTypeSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.ContainerType)
      .createQueryBuilder('ct')
      .where('ct.systemId IN (:...containerTypeSystemIds)', {
        containerTypeSystemIds,
      });
    if (filters) applyEntityFilters(qb, 'ct', filters);
    const baseRows = (await qb.getMany()) as ContainerTypeBase[];

    if (sessionId === null) return baseRows;

    // Single getByTable call covers all requested container type IDs.
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ContainerType,
    );
    const idSet = new Set(containerTypeSystemIds);
    const relevantActions = allActions.filter(a => idSet.has(a.aggregateId));
    const createFilter = filters
      ? (newValue: Record<string, unknown>) =>
          matchesEntityFilters(newValue, filters)
      : undefined;

    return this.overlay
      .applyToCollection(baseRows, relevantActions, createFilter)
      .map(r => r.effective);
  }

  /**
   * Returns one overlaid container type, or null when it is absent.
   * Collection loading and overlay semantics remain owned by fetchMany.
   */
  async fetchOne(
    containerTypeSystemId: number,
    sessionId: number | null,
  ): Promise<ContainerTypeBase | null> {
    const rows = await this.fetchMany([containerTypeSystemId], sessionId);
    return rows[0] ?? null;
  }
}
