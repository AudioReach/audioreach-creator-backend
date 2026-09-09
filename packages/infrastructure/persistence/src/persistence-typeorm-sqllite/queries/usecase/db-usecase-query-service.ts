/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  UseCaseQueryService,
  UseCaseReadModel,
  ComponentsReadModel,
  FilterExpression,
  KeyValueDefQueryService,
  ISessionRepository,
  SpfModuleQueryService,
  UsecaseFilteredGkvData,
  SubsystemFilteredModule,
  SubsystemReadModel,
} from '@arc/core';
import {Result, IssueFactory, RESULT_KIND} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {USECASE_PARAM_FILTER} from './usecase-param-filter.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import type {OverlaidSubsystem} from '../../fetchers/subsystem-overlay-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import type {OverlaidUseCase} from '../../fetchers/usecase-overlay-fetcher.js';
import type {NodeBase} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {SpfModuleBase} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';

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
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    private readonly keyValueDefQuerySvc: KeyValueDefQueryService,
    private readonly spfModuleQuerySvc: SpfModuleQueryService,
    private readonly sessionRepo: ISessionRepository,
    usecaseFetcher: UsecaseOverlayFetcher,
    linkFetcher: LinkOverlayFetcher,
    subsystemFetcher: SubsystemOverlayFetcher,
    spfModuleFetcher: SpfModuleOverlayFetcher,
    nodeFetcher: NodeOverlayFetcher,
  ) {
    this.usecaseFetcher = usecaseFetcher;
    this.linkFetcher = linkFetcher;
    this.subsystemFetcher = subsystemFetcher;
    this.spfModuleFetcher = spfModuleFetcher;
    this.nodeFetcher = nodeFetcher;
  }

  // ── getAllUseCases ────────────────────────────────────────────────────────────

  async getAllUseCases(
    fileId: number,
    filter?: FilterExpression,
  ): Promise<Result<UseCaseReadModel[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileId);
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
          .where('uc.fileSystemId = :fileId', {fileId});
        USECASE_PARAM_FILTER.apply(qb, filter, 'uc');
        const filtered = (await qb.getMany()) as Array<{systemId: number}>;
        restrictToIds = filtered.map(r => r.systemId);
        if (restrictToIds.length === 0) return Result.ok([]);
      }

      // Fetcher handles UseCase scalars + GKV entry overlay + category assignments (FR-3).
      const overlaidUsecases = await this.usecaseFetcher.getUsecases(
        fileId,
        sessionId,
        restrictToIds,
      );

      // Resolve GKV key-value pairs — cross-aggregate enrichment (FR-4).
      // All valueDefIds collected into one batch call (FR-5).
      const allValueDefIds = [
        ...new Set(
          overlaidUsecases.flatMap(uc =>
            uc.gkvEntries.map(e => e.valueDefSystemId),
          ),
        ),
      ];

      const pairsResult =
        await this.keyValueDefQuerySvc.getKeyValueSummaryForGivenValues(
          allValueDefIds,
          fileId,
        );

      type KvPair = {
        key: {systemId: number; keyId: number; name: string};
        value: {systemId: number; valueId: number; name: string};
      };
      const pairsList: KvPair[] =
        pairsResult.kind === RESULT_KIND.Fail
          ? []
          : (pairsResult.data as KvPair[]);
      const pairsMap = new Map<number, KvPair>(
        pairsList.map(pair => [pair.value.systemId, pair]),
      );

      const readModels: UseCaseReadModel[] = overlaidUsecases.map(uc => {
        const gkv = uc.gkvEntries
          .map(e => pairsMap.get(e.valueDefSystemId))
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map(pair => ({
            key: {
              systemId: pair.key.systemId,
              keyId: pair.key.keyId,
              name: pair.key.name,
            },
            value: {
              systemId: pair.value.systemId,
              valueId: pair.value.valueId,
              name: pair.value.name,
            },
          }));

        return {
          systemId: uc.systemId,
          gkv,
          alias: uc.alias,
          aliasId: uc.aliasId,
          categories: uc.categoryNames,
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

  // ── getAllComponentsForUseCases (deprecated) ──────────────────────────────────

  /**
   * Loads the effective data needed by the core subsystem-filtered GKV
   * transformation.
   *
   * The base usecase query supplies GKV values. Existing fetchers load the
   * effective subsystem/module/node topology; the core service applies the
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
          subsystems: [],
          modules: [],
        };
        return usecasesResult.kind === RESULT_KIND.Partial
          ? Result.partial(data, usecasesResult.issues)
          : Result.ok(data);
      }

      const usecaseSystemIds = usecases.map(usecase => usecase.systemId);
      const [effectiveUsecases, subsystems, modules, nodes] = await Promise.all(
        [
          this.usecaseFetcher.getUsecases(fileId, sessionId, usecaseSystemIds),
          this.subsystemFetcher.fetchAll(fileId, sessionId),
          this.spfModuleFetcher.fetchMany(fileId, sessionId),
          this.nodeFetcher.fetchAll(fileId, sessionId),
        ],
      );

      const data = this.mapSubsystemFilteredGkvData(
        usecases,
        effectiveUsecases,
        subsystems,
        modules,
        nodes,
      );

      return usecasesResult.kind === RESULT_KIND.Partial
        ? Result.partial(data, usecasesResult.issues)
        : Result.ok(data);
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
  private mapSubsystemFilteredGkvData(
    usecases: readonly UseCaseReadModel[],
    effectiveUsecases: readonly OverlaidUseCase[],
    subsystems: readonly OverlaidSubsystem[],
    modules: readonly SpfModuleBase[],
    nodes: readonly NodeBase[],
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
    const parentByNode = new Map(
      nodes.map(node => [node.systemId, node.parentId]),
    );

    const mappedSubsystems: SubsystemReadModel[] = subsystems.map(
      subsystem => ({
        systemId: subsystem.systemId,
        name: subsystem.name,
        parentId: subsystem.parentId,
        filteredKeys: [],
        filteredKeySystemIds: subsystem.filteredKeySystemIds,
      }),
    );
    const mappedModules: SubsystemFilteredModule[] = modules.map(module => ({
      systemId: module.systemId,
      parentId: parentByNode.get(module.systemId),
      instanceId: module.instanceId,
      subgraphId: module.subgraphSystemId,
      containerId: module.containerSystemId,
    }));

    return {
      usecases: [...usecases],
      subgraphSystemIdsByUsecase,
      subsystems: mappedSubsystems,
      modules: mappedModules,
    };
  }

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
}
