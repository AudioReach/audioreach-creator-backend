/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  HIERARCHICAL_INSERT_STATUS,
  type BaseInsertError,
  type BulkInsertResult,
  type HierarchicalEntityResult,
  type HierarchicalInsertStatusValue,
  type InsertSummary,
} from '@arc/core';

export abstract class BaseBulkInsertResult<
  TResult extends HierarchicalEntityResult<BaseInsertError>,
> implements BulkInsertResult<TResult> {
  private summary?: InsertSummary;
  abstract get results(): ReadonlyArray<TResult>;
  abstract get overallStatus(): HierarchicalInsertStatusValue;

  get allErrors(): BaseInsertError[] {
    return this.results.flatMap(r => r.errors);
  }

  get errorCount(): number {
    return this.allErrors.length;
  }

  get insertSummary(): InsertSummary {
    if (!this.summary) {
      this.summary = this.computeSummary();
    }
    return this.summary;
  }

  public computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this.results.forEach(keyResult => {
      // Count the key itself
      totalEntities++;
      if (keyResult.status === HIERARCHICAL_INSERT_STATUS.success) {
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
