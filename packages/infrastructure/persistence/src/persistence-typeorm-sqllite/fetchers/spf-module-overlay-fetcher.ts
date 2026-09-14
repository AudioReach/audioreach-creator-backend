/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  SpfModuleBase,
  SpfModuleRow,
} from '../entity-schema/usecase-data/module/spf-module.schema.js';
import {
  applyCandidateFilters,
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

/**
 * Optional column-level filters for SpfModule queries.
 * Fields map directly to SpfModuleBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type SpfModuleFilters = {
  systemId?: number | number[];
  subgraphSystemId?: number | number[];
  containerSystemId?: number | number[];
  definitionSystemId?: number | number[];
  naturalId?: number | number[];
  alias?: string | string[];
  $or?: SpfModuleFilters[];
};

/**
 * SpfModule assembled with the node-topology parentId from the nodes table.
 * SpfModule and Node share the same PK — parentId is fetched separately
 * from nodes and merged at the call site.
 */
export interface OverlaidSpfModule extends SpfModuleBase {
  parentSystemId: number | null;
}

/**
 * Fetcher for spf_modules rows.
 * Owns the SpfModule query, session overlay (CREATE/UPDATE/DELETE), and all
 * node-set queries whose primary filter is a SpfModule column (subgraphSystemId,
 * usecase→subgraph join).
 */
export class SpfModuleOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  // ── Core entry points ─────────────────────────────────────────────────────────

  /**
   * Fetches all SpfModule rows for the given file with optional column-level
   * filters, then applies session overlay (CREATE/UPDATE/DELETE).
   *
   * Use `filters.subgraphSystemId` to scope by subgraph instead of calling
   * loadBaselineNodeIdsForSubgraph. Session-created modules are included
   * through the final effective-row predicate.
   *
   * @param fileSystemId  File scope filter.
   * @param sessionId     Active session; null returns baseline only.
   * @param filters       Optional SpfModuleBase column filters.
   */
  async fetchMany(
    fileSystemId: number,
    sessionId: number | null,
    filters?: SpfModuleFilters,
  ): Promise<SpfModuleBase[]> {
    if (sessionId === null) {
      const qb = this.baseQuery(fileSystemId);
      if (filters) applyEntityFilters(qb, 'sm', filters);
      return (await qb.getMany()) as SpfModuleBase[];
    }

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.SpfModule,
    );
    const {subgraphSystemId, ...mutableFilters} = filters ?? {};
    const qb = this.baseQuery(fileSystemId);
    if (subgraphSystemId !== undefined) {
      applyEntityFilters(qb, 'sm', {subgraphSystemId});
    }
    applyCandidateFilters(
      qb,
      'sm',
      mutableFilters,
      allActions.map(action => action.targetSystemId),
    );
    const baseRows = (await qb.getMany()) as SpfModuleBase[];

    if (allActions.length === 0) return baseRows;

    return this.overlay
      .applyToCollection(baseRows, allActions, {
        matchesEffective: row =>
          row.fileSystemId === fileSystemId &&
          (filters === undefined ||
            matchesEntityFilters(
              row as unknown as Record<string, unknown>,
              filters,
            )),
      })
      .map(r => r.effective);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private baseQuery(fileSystemId: number) {
    return this.manager
      .getRepository<SpfModuleRow>(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('sm')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId});
  }
}
