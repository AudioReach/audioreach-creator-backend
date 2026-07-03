/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../../shared/result/result.js';
import type {TagDefinitionReadModel} from './tag-definition-read-model.js';

export interface TagDefinitionQueryService {
  /**
   * Returns all tag definitions for the given file, with associated key
   * definitions (and their values) embedded. Optional tagId filters by
   * natural ACDB tag_id. Overlay is always applied.
   *
   * Key resolution is delegated to
   * KeyValueDefQueryService.getKeyDefinitionsBySystemIds, scoped to only
   * the keys these tags actually reference — a key-level failure surfaces
   * here as a partial result. Result.ok when everything resolved cleanly;
   * Result.partial(data, errors) when some tags/keys failed; Result.fail
   * only if the top-level query itself throws.
   */
  getAllTagDefinitions(
    fileSystemId: number,
    tagNaturalId?: number,
  ): Promise<Result<TagDefinitionReadModel[]>>;

  /**
   * Returns a single tag definition for the given file, with associated key
   * definitions (and their values) embedded. Overlay is always applied.
   * Returns null if absent from both DB and session.
   */
  getTagDefinition(
    fileSystemId: number,
    tagSystemId: number,
  ): Promise<TagDefinitionReadModel | null>;

  /**
   * Batch — returns the overlaid TagDefinitionReadModels for the given tag
   * systemIds, with associated key definitions (and their values) embedded.
   * Ids that don't resolve (absent from DB and overlay) are silently
   * omitted. Result.fail only if the underlying query itself throws.
   */
  getTagDefinitionsBySystemIds(
    tagSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<TagDefinitionReadModel[]>>;
}
