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
 * Hierarchical result for Processor Definition entity (leaf node).
 * ProcessorDefinition has no children - it's a simple entity with systemId, name, and processorId.
 */
export class ProcessorDefinitionHierarchicalEntityResult extends BaseHierarchicalEntityResult<BaseInsertError> {
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
