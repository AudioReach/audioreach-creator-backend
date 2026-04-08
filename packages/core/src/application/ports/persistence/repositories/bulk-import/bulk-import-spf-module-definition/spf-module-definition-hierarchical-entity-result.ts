/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParamDefinitionHierarchicalEntityResult} from './param-definition-hierarchical-entity-result.js';
import type {DataPortGroupDefinitionHierarchicalEntityResult} from './data-port-group-definition-hierarchical-entity-result.js';
import type {StaticControlPortDefinitionHierarchicalEntityResult} from './static-control-port-definition-hierarchical-entity-result.js';
import type {DynamicIntentDefinitionHierarchicalEntityResult} from './dynamic-intent-definition-hierarchical-entity-result.js';
import type {AttributeHierarchicalEntityResult} from './attribute-hierarchical-entity-result.js';
import {
  BaseHierarchicalEntityResult,
  type HierarchicalInsertStatusValue,
} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-bulk-import/base-insert-error.interface.js';

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
export class SpfModuleDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;

  // From base ModuleDefinition
  private readonly _paramResults: ParamDefinitionHierarchicalEntityResult[];

  // SPF-specific children
  private readonly _inputDataPortGroupResult: DataPortGroupDefinitionHierarchicalEntityResult | null;
  private readonly _outputDataPortGroupResult: DataPortGroupDefinitionHierarchicalEntityResult | null;
  private readonly _staticControlPortResults: StaticControlPortDefinitionHierarchicalEntityResult[];
  private readonly _dynamicIntentResults: DynamicIntentDefinitionHierarchicalEntityResult[];
  private readonly _attributeResults: AttributeHierarchicalEntityResult[];

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
    paramResults: ParamDefinitionHierarchicalEntityResult[] = [],
    inputDataPortGroupResult: DataPortGroupDefinitionHierarchicalEntityResult | null = null,
    outputDataPortGroupResult: DataPortGroupDefinitionHierarchicalEntityResult | null = null,
    staticControlPortResults: StaticControlPortDefinitionHierarchicalEntityResult[] = [],
    dynamicIntentResults: DynamicIntentDefinitionHierarchicalEntityResult[] = [],
    attributeResults: AttributeHierarchicalEntityResult[] = [],
  ) {
    super();
    this._errors = errors;
    this._status = status;
    this._paramResults = paramResults;
    this._inputDataPortGroupResult = inputDataPortGroupResult;
    this._outputDataPortGroupResult = outputDataPortGroupResult;
    this._staticControlPortResults = staticControlPortResults;
    this._dynamicIntentResults = dynamicIntentResults;
    this._attributeResults = attributeResults;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    const children: BaseHierarchicalEntityResult<BaseInsertError>[] = [
      ...this._paramResults,
      ...this._staticControlPortResults,
      ...this._dynamicIntentResults,
      ...this._attributeResults,
    ];

    if (this._inputDataPortGroupResult) {
      children.push(this._inputDataPortGroupResult);
    }

    if (this._outputDataPortGroupResult) {
      children.push(this._outputDataPortGroupResult);
    }

    return children;
  }

  get paramResults(): ParamDefinitionHierarchicalEntityResult[] {
    return this._paramResults;
  }

  get inputDataPortGroupResult(): DataPortGroupDefinitionHierarchicalEntityResult | null {
    return this._inputDataPortGroupResult;
  }

  get outputDataPortGroupResult(): DataPortGroupDefinitionHierarchicalEntityResult | null {
    return this._outputDataPortGroupResult;
  }

  get staticControlPortResults(): StaticControlPortDefinitionHierarchicalEntityResult[] {
    return this._staticControlPortResults;
  }

  get dynamicIntentResults(): DynamicIntentDefinitionHierarchicalEntityResult[] {
    return this._dynamicIntentResults;
  }

  get attributeResults(): AttributeHierarchicalEntityResult[] {
    return this._attributeResults;
  }
}
