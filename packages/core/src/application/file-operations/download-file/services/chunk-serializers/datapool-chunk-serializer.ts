/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

/**
 * Serializer for DATAPOOL chunk.
 * Converts DatapoolChunk contents to binary format.
 *
 * The DATAPOOL chunk contains all payloads with size prefixes.
 * Each payload is preceded by a 4-byte uint32 size prefix.
 *
 * Binary format:
 * [size1:4bytes][payload1:N bytes][size2:4bytes][payload2:M bytes]...
 *
 * Each payload's offset in the final binary corresponds to the offset
 * returned when it was added to the datapool (pointing to the size prefix).
 */
export class DatapoolChunkSerializer {
  /**
   * Serialize DatapoolChunk contents to binary format.
   * Writes size prefix (4 bytes) before each payload.
   *
   * @param datapool - DatapoolChunk containing payloads
   * @returns Binary data as Uint8Array with size prefixes
   */
  serialize(datapool: DatapoolChunk): Uint8Array {
    if (datapool.payloads.length === 0) {
      return new Uint8Array(0);
    }

    const totalSize = datapool.getTotalSize();
    const result = new Uint8Array(totalSize);
    const view = new DataView(
      result.buffer,
      result.byteOffset,
      result.byteLength,
    );
    let offset = 0;

    for (const payload of datapool.payloads) {
      // Write size prefix using BinaryUtils
      BinaryUtils.writeUint32(view, offset, payload.length);
      offset += BinaryUtils.SIZEOF_UINT32;

      // Write payload data
      result.set(payload, offset);
      offset += payload.length;

      // Write padding bytes for 8-byte alignment (per ACDB spec)
      if (payload.length % 8 !== 0) {
        const paddingSize = 8 - (payload.length % 8);
        // Padding bytes are already zero-initialized in the Uint8Array
        offset += paddingSize;
      }
    }

    return result;
  }

  /**
   * Calculate the size in bytes of the serialized datapool.
   *
   * @param datapool - DatapoolChunk containing payloads
   * @returns Size in bytes
   */
  calculateSize(datapool: DatapoolChunk): number {
    return datapool.getTotalSize();
  }
}
