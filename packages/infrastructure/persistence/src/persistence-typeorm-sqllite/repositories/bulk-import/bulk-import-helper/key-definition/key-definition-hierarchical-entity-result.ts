/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '@arc/core';
import {BaseHierarchicalEntityResult} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {KeyDefinitionEntityResult} from '@arc/core';

/**
 * Hierarchical result for Key Definition entity.
 * KeyDefinition has ValueDefinition children.
 */
export class KeyDefinitionHierarchicalEntityResult
  extends BaseHierarchicalEntityResult<BaseInsertError>
  implements KeyDefinitionEntityResult
{
  private internalValueResults: BaseHierarchicalEntityResult<BaseInsertError>[];

  constructor(aggregateDetails: string, entityDetails: string) {
    super(aggregateDetails, entityDetails);
    this.internalValueResults = [];
  }

  getChildren(): ReadonlyArray<BaseHierarchicalEntityResult<BaseInsertError>> {
    return this.internalValueResults;
  }

  get valueResults(): ReadonlyArray<
    BaseHierarchicalEntityResult<BaseInsertError>
  > {
    return this.internalValueResults;
  }

  addValueResult(
    valueResult: BaseHierarchicalEntityResult<BaseInsertError>,
  ): void {
    this.internalValueResults.push(valueResult);
  }
}
