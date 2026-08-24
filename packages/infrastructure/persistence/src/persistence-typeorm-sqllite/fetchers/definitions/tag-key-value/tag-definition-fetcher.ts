/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {TagDefinitionRow} from '../../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import type {TagKeyDefLinkRow} from '../../../entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';

export interface OverlaidTagLink {
  systemId: number;
  tagDefinitionSystemId: number;
  keyReferenceSystemId: number;
  tagEnumValue: string | undefined;
}

/**
 * Overlaid scalar fields from tag_definitions with owned tag_key_def_links
 * nested and session-overlaid.
 *
 * Key definition resolution (name, description, values) is NOT done here —
 * that is cross-aggregate enrichment delegated to KeyValueDefQueryService
 * in the query service layer (FR-4).
 */
export interface OverlaidTagDefinition {
  systemId: number;
  tagId: number;
  name: string;
  description: string | undefined;
  isVoice: boolean;
  cHeaderEnumName: string | undefined;
  cHeaderEnumValue: string | undefined;
  fileSystemId: number;
  /** Owned tag-key links with session overlay applied. */
  links: OverlaidTagLink[];
}

interface TagDefinitionBase {
  systemId: number;
  tagId: number;
  name: string;
  description?: string;
  isVoice: boolean;
  cHeaderEnumName?: string;
  cHeaderEnumValue?: string;
  fileSystemId: number;
}

interface TagKeyDefLinkBase {
  systemId: number;
  tagDefinitionSystemId: number;
  keyReferenceSystemId: number;
  tagEnumValue?: string;
}

/**
 * Fetches tag_definitions and their owned tag_key_def_links with session
 * overlay applied (FR-3).
 *
 * Two getByTable calls cover all overlay actions for both tables in one
 * round-trip pair regardless of tag count (FR-5 — not per-tag N calls).
 * The two calls are independent and run in parallel.
 *
 * Key definition resolution (keyReferenceSystemId → name/values) is left to
 * the service — it is cross-aggregate enrichment (FR-4) and must happen after
 * the link overlay is finalized (the set of referenced keys is only known
 * after overlay).
 */
export class TagDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all overlaid tag definitions for the given file.
   */
  async fetchAll(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidTagDefinition[]> {
    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.TagDefinition)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.keys', 'l')
      .where('t.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as TagDefinitionRow[];

    return this.applyOverlay(rows, sessionId, fileSystemId);
  }

  /**
   * Returns overlaid tag definitions for the given system IDs.
   */
  async fetchBySystemIds(
    tagSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidTagDefinition[]> {
    if (tagSystemIds.length === 0) return [];

    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.TagDefinition)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.keys', 'l')
      .where('t.systemId IN (:...ids)', {ids: tagSystemIds})
      .andWhere('t.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as TagDefinitionRow[];

    return this.applyOverlay(rows, sessionId, fileSystemId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async applyOverlay(
    baseRows: TagDefinitionRow[],
    sessionId: number | null,
    fileSystemId: number,
  ): Promise<OverlaidTagDefinition[]> {
    const baseLinks = baseRows.flatMap(
      t => (t.keys ?? []) as TagKeyDefLinkBase[],
    );

    if (sessionId === null) {
      const linksByTagId = new Map<number, TagKeyDefLinkBase[]>();
      for (const l of baseLinks) {
        const bucket = linksByTagId.get(l.tagDefinitionSystemId) ?? [];
        bucket.push(l);
        linksByTagId.set(l.tagDefinitionSystemId, bucket);
      }
      return this.buildResult(baseRows as TagDefinitionBase[], linksByTagId);
    }

    // Two independent table-wide overlay scans run in parallel — fixed cost
    // regardless of tag count (FR-5).
    const [linkActions, tagActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.TagKeyDefLink),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.TagDefinition),
    ]);

    // Apply overlay to tag definition rows.
    const overlaidTags =
      tagActions.length > 0
        ? (
            this.overlay.applyToCollection(
              baseRows as TagDefinitionBase[],
              tagActions,
            ) as Array<{effective: TagDefinitionBase}>
          ).map(r => r.effective)
        : (baseRows as TagDefinitionBase[]);

    // Handle CREATE'd tags not in the baseline.
    const baseTagIds = new Set(baseRows.map(r => r.systemId));
    const createdTags: TagDefinitionBase[] = tagActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseTagIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<TagDefinitionBase>;
        return {
          systemId: a.targetSystemId,
          tagId: p.tagId ?? 0,
          name: p.name ?? '',
          description: p.description,
          isVoice: Boolean(p.isVoice),
          cHeaderEnumName: p.cHeaderEnumName,
          cHeaderEnumValue: p.cHeaderEnumValue,
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    const allTags = [...overlaidTags, ...createdTags];

    // Apply overlay to tag-key link rows.
    const overlaidLinks =
      linkActions.length > 0
        ? this.overlay
            .applyToCollection(baseLinks, linkActions)
            .map(r => r.effective)
        : baseLinks;

    // Handle CREATE'd links not in the baseline.
    const baseLinkIds = new Set(
      baseLinks.map(l => (l as TagKeyDefLinkRow).systemId),
    );
    const createdLinks: TagKeyDefLinkBase[] = linkActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseLinkIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<TagKeyDefLinkBase>;
        return {
          systemId: a.targetSystemId,
          tagDefinitionSystemId: p.tagDefinitionSystemId ?? 0,
          keyReferenceSystemId: p.keyReferenceSystemId ?? 0,
          tagEnumValue: p.tagEnumValue,
        };
      });

    const allLinks = [...overlaidLinks, ...createdLinks];

    // Group links by their tag systemId — used for O(1) lookup during assembly.
    const tagSystemIdSet = new Set(allTags.map(t => t.systemId));
    const linksByTagId = new Map<number, TagKeyDefLinkBase[]>();
    for (const l of allLinks) {
      if (!tagSystemIdSet.has(l.tagDefinitionSystemId)) continue;
      const bucket = linksByTagId.get(l.tagDefinitionSystemId) ?? [];
      bucket.push(l);
      linksByTagId.set(l.tagDefinitionSystemId, bucket);
    }

    return this.buildResult(allTags, linksByTagId);
  }

  private buildResult(
    tags: TagDefinitionBase[],
    linksByTagId: Map<number, TagKeyDefLinkBase[]>,
  ): OverlaidTagDefinition[] {
    return tags.map(t => ({
      systemId: t.systemId,
      tagId: t.tagId,
      name: t.name,
      description: t.description,
      isVoice: t.isVoice,
      cHeaderEnumName: t.cHeaderEnumName,
      cHeaderEnumValue: t.cHeaderEnumValue,
      fileSystemId: t.fileSystemId,
      links: (linksByTagId.get(t.systemId) ?? []).map(l => ({
        systemId: l.systemId,
        tagDefinitionSystemId: l.tagDefinitionSystemId,
        keyReferenceSystemId: l.keyReferenceSystemId,
        tagEnumValue: l.tagEnumValue,
      })),
    }));
  }
}
