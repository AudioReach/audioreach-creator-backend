import {BaseBulkInsertResult} from '../base-implementation/base-bulk-inser-result.js';
import type {VcpmModuleDefinitionHierarchicalEntityResult} from './vcpm-module-definition-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {InsertSummary} from '../base-implementation/insert-summary.interface.js';

/**
 * Bulk result for VCPM Module Definition insert operations.
 * Tracks insertion results for VCPM module definitions and their parameters.
 */
export class BulkVcpmModuleDefinitionInsertResult extends BaseBulkInsertResult<
  VcpmModuleDefinitionHierarchicalEntityResult,
  BaseInsertError
> {
  private readonly _results: VcpmModuleDefinitionHierarchicalEntityResult[];
  private readonly _overallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: VcpmModuleDefinitionHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this._results = results;
    this._overallStatus = overallStatus;
  }

  get results(): VcpmModuleDefinitionHierarchicalEntityResult[] {
    return this._results;
  }

  get overallStatus(): HierarchicalInsertStatusValue {
    return this._overallStatus;
  }

  protected computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this._results.forEach(moduleResult => {
      // Count the module itself
      totalEntities++;
      if (moduleResult.status === 'SUCCESS') {
        successfulEntities++;
      } else {
        failedEntities++;
      }

      // Count parameter children
      moduleResult.parameterResults.forEach(paramResult => {
        totalEntities++;
        if (paramResult.status === 'SUCCESS') {
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
