/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import type {UsecaseType} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  UseCaseBase,
  UsecaseGkvValuesBase,
} from '../entity-schema/usecase-data/use-case.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';
import type {UseCaseCategoryFetcher} from './usecase-category-fetcher.js';
import type {UsecaseGkvValuesFetcher} from './usecase-gkv-values-fetcher.js';

/**
 * Optional column-level filters for UseCase queries.
 * Fields map directly to UseCaseBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type UseCaseFilters = {
  systemId?: number | number[];
  aliasId?: number | number[];
  alias?: string | string[];
  type?: string | string[];
  $or?: UseCaseFilters[];
};

export interface OverlaidUseCase extends Omit<UseCaseBase, 'type'> {
  type: UsecaseType | null;
  gkvEntries: UsecaseGkvValuesBase[];
  categoryNames: string[];
}

export class UsecaseOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly categoryFetcher: UseCaseCategoryFetcher,
    private readonly gkvFetcher: UsecaseGkvValuesFetcher,
  ) {}

  // ── Core entry point ─────────────────────────────────────────────────────────

  /**
   * Fetches all UseCase rows for the given file with optional column-level
   * filters, then applies session overlay (CREATE/UPDATE/DELETE).
   * Returns UseCaseBase[] — no GKV entries or category names.
   */
  async fetchMany(
    fileSystemId: number,
    sessionId: number | null,
    filters?: UseCaseFilters,
  ): Promise<UseCaseBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId});
    if (filters) applyEntityFilters(qb, 'uc', filters);
    const baseRows = (await qb.getMany()) as UseCaseBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.UseCase,
    );

    return this.overlay
      .applyToCollection(
        baseRows,
        actions,
        filters ? nv => matchesEntityFilters(nv, filters) : undefined,
      )
      .map(r => r.effective);
  }

  // ── Assembled entry points (scalars + GKV + categories) ──────────────────────

  /**
   * Returns a single fully-assembled OverlaidUseCase.
   * Uses fetchMany for scalars; delegates GKV and category loading
   * (with overlay) to the injected fetchers.
   */
  async fetchOne(
    usecaseSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    filters?: UseCaseFilters,
  ): Promise<OverlaidUseCase | null> {
    const usecases = await this.fetchMany(fileSystemId, sessionId, {
      systemId: usecaseSystemId,
      ...filters,
    });
    if (usecases.length === 0) return null;
    const baseRow = usecases[0];

    // Load GKV and categories — fetchers handle session overlay internally.
    const [gkvRows, catRows] = await Promise.all([
      this.gkvFetcher.fetchMany([usecaseSystemId], sessionId),
      this.categoryFetcher.fetchMany([usecaseSystemId], sessionId),
    ]);

    return this.assembleUsecase(
      baseRow,
      gkvRows,
      catRows.map(r => r.name),
    );
  }

  /**
   * Returns all fully-assembled OverlaidUsecases for the given file.
   * Delegates row loading and overlay to fetchMany, GKV and category
   * loading (with overlay) to the injected fetchers.
   */
  async getUsecases(
    fileSystemId: number,
    sessionId: number | null,
    restrictToIds?: number[],
    filters?: UseCaseFilters,
  ): Promise<OverlaidUseCase[]> {
    const combinedFilters: UseCaseFilters | undefined =
      restrictToIds && restrictToIds.length > 0
        ? {...filters, systemId: restrictToIds}
        : filters;

    const usecases = await this.fetchMany(
      fileSystemId,
      sessionId,
      combinedFilters,
    );

    if (usecases.length === 0) return [];

    const ucIds = usecases.map(r => r.systemId);

    // Load GKV and categories in parallel — fetchers handle session overlay.
    const [gkvRows, catRows] = await Promise.all([
      this.gkvFetcher.fetchMany(ucIds, sessionId),
      this.categoryFetcher.fetchMany(ucIds, sessionId),
    ]);

    const gkvMap = this.groupGkvByUsecase(gkvRows);
    const catMap = this.groupCategoriesByUsecase(catRows);

    return usecases.map(uc =>
      this.assembleUsecase(
        uc,
        gkvMap.get(uc.systemId) ?? [],
        catMap.get(uc.systemId) ?? [],
      ),
    );
  }

  // ── Many-to-many traversal ────────────────────────────────────────────────────

  /**
   * Returns the system IDs of all subgraphs that belong to the given usecases,
   * with session overlay applied.
   *
   * Baseline: UseCase → Subgraph many-to-many via use_case_subgraphs join table.
   * Overlay: CREATE adds a subgraph assignment; DELETE removes one.
   *
   * @param usecaseSystemIds  Usecases whose subgraph IDs are requested.
   * @param sessionId         Active session; null returns baseline only.
   */
  async getSubgraphSystemIdsForUsecases(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<number[]> {
    if (usecaseSystemIds.length === 0) return [];

    const rows = await this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .select('s.systemId', 'subgraphSystemId')
      .innerJoin('uc.subgraphs', 's')
      .where('uc.systemId IN (:...ids)', {ids: usecaseSystemIds})
      .getRawMany<{subgraphSystemId: number}>();

    const baseSubgraphIds = new Set(rows.map(r => r.subgraphSystemId));

    if (sessionId === null) return [...baseSubgraphIds];

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.UseCaseSubgraph,
    );
    if (actions.length === 0) return [...baseSubgraphIds];

    const usecaseIdSet = new Set(usecaseSystemIds);
    for (const action of actions) {
      const p = action.newValue as {
        subgraphSystemId?: number;
        usecaseSystemId?: number;
      };
      if (
        !p.subgraphSystemId ||
        !p.usecaseSystemId ||
        !usecaseIdSet.has(p.usecaseSystemId)
      )
        continue;
      if (action.operation === CHANGE_OPERATION.Create)
        baseSubgraphIds.add(p.subgraphSystemId);
      else if (action.operation === CHANGE_OPERATION.Delete)
        baseSubgraphIds.delete(p.subgraphSystemId);
    }

    return [...baseSubgraphIds];
  }

  /**
   * Returns category names for the given usecases with session overlay.
   * Delegates to the injected UseCaseCategoryFetcher.
   */
  async getCategoryNamesForUsecases(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<Array<{usecaseSystemId: number; name: string}>> {
    return this.categoryFetcher.fetchMany(usecaseSystemIds, sessionId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private groupGkvByUsecase(
    rows: UsecaseGkvValuesBase[],
  ): Map<number, UsecaseGkvValuesBase[]> {
    const map = new Map<number, UsecaseGkvValuesBase[]>();
    for (const row of rows) {
      const list = map.get(row.usecaseSystemId) ?? [];
      list.push(row);
      map.set(row.usecaseSystemId, list);
    }
    return map;
  }

  private groupCategoriesByUsecase(
    rows: Array<{usecaseSystemId: number; name: string}>,
  ): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const row of rows) {
      const list = map.get(row.usecaseSystemId) ?? [];
      list.push(row.name);
      map.set(row.usecaseSystemId, list);
    }
    return map;
  }

  private assembleUsecase(
    uc: UseCaseBase,
    gkvEntries: UsecaseGkvValuesBase[],
    categoryNames: string[],
  ): OverlaidUseCase {
    return {
      ...uc,
      type: uc.type ?? null,
      gkvEntries,
      categoryNames,
    };
  }
}
