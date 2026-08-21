/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {VcpmInstanceBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmQueryContext} from './vcpm-query-context.js';

export class VcpmInstanceFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(private readonly manager: EntityManager) {}

  async fetchMany(
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
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

    if (context.sessionId === null) return baseRows;

    const instanceActions = context.editActions.filter(
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
