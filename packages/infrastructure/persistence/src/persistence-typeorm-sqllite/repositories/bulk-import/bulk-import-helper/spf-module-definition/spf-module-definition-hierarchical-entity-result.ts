/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BaseInsertError,
  DataPortGroupDefinitionEntityResult,
  HierarchicalInsertStatusValue,
  SpfModuleDefinitionEntityResult,
} from '@arc/core';
import {BaseHierarchicalEntityResult} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {DataPortGroupDefinitionHierarchicalEntityResult} from './data-port-group-definition-hierarchical-entity-result.js';

/**
 * Hierarchical result for SPF Module Definition entity.
 * Mirrors the SpfModuleDefinition domain aggregate structure with all its children:
 * - ParamDefinition[] (from base ModuleDefinition)
 * - InputDataPortGroup (with DataPortDefinition[])
 * - OutputDataPortGroup (with DataPortDefinition[])
 * - StaticControlPortDefinition[]
 * - DynamicIntentDefinition[]
 * - Attribute[]
 */
export class SpfModuleDefinitionHierarchicalEntityResult
  extends BaseHierarchicalEntityResult<BaseInsertError>
  implements SpfModuleDefinitionEntityResult
{
  // From base ModuleDefinition
  private internalParamResults: BaseHierarchicalEntityResult<BaseInsertError>[];

  // SPF-specific children
  private internalInputDataPortGroupResult: DataPortGroupDefinitionHierarchicalEntityResult[];
  private internalOutputDataPortGroupResult: DataPortGroupDefinitionHierarchicalEntityResult[];
  private internalStaticControlPortResults: BaseHierarchicalEntityResult<BaseInsertError>[];
  private internalDynamicIntentResults: BaseHierarchicalEntityResult<BaseInsertError>[];
  private internalAttributeResults: BaseHierarchicalEntityResult<BaseInsertError>[];

  constructor(aggregateDetails: string, entityDetails: string) {
    super(aggregateDetails, entityDetails);
    this.internalParamResults = [];
    this.internalInputDataPortGroupResult = [];
    this.internalOutputDataPortGroupResult = [];
    this.internalStaticControlPortResults = [];
    this.internalDynamicIntentResults = [];
    this.internalAttributeResults = [];
  }

  get errors(): ReadonlyArray<BaseInsertError> {
    return this.internalErrors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this.internalStatus;
  }

  getChildren(): ReadonlyArray<BaseHierarchicalEntityResult<BaseInsertError>> {
    const children: BaseHierarchicalEntityResult<BaseInsertError>[] = [
      ...this.internalParamResults,
      ...this.internalInputDataPortGroupResult,
      ...this.internalOutputDataPortGroupResult,
      ...this.internalStaticControlPortResults,
      ...this.internalDynamicIntentResults,
      ...this.internalAttributeResults,
    ];

    return children;
  }

  get paramResults(): ReadonlyArray<
    BaseHierarchicalEntityResult<BaseInsertError>
  > {
    return this.internalParamResults;
  }

  get inputDataPortGroupResult(): ReadonlyArray<DataPortGroupDefinitionEntityResult> {
    return this.internalInputDataPortGroupResult;
  }

  get outputDataPortGroupResult(): ReadonlyArray<DataPortGroupDefinitionEntityResult> {
    return this.internalOutputDataPortGroupResult;
  }

  get staticControlPortResults(): ReadonlyArray<
    BaseHierarchicalEntityResult<BaseInsertError>
  > {
    return this.internalStaticControlPortResults;
  }

  get dynamicIntentResults(): ReadonlyArray<
    BaseHierarchicalEntityResult<BaseInsertError>
  > {
    return this.internalDynamicIntentResults;
  }

  get attributeResults(): ReadonlyArray<
    BaseHierarchicalEntityResult<BaseInsertError>
  > {
    return this.internalAttributeResults;
  }
}
