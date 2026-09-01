/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {KeyDefinitionBase} from '../../../entity-schema/definitions/key-value/key-definition.schema.js';
import type {ValueDefinitionBase} from '../../../entity-schema/definitions/key-value/value-definition.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';
import type {
  ValueDefinitionFetcher,
  ValueDefinitionFilters,
} from './value-definition-fetcher.js';

export interface OverlaidKeyDefinition extends KeyDefinitionBase {
  /** Overlay-aware child values for this key. */
  values: ValueDefinitionBase[];
}

/** Optional scalar filters for KeyDefinition queries. */
export type KeyDefinitionFilters = {
  systemId?: number | number[];
  fileSystemId?: number | number[];
  keyId?: number | number[];
  name?: string | string[];
  description?: string | string[];
  isCalibrationKey?: boolean | boolean[];
  isGraphKey?: boolean | boolean[];
  isVoice?: boolean | boolean[];
  isDynamic?: boolean | boolean[];
  $or?: KeyDefinitionFilters[];
};

/**
 * Fetches KeyDefinition aggregates with their overlaid ValueDefinition
 * children. Key and value table ownership is deliberately split between this
 * aggregate fetcher and the injected value sub-fetcher.
 */
export class KeyValueDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly valueFetcher: ValueDefinitionFetcher,
  ) {}

  /** Loads overlaid key aggregates for a file or a requested key scope. */
  async fetchMany(
    scope: number[] | 'all',
    fileSystemId: number,
    sessionId: number | null,
    filters?: KeyDefinitionFilters,
    valueFilters?: ValueDefinitionFilters,
  ): Promise<OverlaidKeyDefinition[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.KeyDefinition)
      .createQueryBuilder('k');

    if (scope === 'all') {
      qb.where('k.fileSystemId = :fileSystemId', {fileSystemId});
    } else {
      if (scope.length === 0) return [];
      qb.where('k.systemId IN (:...keySystemIds)', {
        keySystemIds: scope,
      }).andWhere('k.fileSystemId = :fileSystemId', {fileSystemId});
    }
    if (filters) applyEntityFilters(qb, 'k', filters);

    const baseRows = (await qb.getMany()) as KeyDefinitionBase[];
    let keys = baseRows;

    if (sessionId !== null) {
      const actions = await this.editActionsSvc.getByTable(
        sessionId,
        ENTITY_NAMES.KeyDefinition,
      );
      const requestedKeyIds = scope === 'all' ? undefined : new Set(scope);
      const relevantActions = actions.filter(action =>
        requestedKeyIds === undefined
          ? true
          : requestedKeyIds.has(action.targetSystemId),
      );
      const createFilter = (newValue: Record<string, unknown>) => {
        const rowFileSystemId = newValue.fileSystemId;
        const rowSystemId = newValue.systemId;
        const inScope =
          typeof rowFileSystemId === 'number' &&
          rowFileSystemId === fileSystemId &&
          (requestedKeyIds === undefined ||
            (typeof rowSystemId === 'number' &&
              requestedKeyIds.has(rowSystemId)));
        return (
          inScope &&
          (filters === undefined || matchesEntityFilters(newValue, filters))
        );
      };

      keys = this.overlay
        .applyToCollection(baseRows, relevantActions, createFilter)
        .map(row => row.effective);
    }

    if (keys.length === 0) return [];

    const keySystemIds = keys.map(key => key.systemId);
    const valueKeyFilter = valueFilters?.keySystemId;
    const scopedKeySystemIds =
      valueKeyFilter === undefined
        ? keySystemIds
        : keySystemIds.filter(keySystemId =>
            Array.isArray(valueKeyFilter)
              ? valueKeyFilter.includes(keySystemId)
              : valueKeyFilter === keySystemId,
          );
    const values =
      scopedKeySystemIds.length === 0
        ? []
        : await this.valueFetcher.fetchMany('all', sessionId, {
            ...valueFilters,
            keySystemId: scopedKeySystemIds,
          });
    const valuesByKeyId = new Map<number, ValueDefinitionBase[]>();
    for (const value of values) {
      const bucket = valuesByKeyId.get(value.keySystemId) ?? [];
      bucket.push(value);
      valuesByKeyId.set(value.keySystemId, bucket);
    }

    return keys.map(key => ({
      ...key,
      values: valuesByKeyId.get(key.systemId) ?? [],
    }));
  }

  /** Returns one fully assembled key aggregate via the collection path. */
  async fetchOne(
    keySystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidKeyDefinition | null> {
    const rows = await this.fetchMany([keySystemId], fileSystemId, sessionId);
    return rows[0] ?? null;
  }
}
