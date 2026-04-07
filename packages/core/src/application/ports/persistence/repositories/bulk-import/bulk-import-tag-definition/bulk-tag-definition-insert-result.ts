import {BaseBulkInsertResult} from '../base-implementation/base-bulk-inser-result.js';
import type {TagDefinitionHierarchicalEntityResult} from './tag-definition-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {InsertSummary} from '../base-implementation/insert-summary.interface.js';

/**
 * Bulk result for Tag Definition insert operations.
 * Tracks insertion results for tag definitions and their tag-key links.
 */
export class BulkTagDefinitionInsertResult extends BaseBulkInsertResult<
  TagDefinitionHierarchicalEntityResult,
  BaseInsertError
> {
  private readonly _results: TagDefinitionHierarchicalEntityResult[];
  private readonly _overallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: TagDefinitionHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this._results = results;
    this._overallStatus = overallStatus;
  }

  get results(): TagDefinitionHierarchicalEntityResult[] {
    return this._results;
  }

  get overallStatus(): HierarchicalInsertStatusValue {
    return this._overallStatus;
  }

  protected computeSummary(): InsertSummary {
    let totalEntities = 0;
    let successfulEntities = 0;
    let failedEntities = 0;

    this._results.forEach(tagResult => {
      // Count the tag itself
      totalEntities++;
      if (tagResult.status === 'SUCCESS') {
        successfulEntities++;
      } else {
        failedEntities++;
      }

      // Count tag-key link children
      tagResult.tagKeyLinkResults.forEach(linkResult => {
        totalEntities++;
        if (linkResult.status === 'SUCCESS') {
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
