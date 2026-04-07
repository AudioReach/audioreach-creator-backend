import {BaseHierarchicalEntityResult} from '../base-implementation/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-implementation/base-insert-error.interface.js';
import type {HierarchicalInsertStatusValue} from '../base-implementation/base-hierarchical-entity-result.js';
import type {TagDefKeyDefLinkHierarchicalEntityResult} from './tag-def-key-def-link-hierarchical-entity-result.js';

/**
 * Hierarchical result for Tag Definition entity.
 * Mirrors the TagDefinition domain aggregate structure with its children:
 * - TagDefKeyDefLink[] (keysAllowed - links to key definitions)
 */
export class TagDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
  private readonly _errors: BaseInsertError[];
  private readonly _status: HierarchicalInsertStatusValue;
  private readonly _tagKeyLinkResults: TagDefKeyDefLinkHierarchicalEntityResult[];

  constructor(
    errors: BaseInsertError[],
    status: HierarchicalInsertStatusValue,
    tagKeyLinkResults: TagDefKeyDefLinkHierarchicalEntityResult[] = [],
  ) {
    super();
    this._errors = errors;
    this._status = status;
    this._tagKeyLinkResults = tagKeyLinkResults;
  }

  get errors(): BaseInsertError[] {
    return this._errors;
  }

  get status(): HierarchicalInsertStatusValue {
    return this._status;
  }

  getAllChildren(): BaseHierarchicalEntityResult<BaseInsertError>[] {
    return this._tagKeyLinkResults;
  }

  get tagKeyLinkResults(): TagDefKeyDefLinkHierarchicalEntityResult[] {
    return this._tagKeyLinkResults;
  }
}
