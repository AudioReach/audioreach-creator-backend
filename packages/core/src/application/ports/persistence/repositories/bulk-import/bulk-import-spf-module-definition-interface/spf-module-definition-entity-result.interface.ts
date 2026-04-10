/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';
import type {HierarchicalEntityResult} from '../bulk-import-interface/hierarchical-entity-result.interface.js';
import type {DataPortGroupDefinitionEntityResult} from './data-port-group-definition-entity-result.interface.js';

/**
 * Interface for SPF Module Definition hierarchical entity result.
 * Mirrors the SpfModuleDefinition domain aggregate structure with all its children:
 * - ParamDefinition[] (from base ModuleDefinition)
 * - InputDataPortGroup (with DataPortDefinition[])
 * - OutputDataPortGroup (with DataPortDefinition[])
 * - StaticControlPortDefinition[]
 * - DynamicIntentDefinition[]
 * - Attribute[]
 */
export interface SpfModuleDefinitionEntityResult extends HierarchicalEntityResult<BaseInsertError> {
  /**
   * Gets the readonly array of parameter definition results (from base ModuleDefinition)
   */
  readonly paramResults: ReadonlyArray<
    HierarchicalEntityResult<BaseInsertError>
  >;

  /**
   * Gets the input data port group result (nullable)
   */
  readonly inputDataPortGroupResult: ReadonlyArray<DataPortGroupDefinitionEntityResult>;

  /**
   * Gets the output data port group result (nullable)
   */
  readonly outputDataPortGroupResult: ReadonlyArray<DataPortGroupDefinitionEntityResult>;

  /**
   * Gets the readonly array of static control port definition results
   */
  readonly staticControlPortResults: ReadonlyArray<
    HierarchicalEntityResult<BaseInsertError>
  >;

  /**
   * Gets the readonly array of dynamic intent definition results
   */
  readonly dynamicIntentResults: ReadonlyArray<
    HierarchicalEntityResult<BaseInsertError>
  >;

  /**
   * Gets the readonly array of attribute results
   */
  readonly attributeResults: ReadonlyArray<
    HierarchicalEntityResult<BaseInsertError>
  >;
}
