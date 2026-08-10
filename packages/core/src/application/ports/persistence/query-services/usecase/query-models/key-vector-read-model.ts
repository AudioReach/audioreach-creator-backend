/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinitionSummaryReadModel,
  ValueDefinitionSummaryReadModel,
} from '../../key-value/key-value-definition-read-model.js';

/**
 * Key-Value pair read model — shared by usecase GKV, CKV, and TKV paths.
 * Key and value use KeyDefinitionSummaryReadModel / ValueDefinitionSummaryReadModel — projections of the full definition.
 */
export interface KeyValuePairReadModel {
  readonly key: KeyDefinitionSummaryReadModel;
  readonly value: ValueDefinitionSummaryReadModel;
}

/**
 * A named collection of key-value pairs — one bin (SGKV/GKV/CKV/TKV entry).
 */
export interface KeyValuePairListReadModel {
  readonly systemId: number;
  readonly keyValuePairs: readonly KeyValuePairReadModel[];
}
