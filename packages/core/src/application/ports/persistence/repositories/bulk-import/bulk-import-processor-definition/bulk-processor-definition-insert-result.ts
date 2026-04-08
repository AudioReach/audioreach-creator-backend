/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseBulkInsertResult} from '../base-bulk-import/base-bulk-inser-result.js';
import type {HierarchicalInsertStatusValue} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-bulk-import/base-insert-error.interface.js';
import type {InsertSummary} from '../base-bulk-import/insert-summary.interface.js';
import type {ProcessorDefinitionHierarchicalEntityResult} from './processor-definition-hierarchical-entity-result.js';

/**
 * Bulk result for Processor Definition insert operations.
 * ProcessorDefinition is a simple entity with no children.
 */
export class BulkProcessorDefinitionInsertResult extends BaseBulkInsertResult<
  ProcessorDefinitionHierarchicalEntityResult,
  BaseInsertError
> {
  private readonly _results: ProcessorDefinitionHierarchicalEntityResult[];
  private readonly _overallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: ProcessorDefinitionHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this._results = results;
    this._overallStatus = overallStatus;
  }

  get results(): ProcessorDefinitionHierarchicalEntityResult[] {
    return this._results;
  }

  get overallStatus(): HierarchicalInsertStatusValue {
    return this._overallStatus;
  }

  protected computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this._results.forEach(processorResult => {
      // Count the processor itself (no children)
      totalEntities++;
      if (processorResult.status === 'SUCCESS') {
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
