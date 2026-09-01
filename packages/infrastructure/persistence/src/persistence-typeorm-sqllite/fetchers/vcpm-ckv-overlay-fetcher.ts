/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  VcpmCkvRow,
  VcpmCkvValuesRow,
} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

type VcpmCkvOverlayRow = {
  systemId: number;
  vcpmInstanceSystemId: number;
  values?: VcpmCkvValuesRow[];
  valueDefSystemIds?: number[];
};

export interface OverlaidVcpmCkv {
  readonly systemId: number;
  readonly vcpmInstanceSystemId: number;
  readonly values: VcpmCkvValuesRow[];
}

export interface VcpmCkvCreatePayload {
  vcpmInstanceSystemId: number;
  valueDefSystemIds: number[];
}

/**
 * Loads VCPM CKVs and applies the subgraph edit-session overlay.
 * Composite VcpmCkvValues rows are represented by valueDefSystemIds on a
 * staged CREATE action and are materialized only during commit.
 */
export class VcpmCkvOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidVcpmCkv[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .where('ckv.vcpmInstanceSystemId = :vcpmInstanceSystemId', {
        vcpmInstanceSystemId,
      })
      .getMany()) as VcpmCkvRow[];

    if (sessionId === null) {
      return baseRows.map(row => this.toOverlaid(row));
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const ckvActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmCkv,
    );

    return this.overlay
      .applyToCollection(
        baseRows,
        ckvActions,
        newValue =>
          Number(newValue.vcpmInstanceSystemId) === vcpmInstanceSystemId,
      )
      .map(result => this.toOverlaid(result.effective));
  }

  async fetchOne(
    ckvSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidVcpmCkv | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .leftJoinAndSelect('ckv.values', 'values')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .andWhere('instance.subgraphSystemId = :subgraphSystemId', {
        subgraphSystemId,
      })
      .getOne()) as VcpmCkvRow | null;

    if (sessionId === null) {
      return baseRow ? this.toOverlaid(baseRow) : null;
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const ckvActions = actions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.VcpmCkv &&
        action.targetSystemId === ckvSystemId,
    );
    const result = this.overlay.applyToSingle(baseRow, ckvActions);
    return result ? this.toOverlaid(result.effective) : null;
  }

  private toOverlaid(row: VcpmCkvOverlayRow): OverlaidVcpmCkv {
    const valueDefSystemIds = row.valueDefSystemIds ??
      (row.values ?? []).map(value => value.valueDefSystemId);

    return {
      systemId: row.systemId,
      vcpmInstanceSystemId: row.vcpmInstanceSystemId,
      values: valueDefSystemIds.map(valueDefSystemId => ({
        vcpmCkvSystemId: row.systemId,
        valueDefSystemId,
      })),
    };
  }
}
