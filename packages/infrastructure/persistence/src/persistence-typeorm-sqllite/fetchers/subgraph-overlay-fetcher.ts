/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import type {SessionChanged} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphBase} from '../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import {
  applyCandidateFilters,
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
  naturalId?: number | number[];
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
    private readonly propertyDataFetcher?: SubgraphPropertyDataFetcher,
    private readonly sgkvFetcher?: SubgraphSgkvFetcher,
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
    if (sessionId === null) {
      const qb = this.manager
        .getRepository(ENTITY_NAMES.Subgraph)
        .createQueryBuilder('s')
        .where('s.fileSystemId = :fileSystemId', {fileSystemId});
      if (filters) applyEntityFilters(qb, 's', filters);
      return (await qb.getMany()) as SubgraphBase[];
    }

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Subgraph,
    );
    const qb = this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.fileSystemId = :fileSystemId', {fileSystemId});
    applyCandidateFilters(
      qb,
      's',
      filters,
      actions.map(action => action.targetSystemId),
    );
    const baseRows = (await qb.getMany()) as SubgraphBase[];

    return this.overlay
      .applyToCollection(baseRows, actions, {
        matchesEffective: row =>
          row.fileSystemId === fileSystemId &&
          (filters === undefined ||
            matchesEntityFilters(
              row as unknown as Record<string, unknown>,
              filters,
            )),
      })
      .map(result => result.effective);
  }

  // ── Assembled entry points ────────────────────────────────────────────────────

  /**
   * Returns a single fully-assembled OverlaidSubgraph (scalars + properties).
   * Uses applyToSingle directly with getByAggregateAndTable so exact identity
   * and file scope are evaluated on the completed effective row.
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
      const [assembled] = await this.attachProperties([baseRow], sessionId);
      return assembled ?? null;
    }

    const actions = await this.editActionsSvc.getByAggregateAndTable(
      sessionId,
      subgraphSystemId,
      ENTITY_NAMES.Subgraph,
    );
    const result = this.overlay.applyToSingle(baseRow, actions, {
      matchesEffective: row =>
        row.fileSystemId === fileSystemId && row.systemId === subgraphSystemId,
    });
    if (!result) return null;

    const [assembled] = await this.attachProperties(
      [result.effective],
      sessionId,
    );
    return assembled ?? null;
  }

  private async attachProperties(
    rows: SubgraphBase[],
    sessionId: number | null,
  ): Promise<OverlaidSubgraph[]> {
    if (rows.length === 0) return [];

    if (!this.propertyDataFetcher) {
      return rows.map(row => ({...row, properties: []}));
    }

    const allProperties = await this.propertyDataFetcher.fetchMany(
      rows.map(row => row.systemId),
      sessionId,
    );
    const propertiesBySubgraph = new Map<number, SubgraphPropertyDataBase[]>();
    for (const property of allProperties) {
      const properties =
        propertiesBySubgraph.get(property.subgraphSystemId) ?? [];
      properties.push(property);
      propertiesBySubgraph.set(property.subgraphSystemId, properties);
    }

    return rows.map(row => ({
      ...row,
      properties: propertiesBySubgraph.get(row.systemId) ?? [],
    }));
  }

  /**
   * Returns SGKV rows for the given file and optional subgraph IDs with
   * session overlay.
   * Delegates to the injected SubgraphSgkvFetcher.
   */
  async getSgkvs(
    fileSystemId: number,
    sessionId: number | null,
    subgraphSystemIds?: number[],
  ) {
    if (!this.sgkvFetcher) return [];
    return this.sgkvFetcher.fetchMany(
      fileSystemId,
      sessionId,
      subgraphSystemIds,
    );
  }

  /**
   * Returns SGs added or deleted in the current session as a
   * `SessionChanged<SubgraphBase>` split. UPDATE-shaped actions are excluded
   * from both buckets.
   *
   * For CREATE without a base row (session-local creates), the row is
   * synthesized from `edit_action.newValue`. For DELETE, the current base
   * row is returned (soft-delete — the row still exists until commit).
   *
   * Multiple actions per targetSystemId are collapsed to the newest by
   * `createdAt`. The schema's `uniq_edit_actions_current_null_path` unique
   * index makes duplicates impossible in practice, but the timestamp compare
   * is defensive.
   */
  async fetchChangedInSession(
    fileSystemId: number,
    sessionId: number,
  ): Promise<SessionChanged<SubgraphBase>> {
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Subgraph,
    );
    if (actions.length === 0) return {added: [], deleted: []};

    const latestByTarget = new Map<number, (typeof actions)[number]>();
    for (const a of actions) {
      if (
        a.operation !== CHANGE_OPERATION.Create &&
        a.operation !== CHANGE_OPERATION.Delete
      )
        continue;
      const existing = latestByTarget.get(a.targetSystemId);
      if (!existing || a.createdAt.getTime() > existing.createdAt.getTime()) {
        latestByTarget.set(a.targetSystemId, a);
      }
    }
    if (latestByTarget.size === 0) return {added: [], deleted: []};

    const ids = [...latestByTarget.keys()];
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('s.systemId IN (:...ids)', {ids})
      .getMany()) as SubgraphBase[];
    const baseById = new Map(baseRows.map(r => [r.systemId, r]));

    const added: SubgraphBase[] = [];
    const deleted: SubgraphBase[] = [];
    for (const a of latestByTarget.values()) {
      if (a.operation === CHANGE_OPERATION.Create) {
        const base = baseById.get(a.targetSystemId);
        added.push(
          base ?? {
            systemId: a.targetSystemId,
            ...(a.newValue as Omit<SubgraphBase, 'systemId'>),
          },
        );
      } else {
        // DELETE
        const base = baseById.get(a.targetSystemId);
        if (base) deleted.push(base);
      }
    }
    return {added, deleted};
  }
}
