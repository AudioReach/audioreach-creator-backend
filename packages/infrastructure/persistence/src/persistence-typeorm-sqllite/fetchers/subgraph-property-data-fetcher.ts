/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphPropertyDataBase} from '../entity-schema/usecase-data/subgraph/subgraph-property-data.js';

/**
 * Fetcher for subgraph_property_data rows.
 * Owns the property data query and session overlay (CREATE/UPDATE/DELETE).
 */
export class SubgraphPropertyDataFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Loads property data rows for the given subgraphs with session overlay applied.
   *
   * @param subgraphSystemIds  Subgraphs whose property rows are requested.
   * @param sessionId          Active session; null returns baseline only.
   */
  async fetchMany(
    subgraphSystemIds: number[],
    sessionId: number | null,
  ): Promise<SubgraphPropertyDataBase[]> {
    if (subgraphSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.SubgraphPropertyData)
      .createQueryBuilder('spd')
      .where('spd.subgraphSystemId IN (:...ids)', {ids: subgraphSystemIds})
      .getMany()) as SubgraphPropertyDataBase[];

    if (sessionId === null) return baseRows;

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.SubgraphPropertyData,
    );
    const subgraphIdSet = new Set(subgraphSystemIds);
    const actions = allActions.filter(a => subgraphIdSet.has(a.aggregateId));
    if (actions.length === 0) return baseRows;

    return this.overlay
      .applyToCollection(baseRows, actions)
      .map(r => r.effective);
  }
}
