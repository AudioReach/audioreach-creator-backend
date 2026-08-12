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
} from '@arc/core';
import {Result, IssueFactory, LINK_TYPE, RESULT_KIND} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {
  NodeRow,
  DataLinkRow,
  ControlLinkRow,
} from '../../entity-schema/index.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
// eslint-disable-next-line sonarjs/deprecation
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {USECASE_PARAM_FILTER} from './usecase-param-filter.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';

export class DbUseCaseQueryService implements UseCaseQueryService {
  private readonly usecaseFetcher: UsecaseOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQuerySvc: EditActionsQueryService,
    private readonly keyValueDefQuerySvc: KeyValueDefQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.usecaseFetcher = new UsecaseOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.editActionsQuerySvc = editActionsQuerySvc;
  }
  // editActionsQuerySvc retained for deprecated getAllComponentsForUseCases helpers only
  private readonly editActionsQuerySvc: EditActionsQueryService;

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

      // Fetcher handles UseCase scalars + GKV entry overlay + category assignments
      const overlaidUsecases = await this.usecaseFetcher.applyToUsecases(
        fileId,
        sessionId,
        restrictToIds,
      );

      // Resolve GKV key-value pairs — the only reference lookup remaining
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

  async getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ComponentsReadModel> {
    if (useCaseSystemIds.length === 0) {
      return {modules: [], dataLinks: [], controlLinks: []};
    }

    const session = await this.sessionRepo
      .findActiveSessionByFileSystemId(0)
      .catch(() => null);

    const [modules, dataLinks, controlLinks] = await Promise.all([
      this.queryModulesForUseCases(useCaseSystemIds, session),
      this.queryDataLinksForUseCases(useCaseSystemIds, session),
      this.queryControlLinksForUseCases(useCaseSystemIds, session),
    ]);

    return {modules, dataLinks, controlLinks};
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async queryModulesForUseCases(
    ids: number[],
    session: {sessionId: number} | null,
  ) {
    const nodes = (await this.dataSource
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('node')
      .innerJoin(ENTITY_NAMES.SpfModule, 'sm', 'sm.system_id = node.system_id')
      .innerJoin(
        ENTITY_NAMES.UseCaseSubgraph,
        'ucs',
        'ucs.subgraph_system_id = sm.subgraph_system_id AND ucs.usecase_system_id IN (:...ids)',
        {ids},
      )
      .leftJoinAndSelect('node.spfModule', 'spfModule')
      .leftJoinAndSelect('spfModule.definition', 'definition')
      .leftJoinAndSelect('definition.dataPortGroups', 'dataPortGroup')
      .leftJoinAndSelect('definition.staticPorts', 'staticPort')
      .leftJoinAndSelect('node.dataPorts', 'dataPort')
      .leftJoinAndSelect('node.controlPorts', 'controlPort')
      .leftJoinAndSelect('controlPort.allocatedIntents', 'intent')
      .getMany()) as NodeRow[];

    let overlaidNodes = nodes;

    if (session) {
      // Table-wide overlay for all module-owned entity types
      const [nodeActions, spfModActions, portActions, ctrlPortActs] =
        await Promise.all([
          this.editActionsQuerySvc.getByTable(
            session.sessionId,
            ENTITY_NAMES.Node,
          ),
          this.editActionsQuerySvc.getByTable(
            session.sessionId,
            ENTITY_NAMES.SpfModule,
          ),
          this.editActionsQuerySvc.getByTable(
            session.sessionId,
            ENTITY_NAMES.DataPort,
          ),
          this.editActionsQuerySvc.getByTable(
            session.sessionId,
            ENTITY_NAMES.ControlPort,
          ),
        ]);

      // eslint-disable-next-line sonarjs/deprecation
      overlaidNodes = applyToCollection(nodes, nodeActions);
      for (const node of overlaidNodes) {
        this.overlayNodeAndPorts(
          node,
          spfModActions,
          portActions,
          ctrlPortActs,
        );
      }
    }

    const seen = new Set<number>();
    return overlaidNodes
      .filter(n => n.spfModule && !seen.has(n.systemId) && seen.add(n.systemId))
      .map(n => UseCaseQueryMappers.mapNodeToSpfModuleReadModel(n));
  }

  /** Applies overlay to one node's SpfModule row, data ports, and control ports. */
  private overlayNodeAndPorts(
    node: NodeRow,
    spfModActions: EditActionRow[],
    portActions: EditActionRow[],
    ctrlPortActs: EditActionRow[],
  ): void {
    if (node.spfModule) {
      const smActions = spfModActions.filter(
        a => a.targetSystemId === node.systemId,
      );
      if (smActions.length > 0) {
        // eslint-disable-next-line sonarjs/deprecation
        const [updated] = applyToCollection([node.spfModule], smActions);
        if (updated) node.spfModule = updated;
      }
    }
    if (node.dataPorts) {
      // eslint-disable-next-line sonarjs/deprecation
      node.dataPorts = applyToCollection(
        node.dataPorts,
        portActions.filter(a => a.aggregateId === node.systemId),
      );
    }
    if (node.controlPorts) {
      // eslint-disable-next-line sonarjs/deprecation
      node.controlPorts = applyToCollection(
        node.controlPorts,
        ctrlPortActs.filter(a => a.aggregateId === node.systemId),
      );
    }
  }

  private async queryDataLinksForUseCases(
    ids: number[],
    session: {sessionId: number} | null,
  ) {
    const [intraSubgraph, intraUsecase] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.DataLink)
        .createQueryBuilder('dl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraph,
          'ucs',
          'ucs.subgraph_system_id = dl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
          {ids},
        )
        .where('dl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
        .getMany(),
      this.dataSource
        .getRepository(ENTITY_NAMES.DataLink)
        .createQueryBuilder('dl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraphPair,
          'ucsp',
          'ucsp.source_subgraph_system_id = dl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = dl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
          {ids},
        )
        .where('dl.linkType = :type', {type: LINK_TYPE.IntraUsecase})
        .getMany(),
    ]);

    let all = [...intraSubgraph, ...intraUsecase] as DataLinkRow[];

    if (session) {
      const dlActions = await this.editActionsQuerySvc.getByTable(
        session.sessionId,
        ENTITY_NAMES.DataLink,
      );
      if (dlActions.length > 0) {
        // eslint-disable-next-line sonarjs/deprecation
        all = applyToCollection(all, dlActions);
      }
    }

    const seen = new Set<number>();
    return all
      .filter(dl => !seen.has(dl.systemId) && seen.add(dl.systemId))
      .map(dl => UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl));
  }

  private async queryControlLinksForUseCases(
    ids: number[],
    session: {sessionId: number} | null,
  ) {
    const [intraSubgraph, intraUsecase] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.ControlLink)
        .createQueryBuilder('cl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraph,
          'ucs',
          'ucs.subgraph_system_id = cl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
          {ids},
        )
        .where('cl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
        .getMany(),
      this.dataSource
        .getRepository(ENTITY_NAMES.ControlLink)
        .createQueryBuilder('cl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraphPair,
          'ucsp',
          'ucsp.source_subgraph_system_id = cl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = cl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
          {ids},
        )
        .where('cl.linkType = :type', {type: LINK_TYPE.IntraUsecase})
        .getMany(),
    ]);

    let all = [...intraSubgraph, ...intraUsecase] as ControlLinkRow[];

    if (session) {
      const clActions = await this.editActionsQuerySvc.getByTable(
        session.sessionId,
        ENTITY_NAMES.ControlLink,
      );
      if (clActions.length > 0) {
        // eslint-disable-next-line sonarjs/deprecation
        all = applyToCollection(all, clActions);
      }
    }

    const seen = new Set<number>();
    return all
      .filter(cl => !seen.has(cl.systemId) && seen.add(cl.systemId))
      .map(cl => UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl));
  }
}
