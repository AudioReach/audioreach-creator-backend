/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TagDefinitionReadModel} from './tag-definition-read-model.js';
import type {BatchRead} from '../../batch-read.js';

/** Narrows `findAllTagDefinitions` to the tags that match every field. */
export interface TagDefinitionFilter {
  readonly naturalId?: number;
}

/**
 * Tag definition reads, with the session overlay applied. Each tag carries
 * the key definitions it links to. A tag that links to a missing key is
 * reported in `failed` as `UNRESOLVED_REFERENCE`. All methods throw on
 * infrastructure errors.
 */
export interface TagDefinitionQueryService {
  /** Every tag definition in the file. */
  findAllTagDefinitions(
    fileSystemId: number,
    filter?: TagDefinitionFilter,
  ): Promise<BatchRead<TagDefinitionReadModel, 'TagDefinition'>>;

  /**
   * The requested tag definitions. Missing IDs are reported in `failed` as
   * `NOT_FOUND`.
   */
  findTagDefinitions(
    fileSystemId: number,
    tagSystemIds: readonly number[],
  ): Promise<BatchRead<TagDefinitionReadModel, 'TagDefinition'>>;
}
