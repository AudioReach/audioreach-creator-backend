/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import {applyTableOverlay} from '../queries/edit-session/overlay-utils.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  CkvBase,
  CkvRow,
  CkvValuesBase,
} from '../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import type {
  CkvParameterPayloadBase,
  CkvParameterPayloadFetcher,
  CkvParameterPayloadFilters,
} from './ckv-parameter-payload-fetcher.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

export type {
  CkvParameterPayloadBase,
  CkvParameterPayloadFilters,
} from './ckv-parameter-payload-fetcher.js';

/**
 * Optional column-level filters for Ckv queries.
 * Fields map to CkvBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type CkvFilters = {
  systemId?: number | number[];
  spfModuleSystemId?: number | number[];
  $or?: CkvFilters[];
};

/**
 * Overlaid Ckv row extending CkvBase (scalar columns only).
 * values is loaded via JOIN (baseline only — composite PK, not overlaid).
 */
export interface OverlaidCkv extends CkvBase {
  /** Baseline key-value association rows — NOT overlaid (composite PK). */
  values: CkvValuesBase[];
}

/**
 * Fetches ckv rows for the SpfModule aggregate with session overlay applied.
 *
 * Payload rows (ckv_parameter_payload) are delegated to the injected
 * CkvParameterPayloadFetcher per §6 Rule A — CkvParameterPayload has a direct
 * FK to Ckv and therefore owns its own overlay logic.
 *
 * The aggregateId for all Ckv edit_actions is moduleSystemId (the owning
 * SpfModule's PK), not ckvSystemId.
 *
 * ckv_values uses a composite PK and is never staged in edit_actions — it is
 * loaded from the baseline only and included unchanged in OverlaidCkv.values.
 */
export class CkvOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly payloadFetcher: CkvParameterPayloadFetcher,
  ) {}

  /**
   * Returns all overlaid Ckv rows for the given SpfModule.
   * Optional column-level filters (applied to SQL and to session-created rows
   * via createFilter so both paths enforce the same predicate).
   * Loads ckv_values via JOIN (baseline only — composite PK, not overlaid).
   * All Ckv actions (CREATE/UPDATE/DELETE) are passed together to applyToCollection.
   */
  async fetchMany(
    moduleSystemId: number,
    sessionId: number | null,
    filters?: CkvFilters,
  ): Promise<OverlaidCkv[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'ckvValues')
      .where('ckv.spfModuleSystemId = :id', {id: moduleSystemId});
    if (filters) applyEntityFilters(qb, 'ckv', filters);
    const baseRows = (await qb.getMany()) as CkvRow[];

    if (sessionId === null) return baseRows.map(r => this.toOverlaidCkv(r));

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );
    const ckvActions = actions.filter(a => a.targetTable === ENTITY_NAMES.Ckv);

    if (ckvActions.length === 0)
      return baseRows.map(r => this.toOverlaidCkv(r));

    const createFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    return this.overlay
      .applyToCollection(baseRows, ckvActions, createFilter)
      .map(r => this.toOverlaidCkv(r.effective));
  }

  /**
   * Returns the overlaid Ckv row for the given ckvSystemId, or null if the
   * row was deleted in the session or does not exist.
   *
   * Loads ckv_values via JOIN (baseline only — composite PK prevents overlay).
   * Derives moduleSystemId from the base row so callers do not need to provide it.
   * All Ckv actions for this specific ckvSystemId are collected via filter()
   * so a CREATE→UPDATE sequence is correctly applied.
   */
  async fetchOne(
    ckvSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidCkv | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'ckvValues')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne()) as CkvRow | null;

    if (sessionId === null) {
      return baseRow ? this.toOverlaidCkv(baseRow) : null;
    }

    // Derive moduleSystemId from the base row — Ckv edit_actions are scoped
    // to the parent SpfModule (aggregateId = spfModuleSystemId).
    // A null baseRow can still have a CREATE action; scan by targetSystemId instead.
    const moduleSystemId = baseRow?.spfModuleSystemId ?? null;
    const actions =
      moduleSystemId !== null
        ? await this.editActionsSvc.getByAggregateId(sessionId, moduleSystemId)
        : [];
    const ckvActions = actions.filter(
      a =>
        a.targetTable === ENTITY_NAMES.Ckv && a.targetSystemId === ckvSystemId,
    );

    const overlaid = applyTableOverlay(
      baseRow as {systemId: number} | null,
      ckvActions,
      ENTITY_NAMES.Ckv,
    ) as CkvRow | null;

    if (overlaid === null) return null;

    return {
      ...this.toOverlaidCkv(overlaid),
      values: (baseRow?.values ?? []).map(v => ({
        ckvSystemId: v.ckvSystemId,
        valueDefSystemId: v.valueDefSystemId,
      })),
    };
  }

  /**
   * Returns overlaid CkvParameterPayload rows for the given ckvSystemId.
   * Optional column-level filters are forwarded to CkvParameterPayloadFetcher.
   * Delegates entirely to the injected CkvParameterPayloadFetcher.
   */
  async fetchPayloads(
    ckvSystemId: number,
    moduleSystemId: number,
    sessionId: number | null,
    filters?: CkvParameterPayloadFilters,
  ): Promise<CkvParameterPayloadBase[]> {
    return this.payloadFetcher.fetchMany(
      ckvSystemId,
      moduleSystemId,
      sessionId,
      filters,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private toOverlaidCkv(row: CkvRow): OverlaidCkv {
    return {
      systemId: row.systemId,
      spfModuleSystemId: row.spfModuleSystemId,
      uiPersistence: row.uiPersistence ?? null,
      values: (row.values ?? []).map(v => ({
        ckvSystemId: v.ckvSystemId,
        valueDefSystemId: v.valueDefSystemId,
      })),
    };
  }
}
