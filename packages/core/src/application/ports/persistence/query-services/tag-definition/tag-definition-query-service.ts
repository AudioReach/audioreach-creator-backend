/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TagDefinitionReadModel} from './tag-definition-read-model.js';
import type {BatchRead} from '../../batch-read.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';

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
  ): Promise<
    BatchRead<TagDefinitionReadModel, typeof ENTITY_TYPE.TagDefinition>
  >;

  /**
   * The requested tag definitions. Missing IDs are reported in `failed` as
   * `NOT_FOUND`.
   */
  findTagDefinitions(
    fileSystemId: number,
    tagSystemIds: readonly number[],
  ): Promise<
    BatchRead<TagDefinitionReadModel, typeof ENTITY_TYPE.TagDefinition>
  >;

  /**
   * Reads the identities of the given tag definitions. A systemId that is not
   * a tag definition of the file is `NOT_FOUND`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findTagDefinitionIdentities(
    fileSystemId: number,
    tagSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.TagDefinition>,
      typeof ENTITY_TYPE.TagDefinition
    >
  >;
}
