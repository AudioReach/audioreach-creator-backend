/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KvData} from './kv-data.js';

export class DuplicateCkvExceptionError extends Error {
  constructor(
    readonly idType: 'systemId' | 'keyVectorSystemId',
    readonly id: number,
  ) {
    super(`Ckv with ${idType} ${id} already exists`);
    this.name = 'DuplicateCkvExceptionError';
  }
}

/**
 * Encapsulates CKV (Calibration Key-Value) collection management with duplicate protection.
 * Ensures uniqueness by both systemId and keyVectorSystemId.
 */
export class CkvCollection {
  private readonly ckvIds = new Set<string>();
  readonly ckvs: KvData[] = [];

  /**
   * Adds a CKV to the collection.
   * @throws {DuplicateCkvExceptionError} if a CKV with the same systemId or keyVectorSystemId already exists.
   */
  addCkv(kvData: KvData): void {
    const systemIdKey = `sys:${kvData.systemId}`;
    const keyVectorIdKey = `kv:${kvData.keyVectorSystemId}`;

    if (this.ckvIds.has(systemIdKey)) {
      throw new DuplicateCkvExceptionError('systemId', kvData.systemId);
    }
    if (this.ckvIds.has(keyVectorIdKey)) {
      throw new DuplicateCkvExceptionError(
        'keyVectorSystemId',
        kvData.keyVectorSystemId,
      );
    }

    this.ckvIds.add(systemIdKey);
    this.ckvIds.add(keyVectorIdKey);
    this.ckvs.push(kvData);
  }
}
