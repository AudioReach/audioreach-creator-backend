/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkInsertResult} from '@arc/core';

/**
 * Interface for bulk entity inserters.
 * Defines the contract for inserting multiple entities in bulk operations.
 *
 * @template TDomain - Domain entity type
 */
export interface BulkInserter<TDomain> {
  /**
   * Insert entities in bulk and return comprehensive result.
   *
   * @param items - Array of domain entities to insert
   * @returns Promise resolving to BulkInsertResult containing status, errors, and summary
   */
  insert(items: TDomain[]): Promise<BulkInsertResult>;
}
