/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';
import type {BaseEntityResult} from '../bulk-import-interface/base-entity-result.interface.js';

/**
 * Interface for Key Definition hierarchical entity result.
 * KeyDefinition has ValueDefinition children.
 */
export interface KeyDefinitionEntityResult extends BaseEntityResult<BaseInsertError> {
  /**
   * Gets the readonly array of value definition results
   */
  readonly valueResults: ReadonlyArray<BaseEntityResult<BaseInsertError>>;
}
