/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {ProcessorDefinitionBase} from '../../../entity-schema/definitions/common/processor-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/**
 * Optional scalar filters for ProcessorDefinition queries.
 * All defined fields are ANDed; scalar values use equality and arrays use IN.
 */
export type ProcessorDefinitionFilters = {
  systemId?: number | number[];
  processorDefinitionId?: number | number[];
  name?: string | string[];
  fileSystemId?: number | number[];
  $or?: ProcessorDefinitionFilters[];
};

/**
 * Fetches processor_definitions by system ID with session overlay applied.
 *
 * ProcessorDefinitions are referenced by SpfModuleDefinitions. This fetcher
 * is used when the service needs processor names or IDs for read model assembly
 * and must respect session edits (FR-3).
 *
 * Uses getByTable for overlay so a single edit_actions query covers any number
 * of processor IDs — consistent with the bulk pattern in other fetchers.
 */
export class ProcessorDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid processor definitions for the given system IDs.
   * Scopes baseline query to the provided IDs; overlay covers the session table.
   */
  async fetchMany(
    processorSystemIds: number[],
    sessionId: number | null,
    filters?: ProcessorDefinitionFilters,
  ): Promise<ProcessorDefinitionBase[]> {
    if (processorSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.ProcessorDefinition)
      .createQueryBuilder('p')
      .where('p.systemId IN (:...processorSystemIds)', {
        processorSystemIds,
      });
    if (filters) applyEntityFilters(qb, 'p', filters);
    const baseRows = (await qb.getMany()) as ProcessorDefinitionBase[];

    if (sessionId === null) return baseRows;

    // Load all processor edit_actions for the session; filter to requested IDs
    // in memory — one DB call regardless of how many processor IDs are requested.
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ProcessorDefinition,
    );
    const idSet = new Set(processorSystemIds);
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
   * Returns one overlaid processor definition, or null when it is absent.
   * Collection loading and overlay semantics remain owned by fetchMany.
   */
  async fetchOne(
    processorSystemId: number,
    sessionId: number | null,
  ): Promise<ProcessorDefinitionBase | null> {
    const rows = await this.fetchMany([processorSystemId], sessionId);
    return rows[0] ?? null;
  }
}
