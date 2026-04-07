import {BaseHierarchicalEntityResult} from '../base-implementation/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';

/**
 * Hierarchical result for Tag-Key Link entity (leaf node).
 * TagDefKeyDefLink represents the link between a tag and a key definition.
 */
export class TagDefKeyDefLinkHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
  ) {
    super();
    this._errors = errors;
    this._status = status;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    return [];
  }
}
