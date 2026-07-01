/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyReadModel,
  ValueReadModel,
} from '../../key-value/key-value-definition-read-model.js';

/**
 * Key-Value pair read model — shared by usecase GKV, CKV, and TKV paths.
 * Key and value use KeyReadModel / ValueReadModel — projections of the full definition.
 */
export interface KeyValuePairReadModel {
  readonly key: KeyReadModel;
  readonly value: ValueReadModel;
}
