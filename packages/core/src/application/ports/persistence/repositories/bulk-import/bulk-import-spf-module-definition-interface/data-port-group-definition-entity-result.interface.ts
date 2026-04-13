/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseInsertError} from '../bulk-import-interface/base-insert-error.interface.js';
import type {BaseEntityResult} from '../bulk-import-interface/base-entity-result.interface.js';

/**
 * Interface for Data Port Group Definition entity result.
 * Contains results for static data port definitions.
 */
export interface DataPortGroupDefinitionEntityResult extends BaseEntityResult<BaseInsertError> {
  /**
   * Gets the readonly array of static port definition results
   */
  readonly staticPortResults: ReadonlyArray<BaseEntityResult<BaseInsertError>>;
}
