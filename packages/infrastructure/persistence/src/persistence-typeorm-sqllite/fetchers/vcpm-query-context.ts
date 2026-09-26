/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';

export interface VcpmQueryContext {
  readonly sessionId: number | null;
  readonly editActions: readonly EditActionRow[];
}
