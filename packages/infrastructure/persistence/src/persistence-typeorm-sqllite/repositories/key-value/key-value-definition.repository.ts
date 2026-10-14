/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {KeyValueDefinitionRepository, KeyValueSummary} from '@arc/core';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';

export class TypeOrmKeyValueDefinitionRepository implements KeyValueDefinitionRepository {
  private readonly keyFetcher: KeyValueDefinitionFetcher;

  constructor(manager: EntityManager) {
    const editActionsSvc = new EditActionsQueryService(manager);
    const valueFetcher = new ValueDefinitionFetcher(manager, editActionsSvc);
    this.keyFetcher = new KeyValueDefinitionFetcher(
      manager,
      editActionsSvc,
      valueFetcher,
    );
  }

  async getSummariesForValues(
    fileSystemId: number,
    sessionId: number,
    valueSystemIds: readonly number[],
  ): Promise<KeyValueSummary[]> {
    if (valueSystemIds.length === 0) return [];

    const requestedIds = [...new Set(valueSystemIds)];
    const keys = await this.keyFetcher.fetchMany(
      'all',
      fileSystemId,
      sessionId,
      undefined,
      {systemId: requestedIds},
    );
    const summariesByValueId = new Map<number, KeyValueSummary>();

    for (const key of keys) {
      for (const value of key.values) {
        summariesByValueId.set(value.systemId, {
          keyId: key.naturalId,
          valueId: value.naturalId,
        });
      }
    }

    return valueSystemIds.flatMap(valueSystemId => {
      const summary = summariesByValueId.get(valueSystemId);
      return summary === undefined ? [] : [summary];
    });
  }
}
