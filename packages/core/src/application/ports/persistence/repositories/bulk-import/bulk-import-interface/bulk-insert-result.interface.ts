/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from './base-insert-error.interface.js';
import type { HierarchicalInsertStatusValue } from './base-entity-result.interface.js';
import type {InsertSummary} from './insert-summary.interface.js';

/**
 * Interface defining the contract for bulk insert results.
 * Represents the result of a bulk insert operation with hierarchical entity results.
 */

export interface BulkInsertResult<
  TResult extends BaseEntityResult<BaseInsertError>,
> {
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
