import type {BaseChunk} from '../services/parsers/chunks/base-chunk.js';

/**
 * Specific input structure for chunk parsing tasks
 */
export interface ChunkParseInput {
  /** Type of the main chunk to parse */
  chunkType: string;

  /** All chunks in the group (main chunk + dependencies) */
  chunkGroup: Array<{
    chunkType: string;
    chunkData: Uint8Array;
  }>;
}

/**
 * Specific context structure for chunk parsing tasks
 */
export interface ChunkParseContextData {
  /** The common DATAPOOL chunk that all parsers need */
  datapool?: unknown;
  parsedChunks?: Map<string, BaseChunk>;
}
