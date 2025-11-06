import type {BaseChunk} from '../chunks/base-chunk.js';
import type {HeaderChunk} from '../chunks/header-chunk.js';

/**
 * Container for all parsed chunks from an ACDB file
 */
export class ParsedAcdb {
  private chunks = new Map<string, BaseChunk>();

  /**
   * Add a parsed chunk to the collection
   */
  addChunk(chunkType: string, chunk: BaseChunk): void {
    this.chunks.set(chunkType, chunk);
  }

  /**
   * Retrieve a specific chunk by type
   */
  getChunk<T extends BaseChunk>(chunkType: string): T | undefined {
    return this.chunks.get(chunkType) as T | undefined;
  }

  /**
   * Check if a chunk type exists in the parsed data
   */
  hasChunk(chunkType: string): boolean {
    return this.chunks.has(chunkType);
  }

  /**
   * Get all parsed chunks
   */
  getAllChunks(): Map<string, BaseChunk> {
    return new Map(this.chunks);
  }

  /**
   * Convenience method to get the header chunk
   */
  getHeader(): HeaderChunk | undefined {
    return this.getChunk<HeaderChunk>('HEADER');
  }
}
