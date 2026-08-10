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
import type {KeyDefinitionBase} from '../../../entity-schema/definitions/key-value/key-definition.schema.js';
import type {ValueDefinitionBase} from '../../../entity-schema/definitions/key-value/value-definition.schema.js';

export interface OverlaidKeyDefinition extends KeyDefinitionBase {
  /** Overlay-aware child values for this key. */
  values: ValueDefinitionBase[];
}

/**
 * Fetches arc_keys (KeyDefinition) and arc_values (ValueDefinition) with
 * session overlay applied. Covers the KeyDefinition aggregate — both root and
 * its directly-owned child values (FR-1).
 *
 * Two entry points:
 *
 * fetchByKeySystemIds(scope, fileSystemId, sessionId):
 *   scope = 'all' — loads ALL keys + values for the file (used by
 *     getAllKeyDefinitions). The 'all' sentinel avoids a separate code path
 *     for the file-wide scan; the baseline query switches from
 *     'systemId IN (...)' to 'fileSystemId = ?' but everything else is
 *     identical.
 *   scope = number[] — loads only the given key system IDs (used by
 *     all other methods that already have key IDs in hand).
 *
 *   Either way: four queries run in parallel (key baseline, value baseline,
 *   key edit_actions, value edit_actions) — table-scoped overlay, fixed cost
 *   regardless of key count (not a per-key N-query pattern).
 *
 * fetchValuesBySystemIds(valueSystemIds, sessionId):
 *   Value-first lookup. Used when the caller has value system IDs and needs
 *   to discover their parent keys before loading the full key+value tree.
 *   Returns only the requested values — does not load parent keys.
 */
export class KeyValueDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Loads overlaid key definitions with their child values.
   *
   * scope='all' → file-wide scan (getAllKeyDefinitions)
   * scope=number[] → targeted lookup by key system IDs (getKeyDefinitionsBySystemIds,
   *   getByKeyDefinition, getKeyValueDefinitionForGivenValues)
   *
   * Returns Map<keySystemId, OverlaidKeyDefinition> for O(1) lookup by callers.
   */
  async fetchByKeySystemIds(
    scope: number[] | 'all',
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Map<number, OverlaidKeyDefinition>> {
    // Baseline queries differ by scope — 'all' uses fileSystemId, array uses IN (...).
    const keyRowsQuery =
      scope === 'all'
        ? this.manager
            .getRepository(ENTITY_NAMES.KeyDefinition)
            .createQueryBuilder('k')
            .where('k.fileSystemId = :fileSystemId', {fileSystemId})
        : this.manager
            .getRepository(ENTITY_NAMES.KeyDefinition)
            .createQueryBuilder('k')
            .where('k.systemId IN (:...ids)', {ids: scope});

    // Values are loaded for the same scope. When scope='all', the value query
    // joins back to keys to stay within the same file. When scope=number[],
    // it filters by keySystemId directly.
    const valueRowsQuery =
      scope === 'all'
        ? this.manager
            .getRepository(ENTITY_NAMES.ValueDefinition)
            .createQueryBuilder('v')
            .innerJoin('v.keys', 'k')
            .where('k.fileSystemId = :fileSystemId', {fileSystemId})
        : this.manager
            .getRepository(ENTITY_NAMES.ValueDefinition)
            .createQueryBuilder('v')
            .where('v.keySystemId IN (:...ids)', {ids: scope});

    // Four independent queries run in parallel — fixed count regardless of
    // how many keys are requested (FR-5: not a per-key N-query pattern).
    // Overlay uses getByTable (session-wide scan) rather than per-key
    // getByAggregateId — consistent with SubgraphOverlayFetcher and
    // ContainerOverlayFetcher bulk patterns.
    const [keyRows, valueRows, keyActions, valueActions] = await Promise.all([
      keyRowsQuery.getMany() as Promise<KeyDefinitionBase[]>,
      valueRowsQuery.getMany() as Promise<ValueDefinitionBase[]>,
      sessionId === null
        ? Promise.resolve([])
        : this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.KeyDefinition),
      sessionId === null
        ? Promise.resolve([])
        : this.editActionsSvc.getByTable(
            sessionId,
            ENTITY_NAMES.ValueDefinition,
          ),
    ]);

    // Apply overlay in memory — no further DB calls.
    const overlaidKeys =
      keyActions.length > 0
        ? (
            this.overlay.applyToCollection(keyRows, keyActions) as Array<{
              effective: KeyDefinitionBase;
            }>
          ).map(r => r.effective)
        : keyRows;

    const overlaidValues =
      valueActions.length > 0
        ? (
            this.overlay.applyToCollection(valueRows, valueActions) as Array<{
              effective: ValueDefinitionBase;
            }>
          ).map(r => r.effective)
        : valueRows;

    // Append session-only CREATE'd keys (no baseline row).
    const baseKeyIds = new Set(keyRows.map(r => r.systemId));
    const createdKeys: KeyDefinitionBase[] = keyActions
      .filter(
        (a: EditActionRow) =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseKeyIds.has(a.targetSystemId),
      )
      .map((a: EditActionRow) => {
        const p = a.newValue as Partial<KeyDefinitionBase>;
        return {
          systemId: a.targetSystemId,
          fileSystemId: p.fileSystemId ?? fileSystemId,
          keyId: p.keyId ?? 0,
          name: p.name ?? '',
          description: p.description,
          isCalibrationKey: p.isCalibrationKey,
          isGraphKey: p.isGraphKey,
          isVoice: p.isVoice,
          isDynamic: p.isDynamic,
          specialityKeyValue: p.specialityKeyValue,
          enumMember: p.enumMember,
          enumName: p.enumName,
          calKeyEnumMember: p.calKeyEnumMember,
          graphKeyEnumMember: p.graphKeyEnumMember,
        };
      });

    // Append session-only CREATE'd values (no baseline row).
    const baseValueIds = new Set(valueRows.map(r => r.systemId));
    const createdValues: ValueDefinitionBase[] = valueActions
      .filter(
        (a: EditActionRow) =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseValueIds.has(a.targetSystemId),
      )
      .map((a: EditActionRow) => {
        const p = a.newValue as Partial<ValueDefinitionBase>;
        return {
          systemId: a.targetSystemId,
          keySystemId: p.keySystemId ?? 0,
          valueId: p.valueId ?? 0,
          name: p.name ?? '',
          description: p.description,
          enumMember: p.enumMember,
          specialValue: p.specialValue,
        };
      });

    const allKeys = [...overlaidKeys, ...createdKeys];
    const allValues = [...overlaidValues, ...createdValues];

    // Group values under their parent keys.
    const valuesByKeyId = new Map<number, ValueDefinitionBase[]>();
    for (const v of allValues) {
      const bucket = valuesByKeyId.get(v.keySystemId) ?? [];
      bucket.push(v);
      valuesByKeyId.set(v.keySystemId, bucket);
    }

    const result = new Map<number, OverlaidKeyDefinition>();
    for (const k of allKeys) {
      result.set(k.systemId, {
        ...k,
        values: valuesByKeyId.get(k.systemId) ?? [],
      });
    }
    return result;
  }

  /**
   * Loads overlaid value definitions by their own system IDs.
   *
   * Used by the value-first path in getKeyValueDefinitionForGivenValues:
   * the caller has value IDs, needs to discover their parent key IDs, then
   * loads the full key+value tree via fetchByKeySystemIds. This method
   * handles only the first step — value lookup — without pulling parent keys.
   *
   * Overlay applies the session table scan for ValueDefinition filtered to
   * only the requested IDs, so session-only CREATEs are resolved correctly.
   */
  async fetchValuesBySystemIds(
    valueSystemIds: number[],
    sessionId: number | null,
  ): Promise<ValueDefinitionBase[]> {
    if (valueSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.ValueDefinition)
      .createQueryBuilder('v')
      .where('v.systemId IN (:...ids)', {ids: valueSystemIds})
      .getMany()) as unknown as ValueDefinitionBase[];

    if (sessionId === null) return baseRows;

    const requestedIdSet = new Set(valueSystemIds);
    const allValueActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ValueDefinition,
    );
    // Filter overlay to only the requested IDs — avoids applying unrelated
    // session actions that happen to be for other value definitions.
    const relevantActions = allValueActions.filter(a =>
      requestedIdSet.has(a.targetSystemId),
    );

    const overlaid = (
      this.overlay.applyToCollection(baseRows, relevantActions) as Array<{
        effective: ValueDefinitionBase;
      }>
    ).map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: ValueDefinitionBase[] = relevantActions
      .filter(
        (a: EditActionRow) =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map((a: EditActionRow) => {
        const p = a.newValue as Partial<ValueDefinitionBase>;
        return {
          systemId: a.targetSystemId,
          keySystemId: p.keySystemId ?? 0,
          valueId: p.valueId ?? 0,
          name: p.name ?? '',
          description: p.description,
          enumMember: p.enumMember,
          specialValue: p.specialValue,
        };
      });

    return [...overlaid, ...created];
  }
}
