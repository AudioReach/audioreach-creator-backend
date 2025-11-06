import {CHUNK_TYPES} from '../../../constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {HeaderChunk} from '../chunks/header-chunk.js';
import type {ChunkParseContext} from '../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../../shared/utilities/binary-utils.js';

/**
 * Parser factory for HEADER chunks.
 * Extracts file metadata from ACDB header based on C# implementation.
 */
export class HeaderChunkParser extends BaseChunkParser<HeaderChunk> {
  readonly chunkType = CHUNK_TYPES.HEADER;

  parse(
    chunkGroup: Array<{chunkType: string; chunkData: Uint8Array}>,
    _context: ChunkParseContext,
  ): HeaderChunk {
    // Find the HEADER chunk in the group
    const headerData = chunkGroup.find(
      chunk => chunk.chunkType === this.chunkType,
    );
    if (!headerData) {
      throw new Error(`HEADER chunk not found in chunk group`);
    }

    const data = headerData.chunkData;
    if (data.length < BinaryUtils.SIZEOF_UINT32) {
      throw new Error(
        'Invalid HEADER chunk: insufficient data for header version',
      );
    }

    const chunk = new HeaderChunk();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    try {
      // Read header version
      chunk.headerVersion = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      if (chunk.headerVersion === 1) {
        // Ensure we have enough data for version info (4 bytes)
        if (data.length < pos + 4 * BinaryUtils.SIZEOF_UINT8) {
          throw new Error(
            'Invalid HEADER chunk: insufficient data for version info',
          );
        }

        // Read ACDB version info (4 bytes: major, minor, revision, cplInfo)
        const major = BinaryUtils.readUint8(view, pos);
        pos += BinaryUtils.SIZEOF_UINT8;
        const minor = BinaryUtils.readUint8(view, pos);
        pos += BinaryUtils.SIZEOF_UINT8;
        const revision = BinaryUtils.readUint8(view, pos);
        pos += BinaryUtils.SIZEOF_UINT8;
        const cplInfo = BinaryUtils.readUint8(view, pos);
        pos += BinaryUtils.SIZEOF_UINT8;

        chunk.version = {major, minor, revision, cplInfo};

        // Read number of codecs
        if (data.length < pos + BinaryUtils.SIZEOF_UINT32) {
          throw new Error(
            'Invalid HEADER chunk: insufficient data for codec count',
          );
        }
        const numCodecs = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read codec information
        chunk.codecInfos = [];
        for (let i = 0; i < numCodecs; i++) {
          const codecDataSize = 3 * BinaryUtils.SIZEOF_UINT32; // codecId + codecMajor + codecMinor
          if (data.length < pos + codecDataSize) {
            throw new Error(
              `Invalid HEADER chunk: insufficient data for codec ${i}`,
            );
          }

          const codecId = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;
          const codecMajor = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;
          const codecMinor = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;

          chunk.codecInfos.push({
            codecId,
            majorVersion: codecMajor,
            minorVersion: codecMinor,
          });
        }

        // Read modified date
        if (data.length < pos + BinaryUtils.SIZEOF_UINT32) {
          throw new Error(
            'Invalid HEADER chunk: insufficient data for modified date',
          );
        }
        chunk.modifiedDate = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read OEM info size
        if (data.length < pos + BinaryUtils.SIZEOF_UINT32) {
          throw new Error(
            'Invalid HEADER chunk: insufficient data for OEM info size',
          );
        }
        const oemInfoSize = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read OEM info string
        if (data.length < pos + oemInfoSize) {
          throw new Error(
            'Invalid HEADER chunk: insufficient data for OEM info',
          );
        }
        const oemInfoBytes = data.slice(pos, pos + oemInfoSize);
        chunk.oemInfo = new TextDecoder('ascii').decode(oemInfoBytes);
      } else {
        throw new Error(`Unknown header version: ${chunk.headerVersion}`);
      }

      return chunk;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse HEADER chunk: ${error.message}`);
      }
      throw new Error('Failed to parse HEADER chunk: Unknown error');
    }
  }
}
