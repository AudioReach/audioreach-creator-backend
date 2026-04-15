/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';

/**
 * Datapool chunk containing payload data from ACDB file.
 * Optimized for structuredClone and worker transfers.
 * Contains only data properties to ensure efficient structuredClone operations
 */
export class DatapoolChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.DATAPOOL;

  /** Payload data in file order */
  payloads!: Uint8Array[];

  /** File offsets corresponding to each payload */
  offsets!: number[];

  /** Total length of the chunk */
  totalLength!: number;

  /**
   * Get Uint8Array data at a specific offset within the datapool.
   * Finds the index where offsets[i] === targetOffset and returns the corresponding payload.
   */
  getDataAtOffset(targetOffset: number): Uint8Array | null {
    // Find the index where offsets[i] === targetOffset
    const index = this.offsets.indexOf(targetOffset);
    if (index !== -1 && index < this.payloads.length) {
      return this.payloads[index];
    }
    return null;
  }
}
