/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  KeyValueDefQueryService,
  KeyDefinitionReadModel,
  ValueDefinitionSummaryReadModel,
  KeyDefinitionSummaryReadModel,
} from '@arc/core';
import {Result, ERROR_CODES, IssueSeverity, RESULT_KIND} from '@arc/core';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ValueDefinitionRow} from '../../entity-schema/definitions/key-value/value-definition.schema.js';
import type {KeyDefinitionRow} from '../../entity-schema/definitions/key-value/key-definition.schema.js';
import {toKeyDefinitionReadModel} from './key-definition-row-mapper.js';

export class DbKeyValueDefQueryService implements KeyValueDefQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async getAllKeyDefinitions(
    fileSystemId: number,
    keyNaturalId?: number,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    try {
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const keysResult = await this.loadOverlaidKeysWithValues(
        'all',
        fileSystemId,
        session?.sessionId ?? null,
      );
      if (keysResult.kind === RESULT_KIND.Fail)
        return Result.fail(...keysResult.issues);

      const all = [...keysResult.data.values()];
      const filtered =
        keyNaturalId === undefined
          ? all
          : all.filter(k => k.keyId === keyNaturalId);
      return Result.ok(filtered);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load key definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Batch — ids that don't resolve (absent from DB and overlay) are reported
   * as per-id ENTITY_NOT_FOUND issues via Result.partial, not silently
   * dropped — a caller that asked for specific systemIds should learn which
   * ones didn't come back.
   */
  async getKeyDefinitionsBySystemIds(
    keySystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    if (keySystemIds.length === 0) return Result.ok([]);
    try {
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const keysResult = await this.loadOverlaidKeysWithValues(
        keySystemIds,
        fileSystemId,
        session?.sessionId ?? null,
      );
      if (keysResult.kind === RESULT_KIND.Fail)
        return Result.fail(...keysResult.issues);

      const data = keySystemIds
        .map(id => keysResult.data.get(id))
        .filter((k): k is KeyDefinitionReadModel => k != null);

      const missingIds = keySystemIds.filter(id => !keysResult.data.has(id));
      if (missingIds.length > 0) {
        return Result.partial(
          data,
          missingIds.map(id => ({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `KeyDefinition not found for systemId=${id}`,
            severity: IssueSeverity.Error,
          })),
        );
      }
      return Result.ok(data);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load key definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getKeyValueDefinitionForGivenValue(
    valueDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>> {
    const result = await this.getKeyValueDefinitionForGivenValues(
      [valueDefSystemId],
      fileSystemId,
    );
    if (result.kind === RESULT_KIND.Fail) return Result.fail(...result.issues);

    const match = result.data.find(keyDef =>
      keyDef.values.some(v => v.systemId === valueDefSystemId),
    );
    if (!match)
      return Result.fail({
        code: ERROR_CODES.ENTITY_NOT_FOUND,
        message: `ValueDefinition not found for systemId=${valueDefSystemId}`,
        severity: IssueSeverity.Error,
      });
    return Result.ok(match);
  }

  /**
   * Batch variant — resolves many valueDefSystemIds in two steps: resolve
   * their distinct parent key ids, then load every value under those keys
   * (not just the requested ones) via loadOverlaidKeysWithValues, so each
   * returned KeyDefinitionReadModel carries its full child set.
   *
   * Reports missing valueDefSystemIds via Result.partial — a caller that
   * asked for specific value IDs should learn which ones didn't resolve.
   * This covers both ways a requested id can fail to resolve: its own
   * ValueDefinition row is missing (deleted in session, or never existed),
   * or its ValueDefinition row resolved fine but the parent KeyDefinition
   * it belongs to was itself deleted in the session — in that second case
   * the id would otherwise vanish from the result with no issue reported.
   */
  async getKeyValueDefinitionForGivenValues(
    valueDefSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    if (valueDefSystemIds.length === 0) return Result.ok([]);

    try {
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      // Value→key direction, distinct from loadOverlaidKeysWithValues
      // (key-first). One query for the requested values, plus (if a
      // session is active) one getEditActionsByTable('ValueDefinition')
      // overlay pass scoped to just the requested ids — so a
      // session-only CREATE value still resolves to its parent key.
      const valueRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.ValueDefinition)
        .createQueryBuilder('v')
        .where('v.systemId IN (:...ids)', {ids: valueDefSystemIds})
        .getMany()) as ValueDefinitionRow[];

      let overlaidValueRows = valueRows;
      if (sessionId !== null) {
        const requestedIdSet = new Set(valueDefSystemIds);
        const allValueActions = await this.editActionsSvc.getEditActionsByTable(
          sessionId,
          ENTITY_NAMES.ValueDefinition,
        );
        const valueActions = allValueActions.filter(a =>
          requestedIdSet.has(a.systemId),
        );
        overlaidValueRows = applyToCollection(valueRows, valueActions);
      }

      // Check if all requested value IDs were found after overlay
      const foundValueIds = new Set(overlaidValueRows.map(r => r.systemId));
      const missingValueIds = valueDefSystemIds.filter(
        id => !foundValueIds.has(id),
      );

      // Track which requested value ids depend on which parent key, so a
      // key that disappears in the next step (session-deleted) can be
      // traced back to the specific value ids that should now be reported
      // as missing too, instead of silently vanishing from the result.
      const requestedValueIdsByKeyId = new Map<number, number[]>();
      for (const row of overlaidValueRows) {
        const bucket = requestedValueIdsByKeyId.get(row.keySystemId) ?? [];
        bucket.push(row.systemId);
        requestedValueIdsByKeyId.set(row.keySystemId, bucket);
      }

      const keySystemIds = [...requestedValueIdsByKeyId.keys()];

      if (keySystemIds.length === 0) {
        return Result.fail(
          ...missingValueIds.map(id => ({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `ValueDefinition not found for systemId=${id}`,
            severity: IssueSeverity.Error,
          })),
        );
      }

      const keysResult = await this.loadOverlaidKeysWithValues(
        keySystemIds,
        fileSystemId,
        sessionId,
      );
      if (keysResult.kind === RESULT_KIND.Fail)
        return Result.fail(...keysResult.issues);

      // Preserve resolution order, drop key ids that didn't resolve — and
      // fold the value ids that depended on each dropped key into
      // missingValueIds, so they're reported instead of silently dropped.
      const ordered: KeyDefinitionReadModel[] = [];
      for (const id of keySystemIds) {
        const key = keysResult.data.get(id);
        if (key) {
          ordered.push(key);
        } else {
          missingValueIds.push(...(requestedValueIdsByKeyId.get(id) ?? []));
        }
      }

      // Report missing values as partial result if some were found
      if (missingValueIds.length > 0) {
        return Result.partial(
          ordered,
          missingValueIds.map(id => ({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `ValueDefinition not found for systemId=${id}`,
            severity: IssueSeverity.Error,
          })),
        );
      }

      return Result.ok(ordered);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load value definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Resolves the requested ValueDefinition ids into Key/Value summary pairs.
   *
   * Unlike getKeyValueDefinitionForGivenValues(), which returns distinct keys
   * with all child values, this method returns only the requested
   * key/value mappings.
   */
  async getKeyValueSummaryForGivenValues(
    valueDefSystemIds: number[],
    fileSystemId: number,
  ): Promise<
    Result<
      Array<{
        key: KeyDefinitionSummaryReadModel;
        value: ValueDefinitionSummaryReadModel;
      }>
    >
  > {
    const keysResult = await this.getKeyValueDefinitionForGivenValues(
      valueDefSystemIds,
      fileSystemId,
    );

    if (keysResult.kind === RESULT_KIND.Fail) {
      return Result.fail(...keysResult.issues);
    }

    try {
      const requestedIds = new Set(valueDefSystemIds);

      const keyValuePairs = keysResult.data.flatMap(key =>
        key.values
          .filter(value => requestedIds.has(value.systemId))
          .map(value => ({
            key: {
              systemId: key.systemId,
              keyId: key.keyId,
              name: key.name,
              description: key.description,
            },
            value: {
              systemId: value.systemId,
              valueId: value.valueId,
              name: value.name,
              description: value.description,
            },
          })),
      );

      return keysResult.kind === RESULT_KIND.Partial
        ? Result.partial(keyValuePairs, keysResult.issues)
        : Result.ok(keyValuePairs);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to convert key/value pairs',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getByKeyDefinition(
    keyDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>> {
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const keysResult = await this.loadOverlaidKeysWithValues(
      [keyDefSystemId],
      fileSystemId,
      session?.sessionId ?? null,
    );
    if (keysResult.kind === RESULT_KIND.Fail)
      return Result.fail(...keysResult.issues);

    const match = keysResult.data.get(keyDefSystemId);
    return match
      ? Result.ok(match)
      : Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `KeyDefinition not found for systemId=${keyDefSystemId}`,
          severity: IssueSeverity.Error,
        });
  }

  // ── private overlay helpers ──────────────────────────────────────────────

  /**
   * Batched key+value overlay — the single entry point every public method
   * routes through. At most 4 queries regardless of key count: keys,
   * values (joined to keys for the 'all' case so it stays independent of
   * the key query), and (only when a session is active) one table-wide
   * getEditActionsByTable per table. The four queries have no
   * interdependency, so they run concurrently.
   *
   * No per-key failure isolation — a thrown DB error fails the whole call.
   * Batching removed the per-key HTTP-call-style failure surface that used
   * to justify isolating each key's value fetch.
   */
  private async loadOverlaidKeysWithValues(
    keySystemIds: number[] | 'all',
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Result<Map<number, KeyDefinitionReadModel>>> {
    try {
      const keyRowsQuery =
        keySystemIds === 'all'
          ? this.dataSource
              .getRepository(ENTITY_NAMES.KeyDefinition)
              .createQueryBuilder('k')
              .where('k.fileSystemId = :fileSystemId', {fileSystemId})
          : this.dataSource
              .getRepository(ENTITY_NAMES.KeyDefinition)
              .createQueryBuilder('k')
              .where('k.systemId IN (:...ids)', {ids: keySystemIds});

      const valueRowsQuery =
        keySystemIds === 'all'
          ? this.dataSource
              .getRepository(ENTITY_NAMES.ValueDefinition)
              .createQueryBuilder('v')
              .innerJoin('v.keys', 'k')
              .where('k.fileSystemId = :fileSystemId', {fileSystemId})
          : this.dataSource
              .getRepository(ENTITY_NAMES.ValueDefinition)
              .createQueryBuilder('v')
              .where('v.keySystemId IN (:...ids)', {ids: keySystemIds});

      const [keyRows, valueRows, keyActions, valueActions] = await Promise.all([
        keyRowsQuery.getMany() as Promise<KeyDefinitionRow[]>,
        valueRowsQuery.getMany() as Promise<ValueDefinitionRow[]>,
        sessionId === null
          ? Promise.resolve([])
          : this.editActionsSvc.getEditActionsByTable(
              sessionId,
              ENTITY_NAMES.KeyDefinition,
            ),
        sessionId === null
          ? Promise.resolve([])
          : this.editActionsSvc.getEditActionsByTable(
              sessionId,
              ENTITY_NAMES.ValueDefinition,
            ),
      ]);

      const overlaidKeyRows =
        sessionId === null ? keyRows : applyToCollection(keyRows, keyActions);
      const overlaidValueRows =
        sessionId === null
          ? valueRows
          : applyToCollection(valueRows, valueActions);

      const valuesByKeyId = new Map<number, ValueDefinitionRow[]>();
      for (const v of overlaidValueRows) {
        const bucket = valuesByKeyId.get(v.keySystemId) ?? [];
        bucket.push(v);
        valuesByKeyId.set(v.keySystemId, bucket);
      }

      const map = new Map<number, KeyDefinitionReadModel>();
      for (const k of overlaidKeyRows) {
        map.set(
          k.systemId,
          toKeyDefinitionReadModel({
            ...k,
            values: valuesByKeyId.get(k.systemId) ?? [],
          }),
        );
      }

      return Result.ok(map);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load key definitions',
        severity: IssueSeverity.Error,
      });
    }
  }
}
