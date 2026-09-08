/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import {applyTableOverlay} from '../queries/edit-session/overlay-utils.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  VcpmInstanceBase,
  VcpmCkvBase,
  VcpmParameterPayloadBase,
  VcpmParameterDefinitionBase,
} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

export class VcpmOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchInstanceBySubgraph(
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmInstanceBase | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmInstance)
      .createQueryBuilder('vi')
      .where('vi.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
      .getOne()) as unknown as VcpmInstanceBase | null;

    if (sessionId === null) return baseRow;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const instanceActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.VcpmInstance,
    );
    if (instanceActions.length === 0) return baseRow;

    if (baseRow === null) {
      const createAction = instanceActions.find(
        a => a.operation === CHANGE_OPERATION.Create,
      );
      if (!createAction) return null;
      const isDeleted = instanceActions.some(
        a =>
          a.operation === CHANGE_OPERATION.Delete &&
          a.targetSystemId === createAction.targetSystemId,
      );
      if (isDeleted) return null;
      const payload = createAction.newValue as Partial<VcpmInstanceBase>;
      return {
        systemId: createAction.targetSystemId,
        subgraphSystemId: payload.subgraphSystemId ?? subgraphSystemId,
        vcpmDefinitionId: payload.vcpmDefinitionId ?? 0,
      };
    }

    return applyTableOverlay(
      baseRow as unknown as {systemId: number},
      instanceActions,
      ENTITY_NAMES.VcpmInstance,
    ) as VcpmInstanceBase | null;
  }

  async fetchCkvsByInstance(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmCkvBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .where('ckv.vcpmInstanceSystemId = :vcpmInstanceSystemId', {
        vcpmInstanceSystemId,
      })
      .getMany()) as unknown as VcpmCkvBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const ckvActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.VcpmCkv,
    );
    if (ckvActions.length === 0) return baseRows;

    const overlaid = this.overlay
      .applyToCollection(
        baseRows as unknown as Array<{systemId: number}>,
        ckvActions.filter(a => a.operation !== CHANGE_OPERATION.Create),
      )
      .map(r => r.effective as unknown as VcpmCkvBase);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const deletedIds = new Set(
      ckvActions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const created = ckvActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId) &&
          !deletedIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<VcpmCkvBase>;
        return {
          systemId: a.targetSystemId,
          vcpmInstanceSystemId: p.vcpmInstanceSystemId ?? vcpmInstanceSystemId,
          values: (p.values ?? []) as {valueDefSystemId: number}[],
        };
      });

    return [...overlaid, ...created];
  }

  async fetchCkv(
    ckvSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmCkvBase | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .innerJoin(
        'ckv.vcpmInstance',
        'vi',
        'vi.subgraphSystemId = :subgraphSystemId',
        {subgraphSystemId},
      )
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne()) as unknown as VcpmCkvBase | null;

    if (sessionId === null) return baseRow;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const ckvActions = actions.filter(
      a =>
        a.targetTable === ENTITY_NAMES.VcpmCkv &&
        a.targetSystemId === ckvSystemId,
    );
    if (ckvActions.length === 0) return baseRow;

    if (baseRow === null) {
      const createAction = ckvActions.find(
        a => a.operation === CHANGE_OPERATION.Create,
      );
      if (!createAction) return null;
      const isDeleted = ckvActions.some(
        a => a.operation === CHANGE_OPERATION.Delete,
      );
      if (isDeleted) return null;
      const p = createAction.newValue as Partial<VcpmCkvBase>;
      return {
        systemId: createAction.targetSystemId,
        vcpmInstanceSystemId: p.vcpmInstanceSystemId ?? 0,
        values: (p.values ?? []) as {valueDefSystemId: number}[],
      };
    }

    return applyTableOverlay(
      baseRow as unknown as {systemId: number},
      ckvActions,
      ENTITY_NAMES.VcpmCkv,
    ) as VcpmCkvBase | null;
  }

  async fetchParameterPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .where('pp.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId});
    if (paramSystemIds && paramSystemIds.length > 0) {
      qb.andWhere('pp.vcpmParameterSystemId IN (:...paramSystemIds)', {
        paramSystemIds,
      });
    }
    const baseRows =
      (await qb.getMany()) as unknown as VcpmParameterPayloadBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const payloadActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    if (payloadActions.length === 0) return baseRows;

    const overlaid = this.overlay
      .applyToCollection(
        baseRows as unknown as Array<{systemId: number}>,
        payloadActions.filter(a => a.operation !== CHANGE_OPERATION.Create),
      )
      .map(r => r.effective as unknown as VcpmParameterPayloadBase);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const deletedIds = new Set(
      payloadActions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const created = payloadActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId) &&
          !deletedIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<VcpmParameterPayloadBase>;
        return {
          systemId: a.targetSystemId,
          vcpmParameterSystemId: p.vcpmParameterSystemId ?? 0,
          vcpmCkvSystemId: p.vcpmCkvSystemId ?? ckvSystemId,
          payload: p.payload ?? null,
        };
      })
      .filter(
        r =>
          !paramSystemIds || paramSystemIds.includes(r.vcpmParameterSystemId),
      );

    return [...overlaid, ...created];
  }

  async fetchParameterPayloadsByInstance(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmParameterPayloadBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin(
        'pp.vcpmCkv',
        'ckv',
        'ckv.vcpmInstanceSystemId = :vcpmInstanceSystemId',
        {vcpmInstanceSystemId},
      )
      .getMany()) as unknown as VcpmParameterPayloadBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const payloadActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    if (payloadActions.length === 0) return baseRows;

    const overlaid = this.overlay
      .applyToCollection(
        baseRows as unknown as Array<{systemId: number}>,
        payloadActions.filter(a => a.operation !== CHANGE_OPERATION.Create),
      )
      .map(r => r.effective as unknown as VcpmParameterPayloadBase);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const deletedIds = new Set(
      payloadActions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );

    // Build validCkvIds in a single pass: committed CKV IDs from base rows +
    // staged CKV creates that belong to this instance. Staged payload creates
    // are only included if their CKV belongs to this instance.
    const validCkvIds = new Set(baseRows.map(r => r.vcpmCkvSystemId));
    for (const a of actions) {
      if (
        a.targetTable === ENTITY_NAMES.VcpmCkv &&
        a.operation === CHANGE_OPERATION.Create
      ) {
        const p = a.newValue as {vcpmInstanceSystemId?: number};
        if (p.vcpmInstanceSystemId === vcpmInstanceSystemId) {
          validCkvIds.add(a.targetSystemId);
        }
      }
    }

    const created = payloadActions
      .filter(a => {
        if (a.operation !== CHANGE_OPERATION.Create) return false;
        if (baseIds.has(a.targetSystemId)) return false;
        if (deletedIds.has(a.targetSystemId)) return false;
        const ckvId =
          (a.newValue as Partial<VcpmParameterPayloadBase>).vcpmCkvSystemId ??
          0;
        return validCkvIds.has(ckvId);
      })
      .map(a => {
        const p = a.newValue as Partial<VcpmParameterPayloadBase>;
        return {
          systemId: a.targetSystemId,
          vcpmParameterSystemId: p.vcpmParameterSystemId ?? 0,
          vcpmCkvSystemId: p.vcpmCkvSystemId ?? 0,
          payload: p.payload ?? null,
        };
      });

    return [...overlaid, ...created];
  }

  async fetchParameterDefinitions(
    paramSystemIds: number[],
  ): Promise<VcpmParameterDefinitionBase[]> {
    if (paramSystemIds.length === 0) return [];
    return this.manager
      .getRepository(ENTITY_NAMES.VcpmModuleParameterDefinition)
      .createQueryBuilder('pd')
      .where('pd.systemId IN (:...paramSystemIds)', {paramSystemIds})
      .getMany() as unknown as Promise<VcpmParameterDefinitionBase[]>;
  }
}
