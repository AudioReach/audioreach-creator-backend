import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';

/**
 * Specific input structure for chunk parsing tasks
 */
export interface ChunkParseInput {
  /** Type of the main chunk to parse */
  chunkType: string;
}

/**
 * Specific context structure for chunk parsing tasks
 */
export interface ChunkParseContextData {
  /** Raw chunk data for all chunks (main + dependencies) */
  rawChunks?: Map<string, Uint8Array>;
  /** Parsed chunks available as dependencies */
  parsedChunks?: Map<string, BaseChunk>;
}
