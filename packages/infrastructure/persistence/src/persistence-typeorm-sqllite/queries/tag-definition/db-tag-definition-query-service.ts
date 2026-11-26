/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  FailedEntity,
  IdentifiedEntityRef,
  KeyDefinitionReadModel,
  KeyValueDefQueryService,
  TagDefinitionFilter,
  TagDefinitionQueryService,
  TagDefinitionReadModel,
  TagKeyDefinitionReadModel,
} from '@arc/core';
import {FAILED_ENTITY_REASON, ENTITY_TYPE} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {withCommittedFallback} from '../../utils/with-committed-fallback.js';
import {inRequestOrder} from '../../utils/in-request-order.js';
import {
  TagDefinitionFetcher,
  type OverlaidTagDefinition,
} from '../../fetchers/definitions/tag-key-value/tag-definition-fetcher.js';

type TagBatch = BatchRead<
  TagDefinitionReadModel,
  typeof ENTITY_TYPE.TagDefinition
>;

/**
 * Database implementation of TagDefinitionQueryService.
 *
 * Tags and their key links are loaded by TagDefinitionFetcher with the
 * session overlay applied (FR-3). The linked key definitions are loaded
 * through KeyValueDefQueryService (FR-4), after the overlay, because only
 * then is the set of linked keys known.
 */
export class DbTagDefinitionQueryService implements TagDefinitionQueryService {
  private readonly tagFetcher: TagDefinitionFetcher;

  constructor(
    private readonly manager: EntityManager,
    editActionsSvc: EditActionsQueryService,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
  ) {
    this.tagFetcher = new TagDefinitionFetcher(manager, editActionsSvc);
  }

  async findAllTagDefinitions(
    fileSystemId: number,
    filter: TagDefinitionFilter = {},
  ): Promise<TagBatch> {
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const tags = await this.tagFetcher.fetchMany(
      'all',
      fileSystemId,
      sessionId,
      filter.naturalId === undefined
        ? undefined
        : {naturalId: filter.naturalId},
    );

    return this.withKeys(tags, fileSystemId);
  }

  async findTagDefinitions(
    fileSystemId: number,
    tagSystemIds: readonly number[],
  ): Promise<TagBatch> {
    if (tagSystemIds.length === 0)
      return {entityType: ENTITY_TYPE.TagDefinition, items: [], failed: []};

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const tags = await this.tagFetcher.fetchMany(
      [...new Set(tagSystemIds)],
      fileSystemId,
      sessionId,
    );
    const {items, failed} = await this.withKeys(tags, fileSystemId);

    return withNotFound(
      ENTITY_TYPE.TagDefinition,
      tagSystemIds,
      items,
      tag => tag.systemId,
      failed,
    );
  }

  async findTagDefinitionIdentities(
    fileSystemId: number,
    tagSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.TagDefinition>,
      typeof ENTITY_TYPE.TagDefinition
    >
  > {
    const requested = [...new Set(tagSystemIds)];
    if (requested.length === 0)
      return {entityType: ENTITY_TYPE.TagDefinition, items: [], failed: []};

    return withCommittedFallback(
      await resolveActiveSessionId(this.manager, fileSystemId),
      requested,
      async (sessionId, ids) => {
        const tags = await this.tagFetcher.fetchMany(
          [...ids],
          fileSystemId,
          sessionId,
        );
        const items = inRequestOrder(
          ids,
          tags.map(tag => ({
            entityType: ENTITY_TYPE.TagDefinition,
            systemId: tag.systemId,
            identity: {name: tag.name, naturalId: tag.naturalId},
          })),
        );
        return withNotFound(
          ENTITY_TYPE.TagDefinition,
          ids,
          items,
          item => item.systemId,
        );
      },
    );
  }

  /**
   * Adds the linked key definitions to each tag. A tag that links to a
   * missing key goes to `failed`, with its own name and natural ID.
   */
  private async withKeys(
    tags: readonly OverlaidTagDefinition[],
    fileSystemId: number,
  ): Promise<TagBatch> {
    const keySystemIds = [
      ...new Set(
        tags.flatMap(tag => tag.links.map(link => link.keyReferenceSystemId)),
      ),
    ];
    const keys = await this.keyValueDefSvc.findKeyDefinitions(
      fileSystemId,
      keySystemIds,
    );
    const keysById = new Map(keys.items.map(key => [key.systemId, key]));

    const items: TagDefinitionReadModel[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.TagDefinition>[] = [];
    for (const tag of tags) {
      const missingKeyId = tag.links
        .map(link => link.keyReferenceSystemId)
        .find(id => !keysById.has(id));
      if (missingKeyId === undefined) {
        items.push(toTagDefinitionReadModel(tag, keysById));
      } else {
        failed.push({
          systemId: tag.systemId,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          identity: {name: tag.name, naturalId: tag.naturalId},
          missingRef: {
            entityType: ENTITY_TYPE.KeyDefinition,
            systemId: missingKeyId,
          },
        });
      }
    }
    return {entityType: ENTITY_TYPE.TagDefinition, items, failed};
  }
}

function toTagDefinitionReadModel(
  tag: OverlaidTagDefinition,
  keysById: ReadonlyMap<number, KeyDefinitionReadModel>,
): TagDefinitionReadModel {
  const keys: TagKeyDefinitionReadModel[] = tag.links.flatMap(link => {
    const keyDefinition = keysById.get(link.keyReferenceSystemId);
    return keyDefinition === undefined
      ? []
      : [{cHeaderTagEnumMemberName: link.tagEnumValue, keyDefinition}];
  });
  return {
    systemId: tag.systemId,
    naturalId: tag.naturalId,
    name: tag.name,
    description: tag.description,
    isVoice: tag.isVoice,
    cHeaderEnumName: tag.cHeaderEnumName,
    cHeaderEnumMember: tag.cHeaderEnumValue,
    keys,
  };
}
