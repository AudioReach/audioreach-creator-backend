/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DiscardChangesResult} from '../../../edit-session/discard-changes/discard-changes.types.js';

/** Transaction-bound persistence orchestration for discarding a session. */
export interface DiscardChangesPort {
  discard(): Promise<DiscardChangesResult>;
}
