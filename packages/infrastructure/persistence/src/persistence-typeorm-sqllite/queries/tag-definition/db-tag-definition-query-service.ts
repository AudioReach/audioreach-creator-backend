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
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ProjectSessionRow} from '../../entity-schema/index.js';
import type {TagDefinitionRow} from '../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';

type OverlaidTagDefinitionRow = TagDefinitionRow & {
  overlaidLinks: TagKeyDefinitionReadModel[];
};

export class DbTagDefinitionQueryService implements TagDefinitionQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
  ) {}

  async getAllTagDefinitions(
    fileSystemId: number,
    tagNaturalId?: number,
  ): Promise<Result<TagDefinitionReadModel[]>> {
    try {
      // Step 1 — QueryBuilder: all tags for the file + linked keys (key/value
      // resolution is delegated to KeyValueDefQueryService, so no nested joins here)
      const rows = (await this.dataSource
        .getRepository(ENTITY_NAMES.TagDefinition)
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.keys', 'l')
        .where('t.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as TagDefinitionRow[];

      // Step 2 — Overlay + key/value resolution, session may be null
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaidResult = await this.overlayTagDefinitionRows(
        rows,
        session,
        fileSystemId,
      );
      if (overlaidResult.kind === RESULT_KIND.Fail)
        return Result.fail(...overlaidResult.issues);

      // Step 3 — Filter by tagId after overlay so session-added/updated tags stay filterable
      const filtered =
        tagNaturalId === undefined
          ? overlaidResult.data
          : overlaidResult.data.filter(t => t.tagId === tagNaturalId);

      // Step 4 — Map to TagDefinitionReadModel
      const mapped = filtered.map(t => this.toTagDefinitionReadModel(t));

      const issues = overlaidResult.issues;
      return issues && issues.length > 0
        ? Result.partial(mapped, issues)
        : Result.ok(mapped);
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
    // Step 1 — QueryBuilder: tag + linked keys
    const row = (await this.dataSource
      .getRepository(ENTITY_NAMES.TagDefinition)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.keys', 'l')
      .where('t.systemId = :id', {id: tagSystemId})
      .andWhere('t.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as TagDefinitionRow | null;

    // Step 2 — Overlay + key/value resolution. A null row is still passed
    // through (as an empty base list) so a session-only CREATE can resolve.
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const baseRows = row ? [row] : [];
    const overlaidResult = await this.overlayTagDefinitionRows(
      baseRows,
      session,
      fileSystemId,
    );
    if (overlaidResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        overlaidResult.issues[0]?.message ??
          'Failed to load key definitions for tag',
      );
    }

    const overlaid = overlaidResult.data.find(t => t.systemId === tagSystemId);
    if (!overlaid) return null;

    // Step 3 — Map to TagDefinitionReadModel
    return this.toTagDefinitionReadModel(overlaid);
  }

  async getTagDefinitionsBySystemIds(
    tagSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<TagDefinitionReadModel[]>> {
    if (tagSystemIds.length === 0) return Result.ok([]);
    try {
      const rows = (await this.dataSource
        .getRepository(ENTITY_NAMES.TagDefinition)
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.keys', 'l')
        .where('t.systemId IN (:...ids)', {ids: tagSystemIds})
        .andWhere('t.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as TagDefinitionRow[];

      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaidResult = await this.overlayTagDefinitionRows(
        rows,
        session,
        fileSystemId,
      );
      if (overlaidResult.kind === RESULT_KIND.Fail)
        return Result.fail(...overlaidResult.issues);

      const mapped = overlaidResult.data.map(t =>
        this.toTagDefinitionReadModel(t),
      );

      const issues = overlaidResult.issues;
      return issues && issues.length > 0
        ? Result.partial(mapped, issues)
        : Result.ok(mapped);
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

  // ── private overlay methods ──────────────────────────────────────────────

  /**
   * Applies overlay to TagDefinition rows and their TagKeyDefLink rows —
   * one table-wide getEditActionsByTable query per table (two total when a
   * session is active), not one per row/link. Those two table-wide fetches
   * are independent of each other and run concurrently.
   *
   * Key/value resolution is delegated to
   * KeyValueDefQueryService.getKeyDefinitionsBySystemIds, scoped to only
   * the key systemIds these tags' overlaid links actually reference — not
   * every key in the file. This must run after the link overlay is known
   * (the scope is derived from it), so it can't join the two-way Promise.all
   * above.
   *
   * session may be null (no active edit session) — getEditActionsByTable
   * calls are skipped in that case and base rows pass through unchanged.
   *
   * Links whose key definition resolves to nothing (deleted in session, or
   * failed to resolve) are dropped — a tag can never point at a nonexistent key.
   */
  private async overlayTagDefinitionRows(
    baseRows: TagDefinitionRow[],
    session: ProjectSessionRow | null,
    fileSystemId: number,
  ): Promise<Result<OverlaidTagDefinitionRow[]>> {
    const baseLinks = baseRows.flatMap(t => t.keys ?? []);

    const [linkActions, tagActions] = await Promise.all([
      session
        ? this.editActionsSvc.getEditActionsByTable(
            session.sessionId,
            ENTITY_NAMES.TagKeyDefLink,
          )
        : Promise.resolve([]),
      session
        ? this.editActionsSvc.getEditActionsByTable(
            session.sessionId,
            ENTITY_NAMES.TagDefinition,
          )
        : Promise.resolve([]),
    ]);

    const overlaidLinkRows = applyToCollection(baseLinks, linkActions);
    const overlaidTags = applyToCollection(baseRows, tagActions);

    // Scope the key fetch to only the keys these tags' links reference,
    // not every key in the file.
    const tagSystemIdSet = new Set(overlaidTags.map(t => t.systemId));
    const relevantLinkRows = overlaidLinkRows.filter(l =>
      tagSystemIdSet.has(l.tagDefinitionSystemId),
    );
    const distinctKeyIds = [
      ...new Set(relevantLinkRows.map(l => l.keyReferenceSystemId)),
    ];

    const allKeysResult =
      await this.keyValueDefSvc.getKeyDefinitionsBySystemIds(
        distinctKeyIds,
        fileSystemId,
      );
    if (allKeysResult.kind === RESULT_KIND.Fail)
      return Result.fail(...allKeysResult.issues);
    const keyMap = new Map(allKeysResult.data.map(k => [k.systemId, k]));

    const linksByTagSystemId = new Map<number, TagKeyDefinitionReadModel[]>();
    for (const l of overlaidLinkRows) {
      const keyDefinition = keyMap.get(l.keyReferenceSystemId);
      if (!keyDefinition) continue;
      const bucket = linksByTagSystemId.get(l.tagDefinitionSystemId) ?? [];
      bucket.push({
        cHeaderTagEnumMemberName: l.tagEnumValue,
        keyDefinition,
      });
      linksByTagSystemId.set(l.tagDefinitionSystemId, bucket);
    }

    const data = overlaidTags.map(t => ({
      ...t,
      overlaidLinks: linksByTagSystemId.get(t.systemId) ?? [],
    }));

    const issues = allKeysResult.issues;
    return issues && issues.length > 0
      ? Result.partial(data, issues)
      : Result.ok(data);
  }

  private toTagDefinitionReadModel(
    row: OverlaidTagDefinitionRow,
  ): TagDefinitionReadModel {
    return {
      systemId: row.systemId,
      tagId: row.tagId,
      name: row.name,
      description: row.description,
      isVoice: row.isVoice,
      cHeaderEnumName: row.cHeaderEnumName,
      cHeaderEnumMember: row.cHeaderEnumValue,
      keys: row.overlaidLinks,
    };
  }
}
