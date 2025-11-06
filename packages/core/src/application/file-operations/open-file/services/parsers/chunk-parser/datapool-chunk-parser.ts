import {CHUNK_TYPES} from '../../../constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {DatapoolChunk} from './../chunks/datapool-chunk.js';
import type {ChunkParseContext} from './../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../../shared/utilities/binary-utils.js';

/**
 * Parser for DATAPOOL chunks.
 * Extracts payload data from ACDB datapool based on C# implementation.
 *
 * InitializeDataPool logic:
 * - Reads payload size and data
 * - Handles 8-byte padding alignment
 * - Stores in optimized arrays for structuredClone efficiency
 */
export class DatapoolChunkParser extends BaseChunkParser<DatapoolChunk> {
  readonly chunkType = CHUNK_TYPES.DATAPOOL;

  parse(
    chunkGroup: Array<{chunkType: string; chunkData: Uint8Array}>,
    _context: ChunkParseContext,
  ): DatapoolChunk {
    // Find the DATAPOOL chunk in the group
    const datapoolData = chunkGroup.find(
      chunk => chunk.chunkType === this.chunkType,
    );
    if (!datapoolData) {
      throw new Error(`DATAPOOL chunk not found in chunk group`);
    }

    const data = datapoolData.chunkData;
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

        // Handle 8-byte padding alignment (matching C# logic)
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
