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

/**
 * Overlaid scalar fields from spf_module_parameter_definitions.
 * Binary payload relations (ckvParameterPayloads, tkvParameterPayloads) are
 * excluded — they are loaded on demand via separate queries, not as part of
 * the definition aggregate overlay.
 */
export interface OverlaidParameterDefinition {
  systemId: number;
  paramId: number;
  name: string | undefined;
  description: string | undefined;
  maxSize: number;
  pidType: string;
  isPersistent: boolean;
  elementsStructure: string;
  isReadOnly: boolean;
  toolPolicies: string | undefined;
  spfModuleDefinitionSystemId: number;
}

interface ParameterDefinitionBase {
  systemId: number;
  paramId: number;
  name?: string;
  description?: string;
  maxSize: number;
  pidType: string;
  isPersistent: boolean;
  elementsStructure: string;
  isReadOnly: boolean;
  toolPolicies?: string;
  spfModuleDefinitionSystemId: number;
}

/**
 * Fetches spf_module_parameter_definitions for one or many SpfModuleDefinitions
 * with session edit_actions overlay applied.
 *
 * Existence of these rows is determined by the SpfModuleDefinition root —
 * callers must verify the root exists (via SpfModuleDefinitionFetcher.fetchOne)
 * before invoking this fetcher (FR-8 Rule 1).
 *
 * Two entry points:
 *   fetchForDefinition  — single definition; one base query + one edit_actions query
 *   fetchForDefinitions — bulk; IN (...) base query + getByTable for edit_actions
 *                         returns Map<defSystemId, rows> for efficient assembly
 */
export class SpfModuleParameterDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Loads overlaid parameter definitions for a single SpfModuleDefinition.
   * Used by getDefinition and getParameterDefinition (single-entity paths).
   */
  /**
   * Returns a single overlaid parameter definition by its system ID.
   *
   * Resolves the owning definition's system ID from the base row, then
   * delegates overlay to fetchForDefinition and filters in memory (FR-3).
   *
   * Returns null if the base row does not exist. Session-only CREATE parameters
   * (no baseline row) are not resolvable via this method — the same limitation
   * as the previous direct-query implementation.
   */
  async fetchOne(
    paramSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidParameterDefinition | null> {
    // Step 1 — minimal base row query to resolve the owning definition ID.
    // This FK is set at import time and does not change in a session.
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('param')
      .select(['param.systemId', 'param.spfModuleDefinitionSystemId'])
      .where('param.systemId = :paramSystemId', {paramSystemId})
      .getOne()) as {
      systemId: number;
      spfModuleDefinitionSystemId: number;
    } | null;

    if (baseRow === null) return null;

    // Step 2 — fetch all parameters for the owning definition with overlay,
    // then filter to the requested parameter in memory (FR-3).
    const allParams = await this.fetchForDefinition(
      baseRow.spfModuleDefinitionSystemId,
      sessionId,
    );
    return allParams.find(p => p.systemId === paramSystemId) ?? null;
  }

  /**
   * Loads overlaid parameter definitions for a single SpfModuleDefinition.
   * Used by getDefinition and queryParameterDefinitions (single-entity paths).
   */
  async fetchForDefinition(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidParameterDefinition[]> {
    const baseRows = await this.loadBaseRows([defSystemId]);

    if (sessionId === null) return this.toOverlaid(baseRows);

    // Parameters share the definition's aggregateId — one call covers all params
    // for this definition.
    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const paramActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.SpfModuleParameterDefinition,
    );

    return this.applyOverlay(
      this.toOverlaid(baseRows),
      paramActions,
      defSystemId,
    );
  }

  /**
   * Loads overlaid parameter definitions for multiple SpfModuleDefinitions in
   * one base query. Session overlay uses getByTable (one call for the whole
   * session table) rather than N getByAggregateId calls — consistent with
   * the batch pattern used by ContainerOverlayFetcher and SubgraphOverlayFetcher.
   *
   * Returns Map<defSystemId, OverlaidParameterDefinition[]> so callers can
   * look up parameters by definition without a second pass.
   */
  async fetchForDefinitions(
    defSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, OverlaidParameterDefinition[]>> {
    if (defSystemIds.length === 0) return new Map();

    const baseRows = await this.loadBaseRows(defSystemIds);
    const overlaidRows =
      sessionId === null
        ? this.toOverlaid(baseRows)
        : await this.applyTableOverlay(baseRows, sessionId, defSystemIds);

    // Group by definition system ID for O(1) lookup by callers.
    const result = new Map<number, OverlaidParameterDefinition[]>();
    for (const row of overlaidRows) {
      const bucket = result.get(row.spfModuleDefinitionSystemId) ?? [];
      bucket.push(row);
      result.set(row.spfModuleDefinitionSystemId, bucket);
    }
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadBaseRows(
    defSystemIds: number[],
  ): Promise<ParameterDefinitionBase[]> {
    return (await this.manager
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('param')
      .select([
        'param.systemId',
        'param.paramId',
        'param.name',
        'param.description',
        'param.maxSize',
        'param.pidType',
        'param.isPersistent',
        'param.elementsStructure',
        'param.isReadOnly',
        'param.toolPolicies',
        'param.spfModuleDefinitionSystemId',
      ])
      .where('param.spfModuleDefinitionSystemId IN (:...defSystemIds)', {
        defSystemIds,
      })
      .getMany()) as unknown as ParameterDefinitionBase[];
  }

  private toOverlaid(
    rows: ParameterDefinitionBase[],
  ): OverlaidParameterDefinition[] {
    return rows.map(r => ({
      systemId: r.systemId,
      paramId: r.paramId,
      name: r.name,
      description: r.description,
      maxSize: r.maxSize,
      pidType: r.pidType,
      isPersistent: Boolean(r.isPersistent),
      elementsStructure: r.elementsStructure ?? '',
      isReadOnly: Boolean(r.isReadOnly),
      toolPolicies: r.toolPolicies,
      spfModuleDefinitionSystemId: r.spfModuleDefinitionSystemId,
    }));
  }

  /**
   * Applies session overlay for a single definition's parameters.
   * Called by fetchForDefinition.
   */
  private applyOverlay(
    base: OverlaidParameterDefinition[],
    paramActions: EditActionRow[],
    defSystemId: number,
  ): OverlaidParameterDefinition[] {
    const overlaid = this.overlay
      .applyToCollection(
        base.map(r => ({...r})),
        paramActions,
      )
      .map(r => r.effective as OverlaidParameterDefinition);

    const baseIds = new Set(base.map(r => r.systemId));
    const created: OverlaidParameterDefinition[] = paramActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<OverlaidParameterDefinition>;
        return {
          systemId: a.targetSystemId,
          paramId: p.paramId ?? 0,
          name: p.name,
          description: p.description,
          maxSize: p.maxSize ?? 0,
          pidType: p.pidType ?? '',
          isPersistent: Boolean(p.isPersistent),
          elementsStructure: p.elementsStructure ?? '',
          isReadOnly: Boolean(p.isReadOnly),
          toolPolicies: p.toolPolicies,
          spfModuleDefinitionSystemId:
            p.spfModuleDefinitionSystemId ?? defSystemId,
        };
      });

    return [...overlaid, ...created];
  }

  /**
   * Applies session overlay for a bulk fetch using getByTable.
   * More efficient than N getByAggregateId calls when loading many definitions.
   */
  private async applyTableOverlay(
    baseRows: ParameterDefinitionBase[],
    sessionId: number,
    defSystemIds: number[],
  ): Promise<OverlaidParameterDefinition[]> {
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.SpfModuleParameterDefinition,
    );

    // Filter to only actions belonging to the requested definitions.
    const defIdSet = new Set(defSystemIds);
    const relevantActions = allActions.filter(a => defIdSet.has(a.aggregateId));

    const base = this.toOverlaid(baseRows);
    const overlaid = this.overlay
      .applyToCollection(
        base.map(r => ({...r})),
        relevantActions,
      )
      .map(r => r.effective as OverlaidParameterDefinition);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: OverlaidParameterDefinition[] = relevantActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<OverlaidParameterDefinition>;
        return {
          systemId: a.targetSystemId,
          paramId: p.paramId ?? 0,
          name: p.name,
          description: p.description,
          maxSize: p.maxSize ?? 0,
          pidType: p.pidType ?? '',
          isPersistent: Boolean(p.isPersistent),
          elementsStructure: p.elementsStructure ?? '',
          isReadOnly: Boolean(p.isReadOnly),
          toolPolicies: p.toolPolicies,
          spfModuleDefinitionSystemId: p.spfModuleDefinitionSystemId ?? 0,
        };
      });

    return [...overlaid, ...created];
  }
}
