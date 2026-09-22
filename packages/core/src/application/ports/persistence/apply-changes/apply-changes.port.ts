/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ApplyChangesResult} from '../../../edit-session/apply-changes/apply-changes.types.js';

/** Transaction-bound persistence orchestration for applying staged actions. */
export interface ApplyChangesPort {
  apply(): Promise<ApplyChangesResult>;
}

