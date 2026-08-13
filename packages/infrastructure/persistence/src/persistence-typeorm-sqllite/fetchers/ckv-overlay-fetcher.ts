/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {CHANGE_OPERATION} from '@arc/core';

export interface CkvBase {
  systemId: number;
  spfModuleSystemId: number;
  uiPersistence: Uint8Array | null;
}

export interface CkvParameterPayloadBase {
  systemId: number;
  parameterSystemId: number;
}

interface CkvPayloadNewValue {
  ckvSystemId: number;
  parameterSystemId: number;
}

export class CkvOverlayFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsQs: EditActionsQueryService,
  ) {}

  async fetchCkv(
    ckvSystemId: number,
    spfModuleSystemId: number,
    sessionId: number | null,
  ): Promise<CkvBase | null> {
    const row = (await this.manager
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .select(['ckv.systemId', 'ckv.spfModuleSystemId', 'ckv.uiPersistence'])
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .andWhere('ckv.spfModuleSystemId = :spfModuleSystemId', {
        spfModuleSystemId,
      })
      .getOne()) as unknown as CkvBase | null;

    if (sessionId === null) return row;

    const actions = await this.editActionsQs.getByAggregateAndTable(
      sessionId,
      spfModuleSystemId,
      ENTITY_NAMES.Ckv,
    );

    const deleteAction = actions.find(
      a =>
        a.targetSystemId === ckvSystemId &&
        a.operation === CHANGE_OPERATION.Delete,
    );
    if (deleteAction) return null;

    if (row === null) {
      const createAction = actions.find(
        a =>
          a.targetSystemId === ckvSystemId &&
          a.operation === CHANGE_OPERATION.Create,
      );
      if (createAction) {
        return {systemId: ckvSystemId, spfModuleSystemId, uiPersistence: null};
      }
    }

    return row;
  }

  async fetchCkvPayloads(
    ckvSystemId: number,
    spfModuleSystemId: number,
    sessionId: number | null,
  ): Promise<CkvParameterPayloadBase[]> {
    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('p')
      .select(['p.systemId', 'p.parameterSystemId'])
      .where('p.ckvSystemId = :ckvSystemId', {ckvSystemId})
      .getMany()) as unknown as CkvParameterPayloadBase[];

    if (sessionId === null) return rows;

    const actions = await this.editActionsQs.getByAggregateAndTable(
      sessionId,
      spfModuleSystemId,
      ENTITY_NAMES.CkvParameterPayload,
    );

    const deletedIds = new Set(
      actions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );

    const createdRows = actions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .flatMap(a => {
        const newVal = (
          typeof a.newValue === 'string'
            ? (JSON.parse(a.newValue) as unknown)
            : a.newValue
        ) as CkvPayloadNewValue;
        if (newVal.ckvSystemId !== ckvSystemId) return [];
        return [
          {
            systemId: a.targetSystemId,
            parameterSystemId: newVal.parameterSystemId,
          },
        ];
      })
      .filter(r => !rows.some(existing => existing.systemId === r.systemId));

    return [...rows.filter(r => !deletedIds.has(r.systemId)), ...createdRows];
  }
}
