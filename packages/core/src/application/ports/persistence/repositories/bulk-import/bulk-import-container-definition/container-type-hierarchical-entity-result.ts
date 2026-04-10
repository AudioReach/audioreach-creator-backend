/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseHierarchicalEntityResult,
  type HierarchicalInsertStatusValue,
} from '../../../../../../../../infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/bulk-import-helper/base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';

/**
 * Hierarchical result for Container Type entity (leaf node).
 * ContainerType has no children - it's a simple entity with systemId, name, and value.
 */
export class ContainerTypeHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  constructor(
    aggregateDetails: string,
    entityDetails: string,
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
  ) {
    super(aggregateDetails, entityDetails, errors, status);
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
