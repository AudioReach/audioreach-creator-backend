/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseHierarchicalEntityResult} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError, HierarchicalInsertStatusValue} from '@arc/core';
import type {DataPortDefinitionHierarchicalEntityResult} from './data-port-definition-hierarchical-entity-result.js';

/**
 * Hierarchical result for Data Port Group Definition entity.
 * Contains results for static data port definitions.
 */
export class DataPortGroupDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly internalStaticPortResults: DataPortDefinitionHierarchicalEntityResult[];

  constructor(
    aggregateDetails: string,
    entityDetails: string,
  ) {
    super(aggregateDetails, entityDetails);
    this.internalStaticPortResults = [];
  }

  get errors(): ReadonlyArray<BaseInsertError> {
    return this.internalErrors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this.internalStatus;
  }

  getChildren(): ReadonlyArray<BaseHierarchicalEntityResult<BaseInsertError>> {
    return this.internalStaticPortResults;
  }

  get staticPortResults(): ReadonlyArray<DataPortDefinitionHierarchicalEntityResult> {
    return this.internalStaticPortResults;
  }
}
