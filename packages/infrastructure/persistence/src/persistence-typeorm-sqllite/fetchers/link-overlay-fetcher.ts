/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {ControlLinkBase} from '../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../entity-schema/usecase-data/Links/data-link.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

/**
 * Optional column-level filters for DataLink queries.
 * Fields map directly to DataLinkBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 *
 * @example
 * // Links originating from subgraph 5
 * { sourceSubgraphSystemId: 5 }
 *
 * @example
 * // Cross-subgraph links from subgraph 5 to subgraph 10
 * { sourceSubgraphSystemId: 5, destSubgraphSystemId: 10 }
 *
 * @example
 * // EC links only
 * { isEc: true }
 */
export type DataLinkFilters = {
  /** Filter by specific link system IDs — useful after JOIN queries scope the ID set. */
  systemId?: number | number[];
  sourceNodeSystemId?: number | number[];
  destinationNodeSystemId?: number | number[];
  sourcePortSystemId?: number | number[];
  destinationPortSystemId?: number | number[];
  linkType?: string | string[];
  sourceSubgraphSystemId?: number | number[];
  destSubgraphSystemId?: number | number[];
  isEc?: boolean;
  $or?: DataLinkFilters[];
};

/**
 * Optional column-level filters for ControlLink queries.
 * Fields map directly to ControlLinkBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type ControlLinkFilters = {
  /** Filter by specific link system IDs — useful after JOIN queries scope the ID set. */
  systemId?: number | number[];
  peerNodeASystemId?: number | number[];
  peerNodeBSystemId?: number | number[];
  nodeAPortSystemId?: number | number[];
  nodeBPortSystemId?: number | number[];
  heapId?: number | number[];
  linkType?: string | string[];
  sourceSubgraphSystemId?: number | number[];
  destSubgraphSystemId?: number | number[];
  $or?: ControlLinkFilters[];
};

/**
 * Fetcher for data and control links with session overlay applied.
 *
 * Core entry points for full-row fetching:
 *   loadBaseDataLinkRows    — all DataLink rows for a file, column-filtered
 *   loadBaseControlLinkRows — all ControlLink rows for a file, column-filtered
 *
 * Cross-entity scoping (by usecase, by subgraph OR condition) is the
 * responsibility of the DB query service layer, which calls these core methods
 * with appropriate DataLinkFilters / ControlLinkFilters.
 *
 * Port-counting entry points (fetchDataLinks, fetchControlLinks) return
 * lightweight LinkOverlayEntry pairs for a given set of port IDs.
 */
export class LinkOverlayFetcher {
  private readonly overlayMerge = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  // ── Core entry points ────────────────────────────────────────────────────────

  /**
   * Loads all data links for the given file with optional column-level filters,
   * then applies session overlay (CREATE/UPDATE/DELETE).
   *
   * This is the sole entry point for fetching DataLink rows. Callers scope the
   * result by specifying DataLinkBase column values in the filters object:
   *   { sourceSubgraphSystemId: X }                             links from X
   *   { sourceSubgraphSystemId: X, destSubgraphSystemId: Y }    X → Y links
   *   { sourceSubgraphSystemId: [X, Y] }                        from X or Y
   *
   * @param fileSystemId  Scope to this file.
   * @param sessionId     Active session for overlay; null returns baseline only.
   * @param filters       Optional DataLinkBase column filters. All ANDed.
   */
  async loadDataLinkRows(
    fileSystemId: number,
    sessionId: number | null,
    filters?: DataLinkFilters,
  ): Promise<DataLinkBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.DataLink)
      .createQueryBuilder('dl')
      .where('dl.fileSystemId = :fileSystemId', {fileSystemId});
    if (filters) applyEntityFilters(qb, 'dl', filters);
    const baseRows = (await qb.getMany()) as DataLinkBase[];
    return this.applyDataLinkOverlay(
      baseRows,
      fileSystemId,
      sessionId,
      filters,
    );
  }

  /**
   * Loads all control links for the given file with optional column-level
   * filters, then applies session overlay (CREATE/UPDATE/DELETE).
   *
   * This is the sole entry point for fetching ControlLink rows.
   *
   * @param fileSystemId  Scope to this file.
   * @param sessionId     Active session for overlay; null returns baseline only.
   * @param filters       Optional ControlLinkBase column filters. All ANDed.
   */
  async loadControlLinkRows(
    fileSystemId: number,
    sessionId: number | null,
    filters?: ControlLinkFilters,
  ): Promise<ControlLinkBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where('cl.fileSystemId = :fileSystemId', {fileSystemId});
    if (filters) applyEntityFilters(qb, 'cl', filters);
    const baseRows = (await qb.getMany()) as ControlLinkBase[];
    return this.applyControlLinkOverlay(
      baseRows,
      fileSystemId,
      sessionId,
      filters,
    );
  }

  /** Deduplicates an array by systemId — preserves first occurrence. */

  /**
   * Applies session overlay to DataLink baseline rows.
   * Passes ALL actions to applyToCollection — UPDATE/DELETE handled in loop 1,
   * CREATE handled in loop 2. createFilter gates session-created rows through
   * the same column filter as the baseline SQL query.
   */
  private async applyDataLinkOverlay(
    baseRows: DataLinkBase[],
    _fileSystemId: number,
    sessionId: number | null,
    filters?: DataLinkFilters,
  ): Promise<DataLinkBase[]> {
    let allRows: DataLinkBase[];

    if (sessionId === null) {
      allRows = baseRows;
    } else {
      const actions = await this.editActionsSvc.getByTable(
        sessionId,
        ENTITY_NAMES.DataLink,
      );
      const createFilter = filters
        ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
        : undefined;
      allRows =
        actions.length > 0
          ? this.overlayMerge
              .applyToCollection(baseRows, actions, createFilter)
              .map(r => r.effective)
          : baseRows;
    }

    return this.dedup(allRows);
  }

  /**
   * Applies session overlay to ControlLink baseline rows.
   * Same pattern as applyDataLinkOverlay.
   */
  private async applyControlLinkOverlay(
    baseRows: ControlLinkBase[],
    _fileSystemId: number,
    sessionId: number | null,
    filters?: ControlLinkFilters,
  ): Promise<ControlLinkBase[]> {
    let allRows: ControlLinkBase[];

    if (sessionId === null) {
      allRows = baseRows;
    } else {
      const actions = await this.editActionsSvc.getByTable(
        sessionId,
        ENTITY_NAMES.ControlLink,
      );
      const createFilter = filters
        ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
        : undefined;
      allRows =
        actions.length > 0
          ? this.overlayMerge
              .applyToCollection(baseRows, actions, createFilter)
              .map(r => r.effective)
          : baseRows;
    }

    return this.dedup(allRows);
  }

  /** Deduplicates an array by systemId — preserves first occurrence. */
  private dedup<T extends {systemId: number}>(rows: T[]): T[] {
    const seen = new Set<number>();
    return rows.filter(r => !seen.has(r.systemId) && seen.add(r.systemId));
  }
}
