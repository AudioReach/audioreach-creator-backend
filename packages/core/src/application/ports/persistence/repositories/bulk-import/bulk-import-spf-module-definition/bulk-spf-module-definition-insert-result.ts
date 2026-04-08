/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseBulkInsertResult} from '../base-bulk-import/base-bulk-inser-result.js';
import type {HierarchicalInsertStatusValue} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-bulk-import/base-insert-error.interface.js';
import type {InsertSummary} from '../base-bulk-import/insert-summary.interface.js';
import type {SpfModuleDefinitionHierarchicalEntityResult} from './spf-module-definition-hierarchical-entity-result.js';

/**
 * Bulk result for SPF Module Definition insert operations.
 * Tracks insertion results for SPF module definitions and all their children:
 * - Parameters
 * - Input/Output Data Port Groups (with static ports)
 * - Static Control Ports
 * - Dynamic Intents
 * - Attributes
 */
export class BulkSPfModuleDefinitionInsertResult extends BaseBulkInsertResult<
  SpfModuleDefinitionHierarchicalEntityResult,
  BaseInsertError
> {
  private readonly _results: SpfModuleDefinitionHierarchicalEntityResult[];
  private readonly _overallStatus: HierarchicalInsertStatusValue;

  constructor(
    results: SpfModuleDefinitionHierarchicalEntityResult[],
    overallStatus: HierarchicalInsertStatusValue,
  ) {
    super();
    this._results = results;
    this._overallStatus = overallStatus;
  }

  get results(): SpfModuleDefinitionHierarchicalEntityResult[] {
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

      // Count param children
      moduleResult.paramResults.forEach(paramResult => {
        totalEntities++;
        if (paramResult.status === 'SUCCESS') {
          successfulEntities++;
        } else {
          failedEntities++;
        }
      });

      // Count input data port group and its static ports
      if (moduleResult.inputDataPortGroupResult) {
        totalEntities++;
        if (moduleResult.inputDataPortGroupResult.status === 'SUCCESS') {
          successfulEntities++;
        } else {
          failedEntities++;
        }

        moduleResult.inputDataPortGroupResult.staticPortResults.forEach(
          portResult => {
            totalEntities++;
            if (portResult.status === 'SUCCESS') {
              successfulEntities++;
            } else {
              failedEntities++;
            }
          },
        );
      }

      // Count output data port group and its static ports
      if (moduleResult.outputDataPortGroupResult) {
        totalEntities++;
        if (moduleResult.outputDataPortGroupResult.status === 'SUCCESS') {
          successfulEntities++;
        } else {
          failedEntities++;
        }

        moduleResult.outputDataPortGroupResult.staticPortResults.forEach(
          portResult => {
            totalEntities++;
            if (portResult.status === 'SUCCESS') {
              successfulEntities++;
            } else {
              failedEntities++;
            }
          },
        );
      }

      // Count static control ports
      moduleResult.staticControlPortResults.forEach(portResult => {
        totalEntities++;
        if (portResult.status === 'SUCCESS') {
          successfulEntities++;
        } else {
          failedEntities++;
        }
      });

      // Count dynamic intents
      moduleResult.dynamicIntentResults.forEach(intentResult => {
        totalEntities++;
        if (intentResult.status === 'SUCCESS') {
          successfulEntities++;
        } else {
          failedEntities++;
        }
      });

      // Count attributes
      moduleResult.attributeResults.forEach(attributeResult => {
        totalEntities++;
        if (attributeResult.status === 'SUCCESS') {
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
