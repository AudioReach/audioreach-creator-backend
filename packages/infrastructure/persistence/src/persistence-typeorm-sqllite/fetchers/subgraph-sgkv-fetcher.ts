/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  SgkvBase,
  SgkvValuesBase,
} from '../entity-schema/usecase-data/subgraph/subgraph-sgkv-data.js';

/**
 * SGKV (subgraph GKV bin) with session overlay applied and its value
 * associations nested. Extends SgkvBase — adds the `values` child collection.
 */
export interface OverlaidSgkv extends SgkvBase {
  values: SgkvValuesBase[];
}

/**
 * Fetcher for SGKV (subgraph GKV) rows.
 * Owns the SGKV query and session overlay (CREATE/UPDATE/DELETE).
 */
export class SubgraphSgkvFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Loads SGKV rows for the given file with session overlay applied.
   *
   * @param fileSystemId   Scope to this file.
   * @param sessionId      Active session; null returns baseline only.
   * @param sgSystemIds    Optional: restrict to these subgraph system IDs.
   */
  async fetchMany(
    fileSystemId: number,
    sessionId: number | null,
    sgSystemIds?: number[],
  ): Promise<OverlaidSgkv[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.Sgkv)
      .createQueryBuilder('sgkv')
      .innerJoin('sgkv.subgraph', 's', 's.fileSystemId = :fileSystemId', {
        fileSystemId,
      })
      .leftJoinAndSelect('sgkv.values', 'vals');

    if (sgSystemIds && sgSystemIds.length > 0) {
      qb.andWhere('sgkv.subgraphSystemId IN (:...sgIds)', {sgIds: sgSystemIds});
    }

    const baseRows = (await qb.getMany()) as Array<
      SgkvBase & {values?: SgkvValuesBase[]}
    >;

    const toOverlaid = (
      r: SgkvBase & {values?: SgkvValuesBase[]},
    ): OverlaidSgkv => ({
      systemId: r.systemId,
      subgraphSystemId: r.subgraphSystemId,
      values: r.values ?? [],
    });

    if (sessionId === null) return baseRows.map(r => toOverlaid(r));

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Sgkv,
    );
    if (actions.length === 0) return baseRows.map(r => toOverlaid(r));

    return this.overlay
      .applyToCollection(baseRows, actions)
      .map(r =>
        toOverlaid(r.effective as SgkvBase & {values?: SgkvValuesBase[]}),
      );
  }
}
