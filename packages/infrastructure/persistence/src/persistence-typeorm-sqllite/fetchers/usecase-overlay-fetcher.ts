/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {UsecaseType} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';
import {CHANGE_OPERATION, SOURCE} from '@arc/core';
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
  naturalId?: number | number[];
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
    const actions =
      sessionId === null
        ? []
        : await this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.UseCase);
    return this.fetchManyWithActions(fileSystemId, filters, actions);
  }

  private async fetchManyWithActions(
    fileSystemId: number,
    filters: UseCaseFilters | undefined,
    actions: readonly EditActionRow[],
  ): Promise<UseCaseBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId});
    if (actions.length === 0 && filters) applyEntityFilters(qb, 'uc', filters);
    const baseRows = (await qb.getMany()) as UseCaseBase[];

    const effectiveRows = this.overlay
      .applyToCollection(baseRows, [...actions])
      .map(r => r.effective);

    return filters
      ? effectiveRows.filter(row =>
          matchesEntityFilters(
            row as unknown as Record<string, unknown>,
            filters,
          ),
        )
      : effectiveRows;
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

  async getUsecasesFromActions(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
    actions: readonly EditActionRow[],
  ): Promise<OverlaidUseCase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const usecaseIdSet = new Set(usecaseSystemIds);
    const actionsFor = (table: (typeof ENTITY_NAMES)[keyof typeof ENTITY_NAMES]) =>
      actions.filter(action => action.targetTable === table);
    const usecases = await this.fetchManyWithActions(
      fileSystemId,
      {systemId: [...usecaseSystemIds]},
      actionsFor(ENTITY_NAMES.UseCase),
    );
    if (usecases.length === 0) return [];

    const ucIds = usecases.map(usecase => usecase.systemId);
    const [gkvRows, catRows, sgIdMap, pairMap] = await Promise.all([
      this.gkvFetcher
        ? this.gkvFetcher.fetchManyWithActions(
            ucIds,
            actionsFor(ENTITY_NAMES.UsecaseGkvValues),
          )
        : Promise.resolve([] as UsecaseGkvValuesBase[]),
      this.categoryFetcher
        ? this.categoryFetcher.fetchManyWithActions(
            ucIds,
            actionsFor(ENTITY_NAMES.UseCaseCategory),
          )
        : Promise.resolve([] as Array<{usecaseSystemId: number; name: string}>),
      this.getSubgraphIdMap(
        ucIds,
        null,
        actionsFor(ENTITY_NAMES.UseCaseSubgraph),
      ),
      this.getSubgraphPairMap(
        ucIds,
        null,
        actionsFor(ENTITY_NAMES.UseCaseSubgraphPair),
      ),
    ]);
    const gkvMap = this.groupGkvByUsecase(gkvRows);
    const categoryMap = this.groupCategoriesByUsecase(catRows);

    return usecases
      .filter(usecase => usecaseIdSet.has(usecase.systemId))
      .map(usecase =>
        this.assembleUsecase(
          usecase,
          gkvMap.get(usecase.systemId) ?? [],
          categoryMap.get(usecase.systemId) ?? [],
          sgIdMap.get(usecase.systemId) ?? [],
          pairMap.get(usecase.systemId) ?? [],
        ),
      );
  }

  /**
   * Returns the active MANUAL UseCase actions for the current session. The
   * repository maps these persistence rows to its domain-facing result while
   * this fetcher owns the edit-action query boundary.
   */
  async getActiveManualUsecaseActions(
    sessionId: number,
  ): Promise<EditActionRow[]> {
    return this.editActionsSvc.query({
      sessionId,
      targetTable: ENTITY_NAMES.UseCase,
      source: SOURCE.Manual,
      operations: [CHANGE_OPERATION.Create, CHANGE_OPERATION.Update],
    });
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

  /** Returns distinct subgraph IDs associated with the given usecases. */
  async getSubgraphSystemIdsForUsecases(
    usecaseSystemIds: number[],
    sessionId: number | null,
  ): Promise<number[]> {
    if (usecaseSystemIds.length === 0) return [];

    const rows = await this.getSubgraphMembershipRows(
      usecaseSystemIds,
      sessionId,
    );
    return [...new Set(rows.map(row => row.subgraphSystemId))];
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Returns per-UC subgraph system ID lists with overlay applied.
   */
  private async getSubgraphIdMap(
    usecaseSystemIds: number[],
    sessionId: number | null,
    actions?: readonly EditActionRow[],
  ): Promise<Map<number, number[]>> {
    const result = new Map<number, number[]>();
    if (usecaseSystemIds.length === 0) return result;
    for (const id of usecaseSystemIds) result.set(id, []);

    const rows = await this.getSubgraphMembershipRows(
      usecaseSystemIds,
      sessionId,
      actions,
    );

    for (const r of rows) {
      result.get(r.usecaseSystemId)?.push(r.subgraphSystemId);
    }

    return result;
  }

  async getSubgraphMembershipRows(
    usecaseSystemIds: number[],
    sessionId: number | null,
    actions?: readonly EditActionRow[],
  ): Promise<UseCaseSubgraphBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UseCaseSubgraph)
      .createQueryBuilder('ucs')
      .where('ucs.usecaseSystemId IN (:...ids)', {ids: usecaseSystemIds})
      .getMany()) as UseCaseSubgraphBase[];

    const usecaseIdSet = new Set(usecaseSystemIds);
    const relevantActions =
      actions ??
      (sessionId === null
        ? []
        : await this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.UseCaseSubgraph,
          ));
    if (relevantActions.length === 0) return baseRows;
    return this.overlay
      .applyToCollection(baseRows, [...relevantActions], payload =>
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
    actions?: readonly EditActionRow[],
  ): Promise<Map<number, OverlaidUseCasePair[]>> {
    const result = new Map<number, OverlaidUseCasePair[]>();
    if (usecaseSystemIds.length === 0) return result;
    for (const id of usecaseSystemIds) result.set(id, []);

    const rows = await this.getSubgraphPairRows(
      usecaseSystemIds,
      sessionId,
      actions,
    );

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
    actions?: readonly EditActionRow[],
  ): Promise<UseCaseSubgraphPairBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UseCaseSubgraphPair)
      .createQueryBuilder('ucsp')
      .where('ucsp.usecaseSystemId IN (:...ids)', {ids: usecaseSystemIds})
      .getMany()) as UseCaseSubgraphPairBase[];

    const usecaseIdSet = new Set(usecaseSystemIds);
    const relevantActions =
      actions ??
      (sessionId === null
        ? []
        : await this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.UseCaseSubgraphPair,
          ));
    if (relevantActions.length === 0) return baseRows;
    return this.overlay
      .applyToCollection(baseRows, [...relevantActions], payload =>
        usecaseIdSet.has(payload.usecaseSystemId as number),
      )
      .map(result => result.effective);
  }

  /**
   * Returns effective membership rows that reference one subgraph. The
   * baseline query is scoped through UseCase.fileSystemId; relation tables do
   * not carry file scope themselves.
   */
  async getSubgraphMembershipRowsForSubgraph(
    fileSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<UseCaseSubgraphBase[]> {
    const usecases = await this.fetchMany(fileSystemId, sessionId);
    const usecaseIds = usecases.map(uc => uc.systemId);
    if (usecaseIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UseCaseSubgraph)
      .createQueryBuilder('ucs')
      .innerJoin(
        ENTITY_NAMES.UseCase,
        'uc',
        'uc.systemId = ucs.usecaseSystemId AND uc.fileSystemId = :fileSystemId',
        {fileSystemId},
      )
      .where('ucs.usecaseSystemId IN (:...usecaseIds)', {usecaseIds})
      .getMany()) as UseCaseSubgraphBase[];

    const rows =
      sessionId === null
        ? baseRows
        : this.overlay
            .applyToCollection(
              baseRows,
              await this.editActionsSvc.getByTable(
                sessionId,
                ENTITY_NAMES.UseCaseSubgraph,
              ),
              payload => usecaseIds.includes(payload.usecaseSystemId as number),
            )
            .map(result => result.effective);

    return rows.filter(row => row.subgraphSystemId === subgraphSystemId);
  }

  /**
   * Returns effective pair rows that reference one subgraph on either side.
   * The two endpoint cases are handled by one batched reverse query.
   */
  async getSubgraphPairRowsForSubgraph(
    fileSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<UseCaseSubgraphPairBase[]> {
    const usecases = await this.fetchMany(fileSystemId, sessionId);
    const usecaseIds = usecases.map(uc => uc.systemId);
    if (usecaseIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.UseCaseSubgraphPair)
      .createQueryBuilder('ucsp')
      .innerJoin(
        ENTITY_NAMES.UseCase,
        'uc',
        'uc.systemId = ucsp.usecaseSystemId AND uc.fileSystemId = :fileSystemId',
        {fileSystemId},
      )
      .where('ucsp.usecaseSystemId IN (:...usecaseIds)', {usecaseIds})
      .getMany()) as UseCaseSubgraphPairBase[];

    const rows =
      sessionId === null
        ? baseRows
        : this.overlay
            .applyToCollection(
              baseRows,
              await this.editActionsSvc.getByTable(
                sessionId,
                ENTITY_NAMES.UseCaseSubgraphPair,
              ),
              payload => usecaseIds.includes(payload.usecaseSystemId as number),
            )
            .map(result => result.effective);

    return rows.filter(
      row =>
        row.sourceSubgraphSystemId === subgraphSystemId ||
        row.destSubgraphSystemId === subgraphSystemId,
    );
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

}
