/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';
import type {HierarchicalEntityResult} from '../bulk-import-interface/hierarchical-entity-result.interface.js';

/**
 * Interface for Key Definition hierarchical entity result.
 * KeyDefinition has ValueDefinition children.
 */
export interface KeyDefinitionEntityResult extends HierarchicalEntityResult<BaseInsertError> {
  /**
   * Gets the readonly array of value definition results
   */
  readonly valueResults: ReadonlyArray<
    HierarchicalEntityResult<BaseInsertError>
  >;
}
