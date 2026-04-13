/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from './base-insert-error.interface.js';

export const HIERARCHICAL_INSERT_STATUS = {
  unknown: 'unknown',
  success: 'success',
  failed: 'failed',
} as const;

export type HierarchicalInsertStatusValue =
  (typeof HIERARCHICAL_INSERT_STATUS)[keyof typeof HIERARCHICAL_INSERT_STATUS];

/**
 * Interface defining the contract for hierarchical entity results.
 * Represents the result of a hierarchical insert operation with error tracking.
 */
export interface BaseEntityResult<TError extends BaseInsertError> {
  /**
   * Gets the readonly array of errors for this entity
   */
  readonly errors: ReadonlyArray<TError>;

  /**
   * Gets the insert status for this entity
   */
  readonly status: HierarchicalInsertStatusValue;

  /**
   * Indicates whether this entity has any errors
   */
  readonly hasErrors: boolean;
}
