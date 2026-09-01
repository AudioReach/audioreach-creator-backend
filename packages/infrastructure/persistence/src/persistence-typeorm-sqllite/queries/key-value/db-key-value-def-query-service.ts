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
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {toKeyDefinitionReadModel} from './key-definition-row-mapper.js';

/**
 * Database implementation of KeyValueDefQueryService.
 *
 * Key rows are loaded by KeyValueDefinitionFetcher and child values by its
 * injected ValueDefinitionFetcher. No per-key N-query pattern is used.
 * table-scoped queries — no per-key N-query patterns.
 *
 * loadOverlaidKeysWithValues has been replaced by the fetcher's
 * fetchMany — the bulk loading and overlay logic now lives there.
 */
export class DbKeyValueDefQueryService implements KeyValueDefQueryService {
  private readonly kvFetcher: KeyValueDefinitionFetcher;
  private readonly valueFetcher: ValueDefinitionFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
  ) {
    this.valueFetcher = new ValueDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.kvFetcher = new KeyValueDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
      this.valueFetcher,
    );
  }

  async getAllKeyDefinitions(
    fileSystemId: number,
    keyNaturalId?: number,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // scope='all' — loads every key for the file in a single fetcher call.
      const keys = await this.kvFetcher.fetchMany(
        'all',
        fileSystemId,
        sessionId,
      );

      const all = keys.map(k => toKeyDefinitionReadModel(k));
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
   * Batch — IDs that don't resolve (absent from DB and overlay) are reported
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
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const keys = await this.kvFetcher.fetchMany(
        keySystemIds,
        fileSystemId,
        sessionId,
      );
      const keyMap = new Map(keys.map(key => [key.systemId, key]));

      const data = keySystemIds
        .map(id => keyMap.get(id))
        .filter((k): k is NonNullable<typeof k> => k != null)
        .map(k => toKeyDefinitionReadModel(k));

      const missingIds = keySystemIds.filter(id => !keyMap.has(id));
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
   * Batch variant — resolves many valueDefSystemIds in two steps:
   *   Step 1: value sub-fetcher lookup to discover parent key IDs from the
   *     value rows (including session-only CREATEs).
   *   Step 2: fetchMany on the discovered key IDs to load the
   *     full key+value trees with overlay applied.
   *
   * Reports missing valueDefSystemIds via Result.partial — a caller that
   * asked for specific value IDs should learn which ones didn't resolve.
   * Covers both failure modes: the ValueDefinition row is missing (deleted in
   * session or never existed), or the parent KeyDefinition was deleted in the
   * session (the value row resolved but its parent key disappeared).
   */
  async getKeyValueDefinitionForGivenValues(
    valueDefSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel[]>> {
    if (valueDefSystemIds.length === 0) return Result.ok([]);

    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Step 1 — value-first: resolve value rows to discover parent key IDs.
      // Uses the value sub-fetcher so session-only CREATE values are included.
      const overlaidValues = await this.valueFetcher.fetchMany(
        valueDefSystemIds,
        sessionId,
      );

      const foundValueIds = new Set(overlaidValues.map(r => r.systemId));
      const missingValueIds = valueDefSystemIds.filter(
        id => !foundValueIds.has(id),
      );

      // Track which requested value IDs depend on which parent key, so a
      // key that disappears in Step 2 (session-deleted) can be traced back
      // to the specific value IDs that should then be reported as missing.
      const requestedValueIdsByKeyId = new Map<number, number[]>();
      for (const row of overlaidValues) {
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

      // Step 2 — key-first: load the full key+value trees for the parent keys.
      const keys = await this.kvFetcher.fetchMany(
        keySystemIds,
        fileSystemId,
        sessionId,
      );
      const keyMap = new Map(keys.map(key => [key.systemId, key]));

      // Preserve resolution order; fold value IDs from dropped keys into
      // missingValueIds so they're reported rather than silently dropped.
      const ordered: KeyDefinitionReadModel[] = [];
      for (const id of keySystemIds) {
        const key = keyMap.get(id);
        if (key) {
          ordered.push(toKeyDefinitionReadModel(key));
        } else {
          missingValueIds.push(...(requestedValueIdsByKeyId.get(id) ?? []));
        }
      }

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
   * Resolves the requested ValueDefinition IDs into Key/Value summary pairs.
   * Unlike getKeyValueDefinitionForGivenValues which returns distinct keys
   * with all child values, this returns only the specific requested mappings.
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
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const keys = await this.kvFetcher.fetchMany(
        [keyDefSystemId],
        fileSystemId,
        sessionId,
      );
      const keyMap = new Map(keys.map(key => [key.systemId, key]));

      const match = keyMap.get(keyDefSystemId);
      return match
        ? Result.ok(toKeyDefinitionReadModel(match))
        : Result.fail({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `KeyDefinition not found for systemId=${keyDefSystemId}`,
            severity: IssueSeverity.Error,
          });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load key definition ${keyDefSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Returns the active session ID for the given file, or null if no session
   * is active.
   *
   * No fetcher is used here because project_sessions is not session-mutable —
   * sessions are the overlay context itself, not data that gets overlaid.
   * A session cannot be staged inside another session, so FR-3 does not apply
   * and a direct query is both correct and necessary.
   */
}
