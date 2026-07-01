/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Projection of the KeyDefinition domain entity.
 * Returned by KeyValueDefQueryService — raw DB rows are never exposed.
 *
 * getByValueDefId  → values has one entry (the requested value)
 * getByKeyDefId    → values has all child values of the key
 *
 * Callers map this to KeyValuePairReadModel, KeyVectorReadModel, or any shape needed.
 */
export interface KeyValueDefResult {
  readonly key: {
    readonly systemId: number;
    readonly keyId: number;
    readonly name: string;
    readonly description?: string;
  };
  readonly values: ReadonlyArray<{
    readonly systemId: number;
    readonly valueId: number;
    readonly name: string;
    readonly description?: string;
  }>;
}
