/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION, CONFIGURATION_INCLUDES} from '@arc/core';
import type {ConfigurationIncludes} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvParameterPayloadRow,
} from '../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';

export interface OverlaidTkvValues {
  tkvSystemId: number;
  valueDefSystemId: number;
}

/**
 * Overlaid Tkv row with its tkv_values join-table entries.
 * tkv_values uses a composite PK and is never overlaid — returned as baseline.
 */
export interface OverlaidTkv {
  systemId: number;
  moduleTagIdMapSystemId: number;
  uiPersistence: Uint8Array | null;
  /** Baseline key-value association rows — NOT overlaid (composite PK). */
  values: OverlaidTkvValues[];
}

export interface OverlaidModuleTagIdMap {
  systemId: number;
  spfModuleSystemId: number;
  tagDefinitionSystemId: number;
  tkvs: OverlaidTkv[];
}

export interface OverlaidTkvParameterPayload {
  systemId: number;
  tkvSystemId: number;
  parameterSystemId: number;
  payload: Uint8Array | null;
}

/**
 * Fetches module_tag_id_map, tkv, and tkv_values for a SpfModule with session
 * overlay applied (FR-3).
 *
 * Two overlay levels:
 *   1. module_tag_id_map — aggregateId = moduleSystemId (SpfModule's PK)
 *   2. tkv              — aggregateId = moduleTagIdMapSystemId (the owning tag map's PK)
 *
 * Uses getByTable (one session-wide scan per table) instead of per-row
 * getByAggregateId — fixes the N+1 pattern in the original overlayTagMapRows
 * and overlayTkvRows methods (FR-5).
 *
 * tkv_values uses a composite PK and is never staged in edit_actions — it is
 * always returned from the baseline only.
 */
export class TkvOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all overlaid ModuleTagIdMap rows for the given SpfModule, with
   * their Tkv children and tkv_values.
   *
   * When includes=FullDetails, tkv_parameter_payload rows are also loaded
   * (binary data — not overlaid by this fetcher; payload overlay is
   * handled by fetchTkvPayloads separately).
   *
   * Two getByTable calls cover all tag map and TKV overlay actions regardless
   * of how many tag maps the module has.
   */
  async fetchForModule(
    moduleSystemId: number,
    sessionId: number | null,
    includes: ConfigurationIncludes,
  ): Promise<OverlaidModuleTagIdMap[]> {
    let qb = this.manager
      .getRepository(ENTITY_NAMES.ModuleTagIdMap)
      .createQueryBuilder('tagMap')
      .leftJoinAndSelect('tagMap.tkvs', 'tkv')
      .leftJoinAndSelect('tkv.values', 'tkvValues')
      .where('tagMap.spfModuleSystemId = :id', {id: moduleSystemId});

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

    const overlaidTagMaps =
      relevantTagMapActions.length > 0
        ? (
            this.overlay.applyToCollection(
              baseTagMaps,
              relevantTagMapActions,
            ) as Array<{effective: ModuleTagIdMapRow}>
          ).map(r => r.effective)
        : baseTagMaps;

    const baseTagMapIds = new Set(baseTagMaps.map(r => r.systemId));
    const createdTagMaps: ModuleTagIdMapRow[] = relevantTagMapActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseTagMapIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<ModuleTagIdMapRow>;
        return {
          systemId: a.targetSystemId,
          spfModuleSystemId: p.spfModuleSystemId ?? moduleSystemId,
          tagDefinitionSystemId: p.tagDefinitionSystemId ?? 0,
          tkvs: [],
        } as unknown as ModuleTagIdMapRow;
      });

    const allTagMaps = [...overlaidTagMaps, ...createdTagMaps];

    // For each tag map, apply TKV overlay using the pre-loaded tkvActions
    // filtered to this tag map's aggregateId (= moduleTagIdMapSystemId).
    return allTagMaps.map(tagMap => {
      const baseTkvs = tagMap.tkvs ?? [];
      const mapTkvActions = tkvActions.filter(
        a => a.aggregateId === tagMap.systemId,
      );

      let overlaidTkvs: TkvRow[];
      if (mapTkvActions.length === 0) {
        overlaidTkvs = baseTkvs;
      } else {
        const existing = (
          this.overlay.applyToCollection(baseTkvs, mapTkvActions) as Array<{
            effective: TkvRow;
          }>
        ).map(r => r.effective);

        const baseTkvIds = new Set(baseTkvs.map(r => r.systemId));
        const createdTkvs: TkvRow[] = mapTkvActions
          .filter(
            a =>
              a.operation === CHANGE_OPERATION.Create &&
              !baseTkvIds.has(a.targetSystemId),
          )
          .map(a => {
            const p = a.newValue as Partial<TkvRow>;
            return {
              systemId: a.targetSystemId,
              moduleTagIdMapSystemId:
                p.moduleTagIdMapSystemId ?? tagMap.systemId,
              uiPersistence: null,
              values: [],
              payloadCollection: [],
            } as unknown as TkvRow;
          });

        overlaidTkvs = [...existing, ...createdTkvs];
      }

      return {
        systemId: tagMap.systemId,
        spfModuleSystemId: tagMap.spfModuleSystemId,
        tagDefinitionSystemId: tagMap.tagDefinitionSystemId,
        tkvs: overlaidTkvs.map(tkv => ({
          systemId: tkv.systemId,
          moduleTagIdMapSystemId: tkv.moduleTagIdMapSystemId,
          uiPersistence: tkv.uiPersistence ?? null,
          values: (tkv.values ?? []).map(v => ({
            tkvSystemId: v.tkvSystemId,
            valueDefSystemId: v.valueDefSystemId,
          })),
        })),
      };
    });
  }

  /**
   * Returns overlaid TkvParameterPayload rows for the given TKV system ID.
   * Used by getModuleTags when includes=FullDetails.
   *
   * getByTable loads all TkvParameterPayload session actions at once;
   * filtering by tkvSystemId happens in memory — no per-payload N queries.
   *
   * Note: spfParameter (parameter definition) data is returned from the base
   * JOIN and is NOT overlaid here — parameter definition edit_actions use
   * a different aggregateId (the definition's own PK, not the payload's).
   */
  async fetchTkvPayloads(
    tkvSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidTkvParameterPayload[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.TkvParameterPayload)
      .createQueryBuilder('p')
      .where('p.tkvSystemId = :tkvSystemId', {tkvSystemId})
      .getMany()) as TkvParameterPayloadRow[];

    if (sessionId === null) return baseRows.map(r => this.toOverlaidPayload(r));

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.TkvParameterPayload,
    );
    const relevantActions = allActions.filter(
      a =>
        (a.newValue as {tkvSystemId?: number})?.tkvSystemId === tkvSystemId ||
        baseRows.some(r => r.systemId === a.targetSystemId),
    );

    if (relevantActions.length === 0)
      return baseRows.map(r => this.toOverlaidPayload(r));

    const base = baseRows.map(r => this.toOverlaidPayload(r));
    const overlaid = (
      this.overlay.applyToCollection(
        base.map(r => ({...r})),
        relevantActions,
      ) as Array<{effective: OverlaidTkvParameterPayload}>
    ).map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: OverlaidTkvParameterPayload[] = relevantActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<OverlaidTkvParameterPayload>;
        return {
          systemId: a.targetSystemId,
          tkvSystemId: p.tkvSystemId ?? tkvSystemId,
          parameterSystemId: p.parameterSystemId ?? 0,
          payload: p.payload ?? null,
        };
      });

    return [...overlaid, ...created];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private toOverlaidTagMap(r: ModuleTagIdMapRow): OverlaidModuleTagIdMap {
    return {
      systemId: r.systemId,
      spfModuleSystemId: r.spfModuleSystemId,
      tagDefinitionSystemId: r.tagDefinitionSystemId,
      tkvs: (r.tkvs ?? []).map(tkv => ({
        systemId: tkv.systemId,
        moduleTagIdMapSystemId: tkv.moduleTagIdMapSystemId,
        uiPersistence: tkv.uiPersistence ?? null,
        values: (tkv.values ?? []).map(v => ({
          tkvSystemId: v.tkvSystemId,
          valueDefSystemId: v.valueDefSystemId,
        })),
      })),
    };
  }

  private toOverlaidPayload(
    r: TkvParameterPayloadRow,
  ): OverlaidTkvParameterPayload {
    return {
      systemId: r.systemId,
      tkvSystemId: r.tkvSystemId,
      parameterSystemId: r.parameterSystemId,
      payload: r.payload ?? null,
    };
  }
}
