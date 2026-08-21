/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  UseCaseQueryService,
  UseCaseReadModel,
  UsecaseChangeDetails,
  UsecaseChangeSnapshot,
  ComponentsReadModel,
  FilterExpression,
  KeyValueDefQueryService,
  ISessionRepository,
  SpfModuleQueryService,
  KeyValuePairReadModel,
  UsecaseChangeDescriptor,
} from '@arc/core';
import {
  CHANGE_OPERATION,
  Result,
  IssueFactory,
  RESULT_KIND,
  USECASE_TYPE,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {USECASE_PARAM_FILTER} from './usecase-param-filter.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';
import {
  type OverlaidUseCase,
  UsecaseOverlayFetcher,
} from '../../fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

/**
 * Database implementation of UseCaseQueryService.
 *
 * getAllUseCases — overlay via UsecaseOverlayFetcher (FR-3); GKV key-value
 *   pairs resolved via KeyValueDefQueryService (FR-4).
 *
 * getAllComponentsForUseCases (deprecated) — previously violated FR-3/FR-4 by
 *   loading modules, data links, and control links via direct queries with
 *   inline overlay. Now:
 *   - Modules: SpfModuleQueryService.findByUsecaseIds() (FR-4 — complex read
 *     model, query service is the right boundary)
 *   - Data/control links: LinkOverlayFetcher directly (FR-4 — raw fields are
 *     available from the fetcher; mapped via UseCaseQueryMappers)
 *   fileSystemId is resolved from the use_cases table since the deprecated
 *   signature omits it.
 */
export class DbUseCaseQueryService implements UseCaseQueryService {
  private readonly usecaseFetcher: UsecaseOverlayFetcher;
  private readonly linkFetcher: LinkOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    private readonly keyValueDefQuerySvc: KeyValueDefQueryService,
    private readonly spfModuleQuerySvc: SpfModuleQueryService,
    private readonly sessionRepo: ISessionRepository,
    _editActionsQuerySvc: EditActionsQueryService,
    usecaseFetcher: UsecaseOverlayFetcher,
    linkFetcher: LinkOverlayFetcher,
  ) {
    this.usecaseFetcher = usecaseFetcher;
    this.linkFetcher = linkFetcher;
  }

  // ── getAllUseCases ────────────────────────────────────────────────────────────

  async getAllUseCases(
    fileSystemId: number,
    filter?: FilterExpression,
  ): Promise<Result<UseCaseReadModel[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      // If a filter is provided, run a lightweight SQL query to get matching IDs.
      // The filter uses EXISTS subqueries over SpfModule/Subgraph — cross-aggregate
      // concerns that stay in the query service.
      let restrictToIds: number[] | undefined;
      if (filter) {
        const qb = this.dataSource
          .getRepository(ENTITY_NAMES.UseCase)
          .createQueryBuilder('uc')
          .select('uc.systemId')
          .where('uc.fileSystemId = :fileSystemId', {fileSystemId});
        USECASE_PARAM_FILTER.apply(qb, filter, 'uc');
        const filtered = (await qb.getMany()) as Array<{systemId: number}>;
        restrictToIds = filtered.map(r => r.systemId);
        if (restrictToIds.length === 0) return Result.ok([]);
      }

      // Fetcher handles UseCase scalars + GKV entry overlay + category assignments (FR-3).
      const overlaidUsecases = await this.usecaseFetcher.getUsecases(
        fileSystemId,
        sessionId,
        restrictToIds,
      );

      const pairsMap = await this.getGkvPairMap(overlaidUsecases, fileSystemId);

      const readModels: UseCaseReadModel[] = overlaidUsecases.map(uc => {
        const gkv = uc.gkvEntries
          .map(e => pairsMap.get(e.valueDefSystemId))
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map(pair => ({
            key: {
              systemId: pair.key.systemId,
              naturalId: pair.key.naturalId,
              name: pair.key.name,
            },
            value: {
              systemId: pair.value.systemId,
              naturalId: pair.value.naturalId,
              name: pair.value.name,
            },
          }));

        return {
          systemId: uc.systemId,
          gkv,
          alias: uc.alias,
          aliasId: uc.aliasId,
          categories: uc.categoryNames,
          type: uc.type,
        };
      });

      return Result.ok(readModels);
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error ? error.message : 'Failed to query usecases',
        ),
      );
    }
  }

  async getChangeDetails(
    fileId: number,
    emittedChanges: readonly UsecaseChangeDescriptor[],
  ): Promise<Result<UsecaseChangeDetails[]>> {
    try {
      if (emittedChanges.length === 0) return Result.ok([]);

      const usecaseIds = emittedChanges.map(change => change.systemId);
      if (new Set(usecaseIds).size !== usecaseIds.length) {
        throw new Error('Duplicate emitted UseCase system IDs');
      }

      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileId);
      const sessionId = session?.sessionId ?? null;

      const [
        beforeUsecases,
        afterUsecases,
        beforeDataLinks,
        afterDataLinks,
        beforeControlLinks,
        afterControlLinks,
      ] = await Promise.all([
        this.usecaseFetcher.getUsecases(fileId, null, usecaseIds),
        this.usecaseFetcher.getUsecases(fileId, sessionId, usecaseIds),
        this.linkFetcher.loadDataLinkRows(fileId, null),
        this.linkFetcher.loadDataLinkRows(fileId, sessionId),
        this.linkFetcher.loadControlLinkRows(fileId, null),
        this.linkFetcher.loadControlLinkRows(fileId, sessionId),
      ]);
      const gkvPairs = await this.getGkvPairMap(
        [...beforeUsecases, ...afterUsecases],
        fileId,
      );
      const beforeSnapshots = this.getChangeSnapshotMap(
        beforeUsecases,
        beforeDataLinks,
        beforeControlLinks,
        gkvPairs,
      );
      const afterSnapshots = this.getChangeSnapshotMap(
        afterUsecases,
        afterDataLinks,
        afterControlLinks,
        gkvPairs,
      );

      const details = emittedChanges.map(change => {
        const before = beforeSnapshots.get(change.systemId) ?? null;
        const after = afterSnapshots.get(change.systemId) ?? null;
        this.assertSnapshotBoundary(change, before, after);
        return {...change, before, after};
      });
      return Result.ok(details);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to query usecase change details';
      const issue = isTransientReadError(error)
        ? IssueFactory.transientDbReadError(message)
        : IssueFactory.dbError(message);
      return Result.fail(issue);
    }
  }

  // ── getAllComponentsForUseCases (deprecated) ──────────────────────────────────

  /**
   * @deprecated Use the individual query services with a fileSystemId scope instead.
   *
   * Previously violated FR-3/FR-4 by loading modules, data links, and control
   * links via direct queries with inline OverlayMergeImpl. Now:
   *   - Modules: delegated to SpfModuleQueryService.findByUsecaseIds() (FR-4 —
   *     the module read model is assembled from many fetchers; the query service
   *     is the correct boundary)
   *   - Links: LinkOverlayFetcher.loadBaseDataLinkRows/loadBaseControlLinkRows
   *     called directly (FR-4 — fetcher returns the raw fields needed; mapped via
   *     UseCaseQueryMappers)
   *
   * fileSystemId is resolved from the use_cases table since the deprecated
   * signature omits it.
   */
  async getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ComponentsReadModel> {
    if (useCaseSystemIds.length === 0) {
      return {modules: [], dataLinks: [], controlLinks: []};
    }

    // Resolve fileSystemId — required by the module query service and link fetcher.
    // The deprecated signature omits fileSystemId, so we look it up once.
    const fileSystemId =
      await this.resolveFileSystemIdForUsecases(useCaseSystemIds);
    if (fileSystemId === null) {
      return {modules: [], dataLinks: [], controlLinks: []};
    }

    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );

    // Resolve subgraph IDs once — used by both link types (FR-3: via usecaseFetcher).
    const usecases = await this.usecaseFetcher.getUsecases(
      fileSystemId,
      sessionId,
      useCaseSystemIds,
    );
    const subgraphIds = [
      ...new Set(usecases.flatMap(uc => uc.subgraphSystemIds)),
    ];
    const linkFilter =
      subgraphIds.length > 0
        ? {
            $or: [
              {sourceSubgraphSystemId: subgraphIds},
              {destSubgraphSystemId: subgraphIds},
            ],
          }
        : undefined;

    // Modules: query service (FR-4). Links: fetcher with $or subgraph filter (FR-4).
    const [modulesResult, dataLinks, controlLinks] = await Promise.all([
      this.spfModuleQuerySvc.findByUsecaseIds(useCaseSystemIds, fileSystemId),
      linkFilter
        ? this.linkFetcher
            .loadDataLinkRows(fileSystemId, sessionId, linkFilter)
            .then(links =>
              links.map(dl =>
                UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
              ),
            )
        : Promise.resolve([]),
      linkFilter
        ? this.linkFetcher
            .loadControlLinkRows(fileSystemId, sessionId, linkFilter)
            .then(links =>
              links.map(cl =>
                UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
              ),
            )
        : Promise.resolve([]),
    ]);

    return {
      modules:
        modulesResult.kind !== RESULT_KIND.Fail ? modulesResult.data : [],
      dataLinks,
      controlLinks,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Looks up fileSystemId from any of the given usecase system IDs.
   * Required by getAllComponentsForUseCases whose deprecated signature omits it.
   * Returns null when no matching usecase is found.
   */
  private async resolveFileSystemIdForUsecases(
    usecaseSystemIds: number[],
  ): Promise<number | null> {
    const row = (await this.dataSource
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .select('uc.fileSystemId')
      .where('uc.systemId IN (:...ids)', {ids: usecaseSystemIds})
      .limit(1)
      .getOne()) as {fileSystemId: number} | null;
    return row?.fileSystemId ?? null;
  }

  private getChangeSnapshotMap(
    usecases: readonly OverlaidUseCase[],
    dataLinks: Awaited<ReturnType<LinkOverlayFetcher['loadDataLinkRows']>>,
    controlLinks: Awaited<
      ReturnType<LinkOverlayFetcher['loadControlLinkRows']>
    >,
    gkvPairs: ReadonlyMap<number, KeyValuePairReadModel>,
  ): Map<number, UsecaseChangeSnapshot> {
    return new Map(
      usecases.map(usecase => [
        usecase.systemId,
        {
          isEc: usecase.type === USECASE_TYPE.Ec,
          gkv: this.toGkvReadModel(usecase, gkvPairs),
          alias: usecase.alias,
          aliasId: usecase.aliasId,
          categories: usecase.categoryNames,
          subgraphSystemIds: usecase.subgraphSystemIds,
          dataLinks: this.getSupportingDataLinks(usecase, dataLinks),
          controlLinks: this.getSupportingControlLinks(usecase, controlLinks),
        },
      ]),
    );
  }

  private getSupportingDataLinks(
    usecase: OverlaidUseCase,
    rows: Awaited<ReturnType<LinkOverlayFetcher['loadDataLinkRows']>>,
  ) {
    const matches = rows.filter(row =>
      usecase.subgraphPairs.some(
        pair =>
          pair.sourceSubgraphSystemId === row.sourceSubgraphSystemId &&
          pair.destSubgraphSystemId === row.destSubgraphSystemId,
      ),
    );
    return [...new Map(matches.map(row => [row.systemId, row])).values()]
      .sort((a, b) => a.systemId - b.systemId)
      .map(row => UseCaseQueryMappers.mapToComponentDataLinkReadModel(row));
  }

  private getSupportingControlLinks(
    usecase: OverlaidUseCase,
    rows: Awaited<ReturnType<LinkOverlayFetcher['loadControlLinkRows']>>,
  ) {
    const matches = rows.filter(row =>
      usecase.subgraphPairs.some(
        pair =>
          (pair.sourceSubgraphSystemId === row.sourceSubgraphSystemId &&
            pair.destSubgraphSystemId === row.destSubgraphSystemId) ||
          (pair.sourceSubgraphSystemId === row.destSubgraphSystemId &&
            pair.destSubgraphSystemId === row.sourceSubgraphSystemId),
      ),
    );
    return [...new Map(matches.map(row => [row.systemId, row])).values()]
      .sort((a, b) => a.systemId - b.systemId)
      .map(row => UseCaseQueryMappers.mapToComponentControlLinkReadModel(row));
  }

  private assertSnapshotBoundary(
    change: UsecaseChangeDescriptor,
    before: UsecaseChangeSnapshot | null,
    after: UsecaseChangeSnapshot | null,
  ): void {
    const valid =
      (change.operation === CHANGE_OPERATION.Create &&
        before === null &&
        after !== null) ||
      (change.operation === CHANGE_OPERATION.Update &&
        before !== null &&
        after !== null) ||
      (change.operation === CHANGE_OPERATION.Delete &&
        before !== null &&
        after === null);
    if (!valid) {
      throw new Error(
        `Inconsistent ${change.operation} snapshot boundary for UseCase ${change.systemId}`,
      );
    }
  }

  private async getGkvPairMap(
    usecases: readonly OverlaidUseCase[],
    fileId: number,
  ): Promise<Map<number, KeyValuePairReadModel>> {
    const valueDefSystemIds = [
      ...new Set(
        usecases.flatMap(usecase =>
          usecase.gkvEntries.map(entry => entry.valueDefSystemId),
        ),
      ),
    ];
    const pairsResult =
      await this.keyValueDefQuerySvc.getKeyValueSummaryForGivenValues(
        valueDefSystemIds,
        fileId,
      );
    if (pairsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        pairsResult.issues.map(issue => issue.message).join('; ') ||
          'Failed to resolve UseCase GKV values',
      );
    }

    return new Map(pairsResult.data.map(pair => [pair.value.systemId, pair]));
  }

  private toGkvReadModel(
    usecase: OverlaidUseCase,
    pairsByValueId: ReadonlyMap<number, KeyValuePairReadModel>,
  ): KeyValuePairReadModel[] {
    return usecase.gkvEntries
      .map(entry => pairsByValueId.get(entry.valueDefSystemId))
      .filter((pair): pair is NonNullable<typeof pair> => pair !== undefined)
      .map(pair => ({
        key: {
          systemId: pair.key.systemId,
          naturalId: pair.key.naturalId,
          name: pair.key.name,
        },
        value: {
          systemId: pair.value.systemId,
          naturalId: pair.value.naturalId,
          name: pair.value.name,
        },
      }));
  }

  async findUsecaseIdsBySubgraphIds(
    subgraphIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, number[]>> {
    if (subgraphIds.length === 0) return new Map();

    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.UseCaseSubgraph)
      .createQueryBuilder('ucs')
      .innerJoin('ucs.subgraph', 'subgraph')
      .select(['ucs.usecaseSystemId', 'ucs.subgraphSystemId'])
      .where('ucs.subgraphSystemId IN (:...ids)', {ids: subgraphIds})
      .andWhere('subgraph.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as {usecaseSystemId: number; subgraphSystemId: number}[];

    const result = new Map<number, number[]>();
    for (const row of rows) {
      const existing = result.get(row.subgraphSystemId);
      if (existing) {
        existing.push(row.usecaseSystemId);
      } else {
        result.set(row.subgraphSystemId, [row.usecaseSystemId]);
      }
    }
    return result;
  }
}

function isTransientReadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: string;
    driverError?: {code?: string};
  };
  const codes = [candidate.code, candidate.driverError?.code];
  return codes.some(
    code =>
      code === 'SQLITE_BUSY' ||
      code === 'SQLITE_LOCKED' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET',
  );
}
