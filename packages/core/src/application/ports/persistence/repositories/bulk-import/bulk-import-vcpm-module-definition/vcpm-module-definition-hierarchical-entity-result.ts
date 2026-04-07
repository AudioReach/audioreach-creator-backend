import {BaseHierarchicalEntityResult} from '../base-implementation/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {VcpmParameterDefinitionHierarchicalEntityResult} from './vcpm-parameter-definition-hierarchical-entity-result.js';

/**
 * Hierarchical result for VCPM Module Definition entity.
 * Mirrors the VcpmModuleDefinition domain aggregate structure with its children:
 * - VcpmParameterDefinition[] (extends base ModuleDefinition parameters)
 */
export class VcpmModuleDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;
  private readonly _parameterResults: VcpmParameterDefinitionHierarchicalEntityResult[];

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
    parameterResults: VcpmParameterDefinitionHierarchicalEntityResult[] = [],
  ) {
    super();
    this._errors = errors;
    this._status = status;
    this._parameterResults = parameterResults;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    return this._parameterResults;
  }

  get parameterResults(): VcpmParameterDefinitionHierarchicalEntityResult[] {
    return this._parameterResults;
  }
}
