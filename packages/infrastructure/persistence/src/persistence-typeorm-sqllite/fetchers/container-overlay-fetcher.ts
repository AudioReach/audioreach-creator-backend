/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {ContainerBase} from '../entity-schema/usecase-data/container/container.schema.js';
import type {ContainerPropertyDataBase} from '../entity-schema/usecase-data/container/container-property-data.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';
import type {ContainerPropertyDataFetcher} from './container-property-data-fetcher.js';

/**
 * Optional column-level filters for Container queries.
 * Fields map to ContainerBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type ContainerFilters = {
  systemId?: number | number[];
  containerTypeSystemId?: number | number[];
  $or?: ContainerFilters[];
};

export interface OverlaidContainer extends ContainerBase {
  properties: ContainerPropertyDataBase[];
}

/**
 * Fetches container rows with session overlay applied.
 * ContainerPropertyData is delegated to the injected ContainerPropertyDataFetcher
 * per §6 Rule A — ContainerPropertyData has a direct FK to Container.
 */
export class ContainerOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly propertyFetcher: ContainerPropertyDataFetcher,
  ) {}

  async fetchOne(
    containerSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidContainer | null> {
    const rows = await this.fetchMany(fileSystemId, sessionId, {
      systemId: containerSystemId,
    });
    if (rows.length === 0) return null;
    const container = rows[0];

    const properties = await this.propertyFetcher.fetchMany(
      containerSystemId,
      sessionId,
    );
    return {...container, properties};
  }

  async fetchMany(
    fileSystemId: number,
    sessionId: number | null,
    filters?: ContainerFilters,
  ): Promise<ContainerBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.Container)
      .createQueryBuilder('c')
      .where('c.fileSystemId = :fileSystemId', {fileSystemId});
    if (filters) applyEntityFilters(qb, 'c', filters);
    const baseRows = (await qb.getMany()) as ContainerBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Container,
    );
    if (actions.length === 0) return baseRows;

    const createFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    return this.overlay
      .applyToCollection(baseRows, actions, createFilter)
      .map(r => r.effective);
  }
}
