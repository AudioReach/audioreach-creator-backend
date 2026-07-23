/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {PortIoType} from '@arc/core';
import {CHANGE_OPERATION, PORT_IO_TYPE} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {DataPortBase} from '../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {
  ControlPortBase,
  IntentBase,
} from '../entity-schema/usecase-data/node/control-port.js';

// Query-ready superset types — all DB columns included for future query-side migration.
export interface OverlaidDataPort {
  systemId: number;
  dataPortId: number;
  portIoType: PortIoType;
  isStatic: boolean;
  nodeSystemId: number;
  fileSystemId: number;
  name: string | null;
}

export interface OverlaidIntent {
  systemId: number;
  controlPortSystemId: number;
  intentId: number; // intent TYPE id — needed for FR-CPCA-01 CurrentUsage computation
}

export interface OverlaidControlPort {
  systemId: number;
  portId: number;
  isStatic: boolean;
  nodeSystemId: number;
  fileSystemId: number;
  name: string | null;
  intents: OverlaidIntent[];
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
      .select([
        'dp.systemId',
        'dp.dataPortId',
        'dp.portIoType',
        'dp.isStatic',
        'dp.nodeSystemId',
        'dp.name',
      ])
      .where('dp.nodeSystemId = :nodeSystemId', {nodeSystemId})
      .getMany()) as unknown as DataPortBase[];

    const base: OverlaidDataPort[] = baseRows.map(r => ({
      systemId: r.systemId,
      dataPortId: r.dataPortId,
      portIoType: r.portIoType,
      isStatic: Boolean(r.isStatic),
      nodeSystemId: r.nodeSystemId,
      fileSystemId,
      name: r.name ?? null,
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
    const overlaid = this.overlay
      .applyToCollection(overlayBase, dpActions)
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
          name: payload.name ?? null,
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
      .select([
        'cp.systemId',
        'cp.portId',
        'cp.isStatic',
        'cp.nodeSystemId',
        'cp.name',
      ])
      .where('cp.nodeSystemId = :nodeSystemId', {nodeSystemId})
      .getMany()) as unknown as ControlPortBase[];

    const basePorts = basePortRows.map(r => ({
      systemId: r.systemId,
      portId: r.portId,
      isStatic: Boolean(r.isStatic),
      nodeSystemId: r.nodeSystemId,
      fileSystemId,
      name: r.name ?? null,
    }));

    // Load base intents for all control ports
    let baseIntents: IntentBase[] = [];
    if (basePorts.length > 0) {
      const cpIds = basePorts.map(p => p.systemId);
      const intentRows = (await this.manager
        .getRepository(ENTITY_NAMES.Intent)
        .createQueryBuilder('i')
        .select(['i.systemId', 'i.controlPortSystemId', 'i.intentId'])
        .where('i.controlPortSystemId IN (:...cpIds)', {cpIds})
        .getMany()) as unknown as IntentBase[];
      baseIntents = intentRows;
    }

    if (sessionId === null) {
      return basePorts.map(cp => ({
        ...cp,
        intents: baseIntents
          .filter(i => i.controlPortSystemId === cp.systemId)
          .map(i => ({
            systemId: i.systemId,
            controlPortSystemId: i.controlPortSystemId,
            intentId: i.intentId,
          })),
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
    const overlaidExisting = this.overlay
      .applyToCollection(overlayBase, cpActions)
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
          name: payload.name ?? null,
        };
      });

    const allSurvivingPorts = [...overlaidExisting, ...createdPorts];

    // For each surviving control port, compute its overlaid intents
    return allSurvivingPorts.map(cp => {
      const basePortIntents = baseIntents.filter(
        i => i.controlPortSystemId === cp.systemId,
      );
      const cpIntentActions = intentActions.filter(a => {
        if (a.operation === CHANGE_OPERATION.Delete) {
          // A DELETE applies to this port if the targeted intent is either:
          // (a) a committed base intent for this port, OR
          // (b) a staged (CREATE) intent for this port in the same session —
          //     without this check, "create intent then delete it" in one session
          //     would leave the created intent visible because basePortIntents is empty.
          const isBaseIntent = basePortIntents.some(
            i => i.systemId === a.targetSystemId,
          );
          const isStagedIntent = intentActions.some(
            x =>
              x.operation === CHANGE_OPERATION.Create &&
              x.targetSystemId === a.targetSystemId &&
              (x.newValue as {controlPortSystemId?: number})
                ?.controlPortSystemId === cp.systemId,
          );
          return isBaseIntent || isStagedIntent;
        }
        const payload = a.newValue as {controlPortSystemId?: number} | null;
        return payload?.controlPortSystemId === cp.systemId;
      });

      const deletedIntentIds = new Set(
        cpIntentActions
          .filter(a => a.operation === CHANGE_OPERATION.Delete)
          .map(a => a.targetSystemId),
      );
      const createdIntents: OverlaidIntent[] = cpIntentActions
        .filter(a => a.operation === CHANGE_OPERATION.Create)
        .map(a => {
          const payload = a.newValue as {
            controlPortSystemId?: number;
            intentId?: number;
          };
          return {
            systemId: a.targetSystemId,
            controlPortSystemId: payload?.controlPortSystemId ?? cp.systemId,
            intentId: payload?.intentId ?? 0,
          };
        });

      const survivingBase = basePortIntents
        .filter(i => !deletedIntentIds.has(i.systemId))
        .map(i => ({
          systemId: i.systemId,
          controlPortSystemId: i.controlPortSystemId,
          intentId: i.intentId,
        }));

      return {
        ...cp,
        intents: [...survivingBase, ...createdIntents],
      };
    });
  }
}
