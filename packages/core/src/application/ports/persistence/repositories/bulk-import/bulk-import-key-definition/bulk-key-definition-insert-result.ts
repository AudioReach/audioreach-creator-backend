/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseBulkInsertResult} from '../base-bulk-import/base-bulk-inser-result.js';
import type {HierarchicalInsertStatusValue} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-bulk-import/base-insert-error.interface.js';
import type {InsertSummary} from '../base-bulk-import/insert-summary.interface.js';
import type {KeyDefinitionHierarchicalEntityResult} from './key-definition-hierarchical-entity-result.js';

/**
 * Bulk result for Key Definition insert operations.
 */
export class BulkKeyDefinitionInsertResult extends BaseBulkInsertResult<
  KeyDefinitionHierarchicalEntityResult,
  BaseInsertError
> {
  private readonly _results: KeyDefinitionHierarchicalEntityResult[];
  private readonly _overallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: KeyDefinitionHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this._results = results;
    this._overallStatus = overallStatus;
  }

  get results(): KeyDefinitionHierarchicalEntityResult[] {
    return this._results;
  }

  get overallStatus(): HierarchicalInsertStatusValue {
    return this._overallStatus;
  }

  protected computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this._results.forEach(keyResult => {
      // Count the key itself
      totalEntities++;
      if (keyResult.status === 'SUCCESS') {
        successfulEntities++;
      } else {
        failedEntities++;
      }

      // Count all value children
      keyResult.valueResults.forEach(valueResult => {
        totalEntities++;
        if (valueResult.status === 'SUCCESS') {
          successfulEntities++;
        } else {
          failedEntities++;
        }
      });
    });

    return {
      totalEntities,
      successfulEntities,
      failedEntities,
    };
  }
}
