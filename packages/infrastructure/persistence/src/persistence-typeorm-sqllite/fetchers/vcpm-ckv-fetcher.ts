/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {VcpmCkvBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmInstanceFetcher} from './vcpm-instance-fetcher.js';

export class VcpmCkvFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly vcpmInstanceFetcher: VcpmInstanceFetcher,
  ) {}

  async fetchMany(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmCkvBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .getMany()) as unknown as VcpmCkvBase[];

    if (sessionId === null) return baseRows;

    const [actions, instances] = await Promise.all([
      this.editActionsSvc.getByAggregateId(sessionId, subgraphSystemId),
      this.vcpmInstanceFetcher.fetchMany(
        subgraphSystemId,
        fileSystemId,
        sessionId,
      ),
    ]);
    const instanceIds = new Set(instances.map(instance => instance.systemId));
    const ckvActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmCkv,
    );

    return this.overlay
      .applyToCollection(baseRows, ckvActions, {
        matchesEffective: row =>
          instanceIds.has(Number(row.vcpmInstanceSystemId)),
      })
      .map(row => row.effective);
  }

  async fetchOne(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmCkvBase | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne()) as unknown as VcpmCkvBase | null;

    if (sessionId === null) return baseRow;

    const [actions, instances] = await Promise.all([
      this.editActionsSvc.getByAggregateId(sessionId, subgraphSystemId),
      this.vcpmInstanceFetcher.fetchMany(
        subgraphSystemId,
        fileSystemId,
        sessionId,
      ),
    ]);
    const instanceIds = new Set(instances.map(instance => instance.systemId));
    const ckvActions = actions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.VcpmCkv &&
        action.targetSystemId === ckvSystemId,
    );
    const effective = this.overlay.applyToSingle(baseRow, ckvActions, {
      matchesEffective: row =>
        instanceIds.has(Number(row.vcpmInstanceSystemId)),
    });

    return effective === null ? null : effective.effective;
  }
}
