/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from './base-insert-error.interface.js';
import type {HierarchicalEntityResult} from './hierarchical-entity-result.interface.js';
import type {InsertSummary} from './insert-summary.interface.js';
import type {HierarchicalInsertStatusValue} from './hierarchical-entity-result.interface.js';

/**
 * Interface defining the contract for bulk insert results.
 * Represents the result of a bulk insert operation with hierarchical entity results.
 */

export interface BulkInsertResult<
  TResult extends HierarchicalEntityResult<BaseInsertError>,
> {
  /**
   * Gets the readonly array of hierarchical entity results
   */
  readonly results: ReadonlyArray<TResult>;

  /**
   * Gets the overall status of the bulk insert operation
   */
  readonly overallStatus: HierarchicalInsertStatusValue;

  /**
   * Gets all errors from all entity results
   */
  readonly allErrors: BaseInsertError[];

  /**
   * Gets the total count of errors
   */
  readonly errorCount: number;

  /**
   * Gets the insert summary with statistics
   */
  readonly insertSummary: InsertSummary;
}
