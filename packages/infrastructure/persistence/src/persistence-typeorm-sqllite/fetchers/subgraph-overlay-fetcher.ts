/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  CHANGE_OPERATION,
  IPC_TX_MODULE_DEF_ID,
  IPC_RX_MODULE_DEF_ID,
} from '@arc/core';
import type {SessionChanged} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphBase} from '../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import type {SpfModuleBase} from '../entity-schema/usecase-data/module/spf-module.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';
import type {SubgraphPropertyDataFetcher} from './subgraph-property-data-fetcher.js';
import type {SubgraphSgkvFetcher} from './subgraph-sgkv-fetcher.js';
import {SpfModuleOverlayFetcher} from './spf-module-overlay-fetcher.js';
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
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly propertyDataFetcher?: SubgraphPropertyDataFetcher,
    private readonly sgkvFetcher?: SubgraphSgkvFetcher,
  ) {
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(
      manager,
      editActionsSvc,
    );
  }

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
    const qb = this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .where('s.fileSystemId = :fileSystemId', {fileSystemId});
    if (sessionId === null && filters) applyEntityFilters(qb, 's', filters);
    const baseRows = (await qb.getMany()) as SubgraphBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Subgraph,
    );

    const effectiveRows = this.overlay
      .applyToCollection(
        baseRows,
        actions,
      )
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

  // ── Assembled entry points ────────────────────────────────────────────────────

  /**
   * Returns a single fully-assembled OverlaidSubgraph (scalars + properties).
   * Does NOT delegate to fetchMany — that method's createFilter cannot include
   * session-created rows (systemId absent from newValue). Uses applyToSingle
   * directly with getByAggregateAndTable so systemId is taken from
   * targetSystemId on the CREATE action.
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
      const properties = this.propertyDataFetcher
        ? await this.propertyDataFetcher.fetchMany(
            [subgraphSystemId],
            sessionId,
          )
        : [];
      return {...baseRow, properties};
    }

    const actions = await this.editActionsSvc.getByAggregateAndTable(
      sessionId,
      subgraphSystemId,
      ENTITY_NAMES.Subgraph,
    );
    const result = this.overlay.applyToSingle(baseRow, actions);
    if (!result) return null;

    const properties = this.propertyDataFetcher
      ? await this.propertyDataFetcher.fetchMany([subgraphSystemId], sessionId)
      : [];
    return {...result.effective, properties};
  }

  /**
   * Returns all SGKV rows for the given file with session overlay.
   * Delegates to the injected SubgraphSgkvFetcher.
   */
  async getSgkvs(fileSystemId: number, sessionId: number | null) {
    if (!this.sgkvFetcher) return [];
    return this.sgkvFetcher.fetchMany(fileSystemId, sessionId);
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

  /**
   * Returns SGs whose module composition matches the MDF pattern (exactly 2
   * modules: IPC_TX + IPC_RX), then applies session overlay.
   * The MDF check is a structural DB predicate — modules are committed-only.
   */
  async fetchMdfInScope(
    fileSystemId: number,
    sessionId: number | null,
    sgSystemIds: number[],
  ): Promise<SubgraphBase[]> {
    if (sgSystemIds.length === 0) return [];

    const candidates = await this.fetchMany(fileSystemId, sessionId, {
      systemId: sgSystemIds,
    });
    if (candidates.length === 0) return [];

    const modules = await this.spfModuleFetcher.fetchEffectiveForSubgraphs(
      fileSystemId,
      sessionId,
      candidates.map(candidate => candidate.systemId),
    );
    if (modules.length === 0) return [];

    const definitionIds = [
      ...new Set(modules.map(module => module.definitionSystemId)),
    ];
    const definitions = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('definition')
      .select(['definition.systemId', 'definition.moduleDefinitionId'])
      .where('definition.systemId IN (:...ids)', {ids: definitionIds})
      .getMany()) as unknown as Array<{
      systemId: number;
      moduleDefinitionId: number;
    }>;
    const definitionById = new Map(
      definitions.map(definition => [
        definition.systemId,
        definition.moduleDefinitionId,
      ]),
    );
    const modulesBySubgraph = new Map<number, SpfModuleBase[]>();
    for (const module of modules) {
      const list = modulesBySubgraph.get(module.subgraphSystemId) ?? [];
      list.push(module);
      modulesBySubgraph.set(module.subgraphSystemId, list);
    }

    return candidates.filter(candidate => {
      const subgraphModules = modulesBySubgraph.get(candidate.systemId) ?? [];
      if (subgraphModules.length !== 2) return false;
      const naturalDefinitionIds = new Set(
        subgraphModules.map(module =>
          definitionById.get(module.definitionSystemId),
        ),
      );
      return (
        naturalDefinitionIds.has(IPC_TX_MODULE_DEF_ID) &&
        naturalDefinitionIds.has(IPC_RX_MODULE_DEF_ID)
      );
    });
  }
}
