/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValuePairReadModel} from './key-vector-read-model.js';
import type {UseCaseReadModel} from './usecase-read-model.js';

/**
 * One output bucket from the filtered-by-subsystem algorithm (FBS-09).
 *
 * filteredGkv — the GKV remaining after all qualifying ancestor subsystem
 *   filteredKeys have been removed.  Two usecases in the same bucket have
 *   identical filteredGkv (same sorted set of key+value systemId pairs).
 *
 * usecases — all usecases whose raw GKV produced this filteredGkv when
 *   the subsystem filter was applied.
 */
export interface SubsystemFilteredReadModel {
  readonly filteredGkv: KeyValuePairReadModel[];
  readonly usecases: UseCaseReadModel[];
}
