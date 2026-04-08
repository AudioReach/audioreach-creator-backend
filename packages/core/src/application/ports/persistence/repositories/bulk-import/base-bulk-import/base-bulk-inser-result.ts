/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BaseHierarchicalEntityResult,
  HierarchicalInsertStatusValue,
} from './base-hierarchical-entity-result.js';
import type {BaseInsertError} from './base-insert-error.interface.js';
import type {InsertSummary} from './insert-summary.interface.js';

export abstract class BaseBulkInsertResult<
  TResult extends BaseHierarchicalEntityResult<TError>,
  TError extends BaseInsertError,
> {
  private _summary?: InsertSummary;
  abstract get results(): TResult[];
  abstract get overallStatus(): HierarchicalInsertStatusValue;

  get allErrors(): TError[] {
    return this.results.flatMap(r => r.errors);
  }

  get errorCount(): number {
    return this.allErrors.length;
  }

  get insertSummary(): InsertSummary {
    if (!this._summary) {
      this._summary = this.computeSummary();
    }
    return this._summary;
  }

  protected abstract computeSummary(): InsertSummary;
}
