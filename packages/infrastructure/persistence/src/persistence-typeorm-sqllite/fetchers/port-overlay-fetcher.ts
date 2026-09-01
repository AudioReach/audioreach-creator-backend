/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {DataPortBase} from '../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {
  ControlPortBase,
  IntentBase,
} from '../entity-schema/usecase-data/node/control-port.js';
import type {IntentFetcher} from './intent-fetcher.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

/**
 * Optional column-level filters for DataPort queries.
 * Fields map to DataPortBase column names — all defined fields are ANDed.
 */
export type DataPortFilters = {
  systemId?: number | number[];
  nodeSystemId?: number | number[];
  portIoType?: string | string[];
  $or?: DataPortFilters[];
};

/**
 * Optional column-level filters for ControlPort queries.
 * Fields map to ControlPortBase column names — all defined fields are ANDed.
 */
export type ControlPortFilters = {
  systemId?: number | number[];
  nodeSystemId?: number | number[];
  $or?: ControlPortFilters[];
};

export interface OverlaidDataPort extends DataPortBase {
  fileSystemId: number;
}

export interface OverlaidControlPort extends ControlPortBase {
  fileSystemId: number;
  intents: IntentBase[];
}

/**
 * Fetches data and control port rows with session overlay applied.
 * Intent rows are delegated to the injected IntentFetcher per §6 Rule A.
 */
export class PortOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly intentFetcher: IntentFetcher,
  ) {}

  async fetchDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    filters?: DataPortFilters,
  ): Promise<OverlaidDataPort[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.DataPort)
      .createQueryBuilder('dp')
      .where('dp.nodeSystemId = :nodeSystemId', {nodeSystemId});
    if (filters) applyEntityFilters(qb, 'dp', filters);
    const baseRows = (await qb.getMany()) as DataPortBase[];

    const base: OverlaidDataPort[] = baseRows.map(r => ({
      ...r,
      isStatic: Boolean(r.isStatic),
      fileSystemId,
    }));

    if (sessionId === null) return base;

    const allActions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      nodeSystemId,
    );
    const dpActions = allActions.filter(
      a => a.targetTable === ENTITY_NAMES.DataPort,
    );
    if (dpActions.length === 0) return base;

    const createFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    return this.overlay
      .applyToCollection(base, dpActions, createFilter)
      .map(r => ({...r.effective, fileSystemId}));
  }

  async fetchControlPortsWithIntents(
    nodeSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    filters?: ControlPortFilters,
  ): Promise<OverlaidControlPort[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.ControlPort)
      .createQueryBuilder('cp')
      .where('cp.nodeSystemId = :nodeSystemId', {nodeSystemId});
    if (filters) applyEntityFilters(qb, 'cp', filters);
    const basePortRows = (await qb.getMany()) as ControlPortBase[];

    const basePorts: OverlaidControlPort[] = basePortRows.map(r => ({
      ...r,
      isStatic: Boolean(r.isStatic),
      fileSystemId,
      intents: [],
    }));

    if (sessionId === null) {
      const cpIds = basePorts.map(p => p.systemId);
      const intents = await this.intentFetcher.fetchMany(
        cpIds,
        nodeSystemId,
        null,
      );
      return basePorts.map(cp => ({
        ...cp,
        intents: intents.filter(i => i.controlPortSystemId === cp.systemId),
      }));
    }

    const allActions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      nodeSystemId,
    );
    const cpActions = allActions.filter(
      a => a.targetTable === ENTITY_NAMES.ControlPort,
    );

    const createFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    const overlaidPorts =
      cpActions.length > 0
        ? this.overlay
            .applyToCollection(basePorts, cpActions, createFilter)
            .map(r => ({...r.effective, fileSystemId}))
        : basePorts;

    const cpIds = overlaidPorts.map(p => p.systemId);
    const intents = await this.intentFetcher.fetchMany(
      cpIds,
      nodeSystemId,
      sessionId,
    );

    return overlaidPorts.map(cp => ({
      ...cp,
      intents: intents.filter(i => i.controlPortSystemId === cp.systemId),
    }));
  }
}
