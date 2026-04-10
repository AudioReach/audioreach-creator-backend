/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseHierarchicalEntityResult} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError, HierarchicalInsertStatusValue} from '@arc/core';

/**
 * Hierarchical result for Data Port Definition entity (leaf node).
 */
export class DataPortDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  constructor(
    aggregateDetails: string,
    entityDetails: string,
  ) {
    super(aggregateDetails, entityDetails);
  }

  get errors(): ReadonlyArray<BaseInsertError> {
    return this.internalErrors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this.internalStatus;
  }

  getChildren(): ReadonlyArray<BaseHierarchicalEntityResult<BaseInsertError>> {
    return [];
  }
}
