import type {BaseChunk} from './chunks/base-chunk.js';
import {HeaderChunk} from './chunks/header-chunk.js';
import type {ChunkMetadata} from './models/chunk-metadata.js';
import type {ChunkParseContext} from './models/chunk-parse-context.js';

/**
 * Service responsible for parsing individual ACDB chunks.
 * Contains all chunk parsing business logic.
 */
export class AcdbChunkParser {
  /**
   * Parse a single chunk based on its type
   */
  parseChunk(
    chunkType: string,
    data: Uint8Array,
    context: ChunkParseContext,
  ): BaseChunk {
    switch (chunkType) {
      case 'HEADER':
        return this.parseHeaderChunk(data, context);
      default:
        throw new Error(`Unknown chunk type: ${chunkType}`);
    }
  }

  /**
   * Extract chunk descriptors from ACDB file header
   */
  extractChunkData(bytes: Uint8Array): ChunkMetadata[] {
    if (bytes.length < 12) {
      throw new Error('Invalid ACDB file: too small to contain header');
    }

    const descriptors: ChunkMetadata[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Read number of chunks from file header
    const chunkCount = view.getUint32(0, true);

    if (chunkCount === 0) {
      throw new Error('Invalid ACDB file: no chunks found');
    }

    // Read chunk descriptors
    // Format: for each chunk - type (4 bytes), offset (4 bytes), length (4 bytes)
    let offset = 4;
    for (let i = 0; i < chunkCount; i++) {
      if (offset + 12 > bytes.length) {
        throw new Error(
          `Invalid ACDB file: incomplete chunk descriptor at index ${i}`,
        );
      }

      const type = new TextDecoder()
        .decode(bytes.slice(offset, offset + 4))
        .trim();
      const chunkOffset = view.getUint32(offset + 4, true);
      const length = view.getUint32(offset + 8, true);

      descriptors.push({type, offset: chunkOffset, length});
      offset += 12;
    }

    return descriptors;
  }

  /**
   * Parse HEADER chunk
   */
  private parseHeaderChunk(
    data: Uint8Array,
    _context: ChunkParseContext,
  ): HeaderChunk {
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
