/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {
  VcpmCkvBase,
  VcpmCkvValuesBase,
} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmInstanceFetcher} from './vcpm-instance-fetcher.js';
import type {VcpmQueryContext} from './vcpm-query-context.js';

export class VcpmCkvFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly vcpmInstanceFetcher: VcpmInstanceFetcher,
  ) {}

  async fetchMany(
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
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

    if (context.sessionId === null) return baseRows;

    const instances = await this.vcpmInstanceFetcher.fetchMany(
      subgraphSystemId,
      fileSystemId,
      context,
    );
    const instanceIds = new Set(instances.map(instance => instance.systemId));
    const ckvActions = context.editActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmCkv,
    );

    const effectiveCkvs = this.overlay
      .applyToCollection(baseRows, ckvActions, {
        matchesEffective: row =>
          instanceIds.has(Number(row.vcpmInstanceSystemId)),
      })
      .map(row => row.effective);
    return this.applyValueOverlay(effectiveCkvs, baseRows, context);
  }

  async fetchOne(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
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

    if (context.sessionId === null) return baseRow;

    const instances = await this.vcpmInstanceFetcher.fetchMany(
      subgraphSystemId,
      fileSystemId,
      context,
    );
    const instanceIds = new Set(instances.map(instance => instance.systemId));
    const ckvActions = context.editActions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.VcpmCkv &&
        action.targetSystemId === ckvSystemId,
    );
    const effective = this.overlay.applyToSingle(baseRow, ckvActions, {
      matchesEffective: row =>
        instanceIds.has(Number(row.vcpmInstanceSystemId)),
    });

    if (effective === null) return null;
    return (
      this.applyValueOverlay(
        [effective.effective],
        baseRow ? [baseRow] : [],
        context,
      )[0] ?? null
    );
  }

  private applyValueOverlay(
    ckvs: VcpmCkvBase[],
    baseCkvs: VcpmCkvBase[],
    context: VcpmQueryContext,
  ): VcpmCkvBase[] {
    const ckvIds = new Set(ckvs.map(ckv => ckv.systemId));
    const valueActions = context.editActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmCkvValues,
    );
    const effectiveValues = this.overlay
      .applyToCollection(
        baseCkvs.flatMap(ckv => ckv.values ?? []),
        valueActions,
        {
          matchesEffective: row => ckvIds.has(row.vcpmCkvSystemId),
        },
      )
      .map(result => result.effective);
    const valuesByCkvId = new Map<number, VcpmCkvValuesBase[]>();
    for (const value of effectiveValues) {
      const values = valuesByCkvId.get(value.vcpmCkvSystemId) ?? [];
      values.push(value);
      valuesByCkvId.set(value.vcpmCkvSystemId, values);
    }
    return ckvs.map(ckv => ({
      ...ckv,
      values: valuesByCkvId.get(ckv.systemId) ?? [],
    }));
  }
}
