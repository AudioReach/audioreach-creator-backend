/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION, PORT_IO_TYPE} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {DataPortBase} from '../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {
  ControlPortBase,
  IntentBase,
} from '../entity-schema/usecase-data/node/control-port.js';

export interface OverlaidDataPort extends DataPortBase {
  fileSystemId: number;
}

export interface OverlaidControlPort extends ControlPortBase {
  fileSystemId: number;
  intents: IntentBase[];
}

export class PortOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDataPort[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.DataPort)
      .createQueryBuilder('dp')
      .where('dp.nodeSystemId = :nodeSystemId', {nodeSystemId})
      .getMany()) as unknown as DataPortBase[];

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

    // Apply UPDATE/DELETE overlay to committed ports
    const overlayBase = base.map(dp => ({...dp}));
    const nonCreateDpActions = dpActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(overlayBase, nonCreateDpActions)
      .map(r => r.effective as OverlaidDataPort);

    // Handle CREATE actions separately — overlay doesn't inject systemId from targetSystemId
    const baseIds = new Set(base.map(p => p.systemId));
    const created: OverlaidDataPort[] = dpActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload = a.newValue as Partial<OverlaidDataPort>;
        return {
          systemId: a.targetSystemId,
          dataPortId: payload.dataPortId ?? 0,
          portIoType: payload.portIoType ?? PORT_IO_TYPE.Input,
          isStatic: Boolean(payload.isStatic),
          nodeSystemId: payload.nodeSystemId ?? nodeSystemId,
          fileSystemId: payload.fileSystemId ?? fileSystemId,
          name: payload.name,
        };
      });

    return [...overlaid, ...created];
  }

  async fetchControlPortsWithIntents(
    nodeSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidControlPort[]> {
    const basePortRows = (await this.manager
      .getRepository(ENTITY_NAMES.ControlPort)
      .createQueryBuilder('cp')
      .where('cp.nodeSystemId = :nodeSystemId', {nodeSystemId})
      .getMany()) as unknown as ControlPortBase[];

    const basePorts = basePortRows.map(r => ({
      ...r,
      isStatic: Boolean(r.isStatic),
      fileSystemId,
    }));

    // Load base intents for all control ports
    let baseIntents: IntentBase[] = [];
    if (basePorts.length > 0) {
      const cpIds = basePorts.map(p => p.systemId);
      const intentRows = (await this.manager
        .getRepository(ENTITY_NAMES.Intent)
        .createQueryBuilder('i')
        .where('i.controlPortSystemId IN (:...cpIds)', {cpIds})
        .getMany()) as unknown as IntentBase[];
      baseIntents = intentRows;
    }

    if (sessionId === null) {
      return basePorts.map(cp => ({
        ...cp,
        intents: baseIntents.filter(i => i.controlPortSystemId === cp.systemId),
      }));
    }

    const allActions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      nodeSystemId,
    );
    const cpActions = allActions.filter(
      a => a.targetTable === ENTITY_NAMES.ControlPort,
    );
    const intentActions = allActions.filter(
      a => a.targetTable === ENTITY_NAMES.Intent,
    );

    // Apply UPDATE/DELETE overlay to committed ports
    const overlayBase = basePorts.map(cp => ({...cp}));
    const nonCreateCpActions = cpActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaidExisting = this.overlay
      .applyToCollection(overlayBase, nonCreateCpActions)
      .map(r => r.effective as (typeof basePorts)[0]);

    // Handle CREATE'd control ports separately
    const baseIds = new Set(basePorts.map(p => p.systemId));
    const createdPorts = cpActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload = a.newValue as Partial<(typeof basePorts)[0]>;
        return {
          systemId: a.targetSystemId,
          portId: payload.portId ?? 0,
          isStatic: Boolean(payload.isStatic),
          nodeSystemId: payload.nodeSystemId ?? nodeSystemId,
          fileSystemId: payload.fileSystemId ?? fileSystemId,
          name: payload.name,
        };
      });

    const allSurvivingPorts = [...overlaidExisting, ...createdPorts];

    // For each surviving control port, compute its overlaid intents
    return allSurvivingPorts.map(cp => {
      const basePortIntents = baseIntents.filter(
        i => i.controlPortSystemId === cp.systemId,
      );

      const intents = this.overlay
        .applyToCollection<IntentBase>(
          basePortIntents,
          intentActions,
          newValue =>
            (newValue as {controlPortSystemId?: number}).controlPortSystemId ===
            cp.systemId,
        )
        .map(r => r.effective);

      return {...cp, intents};
    });
  }
}
