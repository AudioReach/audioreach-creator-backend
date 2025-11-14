import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';

/**
 * Container for all parsed chunks from an ACDB file
 */
export class ParsedAcdb {
  private chunks = new Map<string, BaseChunk>();

  public fileType: number = 0;

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
}
