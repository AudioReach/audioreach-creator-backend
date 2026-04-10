/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';
import type {HierarchicalEntityResult} from '../bulk-import-interface/hierarchical-entity-result.interface.js';
/**
 * Interface defining the contract for Tag Definition entity results.
 * Represents the result of a tag definition insert operation.
 * Mirrors the TagDefinition domain aggregate structure with its children:
 * - TagDefKeyDefLink[] (keysAllowed - links to key definitions)
 */
export interface TagDefinitionEntityResult extends HierarchicalEntityResult<BaseInsertError> {
  /**
   * Gets the readonly array of tag-key definition link results
   */
  readonly tagKeyLinkResults: ReadonlyArray<
    HierarchicalEntityResult<BaseInsertError>
  >;
}
