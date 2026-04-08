/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseHierarchicalEntityResult,
  type HierarchicalInsertStatusValue,
} from '../base-bulk-import/base-hierarchical-entity-result.js';
import type {BaseInsertError} from '../base-bulk-import/base-insert-error.interface.js';

/**
 * Hierarchical result for Value Definition entity (leaf node).
 */
export class ValueDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
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
