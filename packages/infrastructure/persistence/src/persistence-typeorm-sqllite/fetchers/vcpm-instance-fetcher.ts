/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {VcpmInstanceBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

export class VcpmInstanceFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmInstanceBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmInstance)
      .createQueryBuilder('instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .getMany()) as unknown as VcpmInstanceBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const instanceActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmInstance,
    );

    return this.overlay
      .applyToCollection(baseRows, instanceActions, {
        matchesEffective: row =>
          Number(row.subgraphSystemId) === subgraphSystemId,
      })
      .map(row => row.effective);
  }
}
