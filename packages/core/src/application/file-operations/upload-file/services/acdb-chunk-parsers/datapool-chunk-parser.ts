/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ACDB_RAW_CHUNK_TYPES,
  PARSED_CHUNK_TYPES,
} from '../../../shared/constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

/**
 * Parser for DATAPOOL chunks.
 * Extracts payload data from ACDB datapool.
 *
 * InitializeDataPool logic:
 * - Reads payload size and data
 * - Handles 8-byte padding alignment
 * - Stores in optimized arrays for structuredClone efficiency
 */
export class DatapoolChunkParser extends BaseChunkParser<DatapoolChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.DATAPOOL;

  parse(context: ChunkParseContext): DatapoolChunk {
    // Get the DATAPOOL chunk data from context
    const data = context.rawChunks?.get(ACDB_RAW_CHUNK_TYPES.DATAPOOL);
    if (!data) {
      throw new Error(`DATAPOOL chunk not found in context`);
    }
    const length = data.length;

    if (length === 0) {
      // Empty datapool
      const chunk = new DatapoolChunk();
      chunk.payloads = [];
      chunk.offsets = [];
      chunk.totalLength = 0;
      return chunk;
    }

    const chunk = new DatapoolChunk();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    const payloads: Uint8Array[] = [];
    const offsets: number[] = [];

    let pos = 0;

    try {
      while (pos < length) {
        const curPos = pos;

        // Read payload size
        if (pos + BinaryUtils.SIZEOF_UINT32 > length) {
          throw new Error(
            'Invalid DATAPOOL chunk: insufficient data for payload size',
          );
        }

        const size = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read payload data
        if (pos + size > length) {
          throw new Error(
            `Invalid DATAPOOL chunk: insufficient data for payload of size ${size}`,
          );
        }

        const payload = data.slice(pos, pos + size);
        pos += size;

        // Handle 8-byte padding alignment
        if (size % 8 !== 0) {
          const paddedBytesLen = 8 - (size % 8);
          pos += paddedBytesLen;
        }

        // Store payload and offset
        offsets.push(curPos);
        payloads.push(payload);
      }

      chunk.payloads = payloads;
      chunk.offsets = offsets;
      chunk.totalLength = length;

      return chunk;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse DATAPOOL chunk: ${error.message}`);
      }
      throw new Error('Failed to parse DATAPOOL chunk: Unknown error');
    }
  }
}
