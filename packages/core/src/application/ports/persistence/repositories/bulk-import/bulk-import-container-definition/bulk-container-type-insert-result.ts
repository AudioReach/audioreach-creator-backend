/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseBulkInsertResult} from '../../../../../../../../infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/bulk-import-helper/base-bulk-import/base-bulk-insert-result.js';
import {
  HIERARCHICAL_INSERT_STATUS,
  type HierarchicalInsertStatusValue,
} from '../../../../../../../../infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/bulk-import-helper/base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';
import type {InsertSummary} from '../bulk-import-interface/insert-summary.interface.js';
import type {ContainerTypeHierarchicalEntityResult} from './container-type-hierarchical-entity-result.js';

/**
 * Bulk result for Container Type insert operations.
 * ContainerType is a simple entity with no children.
 */
export class BulkContainerTypeInsertResult extends BaseBulkInsertResult<
  ContainerTypeHierarchicalEntityResult,
  BaseInsertError
> {
  private internalResults: ContainerTypeHierarchicalEntityResult[];
  private internalOverallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: ContainerTypeHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this.internalResults = results;
    this.internalOverallStatus = overallStatus;
  }

  get results(): ReadonlyArray<ContainerTypeHierarchicalEntityResult> {
    return this.internalResults;
  }

  get overallStatus(): HierarchicalInsertStatusValue {
    return this.internalOverallStatus;
  }

  protected computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this.internalResults.forEach(containerTypeResult => {
      // Count the container type itself (no children)
      totalEntities++;
      if (containerTypeResult.status === HIERARCHICAL_INSERT_STATUS.SUCCESS) {
        successfulEntities++;
      } else {
        failedEntities++;
      }
    });

    return {
      totalEntities,
      successfulEntities,
      failedEntities,
    };
  }
}
