/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {
  TagDefinitionBase,
  TagDefinitionRow,
} from '../../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import type {TagKeyDefLinkBase} from '../../../entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../../queries/shared/filter-utils.js';

/** Optional scalar filters for TagDefinition queries. */
export type TagDefinitionFilters = {
  systemId?: number | number[];
  tagId?: number | number[];
  name?: string | string[];
  description?: string | string[];
  isVoice?: boolean | boolean[];
  cHeaderEnumName?: string | string[];
  cHeaderEnumValue?: string | string[];
  fileSystemId?: number | number[];
  $or?: TagDefinitionFilters[];
};

/**
 * Overlaid scalar fields from tag_definitions with owned tag_key_def_links
 * nested and session-overlaid.
 *
 * Key definition resolution is cross-aggregate enrichment delegated to
 * KeyValueDefQueryService in the query service layer.
 */
export interface OverlaidTagDefinition extends TagDefinitionBase {
  /** Owned tag-key links with session overlay applied. */
  links: TagKeyDefLinkBase[];
}

/**
 * Fetches tag definitions and their owned tag-key links with session overlay.
 *
 * Tag definitions are scoped by fileSystemId and optionally by their own
 * system IDs. Link actions are scoped after tag overlay so session-created
 * tags can receive session-created links.
 */
export class TagDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    tagSystemIds: number[] | 'all',
    fileSystemId: number,
    sessionId: number | null,
    filters?: TagDefinitionFilters,
  ): Promise<OverlaidTagDefinition[]> {
    if (Array.isArray(tagSystemIds) && tagSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.TagDefinition)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.keys', 'l')
      .where('t.fileSystemId = :fileSystemId', {fileSystemId});
    if (tagSystemIds !== 'all') {
      qb.andWhere('t.systemId IN (:...tagSystemIds)', {tagSystemIds});
    }
    if (filters) applyEntityFilters(qb, 't', filters);

    const rows = (await qb.getMany()) as TagDefinitionRow[];
    const baseTags = rows as TagDefinitionBase[];
    const baseLinks = rows.flatMap(
      tag => (tag.keys ?? []) as TagKeyDefLinkBase[],
    );

    if (sessionId === null) {
      return this.buildResult(baseTags, this.groupLinks(baseLinks));
    }

    const [linkActions, tagActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.TagKeyDefLink),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.TagDefinition),
    ]);
    const requestedTagIds =
      tagSystemIds === 'all' ? undefined : new Set(tagSystemIds);
    const relevantTagActions = tagActions.filter(
      action =>
        requestedTagIds === undefined ||
        requestedTagIds.has(action.targetSystemId),
    );
    const createTagFilter = (newValue: Record<string, unknown>) =>
      newValue.fileSystemId === fileSystemId &&
      (filters === undefined || matchesEntityFilters(newValue, filters));

    const allTags = this.overlay
      .applyToCollection(baseTags, relevantTagActions, createTagFilter)
      .map(row => row.effective);
    const tagSystemIdSet = new Set(allTags.map(tag => tag.systemId));
    const relevantLinkActions = linkActions.filter(action =>
      tagSystemIdSet.has(action.aggregateId),
    );
    const allLinks = this.overlay
      .applyToCollection(baseLinks, relevantLinkActions, newValue => {
        const tagSystemId = newValue.tagDefinitionSystemId;
        return (
          typeof tagSystemId === 'number' && tagSystemIdSet.has(tagSystemId)
        );
      })
      .map(row => row.effective);

    return this.buildResult(allTags, this.groupLinks(allLinks));
  }

  /** Returns one overlaid tag definition through the collection path. */
  async fetchOne(
    tagSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidTagDefinition | null> {
    const rows = await this.fetchMany([tagSystemId], fileSystemId, sessionId);
    return rows[0] ?? null;
  }

  private groupLinks(
    links: TagKeyDefLinkBase[],
  ): Map<number, TagKeyDefLinkBase[]> {
    const linksByTagId = new Map<number, TagKeyDefLinkBase[]>();
    for (const link of links) {
      const bucket = linksByTagId.get(link.tagDefinitionSystemId) ?? [];
      bucket.push(link);
      linksByTagId.set(link.tagDefinitionSystemId, bucket);
    }
    return linksByTagId;
  }

  private buildResult(
    tags: TagDefinitionBase[],
    linksByTagId: Map<number, TagKeyDefLinkBase[]>,
  ): OverlaidTagDefinition[] {
    return tags.map(tag => ({
      ...tag,
      links: linksByTagId.get(tag.systemId) ?? [],
    }));
  }
}
