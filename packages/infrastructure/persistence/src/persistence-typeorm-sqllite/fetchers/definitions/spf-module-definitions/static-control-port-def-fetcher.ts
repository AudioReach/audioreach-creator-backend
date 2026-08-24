/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {StaticControlPortDefinitionBase} from '../../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';

interface StaticIntentDefinitionBase {
  systemId: number;
  intentId: number;
  name: string;
  staticControlPortDefinitionSystemId: number;
}

export interface OverlaidStaticIntentDefinition {
  systemId: number;
  intentId: number;
  name: string;
  /** FK back to the owning static control port definition. */
  staticControlPortDefinitionSystemId: number;
}

export interface OverlaidStaticControlPortDefinition {
  systemId: number;
  portId: number;
  portName: string;
  moduleDefinitionSystemId: number;
  /** Static intents owned by this port, with session overlay applied. */
  staticIntents: OverlaidStaticIntentDefinition[];
}

/**
 * Fetches static_control_port_definitions and their owned
 * static_intent_definitions for a given SpfModuleDefinition with session
 * edit_actions overlay applied.
 *
 * Both tables share the same aggregate root (defSystemId), so a single
 * getByAggregateId call loads all relevant edit_actions for this step.
 *
 * Existence of these rows is determined by the SpfModuleDefinition root —
 * callers must verify the root exists (via SpfModuleDefinitionFetcher) before
 * invoking this fetcher (FR-8 Rule 1).
 */
export class StaticControlPortDefFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchForDefinition(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidStaticControlPortDefinition[]> {
    // ── Step 1: load base static control port rows ───────────────────────────
    const basePortRows = (await this.manager
      .getRepository(ENTITY_NAMES.StaticControlPortDefinition)
      .createQueryBuilder('scpd')
      .select([
        'scpd.systemId',
        'scpd.portId',
        'scpd.portName',
        'scpd.moduleDefinitionSystemId',
      ])
      .where('scpd.moduleDefinitionSystemId = :defSystemId', {defSystemId})
      .getMany()) as unknown as StaticControlPortDefinitionBase[];

    const base: OverlaidStaticControlPortDefinition[] = basePortRows.map(r => ({
      systemId: r.systemId,
      portId: r.portId,
      portName: r.portName,
      moduleDefinitionSystemId: r.moduleDefinitionSystemId,
      staticIntents: [],
    }));

    // ── Step 2: load base intent rows scoped to loaded port IDs ──────────────
    // Intents are children of ports — load only after ports are known.
    let baseIntentRows: StaticIntentDefinitionBase[] = [];
    if (basePortRows.length > 0) {
      const portIds = basePortRows.map(p => p.systemId);
      baseIntentRows = (await this.manager
        .getRepository(ENTITY_NAMES.StaticIntentDefinition)
        .createQueryBuilder('sid')
        .select([
          'sid.systemId',
          'sid.intentId',
          'sid.name',
          'sid.staticControlPortDefinitionSystemId',
        ])
        .where('sid.staticControlPortDefinitionSystemId IN (:...portIds)', {
          portIds,
        })
        .getMany()) as unknown as StaticIntentDefinitionBase[];
    }

    if (sessionId === null) {
      return this.buildResult(base, baseIntentRows);
    }

    // ── Step 3: single edit_actions fetch for the whole definition aggregate ──
    // Both static_control_port_definitions and static_intent_definitions share
    // defSystemId as their aggregate root, so one getByAggregateId covers all.
    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const portActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.StaticControlPortDefinition,
    );
    const intentActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.StaticIntentDefinition,
    );

    // ── Step 4: overlay static control ports ─────────────────────────────────
    const overlaidPortRecords = this.overlay.applyToCollection(
      base.map(p => ({...p})),
      portActions,
    );
    const overlaidPorts = overlaidPortRecords.map(
      r => r.effective as OverlaidStaticControlPortDefinition,
    );

    const basePortIds = new Set(base.map(p => p.systemId));
    const createdPorts: OverlaidStaticControlPortDefinition[] = portActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !basePortIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload =
          a.newValue as Partial<OverlaidStaticControlPortDefinition>;
        return {
          systemId: a.targetSystemId,
          portId: payload.portId ?? 0,
          portName: payload.portName ?? '',
          moduleDefinitionSystemId:
            payload.moduleDefinitionSystemId ?? defSystemId,
          staticIntents: [],
        };
      });

    const allPorts = [...overlaidPorts, ...createdPorts];

    // ── Step 5: overlay static intent definitions ─────────────────────────────
    const baseIntents: OverlaidStaticIntentDefinition[] = baseIntentRows.map(
      r => ({
        systemId: r.systemId,
        intentId: r.intentId,
        name: r.name,
        staticControlPortDefinitionSystemId:
          r.staticControlPortDefinitionSystemId,
      }),
    );

    const overlaidIntentRecords = this.overlay.applyToCollection(
      baseIntents.map(i => ({...i})),
      intentActions,
    );
    const overlaidIntents = overlaidIntentRecords.map(
      r => r.effective as OverlaidStaticIntentDefinition,
    );

    const baseIntentIds = new Set(baseIntentRows.map(i => i.systemId));
    const createdIntents: OverlaidStaticIntentDefinition[] = intentActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIntentIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload = a.newValue as Partial<OverlaidStaticIntentDefinition>;
        return {
          systemId: a.targetSystemId,
          intentId: payload.intentId ?? 0,
          name: payload.name ?? '',
          staticControlPortDefinitionSystemId:
            payload.staticControlPortDefinitionSystemId ?? 0,
        };
      });

    return this.buildResult(allPorts, [...overlaidIntents, ...createdIntents]);
  }

  /** Nests intents under their owning port by FK. */
  private buildResult(
    ports: OverlaidStaticControlPortDefinition[],
    allIntents: OverlaidStaticIntentDefinition[],
  ): OverlaidStaticControlPortDefinition[] {
    const intentsByPort = new Map<number, OverlaidStaticIntentDefinition[]>();
    for (const intent of allIntents) {
      const existing =
        intentsByPort.get(intent.staticControlPortDefinitionSystemId) ?? [];
      existing.push(intent);
      intentsByPort.set(intent.staticControlPortDefinitionSystemId, existing);
    }
    return ports.map(p => ({
      ...p,
      staticIntents: intentsByPort.get(p.systemId) ?? [],
    }));
  }
}
