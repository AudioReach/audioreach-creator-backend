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
  SpfModuleReadModel,
  UsecaseFilteredGkvData,
  SubsystemFilteredModule,
  SubsystemReadModel,
  KeyValuePairReadModel,
} from '@arc/core';
import {CHANGE_OPERATION, Result, IssueFactory, RESULT_KIND} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {USECASE_PARAM_FILTER} from './usecase-param-filter.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';
import {
  type OverlaidUseCase,
  UsecaseOverlayFetcher,
} from '../../fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import type {OverlaidSubsystem} from '../../fetchers/subsystem-overlay-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import type {SubgraphBase} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

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
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly subgraphFetcher: SubgraphOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    private readonly keyValueDefQuerySvc: KeyValueDefQueryService,
    private readonly spfModuleQuerySvc: SpfModuleQueryService,
    private readonly sessionRepo: ISessionRepository,
    private readonly editActionsQuerySvc: EditActionsQueryService,
    usecaseFetcher: UsecaseOverlayFetcher,
    linkFetcher: LinkOverlayFetcher,
    subsystemFetcher: SubsystemOverlayFetcher,
    subgraphFetcher: SubgraphOverlayFetcher,
  ) {
    this.usecaseFetcher = usecaseFetcher;
    this.linkFetcher = linkFetcher;
    this.subsystemFetcher = subsystemFetcher;
    this.subgraphFetcher = subgraphFetcher;
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

  /**
   * Loads the effective read-side data required by the core
   * subsystem-filtered GKV algorithm.
   *
   * Usecase and subsystem overlays are fetched directly. SPF modules are
   * loaded through the module query service because it assembles module,
   * node, subgraph, and container data. Subgraphs provide the mapping from
   * subgraph system IDs to their natural IDs for filter evaluation.
   */
  async getUsecaseFilteredGkvData(
    fileId: number,
  ): Promise<Result<UsecaseFilteredGkvData>> {
    const usecasesResult = await this.getAllUseCases(fileId);
    if (usecasesResult.kind === RESULT_KIND.Fail) return usecasesResult;

    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileId);
      const sessionId = session?.sessionId ?? null;
      const usecases = usecasesResult.data;

      if (usecases.length === 0) {
        const data: UsecaseFilteredGkvData = {
          usecases: [],
          subgraphSystemIdsByUsecase: new Map(),
          subgraphNaturalIdsBySystemId: new Map(),
          subsystems: [],
          modules: [],
        };
        return usecasesResult.kind === RESULT_KIND.Partial
          ? Result.partial(data, usecasesResult.issues)
          : Result.ok(data);
      }

      const usecaseSystemIds = usecases.map(usecase => usecase.systemId);
      const [effectiveUsecases, subsystems, modulesResult, subgraphs] =
        await Promise.all([
          this.usecaseFetcher.getUsecases(fileId, sessionId, usecaseSystemIds),
          this.subsystemFetcher.fetchAll(fileId, sessionId),
          this.spfModuleQuerySvc.findByUsecaseIds(usecaseSystemIds, fileId),
          this.subgraphFetcher.fetchMany(fileId, sessionId),
        ]);

      if (modulesResult.kind === RESULT_KIND.Fail) {
        return Result.fail(...modulesResult.issues);
      }

      const data = this.mapSubsystemFilteredGkvData(
        usecases,
        effectiveUsecases,
        subsystems,
        modulesResult.data,
        subgraphs,
      );
      const issues = [
        ...(usecasesResult.kind === RESULT_KIND.Partial
          ? usecasesResult.issues
          : []),
        ...(modulesResult.kind === RESULT_KIND.Partial
          ? modulesResult.issues
          : []),
      ];

      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load subsystem-filtered GKV data',
        ),
      );
    }
  }

  async getChangeDetails(
    fileId: number,
    groupId: string,
  ): Promise<Result<UsecaseChangeDetails[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileId);
      if (session === null) return Result.ok([]);

      const groupActions = await this.editActionsQuerySvc.getHistoryByGroupId(
        session.sessionId,
        groupId,
      );
      const usecaseGroupActions = groupActions.filter(action =>
        this.isUsecaseAction(action),
      );
      if (usecaseGroupActions.length === 0) return Result.ok([]);

      const usecaseIds = [
        ...new Set(usecaseGroupActions.map(action => action.aggregateId)),
      ];
      const historyRows =
        await this.editActionsQuerySvc.getHistoryByAggregateIds(
          session.sessionId,
          usecaseIds,
        );
      const history = historyRows.filter(action =>
        this.isUsecaseAction(action),
      );
      const groupActionIds = new Set(
        usecaseGroupActions.map(action => action.changeId),
      );
      const firstGroupIndex = history.findIndex(action =>
        groupActionIds.has(action.changeId),
      );
      const lastGroupIndex = history.findLastIndex(action =>
        groupActionIds.has(action.changeId),
      );
      if (firstGroupIndex === -1 || lastGroupIndex === -1) return Result.ok([]);

      const [beforeUsecases, afterUsecases] = await Promise.all([
        this.usecaseFetcher.getUsecasesFromActions(
          fileId,
          usecaseIds,
          history.slice(0, firstGroupIndex),
        ),
        this.usecaseFetcher.getUsecasesFromActions(
          fileId,
          usecaseIds,
          history.slice(0, lastGroupIndex + 1),
        ),
      ]);
      const [beforeSnapshots, afterSnapshots] = await Promise.all([
        this.getChangeSnapshotMap(beforeUsecases, fileId),
        this.getChangeSnapshotMap(afterUsecases, fileId),
      ]);

      const actionsByUsecase = new Map<number, EditActionRow[]>();
      for (const action of usecaseGroupActions) {
        const actions = actionsByUsecase.get(action.aggregateId) ?? [];
        actions.push(action);
        actionsByUsecase.set(action.aggregateId, actions);
      }

      return Result.ok(
        usecaseIds.map(systemId => {
          const actions = actionsByUsecase.get(systemId)!;
          const rootAction = actions.find(
            action => action.targetTable === ENTITY_NAMES.UseCase,
          );
          const anchor = rootAction ?? actions[0];
          return {
            systemId,
            changeId: anchor.changeId,
            operation: rootAction?.operation ?? CHANGE_OPERATION.Update,
            before: beforeSnapshots.get(systemId) ?? null,
            after: afterSnapshots.get(systemId) ?? null,
          };
        }),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to query usecase change details',
        ),
      );
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

  private mapSubsystemFilteredGkvData(
    usecases: readonly UseCaseReadModel[],
    effectiveUsecases: readonly OverlaidUseCase[],
    subsystems: readonly OverlaidSubsystem[],
    modules: readonly SpfModuleReadModel[],
    subgraphs: readonly SubgraphBase[],
  ): UsecaseFilteredGkvData {
    const effectiveUsecaseById = new Map(
      effectiveUsecases.map(usecase => [usecase.systemId, usecase]),
    );
    const subgraphSystemIdsByUsecase = new Map<number, readonly number[]>(
      usecases.map(usecase => [
        usecase.systemId,
        effectiveUsecaseById.get(usecase.systemId)?.subgraphSystemIds ?? [],
      ]),
    );
    const subgraphNaturalIdsBySystemId = new Map(
      subgraphs.map(subgraph => [subgraph.systemId, subgraph.naturalId]),
    );

    const mappedSubsystems: SubsystemReadModel[] = subsystems.map(
      subsystem => ({
        systemId: subsystem.systemId,
        subsystemNaturalId: subsystem.subsystemId,
        name: subsystem.name,
        parentSystemId: subsystem.parentSystemId,
        filteredKeys: [],
        filteredKeySystemIds: subsystem.filteredKeySystemIds,
      }),
    );
    const mappedModules: SubsystemFilteredModule[] = modules.map(module => ({
      systemId: module.systemId,
      parentSystemId: module.parentSystemId,
      moduleNaturalId: module.naturalId,
      subgraphSystemId: module.subgraphSystemId,
      containerSystemId: module.containerSystemId,
    }));

    return {
      usecases: [...usecases],
      subgraphSystemIdsByUsecase,
      subgraphNaturalIdsBySystemId,
      subsystems: mappedSubsystems,
      modules: mappedModules,
    };
  }

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

  private isUsecaseAction(action: EditActionRow): boolean {
    return (
      action.targetTable === ENTITY_NAMES.UseCase ||
      action.targetTable === ENTITY_NAMES.UsecaseGkvValues ||
      action.targetTable === ENTITY_NAMES.UseCaseCategory ||
      action.targetTable === ENTITY_NAMES.UseCaseSubgraph ||
      action.targetTable === ENTITY_NAMES.UseCaseSubgraphPair
    );
  }

  private async getChangeSnapshotMap(
    usecases: readonly OverlaidUseCase[],
    fileId: number,
  ): Promise<Map<number, UsecaseChangeSnapshot>> {
    const pairsMap = await this.getGkvPairMap(usecases, fileId);
    return new Map(
      usecases.map(usecase => [
        usecase.systemId,
        {
          systemId: usecase.systemId,
          type: usecase.type,
          gkv: this.toGkvReadModel(usecase, pairsMap),
          alias: usecase.alias,
          aliasId: usecase.aliasId,
          categories: usecase.categoryNames,
          subgraphSystemIds: usecase.subgraphSystemIds,
          subgraphPairs: usecase.subgraphPairs,
        },
      ]),
    );
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
    if (pairsResult.kind === RESULT_KIND.Fail) return new Map();

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
}
