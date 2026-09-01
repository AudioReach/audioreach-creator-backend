/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  VcpmPayloadRow,
  VcpmWriteAggregate,
  VcpmWriteCkv,
} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';

type InstanceRow = {
  systemId: number;
  subgraphSystemId: number;
  vcpmDefinitionId: number;
};

type CkvRow = {
  systemId: number;
  vcpmInstanceSystemId: number;
  values?: Array<{valueDefSystemId: number}>;
  valueDefSystemIds?: number[];
};

type PayloadRow = VcpmPayloadRow & {
  vcpmCkvSystemId: number;
};

/**
 * Command-side VCPM aggregate reader.
 *
 * It returns raw IDs required by write handlers. The PR #124 query service
 * remains responsible for GET response enrichment and is not injected here.
 */
export class VcpmWriteAggregateFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActions: EditActionsQueryService,
  ) {}

  async fetch(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    ckvSystemId?: number,
  ): Promise<VcpmWriteAggregate> {
    const instanceBaseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmInstance)
      .createQueryBuilder('instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .getMany()) as unknown as InstanceRow[];

    const instanceActions =
      sessionId === null
        ? []
        : await this.editActions.getByTable(
            sessionId,
            ENTITY_NAMES.VcpmInstance,
          );
    const instances = this.overlay
      .applyToCollection(instanceBaseRows, instanceActions, row =>
        Number(row.subgraphSystemId) === subgraphSystemId,
      )
      .map(result => result.effective);
    const instanceIds = new Set(instances.map(instance => instance.systemId));

    const ckvQuery = this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values');

    if (instanceIds.size === 0) {
      ckvQuery.where('1 = 0');
    } else {
      ckvQuery.where('ckv.vcpmInstanceSystemId IN (:...instanceIds)', {
        instanceIds: [...instanceIds],
      });
      if (ckvSystemId !== undefined) {
        ckvQuery.andWhere('ckv.systemId = :ckvSystemId', {ckvSystemId});
      }
    }

    const ckvBaseRows = (await ckvQuery.getMany()) as unknown as CkvRow[];
    const ckvActions =
      sessionId === null
        ? []
        : await this.editActions.getByTable(sessionId, ENTITY_NAMES.VcpmCkv);
    const ckvs = this.overlay
      .applyToCollection(ckvBaseRows, ckvActions, row => {
        const belongsToInstance = instanceIds.has(
          Number(row.vcpmInstanceSystemId),
        );
        const belongsToRequestedCkv =
          ckvSystemId === undefined || Number(row.systemId) === ckvSystemId;
        return belongsToInstance && belongsToRequestedCkv;
      })
      .map(result => this.normalizeCkv(result.effective as CkvRow));

    const payloads =
      ckvSystemId === undefined || ckvs.length === 0
        ? []
        : await this.fetchPayloads(
            ckvSystemId,
            subgraphSystemId,
            sessionId,
          );

    return {
      instanceSystemId: instances[0]?.systemId ?? null,
      ckvs,
      payloads,
    };
  }

  private async fetchPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmPayloadRow[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId})
      .getMany()) as unknown as PayloadRow[];

    const actions =
      sessionId === null
        ? []
        : await this.editActions.getByAggregateId(
            sessionId,
            subgraphSystemId,
          );
    const payloadActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );

    return this.overlay
      .applyToCollection(baseRows, payloadActions, row =>
        Number(row.vcpmCkvSystemId) === ckvSystemId,
      )
      .map(result => ({
        systemId: result.effective.systemId,
        vcpmParameterSystemId: Number(
          result.effective.vcpmParameterSystemId,
        ),
      }));
  }

  private normalizeCkv(row: CkvRow): VcpmWriteCkv {
    const valueDefSystemIds = Array.isArray(row.valueDefSystemIds)
      ? row.valueDefSystemIds
      : (row.values ?? []).map(value => value.valueDefSystemId);

    return {
      systemId: row.systemId,
      vcpmInstanceSystemId: Number(row.vcpmInstanceSystemId),
      valueDefSystemIds: valueDefSystemIds.map(Number),
    };
  }
}
