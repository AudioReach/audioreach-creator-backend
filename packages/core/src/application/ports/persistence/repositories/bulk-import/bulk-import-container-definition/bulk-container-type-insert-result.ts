import {BaseBulkInsertResult} from '../base-implementation/base-bulk-inser-result.js';
import type {ContainerTypeHierarchicalEntityResult} from './container-type-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {InsertSummary} from '../base-implementation/insert-summary.interface.js';

/**
 * Bulk result for Container Type insert operations.
 * ContainerType is a simple entity with no children.
 */
export class BulkContainerTypeInsertResult extends BaseBulkInsertResult<
  ContainerTypeHierarchicalEntityResult,
  BaseInsertError
> {
  private readonly _results: ContainerTypeHierarchicalEntityResult[];
  private readonly _overallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: ContainerTypeHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this._results = results;
    this._overallStatus = overallStatus;
  }

  get results(): ContainerTypeHierarchicalEntityResult[] {
    return this._results;
  }

  get overallStatus(): HierarchicalInsertStatusValue {
    return this._overallStatus;
  }

  protected computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this._results.forEach(containerTypeResult => {
      // Count the container type itself (no children)
      totalEntities++;
      if (containerTypeResult.status === 'SUCCESS') {
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
