import type {BaseChunk} from '../chunks/base-chunk.js';

/**
 * Context provided to chunks during parsing
 */
export interface ChunkParseContext {
  /**
   * Raw chunk data for dependencies that need binary data
   */
  rawChunks?: Map<string, Uint8Array>;

  /**
   * Access to already-parsed chunks.
   * Used for both regular chunk dependencies and derived chunk processing.
   */
  parsedChunks?: Map<string, BaseChunk>;
}
