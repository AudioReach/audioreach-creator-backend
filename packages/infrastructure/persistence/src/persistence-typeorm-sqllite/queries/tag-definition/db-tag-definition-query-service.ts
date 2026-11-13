/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  FailedEntity,
  KeyDefinitionReadModel,
  KeyValueDefQueryService,
  TagDefinitionFilter,
  TagDefinitionQueryService,
  TagDefinitionReadModel,
  TagKeyDefinitionReadModel,
} from '@arc/core';
import {FAILED_ENTITY_REASON, ISSUE_ENTITY_TYPE} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {
  TagDefinitionFetcher,
  type OverlaidTagDefinition,
} from '../../fetchers/definitions/tag-key-value/tag-definition-fetcher.js';

type TagBatch = BatchRead<TagDefinitionReadModel, 'TagDefinition'>;

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
    if (tagSystemIds.length === 0) return {items: [], failed: []};

    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const tags = await this.tagFetcher.fetchMany(
      [...new Set(tagSystemIds)],
      fileSystemId,
      sessionId,
    );
    const {items, failed} = await this.withKeys(tags, fileSystemId);

    return withNotFound(tagSystemIds, items, tag => tag.systemId, failed);
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
    const failed: FailedEntity<'TagDefinition'>[] = [];
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
            entityType: ISSUE_ENTITY_TYPE.KeyDefinition,
            systemId: missingKeyId,
          },
        });
      }
    }
    return {items, failed};
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
