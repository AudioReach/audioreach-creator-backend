/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Datapool chunk containing payload data from ACDB file.
 *
 * Supports both directions:
 * - Upload (parsing): Properties are set by parser, use getDataAtOffset() to read
 * - Download (serialization): Use add() to build, properties are populated automatically
 *
 * Optimized for structuredClone and worker transfers.
 */
export class DatapoolChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.DATAPOOL;

  /** Payload data in file order */
  payloads: Uint8Array[] = [];

  /** File offsets corresponding to each payload */
  offsets: number[] = [];

  /** Total length of the chunk (includes 4-byte size prefixes for each payload) */
  totalLength: number = 0;

  /** Payload content hash to existing datapool offset for download deduplication. */
  private payloadOffsetByHash = new Map<string, number>();

  /**
   * Get Uint8Array data at a specific offset within the datapool.
   * Finds the index where offsets[i] === targetOffset and returns the corresponding payload.
   *
   * Used during upload/parsing direction.
   */
  getDataAtOffset(targetOffset: number): Uint8Array | null {
    // Find the index where offsets[i] === targetOffset
    const index = this.offsets.indexOf(targetOffset);
    if (index !== -1 && index < this.payloads.length) {
      return this.payloads[index];
    }
    return null;
  }

  /**
   * Add a payload to the datapool and get its offset.
   * Offsets are assigned sequentially starting at 0.
   *
   * CRITICAL: Offset calculation includes the 4-byte size prefix that precedes each payload
   * in the binary format. This matches the reference implementation where SIZE_PAYLOAD type
   * includes sizeof(UInt32) in the offset calculation.
   *
   * Used during download/serialization direction.
   *
   * @param payload - Binary data to add to datapool
   * @returns Offset where this payload starts in the datapool (pointing to size prefix)
   */
  private add(payload: Uint8Array): number {
    const offset = this.totalLength;
    this.payloads.push(payload);
    this.offsets.push(offset);
    // Include size prefix (4 bytes) + payload length + padding for 8-byte alignment
    this.totalLength += BinaryUtils.SIZEOF_UINT32 + payload.length;
    // Add padding to align to 8 bytes (per ACDB spec)
    if (payload.length % 8 !== 0) {
      this.totalLength += 8 - (payload.length % 8);
    }
    return offset;
  }

  /**
   * Add a payload to the datapool, reusing an existing offset when an identical
   * payload has already been added.
   *
   * This is used by download calibration chunk builders so CDDO / voice data
   * objects can reference stable datapool offsets and deduplicate correctly.
   */
  addOrReuse(payload: Uint8Array): number {
    const hash = this.hashPayload(payload);
    const existingOffset = this.payloadOffsetByHash.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const offset = this.add(payload);
    this.payloadOffsetByHash.set(hash, offset);
    return offset;
  }

  private hashPayload(payload: Uint8Array): string {
    return Array.from(payload, byte => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  /**
   * Get all payloads added so far.
   * Useful for debugging or inspection.
   */
  getPayloads(): Uint8Array[] {
    return [...this.payloads];
  }

  /**
   * Get total size of all payloads including size prefixes.
   * Total = sum of (4 + payload.length) for all payloads.
   */
  getTotalSize(): number {
    return this.totalLength;
  }
}
