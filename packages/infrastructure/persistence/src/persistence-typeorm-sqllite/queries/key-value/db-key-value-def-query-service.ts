/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  IdentifiedEntityRef,
  KeyDefinitionFilter,
  KeyDefinitionReadModel,
  KeyValueDefQueryService,
  KeyValuePairReadModel,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {ENTITY_TYPE} from '@arc/core';
import {withNotFound} from '../../utils/with-not-found.js';
import {inRequestOrder} from '../../utils/in-request-order.js';
import {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {toKeyDefinitionReadModel} from './key-definition-row-mapper.js';

/**
 * Database implementation of KeyValueDefQueryService.
 *
 * Key rows are loaded by KeyValueDefinitionFetcher and child values by its
 * injected ValueDefinitionFetcher, with the session overlay applied. Each
 * method issues table-scoped queries; there is no per-key query.
 */
export class DbKeyValueDefQueryService implements KeyValueDefQueryService {
  private readonly kvFetcher: KeyValueDefinitionFetcher;
  private readonly valueFetcher: ValueDefinitionFetcher;

  constructor(
    private readonly manager: EntityManager,
    editActionsSvc: EditActionsQueryService,
  ) {
    this.valueFetcher = new ValueDefinitionFetcher(manager, editActionsSvc);
    this.kvFetcher = new KeyValueDefinitionFetcher(
      manager,
      editActionsSvc,
      this.valueFetcher,
    );
  }

  async findAllKeyDefinitions(
    fileSystemId: number,
    filter: KeyDefinitionFilter = {},
  ): Promise<KeyDefinitionReadModel[]> {
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const keys = await this.kvFetcher.fetchMany('all', fileSystemId, sessionId);

    return keys
      .map(key => toKeyDefinitionReadModel(key))
      .filter(
        key =>
          filter.naturalId === undefined || key.naturalId === filter.naturalId,
      );
  }

  async findKeyDefinitions(
    fileSystemId: number,
    keySystemIds: readonly number[],
  ): Promise<
    BatchRead<KeyDefinitionReadModel, typeof ENTITY_TYPE.KeyDefinition>
  > {
    if (keySystemIds.length === 0)
      return {entityType: ENTITY_TYPE.KeyDefinition, items: [], failed: []};

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const keys = await this.kvFetcher.fetchMany(
      [...keySystemIds],
      fileSystemId,
      sessionId,
    );
    const keysById = new Map(keys.map(key => [key.systemId, key]));
    const items = [...new Set(keySystemIds)].flatMap(id => {
      const key = keysById.get(id);
      return key === undefined ? [] : [toKeyDefinitionReadModel(key)];
    });

    return withNotFound(
      ENTITY_TYPE.KeyDefinition,
      keySystemIds,
      items,
      key => key.systemId,
    );
  }

  /**
   * Resolves the values first, to learn their parent keys (including values
   * created in the session), then loads those keys with their values. A
   * value whose key was deleted in the session is reported as not found.
   */
  async findKeyValuePairs(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<
    BatchRead<KeyValuePairReadModel, typeof ENTITY_TYPE.ValueDefinition>
  > {
    if (valueDefSystemIds.length === 0)
      return {entityType: ENTITY_TYPE.ValueDefinition, items: [], failed: []};

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const values = await this.valueFetcher.fetchMany(
      [...valueDefSystemIds],
      sessionId,
    );
    const keySystemIds = [...new Set(values.map(value => value.keySystemId))];
    const keys =
      keySystemIds.length === 0
        ? []
        : await this.kvFetcher.fetchMany(keySystemIds, fileSystemId, sessionId);

    // Pair by each value's effective keySystemId: a key's own `values` are
    // loaded by the stored key column, so they miss values moved in session.
    const keysById = new Map(keys.map(key => [key.systemId, key]));
    const valuesById = new Map(values.map(value => [value.systemId, value]));
    const items = [...new Set(valueDefSystemIds)].flatMap(
      (id): KeyValuePairReadModel[] => {
        const value = valuesById.get(id);
        const key =
          value === undefined ? undefined : keysById.get(value.keySystemId);
        if (value === undefined || key === undefined) return [];
        return [
          {
            key: {
              systemId: key.systemId,
              naturalId: key.naturalId,
              name: key.name,
              description: key.description,
            },
            value: {
              systemId: value.systemId,
              naturalId: value.naturalId,
              name: value.name,
              description: value.description,
            },
          },
        ];
      },
    );

    return withNotFound(
      ENTITY_TYPE.ValueDefinition,
      valueDefSystemIds,
      items,
      pair => pair.value.systemId,
    );
  }

  async findKeyDefinitionIdentities(
    fileSystemId: number,
    keySystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.KeyDefinition>,
      typeof ENTITY_TYPE.KeyDefinition
    >
  > {
    const requested = [...new Set(keySystemIds)];
    if (requested.length === 0)
      return {entityType: ENTITY_TYPE.KeyDefinition, items: [], failed: []};

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const keys = await this.kvFetcher.fetchMany(
      requested,
      fileSystemId,
      sessionId,
    );
    const items = inRequestOrder(
      requested,
      keys.map(key => ({
        entityType: ENTITY_TYPE.KeyDefinition,
        systemId: key.systemId,
        identity: {name: key.name, naturalId: key.naturalId},
      })),
    );
    return withNotFound(
      ENTITY_TYPE.KeyDefinition,
      requested,
      items,
      item => item.systemId,
    );
  }

  async findValueDefinitionIdentities(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.ValueDefinition>,
      typeof ENTITY_TYPE.ValueDefinition
    >
  > {
    const requested = [...new Set(valueDefSystemIds)];
    if (requested.length === 0)
      return {entityType: ENTITY_TYPE.ValueDefinition, items: [], failed: []};

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const values = await this.valueFetcher.fetchMany(requested, sessionId);
    const keySystemIds = [...new Set(values.map(value => value.keySystemId))];
    const keys = await this.kvFetcher.fetchMany(
      keySystemIds,
      fileSystemId,
      sessionId,
    );
    const keysById = new Map(keys.map(key => [key.systemId, key]));

    // A value is part of its key: one whose key is missing (deleted, or in
    // another file) does not exist either. Pair by the value's effective
    // keySystemId, which sees moves made in the session.
    const items = values.flatMap(value => {
      const key = keysById.get(value.keySystemId);
      return key === undefined
        ? []
        : [
            {
              entityType: ENTITY_TYPE.ValueDefinition,
              systemId: value.systemId,
              identity: {
                key: {name: key.name, naturalId: key.naturalId},
                value: {name: value.name, naturalId: value.naturalId},
              },
            },
          ];
    });
    return withNotFound(
      ENTITY_TYPE.ValueDefinition,
      requested,
      inRequestOrder(requested, items),
      item => item.systemId,
    );
  }
}
