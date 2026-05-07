/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KvData} from './kv-data.js';

export class DuplicateCkvExceptionError extends Error {
  constructor(
    readonly idType: 'systemId' | 'valueDefinitionSystemIds',
    readonly id: number | string,
  ) {
    super(`Ckv with ${idType} ${id} already exists`);
    this.name = 'DuplicateCkvExceptionError';
  }
}

/**
 * Encapsulates CKV (Calibration Key-Value) collection management with duplicate protection.
 * Ensures uniqueness by both systemId and value-definition combination.
 */
export class CkvCollection {
  private readonly ckvIds = new Set<string>();
  readonly ckvs: KvData[] = [];

  /**
   * Adds a CKV to the collection.
   * @throws {DuplicateCkvExceptionError} if a CKV with the same systemId or valueDefinitionSystemIds combination already exists.
   */
  addCkv(kvData: KvData): void {
    const systemIdKey = `sys:${kvData.systemId}`;
    const valuesKey = `vals:${[...kvData.valueDefinitionSystemIds].sort((a, b) => a - b).join(',')}`;

    if (this.ckvIds.has(systemIdKey)) {
      throw new DuplicateCkvExceptionError('systemId', kvData.systemId);
    }
    if (this.ckvIds.has(valuesKey)) {
      throw new DuplicateCkvExceptionError(
        'valueDefinitionSystemIds',
        valuesKey,
      );
    }

    this.ckvIds.add(systemIdKey);
    this.ckvIds.add(valuesKey);
    this.ckvs.push(kvData);
  }
}
