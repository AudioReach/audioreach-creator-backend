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
import {matchesEntityFilters} from '../queries/shared/filter-utils.js';

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
    return this.fetchDataPortsForNodes(
      [nodeSystemId],
      fileSystemId,
      sessionId,
      filters,
    );
  }

  async fetchDataPortsForNodes(
    nodeSystemIds: readonly number[],
    fileSystemId: number,
    sessionId: number | null,
    filters?: DataPortFilters,
  ): Promise<OverlaidDataPort[]> {
    if (nodeSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.DataPort)
      .createQueryBuilder('dp')
      .where('dp.nodeSystemId IN (:...nodeSystemIds)', {nodeSystemIds});
    const baseRows = (await qb.getMany()) as DataPortBase[];

    const base: OverlaidDataPort[] = baseRows.map(r => ({
      ...r,
      isStatic: Boolean(r.isStatic),
      fileSystemId,
    }));

    if (sessionId === null) return this.filterPorts(base, filters);

    const nodeSystemIdSet = new Set(nodeSystemIds);
    const allActions =
      nodeSystemIds.length === 1
        ? await this.editActionsSvc.getByAggregateId(
            sessionId,
            nodeSystemIds[0],
          )
        : await this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.DataPort,
          );
    const dpActions = allActions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.DataPort &&
        nodeSystemIdSet.has(action.aggregateId),
    );
    if (dpActions.length === 0) return this.filterPorts(base, filters);

    return this.overlay
      .applyToCollection(base, dpActions, {
        matchesEffective: row =>
          nodeSystemIdSet.has(row.nodeSystemId) &&
          (filters === undefined ||
            matchesEntityFilters(
              row as unknown as Record<string, unknown>,
              filters,
            )),
      })
      .map(r => ({...r.effective, fileSystemId}));
  }

  async fetchDataPortBySystemId(
    portSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDataPort | null> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.DataPort)
      .createQueryBuilder('dp')
      .innerJoin(ENTITY_NAMES.Node, 'n', 'n.system_id = dp.node_system_id')
      .where('dp.systemId = :portSystemId', {portSystemId})
      .andWhere('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as DataPortBase[];
    const base = baseRows.map(row => ({
      ...row,
      isStatic: Boolean(row.isStatic),
      fileSystemId,
    }));

    if (sessionId === null) return base[0] ?? null;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.DataPort,
    );
    const effective = this.overlay
      .applyToCollection(base, actions, {
        matchesEffective: row =>
          row.systemId === portSystemId && row.fileSystemId === fileSystemId,
      })
      .map(row => ({...row.effective, fileSystemId}));

    return effective[0] ?? null;
  }

  async fetchControlPortsWithIntents(
    nodeSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    filters?: ControlPortFilters,
  ): Promise<OverlaidControlPort[]> {
    return this.fetchControlPortsWithIntentsForNodes(
      [nodeSystemId],
      fileSystemId,
      sessionId,
      filters,
    );
  }

  async fetchControlPortsWithIntentsForNodes(
    nodeSystemIds: readonly number[],
    fileSystemId: number,
    sessionId: number | null,
    filters?: ControlPortFilters,
  ): Promise<OverlaidControlPort[]> {
    if (nodeSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.ControlPort)
      .createQueryBuilder('cp')
      .where('cp.nodeSystemId IN (:...nodeSystemIds)', {nodeSystemIds});
    const basePortRows = (await qb.getMany()) as ControlPortBase[];

    const basePorts: OverlaidControlPort[] = basePortRows.map(r => ({
      ...r,
      isStatic: Boolean(r.isStatic),
      fileSystemId,
      intents: [],
    }));

    if (sessionId === null) {
      const filteredBasePorts = this.filterPorts(basePorts, filters);
      const cpIds = filteredBasePorts.map(p => p.systemId);
      const intents = await this.intentFetcher.fetchMany(
        cpIds,
        nodeSystemIds,
        null,
      );
      return filteredBasePorts.map(cp => ({
        ...cp,
        intents: intents.filter(i => i.controlPortSystemId === cp.systemId),
      }));
    }

    const nodeSystemIdSet = new Set(nodeSystemIds);
    const allActions =
      nodeSystemIds.length === 1
        ? await this.editActionsSvc.getByAggregateId(
            sessionId,
            nodeSystemIds[0],
          )
        : await this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.ControlPort,
          );
    const cpActions = allActions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.ControlPort &&
        nodeSystemIdSet.has(action.aggregateId),
    );

    const overlaidPorts =
      cpActions.length > 0
        ? this.overlay
            .applyToCollection(basePorts, cpActions, {
              matchesEffective: row =>
                nodeSystemIdSet.has(row.nodeSystemId) &&
                (filters === undefined ||
                  matchesEntityFilters(
                    row as unknown as Record<string, unknown>,
                    filters,
                  )),
            })
            .map(r => ({...r.effective, fileSystemId}))
        : this.filterPorts(basePorts, filters);

    const cpIds = overlaidPorts.map(p => p.systemId);
    const intents = await this.intentFetcher.fetchMany(
      cpIds,
      nodeSystemIds,
      sessionId,
    );

    return overlaidPorts.map(cp => ({
      ...cp,
      intents: intents.filter(i => i.controlPortSystemId === cp.systemId),
    }));
  }

  private filterPorts<T>(
    ports: T[],
    filters: Record<string, unknown> | undefined,
  ): T[] {
    return filters === undefined
      ? ports
      : ports.filter(port =>
          matchesEntityFilters(
            port as unknown as Record<string, unknown>,
            filters,
          ),
        );
  }
}
