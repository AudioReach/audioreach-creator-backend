/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {RawFailure} from '../batch-inserter.js';

export interface StepResult {
  readonly rawFailures: RawFailure[];
  readonly failedEntityIds: Set<number>;
}
