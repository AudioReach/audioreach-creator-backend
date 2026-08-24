/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../../../entity-schema/edit-session/edit-action.schema.js';

interface DriverModuleParameterDefinitionBase {
  systemId: number;
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string;
  driverModuleDefinitionSystemId: number;
}

export interface OverlaidDriverModuleParameterDefinition {
  systemId: number;
  parameterId: number;
  name: string | undefined;
  description: string | undefined;
  maxSize: number;
  paramStructure: string;
  driverModuleDefinitionSystemId: number;
}

/**
 * Fetches driver_module_parameter_definitions with session overlay applied.
 *
 * Parameters are directly-owned children of DriverModuleDefinition — their
 * aggregateId in edit_actions equals driverModuleDefinitionSystemId (the
 * owning definition's PK).
 *
 * Two entry points:
 *   fetchForDefinition  — single definition; one base query + getByAggregateId
 *   fetchForDefinitions — bulk; IN (...) base query + getByTable
 *                         returns Map<defSystemId, rows[]> for list assembly
 */
export class DriverModuleParameterDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Loads overlaid parameters for a single driver module definition.
   * Used by getDriverModuleDefinition (single-entity path).
   */
  async fetchForDefinition(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDriverModuleParameterDefinition[]> {
    const baseRows = await this.loadBaseRows([defSystemId]);
    if (sessionId === null) return this.toOverlaid(baseRows);

    // aggregateId = defSystemId — one call covers all params for this definition.
    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const paramActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.DriverModuleParameterDefinition,
    );

    return this.applyOverlay(
      this.toOverlaid(baseRows),
      paramActions,
      defSystemId,
    );
  }

  /**
   * Loads overlaid parameters for multiple driver module definitions in one
   * base query. Returns Map<defSystemId, rows[]> for O(1) lookup during
   * list assembly — consistent with SpfModuleParameterDefinitionFetcher.
   */
  async fetchForDefinitions(
    defSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, OverlaidDriverModuleParameterDefinition[]>> {
    if (defSystemIds.length === 0) return new Map();

    const baseRows = await this.loadBaseRows(defSystemIds);
    const overlaidRows =
      sessionId === null
        ? this.toOverlaid(baseRows)
        : await this.applyTableOverlay(baseRows, sessionId, defSystemIds);

    const result = new Map<number, OverlaidDriverModuleParameterDefinition[]>();
    for (const row of overlaidRows) {
      const bucket = result.get(row.driverModuleDefinitionSystemId) ?? [];
      bucket.push(row);
      result.set(row.driverModuleDefinitionSystemId, bucket);
    }
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadBaseRows(
    defSystemIds: number[],
  ): Promise<DriverModuleParameterDefinitionBase[]> {
    return (await this.manager
      .getRepository(ENTITY_NAMES.DriverModuleParameterDefinition)
      .createQueryBuilder('param')
      .select([
        'param.systemId',
        'param.parameterId',
        'param.name',
        'param.description',
        'param.maxSize',
        'param.paramStructure',
        'param.driverModuleDefinitionSystemId',
      ])
      .where('param.driverModuleDefinitionSystemId IN (:...defSystemIds)', {
        defSystemIds,
      })
      .getMany()) as unknown as DriverModuleParameterDefinitionBase[];
  }

  private toOverlaid(
    rows: DriverModuleParameterDefinitionBase[],
  ): OverlaidDriverModuleParameterDefinition[] {
    return rows.map(r => ({
      systemId: r.systemId,
      parameterId: r.parameterId,
      name: r.name,
      description: r.description,
      maxSize: r.maxSize,
      paramStructure: r.paramStructure,
      driverModuleDefinitionSystemId: r.driverModuleDefinitionSystemId,
    }));
  }

  private applyOverlay(
    base: OverlaidDriverModuleParameterDefinition[],
    actions: EditActionRow[],
    defSystemId: number,
  ): OverlaidDriverModuleParameterDefinition[] {
    const overlaid = this.overlay
      .applyToCollection(
        base.map(r => ({...r})),
        actions,
      )
      .map(r => r.effective as OverlaidDriverModuleParameterDefinition);

    const baseIds = new Set(base.map(r => r.systemId));
    const created: OverlaidDriverModuleParameterDefinition[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p =
          a.newValue as Partial<OverlaidDriverModuleParameterDefinition>;
        return {
          systemId: a.targetSystemId,
          parameterId: p.parameterId ?? 0,
          name: p.name,
          description: p.description,
          maxSize: p.maxSize ?? 0,
          paramStructure: p.paramStructure ?? '',
          driverModuleDefinitionSystemId:
            p.driverModuleDefinitionSystemId ?? defSystemId,
        };
      });

    return [...overlaid, ...created];
  }

  private async applyTableOverlay(
    baseRows: DriverModuleParameterDefinitionBase[],
    sessionId: number,
    defSystemIds: number[],
  ): Promise<OverlaidDriverModuleParameterDefinition[]> {
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.DriverModuleParameterDefinition,
    );
    const defIdSet = new Set(defSystemIds);
    // Filter to actions whose aggregateId belongs to the requested definitions.
    const relevantActions = allActions.filter(a => defIdSet.has(a.aggregateId));
    return this.applyOverlay(this.toOverlaid(baseRows), relevantActions, 0);
  }
}
