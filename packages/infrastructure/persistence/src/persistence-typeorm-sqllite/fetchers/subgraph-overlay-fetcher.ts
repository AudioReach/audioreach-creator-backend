/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphBase} from '../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';
import type {SubgraphPropertyDataFetcher} from './subgraph-property-data-fetcher.js';
import type {SubgraphSgkvFetcher} from './subgraph-sgkv-fetcher.js';
export type {OverlaidSgkv} from './subgraph-sgkv-fetcher.js';

/**
 * Optional column-level filters for Subgraph queries.
 * Fields map directly to SubgraphBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type SubgraphFilters = {
  systemId?: number | number[];
  subgraphId?: number | number[];
  name?: string | string[];
  isImported?: boolean;
  $or?: SubgraphFilters[];
};

export interface OverlaidSubgraph extends SubgraphBase {
  properties: SubgraphPropertyDataBase[];
}

export class SubgraphOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly propertyDataFetcher: SubgraphPropertyDataFetcher,
    private readonly sgkvFetcher: SubgraphSgkvFetcher,
  ) {}

  // ── Core entry point ─────────────────────────────────────────────────────────

  /**
   * Fetches all Subgraph rows for the given file with optional column-level
   * filters, then applies session overlay (CREATE/UPDATE/DELETE).
   * Returns SubgraphBase[] — no property data.
   */
  async fetchMany(
    fileSystemId: number,
    sessionId: number | null,
    filters?: SubgraphFilters,
  ): Promise<SubgraphBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.fileSystemId = :fileSystemId', {fileSystemId});
    if (filters) applyEntityFilters(qb, 's', filters);
    const baseRows = (await qb.getMany()) as SubgraphBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Subgraph,
    );

    return this.overlay
      .applyToCollection(
        baseRows,
        actions,
        filters ? nv => matchesEntityFilters(nv, filters) : undefined,
      )
      .map(r => r.effective);
  }

  // ── Assembled entry points ────────────────────────────────────────────────────

  /**
   * Returns a single fully-assembled OverlaidSubgraph (scalars + properties).
   * Does NOT delegate to fetchMany — that method's createFilter cannot include
   * session-created rows (systemId absent from newValue). Uses applyToSingle
   * directly with getByAggregateAndTable so systemId is taken from
   * targetSystemId on the CREATE action.
   */
  async fetchOne(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSubgraph | null> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('s.systemId = :systemId', {systemId: subgraphSystemId})
      .getMany()) as SubgraphBase[];
    const baseRow = baseRows.length > 0 ? baseRows[0] : null;

    if (sessionId === null) {
      if (!baseRow) return null;
      const properties = await this.propertyDataFetcher.fetchMany(
        [subgraphSystemId],
        sessionId,
      );
      return {...baseRow, properties};
    }

    const actions = await this.editActionsSvc.getByAggregateAndTable(
      sessionId,
      subgraphSystemId,
      ENTITY_NAMES.Subgraph,
    );
    const result = this.overlay.applyToSingle(baseRow, actions);
    if (!result) return null;

    const properties = await this.propertyDataFetcher.fetchMany(
      [subgraphSystemId],
      sessionId,
    );
    return {...result.effective, properties};
  }

  /**
   * Returns all SGKV rows for the given file with session overlay.
   * Delegates to the injected SubgraphSgkvFetcher.
   */
  async getSgkvs(fileSystemId: number, sessionId: number | null) {
    return this.sgkvFetcher.fetchMany(fileSystemId, sessionId);
  }
}
