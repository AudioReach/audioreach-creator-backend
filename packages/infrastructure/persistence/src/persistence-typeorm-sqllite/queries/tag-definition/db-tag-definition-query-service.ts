/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  TagDefinitionQueryService,
  TagDefinitionReadModel,
  TagKeyDefinitionReadModel,
  KeyValueDefQueryService,
} from '@arc/core';
import {Result, ERROR_CODES, IssueSeverity, RESULT_KIND} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {
  TagDefinitionFetcher,
  type OverlaidTagDefinition,
} from '../../fetchers/definitions/tag-key-value/tag-definition-fetcher.js';

/**
 * Database implementation of TagDefinitionQueryService.
 *
 * All overlay delegated to TagDefinitionFetcher (FR-3):
 *   fetchAll         — all tag_definitions + tag_key_def_links with session overlay
 *   fetchBySystemIds — scoped to specific tag system IDs
 *
 * Key definition resolution (keyReferenceSystemId → name/values) is
 * cross-aggregate enrichment delegated to KeyValueDefQueryService (FR-4).
 * This must happen after the link overlay is finalized — the set of referenced
 * key system IDs is only known after overlay, so it cannot be parallelised with it.
 */
export class DbTagDefinitionQueryService implements TagDefinitionQueryService {
  private readonly tagFetcher: TagDefinitionFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
  ) {
    this.tagFetcher = new TagDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  async getAllTagDefinitions(
    fileSystemId: number,
    tagNaturalId?: number,
  ): Promise<Result<TagDefinitionReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Overlay applied by fetcher (FR-3).
      const overlaidTags = await this.tagFetcher.fetchAll(
        fileSystemId,
        sessionId,
      );

      // Filter by tagId after overlay so session-added/updated tags are filterable.
      const filtered =
        tagNaturalId === undefined
          ? overlaidTags
          : overlaidTags.filter(t => t.tagId === tagNaturalId);

      return this.resolveAndMap(filtered, fileSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load tag definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getTagDefinition(
    fileSystemId: number,
    tagSystemId: number,
  ): Promise<TagDefinitionReadModel | null> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );

    // fetchBySystemIds handles the session-only CREATE case — an empty base
    // list is passed through overlay and session CREATEs are still appended.
    const overlaidTags = await this.tagFetcher.fetchBySystemIds(
      [tagSystemId],
      fileSystemId,
      sessionId,
    );

    const overlaid = overlaidTags.find(t => t.systemId === tagSystemId);
    if (!overlaid) return null;

    const result = await this.resolveAndMap([overlaid], fileSystemId);
    if (result.kind === RESULT_KIND.Fail) {
      throw new Error(
        result.issues[0]?.message ?? 'Failed to load key definitions for tag',
      );
    }

    return result.data[0] ?? null;
  }

  async getTagDefinitionsBySystemIds(
    tagSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<TagDefinitionReadModel[]>> {
    if (tagSystemIds.length === 0) return Result.ok([]);
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const overlaidTags = await this.tagFetcher.fetchBySystemIds(
        tagSystemIds,
        fileSystemId,
        sessionId,
      );
      return this.resolveAndMap(overlaidTags, fileSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load tag definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Returns the active session ID for the given file, or null.
   * project_sessions is not session-mutable — direct query is correct here.
   *
   * Resolves key definitions for the given overlaid tags and maps to
   * TagDefinitionReadModel[].
   *
   * KeyValueDefQueryService is used rather than KeyValueDefinitionFetcher
   * directly (FR-4): the service's read model has all the needed fields and
   * assembling the key-value read model here would duplicate logic that
   * belongs to the KeyValueDefQueryService (FR-6: read model ownership).
   *
   * Key IDs are scoped to only those referenced by these tags' links — not
   * every key in the file — to avoid loading unnecessary data.
   */
  private async resolveAndMap(
    tags: OverlaidTagDefinition[],
    fileSystemId: number,
  ): Promise<Result<TagDefinitionReadModel[]>> {
    const tagSystemIdSet = new Set(tags.map(t => t.systemId));
    const distinctKeyIds = [
      ...new Set(
        tags
          .flatMap(t => t.links)
          .filter(l => tagSystemIdSet.has(l.tagDefinitionSystemId))
          .map(l => l.keyReferenceSystemId),
      ),
    ];

    const allKeysResult =
      await this.keyValueDefSvc.getKeyDefinitionsBySystemIds(
        distinctKeyIds,
        fileSystemId,
      );
    if (allKeysResult.kind === RESULT_KIND.Fail)
      return Result.fail(...allKeysResult.issues);

    const keyMap = new Map(allKeysResult.data.map(k => [k.systemId, k]));

    const mapped = tags.map(t => {
      // flatMap: skip links whose key was not resolved (deleted in session or missing)
      const keys: TagKeyDefinitionReadModel[] = t.links.flatMap(l => {
        const keyDefinition = keyMap.get(l.keyReferenceSystemId);
        if (!keyDefinition) return [];
        return [{cHeaderTagEnumMemberName: l.tagEnumValue, keyDefinition}];
      });

      return {
        systemId: t.systemId,
        tagId: t.tagId,
        name: t.name,
        description: t.description,
        isVoice: t.isVoice,
        cHeaderEnumName: t.cHeaderEnumName,
        cHeaderEnumMember: t.cHeaderEnumValue,
        keys,
      } satisfies TagDefinitionReadModel;
    });

    const issues = allKeysResult.issues;
    return issues && issues.length > 0
      ? Result.partial(mapped, issues)
      : Result.ok(mapped);
  }
}
