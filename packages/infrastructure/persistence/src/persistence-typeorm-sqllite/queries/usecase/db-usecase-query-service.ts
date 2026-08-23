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
} from '@arc/core';
import {Result, IssueFactory, LINK_TYPE, RESULT_KIND} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {
  ProjectSessionRow,
  UseCaseRow,
  NodeRow,
  DataLinkRow,
  ControlLinkRow,
} from '../../entity-schema/index.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
// eslint-disable-next-line sonarjs/deprecation
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {USECASE_PARAM_FILTER} from './usecase-param-filter.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';

export class DbUseCaseQueryService implements UseCaseQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQuerySvc: EditActionsQueryService,
    private readonly keyValueDefQuerySvc: KeyValueDefQueryService,
  ) {}

  // ── getAllUseCases ────────────────────────────────────────────────────────────

  async getAllUseCases(
    fileId: number,
    filter?: FilterExpression,
  ): Promise<Result<UseCaseReadModel[]>> {
    try {
      // Step 1 — QueryBuilder: load usecases with GKV bin rows
      // valueDef and keys are NOT joined — key-value resolution
      // (including overlay) is delegated to keyValueDefQuerySvc in Step 4
      const qb = this.dataSource
        .getRepository(ENTITY_NAMES.UseCase)
        .createQueryBuilder('uc')
        .where('uc.fileSystemId = :fileId', {fileId})
        .leftJoinAndSelect('uc.gkvEntries', 'gkv')
        .leftJoinAndSelect('uc.categories', 'cat');

      if (filter) {
        USECASE_PARAM_FILTER.apply(qb, filter, 'uc');
      }

      // Step 2 — load baseline rows
      let rows = (await qb.getMany()) as UseCaseRow[];

      // Step 3 — three-tier overlay: usecase rows + GKV bin rows
      // eslint-disable-next-line sonarjs/deprecation
      const session = await this.editActionsQuerySvc.findActiveSession(fileId);

      if (session) {
        // Always apply — handles CREATE-injected usecases not yet in the main table
        const usecaseActions = await this.editActionsQuerySvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.UseCase,
        );
        // eslint-disable-next-line sonarjs/deprecation
        rows = applyToCollection(rows, usecaseActions);

        await Promise.all(
          rows.map(row => this.applyRowOverlay(row, session.sessionId)),
        );
      }

      // Step 4 — resolve key-value pairs for ALL usecases in one batched call.
      // Collect all valueDefSystemIds across every usecase at once, then call
      // getKeyValueSummaryForGivenValues once — it applies ValueDefinition +
      // KeyDefinition overlay internally via applyBatchOverlay.
      const allValueDefIds = rows.flatMap(row =>
        (row.gkvEntries ?? []).map(e => e.valueDefSystemId),
      );

      const pairsResult =
        await this.keyValueDefQuerySvc.getKeyValueSummaryForGivenValues(
          allValueDefIds,
          fileId,
        );

      // Build lookup: valueDefSystemId → resolved {key, value} pair
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

      // Step 5 — assemble read models using the lookup
      const readModels: UseCaseReadModel[] = rows.map(row => {
        const gkv = (row.gkvEntries ?? [])
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
          systemId: row.systemId,
          gkv,
          alias: row.alias,
          aliasId: row.aliasId,
          categories: row.categories?.map(c => c.name),
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

    const session = await this.editActionsQuerySvc
      // eslint-disable-next-line sonarjs/deprecation
      .findActiveSession(0)
      .catch(() => null);

    const [modules, dataLinks, controlLinks] = await Promise.all([
      this.queryModulesForUseCases(useCaseSystemIds, session),
      this.queryDataLinksForUseCases(useCaseSystemIds, session),
      this.queryControlLinksForUseCases(useCaseSystemIds, session),
    ]);

    return {modules, dataLinks, controlLinks};
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /** Applies per-row session overlay: GKV bins (composite PK) + categories. */
  private async applyRowOverlay(
    row: UseCaseRow,
    sessionId: number,
  ): Promise<void> {
    const aggActions = await this.editActionsQuerySvc.getByAggregateId(
      sessionId,
      row.systemId,
    );
    if (aggActions.length === 0) return;

    // GKV bins (composite PK — no systemId; identify by valueDefSystemId)
    const gkvActions = aggActions.filter(
      a => a.targetTable === ENTITY_NAMES.UsecaseGkvValues,
    );
    if (gkvActions.length > 0 && row.gkvEntries) {
      const deletedIds = new Set(
        gkvActions
          .filter(a => a.operation === 'DELETE')
          .map(
            a => (a.newValue as {valueDefSystemId?: number}).valueDefSystemId,
          )
          .filter((id): id is number => id != null),
      );
      row.gkvEntries = row.gkvEntries.filter(
        e => !deletedIds.has(e.valueDefSystemId),
      );

      for (const a of gkvActions.filter(a => a.operation === 'CREATE')) {
        const p = a.newValue as {
          valueDefSystemId?: number;
          usecaseSystemId?: number;
        };
        if (p.valueDefSystemId) {
          row.gkvEntries = [
            ...row.gkvEntries,
            {
              usecaseSystemId: p.usecaseSystemId ?? row.systemId,
              valueDefSystemId: p.valueDefSystemId,
            },
          ];
        }
      }
    }

    // Categories
    const categoryActions = aggActions.filter(
      a => a.targetTable === ENTITY_NAMES.UseCaseCategory,
    );
    if (categoryActions.length > 0 && row.categories) {
      // eslint-disable-next-line sonarjs/deprecation
      row.categories = applyToCollection(row.categories, categoryActions);
    }
  }

  private async queryModulesForUseCases(
    ids: number[],
    session: ProjectSessionRow | null,
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
    session: ProjectSessionRow | null,
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
    session: ProjectSessionRow | null,
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

  async findUsecaseIdsBySubgraphIds(
    subgraphIds: number[],
    _fileSystemId: number,
  ): Promise<Map<number, number[]>> {
    if (subgraphIds.length === 0) return new Map();

    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.UseCaseSubgraph)
      .createQueryBuilder('ucs')
      .select(['ucs.usecaseSystemId', 'ucs.subgraphSystemId'])
      .where('ucs.subgraphSystemId IN (:...ids)', {ids: subgraphIds})
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
