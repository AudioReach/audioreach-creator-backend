/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {StaticControlPortDefinitionBase} from '../../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import type {StaticIntentDefinitionBase} from '../../../entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/** Optional scalar filters for static control port definitions. */
export type StaticControlPortDefinitionFilters = {
  systemId?: number | number[];
  portId?: number | number[];
  portName?: string | string[];
  moduleDefinitionSystemId?: number | number[];
  $or?: StaticControlPortDefinitionFilters[];
};

export interface OverlaidStaticControlPortDefinition extends StaticControlPortDefinitionBase {
  /** Static intents owned by this port, with session overlay applied. */
  staticIntents: StaticIntentDefinitionBase[];
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

  async fetchMany(
    defSystemId: number,
    sessionId: number | null,
    filters?: StaticControlPortDefinitionFilters,
  ): Promise<OverlaidStaticControlPortDefinition[]> {
    // ── Step 1: load base static control port rows ───────────────────────────
    const portQb = this.manager
      .getRepository(ENTITY_NAMES.StaticControlPortDefinition)
      .createQueryBuilder('scpd')
      .where('scpd.moduleDefinitionSystemId = :defSystemId', {defSystemId});
    if (filters) applyEntityFilters(portQb, 'scpd', filters);
    const basePortRows =
      (await portQb.getMany()) as StaticControlPortDefinitionBase[];

    const base: OverlaidStaticControlPortDefinition[] = basePortRows.map(r => ({
      ...r,
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
        .where('sid.staticControlPortDefinitionSystemId IN (:...portIds)', {
          portIds,
        })
        .getMany()) as StaticIntentDefinitionBase[];
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
    const createPortFilter = (newValue: Record<string, unknown>) =>
      newValue.moduleDefinitionSystemId === defSystemId &&
      (filters === undefined || matchesEntityFilters(newValue, filters));

    // ── Step 4: overlay static control ports ─────────────────────────────────
    const allPorts = this.overlay
      .applyToCollection(
        base.map(p => ({...p})),
        portActions,
        createPortFilter,
      )
      .map(r => r.effective as OverlaidStaticControlPortDefinition);

    // ── Step 5: overlay static intent definitions ─────────────────────────────
    const allIntents = this.overlay
      .applyToCollection(
        baseIntentRows.map(i => ({...i})),
        intentActions,
        newValue => {
          const portId = newValue.staticControlPortDefinitionSystemId;
          return (
            typeof portId === 'number' &&
            allPorts.some(port => port.systemId === portId)
          );
        },
      )
      .map(r => r.effective as StaticIntentDefinitionBase);

    return this.buildResult(allPorts, allIntents);
  }

  /** Nests intents under their owning port by FK. */
  private buildResult(
    ports: OverlaidStaticControlPortDefinition[],
    allIntents: StaticIntentDefinitionBase[],
  ): OverlaidStaticControlPortDefinition[] {
    const intentsByPort = new Map<number, StaticIntentDefinitionBase[]>();
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
