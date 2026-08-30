/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  CkvParameterPayloadBase,
  CkvParameterPayloadRow,
} from '../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

export type {CkvParameterPayloadBase} from '../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';

/**
 * Optional column-level filters for CkvParameterPayload queries.
 * Fields map to CkvParameterPayloadBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type CkvParameterPayloadFilters = {
  systemId?: number | number[];
  parameterSystemId?: number | number[];
  ckvSystemId?: number | number[];
  $or?: CkvParameterPayloadFilters[];
};

/**
 * Fetches ckv_parameter_payload rows for a given Ckv with session overlay applied.
 *
 * Separated from CkvOverlayFetcher per §6 Rule A: CkvParameterPayload has a direct FK
 * to Ckv and therefore owns its own overlay fetcher injected into the parent.
 *
 * aggregateId for all CkvParameterPayload edit_actions is moduleSystemId (the owning
 * SpfModule's PK). A single getByAggregateId call per fetchMany covers all payload
 * actions for the module.
 */
export class CkvParameterPayloadFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid CkvParameterPayload rows for the given ckvSystemId.
   * Optional column-level filters applied to both the SQL query and session-created
   * rows via createFilter so both paths enforce the same predicate.
   * aggregateId = moduleSystemId — payload edit_actions are scoped to the owning SpfModule.
   */
  async fetchMany(
    ckvSystemId: number,
    moduleSystemId: number,
    sessionId: number | null,
    filters?: CkvParameterPayloadFilters,
  ): Promise<CkvParameterPayloadBase[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.ckvSystemId = :ckvSystemId', {ckvSystemId});
    if (filters) applyEntityFilters(qb, 'payload', filters);
    const baseRows = (await qb.getMany()) as CkvParameterPayloadRow[];

    if (sessionId === null) return baseRows.map(r => this.toBase(r));

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );
    const payloadActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.CkvParameterPayload,
    );
    if (payloadActions.length === 0) return baseRows.map(r => this.toBase(r));

    const createFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    return this.overlay
      .applyToCollection(
        baseRows.map(r => this.toBase(r)),
        payloadActions,
        createFilter,
      )
      .map(r => r.effective);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private toBase(row: CkvParameterPayloadRow): CkvParameterPayloadBase {
    return {
      systemId: row.systemId,
      ckvSystemId: row.ckvSystemId,
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }
}
