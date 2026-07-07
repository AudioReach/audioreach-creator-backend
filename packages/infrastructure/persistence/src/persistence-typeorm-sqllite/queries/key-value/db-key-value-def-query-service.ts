/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  KeyValueDefQueryService,
  KeyDefinitionReadModel,
  ValueDefinitionReadModel,
} from '@arc/core';
import {Result, ERROR_CODES} from '@arc/core';
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

  async getKeyValueDefinitionForGivenValue(
    valueDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>> {
    const result = await this.getKeyValueDefinitionForGivenValues(
      [valueDefSystemId],
      fileSystemId,
    );
    if (result.isFailure) return Result.fail(...result.errors);

    const match = result.data.find(keyDef =>
      keyDef.values.some(v => v.systemId === valueDefSystemId),
    );
    if (!match)
      return Result.fail({
        code: ERROR_CODES.ENTITY_NOT_FOUND,
        message: `ValueDefinition not found for systemId=${valueDefSystemId}`,
      });
    return Result.ok(match);
  }

  /**
   * Batch variant — resolves many valueDefSystemIds in two DB queries total:
   * Step 1 finds which parent keys the requested values belong to, Step 2
   * loads every value under those keys (not just the requested ones), so
   * each returned KeyDefinitionReadModel carries its full child set.
   */
  async getKeyValueDefinitionForGivenValues(
    valueDefSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    if (valueDefSystemIds.length === 0) return Result.ok([]);

    try {
      // Step 1 — resolve requested values → their distinct parent key ids
      const requestedRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.ValueDefinition)
        .createQueryBuilder('v')
        .leftJoinAndSelect('v.keys', 'k')
        .where('v.systemId IN (:...ids)', {ids: valueDefSystemIds})
        .getMany()) as ValueDefinitionRow[];

      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaidRequestedRows = session
        ? await this.applyBatchOverlay(requestedRows, valueDefSystemIds, session)
        : requestedRows;

      const keySystemIds = [
        ...new Set(
          overlaidRequestedRows
            .map(r => r.keys?.systemId)
            .filter((id): id is number => id != null),
        ),
      ];
      if (keySystemIds.length === 0) return Result.ok([]);

      // Step 2 — load ALL values under those keys, one batched query
      const allValueRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.ValueDefinition)
        .createQueryBuilder('v')
        .leftJoinAndSelect('v.keys', 'k')
        .where('v.keySystemId IN (:...keyIds)', {keyIds: keySystemIds})
        .getMany()) as ValueDefinitionRow[];

      const allValueIds = allValueRows.map(r => r.systemId);
      const overlaidValueRows = session
        ? await this.applyBatchOverlay(allValueRows, allValueIds, session)
        : allValueRows;

      // Group by parent key, build one KeyDefinitionReadModel per distinct key
      const valuesByKeyId = new Map<number, ValueDefinitionRow[]>();
      const keyRowById = new Map<number, KeyDefinitionRow>();
      for (const row of overlaidValueRows) {
        if (!row.keys) continue;
        keyRowById.set(row.keys.systemId, row.keys);
        const bucket = valuesByKeyId.get(row.keys.systemId) ?? [];
        bucket.push(row);
        valuesByKeyId.set(row.keys.systemId, bucket);
      }

      const result = keySystemIds
        .map(keyId => keyRowById.get(keyId))
        .filter((k): k is KeyDefinitionRow => k != null)
        .map(keyRow =>
          this.toKeyDefinitionReadModel(
            keyRow,
            valuesByKeyId.get(keyRow.systemId) ?? [],
          ),
        );

      return Result.ok(result);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load value definitions',
      });
    }
  }

  async getByKeyDefinition(
    keyDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>> {
    try {
      // Step 1 — QueryBuilder: key + child values always joined
      const row = (await this.dataSource
        .getRepository(ENTITY_NAMES.KeyDefinition)
        .createQueryBuilder('k')
        .leftJoinAndSelect('k.values', 'v')
        .where('k.systemId = :id', {id: keyDefSystemId})
        .getOne()) as KeyDefinitionRow | null;

      // Step 2 — Overlay: applied when session exists
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaid = session
        ? await this.applyKeyDefOverlay(row, keyDefSystemId, session)
        : row;
      if (!overlaid)
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `KeyDefinition not found for systemId=${keyDefSystemId}`,
        });

      // Step 3 — Return full overlaid read model
      return Result.ok(
        this.toKeyDefinitionReadModel(overlaid, overlaid.values ?? []),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load key definition ${keyDefSystemId}`,
      });
    }
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
   * getKeyValueDefinitionForGivenValues O(1) queries instead of O(n), and is
   * reused by applyKeyDefOverlay for the same reason.
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

  // ── projection helpers ────────────────────────────────────────────────────

  private toKeyDefinitionReadModel(
    key: KeyDefinitionRow,
    values: ValueDefinitionRow[],
  ): KeyDefinitionReadModel {
    return {
      systemId: key.systemId,
      keyId: key.keyId,
      name: key.name,
      description: key.description,
      isCalibrationKey: key.isCalibrationKey,
      isGraphKey: key.isGraphKey,
      isVoice: key.isVoice,
      isDynamic: key.isDynamic,
      cEnumMemberName: key.cEnumMemberName,
      cEnumName: key.cEnumName,
      specialityKeyValue: key.specialityKeyValue,
      calibrationEnumValue: key.calibrationEnumValue,
      graphEnumValue: key.graphEnumValue,
      values: values.map(v => this.toValueDefinitionReadModel(v)),
    };
  }

  private toValueDefinitionReadModel(
    v: ValueDefinitionRow,
  ): ValueDefinitionReadModel {
    return {
      systemId: v.systemId,
      valueId: v.valueId,
      name: v.name,
      description: v.description,
      enumValue: v.enumValue,
      specialValue: v.specialValue,
    };
  }
}
