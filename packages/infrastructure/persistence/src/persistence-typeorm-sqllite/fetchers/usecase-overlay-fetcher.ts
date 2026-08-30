/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {UsecaseType} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {UseCaseSchema} from '../entity-schema/usecase-data/use-case.js';
import type {
  UseCaseBase,
  UsecaseGkvValuesBase,
} from '../entity-schema/usecase-data/use-case.js';
import type {UseCaseSubgraphBase} from '../entity-schema/usecase-data/use-case-subgraph.schema.js';
import type {UseCaseSubgraphPairBase} from '../entity-schema/usecase-data/use-case-subgraph-pair.schema.js';
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

/** Subgraph pair entry carried on OverlaidUseCase. */
export type OverlaidUseCasePair = {
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;
};

/**
 * Assembled UseCase after session overlay.
 * `gkvEntries` and `categoryNames` are empty arrays when the fetcher is
 * constructed without the optional `gkvFetcher` / `categoryFetcher`.
 * `subgraphSystemIds` and `subgraphPairs` carry junction data with overlay
 * applied and are always populated.
 */
export interface OverlaidUseCase extends Omit<UseCaseBase, 'type'> {
  type: UsecaseType | null;
  gkvEntries: UsecaseGkvValuesBase[];
  categoryNames: string[];
  subgraphSystemIds: number[];
  subgraphPairs: OverlaidUseCasePair[];
}

export class UsecaseOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly categoryFetcher?: UseCaseCategoryFetcher,
    private readonly gkvFetcher?: UsecaseGkvValuesFetcher,
  ) {}

  // ── Core entry point ─────────────────────────────────────────────────────────

  /**
   * Fetches all UseCase rows for the given file with optional column-level
   * filters, then applies session overlay (CREATE/UPDATE/DELETE).
   * Returns UseCaseBase[] — no GKV entries, category names, or junction data.
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

  // ── Assembled entry points (scalars + GKV + categories + junctions) ──────────

  /**
   * Returns a single fully-assembled OverlaidUseCase including junction data.
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

    const [gkvRows, catRows, sgIdMap, pairMap] = await Promise.all([
      this.gkvFetcher
        ? this.gkvFetcher.fetchMany([usecaseSystemId], sessionId)
        : Promise.resolve([] as UsecaseGkvValuesBase[]),
      this.categoryFetcher
        ? this.categoryFetcher.fetchMany([usecaseSystemId], sessionId)
        : Promise.resolve([] as Array<{usecaseSystemId: number; name: string}>),
      this.getSubgraphIdMap([usecaseSystemId], sessionId),
      this.getSubgraphPairMap([usecaseSystemId], sessionId),
    ]);

    return this.assembleUsecase(
      baseRow,
      gkvRows,
      catRows.map(r => r.name),
      sgIdMap.get(usecaseSystemId) ?? [],
      pairMap.get(usecaseSystemId) ?? [],
    );
  }

  /**
   * Returns all fully-assembled OverlaidUsecases for the given file,
   * including subgraph membership and pair junction data with overlay applied.
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

    const [gkvRows, catRows, sgIdMap, pairMap] = await Promise.all([
      this.gkvFetcher
        ? this.gkvFetcher.fetchMany(ucIds, sessionId)
        : Promise.resolve([] as UsecaseGkvValuesBase[]),
      this.categoryFetcher
        ? this.categoryFetcher.fetchMany(ucIds, sessionId)
        : Promise.resolve([] as Array<{usecaseSystemId: number; name: string}>),
      this.getSubgraphIdMap(ucIds, sessionId),
      this.getSubgraphPairMap(ucIds, sessionId),
    ]);

    const gkvMap = this.groupGkvByUsecase(gkvRows);
    const catMap = this.groupCategoriesByUsecase(catRows);

    return usecases.map(uc =>
      this.assembleUsecase(
        uc,
        gkvMap.get(uc.systemId) ?? [],
        catMap.get(uc.systemId) ?? [],
        sgIdMap.get(uc.systemId) ?? [],
        pairMap.get(uc.systemId) ?? [],
      ),
    );
  }

  /**
   * Returns category names for the given usecases with session overlay.
   * Delegates to the injected UseCaseCategoryFetcher.
   */
  async getCategoryNamesForUsecases(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<Array<{usecaseSystemId: number; name: string}>> {
    if (!this.categoryFetcher) return [];
    return this.categoryFetcher.fetchMany(usecaseSystemIds, sessionId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Returns per-UC subgraph system ID lists with overlay applied.
   */
  private async getSubgraphIdMap(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, number[]>> {
    const result = new Map<number, number[]>();
    if (usecaseSystemIds.length === 0) return result;
    for (const id of usecaseSystemIds) result.set(id, []);

    const rows = await this.getSubgraphMembershipRows(
      usecaseSystemIds,
      sessionId,
    );

    for (const r of rows) {
      result.get(r.usecaseSystemId)?.push(r.subgraphSystemId);
    }

    return result;
  }

  async getSubgraphMembershipRows(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<UseCaseSubgraphBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UseCaseSubgraph)
      .createQueryBuilder('ucs')
      .where('ucs.usecaseSystemId IN (:...ids)', {ids: usecaseSystemIds})
      .getMany()) as UseCaseSubgraphBase[];

    if (sessionId === null) return baseRows;

    const usecaseIdSet = new Set(usecaseSystemIds);
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.UseCaseSubgraph,
    );
    return this.overlay
      .applyToCollection(baseRows, actions, payload =>
        usecaseIdSet.has(payload.usecaseSystemId as number),
      )
      .map(result => result.effective);
  }

  /**
   * Returns per-UC subgraph pair lists with overlay applied.
   */
  private async getSubgraphPairMap(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, OverlaidUseCasePair[]>> {
    const result = new Map<number, OverlaidUseCasePair[]>();
    if (usecaseSystemIds.length === 0) return result;
    for (const id of usecaseSystemIds) result.set(id, []);

    const rows = await this.getSubgraphPairRows(usecaseSystemIds, sessionId);

    for (const r of rows) {
      result.get(r.usecaseSystemId)?.push({
        sourceSubgraphSystemId: r.sourceSubgraphSystemId,
        destSubgraphSystemId: r.destSubgraphSystemId,
      });
    }

    return result;
  }

  async getSubgraphPairRows(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<UseCaseSubgraphPairBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UseCaseSubgraphPair)
      .createQueryBuilder('ucsp')
      .where('ucsp.usecaseSystemId IN (:...ids)', {ids: usecaseSystemIds})
      .getMany()) as UseCaseSubgraphPairBase[];

    if (sessionId === null) return baseRows;

    const usecaseIdSet = new Set(usecaseSystemIds);
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.UseCaseSubgraphPair,
    );
    return this.overlay
      .applyToCollection(baseRows, actions, payload =>
        usecaseIdSet.has(payload.usecaseSystemId as number),
      )
      .map(result => result.effective);
  }

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
    subgraphSystemIds: number[],
    subgraphPairs: OverlaidUseCasePair[],
  ): OverlaidUseCase {
    return {
      ...uc,
      type: uc.type ?? null,
      gkvEntries,
      categoryNames,
      subgraphSystemIds,
      subgraphPairs,
    };
  }

  /**
   * Returns fully-assembled OverlaidUsecases that have at least one active
   * MANUAL edit_action in the current session.
   */
  async fetchWithActiveManualEdits(
    fileSystemId: number,
    sessionId: number,
  ): Promise<OverlaidUseCase[]> {
    const idRows = await this.manager
      .createQueryBuilder()
      .select('uc.system_id', 'systemId')
      .distinct(true)
      .from(UseCaseSchema, 'uc')
      .innerJoin(
        'edit_actions',
        'ea',
        `ea.target_system_id = uc.system_id
         AND ea.target_table = :targetTable
         AND ea.source = :source
         AND ea.valid_until IS NULL`,
        {targetTable: ENTITY_NAMES.UseCase, source: 'MANUAL'},
      )
      .innerJoin(
        'project_sessions',
        'ps',
        'ps.session_id = ea.session_id AND ps.file_system_id = uc.file_system_id',
      )
      .where('uc.file_system_id = :fileSystemId', {fileSystemId})
      .getRawMany<{systemId: number}>();

    if (idRows.length === 0) return [];
    return this.getUsecases(
      fileSystemId,
      sessionId,
      idRows.map(r => r.systemId),
    );
  }
}
