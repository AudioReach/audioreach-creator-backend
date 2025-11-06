import {BaseChunkParser} from './base-chunk-parser.js';
import {HeaderChunk} from './chunks/header-chunk.js';
import type {ChunkParseContext} from './models/chunk-parse-context.js';

/**
 * Parser factory for HEADER chunks.
 * Extracts file metadata from ACDB header.
 */
export class HeaderChunkParser extends BaseChunkParser<HeaderChunk> {
  readonly chunkType = 'HEADER';

  parse(data: Uint8Array, _context: ChunkParseContext): HeaderChunk {
    if (data.length < 12) {
      throw new Error('Invalid HEADER chunk: insufficient data');
    }

    const chunk = new HeaderChunk();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Parse header fields
    chunk.version = this.readString(data, 0, 4);
    chunk.fileSize = view.getUint32(4, true);
    chunk.chunkCount = view.getUint32(8, true);

    // Validate parsed data
    if (!chunk.version || chunk.fileSize === 0 || chunk.chunkCount === 0) {
      throw new Error('Invalid HEADER chunk: missing required fields');
    }

    return chunk;
  }

  /**
   * Helper to read a string from byte array
   */
  private readString(data: Uint8Array, offset: number, length: number): string {
    return new TextDecoder().decode(data.slice(offset, offset + length)).trim();
  }
}
