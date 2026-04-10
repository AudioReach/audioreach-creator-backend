/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BaseInsertError,
  HierarchicalInsertStatusValue,
  TagDefinitionEntityResult,
} from '@arc/core';
import {BaseHierarchicalEntityResult} from '../base-bulk-import/base-hierarchical-entity-result.js';

/**
 * Hierarchical result for Tag Definition entity.
 * Mirrors the TagDefinition domain aggregate structure with its children:
 * - TagDefKeyDefLink[] (keysAllowed - links to key definitions)
 */
export class TagDefinitionHierarchicalEntityResult
  extends BaseHierarchicalEntityResult<BaseInsertError>
  implements TagDefinitionEntityResult
{
  private internalTagKeyLinkResults: BaseHierarchicalEntityResult<BaseInsertError>[];

  constructor(aggregateDetails: string, entityDetails: string) {
    super(aggregateDetails, entityDetails);
    this.internalTagKeyLinkResults = [];
  }

  get errors(): ReadonlyArray<BaseInsertError> {
    return this.internalErrors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this.internalStatus;
  }

  getChildren(): ReadonlyArray<BaseHierarchicalEntityResult<BaseInsertError>> {
    return this.internalTagKeyLinkResults;
  }

  get tagKeyLinkResults(): ReadonlyArray<
    BaseHierarchicalEntityResult<BaseInsertError>
  > {
    return this.internalTagKeyLinkResults;
  }
}
