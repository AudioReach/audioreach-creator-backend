/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {
  VcpmCkvRow,
  VcpmInstanceRow,
  VcpmParameterPayloadRow,
} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';

export type EffectiveVcpmInstance = Pick<
  VcpmInstanceRow,
  'systemId' | 'subgraphSystemId' | 'vcpmDefinitionId'
>;

export type EffectiveVcpmCkv = Pick<
  VcpmCkvRow,
  'systemId' | 'vcpmInstanceSystemId'
>;

export type EffectiveVcpmParameterPayload = Pick<
  VcpmParameterPayloadRow,
  'systemId' | 'vcpmCkvSystemId' | 'vcpmParameterSystemId' | 'payload'
>;

export interface EffectiveSubgraphVcpmData {
  instances: EffectiveVcpmInstance[];
  ckvs: EffectiveVcpmCkv[];
  parameterPayloads: EffectiveVcpmParameterPayload[];
}

/**
 * Reads the effective VCPM hierarchy owned by one subgraph.
 *
 * VCPM rows are stored in three physical tables but share the subgraph edit
 * aggregate. Each level is overlaid before its effective IDs scope the next.
 */
export class SubgraphVcpmDataFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchForSubgraph(
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<EffectiveSubgraphVcpmData> {
    const [instanceBaseRows, instanceActions] = await Promise.all([
      this.manager
        .getRepository(ENTITY_NAMES.VcpmInstance)
        .createQueryBuilder('instance')
        .where('instance.subgraphSystemId = :subgraphSystemId', {
          subgraphSystemId,
        })
        .getMany() as Promise<EffectiveVcpmInstance[]>,
      sessionId === null
        ? Promise.resolve([])
        : this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.VcpmInstance),
    ]);
    const instances = this.overlay
      .applyToCollection(instanceBaseRows, instanceActions, {
        matchesEffective: row => row.subgraphSystemId === subgraphSystemId,
      })
      .map(result => result.effective);

    const instanceIds = instances.map(instance => instance.systemId);
    const [ckvBaseRows, ckvActions] = await Promise.all([
      instanceIds.length === 0
        ? Promise.resolve([] as EffectiveVcpmCkv[])
        : (this.manager
            .getRepository(ENTITY_NAMES.VcpmCkv)
            .createQueryBuilder('vcpmCkv')
            .where('vcpmCkv.vcpmInstanceSystemId IN (:...instanceIds)', {
              instanceIds,
            })
            .getMany() as Promise<EffectiveVcpmCkv[]>),
      sessionId === null
        ? Promise.resolve([])
        : this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.VcpmCkv),
    ]);
    const instanceIdSet = new Set(instanceIds);
    const ckvs = this.overlay
      .applyToCollection(ckvBaseRows, ckvActions, {
        matchesEffective: row => instanceIdSet.has(row.vcpmInstanceSystemId),
      })
      .map(result => result.effective);

    const ckvIds = ckvs.map(ckv => ckv.systemId);
    const [payloadBaseRows, payloadActions] = await Promise.all([
      ckvIds.length === 0
        ? Promise.resolve([] as EffectiveVcpmParameterPayload[])
        : (this.manager
            .getRepository(ENTITY_NAMES.VcpmParameterPayload)
            .createQueryBuilder('payload')
            .where('payload.vcpmCkvSystemId IN (:...ckvIds)', {ckvIds})
            .getMany() as Promise<EffectiveVcpmParameterPayload[]>),
      sessionId === null
        ? Promise.resolve([])
        : this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.VcpmParameterPayload,
          ),
    ]);
    const ckvIdSet = new Set(ckvIds);
    const parameterPayloads = this.overlay
      .applyToCollection(payloadBaseRows, payloadActions, {
        matchesEffective: row => ckvIdSet.has(row.vcpmCkvSystemId),
      })
      .map(result => result.effective);

    return {instances, ckvs, parameterPayloads};
  }
}
