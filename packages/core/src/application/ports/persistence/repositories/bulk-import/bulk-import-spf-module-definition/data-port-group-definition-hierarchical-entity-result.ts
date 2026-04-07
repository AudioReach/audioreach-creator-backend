import {BaseHierarchicalEntityResult} from '../base-implementation/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {DataPortDefinitionHierarchicalEntityResult} from './data-port-definition-hierarchical-entity-result.js';

/**
 * Hierarchical result for Data Port Group Definition entity.
 * Contains results for static data port definitions.
 */
export class DataPortGroupDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;
  private readonly _staticPortResults: DataPortDefinitionHierarchicalEntityResult[];

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
    staticPortResults: DataPortDefinitionHierarchicalEntityResult[] = [],
  ) {
    super();
    this._errors = errors;
    this._status = status;
    this._staticPortResults = staticPortResults;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    return this._staticPortResults;
  }

  get staticPortResults(): DataPortDefinitionHierarchicalEntityResult[] {
    return this._staticPortResults;
  }
}
