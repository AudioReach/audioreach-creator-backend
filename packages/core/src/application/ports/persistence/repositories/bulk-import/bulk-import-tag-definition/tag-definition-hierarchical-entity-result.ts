/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseHierarchicalEntityResult,
  type HierarchicalInsertStatusValue,
} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-bulk-import/base-insert-error.interface.js';
import type {TagDefKeyDefLinkHierarchicalEntityResult} from './tag-def-key-def-link-hierarchical-entity-result.js';

/**
 * Hierarchical result for Tag Definition entity.
 * Mirrors the TagDefinition domain aggregate structure with its children:
 * - TagDefKeyDefLink[] (keysAllowed - links to key definitions)
 */
export class TagDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;
  private readonly _tagKeyLinkResults: TagDefKeyDefLinkHierarchicalEntityResult[];

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
    tagKeyLinkResults: TagDefKeyDefLinkHierarchicalEntityResult[] = [],
  ) {
    super();
    this._errors = errors;
    this._status = status;
    this._tagKeyLinkResults = tagKeyLinkResults;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    return this._tagKeyLinkResults;
  }

  get tagKeyLinkResults(): TagDefKeyDefLinkHierarchicalEntityResult[] {
    return this._tagKeyLinkResults;
  }
}
