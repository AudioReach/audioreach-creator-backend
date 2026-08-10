/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import {applyTableOverlay} from '../queries/edit-session/overlay-utils.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
} from '../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';

export interface OverlaidCkvValues {
  ckvSystemId: number;
  valueDefSystemId: number;
}

/**
 * Overlaid Ckv root row with its ckv_values join-table entries.
 *
 * ckv_values uses a composite PK (ckvSystemId + valueDefSystemId) so it
 * cannot be overlaid with applyToCollection — the values array is always
 * the baseline data unchanged.
 */
export interface OverlaidCkv {
  systemId: number;
  spfModuleSystemId: number;
  uiPersistence: Uint8Array | null;
  /** Baseline key-value association rows — NOT overlaid (composite PK). */
  values: OverlaidCkvValues[];
}

export interface OverlaidCkvParameterPayload {
  systemId: number;
  ckvSystemId: number;
  parameterSystemId: number;
  payload: Uint8Array | null;
}

/**
 * Fetches ckv and ckv_parameter_payload rows for the SpfModule aggregate
 * with session overlay applied (FR-3).
 *
 * The aggregateId for all Ckv edit_actions is moduleSystemId (the owning
 * SpfModule's PK), not ckvSystemId. A single getByAggregateId call per
 * public method covers all Ckv and CkvParameterPayload actions for the module.
 *
 * ckv_values uses a composite PK and is never staged in edit_actions — it is
 * loaded from the baseline only and included unchanged in OverlaidCkv.values.
 */
export class CkvOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all overlaid Ckv rows for the given SpfModule.
   * Loads ckv_values via JOIN (baseline only — composite PK, not overlaid).
   * Session overlay uses moduleSystemId as aggregateId — all Ckv actions for
   * the module are loaded in one getByAggregateId call then split by Ckv.
   */
  async fetchForModule(
    moduleSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidCkv[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'ckvValues')
      .where('ckv.spfModuleSystemId = :id', {id: moduleSystemId})
      .getMany()) as CkvRow[];

    if (sessionId === null) return baseRows.map(r => this.toOverlaidCkv(r));

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );
    const ckvActions = actions.filter(a => a.targetTable === ENTITY_NAMES.Ckv);

    if (ckvActions.length === 0)
      return baseRows.map(r => this.toOverlaidCkv(r));

    const updateDeleteCkvActions = ckvActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = (
      this.overlay.applyToCollection(
        baseRows,
        updateDeleteCkvActions,
      ) as Array<{
        effective: CkvRow;
      }>
    ).map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: CkvRow[] = ckvActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<CkvRow>;
        return {
          systemId: a.targetSystemId,
          spfModuleSystemId: p.spfModuleSystemId ?? moduleSystemId,
          uiPersistence: null,
          values: [],
          payloadCollection: [],
        } as unknown as CkvRow;
      });

    return [...overlaid, ...created].map(r => this.toOverlaidCkv(r));
  }

  /**
   * Returns the overlaid Ckv row for the given ckvSystemId, or null if the
   * row was deleted in the session or does not exist.
   *
   * Loads ckv_values via JOIN (baseline only — composite PK prevents overlay).
   * Session overlay is applied to the ckv root row using the module's
   * aggregateId so cascaded session operations on the parent module are
   * reflected.
   */
  async fetchCkv(
    ckvSystemId: number,
    moduleSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidCkv | null> {
    // Load base Ckv row + its ckv_values join entries.
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'ckvValues')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne()) as CkvRow | null;

    if (sessionId === null) {
      return baseRow ? this.toOverlaidCkv(baseRow) : null;
    }

    // aggregateId = moduleSystemId — Ckv edit_actions are scoped to the
    // parent SpfModule, not to the individual Ckv row.
    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );
    const ckvAction =
      actions.find(
        a =>
          a.targetTable === ENTITY_NAMES.Ckv &&
          a.targetSystemId === ckvSystemId,
      ) ?? null;

    const overlaid = applyTableOverlay(
      baseRow as unknown as {systemId: number} | null,
      ckvAction ? [ckvAction] : [],
      ENTITY_NAMES.Ckv,
    ) as CkvRow | null;

    if (overlaid === null) return null;

    // Preserve the original ckv_values from the base row — they are not
    // overlaid (composite PK).
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
   * Optionally filtered to a specific set of parameter system IDs.
   *
   * Session overlay uses the module's aggregateId (same as fetchOne) so a
   * single getByAggregateId call covers both Ckv and payload actions.
   */
  async fetchCkvPayloads(
    ckvSystemId: number,
    moduleSystemId: number,
    sessionId: number | null,
    paramSystemIds?: number[],
  ): Promise<OverlaidCkvParameterPayload[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.ckvSystemId = :ckvSystemId', {ckvSystemId});
    if (paramSystemIds && paramSystemIds.length > 0) {
      qb.andWhere('payload.systemId IN (:...ids)', {
        ids: paramSystemIds,
      });
    }
    const basePayloads = (await qb.getMany()) as CkvParameterPayloadRow[];

    if (sessionId === null) {
      return basePayloads.map(p => this.toOverlaidPayload(p));
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );
    const payloadActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.CkvParameterPayload,
    );

    if (payloadActions.length === 0) {
      return basePayloads.map(p => this.toOverlaidPayload(p));
    }

    const base = basePayloads.map(p => this.toOverlaidPayload(p));
    const updateDeleteActions = payloadActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(
        base.map(r => ({...r})),
        updateDeleteActions,
      )
      .map(r => r.effective as OverlaidCkvParameterPayload);

    // Append CREATE'd payloads not in the baseline.
    const baseIds = new Set(basePayloads.map(p => p.systemId));
    const created: OverlaidCkvParameterPayload[] = payloadActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<OverlaidCkvParameterPayload>;
        return {
          systemId: a.targetSystemId,
          ckvSystemId: p.ckvSystemId ?? ckvSystemId,
          parameterSystemId: p.parameterSystemId ?? 0,
          payload: p.payload ?? null,
        };
      });

    const all = [...overlaid, ...created];

    // Apply the original paramSystemIds filter after overlay (session-created
    // payloads may not have been in the base query result).
    return paramSystemIds
      ? all.filter(p => paramSystemIds.includes(p.systemId))
      : all;
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

  private toOverlaidPayload(
    row: CkvParameterPayloadRow,
  ): OverlaidCkvParameterPayload {
    return {
      systemId: row.systemId,
      ckvSystemId: row.ckvSystemId,
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }
}
