/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {HeaderChunk} from '../../../shared/acdb-chunks/header-chunk.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

/**
 * Serializer for HeaderChunk.
 * Converts HeaderChunk object to binary format (reverse of HeaderChunkParser).
 *
 * This is the exact reverse of the HeaderChunkParser from upload-file:
 * - Upload: Binary → HeaderChunk (parse)
 * - Download: HeaderChunk → Binary (serialize)
 */
export class HeaderChunkSerializer {
  /**
   * Serialize HeaderChunk to binary format.
   *
   * Binary format (little-endian):
   * - Header Version: 4 bytes (uint32)
   * - ACDB Version: 4 bytes (4 x uint8: major, minor, revision, cplInfo)
   * - Codec Count: 4 bytes (uint32)
   * - Codec Info Array: numCodecs x 12 bytes each
   *   - Codec ID: 4 bytes (uint32)
   *   - Major Version: 4 bytes (uint32)
   *   - Minor Version: 4 bytes (uint32)
   * - Modified Date: 4 bytes (uint32)
   * - OEM Info Size: 4 bytes (uint32)
   * - OEM Info Data: N bytes (ASCII string)
   *
   * @param chunk - HeaderChunk to serialize
   * @returns Binary data as Uint8Array
   * @throws Error if serialization fails
   */
  serialize(chunk: HeaderChunk): Uint8Array {
    try {
      const size = this.calculateSize(chunk);
      const buffer = new Uint8Array(size);
      const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
      let pos = 0;

      // Write header version (4 bytes)
      BinaryUtils.writeUint32(view, pos, chunk.headerVersion);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write ACDB version info (4 bytes: major, minor, revision, cplInfo)
      BinaryUtils.writeUint8(view, pos, chunk.version.major);
      pos += BinaryUtils.SIZEOF_UINT8;
      BinaryUtils.writeUint8(view, pos, chunk.version.minor);
      pos += BinaryUtils.SIZEOF_UINT8;
      BinaryUtils.writeUint8(view, pos, chunk.version.revision);
      pos += BinaryUtils.SIZEOF_UINT8;
      BinaryUtils.writeUint8(view, pos, chunk.version.cplInfo);
      pos += BinaryUtils.SIZEOF_UINT8;

      // Write codec count (4 bytes)
      BinaryUtils.writeUint32(view, pos, chunk.codecInfos.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write codec information
      for (const codec of chunk.codecInfos) {
        BinaryUtils.writeUint32(view, pos, codec.codecId);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, codec.majorVersion);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, codec.minorVersion);
        pos += BinaryUtils.SIZEOF_UINT32;
      }

      // Write modified date (4 bytes)
      BinaryUtils.writeUint32(view, pos, chunk.modifiedDate);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write OEM info
      const oemBytes = new TextEncoder().encode(chunk.oemInfo);
      BinaryUtils.writeUint32(view, pos, oemBytes.length);
      pos += BinaryUtils.SIZEOF_UINT32;
      buffer.set(oemBytes, pos);

      return buffer;
    } catch (error) {
      throw new Error(
        `Failed to serialize HeaderChunk: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Calculate the total size needed for the serialized header chunk.
   *
   * @param chunk - HeaderChunk to calculate size for
   * @returns Total size in bytes
   */
  private calculateSize(chunk: HeaderChunk): number {
    let size = 0;
    size += BinaryUtils.SIZEOF_UINT32; // headerVersion
    size += 4 * BinaryUtils.SIZEOF_UINT8; // version info (4 bytes)
    size += BinaryUtils.SIZEOF_UINT32; // codec count
    size += chunk.codecInfos.length * 3 * BinaryUtils.SIZEOF_UINT32; // codecs (3 uint32s each)
    size += BinaryUtils.SIZEOF_UINT32; // modified date
    size += BinaryUtils.SIZEOF_UINT32; // OEM info size
    size += new TextEncoder().encode(chunk.oemInfo).length; // OEM info data
    return size;
  }
}
