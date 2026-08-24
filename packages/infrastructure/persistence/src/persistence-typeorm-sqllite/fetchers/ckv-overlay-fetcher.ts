/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';

export interface OverlaidCkv {
  systemId: number;
  spfModuleSystemId: number;
  uiPersistence: Uint8Array | null;
}

export interface OverlaidCkvParameterPayload {
  systemId: number;
  parameterSystemId: number;
}

export class CkvOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsQs: EditActionsQueryService,
  ) {}

  async fetchCkv(
    ckvSystemId: number,
    spfModuleSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidCkv | null> {
    const row = (await this.manager
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .select(['ckv.systemId', 'ckv.spfModuleSystemId', 'ckv.uiPersistence'])
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .andWhere('ckv.spfModuleSystemId = :spfModuleSystemId', {
        spfModuleSystemId,
      })
      .getOne()) as unknown as OverlaidCkv | null;

    if (sessionId === null) return row;

    const actions = await this.editActionsQs.getByAggregateAndTable(
      sessionId,
      spfModuleSystemId,
      ENTITY_NAMES.Ckv,
    );

    const ckvActions = actions.filter(a => a.targetSystemId === ckvSystemId);
    return (
      this.overlay.applyToSingle<OverlaidCkv>(row, ckvActions)?.effective ??
      null
    );
  }

  async fetchCkvPayloads(
    ckvSystemId: number,
    spfModuleSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidCkvParameterPayload[]> {
    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('p')
      .select(['p.systemId', 'p.parameterSystemId'])
      .where('p.ckvSystemId = :ckvSystemId', {ckvSystemId})
      .getMany()) as unknown as OverlaidCkvParameterPayload[];

    if (sessionId === null) return rows;

    const actions = await this.editActionsQs.getByAggregateAndTable(
      sessionId,
      spfModuleSystemId,
      ENTITY_NAMES.CkvParameterPayload,
    );

    return this.overlay
      .applyToCollection<OverlaidCkvParameterPayload>(
        rows,
        actions,
        newValue =>
          (newValue as {ckvSystemId?: number}).ckvSystemId === ckvSystemId,
      )
      .map(r => r.effective);
  }
}
