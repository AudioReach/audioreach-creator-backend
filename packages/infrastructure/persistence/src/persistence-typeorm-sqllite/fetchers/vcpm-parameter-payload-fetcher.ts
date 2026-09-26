/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {VcpmParameterPayloadBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmQueryContext} from './vcpm-query-context.js';

export interface VcpmParameterCkvLinkRow {
  parameterSystemId: number;
  ckvSystemId: number;
}

type RawParameterCkvLinkRow = Pick<
  VcpmParameterPayloadBase,
  'systemId' | 'vcpmParameterSystemId' | 'vcpmCkvSystemId'
>;

export class VcpmParameterPayloadFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(private readonly manager: EntityManager) {}

  async fetchParameterCkvLinksBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
    effectiveCkvSystemIds: ReadonlySet<number>,
  ): Promise<VcpmParameterCkvLinkRow[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin('pp.vcpmCkv', 'ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .select(['pp.systemId', 'pp.vcpmParameterSystemId', 'pp.vcpmCkvSystemId'])
      .getMany()) as unknown as RawParameterCkvLinkRow[];

    const scopedRows = baseRows.filter(row =>
      effectiveCkvSystemIds.has(row.vcpmCkvSystemId),
    );
    if (context.sessionId === null) return this.toLinks(scopedRows);

    const payloadActions = context.editActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    const effectiveRows = this.overlay.applyToCollection(
      baseRows,
      payloadActions,
      {
        matchesEffective: row =>
          effectiveCkvSystemIds.has(Number(row.vcpmCkvSystemId)),
      },
    );

    return this.toLinks(effectiveRows.map(row => row.effective));
  }

  async fetchMany(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
    effectiveCkvSystemIds: ReadonlySet<number>,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadBase[]> {
    if (!effectiveCkvSystemIds.has(ckvSystemId)) return [];

    const payloadQuery = this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin('pp.vcpmCkv', 'ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .where('pp.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId});

    if (paramSystemIds !== undefined && paramSystemIds.length > 0) {
      payloadQuery.andWhere(
        'pp.vcpmParameterSystemId IN (:...paramSystemIds)',
        {paramSystemIds},
      );
    }

    const baseRows =
      (await payloadQuery.getMany()) as unknown as VcpmParameterPayloadBase[];

    const matchesParameterFilter = (parameterSystemId: number): boolean =>
      paramSystemIds === undefined ||
      paramSystemIds.length === 0 ||
      paramSystemIds.includes(parameterSystemId);

    if (context.sessionId === null) {
      return baseRows.filter(row =>
        matchesParameterFilter(row.vcpmParameterSystemId),
      );
    }

    const payloadActions = context.editActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    const effectiveRows = this.overlay.applyToCollection(
      baseRows,
      payloadActions,
      {
        matchesEffective: row =>
          Number(row.vcpmCkvSystemId) === ckvSystemId &&
          effectiveCkvSystemIds.has(Number(row.vcpmCkvSystemId)) &&
          matchesParameterFilter(Number(row.vcpmParameterSystemId)),
      },
    );

    return effectiveRows.map(row => row.effective);
  }

  private toLinks(
    rows: Array<{
      vcpmParameterSystemId: number;
      vcpmCkvSystemId: number;
    }>,
  ): VcpmParameterCkvLinkRow[] {
    return rows.map(row => ({
      parameterSystemId: row.vcpmParameterSystemId,
      ckvSystemId: row.vcpmCkvSystemId,
    }));
  }
}
