/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CONFIGURATION_INCLUDES} from '@arc/core';
import type {ConfigurationIncludes} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  ModuleTagIdMapBase,
  ModuleTagIdMapRow,
  TkvBase,
  TkvRow,
  TkvParameterPayloadBase,
  TkvValuesBase,
} from '../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {TkvParameterPayloadFetcher} from './tkv-parameter-payload-fetcher.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

/**
 * Optional column-level filters for ModuleTagIdMap queries.
 * Fields map to ModuleTagIdMapBase column names — all defined fields are ANDed.
 * Scalar → equality; array → IN.
 */
export type ModuleTagIdMapFilters = {
  systemId?: number | number[];
  spfModuleSystemId?: number | number[];
  tagDefinitionSystemId?: number | number[];
  $or?: ModuleTagIdMapFilters[];
};

/**
 * Overlaid Tkv row with its tkv_values join-table entries.
 * tkv_values uses a composite PK and is never overlaid — returned as baseline.
 */
export interface OverlaidTkv extends TkvBase {
  /** Baseline key-value association rows — NOT overlaid (composite PK). */
  values: TkvValuesBase[];
}

export interface OverlaidModuleTagIdMap extends ModuleTagIdMapBase {
  tkvs: OverlaidTkv[];
}

/**
 * Fetches module_tag_id_map and tkv rows for a SpfModule with session overlay applied.
 *
 * Payload rows (tkv_parameter_payload) are delegated to the injected
 * TkvParameterPayloadFetcher per §6 Rule A — TkvParameterPayload has a direct FK
 * to Tkv and therefore owns its own overlay logic.
 *
 * Two overlay levels:
 *   1. module_tag_id_map — aggregateId = moduleSystemId (SpfModule's PK)
 *   2. tkv              — aggregateId = moduleTagIdMapSystemId (the owning tag map's PK)
 *
 * Uses getByTable (one session-wide scan per table) instead of per-row
 * getByAggregateId to avoid the N+1 pattern.
 *
 * All three operations (CREATE/UPDATE/DELETE) are passed together to applyToCollection
 * at each level so a CREATE→UPDATE sequence is correctly applied.
 *
 * tkv_values uses a composite PK and is never staged in edit_actions — it is
 * always returned from the baseline only.
 */
export class TkvOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly payloadFetcher: TkvParameterPayloadFetcher,
  ) {}

  /**
   * Returns all overlaid ModuleTagIdMap rows for the given SpfModule, with
   * their Tkv children and tkv_values.
   *
   * Optional column-level filters applied to both the SQL query and session-created
   * rows via createFilter so both paths enforce the same predicate.
   *
   * When includes=FullDetails, tkv_parameter_payload rows are also loaded via
   * the base JOIN (binary data — payload overlay is handled by fetchPayloads).
   *
   * Two getByTable calls cover all tag map and TKV overlay actions regardless
   * of how many tag maps the module has.
   */
  async fetchMany(
    moduleSystemId: number,
    sessionId: number | null,
    includes: ConfigurationIncludes,
    filters?: ModuleTagIdMapFilters,
  ): Promise<OverlaidModuleTagIdMap[]> {
    let qb = this.manager
      .getRepository(ENTITY_NAMES.ModuleTagIdMap)
      .createQueryBuilder('tagMap')
      .leftJoinAndSelect('tagMap.tkvs', 'tkv')
      .leftJoinAndSelect('tkv.values', 'tkvValues')
      .where('tagMap.spfModuleSystemId = :id', {id: moduleSystemId});
    if (filters) applyEntityFilters(qb, 'tagMap', filters);

    if (includes === CONFIGURATION_INCLUDES.FullDetails) {
      qb = qb
        .leftJoinAndSelect('tkv.payloadCollection', 'payload')
        .leftJoinAndSelect('payload.spfParameter', 'param');
    }

    const baseTagMaps = (await qb.getMany()) as ModuleTagIdMapRow[];

    if (sessionId === null) {
      return baseTagMaps.map(r => this.toOverlaidTagMap(r));
    }

    // Two table-wide overlay scans instead of N per-row getByAggregateId calls.
    // tagMap actions use moduleSystemId as aggregateId.
    // tkv actions use moduleTagIdMapSystemId as aggregateId — getByTable
    // loads all TKV actions session-wide; we filter per tag map below.
    const [tagMapActions, tkvActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.ModuleTagIdMap),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Tkv),
    ]);

    // Filter tag map actions to this module only.
    const moduleTagMapIds = new Set(baseTagMaps.map(r => r.systemId));
    const relevantTagMapActions = tagMapActions.filter(
      a =>
        a.aggregateId === moduleSystemId ||
        moduleTagMapIds.has(a.targetSystemId),
    );

    const tagMapCreateFilter = filters
      ? (nv: Record<string, unknown>) => matchesEntityFilters(nv, filters)
      : undefined;

    const allTagMaps =
      relevantTagMapActions.length > 0
        ? (
            this.overlay.applyToCollection(
              baseTagMaps,
              relevantTagMapActions,
              tagMapCreateFilter,
            ) as Array<{effective: ModuleTagIdMapRow}>
          ).map(r => r.effective)
        : baseTagMaps;

    // For each tag map, apply TKV overlay using the pre-loaded tkvActions
    // filtered to this tag map's aggregateId (= moduleTagIdMapSystemId).
    return allTagMaps.map(tagMap => {
      const baseTkvs = tagMap.tkvs ?? [];
      const mapTkvActions = tkvActions.filter(
        a => a.aggregateId === tagMap.systemId,
      );

      const overlaidTkvs =
        mapTkvActions.length === 0
          ? baseTkvs
          : (
              this.overlay.applyToCollection(baseTkvs, mapTkvActions) as Array<{
                effective: TkvRow;
              }>
            ).map(r => r.effective);

      return {
        ...tagMap,
        tkvs: overlaidTkvs.map(tkv => ({...tkv, values: tkv.values ?? []})),
      };
    });
  }

  /**
   * Returns the overlaid Tkv row for the given tkvSystemId, scoped to
   * moduleTagIdMapSystemId (validates ownership).
   * Returns null if the row does not exist or was deleted in the active session.
   *
   * Overlay aggregateId = moduleTagIdMapSystemId (parent tag map's PK).
   */
  async fetchTkv(
    tkvSystemId: number,
    moduleTagIdMapSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidTkv | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.Tkv)
      .createQueryBuilder('tkv')
      .leftJoinAndSelect('tkv.values', 'tkvValues')
      .where('tkv.systemId = :tkvSystemId', {tkvSystemId})
      .andWhere('tkv.moduleTagIdMapSystemId = :moduleTagIdMapSystemId', {
        moduleTagIdMapSystemId,
      })
      .getOne()) as TkvRow | null;

    if (sessionId === null) {
      return baseRow ? this.toOverlaidTkv(baseRow) : null;
    }

    const tkvActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Tkv,
    );
    const relevantActions = tkvActions.filter(
      a =>
        a.aggregateId === moduleTagIdMapSystemId &&
        (a.targetSystemId === tkvSystemId ||
          (a.newValue as {systemId?: number})?.systemId === tkvSystemId),
    );

    if (relevantActions.length === 0) {
      return baseRow ? this.toOverlaidTkv(baseRow) : null;
    }

    const deleteAction = relevantActions.find(
      a =>
        a.operation === CHANGE_OPERATION.Delete &&
        a.targetSystemId === tkvSystemId,
    );
    if (deleteAction) return null;

    if (baseRow) {
      const updateActions = relevantActions.filter(
        a =>
          a.operation === CHANGE_OPERATION.Update &&
          a.targetSystemId === tkvSystemId,
      );
      const overlaid =
        updateActions.length > 0
          ? ((
              this.overlay.applyToCollection(
                [baseRow],
                updateActions,
              ) as Array<{effective: TkvRow}>
            )[0]?.effective ?? null)
          : baseRow;
      return overlaid ? this.toOverlaidTkv(overlaid) : null;
    }

    const createAction = relevantActions.find(
      a =>
        a.operation === CHANGE_OPERATION.Create &&
        a.targetSystemId === tkvSystemId,
    );
    if (createAction) {
      const p = createAction.newValue as Partial<TkvBase>;
      return {
        systemId: tkvSystemId,
        moduleTagIdMapSystemId:
          p.moduleTagIdMapSystemId ?? moduleTagIdMapSystemId,
        uiPersistence: null,
        values: [],
      };
    }

    return null;
  }

  /**
   * Returns overlaid TkvParameterPayload rows for the given TKV system ID.
   * Delegates entirely to the injected TkvParameterPayloadFetcher.
   */
  async fetchPayloads(
    tkvSystemId: number,
    sessionId: number | null,
  ): Promise<TkvParameterPayloadBase[]> {
    return this.payloadFetcher.fetchMany(tkvSystemId, sessionId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private toOverlaidTagMap(r: ModuleTagIdMapRow): OverlaidModuleTagIdMap {
    return {
      ...r,
      tkvs: (r.tkvs ?? []).map(tkv => ({...tkv, values: tkv.values ?? []})),
    };
  }

  private toOverlaidTkv(r: TkvRow): OverlaidTkv {
    return {...r, values: r.values ?? []};
  }
}
