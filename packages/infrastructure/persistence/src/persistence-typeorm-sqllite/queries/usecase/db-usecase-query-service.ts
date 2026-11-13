/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  FailedEntity,
  FilterExpression,
  UseCaseQueryService,
  ReadOptions,
  UseCaseReadModel,
  UseCaseReadModelQuery,
  UsecaseChangeDetails,
  UsecaseChangeSnapshot,
  KeyValueDefQueryService,
  KeyValuePairReadModel,
  UsecaseChangeDescriptor,
  UsecaseFilteredTopologyData,
  SubsystemFilterEntry,
} from '@arc/core';
import {
  CHANGE_OPERATION,
  FAILED_ENTITY_REASON,
  ISSUE_ENTITY_TYPE,
  READ_MODE,
  USECASE_TYPE,
  UseCase,
} from '@arc/core';
import {withNotFound} from '../../utils/with-not-found.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {USECASE_PARAM_FILTER} from './usecase-param-filter.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';
import {
  type OverlaidUseCase,
  UsecaseOverlayFetcher,
} from '../../fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {ContainerOverlayFetcher} from '../../fetchers/container-overlay-fetcher.js';
import {ContainerPropertyDataFetcher} from '../../fetchers/container-property-data-fetcher.js';
import {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

/**
 * Database implementation of UseCaseQueryService.
 *
 * Reads through the given EntityManager; build it with
 * createUseCaseQueryService.
 *
 * Overlay via UsecaseOverlayFetcher (FR-3); GKV key-value pairs resolved via
 * KeyValueDefQueryService (FR-4).
 */
export class DbUseCaseQueryService implements UseCaseQueryService {
  private readonly usecaseFetcher: UsecaseOverlayFetcher;
  private readonly linkFetcher: LinkOverlayFetcher;
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly subgraphFetcher: SubgraphOverlayFetcher;
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly containerFetcher: ContainerOverlayFetcher;

  constructor(
    private readonly manager: EntityManager,
    private readonly keyValueDefQuerySvc: KeyValueDefQueryService,
    editActionsQuerySvc: EditActionsQueryService,
    usecaseFetcher: UsecaseOverlayFetcher,
    linkFetcher: LinkOverlayFetcher,
    subsystemFetcher: SubsystemOverlayFetcher,
    subgraphFetcher: SubgraphOverlayFetcher,
  ) {
    this.usecaseFetcher = usecaseFetcher;
    this.linkFetcher = linkFetcher;
    this.subsystemFetcher = subsystemFetcher;
    this.subgraphFetcher = subgraphFetcher;
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(
      manager,
      editActionsQuerySvc,
    );
    this.nodeFetcher = new NodeOverlayFetcher(manager, editActionsQuerySvc);
    this.containerFetcher = new ContainerOverlayFetcher(
      manager,
      editActionsQuerySvc,
      new ContainerPropertyDataFetcher(manager, editActionsQuerySvc),
    );
  }

  async findUseCaseReadModels(
    fileSystemId: number,
    query?: UseCaseReadModelQuery,
  ): Promise<BatchRead<UseCaseReadModel>> {
    const ids = query?.ids === undefined ? undefined : [...new Set(query.ids)];
    if (ids?.length === 0) return {items: [], failed: []};
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);

    let usecases: OverlaidUseCase[];
    let notFound: FailedEntity[] = [];
    if (ids) {
      // Load the requested IDs first so missing ones can be reported, then
      // drop the ones that exist but do not match the filter.
      usecases = await this.usecaseFetcher.getUsecasesWithoutPairs(
        fileSystemId,
        sessionId,
        ids,
      );
      notFound = withNotFound(ids, usecases, uc => uc.systemId).failed;
      if (query?.filter && usecases.length > 0) {
        const matching = await this.findIdsMatchingFilter(
          fileSystemId,
          query.filter,
          usecases.map(uc => uc.systemId),
        );
        usecases = usecases.filter(uc => matching.has(uc.systemId));
      }
    } else if (query?.filter) {
      const matching = await this.findIdsMatchingFilter(
        fileSystemId,
        query.filter,
      );
      usecases =
        matching.size === 0
          ? []
          : await this.usecaseFetcher.getUsecasesWithoutPairs(
              fileSystemId,
              sessionId,
              [...matching],
            );
    } else {
      usecases = await this.usecaseFetcher.getUsecasesWithoutPairs(
        fileSystemId,
        sessionId,
      );
    }

    const gkvDefsByValueId = await this.getGkvDefsByValueId(
      usecases,
      fileSystemId,
    );
    const items: UseCaseReadModel[] = [];
    const failed: FailedEntity[] = [...notFound];
    for (const uc of usecases) {
      const missingRef = this.findUnresolvedGkvValue(uc, gkvDefsByValueId);
      if (missingRef === undefined) {
        items.push({
          systemId: uc.systemId,
          gkv: this.toGkvReadModel(uc, gkvDefsByValueId),
          alias: uc.alias ?? undefined,
          aliasId: uc.aliasId ?? undefined,
          categories: uc.categoryNames,
          type: uc.type,
        });
      } else {
        failed.push({
          systemId: uc.systemId,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          // No identity: a UseCase's identity includes the missing GKV pair.
          missingRef: {
            entityType: ISSUE_ENTITY_TYPE.ValueDefinition,
            systemId: missingRef,
          },
        });
      }
    }
    return {items, failed};
  }

  async findUseCaseFilteredTopologyData(
    fileSystemId: number,
  ): Promise<UsecaseFilteredTopologyData> {
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const [subgraphSystemIdsByUsecase, subsystems] = await Promise.all([
      this.usecaseFetcher.getUsecaseSubgraphMap(fileSystemId, sessionId),
      this.subsystemFetcher.fetchAll(fileSystemId, sessionId),
    ]);
    const usecaseSystemIds = [...subgraphSystemIdsByUsecase.keys()];
    const subgraphIds = [
      ...new Set([...subgraphSystemIdsByUsecase.values()].flat()),
    ];
    const [subgraphs, modules] =
      subgraphIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.subgraphFetcher.fetchMany(fileSystemId, sessionId, {
              systemId: subgraphIds,
            }),
            this.spfModuleFetcher.fetchMany(fileSystemId, sessionId, {
              subgraphSystemId: subgraphIds,
            }),
          ]);
    const nodeRows = await this.nodeFetcher.fetchMany(
      modules.map(module => module.systemId),
      fileSystemId,
      sessionId,
    );
    const containerIds = [
      ...new Set(modules.map(module => module.containerSystemId)),
    ];
    const containers =
      containerIds.length === 0
        ? []
        : await this.containerFetcher.fetchMany(fileSystemId, sessionId, {
            systemId: containerIds,
          });
    const parentByNode = new Map(
      nodeRows.map(node => [node.systemId, node.parentSystemId]),
    );
    const naturalByContainer = new Map(
      containers.map(container => [container.systemId, container.naturalId]),
    );
    const filteredKeySystemIds = [
      ...new Set(
        subsystems.flatMap(subsystem => subsystem.filteredKeySystemIds),
      ),
    ];
    // A filtered key that is missing is left out of its subsystem's filter.
    const keyDefinitions = await this.keyValueDefQuerySvc.findKeyDefinitions(
      fileSystemId,
      filteredKeySystemIds,
    );
    const keyDefinitionsBySystemId = new Map(
      keyDefinitions.items.map(key => [key.systemId, key]),
    );
    return {
      usecaseSystemIds,
      subgraphSystemIdsByUsecase,
      subgraphNaturalIdsBySystemId: new Map(
        subgraphs.map(subgraph => [subgraph.systemId, subgraph.naturalId]),
      ),
      subsystems: subsystems.map(
        (subsystem): SubsystemFilterEntry => ({
          systemId: subsystem.systemId,
          naturalId: subsystem.subsystemId,
          name: subsystem.name,
          parentSystemId: subsystem.parentSystemId,
          filteredKeys: subsystem.filteredKeySystemIds.flatMap(systemId => {
            const key = keyDefinitionsBySystemId.get(systemId);
            return key === undefined ? [] : [key];
          }),
        }),
      ),
      modules: modules.map(module => {
        const rawParent = parentByNode.get(module.systemId);
        return {
          systemId: module.systemId,
          parentSystemId: rawParent == null ? undefined : rawParent,
          moduleNaturalId: module.naturalId,
          subgraphSystemId: module.subgraphSystemId,
          // Container.naturalId is always present; fallback guards against a
          // missing overlay row during a partial import.
          containerNaturalId:
            naturalByContainer.get(module.containerSystemId) ??
            module.containerSystemId,
        };
      }),
    };
  }

  async findUseCaseChangeDetails(
    fileSystemId: number,
    emittedChanges: readonly UsecaseChangeDescriptor[],
  ): Promise<UsecaseChangeDetails[]> {
    if (emittedChanges.length === 0) return [];

    const usecaseIds = emittedChanges.map(change => change.systemId);
    if (new Set(usecaseIds).size !== usecaseIds.length) {
      throw new Error('Duplicate emitted UseCase system IDs');
    }

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);

    const [
      beforeUsecases,
      afterUsecases,
      beforeDataLinks,
      afterDataLinks,
      beforeControlLinks,
      afterControlLinks,
    ] = await Promise.all([
      this.usecaseFetcher.getUsecases(fileSystemId, null, usecaseIds),
      this.usecaseFetcher.getUsecases(fileSystemId, sessionId, usecaseIds),
      this.linkFetcher.loadDataLinkRows(fileSystemId, null),
      this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId),
      this.linkFetcher.loadControlLinkRows(fileSystemId, null),
      this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
    ]);
    const gkvDefsByValueId = await this.getGkvDefsByValueId(
      [...beforeUsecases, ...afterUsecases],
      fileSystemId,
    );
    for (const usecase of [...beforeUsecases, ...afterUsecases]) {
      const missingRef = this.findUnresolvedGkvValue(usecase, gkvDefsByValueId);
      if (missingRef !== undefined) {
        throw new Error(
          `UseCase ${usecase.systemId} references missing GKV value definition ${missingRef}`,
        );
      }
    }
    const beforeSnapshots = this.getChangeSnapshotMap(
      beforeUsecases,
      beforeDataLinks,
      beforeControlLinks,
      gkvDefsByValueId,
    );
    const afterSnapshots = this.getChangeSnapshotMap(
      afterUsecases,
      afterDataLinks,
      afterControlLinks,
      gkvDefsByValueId,
    );

    const details = emittedChanges.map(change => {
      const before = beforeSnapshots.get(change.systemId) ?? null;
      const after = afterSnapshots.get(change.systemId) ?? null;
      this.assertSnapshotBoundary(change, before, after);
      return {...change, before, after};
    });
    return details;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  async findUseCases(
    fileSystemId: number,
    ucSystemIds: readonly number[],
    options?: ReadOptions,
  ): Promise<BatchRead<UseCase>> {
    if (ucSystemIds.length === 0) return {items: [], failed: []};
    const sessionId = await this.resolveSessionId(fileSystemId, options);
    const overlaid = await this.usecaseFetcher.getUsecases(
      fileSystemId,
      sessionId,
      [...new Set(ucSystemIds)],
    );
    return withNotFound(
      ucSystemIds,
      overlaid.map(uc => UseCaseQueryMappers.toUseCase(uc)),
      uc => uc.systemId,
    );
  }

  async findUseCasesBySubgraphs(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
    options?: ReadOptions,
  ): Promise<UseCase[]> {
    if (subgraphSystemIds.length === 0) return [];
    const sessionId = await this.resolveSessionId(fileSystemId, options);
    const memberships =
      await this.usecaseFetcher.getSubgraphMembershipRowsForSubgraphs(
        fileSystemId,
        subgraphSystemIds,
        sessionId,
      );
    const usecaseSystemIds = [
      ...new Set(memberships.map(row => row.usecaseSystemId)),
    ];
    if (usecaseSystemIds.length === 0) return [];

    const overlaid = await this.usecaseFetcher.getUsecases(
      fileSystemId,
      sessionId,
      usecaseSystemIds,
    );
    return overlaid.map(uc => UseCaseQueryMappers.toUseCase(uc));
  }

  async findAllUseCases(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<UseCase[]> {
    const sessionId = await this.resolveSessionId(fileSystemId, options);
    const overlaid = await this.usecaseFetcher.getUsecases(
      fileSystemId,
      sessionId,
    );
    return overlaid.map(uc => UseCaseQueryMappers.toUseCase(uc));
  }

  /** Committed mode reads base tables only; overlay mode uses the active session. */
  private resolveSessionId(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<number | null> {
    return (options?.readMode ?? READ_MODE.Overlay) === READ_MODE.Committed
      ? Promise.resolve(null)
      : resolveActiveSessionId(this.manager, fileSystemId);
  }

  /**
   * Returns the IDs of base-table use cases that match `filter`. The filter
   * uses EXISTS subqueries over SpfModule/Subgraph, which are
   * cross-aggregate concerns that stay in the query service.
   */
  private async findIdsMatchingFilter(
    fileSystemId: number,
    filter: FilterExpression,
    restrictToIds?: readonly number[],
  ): Promise<Set<number>> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .select('uc.systemId')
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId});
    if (restrictToIds) {
      qb.andWhere('uc.systemId IN (:...ids)', {ids: [...restrictToIds]});
    }
    USECASE_PARAM_FILTER.apply(qb, filter, 'uc');
    const rows = (await qb.getMany()) as Array<{systemId: number}>;
    return new Set(rows.map(row => row.systemId));
  }

  /** The first GKV value definition of `usecase` that did not resolve. */
  private findUnresolvedGkvValue(
    usecase: OverlaidUseCase,
    gkvDefsByValueId: ReadonlyMap<number, KeyValuePairReadModel>,
  ): number | undefined {
    return usecase.gkvEntries.find(
      entry => !gkvDefsByValueId.has(entry.valueDefSystemId),
    )?.valueDefSystemId;
  }

  private getChangeSnapshotMap(
    usecases: readonly OverlaidUseCase[],
    dataLinks: Awaited<ReturnType<LinkOverlayFetcher['loadDataLinkRows']>>,
    controlLinks: Awaited<
      ReturnType<LinkOverlayFetcher['loadControlLinkRows']>
    >,
    gkvDefsByValueId: ReadonlyMap<number, KeyValuePairReadModel>,
  ): Map<number, UsecaseChangeSnapshot> {
    return new Map(
      usecases.map(usecase => [
        usecase.systemId,
        {
          isEc: usecase.type === USECASE_TYPE.Ec,
          gkv: this.toGkvReadModel(usecase, gkvDefsByValueId),
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

  private async getGkvDefsByValueId(
    usecases: readonly OverlaidUseCase[],
    fileSystemId: number,
  ): Promise<Map<number, KeyValuePairReadModel>> {
    const valueDefSystemIds = [
      ...new Set(
        usecases.flatMap(usecase =>
          usecase.gkvEntries.map(entry => entry.valueDefSystemId),
        ),
      ),
    ];
    // A missing value is left out; findUnresolvedGkvValue reports its use case.
    const pairs = await this.keyValueDefQuerySvc.findKeyValuePairs(
      fileSystemId,
      valueDefSystemIds,
    );
    return new Map(pairs.items.map(pair => [pair.value.systemId, pair]));
  }

  private toGkvReadModel(
    usecase: OverlaidUseCase,
    gkvDefsByValueId: ReadonlyMap<number, KeyValuePairReadModel>,
  ): KeyValuePairReadModel[] {
    return usecase.gkvEntries
      .map(entry => gkvDefsByValueId.get(entry.valueDefSystemId))
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
