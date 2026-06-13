/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeInfo} from './change-vocabulary.js';

/**
 * Base interface for all read models that represent a DB row.
 *
 * Rule: if an entity has its own row in the database, its read model extends
 * ReadModelBase. changeInfo carries the change vocabulary from the active edit
 * session overlay. When no session is active, changeType is always NONE.
 */
export interface ReadModelBase {
  readonly systemId: number;
  readonly changeInfo: ChangeInfo;
}
