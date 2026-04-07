import {BaseHierarchicalEntityResult} from '../base-implementation/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {ValueDefinitionHierarchicalEntityResult} from './value-definition-hierarchical-entity-result.js';

/**
 * Hierarchical result for Key Definition entity.
 * KeyDefinition has ValueDefinition children.
 */
export class KeyDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;
  private readonly _valueResults: ValueDefinitionHierarchicalEntityResult[];

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
    valueResults: ValueDefinitionHierarchicalEntityResult[] = [],
  ) {
    super();
    this._errors = errors;
    this._status = status;
    this._valueResults = valueResults;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    return this._valueResults;
  }

  get valueResults(): ValueDefinitionHierarchicalEntityResult[] {
    return this._valueResults;
  }
}
