/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  KeyValueDefQueryService,
  KeyDefinitionReadModel,
  ValueDefinitionReadModel,
  ConfigurationIncludes,
} from '@arc/core';
import {applyTableOverlay} from '../edit-session/overlay-utils.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ProjectSessionRow} from '../../entity-schema/index.js';
import type {ValueDefinitionRow} from '../../entity-schema/definitions/key-value/value-definition.schema.js';
import type {KeyDefinitionRow} from '../../entity-schema/definitions/key-value/key-definition.schema.js';

export class DbKeyValueDefQueryService implements KeyValueDefQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async getByValueDefinition(
    valueDefSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<{
    key: KeyDefinitionReadModel;
    value: ValueDefinitionReadModel;
  } | null> {
    const result = await this.getByValueDefinitions(
      [valueDefSystemId],
      fileSystemId,
      includes,
    );
    return result.get(valueDefSystemId) ?? null;
  }

  /**
   * Batch variant — resolves many valueDefSystemIds in one DB query plus
   * one pair of table-wide edit-action queries, instead of one
   * getEditActionsByAggregateId call per id.
   */
  async getByValueDefinitions(
    valueDefSystemIds: number[],
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<
    Map<number, {key: KeyDefinitionReadModel; value: ValueDefinitionReadModel}>
  > {
    if (valueDefSystemIds.length === 0) return new Map();

    // Step 1 — QueryBuilder: one query for all requested values + their keys
    let qb = this.dataSource
      .getRepository(ENTITY_NAMES.ValueDefinition)
      .createQueryBuilder('v')
      .where('v.systemId IN (:...ids)', {ids: valueDefSystemIds});

    if (includes.summary || includes.fullDetails) {
      qb = qb.leftJoinAndSelect('v.keys', 'k');
    }

    const rows = (await qb.getMany()) as ValueDefinitionRow[];

    // Step 2 — Overlay: two table-wide queries total, not one per row
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const overlaidRows = session
      ? await this.applyBatchOverlay(rows, valueDefSystemIds, session)
      : rows;

    // Step 3 — Map to read model, skip rows whose parent key never resolved
    const result = new Map<
      number,
      {key: KeyDefinitionReadModel; value: ValueDefinitionReadModel}
    >();
    for (const r of overlaidRows) {
      if (!r.keys) continue;
      result.set(r.systemId, {
        key: {
          systemId: r.keys.systemId,
          keyId: r.keys.keyId,
          name: r.keys.name,
          description: r.keys.description,
          isCalibrationKey: r.keys.isCalibrationKey,
          isGraphKey: r.keys.isGraphKey,
          isVoice: r.keys.isVoice,
          isDynamic: r.keys.isDynamic,
          cEnumMemberName: r.keys.cEnumMemberName,
          cEnumName: r.keys.cEnumName,
          specialityKeyValue: r.keys.specialityKeyValue,
          calibrationEnumValue: r.keys.calibrationEnumValue,
          graphEnumValue: r.keys.graphEnumValue,
        },
        value: {
          systemId: r.systemId,
          valueId: r.valueId,
          name: r.name,
          description: r.description,
          enumValue: r.enumValue,
          specialValue: r.specialValue,
        },
      });
    }
    return result;
  }

  async getByKeyDefinition(
    keyDefSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<{
    key: KeyDefinitionReadModel;
    values: ReadonlyArray<ValueDefinitionReadModel>;
  } | null> {
    // Step 1 — QueryBuilder: join values when summary or fullDetails requested
    let qb = this.dataSource
      .getRepository(ENTITY_NAMES.KeyDefinition)
      .createQueryBuilder('k')
      .where('k.systemId = :id', {id: keyDefSystemId});

    if (includes.summary || includes.fullDetails) {
      qb = qb.leftJoinAndSelect('k.values', 'v');
    }

    const row = (await qb.getOne()) as KeyDefinitionRow | null;

    // Step 2 — Overlay: applied when session exists
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const overlaid = session
      ? await this.applyKeyDefOverlay(row, keyDefSystemId, session)
      : row;
    if (!overlaid) return null;

    // Step 3 — Return full overlaid read model — caller uses project() to reduce
    return {
      key: {
        systemId: overlaid.systemId,
        keyId: overlaid.keyId,
        name: overlaid.name,
        description: overlaid.description,
        isCalibrationKey: overlaid.isCalibrationKey,
        isGraphKey: overlaid.isGraphKey,
        isVoice: overlaid.isVoice,
        isDynamic: overlaid.isDynamic,
        cEnumMemberName: overlaid.cEnumMemberName,
        cEnumName: overlaid.cEnumName,
        specialityKeyValue: overlaid.specialityKeyValue,
        calibrationEnumValue: overlaid.calibrationEnumValue,
        graphEnumValue: overlaid.graphEnumValue,
      },
      values: (overlaid.values ?? []).map(v => ({
        systemId: v.systemId,
        valueId: v.valueId,
        name: v.name,
        description: v.description,
        enumValue: v.enumValue,
        specialValue: v.specialValue,
      })),
    };
  }

  // ── private overlay methods ──────────────────────────────────────────────

  /**
   * Applies overlay to a KeyDefinition row and all its child ValueDefinition rows.
   * Called only when an active session exists — session is guaranteed non-null.
   *
   * One getEditActionsByAggregateId call returns the key's own actions.
   * Child values are overlaid via applyBatchOverlay — two table-wide
   * getEditActionsByTable queries total, not one getEditActionsByAggregateId
   * call per value, avoiding per-value queries for keys with many values.
   */
  private async applyKeyDefOverlay(
    baseRow: KeyDefinitionRow | null,
    keyDefSystemId: number,
    session: ProjectSessionRow,
  ): Promise<KeyDefinitionRow | null> {
    const actions = await this.editActionsSvc.getEditActionsByAggregateId(
      session.sessionId,
      keyDefSystemId,
    );

    // applyTableOverlay filters to KeyDefinition actions — handles CREATE (null baseRow) too
    const overlaidKey = applyTableOverlay(
      baseRow,
      actions,
      ENTITY_NAMES.KeyDefinition,
    );
    if (!overlaidKey) return null;

    const baseValues = overlaidKey.values ?? [];
    if (baseValues.length === 0) return {...overlaidKey, values: []};

    const requestedIds = baseValues.map(v => v.systemId);
    const overlaidValues = await this.applyBatchOverlay(
      baseValues,
      requestedIds,
      session,
    );

    return {...overlaidKey, values: overlaidValues};
  }

  /**
   * Applies overlay to a batch of ValueDefinition rows (and their KeyDefinition
   * parents) using two table-wide edit-action queries — getEditActionsByTable —
   * instead of one getEditActionsByAggregateId call per row. This is what makes
   * getByValueDefinitions O(1) queries instead of O(n), and is reused by
   * applyKeyDefOverlay for the same reason.
   *
   * requestedIds narrows both table-wide queries to actions the caller actually
   * asked about, and (via applyToCollection's own CREATE-append behavior) allows
   * values that exist only as a session CREATE — never persisted to the DB — to
   * still resolve correctly.
   */
  private async applyBatchOverlay(
    baseRows: ValueDefinitionRow[],
    requestedIds: number[],
    session: ProjectSessionRow,
  ): Promise<ValueDefinitionRow[]> {
    const requestedIdSet = new Set(requestedIds);

    const allValueActions = await this.editActionsSvc.getEditActionsByTable(
      session.sessionId,
      ENTITY_NAMES.ValueDefinition,
    );
    const valueActions = allValueActions.filter(a =>
      requestedIdSet.has(a.systemId),
    );

    const overlaidValues = applyToCollection(baseRows, valueActions);

    const keySystemIds = [
      ...new Set(
        overlaidValues
          .map(v => v.keys?.systemId)
          .filter((id): id is number => id != null),
      ),
    ];
    const keySystemIdSet = new Set(keySystemIds);

    const allKeyActions = await this.editActionsSvc.getEditActionsByTable(
      session.sessionId,
      ENTITY_NAMES.KeyDefinition,
    );
    const keyActions = allKeyActions.filter(a =>
      keySystemIdSet.has(a.systemId),
    );

    const baseKeyRows = overlaidValues
      .map(v => v.keys)
      .filter((k): k is KeyDefinitionRow => k != null);

    const overlaidKeys = applyToCollection(baseKeyRows, keyActions);
    const overlaidKeyMap = new Map(overlaidKeys.map(k => [k.systemId, k]));

    return overlaidValues.map(v => ({
      ...v,
      keys: overlaidKeyMap.get(v.keys?.systemId ?? -1) ?? v.keys,
    }));
  }
}
